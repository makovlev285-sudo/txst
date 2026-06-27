const API_BASE = '';

const CHART_COLORS = {
  border: '#a78bfa',
  bg: 'rgba(167, 139, 250, 0.2)',
  grid: '#2a2a4a44',
};

let mainChart = null;
let serversList = [];
let currentData = {};
let historyData = {};
let selectedServer = null;

// Генерация цвета из строки (карты)
function stringToColor(str, alpha = 0.7) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsla(${hue}, 60%, 45%, ${alpha})`;
}

function getKey(server) {
  return `${server.host}:${server.port}`;
}

async function loadServers() {
  const res = await fetch(`${API_BASE}/api/servers`);
  serversList = await res.json();
  return serversList;
}

async function loadCurrent() {
  const res = await fetch(`${API_BASE}/api/current`);
  currentData = await res.json();
  return currentData;
}

async function loadHistory() {
  const res = await fetch(`${API_BASE}/api/history`);
  historyData = await res.json();
  return historyData;
}

async function loadTopPlayers() {
  const res = await fetch(`${API_BASE}/api/top-players?limit=15`);
  return await res.json();
}

async function loadTopMaps() {
  const res = await fetch(`${API_BASE}/api/top-maps?limit=10`);
  return await res.json();
}

function formatPlayTime(minutes) {
  if (minutes < 60) return `${minutes}м`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}ч ${mins}м`;
  const days = Math.floor(hours / 24);
  const hrs = hours % 24;
  return `${days}д ${hrs}ч`;
}

function renderServerSelect() {
  const container = document.getElementById('server-select');
  if (!selectedServer && serversList.length > 0) {
    selectedServer = serversList[0];
  }
  
  container.innerHTML = serversList.map(server => {
    const key = getKey(server);
    const data = currentData[key] || {};
    const isOnline = data.players > 0;
    const isActive = selectedServer && getKey(selectedServer) === key;
    
    return `
      <button class="server-btn ${isActive ? 'active' : ''}" data-key="${key}">
        <span class="dot ${isOnline ? 'online' : 'offline'}"></span>
        ${server.name}
      </button>
    `;
  }).join('');
  
  container.querySelectorAll('.server-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      selectedServer = serversList.find(s => getKey(s) === key);
      renderServerSelect();
      updateChart();
      updateTimeline();
    });
  });
}

function updateChart() {
  const canvas = document.getElementById('main-chart');
  if (!canvas || !selectedServer) return;
  
  const key = getKey(selectedServer);
  const history = historyData[key] || [];
  
  if (history.length === 0) return;
  
  const chartData = history.map(d => ({ x: d.time, y: d.players }));
  
  if (mainChart) {
    mainChart.data.datasets[0].data = chartData;
    mainChart.update('none');
  } else {
    mainChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        datasets: [{
          label: 'Игроки',
          data: chartData,
          borderColor: CHART_COLORS.border,
          backgroundColor: CHART_COLORS.bg,
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 5,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          mode: 'nearest',
          intersect: false,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1a2eee',
            titleColor: '#a78bfa',
            bodyColor: '#e0e0e0',
            borderColor: '#2a2a4a',
            borderWidth: 1,
            callbacks: {
              title: (items) => {
                const d = new Date(items[0].parsed.x);
                return d.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
              },
              label: (ctx) => `Игроки: ${ctx.parsed.y}`
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: history.length > 720 ? 'hour' : 'minute',
              displayFormats: {
                minute: 'HH:mm',
                hour: 'HH:mm',
              },
              tooltipFormat: 'dd.MM HH:mm'
            },
            grid: { color: CHART_COLORS.grid },
            ticks: { color: '#666', maxTicksLimit: 12 }
          },
          y: {
            beginAtZero: true,
            suggestedMax: 64,
            grid: { color: CHART_COLORS.grid },
            ticks: { color: '#666', stepSize: 1 }
          }
        }
      }
    });
  }
  
  updateMapsBar(history);
  updateCurrentPlayers();
}

function updateMapsBar(history) {
  const bar = document.getElementById('maps-bar');
  const labels = document.getElementById('maps-bar-labels');
  if (!bar || !labels || history.length === 0) return;
  
  // Группируем последовательные записи с одинаковой картой
  const segments = [];
  let currentSegment = null;
  
  for (const item of history) {
    if (!currentSegment || currentSegment.map !== item.map) {
      if (currentSegment) segments.push(currentSegment);
      currentSegment = {
        map: item.map,
        color: stringToColor(item.map || 'unknown'),
        startTime: item.time,
        endTime: item.time,
        players: item.players
      };
    } else {
      currentSegment.endTime = item.time;
      currentSegment.players = item.players;
    }
  }
  if (currentSegment) segments.push(currentSegment);
  
  // Общая длительность
  const totalTime = segments.reduce((sum, s) => {
    const start = new Date(s.startTime).getTime();
    const end = new Date(s.endTime).getTime();
    return sum + (end - start);
  }, 0) || 1;
  
  // Рендер сегментов
  bar.innerHTML = segments.map(seg => {
    const start = new Date(seg.startTime).getTime();
    const end = new Date(seg.endTime).getTime();
    const duration = (end - start) || 60000; // минимум 1 минута
    const width = Math.max((duration / totalTime) * 100, 0.5);
    const colorOpaque = stringToColor(seg.map || 'unknown', 0.75);
    
    const startTime = new Date(seg.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const endTime = new Date(seg.endTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const durationMin = Math.round(duration / 60000);
    
    // Показываем label только если сегмент достаточно широкий
    const showLabel = width > 3;
    
    return `
      <div class="maps-bar-segment" style="width: ${width}%; background: ${colorOpaque}">
        ${showLabel ? `<span class="map-label">${seg.map || '?'}</span>` : ''}
        <div class="tooltip">
          <div class="map-name">${seg.map || 'Unknown'}</div>
          <div class="map-time">${startTime} - ${endTime} (${durationMin} мин)</div>
          <div class="map-players">👥 ${seg.players}</div>
        </div>
      </div>
    `;
  }).join('');
  
  // Метки времени
  const firstTime = new Date(history[0].time);
  const lastTime = new Date(history[history.length - 1].time);
  labels.innerHTML = `
    <span>${firstTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
    <span>${lastTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
  `;
}

function updateCurrentPlayers() {
  const container = document.getElementById('players-list');
  if (!container || !selectedServer) return;
  
  const key = getKey(selectedServer);
  const data = currentData[key];
  
  if (!data || !data.clients || data.clients.length === 0) {
    container.innerHTML = '<span class="players-empty">Нет игроков онлайн</span>';
    return;
  }
  
  container.innerHTML = data.clients.map(client => {
    const initial = (client.name || '?').charAt(0).toUpperCase();
    return `
      <div class="player-badge">
        <span class="p-avatar">${initial}</span>
        <span class="p-name">${escapeHtml(client.name)}</span>
        ${client.clan ? `<span class="p-clan">[${escapeHtml(client.clan)}]</span>` : ''}
      </div>
    `;
  }).join('');
}

function updateMapsBar(history) {
  const bar = document.getElementById('maps-bar');
  const labels = document.getElementById('maps-bar-labels');
  if (!bar || !labels || history.length === 0) return;
  
  // Группируем последовательные записи с одинаковой картой
  const segments = [];
  let currentSegment = null;
  
  for (const item of history) {
    if (!currentSegment || currentSegment.map !== item.map) {
      if (currentSegment) segments.push(currentSegment);
      currentSegment = {
        map: item.map,
        color: stringToColor(item.map || 'unknown'),
        startTime: item.time,
        endTime: item.time,
        players: item.players
      };
    } else {
      currentSegment.endTime = item.time;
      currentSegment.players = item.players;
    }
  }
  if (currentSegment) segments.push(currentSegment);
  
  // Общая длительность
  const totalTime = segments.reduce((sum, s) => {
    const start = new Date(s.startTime).getTime();
    const end = new Date(s.endTime).getTime();
    return sum + (end - start);
  }, 0) || 1;
  
  // Рендер сегментов
  bar.innerHTML = segments.map(seg => {
    const start = new Date(seg.startTime).getTime();
    const end = new Date(seg.endTime).getTime();
    const duration = (end - start) || 60000; // минимум 1 минута
    const width = Math.max((duration / totalTime) * 100, 0.5);
    const colorOpaque = stringToColor(seg.map || 'unknown', 0.75);
    
    const startTime = new Date(seg.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const endTime = new Date(seg.endTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const durationMin = Math.round(duration / 60000);
    
    // Показываем label только если сегмент достаточно широкий
    const showLabel = width > 3;
    
    return `
      <div class="maps-bar-segment" style="width: ${width}%; background: ${colorOpaque}">
        ${showLabel ? `<span class="map-label">${seg.map || '?'}</span>` : ''}
        <div class="tooltip">
          <div class="map-name">${seg.map || 'Unknown'}</div>
          <div class="map-time">${startTime} - ${endTime} (${durationMin} мин)</div>
          <div class="map-players">👥 ${seg.players}</div>
        </div>
      </div>
    `;
  }).join('');
  
  // Метки времени
  const firstTime = new Date(history[0].time);
  const lastTime = new Date(history[history.length - 1].time);
  labels.innerHTML = `
    <span>${firstTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
    <span>${lastTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
  `;
}

async function updateTopPlayers() {
  try {
    const top = await loadTopPlayers();
    const container = document.getElementById('top-players-list');
    
    if (top.length === 0) {
      container.innerHTML = '<div class="loading">Нет данных</div>';
      return;
    }
    
    container.innerHTML = top.map((player, index) => {
      const rank = index + 1;
      const multiplier = Math.floor(player.playTime / 60) + 1;
      
      return `
        <div class="top-player">
          <span class="rank top-${Math.min(rank, 3)}">${rank}</span>
          <div class="name">${escapeHtml(player.name)}${player.clan ? `<span class="clan">[${escapeHtml(player.clan)}]</span>` : ''}</div>
          <span class="multiplier">×${multiplier}</span>
          <span class="score">${player.playTime}</span>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('Ошибка загрузки топа:', e);
  }
}

async function updateTopMaps() {
  try {
    const top = await loadTopMaps();
    const container = document.getElementById('maps-list');
    
    if (!container || top.length === 0) {
      if (container) container.innerHTML = '<div class="loading">Нет данных</div>';
      return;
    }
    
    container.innerHTML = top.map((map, index) => {
      const rank = index + 1;
      const uniqueCount = map.uniquePlayers || 0;
      
      return `
        <div class="map-item">
          <span class="map-rank top-${Math.min(rank, 3)}">${rank}</span>
          <span class="map-name">${escapeHtml(map.name)}</span>
          <span class="map-players">👥 ${uniqueCount}</span>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('Ошибка загрузки топ карт:', e);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function updateHeader() {
  const now = new Date();
  document.getElementById('last-update').textContent =
    `Обновлено: ${now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

async function init() {
  try {
    await loadServers();
    await loadCurrent();
    await loadHistory();
    
    renderServerSelect();
    updateChart();
    updateTopPlayers();
    updateTopMaps();
    updateHeader();
  } catch (e) {
    console.error('Ошибка инициализации:', e);
    document.querySelector('.charts-section').innerHTML = 
      '<div class="error">Ошибка загрузки данных</div>';
  }
}

init();

setInterval(async () => {
  try {
    await loadCurrent();
    await loadHistory();
    renderServerSelect();
    updateChart();
    updateTopPlayers();
    updateTopMaps();
    updateHeader();
  } catch (e) {
    console.error('Ошибка обновления:', e);
  }
}, 60 * 1000);
