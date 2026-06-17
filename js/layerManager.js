/* ============================================================
   layerManager.js – Layer Management
   GeoWebSIG · Add, remove, toggle layers, zoom to extent
   ============================================================ */

'use strict';

const LayerManager = (() => {

  /* Internal layer registry: { id, name, type, color, leafletLayer, visible } */
  const _layers = [];
  let _idCounter = 0;

  /* ── Region color maps ── */
  const REGION_COLORS = {
    'Norte':        '#22d3ee',
    'Nordeste':     '#fb923c',
    'Centro-Oeste': '#a78bfa',
    'Sudeste':      '#4f8ef7',
    'Sul':          '#34d399',
  };

  /* ── Style helpers ── */
  function polygonStyle(feature, color) {
    const regionName = feature.properties?.regiao || feature.properties?.nome;
    const fillColor = REGION_COLORS[regionName] || color;
    return {
      color: fillColor,
      weight: 2,
      opacity: 0.9,
      fillColor: fillColor,
      fillOpacity: 0.18,
    };
  }

  function highlightStyle(feature, color) {
    const regionName = feature.properties?.regiao || feature.properties?.nome;
    const fillColor = REGION_COLORS[regionName] || color;
    return {
      color: fillColor,
      weight: 3,
      opacity: 1,
      fillColor: fillColor,
      fillOpacity: 0.35,
    };
  }

  function makePointMarker(feature, latlng, color) {
    const regionName = feature.properties?.regiao;
    const markerColor = REGION_COLORS[regionName] || color;
    return L.circleMarker(latlng, {
      radius: 7,
      fillColor: markerColor,
      color: '#fff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9,
    });
  }

  /* ── Feature interactions ── */
  function onEachFeature(feature, layer, layerColor) {
    layer.on({
      mouseover(e) {
        if (AppState.activeTool === 'identify') return;
        const l = e.target;
        if (l.setStyle) l.setStyle(highlightStyle(feature, layerColor));
        if (l.bringToFront) l.bringToFront();
      },
      mouseout(e) {
        if (AppState.activeTool === 'identify') return;
        const l = e.target;
        if (l.setStyle) l.setStyle(polygonStyle(feature, layerColor));
      },
      click(e) {
        if (AppState.activeTool === 'measure-distance' || AppState.activeTool === 'measure-area') return;
        if (feature.properties && Object.keys(feature.properties).length > 0) {
          showAttributeModal(feature.properties, feature.geometry?.type || 'Feature');
        }
      }
    });
  }

  /* ── Add GeoJSON ── */
  function addGeoJSONLayer(geojson, name, options = {}) {
    const color = options.color || nextColor();
    const id = ++_idCounter;

    let leafletLayer;
    const geomType = detectGeomType(geojson);

    if (geomType === 'Point' || geomType === 'MultiPoint') {
      leafletLayer = L.geoJSON(geojson, {
        pointToLayer: (f, ll) => makePointMarker(f, ll, color),
        onEachFeature: (f, l) => onEachFeature(f, l, color),
      });
    } else {
      leafletLayer = L.geoJSON(geojson, {
        style: (f) => polygonStyle(f, color),
        onEachFeature: (f, l) => onEachFeature(f, l, color),
      });
    }

    leafletLayer.addTo(AppState.map);

    const entry = { id, name, type: options.type || geomType, color, leafletLayer, visible: true, source: options.source || 'upload' };
    _layers.push(entry);

    renderLayerItem(entry);
    updateLayerCount(_layers.length);
    _hideEmptyMsg();

    return entry;
  }

  /* ── Add GeoTIFF (raster) layer ── */
  function addGeoTIFFLayer(georaster, name) {
    const id = ++_idCounter;
    const color = nextColor();

    const min = georaster.mins ? georaster.mins[0] : 0;
    const max = georaster.maxs ? georaster.maxs[0] : 255;
    const range = max - min || 1;

    const leafletLayer = new GeoRasterLayer({
      georaster,
      opacity: 0.75,
      pixelValuesToColorFn: (values) => {
        const v = values[0];
        if (v === null || v === undefined || isNaN(v) || v === georaster.noDataValue) return null;
        const t = (v - min) / range;
        // Viridis-like color ramp
        const r = Math.round(68  + (253 - 68)  * t);
        const g = Math.round(1   + (231 - 1)   * t);
        const b = Math.round(84  + (37  - 84)  * t);
        return `rgba(${r},${g},${b},0.85)`;
      },
      resolution: 256,
    });

    leafletLayer.addTo(AppState.map);
    AppState.map.fitBounds(leafletLayer.getBounds());

    const entry = { id, name, type: 'GeoTIFF', color, leafletLayer, visible: true, source: 'upload' };
    _layers.push(entry);

    renderLayerItem(entry);
    updateLayerCount(_layers.length);
    _hideEmptyMsg();

    return entry;
  }

  /* ── Detect geometry type ── */
  function detectGeomType(geojson) {
    if (!geojson) return 'Unknown';
    const features = geojson.features || [geojson];
    for (const f of features) {
      const gt = f.geometry?.type || f.type;
      if (gt) return gt.replace('Multi', '');
    }
    return 'Unknown';
  }

  /* ── Render sidebar layer item ── */
  function renderLayerItem(entry) {
    const emptyMsg = document.getElementById('layer-empty-msg');
    if (emptyMsg) emptyMsg.remove();

    const typeLabels = {
      'Point': '● Ponto', 'LineString': '━ Linha', 'Polygon': '▬ Polígono',
      'GeoTIFF': '▦ Raster', 'polygon': '▬ Polígono', 'point': '● Ponto',
      'Unknown': '◆ Vetor'
    };
    const typeLabel = typeLabels[entry.type] || entry.type;

    const li = document.createElement('li');
    li.className = 'layer-item';
    li.id = `layer-item-${entry.id}`;
    li.innerHTML = `
      <div class="layer-color-dot" style="color:${entry.color};background:${entry.color}20;border:1.5px solid ${entry.color}"></div>
      <div class="layer-info">
        <div class="layer-name" title="${entry.name}">${entry.name}</div>
        <div class="layer-type-badge">${typeLabel}</div>
      </div>
      <div class="layer-controls">
        <button class="btn-icon btn-ghost layer-toggle" data-id="${entry.id}" title="Mostrar/Ocultar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
        <button class="btn-icon btn-ghost layer-zoom" data-id="${entry.id}" title="Zoom para camada">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <button class="btn-icon btn-ghost layer-remove" data-id="${entry.id}" title="Remover camada" style="color:var(--danger)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    `;

    /* Events */
    li.querySelector('.layer-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLayer(entry.id);
    });
    li.querySelector('.layer-zoom').addEventListener('click', (e) => {
      e.stopPropagation();
      zoomToLayer(entry.id);
    });
    li.querySelector('.layer-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      removeLayer(entry.id);
    });

    document.getElementById('layer-list').prepend(li);
  }

  /* ── Toggle visibility ── */
  function toggleLayer(id) {
    const entry = _layers.find(l => l.id === id);
    if (!entry) return;
    entry.visible = !entry.visible;
    if (entry.visible) {
      AppState.map.addLayer(entry.leafletLayer);
    } else {
      AppState.map.removeLayer(entry.leafletLayer);
    }
    const btn = document.querySelector(`#layer-item-${id} .layer-toggle`);
    if (btn) btn.style.opacity = entry.visible ? '1' : '0.3';
  }

  /* ── Zoom to layer ── */
  function zoomToLayer(id) {
    const entry = _layers.find(l => l.id === id);
    if (!entry) return;
    try {
      if (entry.leafletLayer.getBounds) {
        AppState.map.fitBounds(entry.leafletLayer.getBounds(), { padding: [30, 30] });
      }
    } catch (e) { /* raster may throw */ }
  }

  /* ── Zoom to all ── */
  function zoomToAll() {
    if (_layers.length === 0) return;
    let bounds = null;
    _layers.forEach(entry => {
      try {
        if (entry.leafletLayer.getBounds) {
          const b = entry.leafletLayer.getBounds();
          if (b.isValid()) {
            bounds = bounds ? bounds.extend(b) : b;
          }
        }
      } catch (e) {}
    });
    if (bounds && bounds.isValid()) {
      AppState.map.fitBounds(bounds, { padding: [40, 40] });
    }
  }

  /* ── Remove layer ── */
  function removeLayer(id) {
    const idx = _layers.findIndex(l => l.id === id);
    if (idx === -1) return;
    AppState.map.removeLayer(_layers[idx].leafletLayer);
    _layers.splice(idx, 1);
    const li = document.getElementById(`layer-item-${id}`);
    if (li) {
      li.style.animation = 'none';
      li.style.opacity = '0';
      li.style.transform = 'translateX(-10px)';
      li.style.transition = 'opacity 0.2s, transform 0.2s';
      setTimeout(() => li.remove(), 220);
    }
    updateLayerCount(_layers.length);
    if (_layers.length === 0) _showEmptyMsg();
    showToast(`Camada removida.`, 'info', 2000);
  }

  /* ── Clear all ── */
  function clearAll() {
    if (_layers.length === 0) return;
    _layers.forEach(e => AppState.map.removeLayer(e.leafletLayer));
    _layers.length = 0;
    document.getElementById('layer-list').innerHTML = '';
    updateLayerCount(0);
    _showEmptyMsg();
    showToast('Todas as camadas removidas.', 'info', 2500);
  }

  /* ── Get all layers ── */
  function getLayers() { return _layers; }

  /* ── Empty message helpers ── */
  function _showEmptyMsg() {
    const ul = document.getElementById('layer-list');
    if (!document.getElementById('layer-empty-msg')) {
      const li = document.createElement('li');
      li.className = 'layer-empty';
      li.id = 'layer-empty-msg';
      li.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:32px;height:32px;opacity:0.3;margin-bottom:8px">
          <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
        </svg>
        <span>Nenhuma camada carregada</span>
      `;
      ul.appendChild(li);
    }
  }
  function _hideEmptyMsg() {
    const el = document.getElementById('layer-empty-msg');
    if (el) el.remove();
  }

  return { addGeoJSONLayer, addGeoTIFFLayer, removeLayer, toggleLayer, zoomToLayer, zoomToAll, clearAll, getLayers };
})();

/* ── Attribute Modal ── */
function showAttributeModal(properties, geomType) {
  const modal = document.getElementById('attr-modal');
  const title = document.getElementById('modal-title');
  const tbody = document.getElementById('attr-table-body');

  title.textContent = `Atributos · ${geomType}`;
  tbody.innerHTML = '';

  Object.entries(properties).forEach(([key, val]) => {
    const tr = document.createElement('tr');
    const displayVal = val === null || val === undefined ? '<span style="color:var(--text-muted);font-style:italic">nulo</span>' :
      typeof val === 'number' ? val.toLocaleString('pt-BR') : String(val);
    tr.innerHTML = `<td>${key}</td><td>${displayVal}</td>`;
    tbody.appendChild(tr);
  });

  modal.classList.remove('hidden');
}

/* Close modal */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('attr-modal').classList.add('hidden');
  });
  document.getElementById('modal-backdrop').addEventListener('click', () => {
    document.getElementById('attr-modal').classList.add('hidden');
  });
});
