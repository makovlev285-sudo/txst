# Texnonik Servers Stats

Статистика серверов texnonik для игры DDNet с графиками онлайна за 24 часа.

## Запуск

```bash
# Установка зависимостей
npm install

# Запуск сервера
npm start

# Режим разработки (авто-перезагрузка)
npm run dev
```

Сервер запустится на `http://localhost:3000`

## API

- `GET /api/servers` — список серверов
- `GET /api/current` — текущие данные (онлайн, карта)
- `GET /api/history` — история за 24 часа
- `GET /api/stats/:serverId` — полная статистика по серверу

## Структура

- `server.js` — бэкенд (Express)
- `servers.json` — конфигурация серверов
- `history.json` — история данных (создаётся автоматически)
- `public/` — фронтенд (HTML/CSS/JS + Chart.js)

## Данные

Данные о серверах берутся с официального API DDNet:
`https://master1.ddnet.org/ddnet/15/servers.json`

Обновление: раз в 60 секунд.
История хранится за последние 24 часа (1440 записей на сервер).
