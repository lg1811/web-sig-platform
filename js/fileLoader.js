/* ============================================================
   fileLoader.js – Drag & Drop + File Upload
   Supports: .shp+.dbf+.prj | .geojson | .tif/.tiff
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
