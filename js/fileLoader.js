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

  /* ── GeoTIFF Loader ── */
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

  /* ============================================================
     GeoPackage (.gpkg) Loader
     SQLite via sql.js + WKB geometry parser (client-side)
     Suporta: múltiplas camadas por arquivo, Z/M, EWKB
     ============================================================ */

  /* ── WKB Geometry Reader ──
     Receives a DataView and a state object { pos, le }
     that tracks the current read position (mutated in place).
     Supports: Point, LineString, Polygon, MultiPoint,
               MultiLineString, MultiPolygon, GeometryCollection
     with ISO-WKB Z/M/ZM offsets and EWKB flags.              */
  function _wkbReadGeom(view, state) {
    /* Byte order marker */
    const bo = view.getUint8(state.pos);
    state.pos += 1;
    state.le = (bo === 1); /* 1 = little-endian */

    /* Geometry type (uint32) */
    const rawType = view.getUint32(state.pos, state.le);
    state.pos += 4;

    /* Decode base type and Z/M presence */
    let baseType = rawType;
    let hasZ = false, hasM = false;

    if      (rawType > 3000 && rawType < 4000) { hasZ = true;  hasM = true;  baseType = rawType - 3000; }
    else if (rawType > 2000 && rawType < 3000) { hasM = true;  baseType = rawType - 2000; }
    else if (rawType > 1000 && rawType < 2000) { hasZ = true;  baseType = rawType - 1000; }
    else {
      /* EWKB (PostGIS) flags */
      if (rawType & 0x80000000) hasZ = true;
      if (rawType & 0x40000000) hasM = true;
      if (rawType & 0x20000000) state.pos += 4; /* skip embedded SRID */
      baseType = rawType & 0x0FFFFFFF;
    }

    const dims = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);

    /* Read one coordinate pair [x, y], skipping extra Z/M dimensions */
    function readCoord() {
      const x = view.getFloat64(state.pos, state.le); state.pos += 8;
      const y = view.getFloat64(state.pos, state.le); state.pos += 8;
      for (let d = 2; d < dims; d++) state.pos += 8; /* skip Z and/or M */
      return [x, y];
    }

    /* Read a linear ring: uint32 count + coords */
    function readRing() {
      const n = view.getUint32(state.pos, state.le); state.pos += 4;
      const pts = [];
      for (let i = 0; i < n; i++) pts.push(readCoord());
      return pts;
    }

    /* Recursively read a sub-geometry (used in Multi* and GeometryCollection) */
    function readSub() {
      return _wkbReadGeom(view, state);
    }

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

  /* ── Parse GeoPackage Geometry Blob ──
     GeoPackage Geometry format:
       Bytes 0-1  : magic 'G','P' (0x47, 0x50)
       Byte  2    : version (1)
       Byte  3    : flags
                      bit 0   = envelope byte-order (0=big, 1=little)
                      bits 1-3 = envelope type (0=none, 1=xy, 2=xyz, 3=xym, 4=xyzm)
                      bit 4   = is-empty flag
       Bytes 4-7  : SRID (int32, in envelope byte-order)
       Bytes 8+   : optional envelope (4/6/6/8 float64 values)
       Rest       : standard WKB geometry                        */
  function _parseGpkgGeom(blob) {
    if (!blob || blob.length < 8) return null;

    /* blob is a Uint8Array from sql.js — use its underlying ArrayBuffer with offset */
    const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);

    /* Validate GeoPackage magic bytes */
    if (view.getUint8(0) !== 0x47 || view.getUint8(1) !== 0x50) return null;

    const flags    = view.getUint8(3);
    const envType  = (flags >> 1) & 0x07;  /* 0=none, 1=xy, 2=xyz, 3=xym, 4=xyzm */
    const isEmpty  = (flags >> 4) & 0x01;

    if (isEmpty) return null;

    /* Calculate WKB start position:
       8 bytes header + envType doubles (xy=4, xyz=6, xym=6, xyzm=8) */
    const envDoublesCount = [0, 4, 6, 6, 8][envType] || 0;
    const wkbStart = 8 + envDoublesCount * 8;

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

    /* 1. Check sql.js is available */
    if (typeof initSqlJs === 'undefined') {
      throw new Error('sql.js não carregado. Verifique a conexão à internet e recarregue a página.');
    }

    const { prog, fill, lbl } = showProgress('Inicializando leitor GeoPackage...');
    setProgress(fill, lbl, 8, 'Carregando sql.js (SQLite)...');

    /* 2. Initialise sql.js — loads the .wasm from CDN */
    let SQL;
    try {
      SQL = await initSqlJs({
        locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`
      });
    } catch (e) {
      hideProgress(prog);
      throw new Error('Falha ao inicializar sql.js: ' + e.message);
    }

    setProgress(fill, lbl, 20, 'Lendo arquivo .gpkg...');
    const arrayBuffer = await file.arrayBuffer();

    /* 3. Open the SQLite database */
    let db;
    try {
      db = new SQL.Database(new Uint8Array(arrayBuffer));
    } catch (e) {
      hideProgress(prog);
      throw new Error('Arquivo .gpkg inválido ou corrompido: ' + e.message);
    }

    setProgress(fill, lbl, 35, 'Identificando camadas vetoriais...');

    /* 4. Discover ALL feature tables.
          Primary:  gpkg_geometry_columns — one row per vector layer, always present.
          Fallback: gpkg_contents WHERE data_type = 'features'.
          Using gpkg_geometry_columns as primary ensures we find every layer
          regardless of how the GeoPackage was created (QGIS, GDAL, ArcGIS, etc.). */
    let featureTables = []; /* [{ name: string, geomCol: string, label: string }] */

    try {
      /* JOIN with gpkg_contents to get the human-readable identifier/title */
      const res = db.exec(`
        SELECT gc.table_name,
               gc.column_name,
               COALESCE(c.identifier, gc.table_name) AS label
        FROM   gpkg_geometry_columns AS gc
        LEFT JOIN gpkg_contents AS c
               ON c.table_name = gc.table_name
        ORDER  BY gc.table_name
      `);
      if (res.length && res[0].values.length) {
        featureTables = res[0].values.map(v => ({
          name:    v[0],
          geomCol: v[1],
          label:   v[2] || v[0],
        }));
      }
    } catch (_) {
      /* Fallback — some non-standard GPKGs may not have gpkg_geometry_columns */
      try {
        const res2 = db.exec(
          "SELECT table_name, table_name FROM gpkg_contents WHERE data_type = 'features'"
        );
        if (res2.length && res2[0].values.length) {
          featureTables = res2[0].values.map(v => ({
            name: v[0], geomCol: null, label: v[0]
          }));
        }
      } catch (e2) {
        db.close();
        hideProgress(prog);
        throw new Error('Não foi possível ler os metadados do GeoPackage: ' + e2.message);
      }
    }

    if (featureTables.length === 0) {
      db.close();
      hideProgress(prog);
      throw new Error('Nenhuma camada vetorial encontrada neste GeoPackage.');
    }

    setProgress(fill, lbl, 50, `${featureTables.length} camada(s) encontrada(s)...`);

    let totalFeatures = 0;
    let layersAdded   = 0;
    const skipped     = [];

    for (let ti = 0; ti < featureTables.length; ti++) {
      const table = featureTables[ti];
      const pct = 50 + Math.round(((ti + 1) / featureTables.length) * 45);
      setProgress(fill, lbl, pct,
        `Carregando: ${table.label} (${ti + 1}/${featureTables.length})...`);

      try {
        /* 5. Fetch all rows from this feature table */
        const rowRes = db.exec(`SELECT * FROM "${table.name}"`);
        if (!rowRes.length || !rowRes[0].values.length) {
          skipped.push(`"${table.label}" — sem feições`);
          continue;
        }

        const { columns, values } = rowRes[0];

        /* 6. Locate the geometry column index.
              Priority:
              a) Name provided by gpkg_geometry_columns (most reliable).
              b) Case-insensitive match against common geometry column names.
              c) Auto-detect by scanning for Uint8Array with GeoPackage magic bytes. */
        let geomIdx = -1;

        if (table.geomCol) {
          geomIdx = columns.findIndex(c => c.toLowerCase() === table.geomCol.toLowerCase());
        }

        if (geomIdx === -1) {
          const commonNames = ['geom', 'geometry', 'the_geom', 'wkb_geometry', 'shape', 'geom_col', 'wkt_geometry'];
          for (const cname of commonNames) {
            const idx = columns.findIndex(c => c.toLowerCase() === cname);
            if (idx !== -1) { geomIdx = idx; break; }
          }
        }

        if (geomIdx === -1) {
          /* Auto-detect: find first blob column with GeoPackage magic bytes 'G','P' */
          const firstRow = values[0];
          for (let ci = 0; ci < firstRow.length; ci++) {
            const v = firstRow[ci];
            if (v instanceof Uint8Array && v.length > 8 &&
                v[0] === 0x47 && v[1] === 0x50) {
              geomIdx = ci;
              break;
            }
          }
        }

        if (geomIdx === -1) {
          skipped.push(`"${table.label}" — coluna de geometria não encontrada`);
          continue;
        }

        /* 7. Parse each row → GeoJSON Feature */
        const features = [];
        let parseErrCount = 0;

        for (const row of values) {
          const geomBlob = row[geomIdx];
          if (!geomBlob) continue;

          /* Ensure we have a Uint8Array */
          const blobUint8 = geomBlob instanceof Uint8Array
            ? geomBlob
            : new Uint8Array(geomBlob);

          let geometry;
          try {
            geometry = _parseGpkgGeom(blobUint8);
          } catch (e) {
            parseErrCount++;
            continue;
          }
          if (!geometry) { parseErrCount++; continue; }

          /* Build GeoJSON properties from all non-geometry columns */
          const properties = {};
          columns.forEach((col, i) => {
            if (i !== geomIdx) {
              /* Convert binary blobs to a readable placeholder */
              properties[col] = (row[i] instanceof Uint8Array) ? '[blob]' : row[i];
            }
          });

          features.push({ type: 'Feature', geometry, properties });
        }

        if (parseErrCount > 0) {
          console.warn(`[GPKG] "${table.label}": ${parseErrCount} geometria(s) ignorada(s).`);
        }

        if (features.length === 0) {
          skipped.push(`"${table.label}" — nenhuma geometria válida`);
          continue;
        }

        /* 8. Add as a new layer in the map */
        LayerManager.addGeoJSONLayer(
          { type: 'FeatureCollection', features },
          `${baseName(file.name)} · ${table.label}`
        );
        totalFeatures += features.length;
        layersAdded++;

      } catch (tableErr) {
        console.error(`[GPKG] Erro crítico na tabela "${table.name}":`, tableErr);
        skipped.push(`"${table.label}" — ${tableErr.message}`);
      }
    }

    db.close();
    setProgress(fill, lbl, 100, `Concluído! ${totalFeatures.toLocaleString('pt-BR')} feições.`);
    hideProgress(prog);

    /* Report any skipped layers */
    if (skipped.length > 0) {
      console.warn('[GPKG] Camadas ignoradas:', skipped);
      showToast(
        `${skipped.length} camada(s) ignorada(s). Abra o Console (F12) para detalhes.`,
        'warning', 5000
      );
    }

    if (layersAdded === 0) {
      throw new Error('Nenhuma feição válida encontrada no GeoPackage.');
    }

    LayerManager.zoomToAll();
    showToast(
      `GeoPackage: ${layersAdded} de ${featureTables.length} camada(s) · ${totalFeatures.toLocaleString('pt-BR')} feições.`,
      'success', 6000
    );
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
