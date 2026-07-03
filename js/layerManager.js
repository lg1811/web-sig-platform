/* ============================================================
   layerManager.js – Layer Management
   GeoWebSIG · Add, remove, toggle, zoom layers
   ============================================================ */

'use strict';

const LayerManager = (() => {

  /* ── Internal registry ── */
  const _layers = [];
  let _idCounter = 0;

  /* ── Color map for Brazilian regions ── */
  const REGION_COLORS = {
    'Norte':         '#22d3ee',
    'Nordeste':      '#fb923c',
    'Centro-Oeste':  '#a78bfa',
    'Sudeste':       '#4f8ef7',
    'Sul':           '#34d399',
  };

  /* ── Style helpers ── */
  function _regionColor(feature, fallback) {
    const n = feature.properties?.regiao || feature.properties?.nome;
    return REGION_COLORS[n] || fallback;
  }

  function polygonStyle(feature, color) {
    const c = _regionColor(feature, color);
    return { color: c, weight: 2, opacity: 0.9, fillColor: c, fillOpacity: 0.18 };
  }

  function highlightStyle(feature, color) {
    const c = _regionColor(feature, color);
    return { color: c, weight: 3, opacity: 1, fillColor: c, fillOpacity: 0.35 };
  }

  function makePointMarker(feature, latlng, color) {
    return L.circleMarker(latlng, {
      radius: 7,
      fillColor: _regionColor(feature, color),
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
        if (AppState.activeTool === 'measure-distance' || AppState.activeTool === 'measure-area') return;
        const l = e.target;
        if (l.setStyle) l.setStyle(highlightStyle(feature, layerColor));
        if (l.bringToFront) l.bringToFront();
      },
      mouseout(e) {
        if (AppState.activeTool === 'measure-distance' || AppState.activeTool === 'measure-area') return;
        const l = e.target;
        if (l.setStyle) l.setStyle(polygonStyle(feature, layerColor));
      },
      click(e) {
        L.DomEvent.stopPropagation(e);
        if (AppState.activeTool === 'measure-distance' || AppState.activeTool === 'measure-area') return;

        /* Leaflet stores the GeoJSON feature directly on the layer as `.feature`.
           This is more reliable than the closure variable in edge cases. */
        const geoFeature = (e.target && e.target.feature) ? e.target.feature : feature;
        const props      = (geoFeature && geoFeature.properties != null) ? geoFeature.properties : null;
        const geomType   = (geoFeature && geoFeature.geometry && geoFeature.geometry.type) || 'Feature';

        console.log('[GeoWebSIG] Clique na feição | geometria:', geomType, '| props:', props);
        showAttributeModal(props, geomType);
      }
    });
  }

  /* ── Detect geometry type from GeoJSON ── */
  function detectGeomType(geojson) {
    const features = geojson?.features || [geojson];
    for (const f of features) {
      const t = f?.geometry?.type || f?.type;
      if (t && t !== 'FeatureCollection' && t !== 'Feature') return t.replace('Multi', '');
    }
    return 'Unknown';
  }

  /* ── Add GeoJSON layer ── */
  function addGeoJSONLayer(geojson, name, options = {}) {
    const color    = options.color || nextColor();
    const id       = ++_idCounter;
    const geomType = detectGeomType(geojson);

    const leafletLayer = L.geoJSON(geojson, {
      style:         (f) => polygonStyle(f, color),
      pointToLayer:  (f, ll) => makePointMarker(f, ll, color),
      onEachFeature: (f, l) => onEachFeature(f, l, color),
    });

    leafletLayer.addTo(AppState.map);

    const entry = {
      id, name, color,
      type:         options.type || geomType,
      leafletLayer,
      visible:      true,
      source:       options.source || 'upload',
    };
    _layers.push(entry);

    renderLayerItem(entry);
    updateLayerCount(_layers.length);
    _hideEmptyMsg();

    return entry;
  }

  /* ── Add GeoTIFF raster layer ── */
  function addGeoTIFFLayer(georaster, name) {
    const id    = ++_idCounter;
    const color = nextColor();

    const min   = georaster.mins?.[0] ?? 0;
    const max   = georaster.maxs?.[0] ?? 255;
    const range = max - min || 1;

    const leafletLayer = new GeoRasterLayer({
      georaster,
      opacity: 0.75,
      pixelValuesToColorFn(values) {
        const v = values[0];
        if (v == null || isNaN(v) || v === georaster.noDataValue) return null;
        const t = (v - min) / range;
        const r = Math.round(68  + (253 - 68)  * t);
        const g = Math.round(1   + (231 - 1)   * t);
        const b = Math.round(84  + (37  - 84)  * t);
        return `rgba(${r},${g},${b},0.85)`;
      },
      resolution: 256,
    });

    leafletLayer.addTo(AppState.map);
    try { AppState.map.fitBounds(leafletLayer.getBounds()); } catch (_) {}

    const entry = { id, name, color, type: 'GeoTIFF', leafletLayer, visible: true, source: 'upload' };
    _layers.push(entry);

    renderLayerItem(entry);
    updateLayerCount(_layers.length);
    _hideEmptyMsg();

    return entry;
  }

  /* ── Render sidebar layer item ── */
  function renderLayerItem(entry) {
    const typeLabels = {
      Point: '● Ponto', LineString: '━ Linha', Polygon: '▬ Polígono',
      GeoTIFF: '▦ Raster', polygon: '▬ Polígono', point: '● Ponto', Unknown: '◆ Vetor',
    };
    const typeLabel = typeLabels[entry.type] || entry.type;

    const li = document.createElement('li');
    li.className = 'layer-item';
    li.id = `layer-item-${entry.id}`;
    li.innerHTML = `
      <div class="layer-color-dot"
           style="color:${entry.color};background:${entry.color}20;border:1.5px solid ${entry.color}"></div>
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
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="11" y1="8" x2="11" y2="14"/>
            <line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <button class="btn-icon btn-ghost layer-remove" data-id="${entry.id}"
                title="Remover camada" style="color:var(--danger)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
          </svg>
        </button>
      </div>`;

    li.querySelector('.layer-toggle').addEventListener('click', (e) => { e.stopPropagation(); toggleLayer(entry.id); });
    li.querySelector('.layer-zoom').addEventListener('click',   (e) => { e.stopPropagation(); zoomToLayer(entry.id); });
    li.querySelector('.layer-remove').addEventListener('click', (e) => { e.stopPropagation(); removeLayer(entry.id); });

    document.getElementById('layer-list').prepend(li);
  }

  /* ── Toggle visibility ── */
  function toggleLayer(id) {
    const entry = _layers.find(l => l.id === id);
    if (!entry) return;
    entry.visible = !entry.visible;
    entry.visible ? AppState.map.addLayer(entry.leafletLayer)
                  : AppState.map.removeLayer(entry.leafletLayer);
    const btn = document.querySelector(`#layer-item-${id} .layer-toggle`);
    if (btn) btn.style.opacity = entry.visible ? '1' : '0.35';
  }

  /* ── Zoom to single layer ── */
  function zoomToLayer(id) {
    const entry = _layers.find(l => l.id === id);
    if (!entry) return;
    try {
      const b = entry.leafletLayer.getBounds();
      if (b && b.isValid()) AppState.map.fitBounds(b, { padding: [30, 30] });
    } catch (_) {}
  }

  /* ── Zoom to all layers ── */
  function zoomToAll() {
    if (_layers.length === 0) return;
    let bounds = null;
    _layers.forEach(entry => {
      try {
        const b = entry.leafletLayer.getBounds();
        if (b && b.isValid()) bounds = bounds ? bounds.extend(b) : b;
      } catch (_) {}
    });
    if (bounds && bounds.isValid()) AppState.map.fitBounds(bounds, { padding: [40, 40] });
  }

  /* ── Remove layer ── */
  function removeLayer(id) {
    const idx = _layers.findIndex(l => l.id === id);
    if (idx === -1) return;
    AppState.map.removeLayer(_layers[idx].leafletLayer);
    _layers.splice(idx, 1);
    const li = document.getElementById(`layer-item-${id}`);
    if (li) {
      li.style.transition = 'opacity 0.2s, transform 0.2s';
      li.style.opacity = '0';
      li.style.transform = 'translateX(-10px)';
      setTimeout(() => li.remove(), 220);
    }
    updateLayerCount(_layers.length);
    if (_layers.length === 0) _showEmptyMsg();
    showToast('Camada removida.', 'info', 2000);
  }

  /* ── Clear all layers ── */
  function clearAll() {
    if (_layers.length === 0) return;
    _layers.forEach(e => AppState.map.removeLayer(e.leafletLayer));
    _layers.length = 0;
    document.getElementById('layer-list').innerHTML = '';
    updateLayerCount(0);
    _showEmptyMsg();
    showToast('Todas as camadas removidas.', 'info', 2500);
  }

  function getLayers() { return _layers; }

  /* ── Empty message helpers ── */
  function _showEmptyMsg() {
    const ul = document.getElementById('layer-list');
    if (document.getElementById('layer-empty-msg')) return;
    const li = document.createElement('li');
    li.className = 'layer-empty';
    li.id = 'layer-empty-msg';
    li.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
           style="width:32px;height:32px;opacity:0.3;margin-bottom:8px">
        <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
      </svg>
      <span>Nenhuma camada carregada</span>`;
    ul.appendChild(li);
  }
  function _hideEmptyMsg() {
    document.getElementById('layer-empty-msg')?.remove();
  }

  return { addGeoJSONLayer, addGeoTIFFLayer, removeLayer, toggleLayer, zoomToLayer, zoomToAll, clearAll, getLayers };
})();

/* ============================================================
   showAttributeModal – exibe tabela de atributos da feição
   ============================================================ */
function showAttributeModal(properties, geomType) {
  const modal = document.getElementById('attr-modal');
  const title = document.getElementById('modal-title');
  const tbody = document.getElementById('attr-table-body');

  if (!modal || !title || !tbody) {
    console.error('[showAttributeModal] Elementos do modal não encontrados.');
    return;
  }

  title.textContent = `Atributos · ${geomType}`;
  tbody.innerHTML = '';

  /* Coleta TODAS as chaves do objeto properties.
     Usa Object.keys() que lista apenas propriedades próprias e enumeráveis,
     exatamente o que precisamos para atributos GeoJSON/Shapefile/GeoPackage. */
  const keys = properties != null ? Object.keys(properties) : [];

  if (keys.length === 0) {
    /* Se chegou aqui com keys vazio, mostre um diagnóstico útil */
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="2" style="padding:16px;text-align:center;color:var(--text-muted)">
        <div style="font-style:italic;margin-bottom:6px">Sem atributos nesta feição.</div>
        <div style="font-size:10px;font-family:'JetBrains Mono',monospace">
          tipo: ${typeof properties} | valor: ${JSON.stringify(properties)}
        </div>
        <div style="font-size:10px;margin-top:4px">Abra o Console (F12) para mais detalhes.</div>
      </td>`;
    tbody.appendChild(tr);
  } else {
    keys.forEach(key => {
      const val = properties[key];
      const tr  = document.createElement('tr');

      /* Renderização segura do valor */
      let displayVal;
      if (val === null || val === undefined) {
        displayVal = '<span style="color:var(--text-muted);font-style:italic">nulo</span>';
      } else if (typeof val === 'number') {
        /* Formata número: inteiros sem casas, decimais com até 6 casas */
        displayVal = Number.isInteger(val)
          ? val.toLocaleString('pt-BR')
          : val.toLocaleString('pt-BR', { maximumFractionDigits: 6 });
      } else if (typeof val === 'boolean') {
        displayVal = val ? '<span style="color:var(--success)">✓ verdadeiro</span>'
                        : '<span style="color:var(--danger)">✗ falso</span>';
      } else if (typeof val === 'object') {
        displayVal = `<code style="font-size:10px;word-break:break-all">${JSON.stringify(val)}</code>`;
      } else {
        /* String — escapa HTML para segurança */
        displayVal = String(val)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>');
      }

      /* Escapa também o nome da chave */
      const safeKey = String(key)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      tr.innerHTML = `<td>${safeKey}</td><td>${displayVal}</td>`;
      tbody.appendChild(tr);
    });
  }

  modal.classList.remove('hidden');
}

/* ── Fechar modal ── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('attr-modal').classList.add('hidden');
  });
  document.getElementById('modal-backdrop').addEventListener('click', () => {
    document.getElementById('attr-modal').classList.add('hidden');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('attr-modal').classList.add('hidden');
    }
  });
});
