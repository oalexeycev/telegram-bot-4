# Telegram Bot 4 — минимальный бот на Vercel

Минимальный echo‑бот на основе [Telegraf](https://www.npmjs.com/package/telegraf) и serverless‑функции Vercel.

## Локальная установка

1. Установить зависимости:

```bash
npm install
```

2. (Опционально) Создать файл `.env.local` и добавить:

```bash
BOT_TOKEN=ваш_токен_бота
```

3. Для разработки через Vercel CLI:

```bash
npm install -g vercel
vercel dev
```

## Деплой на Vercel

1. Закоммитить и запушить репозиторий на GitHub.
2. Зайти в Vercel → Import Git Repository → выбрать этот репозиторий.
3. В **Environment Variables** добавить:
   - `BOT_TOKEN = ваш_токен_бота`
4. Дождаться деплоя. Адрес будет вида:

```
https://project-name.username.vercel.app
```

Webhook URL для Telegram:

```
https://project-name.username.vercel.app/api/webhook
```

## Установка webhook в Telegram

Подставьте свои значения и выполните в терминале:

```bash
curl -X POST https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook \
  -H "Content-type: application/json" \
  -d '{"url": "https://project-name.username.vercel.app/api/webhook"}'
```

В ответ должно прийти:

```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

