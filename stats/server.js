import express from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Загрузка списка серверов
const servers = JSON.parse(readFileSync(join(__dirname, 'servers.json'), 'utf-8'));

// История данных (24 часа = 1440 записей при обновлении раз в минуту)
const MAX_HISTORY = 1440;
let historyData = {};
let currentData = {};

// Статистика игроков
let playerStats = {};

// Статистика карт (сколько уникальных людей было на карте)
let mapStats = {};

// Загрузка истории из файла
const historyFile = join(__dirname, 'history.json');
const playerStatsFile = join(__dirname, 'playerstats.json');
if (existsSync(historyFile)) {
  try {
    historyData = JSON.parse(readFileSync(historyFile, 'utf-8'));
    console.log(`Загружено истории: ${Object.keys(historyData).length} серверов`);
  } catch (e) {
    console.error('Ошибка загрузки истории:', e.message);
  }
}
if (existsSync(playerStatsFile)) {
  try {
    playerStats = JSON.parse(readFileSync(playerStatsFile, 'utf-8'));
    console.log(`Загружено игроков: ${Object.keys(playerStats).length}`);
  } catch (e) {
    console.error('Ошибка загрузки статистики игроков:', e.message);
  }
}
const mapStatsFile = join(__dirname, 'mapstats.json');
if (existsSync(mapStatsFile)) {
  try {
    const loaded = JSON.parse(readFileSync(mapStatsFile, 'utf-8'));
    // Восстанавливаем playerNames из uniquePlayers
    for (const [mapName, data] of Object.entries(loaded)) {
      if (!data.playerNames || !Array.isArray(data.playerNames)) {
        data.playerNames = [];
      }
    }
    mapStats = loaded;
    console.log(`Загружено карт: ${Object.keys(mapStats).length}`);
  } catch (e) {
    console.error('Ошибка загрузки статистики карт:', e.message);
  }
}

// Инициализация истории для всех серверов
for (const server of servers) {
  const key = `${server.host}:${server.port}`;
  if (!historyData[key]) {
    historyData[key] = [];
  }
}

// Получение данных с API DDNet
async function fetchServerData() {
  try {
    const response = await fetch('https://master1.ddnet.org/ddnet/15/servers.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    const allServers = data.servers || [];
    
    const newData = {};
    const now = new Date().toISOString();
    
    for (const server of servers) {
      const key = `${server.host}:${server.port}`;
      const addr = `tw-0.6+udp://${server.host}:${server.port}`;
      
      // Поиск сервера в списке DDNet
      const found = allServers.find(s => 
        s.addresses && s.addresses.includes(addr)
      );
      
      if (found) {
        const info = found.info || {};
        const clients = info.clients || [];
        const players = clients.length;
        const map = info.map?.name || 'Unknown';
        
        newData[key] = {
          name: server.name,
          players,
          map,
          time: now,
          clients: clients.map(c => ({ name: c.name, clan: c.clan }))
        };
        
        // Добавление в историю
        if (!historyData[key]) historyData[key] = [];
        historyData[key].push({ time: now, players, map });
        
        // Ограничение истории
        if (historyData[key].length > MAX_HISTORY) {
          historyData[key] = historyData[key].slice(-MAX_HISTORY);
        }
        
        // Обновление статистики игроков
        for (const client of clients) {
          const playerName = client.name || 'Unknown';
          if (!playerStats[playerName]) {
            playerStats[playerName] = {
              name: playerName,
              clan: client.clan || '',
              playTime: 0,
              lastSeen: now
            };
          }
          playerStats[playerName].playTime += 1; // +1 минута
          playerStats[playerName].lastSeen = now;
          if (client.clan) playerStats[playerName].clan = client.clan;
        }
        
        // Обновление статистики карт
        if (!mapStats[map]) {
          mapStats[map] = {
            name: map,
            uniquePlayers: 0,
            playerNames: [],
            lastSeen: now
          };
        }
        // Убедимся что playerNames всегда массив
        if (!Array.isArray(mapStats[map].playerNames)) {
          mapStats[map].playerNames = [];
        }
        // Добавляем уникальных игроков
        for (const client of clients) {
          const playerName = client.name || 'Unknown';
          if (!mapStats[map].playerNames.includes(playerName)) {
            mapStats[map].playerNames.push(playerName);
          }
        }
        mapStats[map].uniquePlayers = mapStats[map].playerNames.length;
        mapStats[map].lastSeen = now;
      } else {
        // Сервер не найден (оффлайн)
        newData[key] = {
          name: server.name,
          players: 0,
          map: 'Offline',
          time: now,
          clients: []
        };
        
        if (!historyData[key]) historyData[key] = [];
        historyData[key].push({ time: now, players: 0, map: 'Offline' });
        
        if (historyData[key].length > MAX_HISTORY) {
          historyData[key] = historyData[key].slice(-MAX_HISTORY);
        }
      }
    }
    
    currentData = newData;
    
    // Сохранение истории и статистики игроков
    try {
      writeFileSync(historyFile, JSON.stringify(historyData, null, 2));
      writeFileSync(join(__dirname, 'playerstats.json'), JSON.stringify(playerStats, null, 2));
      writeFileSync(join(__dirname, 'mapstats.json'), JSON.stringify(mapStats, null, 2));
    } catch (e) {
      console.error('Ошибка сохранения:', e.message);
    }
    
    console.log(`Обновлено: ${Object.keys(newData).length} серверов, игроков: ${Object.keys(playerStats).length}`);
  } catch (e) {
    console.error('Ошибка получения данных:', e.message);
  }
}

// API эндпоинты
app.get('/api/servers', (req, res) => {
  res.json(servers);
});

app.get('/api/current', (req, res) => {
  res.json(currentData);
});

app.get('/api/history', (req, res) => {
  res.json(historyData);
});

app.get('/api/top-players', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const top = Object.values(playerStats)
    .sort((a, b) => b.playTime - a.playTime)
    .slice(0, limit);
  res.json(top);
});

app.get('/api/top-maps', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const top = Object.values(mapStats)
    .sort((a, b) => b.uniquePlayers - a.uniquePlayers)
    .slice(0, limit);
  res.json(top);
});

app.get('/api/stats/:serverId', (req, res) => {
  const server = servers.find(s => s.id === req.params.serverId);
  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }
  const key = `${server.host}:${server.port}`;
  res.json({
    server,
    current: currentData[key] || null,
    history: historyData[key] || []
  });
});

// Статика
app.use(express.static(join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Первое получение данных
console.log('Первое получение данных...');
fetchServerData();

// Обновление каждые 60 секунд
setInterval(fetchServerData, 60 * 1000);

app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
  console.log(`Серверов в списке: ${servers.length}`);
});
