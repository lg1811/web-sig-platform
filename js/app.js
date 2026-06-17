/* ============================================================
   app.js – Core Application Bootstrap
   GeoWebSIG · Leaflet Map Engine + UI Interactions
   ============================================================ */

'use strict';

/* ── State ── */
const AppState = {
  map: null,
  baseLayers: {},
  currentBasemap: 'osm',
  sidebarOpen: true,
  activeTool: null,
  layerCount: 0,
};

/* ── Palette for auto-coloring layers ── */
const LAYER_COLORS = [
  '#4f8ef7','#a78bfa','#34d399','#fbbf24','#f87171',
  '#38bdf8','#fb923c','#e879f9','#4ade80','#f472b6',
];
let colorIndex = 0;
function nextColor() {
  const c = LAYER_COLORS[colorIndex % LAYER_COLORS.length];
  colorIndex++;
  return c;
}

/* ── Toast ── */
function showToast(message, type = 'info', duration = 3500) {
  const icons = { success: '✅', error: '❌', info: '📋', warning: '⚠️' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-msg">${message}</span>`;
  container.prepend(toast);
  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ── Loading overlay ── */
function showLoading(text = 'Carregando...') {
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading-overlay').classList.remove('hidden');
  document.getElementById('tool-status-text').textContent = text;
  document.querySelector('.status-dot').className = 'status-dot loading';
}
function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
  setStatusReady();
}

function setStatusReady() {
  document.getElementById('tool-status-text').textContent = 'Pronto';
  document.querySelector('.status-dot').className = 'status-dot';
}
function setStatusMeasuring(text) {
  document.getElementById('tool-status-text').textContent = text;
  document.querySelector('.status-dot').className = 'status-dot measuring';
}

/* ── Base tile layers ── */
function buildBaseLayers() {
  return {
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '© Esri — Source: Esri, Maxar, GeoEye',
      maxZoom: 19,
    }),
    dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }),
    topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution: 'Map data: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a>',
      maxZoom: 17,
    }),
  };
}

/* ── Map initialisation ── */
function initMap() {
  AppState.baseLayers = buildBaseLayers();

  AppState.map = L.map('map', {
    center: [-15.0, -52.0],
    zoom: 4,
    layers: [AppState.baseLayers.osm],
    zoomControl: true,
    attributionControl: true,
  });

  AppState.map.zoomControl.setPosition('bottomright');
  L.control.scale({ position: 'bottomright', imperial: false }).addTo(AppState.map);

  /* Coordinate display */
  AppState.map.on('mousemove', (e) => {
    const { lat, lng } = e.latlng;
    document.getElementById('coords-display').textContent =
      `Lat: ${lat.toFixed(5)}   Lng: ${lng.toFixed(5)}`;
  });

  return AppState.map;
}

/* ── Basemap switching ── */
function switchBasemap(id) {
  if (AppState.currentBasemap === id) return;
  AppState.map.removeLayer(AppState.baseLayers[AppState.currentBasemap]);
  AppState.map.addLayer(AppState.baseLayers[id]);
  AppState.baseLayers[id].bringToBack();
  AppState.currentBasemap = id;

  document.querySelectorAll('.basemap-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.basemap === id);
  });
}

/* ── Sidebar toggle ── */
function initSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const btnClose = document.getElementById('btn-toggle-sidebar');
  const btnOpen  = document.getElementById('btn-open-sidebar');

  btnClose.addEventListener('click', () => {
    sidebar.classList.add('collapsed');
    btnOpen.classList.remove('hidden');
    AppState.sidebarOpen = false;
    setTimeout(() => AppState.map.invalidateSize(), 380);
  });
  btnOpen.addEventListener('click', () => {
    sidebar.classList.remove('collapsed');
    btnOpen.classList.add('hidden');
    AppState.sidebarOpen = true;
    setTimeout(() => AppState.map.invalidateSize(), 380);
  });
}

/* ── Layer count display ── */
function updateLayerCount(n) {
  document.getElementById('layer-count').textContent =
    n === 1 ? '1 camada' : `${n} camadas`;
  AppState.layerCount = n;
}

/* ── DOM ready ── */
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initSidebarToggle();

  /* Basemap buttons */
  document.querySelectorAll('.basemap-btn').forEach(btn => {
    btn.addEventListener('click', () => switchBasemap(btn.dataset.basemap));
  });

  /* Zoom to extent */
  document.getElementById('btn-zoom-extent').addEventListener('click', () => {
    if (AppState.layerCount > 0) {
      LayerManager.zoomToAll();
    } else {
      AppState.map.setView([-15.0, -52.0], 4);
    }
  });

  /* Sample data button */
  document.getElementById('btn-sample-data').addEventListener('click', () => {
    loadSampleData();
  });

  /* Clear all */
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    LayerManager.clearAll();
  });

  /* Keyboard shortcuts */
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'd' || e.key === 'D') document.getElementById('btn-measure-distance').click();
    if (e.key === 'a' || e.key === 'A') document.getElementById('btn-measure-area').click();
    if (e.key === 'i' || e.key === 'I') document.getElementById('btn-identify').click();
    if (e.key === 'z' || e.key === 'Z') document.getElementById('btn-zoom-extent').click();
    if (e.key === 'Escape') MapTools.deactivateAll();
  });
});

/* ── Load Sample Data ── */
function loadSampleData() {
  if (!window.SAMPLE_DATA) { showToast('Dados de exemplo não disponíveis.', 'error'); return; }

  showLoading('Carregando dados de exemplo...');

  setTimeout(() => {
    try {
      /* Regions polygon layer */
      LayerManager.addGeoJSONLayer(
        SAMPLE_DATA.regioes,
        'Regiões do Brasil',
        { color: '#4f8ef7', type: 'polygon', source: 'example' }
      );

      /* Capitals point layer */
      LayerManager.addGeoJSONLayer(
        SAMPLE_DATA.capitais,
        'Capitais Brasileiras',
        { color: '#fbbf24', type: 'point', source: 'example' }
      );

      LayerManager.zoomToAll();
      hideLoading();
      showToast('Dados de exemplo carregados com sucesso!', 'success');
    } catch (err) {
      hideLoading();
      showToast('Erro ao carregar dados de exemplo: ' + err.message, 'error');
    }
  }, 600);
}
