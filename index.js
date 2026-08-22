const mineflayer = require('mineflayer');
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Бот активен'));
app.listen(process.env.PORT || 3000);

const bot = mineflayer.createBot({
  host: 'tc.vanilla-box.ru', 
  port: 25565,       
  username: 'root',
  version: '1.21.1',
  auth: 'offline'
});

const getRandom = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Функция микродвижений (Анти-АФК)
function performMicroMovements() {
  if (!bot.entity) return;
  const actions = ['forward', 'back', 'left', 'right', 'jump'];
  const randomAction = actions[Math.floor(Math.random() * actions.length)];
  
  bot.setControlState(randomAction, true);
  setTimeout(() => bot.setControlState(randomAction, false), getRandom(200, 500));

  const yaw = (Math.random() * Math.PI * 2) - Math.PI;
  const pitch = (Math.random() * Math.PI / 2) - Math.PI / 4;
  bot.look(yaw, pitch, true);

  setTimeout(performMicroMovements, getRandom(15000, 45000));
}

// УМНАЯ АВТОРИЗАЦИЯ: бот слушает чат комнаты авторизации
bot.on('message', (jsonMsg) => {
  const message = jsonMsg.toString();
  console.log(`[СЕРВЕР]: ${message}`);

  // Если сервер просит войти (/login) или зарегистрироваться (/register)
  if (message.includes('/login') || message.includes('войти') || message.includes('Авторизуйтесь')) {
    setTimeout(() => {
      bot.chat('/login 311986511');
      console.log('[СИСТЕМА] Отправлен пароль авторизации!');
    }, 1000); // Микро-пауза 1 секунда, чтобы сервер успел принять команду
  }
});

bot.on('spawn', () => {
  console.log(`[СИСТЕМА] Бот ${bot.username} подключился к сети!`);
  // Включаем микродвижения только через 7 секунд (после успешного логина)
  setTimeout(performMicroMovements, 7000);
});

// Управление от других игроков через ЛС
bot.on('whisper', (username, message) => {
  if (message.startsWith('!cmd ')) {
    const command = message.replace('!cmd ', '');
    bot.chat(command); 
    bot.whisper(username, `Выполнено: ${command}`);
  }
});

bot.on('kick', (reason) => console.log(`[КИК] Отключен: ${reason}`));
bot.on('error', (err) => console.log(`[ОШИБКА] Сбой: ${err}`));
bot.on('end', () => {
  console.log('[СИСТЕМА] Переподключение через 15 секунд...');
  setTimeout(() => process.exit(1), 15000); 
});
