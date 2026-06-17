/* ============================================================
   mapTools.js – Measurement Tools & Feature Identify
   GeoWebSIG · Distance, Area, Identify + Keyboard shortcuts
   ============================================================ */

'use strict';

const MapTools = (() => {

  /* ── Internal state ── */
  let _mode = null; // 'measure-distance' | 'measure-area' | 'identify' | null
  let _measurePoints = [];
  let _measureLines  = [];
  let _measureMarkers = [];
  let _measurePolygon = null;
  let _measureTooltips = [];
  let _totalDist = 0;

  /* ── Activate tool button ── */
  function _setActiveBtn(id) {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    if (id) {
      const btn = document.getElementById(id);
      if (btn) btn.classList.add('active');
    }
  }

  /* ── Map cursor ── */
  function _setCursor(cursor) {
    const mapEl = document.getElementById('map');
    mapEl.style.cursor = cursor || '';
  }

  /* ── Clear measure drawings ── */
  function _clearMeasureDrawings() {
    _measureLines.forEach(l => AppState.map.removeLayer(l));
    _measureMarkers.forEach(m => AppState.map.removeLayer(m));
    _measureTooltips.forEach(t => AppState.map.removeLayer(t));
    if (_measurePolygon) AppState.map.removeLayer(_measurePolygon);

    _measureLines    = [];
    _measureMarkers  = [];
    _measureTooltips = [];
    _measurePolygon  = null;
    _measurePoints   = [];
    _totalDist       = 0;

    document.getElementById('measure-result').classList.add('hidden');
    document.getElementById('measure-result').textContent = '';
  }

  /* ── Haversine distance (meters) ── */
  function _haversine(ll1, ll2) {
    const R = 6371000;
    const φ1 = ll1.lat * Math.PI / 180;
    const φ2 = ll2.lat * Math.PI / 180;
    const Δφ = (ll2.lat - ll1.lat) * Math.PI / 180;
    const Δλ = (ll2.lng - ll1.lng) * Math.PI / 180;
    const a  = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /* ── Shoelace area (m²) via spherical excess approx ── */
  function _polygonArea(pts) {
    if (pts.length < 3) return 0;
    const R = 6371000;
    let area = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const xi = pts[i].lng * Math.PI / 180;
      const yi = pts[i].lat * Math.PI / 180;
      const xj = pts[j].lng * Math.PI / 180;
      const yj = pts[j].lat * Math.PI / 180;
      area += (xj - xi) * (Math.sin(yi) + Math.sin(yj));
    }
    return Math.abs(area * R * R / 2);
  }

  /* ── Format distance ── */
  function _fmtDist(m) {
    if (m >= 1000) return (m / 1000).toFixed(3) + ' km';
    return m.toFixed(1) + ' m';
  }
  /* ── Format area ── */
  function _fmtArea(m2) {
    if (m2 >= 1e6) return (m2 / 1e6).toFixed(4) + ' km²';
    if (m2 >= 1e4) return (m2 / 1e4).toFixed(2) + ' ha';
    return m2.toFixed(1) + ' m²';
  }

  /* ── Draw measure marker ── */
  function _addMarker(latlng, label) {
    const icon = L.divIcon({
      className: 'measure-marker',
      iconSize: [10, 10],
      iconAnchor: [5, 5],
    });
    const marker = L.marker(latlng, { icon }).addTo(AppState.map);
    _measureMarkers.push(marker);

    if (label) {
      const tooltip = L.tooltip({ permanent: true, direction: 'top', className: 'measure-tooltip', offset: [0, -8] })
        .setContent(label)
        .setLatLng(latlng)
        .addTo(AppState.map);
      _measureTooltips.push(tooltip);
    }
    return marker;
  }

  /* ── Draw line segment ── */
  function _addLine(ll1, ll2) {
    const line = L.polyline([ll1, ll2], {
      color: '#facc15', weight: 2.5, dashArray: '6 4', opacity: 0.9
    }).addTo(AppState.map);
    _measureLines.push(line);
    return line;
  }

  /* ── Show result in status bar ── */
  function _showResult(text) {
    const el = document.getElementById('measure-result');
    el.textContent = '📐 ' + text;
    el.classList.remove('hidden');
  }

  /* ── Distance Tool Click Handler ── */
  function _handleDistanceClick(e) {
    const ll = e.latlng;
    _measurePoints.push(ll);
    const n = _measurePoints.length;

    if (n === 1) {
      _addMarker(ll, 'Início');
      setStatusMeasuring('Clique para adicionar ponto · Duplo-clique para finalizar');
    } else {
      const prev = _measurePoints[n - 2];
      const segDist = _haversine(prev, ll);
      _totalDist += segDist;
      _addLine(prev, ll);
      _addMarker(ll, _fmtDist(_totalDist));
      _showResult(`Distância total: ${_fmtDist(_totalDist)}`);
    }
  }

  /* ── Area Tool Click Handler ── */
  function _handleAreaClick(e) {
    const ll = e.latlng;
    _measurePoints.push(ll);
    const n = _measurePoints.length;

    _addMarker(ll);
    if (n > 1) {
      const prev = _measurePoints[n - 2];
      _addLine(prev, ll);
    }

    /* Update closing line and polygon preview */
    if (_measurePolygon) AppState.map.removeLayer(_measurePolygon);
    if (n >= 3) {
      _measurePolygon = L.polygon(_measurePoints, {
        color: '#a78bfa', weight: 1.5, fillColor: '#a78bfa', fillOpacity: 0.12, dashArray: '5 3'
      }).addTo(AppState.map);
      const area = _polygonArea(_measurePoints);
      _showResult(`Área: ${_fmtArea(area)}`);
    }
    setStatusMeasuring(`${n} ponto(s) · Duplo-clique para fechar`);
  }

  /* ── Finalise area ── */
  function _finalizeArea() {
    if (_measurePoints.length < 3) {
      _clearMeasureDrawings();
      setStatusReady();
      return;
    }
    const area = _polygonArea(_measurePoints);
    /* Close polygon visually */
    _addLine(_measurePoints[_measurePoints.length - 1], _measurePoints[0]);
    _showResult(`Área: ${_fmtArea(area)}`);
    showToast(`Área medida: ${_fmtArea(area)}`, 'info');
    setStatusMeasuring(`Medição concluída · pressione Esc para limpar`);
  }

  /* ── Dblclick handler for finalizing ── */
  function _handleDblClick(e) {
    L.DomEvent.stopPropagation(e);
    if (_mode === 'measure-distance') {
      if (_measurePoints.length >= 2) {
        showToast(`Distância: ${_fmtDist(_totalDist)}`, 'info');
        setStatusMeasuring(`Medição concluída · pressione Esc para limpar`);
        AppState.map.off('click', _handleDistanceClick);
        AppState.map.off('dblclick', _handleDblClick);
      }
    } else if (_mode === 'measure-area') {
      _finalizeArea();
      AppState.map.off('click', _handleAreaClick);
      AppState.map.off('dblclick', _handleDblClick);
    }
  }

  /* ── Activate Distance ── */
  function activateDistance() {
    if (_mode === 'measure-distance') { deactivateAll(); return; }
    deactivateAll(false);
    _mode = 'measure-distance';
    AppState.activeTool = 'measure-distance';
    _setActiveBtn('btn-measure-distance');
    _setCursor('crosshair');
    _clearMeasureDrawings();
    setStatusMeasuring('Clique para iniciar medição de distância · Esc para cancelar');

    AppState.map.on('click', _handleDistanceClick);
    AppState.map.on('dblclick', _handleDblClick);
    showToast('Ferramenta de distância ativa. Duplo-clique para finalizar.', 'info', 3000);
  }

  /* ── Activate Area ── */
  function activateArea() {
    if (_mode === 'measure-area') { deactivateAll(); return; }
    deactivateAll(false);
    _mode = 'measure-area';
    AppState.activeTool = 'measure-area';
    _setActiveBtn('btn-measure-area');
    _setCursor('crosshair');
    _clearMeasureDrawings();
    setStatusMeasuring('Clique para adicionar vértices · Duplo-clique para fechar');

    AppState.map.on('click', _handleAreaClick);
    AppState.map.on('dblclick', _handleDblClick);
    showToast('Ferramenta de área ativa. Mínimo 3 pontos, duplo-clique para fechar.', 'info', 3000);
  }

  /* ── Activate Identify ── */
  function activateIdentify() {
    if (_mode === 'identify') { deactivateAll(); return; }
    deactivateAll(false);
    _mode = 'identify';
    AppState.activeTool = 'identify';
    _setActiveBtn('btn-identify');
    _setCursor('help');
    setStatusMeasuring('Clique sobre uma feição para ver seus atributos');
    showToast('Ferramenta de atributos ativa. Clique em uma feição.', 'info', 3000);
  }

  /* ── Deactivate All ── */
  function deactivateAll(clear = true) {
    AppState.map.off('click', _handleDistanceClick);
    AppState.map.off('click', _handleAreaClick);
    AppState.map.off('dblclick', _handleDblClick);

    if (clear) _clearMeasureDrawings();

    _mode = null;
    AppState.activeTool = null;
    _setActiveBtn(null);
    _setCursor('');
    setStatusReady();
  }

  /* ── Init button events ── */
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-measure-distance').addEventListener('click', activateDistance);
    document.getElementById('btn-measure-area').addEventListener('click', activateArea);
    document.getElementById('btn-identify').addEventListener('click', activateIdentify);
  });

  return { activateDistance, activateArea, activateIdentify, deactivateAll };
})();
