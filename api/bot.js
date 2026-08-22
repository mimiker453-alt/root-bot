const mineflayer = require('mineflayer');
const Groq = require('groq-sdk');
const axios = require('axios');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = async (req, res) => {
  // ---------- Состояние сессии ----------
  const state = {
    bot: null,
    mode: 'standard',           // 'standard' | 'wise' | 'toxic'
    mutedUntil: 0,              // timestamp, до которого бот молчит
    messageTimestamps: [],      // анти-DDoS: время последних сообщений
    karma: {},                  // username -> { violations, ignoreUntil }
    memory: {},                 // username -> последнее сообщение (max 100 симв.)
    quitRequested: false,
    timeout: null,
  };

  // ---------- Создание бота ----------
  const bot = mineflayer.createBot({
    host: 'tc.vanilla-box.ru',          // <-- ОБНОВЛЕНО
    port: 25565,
    username: 'root',
    auth: 'offline',
    // version: '1.20.4', // при необходимости укажите точную версию сервера
  });
  state.bot = bot;

  // ---------- Промис завершения сессии ----------
  const botSessionPromise = new Promise((resolve) => {
    let resolved = false;
    const finish = (reason) => {
      if (!resolved) {
        resolved = true;
        console.log(`[BOT] Session finished: ${reason}`);
        try { bot.quit(); } catch (e) {}
        resolve();
      }
    };

    // Обработчики жизненного цикла
    bot.on('error', (err) => {
      console.error('[BOT] Error:', err);
      finish('error');
    });
    bot.on('end', (reason) => {
      console.log('[BOT] End:', reason);
      finish('end');
    });
    bot.on('kicked', (reason) => {
      console.log('[BOT] Kicked:', reason);
      finish('kicked');
    });

    // Автологин и приветствие
    bot.on('login', () => {
      console.log('[BOT] Logged in');
      bot.chat('/login 311986511');   // <-- ОБНОВЛЕНО
      setTimeout(() => {
        try { bot.whisper('_Effective_', 'успешно запущен'); } catch (e) {}
      }, 2000);
    });

    // Таймер автоотключения
    state.timeout = setTimeout(() => finish('timeout'), 50000);

    // Обработка входящих сообщений
    bot.on('whisper', (username, message) => handleMessage(username, message, true));
    bot.on('chat', (username, message) => handleMessage(username, message, false));
  });

  // ---------- Обработка сообщений ----------
  async function handleMessage(username, message, isWhisper) {
    try {
      const now = Date.now();

      // Игнорируем сообщения от самого бота
      if (username === bot.username) return;

      // Команды оператора всегда обрабатываем, даже если мут
      const isOperator = username === '_Effective_';
      const operatorCommand = isOperator && (
        message.includes('рут лив') ||
        message.includes('рут, выполни команду') ||
        message.includes('рут режим')
      );

      // Анти-DDoS мут
      if (now < state.mutedUntil && !operatorCommand) {
        return;
      }

      // Обновляем метки времени
      state.messageTimestamps.push(now);
      state.messageTimestamps = state.messageTimestamps.filter(t => now - t < 2000);
      if (state.messageTimestamps.length >= 4) {
        state.mutedUntil = now + 120000;
        state.messageTimestamps = [];
        const muteMsg = 'Слишком много сообщений, я временно замолкаю.';
        if (isWhisper) {
          bot.whisper(username, muteMsg);
        } else {
          bot.chat(`@${username} ${muteMsg}`);
        }
        return;
      }

      // Лимит длины
      if (message.length > 120) {
        const longMsg = 'Сообщение слишком длинное (максимум 120 символов).';
        if (isWhisper) {
          bot.whisper(username, longMsg);
        } else {
          bot.chat(`@${username} ${longMsg}`);
        }
        return;
      }

      // Обновляем краткосрочную память
      state.memory[username] = message.slice(0, 100);

      // Карма и игнор (кроме оператора)
      if (!isOperator) {
        const karma = state.karma[username];
        if (karma && now < karma.ignoreUntil) {
          return; // игнорируем
        }

        const badWords = ['бля', 'хуй', 'пизда', 'ебать', 'сука', 'нах', 'гандон', 'мразь', 'пидор', 'лох'];
        const beggingWords = ['дай', 'подари', 'нужны', 'хочу алмазов', 'бесплатно', 'дайте ресурсы', 'помогите с ресурсами'];
        const lowerMsg = message.toLowerCase();
        const hasBad = badWords.some(w => lowerMsg.includes(w));
        const hasBegging = beggingWords.some(w => lowerMsg.includes(w));

        if (hasBad || hasBegging) {
          if (!karma) state.karma[username] = { violations: 0, ignoreUntil: 0 };
          const userKarma = state.karma[username];
          userKarma.violations += 1;

          if (userKarma.violations >= 2) {
            userKarma.ignoreUntil = now + 3600000;
            const banMsg = 'Ты нарушил правила чата, я игнорирую тебя на 1 час.';
            if (isWhisper) bot.whisper(username, banMsg);
            else bot.chat(`@${username} ${banMsg}`);
            return;
          } else {
            const warnMsg = 'Предупреждение: не используй мат или попрошайничество.';
            if (isWhisper) bot.whisper(username, warnMsg);
            else bot.chat(`@${username} ${warnMsg}`);
            return;
          }
        }
      }

      // Команды оператора
      if (isOperator) {
        // Экстренное тушение
        if (message.includes('рут лив')) {
          state.quitRequested = true;
          bot.quit();
          return;
        }

        // Выполнение команды
        if (message.includes('рут, выполни команду')) {
          const command = message.split('рут, выполни команду')[1].trim();
          if (command) {
            bot.chat(command);
          } else {
            bot.whisper(username, 'Укажи команду после фразы.');
          }
          return;
        }

        // Переключение режима
        if (message.includes('рут режим')) {
          const modeStr = message.split('рут режим')[1].trim().toLowerCase();
          if (modeStr.includes('стандарт') || modeStr.includes('standard')) {
            state.mode = 'standard';
            bot.whisper(username, 'Режим переключен на «стандарт». Буду вежливым и полезным.');
          } else if (modeStr.includes('мудрец') || modeStr.includes('wise') || modeStr.includes('мудрость')) {
            state.mode = 'wise';
            bot.whisper(username, 'Режим переключен на «мудрец». Древняя мудрость снизошла на меня.');
          } else if (modeStr.includes('токсик') || modeStr.includes('toxic')) {
            state.mode = 'toxic';
            bot.whisper(username, 'Режим переключен на «токсик». Приготовься к язвительным комментариям, нубик.');
          } else {
            bot.whisper(username, 'Неизвестный режим. Доступны: стандарт, мудрец, токсик.');
          }
          return;
        }
        // Если оператор пишет что-то другое — можно обработать как обычное сообщение,
        // но по условию только команды, поэтому здесь завершаем.
        return;
      }

      // Умное алиби
      if (message.toLowerCase().includes('ты тут?')) {
        const delay = 1500 + Math.random() * 1500; // 1.5–3 сек
        setTimeout(() => {
          const reply = 'да тут я, чай наливал...';
          if (isWhisper) bot.whisper(username, reply);
          else bot.chat(`@${username} ${reply}`);
        }, delay);
        return;
      }

      // Функция "Где я"
      if (/(где я|координаты|где нахожусь|мои координаты)/i.test(message)) {
        const coords = await getPlayerCoordinates(username);
        await generateAndSendResponse(username, message, isWhisper, { type: 'where', coords });
        return;
      }

      // Функция "Слухи"
      const popularWords = [
        'алмаз', 'алмазов', 'дом', 'pvp', 'пвп', 'грифер', 'гриферство',
        'клад', 'сундук', 'житель', 'ферма', 'шахта', 'эндер', 'дракон',
        'визер', 'незерит', 'обсидиан', 'редстоун', 'механизм', 'портал'
      ];
      const lowerMsg = message.toLowerCase();
      const foundWord = popularWords.find(w => lowerMsg.includes(w));
      if (foundWord) {
        if (Math.random() < 0.7) {
          await generateAndSendResponse(username, message, isWhisper, { type: 'rumor', word: foundWord });
          return;
        }
      }

      // Обычный ответ
      await generateAndSendResponse(username, message, isWhisper, { type: 'normal' });
    } catch (error) {
      console.error('[BOT] handleMessage error:', error);
      // Не логируем лишнего, чтобы не спамить
    }
  }

  // ---------- Генерация ответа через Groq ----------
  async function generateAndSendResponse(username, userMessage, isWhisper, options = {}) {
    const { type = 'normal', coords = null, word = null } = options;
    let systemPrompt = '';
    let userPrompt = `Игрок ${username} написал: "${userMessage}"\n`;

    // Режимы
    if (state.mode === 'standard') {
      systemPrompt = 'Ты — дружелюбный бот на Minecraft сервере. Отвечай вежливо, кратко, не более 2 предложений.';
    } else if (state.mode === 'wise') {
      systemPrompt = 'Ты — древнекитайский философ, говоришь мудрыми афоризмами, загадками, метафорами. Отвечай кратко, но глубокомысленно.';
    } else if (state.mode === 'toxic') {
      systemPrompt = 'Ты — язвительный тролль в Minecraft. Называй игроков нубиками, издевайся, но не переходи границы (без мата). Отвечай кратко и ехидно.';
    }

    // Дополнение по типу
    if (type === 'where') {
      if (coords) {
        userPrompt += `Координаты игрока: X=${coords.x}, Y=${coords.y}, Z=${coords.z}. Оформи красиво, напомни про правила привата медным блоком (см. wiki.vanilla-box.ru).`;
      } else {
        userPrompt += `Координаты не найдены. Скажи, что не можешь получить координаты, но можно посмотреть на карте vanilla-box.ru.`;
      }
    } else if (type === 'rumor') {
      userPrompt += `В чате прозвучало слово "${word}". Придумай короткую сплетню (1-2 предложения) на эту тему.`;
    }

    try {
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        model: 'llama-3.3-70b-versatile',   // быстрая и достаточно умная модель
        max_tokens: 150,
        temperature: 0.7,
      });
      let aiText = chatCompletion.choices[0]?.message?.content?.trim() || 'Не могу ответить.';

      // Хард-фильтр стоп-слов
      const stopWords = ['groq', 'llama', 'vercel', 'render', 'openai', 'gpt', 'api key', 'модель', 'нейросеть', 'бот'];
      const lowerAI = aiText.toLowerCase();
      if (stopWords.some(w => lowerAI.includes(w))) {
        aiText = 'Я не знаю таких слов, загляни лучше на wiki.vanilla-box.ru';
      }

      // Реклама только в режиме "Слухи"
      if (type === 'rumor' && Math.random() < 0.3) {
        aiText += ' [ADS] Здесь может быть ваша реклама! Пишите коммерческие предложения оператору _Effective_ на почту: mimiker453@gmail.com';
      }

      // Отправка ответа
      if (isWhisper) {
        bot.whisper(username, aiText);
      } else {
        bot.chat(`@${username} ${aiText}`);
      }
    } catch (error) {
      console.error('[BOT] Groq error:', error);
      const fallback = 'Произошла ошибка, попробуй позже.';
      if (isWhisper) bot.whisper(username, fallback);
      else bot.chat(`@${username} ${fallback}`);
    }
  }

  // ---------- Получение координат игрока ----------
  async function getPlayerCoordinates(username) {
    try {
      // ЗАМЕНИТЕ URL, ЕСЛИ ИНТЕРАКТИВНАЯ КАРТА ТЕПЕРЬ НА ДРУГОМ ДОМЕНЕ
      // Например: https://tc.vanilla-box.ru/map/players.json
      const response = await axios.get('https://vanilla-box.ru/map/players.json', { timeout: 3000 });
      const data = response.data;

      if (Array.isArray(data)) {
        const player = data.find(p => p.name === username);
        if (player) return { x: player.x, y: player.y, z: player.z };
      } else if (typeof data === 'object') {
        if (data[username]) {
          const p = data[username];
          if (p.x !== undefined && p.y !== undefined && p.z !== undefined) {
            return { x: p.x, y: p.y, z: p.z };
          }
          if (p.pos && p.pos.length >= 3) {
            return { x: p.pos[0], y: p.pos[1], z: p.pos[2] };
          }
        }
      }
      return null;
    } catch (error) {
      console.error('[BOT] Error fetching coords:', error.message);
      return null;
    }
  }

  // ---------- Запуск и ожидание завершения ----------
  try {
    await botSessionPromise;
    res.status(200).json({ status: 'ok', message: 'Bot session ended' });
  } catch (error) {
    console.error('[BOT] Fatal error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};
