const { Telegraf } = require('telegraf');

// Токен бота берём из переменной окружения BOT_TOKEN
const bot = new Telegraf(process.env.BOT_TOKEN);

// Команда /start — приветствие + кнопки
bot.start(async (ctx) => {
  await ctx.reply(
    'Привет! Я простой echo-бот.\n' +
    'Напиши мне любое сообщение — я повторю его.\n\n' +
    'Можешь попробовать кнопки ниже 👇',
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Показать время', callback_data: 'show_time' },
          ],
          [
            { text: 'Что ты умеешь?', callback_data: 'help' },
          ],
        ],
      },
    }
  );
});

// Обработка нажатия на кнопку "Показать время"
bot.action('show_time', async (ctx) => {
  const now = new Date();
  await ctx.answerCbQuery(); // убираем "часики" на кнопке
  await ctx.reply(`Сейчас: ${now.toLocaleString('ru-RU')}`);
});

// Обработка нажатия на кнопку "Что ты умеешь?"
bot.action('help', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    'Я повторяю твои сообщения (echo).\n' +
    'Команды:\n' +
    '/start — показать приветствие и кнопки\n' +
    'Кнопки под сообщением /start:\n' +
    '• "Показать время" — отправляю текущее время\n' +
    '• "Что ты умеешь?" — рассказываю о себе'
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

