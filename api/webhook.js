const { Telegraf } = require('telegraf');

// Токен бота берём из переменной окружения BOT_TOKEN
const bot = new Telegraf(process.env.BOT_TOKEN);

// Команда /start — приветствие и краткая подсказка
bot.start(async (ctx) => {
  await ctx.reply(
    'Привет! Я простой echo-бот.\n' +
    'Напиши мне любое сообщение — я повторю его.\n\n' +
    'Команды:\n' +
    '/start — показать это сообщение ещё раз'
  );
});

// Простой echo‑бот: отвечает тем же текстом на любые сообщения
bot.on('text', async (ctx) => {
  const text = ctx.message.text || '';
  await ctx.reply(`Эхо: ${text}`);
});

// Обработчик для Vercel serverless функции
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      const update = req.body;
      await bot.handleUpdate(update);
      return res.status(200).send('OK');
    } catch (err) {
      console.error('Error handling update', err);
      return res.status(500).send('Internal Server Error');
    }
  }

  // Для GET-запросов можно просто вернуть что-то простое —
  // полезно, чтобы проверить, что функция жива
  return res.status(200).send('Telegram bot is running');
};

