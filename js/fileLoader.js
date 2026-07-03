/* ============================================================
   fileLoader.js – Drag & Drop + File Upload
   Suporta: .shp+.dbf+.prj | .geojson/.json | .tif/.tiff | .gpkg
   GeoWebSIG · Processamento 100% client-side
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
    lbl.textContent  = label;
    return { prog, fill, lbl };
  }
  function setProgress(fill, lbl, pct, text) {
    fill.style.width = Math.min(pct, 100) + '%';
    lbl.textContent  = text;
  }
  function hideProgress(prog) {
    setTimeout(() => prog.classList.add('hidden'), 1400);
  }

  /* ── Nome sem extensão ── */
  function baseName(filename) {
    return filename.replace(/\.[^/.]+$/, '');
  }

  /* ============================================================
     GeoJSON Loader
     ============================================================ */
  async function loadGeoJSON(file) {
    const { prog, fill, lbl } = showProgress('Lendo GeoJSON...');
    setProgress(fill, lbl, 40, 'Parseando...');

    let geojson;
    try {
      geojson = JSON.parse(await file.text());
    } catch (e) {
      hideProgress(prog);
      throw new Error('GeoJSON inválido: ' + e.message);
    }

    setProgress(fill, lbl, 85, 'Adicionando ao mapa...');
    const name = baseName(file.name);
    LayerManager.addGeoJSONLayer(geojson, name);

    setProgress(fill, lbl, 100, 'Concluído!');
    hideProgress(prog);
    showToast(`GeoJSON "${name}" carregado!`, 'success');
  }

  /* ============================================================
     Shapefile Loader (.shp + .dbf + .prj)
     ============================================================ */
  async function loadShapefile(files) {
    const { prog, fill, lbl } = showProgress('Lendo Shapefile...');

    const fileMap = {};
    for (const f of files) {
      fileMap[f.name.split('.').pop().toLowerCase()] = f;
    }

    if (!fileMap.shp) {
      hideProgress(prog);
      throw new Error('Arquivo .shp não encontrado. Selecione .shp + .dbf + .prj juntos.');
    }

    setProgress(fill, lbl, 20, 'Lendo .shp...');
    const shpBuf = await fileMap.shp.arrayBuffer();

    let dbfBuf = null;
    if (fileMap.dbf) {
      setProgress(fill, lbl, 40, 'Lendo .dbf (atributos)...');
      dbfBuf = await fileMap.dbf.arrayBuffer();
    }

    setProgress(fill, lbl, 60, 'Processando geometrias...');

    const features = [];
    let source;
    const tryOpen = async (enc) => {
      source = dbfBuf
        ? await shapefile.open(shpBuf, dbfBuf, { encoding: enc })
        : await shapefile.open(shpBuf);
      let r = await source.read();
      while (!r.done) { if (r.value) features.push(r.value); r = await source.read(); }
    };

    try {
      await tryOpen('utf-8');
    } catch (_) {
      try {
        features.length = 0;
        await tryOpen('latin1');
      } catch (e2) {
        hideProgress(prog);
        throw new Error('Erro ao ler Shapefile: ' + e2.message);
      }
    }

    setProgress(fill, lbl, 80, `${features.length} feições...`);
    const geojson = { type: 'FeatureCollection', features };

    /* Reprojeção se necessário */
    if (fileMap.prj && typeof proj4 !== 'undefined') {
      try {
        const prj = await fileMap.prj.text();
        if (!prj.includes('GCS_WGS_1984') && !prj.includes('WGS 84')) {
          setProgress(fill, lbl, 87, 'Reprojetando para WGS84...');
          const src   = proj4(prj);
          const dest  = proj4('WGS84');
          const xform = coords => {
            if (typeof coords[0] === 'number') return proj4(src, dest, coords);
            return coords.map(xform);
          };
          geojson.features = features.map(f => ({
            ...f,
            geometry: f.geometry ? { ...f.geometry, coordinates: xform(f.geometry.coordinates) } : f.geometry
          }));
        }
      } catch (_) { /* reprojeção opcional */ }
    }

    setProgress(fill, lbl, 95, 'Adicionando ao mapa...');
    const name = baseName(fileMap.shp.name);
    LayerManager.addGeoJSONLayer(geojson, name);

    setProgress(fill, lbl, 100, `${features.length} feições carregadas!`);
    hideProgress(prog);
    showToast(`Shapefile "${name}" · ${features.length} feições`, 'success');
  }

  /* ============================================================
     GeoTIFF Loader
     ============================================================ */
  async function loadGeoTIFF(file) {
    if (typeof parseGeoraster === 'undefined' || typeof GeoRasterLayer === 'undefined') {
      throw new Error('Biblioteca GeoRaster não carregada. Verifique a internet.');
    }

    const { prog, fill, lbl } = showProgress('Lendo GeoTIFF...');
    setProgress(fill, lbl, 25, 'Decodificando pixels...');

    const buf = await file.arrayBuffer();
    setProgress(fill, lbl, 55, 'Processando raster...');

    let georaster;
    try {
      georaster = await parseGeoraster(buf);
    } catch (e) {
      hideProgress(prog);
      throw new Error('Erro ao decodificar GeoTIFF: ' + e.message);
    }

    setProgress(fill, lbl, 85, 'Renderizando no mapa...');
    const name = baseName(file.name);
    LayerManager.addGeoTIFFLayer(georaster, name);

    setProgress(fill, lbl, 100, 'GeoTIFF renderizado!');
    hideProgress(prog);
    showToast(`GeoTIFF "${name}" · ${georaster.width}×${georaster.height}px`, 'success');
  }

  /* ============================================================
     GeoPackage Loader (.gpkg)
     SQLite via sql.js + parser WKB próprio
     Carrega TODAS as camadas vetoriais do arquivo
     ============================================================ */

  /* ── Parser WKB ──────────────────────────────────────────────
     Lê geometrias WKB padrão ISO + EWKB (PostGIS) + variantes Z/M/ZM.
     `view`  = DataView apontando para o buffer do blob
     `state` = { pos: number, le: boolean }  (mutado in-place)
  ─────────────────────────────────────────────────────────────── */
  function _wkbRead(view, state) {
    /* byte-order */
    state.le = view.getUint8(state.pos++) === 1;

    /* tipo bruto (uint32) */
    const raw = view.getUint32(state.pos, state.le);
    state.pos += 4;

    /* decodifica tipo-base e flags Z/M */
    let base = raw, hasZ = false, hasM = false;
    if      (raw > 3000 && raw < 4000) { hasZ = true;  hasM = true;  base = raw - 3000; }
    else if (raw > 2000 && raw < 3000) { hasM = true;  base = raw - 2000; }
    else if (raw > 1000 && raw < 2000) { hasZ = true;  base = raw - 1000; }
    else {
      if (raw & 0x80000000) hasZ = true;
      if (raw & 0x40000000) hasM = true;
      if (raw & 0x20000000) state.pos += 4; /* SRID embutido (EWKB) */
      base = raw & 0x0FFFFFFF;
    }
    const dims = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);

    const coord = () => {
      const x = view.getFloat64(state.pos, state.le); state.pos += 8;
      const y = view.getFloat64(state.pos, state.le); state.pos += 8;
      for (let d = 2; d < dims; d++) state.pos += 8; /* pula Z/M */
      return [x, y];
    };
    const ring = () => {
      const n = view.getUint32(state.pos, state.le); state.pos += 4;
      return Array.from({ length: n }, coord);
    };
    const sub = () => _wkbRead(view, state);

    switch (base) {
      case 1: return { type: 'Point',              coordinates: coord() };
      case 2: { const n=view.getUint32(state.pos,state.le);state.pos+=4; return { type:'LineString',    coordinates: Array.from({length:n},coord) }; }
      case 3: { const n=view.getUint32(state.pos,state.le);state.pos+=4; return { type:'Polygon',       coordinates: Array.from({length:n},ring) }; }
      case 4: { const n=view.getUint32(state.pos,state.le);state.pos+=4; return { type:'MultiPoint',    coordinates: Array.from({length:n},()=>sub().coordinates) }; }
      case 5: { const n=view.getUint32(state.pos,state.le);state.pos+=4; return { type:'MultiLineString',coordinates: Array.from({length:n},()=>sub().coordinates) }; }
      case 6: { const n=view.getUint32(state.pos,state.le);state.pos+=4; return { type:'MultiPolygon',  coordinates: Array.from({length:n},()=>sub().coordinates) }; }
      case 7: { const n=view.getUint32(state.pos,state.le);state.pos+=4; return { type:'GeometryCollection', geometries: Array.from({length:n},sub) }; }
      default: throw new Error(`Tipo WKB ${base} não suportado`);
    }
  }

  /* ── Parser do blob GeoPackage ───────────────────────────────
     Formato: 2 bytes magic ('GP') + 1 versão + 1 flags + 4 SRID
              + [envelope opcional] + WKB
  ─────────────────────────────────────────────────────────────── */
  function _parseGpkgBlob(blob) {
    if (!blob || blob.length < 8) return null;

    /* blob é Uint8Array vindo do sql.js */
    const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);

    /* valida magic bytes 'G','P' */
    if (view.getUint8(0) !== 0x47 || view.getUint8(1) !== 0x50) return null;

    const flags   = view.getUint8(3);
    const envType = (flags >> 1) & 0x07; /* 0=none,1=xy,2=xyz,3=xym,4=xyzm */
    if ((flags >> 4) & 0x01) return null; /* is-empty */

    /* pula cabeçalho (8 bytes) + envelope opcional */
    const envDoubles = [0, 4, 6, 6, 8][envType] || 0;
    const wkbStart   = 8 + envDoubles * 8;

    const state = { pos: wkbStart, le: true };
    try {
      return _wkbRead(view, state);
    } catch (e) {
      console.warn('[GPKG WKB]', e.message);
      return null;
    }
  }

  /* ── Encontra índice da coluna de geometria ──────────────────
     1) Usa o nome fornecido por gpkg_geometry_columns
     2) Tenta nomes comuns
     3) Auto-detecta pela magic 'GP' no primeiro valor blob
  ─────────────────────────────────────────────────────────────── */
  function _findGeomCol(columns, values, knownName) {
    /* a) nome explícito */
    if (knownName) {
      const i = columns.findIndex(c => c.toLowerCase() === knownName.toLowerCase());
      if (i !== -1) return i;
    }
    /* b) nomes comuns */
    for (const n of ['geom','geometry','the_geom','wkb_geometry','shape','geom_col','geometria']) {
      const i = columns.findIndex(c => c.toLowerCase() === n);
      if (i !== -1) return i;
    }
    /* c) auto-detecção: primeira coluna Uint8Array com magic GP */
    if (values && values.length > 0) {
      const row = values[0];
      for (let i = 0; i < row.length; i++) {
        const v = row[i];
        if (v instanceof Uint8Array && v.length > 8 && v[0] === 0x47 && v[1] === 0x50) {
          console.log(`[GPKG] Coluna de geometria detectada automaticamente: "${columns[i]}"`);
          return i;
        }
      }
    }
    return -1;
  }

  /* ── GeoPackage Raster Tile Loader ─────────────────────────────
     Lê camadas de tiles (raster) de um GeoPackage.
     Cada camada tile é uma tabela com colunas:
       zoom_level | tile_column | tile_row | tile_data (PNG/JPEG blob)
     Assembla os tiles em um <canvas> e exibe como L.imageOverlay.
  ─────────────────────────────────────────────────────────────── */
  async function _loadGpkgRasterLayer(db, tableName, layerLabel) {
    console.log(`[GPKG Raster] Processando: "${tableName}"`);

    /* 1. Lê extensão geográfica e SRS da camada */
    let minX, minY, maxX, maxY, srsId;
    try {
      const r = db.exec(`SELECT min_x, min_y, max_x, max_y, srs_id
                         FROM gpkg_tile_matrix_set WHERE table_name='${tableName}'`);
      if (!r.length || !r[0].values.length) throw new Error('sem dados em gpkg_tile_matrix_set');
      [minX, minY, maxX, maxY, srsId] = r[0].values[0];
      console.log(`[GPKG Raster] "${tableName}": extent=[${minX},${minY},${maxX},${maxY}] SRS=${srsId}`);
    } catch (e) {
      console.warn(`[GPKG Raster] "${tableName}": erro no tile_matrix_set:`, e.message);
      return false;
    }

    /* 2. Lê os níveis de zoom disponíveis */
    let zoomLevels = [];
    try {
      const r = db.exec(`SELECT zoom_level, matrix_width, matrix_height, tile_width, tile_height
                         FROM gpkg_tile_matrix WHERE table_name='${tableName}'
                         ORDER BY zoom_level ASC`);
      if (!r.length || !r[0].values.length) throw new Error('sem dados em gpkg_tile_matrix');
      zoomLevels = r[0].values.map(v => ({
        zoom: v[0], matrixW: v[1], matrixH: v[2], tileW: v[3], tileH: v[4]
      }));
      console.log(`[GPKG Raster] "${tableName}": ${zoomLevels.length} zoom(s):`, zoomLevels.map(z => z.zoom));
    } catch (e) {
      console.warn(`[GPKG Raster] "${tableName}": erro no tile_matrix:`, e.message);
      return false;
    }

    /* 3. Escolhe o zoom mais detalhado com ≤ 400 tiles totais
          para não explodir a memória com rasters enormes */
    let best = zoomLevels[0];
    for (const z of zoomLevels) {
      const total = z.matrixW * z.matrixH;
      if (total <= 400) best = z;
    }

    /* Verifica quantos tiles existem DE FATO no banco no zoom escolhido */
    let tileRows = [];
    try {
      const r = db.exec(`SELECT tile_column, tile_row, tile_data
                         FROM "${tableName}" WHERE zoom_level=${best.zoom}`);
      if (r.length && r[0].values.length) tileRows = r[0].values;
      console.log(`[GPKG Raster] "${tableName}": zoom ${best.zoom} → ${tileRows.length} tile(s) no banco`);
    } catch (e) {
      console.warn(`[GPKG Raster] "${tableName}": erro ao ler tiles:`, e.message);
      return false;
    }

    if (tileRows.length === 0) {
      /* Tenta o maior zoom disponível */
      for (let zi = zoomLevels.length - 1; zi >= 0; zi--) {
        try {
          const z = zoomLevels[zi];
          const r = db.exec(`SELECT tile_column, tile_row, tile_data
                             FROM "${tableName}" WHERE zoom_level=${z.zoom} LIMIT 500`);
          if (r.length && r[0].values.length) {
            best = z;
            tileRows = r[0].values;
            console.log(`[GPKG Raster] "${tableName}": fallback zoom ${z.zoom} → ${tileRows.length} tile(s)`);
            break;
          }
        } catch (_) {}
      }
    }

    if (tileRows.length === 0) {
      console.warn(`[GPKG Raster] "${tableName}": nenhum tile encontrado`);
      return false;
    }

    /* 4. Assembla os tiles em um <canvas> */
    const canvasW = best.matrixW * best.tileW;
    const canvasH = best.matrixH * best.tileH;

    /* Limite de segurança de canvas */
    if (canvasW > 16384 || canvasH > 16384) {
      console.warn(`[GPKG Raster] "${tableName}": canvas muito grande (${canvasW}×${canvasH}), pulando.`);
      return false;
    }

    console.log(`[GPKG Raster] "${tableName}": canvas ${canvasW}×${canvasH}px`);

    const canvas = document.createElement('canvas');
    canvas.width  = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');

    let drawn = 0;
    await Promise.all(tileRows.map(([col, row, data]) => new Promise(resolve => {
      if (!data) { resolve(); return; }

      const blob = new Blob([data instanceof Uint8Array ? data : new Uint8Array(data)]);
      const url  = URL.createObjectURL(blob);
      const img  = new Image();

      img.onload = () => {
        /* GeoPackage spec: tile_row=0 é o canto SUPERIOR-ESQUERDO (norte).
           Alguns softwares (QGIS, GDAL) invertem (TMS: row=0 = sul).
           Tentamos primeiro com o modo padrão (sem inversão).
           Se aparecer de cabeça para baixo, o problema é convenção TMS. */
        ctx.drawImage(img, col * best.tileW, row * best.tileH);
        URL.revokeObjectURL(url);
        drawn++;
        resolve();
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      img.src = url;
    })));

    if (drawn === 0) {
      console.warn(`[GPKG Raster] "${tableName}": nenhum tile desenhado`);
      return false;
    }
    console.log(`[GPKG Raster] "${tableName}": ${drawn} tile(s) desenhados`);

    /* 5. Converte extensão para WGS84 lat/lng */
    let bounds;

    if (srsId === 4326) {
      /* Já em graus — direto */
      bounds = [[minY, minX], [maxY, maxX]];

    } else if (srsId === 3857 || srsId === 900913) {
      /* Web Mercator → WGS84 */
      const m2ll = (mx, my) => {
        const lng = mx / 20037508.34 * 180;
        const lat = Math.atan(Math.exp(my * Math.PI / 20037508.34)) * 360 / Math.PI - 90;
        return [lat, lng];
      };
      bounds = [m2ll(minX, minY), m2ll(maxX, maxY)];

    } else if (typeof proj4 !== 'undefined') {
      /* Tenta reprojetar com proj4 usando EPSG */
      try {
        const sw = proj4(`EPSG:${srsId}`, 'WGS84', [minX, minY]);
        const ne = proj4(`EPSG:${srsId}`, 'WGS84', [maxX, maxY]);
        bounds = [[sw[1], sw[0]], [ne[1], ne[0]]];
        console.log(`[GPKG Raster] "${tableName}": reprojetado de EPSG:${srsId}`);
      } catch (e) {
        console.warn(`[GPKG Raster] "${tableName}": reprojeção de EPSG:${srsId} falhou:`, e.message);
        return false;
      }

    } else {
      console.warn(`[GPKG Raster] "${tableName}": SRS ${srsId} não suportado`);
      return false;
    }

    console.log(`[GPKG Raster] "${tableName}": bounds WGS84:`, bounds);

    /* 6. Exporta canvas como PNG e adiciona ao mapa */
    const dataUrl = canvas.toDataURL('image/png');
    LayerManager.addImageOverlayLayer(dataUrl, layerLabel, bounds);
    return true;
  }

  /* ── GeoPackage Loader principal ── */
  async function loadGeoPackage(file) {
    if (typeof initSqlJs === 'undefined') {
      throw new Error('sql.js não carregado. Verifique a internet e recarregue a página.');
    }

    const { prog, fill, lbl } = showProgress('Inicializando sql.js...');
    setProgress(fill, lbl, 8, 'Carregando engine SQLite...');

    /* 1. Inicia sql.js (carrega WASM do CDN) */
    let SQL;
    try {
      SQL = await initSqlJs({
        locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}`
      });
    } catch (e) {
      hideProgress(prog);
      throw new Error('Falha ao carregar sql.js: ' + e.message);
    }

    setProgress(fill, lbl, 18, 'Lendo arquivo .gpkg...');
    const arrayBuffer = await file.arrayBuffer();

    /* 2. Abre banco SQLite */
    let db;
    try {
      db = new SQL.Database(new Uint8Array(arrayBuffer));
    } catch (e) {
      hideProgress(prog);
      throw new Error('Arquivo .gpkg inválido ou corrompido: ' + e.message);
    }

    setProgress(fill, lbl, 30, 'Identificando camadas...');

    /* 3. Descobre todas as tabelas vetoriais.
          ESTRATÉGIA: consulta gpkg_geometry_columns (uma linha por camada)
          que é a tabela mandatória do padrão OGC GeoPackage.
          Não usa JOIN para evitar problemas de compatibilidade com sql.js. */
    let featureTables = []; /* [{ tableName, geomCol }] */

    try {
      const res = db.exec('SELECT table_name, column_name FROM gpkg_geometry_columns');
      if (res.length && res[0].values.length) {
        featureTables = res[0].values.map(row => ({
          tableName: row[0],
          geomCol:   row[1],
        }));
        console.log(`[GPKG] ${featureTables.length} camada(s) em gpkg_geometry_columns:`,
          featureTables.map(t => t.tableName));
      }
    } catch (e) {
      console.warn('[GPKG] gpkg_geometry_columns falhou:', e.message);
    }

    /* Fallback: gpkg_contents */
    if (featureTables.length === 0) {
      try {
        const res = db.exec("SELECT table_name FROM gpkg_contents WHERE data_type='features'");
        if (res.length && res[0].values.length) {
          featureTables = res[0].values.map(row => ({ tableName: row[0], geomCol: null }));
          console.log(`[GPKG] Fallback gpkg_contents: ${featureTables.length} camada(s)`);
        }
      } catch (e) {
        console.warn('[GPKG] gpkg_contents fallback falhou:', e.message);
      }
    }

    /* Último recurso: lista todas as tabelas do SQLite e testa cada uma */
    if (featureTables.length === 0) {
      try {
        const res = db.exec(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'gpkg_%' AND name NOT LIKE 'rtree_%' AND name NOT LIKE 'sqlite_%'"
        );
        if (res.length && res[0].values.length) {
          featureTables = res[0].values.map(row => ({ tableName: row[0], geomCol: null }));
          console.log(`[GPKG] Último recurso — todas as tabelas:`, featureTables.map(t => t.tableName));
        }
      } catch (e) {
        console.warn('[GPKG] sqlite_master falhou:', e.message);
      }
    }

    if (featureTables.length === 0) {
      db.close();
      hideProgress(prog);
      throw new Error('Nenhuma camada vetorial encontrada neste GeoPackage.');
    }

    setProgress(fill, lbl, 40, `${featureTables.length} camada(s) encontrada(s)...`);
    console.log(`[GPKG] Processando ${featureTables.length} camada(s)...`);

    const gpkgName    = baseName(file.name);
    let totalFeatures = 0;
    let layersAdded   = 0;
    const skipped     = [];

    /* 4. Processa cada camada */
    for (let ti = 0; ti < featureTables.length; ti++) {
      const { tableName, geomCol } = featureTables[ti];
      const pct = 40 + Math.round(((ti + 1) / featureTables.length) * 55);
      setProgress(fill, lbl, pct, `Camada ${ti + 1}/${featureTables.length}: ${tableName}`);

      console.log(`[GPKG] Processando tabela: "${tableName}" | geomCol: "${geomCol}"`);

      try {
        /* 4a. Lê todas as linhas da tabela */
        const rowRes = db.exec(`SELECT * FROM "${tableName}"`);

        if (!rowRes.length || !rowRes[0].values.length) {
          console.warn(`[GPKG] "${tableName}": sem linhas`);
          skipped.push(`${tableName}: sem feições`);
          continue;
        }

        const { columns, values } = rowRes[0];
        console.log(`[GPKG] "${tableName}": ${values.length} linha(s) | colunas: [${columns.join(', ')}]`);

        /* 4b. Encontra a coluna de geometria */
        const geomIdx = _findGeomCol(columns, values, geomCol);

        if (geomIdx === -1) {
          console.warn(`[GPKG] "${tableName}": coluna de geometria não encontrada`);
          skipped.push(`${tableName}: coluna de geometria não encontrada`);
          continue;
        }

        console.log(`[GPKG] "${tableName}": usando coluna "${columns[geomIdx]}" (idx ${geomIdx})`);

        /* 4c. Converte cada linha em GeoJSON Feature */
        const features    = [];
        let   parseErrors = 0;

        for (const row of values) {
          const rawBlob = row[geomIdx];
          if (rawBlob == null) continue;

          /* Garante Uint8Array */
          const blob = rawBlob instanceof Uint8Array
            ? rawBlob
            : new Uint8Array(rawBlob);

          const geometry = _parseGpkgBlob(blob);
          if (!geometry) { parseErrors++; continue; }

          /* Monta propriedades (todas as colunas exceto geometria) */
          const properties = {};
          columns.forEach((col, i) => {
            if (i !== geomIdx) {
              properties[col] = (row[i] instanceof Uint8Array) ? '[blob binário]' : row[i];
            }
          });

          features.push({ type: 'Feature', geometry, properties });
        }

        if (parseErrors > 0) {
          console.warn(`[GPKG] "${tableName}": ${parseErrors} geometria(s) com erro de parse ignorada(s)`);
        }

        if (features.length === 0) {
          skipped.push(`${tableName}: nenhuma geometria válida (${parseErrors} erros de parse)`);
          continue;
        }

        /* 4d. Adiciona camada no mapa */
        const layerName = featureTables.length === 1
          ? gpkgName                         /* arquivo com 1 camada → usa nome do arquivo */
          : `${gpkgName} · ${tableName}`;    /* múltiplas → prefixo com nome do arquivo */

        LayerManager.addGeoJSONLayer(
          { type: 'FeatureCollection', features },
          layerName
        );

        console.log(`[GPKG] ✓ "${tableName}" → ${features.length} feição(ões) adicionada(s)`);
        totalFeatures += features.length;
        layersAdded++;

      } catch (err) {
        console.error(`[GPKG] Erro na tabela "${tableName}":`, err);
        skipped.push(`${tableName}: ${err.message}`);
      }
    }

    /* ── 5. Camadas RASTER (tiles e gridded coverage) ──────────
       Busca em gpkg_contents as camadas que NÃO são vetoriais.
       O db ainda está aberto neste ponto para que possamos ler os tiles. */
    setProgress(fill, lbl, 88, 'Verificando camadas raster...');

    let rasterTables = [];
    try {
      const rRes = db.exec(
        "SELECT table_name, identifier, data_type FROM gpkg_contents WHERE data_type IN ('tiles','2d-gridded-coverage')"
      );
      if (rRes.length && rRes[0].values.length) {
        rasterTables = rRes[0].values.map(row => ({
          tableName: row[0],
          label:     row[1] || row[0],
          dataType:  row[2],
        }));
        console.log(`[GPKG] ${rasterTables.length} camada(s) raster encontrada(s):`,
          rasterTables.map(t => t.tableName));
      }
    } catch (e) {
      console.warn('[GPKG] Erro ao buscar camadas raster:', e.message);
    }

    let rastersAdded = 0;
    for (let ri = 0; ri < rasterTables.length; ri++) {
      const { tableName, label } = rasterTables[ri];
      const layerLabel = rasterTables.length === 1 && featureTables.length === 0
        ? gpkgName
        : `${gpkgName} · ${label}`;

      setProgress(fill, lbl, 88 + Math.round(((ri + 1) / Math.max(rasterTables.length, 1)) * 10),
        `Raster ${ri + 1}/${rasterTables.length}: ${label}...`);

      try {
        const ok = await _loadGpkgRasterLayer(db, tableName, layerLabel);
        if (ok) {
          rastersAdded++;
          console.log(`[GPKG] ✓ Raster "${tableName}" adicionado`);
        } else {
          skipped.push(`${tableName} (raster): falha no carregamento`);
        }
      } catch (e) {
        console.error(`[GPKG] Erro raster "${tableName}":`, e);
        skipped.push(`${tableName} (raster): ${e.message}`);
      }
    }

    /* ── Fecha o banco após processar tudo ── */
    db.close();
    setProgress(fill, lbl, 100, 'Concluído!');
    hideProgress(prog);

    /* Avisos de camadas ignoradas */
    if (skipped.length > 0) {
      console.warn('[GPKG] Camadas ignoradas:', skipped);
      showToast(
        `${skipped.length} camada(s) ignorada(s). Abra o Console (F12).`,
        'warning', 5000
      );
    }

    const totalLayers = layersAdded + rastersAdded;
    if (totalLayers === 0) {
      throw new Error('Nenhuma camada válida encontrada no GeoPackage.');
    }

    LayerManager.zoomToAll();

    const parts = [];
    if (layersAdded  > 0) parts.push(`${layersAdded} vetorial(is) · ${totalFeatures.toLocaleString('pt-BR')} feições`);
    if (rastersAdded > 0) parts.push(`${rastersAdded} raster(s)`);
    showToast(`GeoPackage: ${parts.join(' + ')}`, 'success', 7000);
  }

  /* ============================================================
     Roteamento de arquivos
     ============================================================ */
  async function handleFiles(fileList) {
    const files = Array.from(fileList);
    if (!files.length) return;

    showLoading('Processando arquivo...');

    try {
      /* Shapefile é multi-arquivo → agrupa e processa junto */
      if (files.some(f => f.name.toLowerCase().endsWith('.shp'))) {
        hideLoading();
        await loadShapefile(files);
        return;
      }

      for (const file of files) {
        document.getElementById('loading-text').textContent = `Carregando: ${file.name}`;
        const ext = file.name.split('.').pop().toLowerCase();

        if      (ext === 'geojson' || ext === 'json') await loadGeoJSON(file);
        else if (ext === 'tif'     || ext === 'tiff') await loadGeoTIFF(file);
        else if (ext === 'gpkg')                      await loadGeoPackage(file);
        else if (ext === 'dbf'     || ext === 'prj')
          showToast(`"${file.name}" ignorado — selecione o .shp junto.`, 'warning', 4000);
        else
          showToast(`Formato não suportado: .${ext}`, 'warning', 3000);
      }
    } catch (err) {
      showToast('Erro: ' + err.message, 'error', 6000);
      console.error('[FileLoader]', err);
    } finally {
      hideLoading();
    }
  }

  /* ── Zona de arrastar e soltar ── */
  function initDropZone() {
    const dropZone  = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    fileInput.addEventListener('change', e => {
      if (e.target.files.length) handleFiles(e.target.files);
      e.target.value = '';
    });

    dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });

    /* Drop também sobre o mapa */
    const mapEl = document.getElementById('map');
    mapEl.addEventListener('dragover', e => e.preventDefault());
    mapEl.addEventListener('drop',     e => { e.preventDefault(); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });
  }

  document.addEventListener('DOMContentLoaded', initDropZone);

  return { handleFiles };
})();
