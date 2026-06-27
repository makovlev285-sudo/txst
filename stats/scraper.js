const dgram = require('dgram');

// DDNet серверы для мониторинга
// Формат: { name: 'имя', host: 'ip:port' }
const SERVERS = [
  { name: 'ru1.texnonik.ddnet', host: '185.14.205.78:8300' },
  { name: 'ru2.texnonik.ddnet', host: '185.14.205.78:8301' },
  { name: 'ru3.texnonik.ddnet', host: '185.14.205.78:8302' },
];

// Хранилище истории: { serverKey: { time: timestamp, players: count, map: string }[] }
const history = {};
const MAX_HISTORY = 1440; // 24 часа * 60 минут

// DDNet UDP query protocol
function createQueryPacket() {
  // Qplay — стандартный запрос информации о сервере DDNet
  const payload = Buffer.from('\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00', 'binary');
  return payload;
}

function queryServer(host) {
  return new Promise((resolve) => {
    const client = dgram.createSocket('udp4');
    client.setTimeout(3000);

    const packet = createQueryPacket();
    const [ip, port] = host.split(':');

    client.send(packet, 0, packet.length, parseInt(port), ip, (err) => {
      if (err) {
        client.close();
        resolve(null);
        return;
      }
    });

    client.on('message', (msg) => {
      // Парсим ответ DDNet сервера
      const response = msg.toString('utf8', 0, 512);
      const players = extractPlayerCount(response);
      const map = extractMap(response);
      client.close();
      resolve({ players, map });
    });

    setTimeout(() => {
      client.close();
      resolve(null);
    }, 3000);
  });
}

function extractPlayerCount(response) {
  // DDNet отвечает в формате: \xff\x02\x00\x00players: X/Max\nmap: name\n...
  // Или: \xff\xff\xff\xff\x69\x6e\x66\x6f\x5f\x72\x65\x73\x70\x6f\x6e\x73\x65...
  // Ищем паттерн "players" в ответе
  
  // Вариант 1: "players: 10/20"
  const playersMatch = response.match(/players[:\s]+(\d+)/i);
  if (playersMatch) return parseInt(playersMatch[1]);

  // Вариант 2: из InfoResponse "\x69\x6e\x66\x6f\x5f\x72\x65\x73\x70\x6f\x6e\x73\x65"
  // Формат: gameinforesp\0port\08300\0hostname\0Server\0map\0mapname\0...
  // Ищем "players" или анализируем байты
  
  // Вариант 3: Qplay response формат
  const qplayMatch = response.match(/Qplay\s+(\d+)/i);
  if (qplayMatch) return parseInt(qplayMatch[1]);

  return 0;
}

function extractMap(response) {
  const mapMatch = response.match(/map[:\s]+([^\n\r]+)/i);
  if (mapMatch) return mapMatch[1].trim();

  // Из Qplay ответа
  const qplayMapMatch = response.match(/Qmap\s+([^\n\r]+)/i);
  if (qplayMapMatch) return qplayMapMatch[1].trim();

  return 'unknown';
}

async function pollAllServers() {
  const results = {};
  
  for (const server of SERVERS) {
    const key = server.host;
    try {
      const data = await queryServer(server.host);
      if (data) {
        results[key] = {
          name: server.name,
          host: server.host,
          players: data.players,
          map: data.map,
          timestamp: Date.now()
        };

        // Сохраняем в историю (минутные снимки)
        if (!history[key]) history[key] = [];
        history[key].push({
          time: Date.now(),
          players: data.players,
          map: data.map
        });

        // Ограничиваем историю 24 часами
        while (history[key].length > MAX_HISTORY) {
          history[key].shift();
        }

        console.log(`[${server.name}] Players: ${data.players}, Map: ${data.map}`);
      } else {
        console.log(`[${server.name}] No response`);
      }
    } catch (e) {
      console.error(`[${server.name}] Error: ${e.message}`);
    }
  }

  return results;
}

// Запускаем опрос каждую минуту
setInterval(() => {
  pollAllServers();
}, 60 * 1000);

// Первый опрос сразу
pollAllServers();

module.exports = { history, pollAllServers, SERVERS };
