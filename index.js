const mineflayer = require('mineflayer');
const express = require('express');
const app = express();

// 1. Запуск веб-сервера для удержания онлайна 24/7
app.get('/', (req, res) => res.send('Бот работает без остановки!'));
app.listen(process.env.PORT || 3000, () => console.log('[СИСТЕМА] Веб-сервер успешно запущен'));

// 2. Инициализация подключения бота к Майнкрафту
const bot = mineflayer.createBot({
  host: process.env.SERVER_IP || 'IP_СЕРВЕРА', 
  port: parseInt(process.env.SERVER_PORT) || 25565,       
  username: process.env.BOT_NAME || 'Public_AFK_Bot',
  version: '1.21.11' // Автоопределение версии сервера
});

const getRandom = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// 3. Функция случайных микродвижений против Анти-АФК
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

// 4. Логика при успешном заходе на сервер
bot.on('spawn', () => {
  console.log(`[СИСТЕМА] Бот ${bot.username} успешно зашел на сервер Майнкрафт!`);
  
  // Автоматический ввод пароля (если на сервере нужна авторизация)
  if (process.env.BOT_PASSWORD) {
    setTimeout(() => {
      bot.chat(`/login ${process.env.BOT_PASSWORD}`);
      bot.chat(`/reg ${process.env.BOT_PASSWORD} ${process.env.BOT_PASSWORD}`);
    }, 3000);
  }
  // Запуск постоянных шевелений через 5 секунд
  setTimeout(performMicroMovements, 5000);
});

// 5. Управление командами от ЛЮБОГО игрока на сервере
bot.on('whisper', (username, message) => {
  if (message.startsWith('!cmd ')) {
    const command = message.replace('!cmd ', '');
    bot.chat(command); // Бот вводит команду на сервере
    bot.whisper(username, `Выполнено: ${command}`);
  }
});

// Вывод всего чата сервера в логи Render
bot.on('chat', (username, message) => console.log(`[ЧАТ] <${username}> ${message}`));
bot.on('kick', (reason) => console.log(`[КИК] Бот был отключен: ${reason}`));
bot.on('error', (err) => console.log(`[ОШИБКА] Произошел сбой: ${err}`));

// Автоматический перезаход, если сервер упал или перезагрузился
bot.on('end', () => {
  console.log('[СИСТЕМА] Соединение потеряно. Перезапуск процесса через 15 секунд...');
  setTimeout(() => process.exit(1), 15000); 
});
