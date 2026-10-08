const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const WORDS = [
  // كلمات عربية
  'قطة', 'كلب', 'شمس', 'قمر', 'بيت', 'شجرة', 'طوموبيل', 'كتاب',
  'طاولة', 'كرسي', 'باب', 'شباك', 'بحر', 'جبل', 'مطار', 'طائرة',
  'قطار', 'مفتاح', 'ساعة', 'نظارة', 'حوت', 'تفاحة', 'موز', 'بيتزا',
  'قهوة', 'حلوى', 'وردة', 'نجمة', 'سحابة', 'مطر', 'ثلج', 'خبز',
  // أسماء الأولتراس
  'SHARK FAMILY',
  'CRAZY BOYS',
  'ULTRAS HERCULES',
  'ULTRAS MATADORES',
  'ULTRAS ASKARY',
  'ULTRAS RIVALS',
  'ULTRAS WINNERS',
  'ULTRAS GREEN BOYS',
  'ULTRAS EAGLES',
  'ULTRAS BRIGADE',
  'ULTRAS HELALA BOYS',
  'ULTRAS IMAZIGHEN',
  'ULTRAS RED MEN',
  'ULTRAS FATAL TIGERS',
  'ULTRAS DIMA DIMA',
  'ULTRAS CAP SOLEIL',
  'ULTRAS PHOBOS',
  'ULTRAS GHOST',
  'ULTRAS BLACK ARMY',
  'ULTRAS VIRAGE',
  'ULTRAS LIBERTY',
  'ULTRAS MAGANA',
  'ULTRAS GREEN GLADIATORS'
];

// ============ البوت ============
const BOT_NAMES = ['🤖 روبو', '🤖 بوت', '🤖 آلي'];
const BOT_ID_PREFIX = 'BOT_';

let botCounter = 0;

function isBot(id) {
  return id && id.startsWith(BOT_ID_PREFIX);
}

const rooms = {};

function randomWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function broadcastPlayers(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const players = room.players.map(p => ({
    id: p.id,
    name: p.name,
    score: room.scores[p.id] || 0,
    isDrawer: p.id === room.drawerId
  }));
  io.to(roomId).emit('players', players);
}

function stopGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
  if (room.botGuessTimer) {
    clearTimeout(room.botGuessTimer);
    room.botGuessTimer = null;
  }
  if (room.botDrawTimer) {
    clearInterval(room.botDrawTimer);
    room.botDrawTimer = null;
  }
  room.drawerId = null;
  room.currentWord = null;
  broadcastPlayers(roomId);
}

// ============ إضافة البوت ============
function addBot(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.players.find(p => isBot(p.id))) return;

  botCounter++;
  const botId = BOT_ID_PREFIX + botCounter;
  const botName = BOT_NAMES[botCounter % BOT_NAMES.length];

  room.players.push({ id: botId, name: botName });
  room.scores[botId] = 0;

  io.to(roomId).emit('system-message', `🤖 ${botName} دخل للغرفة`);
  broadcastPlayers(roomId);

  if (room.players.length >= 2 && !room.timer) {
    startRound(roomId);
  }
}

// ============ حذف البوت ============
function removeBot(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const bot = room.players.find(p => isBot(p.id));
  if (!bot) return;

  room.players = room.players.filter(p => !isBot(p.id));
  delete room.scores[bot.id];

  io.to(roomId).emit('system-message', `🤖 ${bot.name} خرج`);
  broadcastPlayers(roomId);

  if (room.drawerId === bot.id) {
    if (room.timer) {
      clearInterval(room.timer);
      room.timer = null;
    }
    startRound(roomId);
  }
}

// ============ رسم البوت ============
function botDraw(roomId, word) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.drawerId !== room.players.find(p => isBot(p.id))?.id) return;

  const shapes = getShapesForWord(word);
  let step = 0;

  if (room.botDrawTimer) clearInterval(room.botDrawTimer);

  room.botDrawTimer = setInterval(() => {
    if (step >= shapes.length) {
      clearInterval(room.botDrawTimer);
      room.botDrawTimer = null;
      return;
    }

    const line = shapes[step];
    io.to(roomId).emit('draw', line);
    step++;
  }, 300);
}

// ============ أشكال البوت (بالنسب 0-1) ============
function getShapesForWord(word) {
  const lines = [];

  const addLine = (x0, y0, x1, y1, color = '#000', size = 4) => {
    lines.push({ x0, y0, x1, y1, color, size });
  };

  // إحداثيات نسبية (0-1) — كتخدم على جميع الشاشات
  const cx = 0.5, cy = 0.5;

  // إطار (مربع)
  addLine(cx - 0.15, cy - 0.15, cx + 0.15, cy - 0.15);
  addLine(cx + 0.15, cy - 0.15, cx + 0.15, cy + 0.15);
  addLine(cx + 0.15, cy + 0.15, cx - 0.15, cy + 0.15);
  addLine(cx - 0.15, cy + 0.15, cx - 0.15, cy - 0.15);

  // عيون
  addLine(cx - 0.05, cy - 0.05, cx - 0.05, cy);
  addLine(cx + 0.05, cy - 0.05, cx + 0.05, cy);

  // فم
  addLine(cx - 0.05, cy + 0.07, cx + 0.05, cy + 0.07);

  // خط إضافي إلا كانت الكلمة طويلة
  if (word.length > 3) {
    addLine(cx - 0.12, cy + 0.13, cx + 0.12, cy + 0.13, '#6c5ce7', 3);
  }

  return lines;
}

// ============ تخمين البوت ============
function scheduleBotGuess(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const bot = room.players.find(p => isBot(p.id));
  if (!bot) return;
  if (room.drawerId === bot.id) return;

  const delay = 3000 + Math.random() * 7000;

  if (room.botGuessTimer) clearTimeout(room.botGuessTimer);

  room.botGuessTimer = setTimeout(() => {
    const room = rooms[roomId];
    if (!room || !room.currentWord) return;
    if (room.drawerId === bot.id) return;
    if (room.guessedThisRound.includes(bot.id)) return;

    const willGuessCorrect = Math.random() < 0.7;

    if (willGuessCorrect) {
      const word = room.currentWord;
      room.guessedThisRound.push(bot.id);
      const bonus = Math.max(10, room.timeLeft);
      room.scores[bot.id] = (room.scores[bot.id] || 0) + bonus;
      io.to(roomId).emit('chat', { name: bot.name, text: word, id: bot.id });
      io.to(roomId).emit('system-message', `🎉 ${bot.name} خمن الكلمة! (+${bonus})`);
      broadcastPlayers(roomId);

      const guessers = room.players.filter(p => p.id !== room.drawerId);
      if (room.guessedThisRound.length >= guessers.length) {
        clearInterval(room.timer);
        room.timer = null;
        io.to(roomId).emit('system-message', `✅ الكلمة كانت: ${room.currentWord}`);
        setTimeout(() => startRound(roomId), 3000);
      }
    } else {
      const wrongGuesses = ['ما عرفت', 'شي حاجة', 'صعبة', '؟؟؟'];
      const wrong = wrongGuesses[Math.floor(Math.random() * wrongGuesses.length)];
      io.to(roomId).emit('chat', { name: bot.name, text: wrong, id: bot.id });
    }
  }, delay);
}

function startRound(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  if (room.players.length < 2) {
    stopGame(roomId);
    io.to(roomId).emit('system-message', '⏸️ اللعبة موقفة — خاصنا على الأقل 2 لاعبين');
    return;
  }

  room.round = (room.round || 0) + 1;
  const idx = room.round % room.players.length;
  room.drawerId = room.players[idx].id;
  room.currentWord = randomWord();
  room.guessedThisRound = [];

  io.to(roomId).emit('clear-canvas');
  io.to(roomId).emit('word-length', room.currentWord.length);
  io.to(room.drawerId).emit('your-word', room.currentWord);

  broadcastPlayers(roomId);
  io.to(roomId).emit('system-message', `✏️ دور ${room.players[idx].name} يرسم!`);

  if (isBot(room.drawerId)) {
    setTimeout(() => botDraw(roomId, room.currentWord), 1000);
  } else {
    scheduleBotGuess(roomId);
  }

  if (room.timer) clearInterval(room.timer);
  room.timeLeft = 80;
  io.to(roomId).emit('timer', room.timeLeft);
  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(roomId).emit('timer', room.timeLeft);
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      io.to(roomId).emit('system-message', `⏰ الوقت سالا! الكلمة كانت: ${room.currentWord}`);
      setTimeout(() => startRound(roomId), 3000);
    }
  }, 1000);
}

io.on('connection', (socket) => {
  console.log('✅ متصل:', socket.id);

  socket.on('join-room', ({ roomId, name }) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = { players: [], scores: {}, round: 0, timer: null };
    }
    const room = rooms[roomId];

    const existing = room.players.find(p => p.name === name);
    if (existing) {
      socket.emit('system-message', '⚠️ هاد السميّة مستعملة، اختار وحدة أخرى');
      return;
    }

    room.players.push({ id: socket.id, name });
    room.scores[socket.id] = 0;
    socket.data.roomId = roomId;
    socket.data.name = name;

    io.to(roomId).emit('system-message', `👋 ${name} دخل للغرفة`);
    broadcastPlayers(roomId);

    const realPlayers = room.players.filter(p => !isBot(p.id));
    if (realPlayers.length >= 2) {
      removeBot(roomId);
    }

    if (room.players.length >= 2 && !room.timer) {
      startRound(roomId);
    }
  });

  socket.on('draw', (data) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('draw', data);
  });

  socket.on('clear-canvas', () => {
    const roomId = socket.data.roomId;
    if (roomId) socket.to(roomId).emit('clear-canvas');
  });

  socket.on('chat-message', (text) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    if (!text || text.length > 200) return;
    io.to(roomId).emit('chat-message', {
      name: socket.data.name,
      text: text
    });
  });

  socket.on('guess', (text) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room || !room.currentWord) return;
    if (socket.id === room.drawerId) return;
    if (room.guessedThisRound.includes(socket.id)) return;

    io.to(roomId).emit('chat', { name: socket.data.name, text, id: socket.id });

    if (text.trim() === room.currentWord) {
      room.guessedThisRound.push(socket.id);
      const bonus = Math.max(10, room.timeLeft);
      room.scores[socket.id] = (room.scores[socket.id] || 0) + bonus;
      io.to(roomId).emit('system-message', `🎉 ${socket.data.name} خمن الكلمة! (+${bonus})`);
      broadcastPlayers(roomId);

      const guessers = room.players.filter(p => p.id !== room.drawerId);
      if (room.guessedThisRound.length >= guessers.length) {
        clearInterval(room.timer);
        room.timer = null;
        io.to(roomId).emit('system-message', `✅ الكلمة كانت: ${room.currentWord}`);
        setTimeout(() => startRound(roomId), 3000);
      }
    }
  });

  socket.on('add-bot', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    addBot(roomId);
  });

  socket.on('mic-on', (peerId) => {
    socket.to(socket.data.roomId).emit('peer-mic-on', peerId);
  });

  socket.on('mic-off', () => {
    socket.to(socket.data.roomId).emit('peer-mic-off', socket.id);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];
    room.players = room.players.filter(p => p.id !== socket.id);
    delete room.scores[socket.id];
    io.to(roomId).emit('system-message', `👋 ${socket.data.name} خرج`);
    broadcastPlayers(roomId);

    const realPlayers = room.players.filter(p => !isBot(p.id));
    if (realPlayers.length === 1 && !room.players.find(p => isBot(p.id))) {
      setTimeout(() => addBot(roomId), 1000);
    }

    if (realPlayers.length < 1) {
      stopGame(roomId);
    }

    if (room.players.length === 0) {
      if (room.timer) clearInterval(room.timer);
      if (room.botGuessTimer) clearTimeout(room.botGuessTimer);
      if (room.botDrawTimer) clearInterval(room.botDrawTimer);
      delete rooms[roomId];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 السيرفر خدام على المنفذ ${PORT}`);
});