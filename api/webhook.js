const { Telegraf } = require('telegraf');

// Простое "хранилище" задач Suno в памяти
// ключ: chatId, значение: { taskId, prompt, status, startedAt, audioUrl? }
const sunoTasks = new Map();

// Токен бота берём из переменной окружения BOT_TOKEN
const bot = new Telegraf(process.env.BOT_TOKEN);

// Команда /start — приветствие + кнопки
bot.start(async (ctx) => {
  await ctx.reply(
    'Привет! Я простой echo-бот.\n' +
    'Напиши мне любое сообщение — я повторю его.\n\n' +
    'Можешь попробовать кнопки ниже 👇\n\n' +
    'Также есть команда /song — сделаю для тебя короткий трек через Suno.',
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

// Команда /song — генерирует музыку через Suno API по текстовому описанию
bot.command('song', async (ctx) => {
  const apiKey = process.env.SUNO_API_KEY;
  if (!apiKey) {
    return ctx.reply(
      'Suno API пока не настроен. Добавь переменную окружения SUNO_API_KEY на Vercel.'
    );
  }

  const chatId = String(ctx.chat.id);
  const existingTask = sunoTasks.get(chatId);

  // Если уже есть незавершённая задача в последние 5 минут — не запускаем новую,
  // чтобы не плодить одинаковые генерации и не тратить кредиты.
  if (
    existingTask &&
    existingTask.status === 'PENDING' &&
    Date.now() - existingTask.startedAt < 5 * 60 * 1000
  ) {
    return ctx.reply(
      'У тебя уже генерируется песня, я не запускаю новую, чтобы не тратить кредиты.\n' +
      'Подожди ещё немного и напиши /song_status — я проверю, готов ли трек.'
    );
  }

  // Текст после команды /song считаем промптом
  const fullText = ctx.message.text || '';
  const prompt = fullText.replace(/^\/song(@\w+)?\s*/i, '');

  if (!prompt) {
    return ctx.reply(
      'Напиши промпт после команды.\n\n' +
      'Пример:\n' +
      '/song весёлая песня про кота, который учится программировать'
    );
  }

  await ctx.reply(
    'Генерирую песню через Suno API. Обычно это занимает немного времени...\n' +
    'Если я вдруг не успею дождаться внутри одного запроса, ты можешь позже написать /song_status — я проверю готовность трека, не запуская новую генерацию.'
  );

  try {
    const waitMessages = [
      'Я пишу вступление, это займёт ещё немного времени...',
      'Подбираю аккорды и ритм, почти готово!',
      'Придумываю мелодию — осталось совсем чуть-чуть.',
      'Шлифую звук, чтобы всё звучало красиво.',
      'Добавляю немного магии в припев.',
      'Сведу трек и отправлю тебе, не уходи!',
      'Проверяю качество трека перед отправкой.',
      'Ещё пару секунд — музыка уже почти готова.',
      'Финальные штрихи... скоро заиграет 🎶',
      'Вот-вот закончу, надеюсь, тебе понравится!',
    ];

    // 1. Запрос на генерацию музыки
    const generateRes = await fetch('https://api.sunoapi.org/api/v1/generate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        customMode: false,
        instrumental: false,
        model: 'V4_5ALL',
        // Suno API требует обязательный callBackUrl, даже если мы сами опрашиваем статус
        callBackUrl: 'https://example.com/callback',
      }),
    });

    const generateJson = await generateRes.json();

    if (generateJson.code !== 200 || !generateJson.data?.taskId) {
      console.error('Suno generate error:', generateJson);
      const msg = generateJson.msg || 'неизвестная ошибка';
      return ctx.reply(
        `Не удалось запустить генерацию песни.\nКод: ${generateJson.code}\nСообщение: ${msg}`
      );
    }

    const taskId = generateJson.data.taskId;

    sunoTasks.set(chatId, {
      taskId,
      prompt,
      status: 'PENDING',
      startedAt: Date.now(),
    });

    // 2. Ожидание готовности трека (простое опросивание статуса)
    let audioUrl = null;
    // Ждём до ~60 секунд (6 * 10с). Этого обычно достаточно,
    // чтобы получить stream URL, но не превышать лимиты Vercel.
    const maxAttempts = 6;
    let waitMsgIndex = 0;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10000));

      const statusRes = await fetch(
        `https://api.sunoapi.org/api/v1/generate/record-info?taskId=${encodeURIComponent(
          taskId
        )}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      const statusJson = await statusRes.json();

      if (statusJson.code !== 200 || !statusJson.data) {
        console.error('Suno status error:', statusJson);
        continue;
      }

      const status = statusJson.data.status;
      const tracks = statusJson.data.response?.data || [];

      // Если Suno уже вернул audio_url — считаем, что трек готов,
      // даже если статус ещё не финальный SUCCESS (например, TEXT_SUCCESS).
      if (tracks.length > 0 && tracks[0].audio_url) {
        audioUrl = tracks[0].audio_url;

        sunoTasks.set(chatId, {
          taskId,
          prompt,
          status: 'SUCCESS',
          startedAt: sunoTasks.get(chatId)?.startedAt || Date.now(),
          audioUrl,
        });
        break;
      }

      if (status === 'FAILED') {
        console.error('Suno task failed:', statusJson);
        sunoTasks.set(chatId, {
          taskId,
          prompt,
          status: 'FAILED',
          startedAt: sunoTasks.get(chatId)?.startedAt || Date.now(),
        });
        break;
      }

      // Каждые ~10 секунд шлём новое "ожидайте" сообщение,
      // пока трек ещё генерируется.
      if (waitMsgIndex < waitMessages.length) {
        try {
          await ctx.reply(waitMessages[waitMsgIndex]);
          waitMsgIndex += 1;
        } catch (e) {
          console.error('Error sending wait message:', e);
        }
      }
    }

    if (!audioUrl) {
      return ctx.reply(
        'Я не успел дождаться готовой песни (таймаут по ожиданию).\n' +
        'Я НЕ запускал новую генерацию, текущая всё ещё крутится на стороне Suno.\n' +
        'Через 1–2 минуты напиши /song_status — я проверю, готов ли трек.'
      );
    }

    await ctx.replyWithAudio(audioUrl, {
      caption: 'Готово! Вот твоя сгенерированная песня 🎵',
    });
  } catch (err) {
    console.error('Suno API error:', err);
    await ctx.reply('Во время обращения к Suno API произошла ошибка. Попробуй ещё раз позже.');
  }
});

// Команда /song_status — проверить статус последней генерации без запуска новой
bot.command('song_status', async (ctx) => {
  const apiKey = process.env.SUNO_API_KEY;
  if (!apiKey) {
    return ctx.reply(
      'Suno API пока не настроен. Добавь переменную окружения SUNO_API_KEY на Vercel.'
    );
  }

  const chatId = String(ctx.chat.id);
  const task = sunoTasks.get(chatId);

  if (!task) {
    return ctx.reply(
      'Я не нашёл последнюю задачу для генерации песни.\n' +
      'Сначала запусти /song с описанием, а потом зови /song_status.'
    );
  }

  // Если мы уже сохранили готовый audioUrl — просто отправим его
  if (task.status === 'SUCCESS' && task.audioUrl) {
    return ctx.replyWithAudio(task.audioUrl, {
      caption: 'Вот последняя сгенерированная песня 🎵',
    });
  }

  await ctx.reply('Проверяю статус генерации песни на Suno...');

  try {
    const statusRes = await fetch(
      `https://api.sunoapi.org/api/v1/generate/record-info?taskId=${encodeURIComponent(
        task.taskId
      )}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    const statusJson = await statusRes.json();

    if (statusJson.code !== 200 || !statusJson.data) {
      console.error('Suno status error (song_status):', statusJson);
      return ctx.reply(
        'Не удалось узнать статус генерации. Попробуй ещё раз чуть позже.'
      );
    }

    const status = statusJson.data.status;
    const tracks = statusJson.data.response?.data || [];
    const audioUrl = tracks.length > 0 ? tracks[0].audio_url : null;

    if (status === 'FAILED') {
      sunoTasks.set(chatId, {
        ...task,
        status: 'FAILED',
      });
      return ctx.reply(
        'Suno не смог сгенерировать песню для этой задачи. Попробуй запустить /song с другим промптом.'
      );
    }

    // Если уже есть audio_url — считаем, что трек готов, даже если статус,
    // например, TEXT_SUCCESS или другой промежуточный.
    if (audioUrl) {
      sunoTasks.set(chatId, {
        ...task,
        status: 'SUCCESS',
        audioUrl,
      });

      return ctx.replyWithAudio(audioUrl, {
        caption: 'Готово! Вот твоя сгенерированная песня 🎵',
      });
    }

    // Если статус уже SUCCESS, но ссылки нет — честно говорим, что это странная ситуация
    if (status === 'SUCCESS') {
      return ctx.reply(
        'Suno сообщил статус SUCCESS, но ещё не вернул ссылку на трек.\n' +
          'Скорее всего, аудио ещё докладывается на их стороне. Попробуй /song_status ещё раз через несколько секунд ' +
          'или посмотри задачу в личном кабинете Suno.'
      );
    }

    // Для всех остальных статусов считаем, что задача ещё в процессе генерации
    return ctx.reply(
      `Песня ещё в процессе генерации (статус Suno: ${status}). Подожди ещё немного ⏳`
    );
  } catch (err) {
    console.error('Suno API error (song_status):', err);
    return ctx.reply(
      'Во время запроса статуса в Suno API произошла ошибка. Попробуй ещё раз позже.'
    );
  }
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

