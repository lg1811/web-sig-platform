/* ============================================================
   fileLoader.js – Drag & Drop + File Upload
   Supports: .shp+.dbf+.prj | .geojson | .tif/.tiff | .gpkg
   GeoWebSIG · All processing done client-side
   ============================================================ */

'use strict';

const FileLoader = (() => {

  /* ── Progress UI ── */
  function showProgress(label) {
    const prog = document.getElementById('upload-progress');
    const fill = document.getElementById('progress-fill');
    const lbl  = document.getElementById('progress-label');
    prog.classList.remove('hidden');
    fill.style.width = '0%';
    lbl.textContent = label;
    return { prog, fill, lbl };
  }
  function setProgress(fill, lbl, pct, text) {
    fill.style.width = pct + '%';
    lbl.textContent = text;
  }
  function hideProgress(prog) {
    setTimeout(() => prog.classList.add('hidden'), 1200);
  }

  /* ── File name without extension ── */
  function baseName(filename) {
    return filename.replace(/\.[^/.]+$/, '');
  }

  /* ── GeoJSON Loader ── */
  async function loadGeoJSON(file) {
    const { prog, fill, lbl } = showProgress('Lendo GeoJSON...');
    setProgress(fill, lbl, 40, 'Parseando GeoJSON...');

    const text = await file.text();
    let geojson;
    try {
      geojson = JSON.parse(text);
    } catch (e) {
      hideProgress(prog);
      throw new Error('Arquivo GeoJSON inválido: ' + e.message);
    }

    setProgress(fill, lbl, 80, 'Adicionando ao mapa...');
    const name = baseName(file.name);
    LayerManager.addGeoJSONLayer(geojson, name);

    setProgress(fill, lbl, 100, 'Concluído!');
    hideProgress(prog);
    showToast(`GeoJSON "${name}" carregado com sucesso!`, 'success');
  }

  /* ── Shapefile Loader ── */
  async function loadShapefile(files) {
    const { prog, fill, lbl } = showProgress('Lendo Shapefile...');

    /* Organize files by extension */
    const fileMap = {};
    for (const f of files) {
      const ext = f.name.split('.').pop().toLowerCase();
      fileMap[ext] = f;
    }

    if (!fileMap.shp) {
      hideProgress(prog);
      throw new Error('Arquivo .shp não encontrado. Selecione: .shp, .dbf e .prj juntos.');
    }

    setProgress(fill, lbl, 20, 'Lendo .shp...');
    const shpBuffer = await fileMap.shp.arrayBuffer();

    let dbfBuffer = null;
    if (fileMap.dbf) {
      setProgress(fill, lbl, 40, 'Lendo .dbf (atributos)...');
      dbfBuffer = await fileMap.dbf.arrayBuffer();
    }

    setProgress(fill, lbl, 60, 'Processando geometrias...');

    /* Build GeoJSON from shapefile */
    const features = [];
    let source;

    try {
      if (dbfBuffer) {
        source = await shapefile.open(shpBuffer, dbfBuffer, { encoding: 'utf-8' });
      } else {
        source = await shapefile.open(shpBuffer);
      }

      let result = await source.read();
      while (!result.done) {
        if (result.value) features.push(result.value);
        result = await source.read();
      }
    } catch (e) {
      /* Try with latin-1 encoding for older Brazilian shapefiles */
      try {
        if (dbfBuffer) {
          source = await shapefile.open(shpBuffer, dbfBuffer, { encoding: 'latin1' });
        } else {
          source = await shapefile.open(shpBuffer);
        }
        let result = await source.read();
        while (!result.done) {
          if (result.value) features.push(result.value);
          result = await source.read();
        }
      } catch (e2) {
        hideProgress(prog);
        throw new Error('Erro ao ler Shapefile: ' + e2.message);
      }
    }

    setProgress(fill, lbl, 80, `${features.length} feições encontradas...`);

    /* Reproject if needed (check .prj) */
    const geojson = { type: 'FeatureCollection', features };

    if (fileMap.prj && typeof proj4 !== 'undefined') {
      try {
        const prjText = await fileMap.prj.text();
        /* Only reproject if not already WGS84 */
        if (!prjText.includes('GCS_WGS_1984') && !prjText.includes('WGS 84')) {
          setProgress(fill, lbl, 85, 'Reprojetando para WGS84...');
          try {
            const srcProj = proj4(prjText);
            const wgs84 = proj4('WGS84');
            geojson.features = features.map(f => reprojectFeature(f, srcProj, wgs84));
          } catch (projErr) {
            /* If reprojection fails, use as-is */
            console.warn('Reprojection skipped:', projErr.message);
          }
        }
      } catch (e) { /* ignore prj read error */ }
    }

    setProgress(fill, lbl, 95, 'Adicionando ao mapa...');
    const name = baseName(fileMap.shp.name);
    LayerManager.addGeoJSONLayer(geojson, name);

    setProgress(fill, lbl, 100, `${features.length} feições carregadas!`);
    hideProgress(prog);
    showToast(`Shapefile "${name}" carregado! ${features.length} feições.`, 'success');
  }

  /* Reproject a GeoJSON feature */
  function reprojectFeature(feature, srcProj, destProj) {
    if (!feature.geometry) return feature;
    const geom = reprojectGeometry(feature.geometry, srcProj, destProj);
    return { ...feature, geometry: geom };
  }

  function reprojectCoord(coord, srcProj, destProj) {
    return proj4(srcProj, destProj, coord);
  }

  function reprojectGeometry(geom, src, dest) {
    const transform = coords => {
      if (typeof coords[0] === 'number') return reprojectCoord(coords, src, dest);
      return coords.map(transform);
    };
    return { ...geom, coordinates: transform(geom.coordinates) };
  }

  /* ── GeoPackage WKB Parser ──
     Implements ISO WKB + Extended WKB (EWKB) + WKB Z/M variants
     and GeoPackage geometry blob header (GP header + optional envelope)
  */

  /* Read a WKB geometry from a DataView at a given position.
     `state` is a shared mutable object { pos, le } that tracks position. */
  function _wkbReadGeom(view, state) {
    /* Byte order */
    const bo = view.getUint8(state.pos++);
    state.le = (bo === 1);

    /* Geometry type (uint32) */
    const rawType = view.getUint32(state.pos, state.le);
    state.pos += 4;

    /* Decode type, Z, M flags */
    let baseType = rawType;
    let hasZ = false, hasM = false;

    /* ISO WKB Z/M/ZM offsets */
    if      (rawType > 3000 && rawType < 4000) { hasZ = true;  hasM = true;  baseType = rawType - 3000; }
    else if (rawType > 2000 && rawType < 3000) { hasM = true;  baseType = rawType - 2000; }
    else if (rawType > 1000 && rawType < 2000) { hasZ = true;  baseType = rawType - 1000; }
    /* EWKB flags (PostGIS style) */
    else {
      if (rawType & 0x80000000) { hasZ = true; }
      if (rawType & 0x40000000) { hasM = true; }
      baseType = rawType & 0x0FFFFFFF;
    }

    /* EWKB optional SRID (skip it) */
    if (rawType & 0x20000000) { state.pos += 4; }

    const dims = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);

    /* Read a single coordinate pair [x, y], skipping extra dims */
    function readCoord() {
      const x = view.getFloat64(state.pos, state.le); state.pos += 8;
      const y = view.getFloat64(state.pos, state.le); state.pos += 8;
      for (let d = 2; d < dims; d++) state.pos += 8; /* skip Z/M */
      return [x, y];
    }

    /* Read a ring (array of coords) */
    function readRing() {
      const n = view.getUint32(state.pos, state.le); state.pos += 4;
      const pts = [];
      for (let i = 0; i < n; i++) pts.push(readCoord());
      return pts;
    }

    /* Read a nested WKB geometry (sub-geometry in Multi* types) */
    function readSub() { return _wkbReadGeom(view, state); }

    switch (baseType) {
      case 1: /* Point */
        return { type: 'Point', coordinates: readCoord() };

      case 2: /* LineString */ {
        const n = view.getUint32(state.pos, state.le); state.pos += 4;
        const pts = [];
        for (let i = 0; i < n; i++) pts.push(readCoord());
        return { type: 'LineString', coordinates: pts };
      }

      case 3: /* Polygon */ {
        const n = view.getUint32(state.pos, state.le); state.pos += 4;
        const rings = [];
        for (let i = 0; i < n; i++) rings.push(readRing());
        return { type: 'Polygon', coordinates: rings };
      }

      case 4: /* MultiPoint */ {
        const n = view.getUint32(state.pos, state.le); state.pos += 4;
        const pts = [];
        for (let i = 0; i < n; i++) pts.push(readSub().coordinates);
        return { type: 'MultiPoint', coordinates: pts };
      }

      case 5: /* MultiLineString */ {
        const n = view.getUint32(state.pos, state.le); state.pos += 4;
        const lines = [];
        for (let i = 0; i < n; i++) lines.push(readSub().coordinates);
        return { type: 'MultiLineString', coordinates: lines };
      }

      case 6: /* MultiPolygon */ {
        const n = view.getUint32(state.pos, state.le); state.pos += 4;
        const polys = [];
        for (let i = 0; i < n; i++) polys.push(readSub().coordinates);
        return { type: 'MultiPolygon', coordinates: polys };
      }

      case 7: /* GeometryCollection */ {
        const n = view.getUint32(state.pos, state.le); state.pos += 4;
        const geoms = [];
        for (let i = 0; i < n; i++) geoms.push(readSub());
        return { type: 'GeometryCollection', geometries: geoms };
      }

      default:
        throw new Error(`Tipo WKB desconhecido: ${baseType}`);
    }
  }

  /* Parse a GeoPackage geometry blob.
     Format: 2-byte magic ('GP') + 1 version + 1 flags + 4 SRID + [envelope] + WKB */
  function _parseGpkgGeom(blob) {
    /* blob is a Uint8Array from sql.js */
    if (!blob || blob.length < 8) return null;

    const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);

    /* Validate magic bytes 'G' 'P' */
    if (view.getUint8(0) !== 0x47 || view.getUint8(1) !== 0x50) return null;

    const flags     = view.getUint8(3);
    const le        = (flags & 0x01) === 1;      /* envelope byte order */
    const envType   = (flags >> 1) & 0x07;       /* 0=none 1=xy 2=xyz 3=xym 4=xyzm */
    const isEmpty   = (flags >> 4) & 0x01;

    if (isEmpty) return null;

    /* Skip: 2 magic + 1 version + 1 flags + 4 SRID = 8 bytes */
    /* Then skip envelope doubles */
    const envDoubles = [0, 4, 6, 6, 8][envType] || 0;
    const wkbStart  = 8 + envDoubles * 8;

    const state = { pos: wkbStart, le: true };
    try {
      return _wkbReadGeom(view, state);
    } catch (e) {
      console.warn('[GPKG] WKB parse error:', e.message);
      return null;
    }
  }

  /* ── GeoPackage Loader ── */
  async function loadGeoPackage(file) {
    /* 1. Check sql.js availability */
    if (typeof initSqlJs === 'undefined') {
      throw new Error('sql.js não carregado. Verifique a conexão à internet e recarregue a página.');
    }

    const { prog, fill, lbl } = showProgress('Inicializando leitor GeoPackage...');
    setProgress(fill, lbl, 10, 'Carregando sql.js (SQLite)...');

    /* 2. Init sql.js – load wasm from CDN */
    let SQL;
    try {
      SQL = await initSqlJs({
        locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`
      });
    } catch (e) {
      hideProgress(prog);
      throw new Error('Falha ao inicializar sql.js: ' + e.message);
    }

    setProgress(fill, lbl, 25, 'Lendo arquivo .gpkg...');
    const arrayBuffer = await file.arrayBuffer();

    /* 3. Open SQLite database */
    let db;
    try {
      db = new SQL.Database(new Uint8Array(arrayBuffer));
    } catch (e) {
      hideProgress(prog);
      throw new Error('Arquivo .gpkg inválido ou corrompido: ' + e.message);
    }

    setProgress(fill, lbl, 40, 'Lendo tabelas de feições...');

    /* 4. Get feature tables from gpkg_contents */
    let featureTables = [];
    try {
      const res = db.exec("SELECT table_name, identifier FROM gpkg_contents WHERE data_type = 'features'");
      if (res.length && res[0].values.length) {
        featureTables = res[0].values.map(v => ({ name: v[0], label: v[1] || v[0] }));
      }
    } catch (e) {
      db.close();
      hideProgress(prog);
      throw new Error('Não foi possível ler gpkg_contents. Arquivo pode não ser um GeoPackage válido.');
    }

    if (featureTables.length === 0) {
      db.close();
      hideProgress(prog);
      throw new Error('Nenhuma tabela de feições encontrada no GeoPackage.');
    }

    setProgress(fill, lbl, 55, `${featureTables.length} tabela(s) encontrada(s)...`);

    let totalFeatures = 0;
    let layersAdded  = 0;

    for (const table of featureTables) {
      try {
        /* 5. Get geometry column name */
        let geomCol = 'geom';
        try {
          const gcRes = db.exec(
            `SELECT column_name FROM gpkg_geometry_columns WHERE table_name = '${table.name}'`
          );
          if (gcRes.length && gcRes[0].values.length) {
            geomCol = gcRes[0].values[0][0];
          }
        } catch (_) { /* fallback to 'geom' */ }

        /* 6. Query all rows from the feature table */
        const rowRes = db.exec(`SELECT * FROM "${table.name}"`);
        if (!rowRes.length || !rowRes[0].values.length) continue;

        const { columns, values } = rowRes[0];
        const geomIdx = columns.findIndex(c => c.toLowerCase() === geomCol.toLowerCase());
        if (geomIdx === -1) continue;

        /* 7. Build GeoJSON FeatureCollection */
        const features = [];
        for (const row of values) {
          const geomBlob = row[geomIdx];
          if (!geomBlob) continue;

          let geometry;
          try {
            geometry = _parseGpkgGeom(geomBlob);
          } catch (e) {
            continue; /* skip unparseable geometry */
          }
          if (!geometry) continue;

          /* Build properties from all non-geometry columns */
          const properties = {};
          columns.forEach((col, i) => {
            if (i !== geomIdx) {
              /* Convert Uint8Array blobs to string placeholder */
              properties[col] = (row[i] instanceof Uint8Array)
                ? '[blob]'
                : row[i];
            }
          });

          features.push({ type: 'Feature', geometry, properties });
        }

        if (features.length === 0) continue;

        /* 8. Add as a layer */
        const layerName = `${baseName(file.name)} · ${table.label}`;
        LayerManager.addGeoJSONLayer(
          { type: 'FeatureCollection', features },
          layerName
        );
        totalFeatures += features.length;
        layersAdded++;

      } catch (tableErr) {
        console.warn(`[GPKG] Erro na tabela "${table.name}":`, tableErr);
      }
    }

    db.close();
    setProgress(fill, lbl, 100, `${totalFeatures} feições carregadas!`);
    hideProgress(prog);

    if (layersAdded === 0) {
      throw new Error('Nenhuma feição válida encontrada no GeoPackage.');
    }

    LayerManager.zoomToAll();
    showToast(
      `GeoPackage carregado! ${layersAdded} camada(s) · ${totalFeatures} feições.`,
      'success', 5000
    );
  }


  async function loadGeoTIFF(file) {
    if (typeof parseGeoraster === 'undefined' || typeof GeoRasterLayer === 'undefined') {
      throw new Error('Biblioteca GeoRaster não carregada. Verifique a conexão à internet.');
    }

    const { prog, fill, lbl } = showProgress('Lendo GeoTIFF...');
    setProgress(fill, lbl, 25, 'Decodificando pixels...');

    const arrayBuffer = await file.arrayBuffer();
    setProgress(fill, lbl, 55, 'Processando raster...');

    let georaster;
    try {
      georaster = await parseGeoraster(arrayBuffer);
    } catch (e) {
      hideProgress(prog);
      throw new Error('Erro ao decodificar GeoTIFF: ' + e.message);
    }

    setProgress(fill, lbl, 85, 'Renderizando no mapa...');
    const name = baseName(file.name);
    LayerManager.addGeoTIFFLayer(georaster, name);

    setProgress(fill, lbl, 100, 'GeoTIFF renderizado!');
    hideProgress(prog);

    const bands = georaster.numberOfRasters || 1;
    const w = georaster.width || '?';
    const h = georaster.height || '?';
    showToast(`GeoTIFF "${name}" carregado! ${w}×${h}px · ${bands} banda(s).`, 'success');
  }

  /* ── Route file(s) by type ── */
  async function handleFiles(fileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    showLoading('Processando arquivo...');

    try {
      /* Check for shapefiles (multi-file) */
      const hasShp = files.some(f => f.name.toLowerCase().endsWith('.shp'));
      if (hasShp) {
        hideLoading();
        await loadShapefile(files);
        return;
      }

      /* Process each remaining file individually */
      for (const file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        document.getElementById('loading-text').textContent = `Carregando: ${file.name}`;

        if (ext === 'geojson' || ext === 'json') {
          await loadGeoJSON(file);
        } else if (ext === 'tif' || ext === 'tiff') {
          await loadGeoTIFF(file);
        } else if (ext === 'gpkg') {
          await loadGeoPackage(file);
        } else if (ext === 'dbf' || ext === 'prj') {
          /* Skip orphan dbf/prj files */
          showToast(`"${file.name}" ignorado — selecione o .shp junto.`, 'warning', 4000);
        } else {
          showToast(`Formato não suportado: .${ext}`, 'warning', 3000);
        }
      }
    } catch (err) {
      showToast('Erro: ' + err.message, 'error', 6000);
      console.error('[FileLoader]', err);
    } finally {
      hideLoading();
    }
  }

  /* ── Drag & Drop ── */
  function initDropZone() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    /* Click to select */
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) handleFiles(e.target.files);
      e.target.value = ''; /* reset to allow re-upload of same file */
    });

    /* Drag events on the drop zone */
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    });

    /* Also allow drag & drop anywhere on the map */
    const mapEl = document.getElementById('map');
    mapEl.addEventListener('dragover', (e) => { e.preventDefault(); });
    mapEl.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    });
  }

  /* ── Init ── */
  document.addEventListener('DOMContentLoaded', initDropZone);

  return { handleFiles };
})();
