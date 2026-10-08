const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ============ الكلمات ============
const NORMAL_WORDS = [
  'قطة', 'كلب', 'شمس', 'قمر', 'بيت', 'شجرة', 'طوموبيل', 'كتاب',
  'طاولة', 'كرسي', 'باب', 'شباك', 'بحر', 'جبل', 'مطار', 'طائرة',
  'قطار', 'مفتاح', 'ساعة', 'نظارة', 'حوت', 'تفاحة', 'موز', 'بيتزا',
  'قهوة', 'حلوى', 'وردة', 'نجمة', 'سحابة', 'مطر', 'ثلج', 'خبز'
];

const ULTRAS_WORDS = [
  { name: 'SHARK FAMILY', logo: '/ultras/ULTRAS SHARK FAMILY.png' },
  { name: 'CRAZY BOYS', logo: '/ultras/CRAZY BOYS.jpg' },
  { name: 'ULTRAS HERCULES', logo: '/ultras/ULTRAS HERCULES.jpg' },
  { name: 'ULTRAS MATADORES', logo: '/ultras/ULTRAS MATADORES.jpg' },
  { name: 'ULTRAS ASKARY', logo: '/ultras/ULTRAS ASKARY.jpg' },
  { name: 'ULTRAS WINNERS', logo: '/ultras/ULTRAS WINNERS.jpg' },
  { name: 'ULTRAS GREEN BOYS', logo: '/ultras/ULTRAS GREEN BOYS.jpg' },
  { name: 'ULTRAS EAGLES', logo: '/ultras/ULTRAS EAGLES.jpg' },
  { name: 'ULTRAS BRIGADE', logo: '/ultras/ULTRAS BRIGADE.jpg' },
  { name: 'ULTRAS HELALA BOYS', logo: '/ultras/ULTRAS HELALA BOYS.jpg' },
  { name: 'ULTRAS IMAZIGHEN', logo: '/ultras/ULTRAS IMAZEGHEN.png' },
  { name: 'ULTRAS RED MEN', logo: '/ultras/ULTRAS RED MEN.jpg' },
  { name: 'ULTRAS FATAL TIGERS', logo: '/ultras/ULTRAS FATAL TIGERS.webp' },
  { name: 'ULTRAS CAP SOLEIL', logo: '/ultras/ULTRAS CAP SOLEIL.png' },
  { name: 'ULTRAS GHOST', logo: '/ultras/ULTRAS GHOST.jpg' },
  { name: 'ULTRAS BLACK ARMY', logo: '/ultras/ULTRAS BLACK ARMY.webp' },
  { name: 'ULTRAS MAGANA', logo: '/ultras/ULTRAS MAGANA.jpg' }
];
const rooms = {};

// اختيار الكلمة: تناوب بين عادية وأولتراس
function randomWord(roomId) {
  // 50% عادية، 50% أولتراس — بلا تناوب
  if (Math.random() < 0.5) {
    return {
      word: NORMAL_WORDS[Math.floor(Math.random() * NORMAL_WORDS.length)],
      logo: null
    };
  } else {
    const item = ULTRAS_WORDS[Math.floor(Math.random() * ULTRAS_WORDS.length)];
    return { word: item.name, logo: item.logo };
  }
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
  room.drawerId = null;
  room.currentWord = null;
  room.currentLogo = null;
  broadcastPlayers(roomId);
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

  const wordData = randomWord(roomId);
  room.currentWord = wordData.word;
  room.currentLogo = wordData.logo;
  room.guessedThisRound = [];

  io.to(roomId).emit('clear-canvas');
  io.to(roomId).emit('word-length', room.currentWord.length);
  io.to(room.drawerId).emit('your-word', room.currentWord, room.currentLogo);

  broadcastPlayers(roomId);
  io.to(roomId).emit('system-message', `✏️ دور ${room.players[idx].name} يرسم!`);

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

    if (room.players.length < 2 && room.timer) {
      stopGame(roomId);
    }

    if (room.players.length === 0) {
      if (room.timer) clearInterval(room.timer);
      delete rooms[roomId];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 السيرفر خدام على المنفذ ${PORT}`);
});