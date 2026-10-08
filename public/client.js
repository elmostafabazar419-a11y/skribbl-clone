const socket = io();

const login = document.getElementById('login');
const game = document.getElementById('game');
const joinBtn = document.getElementById('joinBtn');
const nameInput = document.getElementById('nameInput');
const roomInput = document.getElementById('roomInput');
const roomCodeEl = document.getElementById('roomCode');
const timerDisplay = document.getElementById('timerDisplay');
const wordHint = document.getElementById('wordHint');
const playerList = document.getElementById('playerList');
const chatBox = document.getElementById('chatBox');
const guessInput = document.getElementById('guessInput');
const guessBtn = document.getElementById('guessBtn');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('clearBtn');
const eraserBtn = document.getElementById('eraserBtn');
const brushSize = document.getElementById('brushSize');
const toolbar = document.getElementById('toolbar');

let myName = '';
let myRoom = '';
let isDrawer = false;
let currentColor = '#000000';
let isDrawing = false;
let isEraser = false;
let lastX = 0, lastY = 0;

joinBtn.onclick = () => {
  const name = nameInput.value.trim();
  const room = roomInput.value.trim();
  if (!name || !room) return alert('عمر السميّة والكود!');
  myName = name;
  myRoom = room;
  socket.emit('join-room', { roomId: room, name });
  login.style.display = 'none';
  game.style.display = 'flex';
  roomCodeEl.textContent = room;
  setTimeout(resizeCanvas, 100);
};

socket.on('players', (players) => {
  playerList.innerHTML = '';
  let iAmDrawer = false;
  players.forEach(p => {
    const li = document.createElement('li');
    li.className = p.isDrawer ? 'drawer' : '';
    li.innerHTML = `<span>${p.isDrawer ? '✏️ ' : ''}${p.name}</span><span>${p.score} نقطة</span>`;
    if (p.id === socket.id) {
      li.style.border = '2px solid #f39c12';
      iAmDrawer = p.isDrawer;
    }
    playerList.appendChild(li);
  });

  isDrawer = iAmDrawer;
  toolbar.style.opacity = isDrawer ? '1' : '0.3';
  toolbar.style.pointerEvents = isDrawer ? 'auto' : 'none';
});

socket.on('your-word', (word) => {
  wordHint.textContent = `✏️ ارسم: ${word}`;
  wordHint.style.color = '#2ecc71';
  wordHint.style.fontWeight = 'bold';
  isDrawer = true;
  toolbar.style.opacity = '1';
  toolbar.style.pointerEvents = 'auto';
});

socket.on('word-length', (len) => {
  wordHint.textContent = `الكلمة: ${'_ '.repeat(len)} (${len} حروف)`;
  wordHint.style.color = '#fff';
  wordHint.style.fontWeight = 'normal';
});

socket.on('timer', (t) => {
  timerDisplay.textContent = `⏰ ${t}`;
  timerDisplay.style.color = t <= 10 ? '#e74c3c' : '#f39c12';
});

socket.on('system-message', (msg) => {
  addChat(msg, 'system');
});

socket.on('chat', ({ name, text }) => {
  addChat(`${name}: ${text}`);
});

socket.on('clear-canvas', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

socket.on('draw', (data) => {
  drawLine(data.x0, data.y0, data.x1, data.y1, data.color, data.size);
});

function addChat(text, cls = '') {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function sendGuess() {
  const text = guessInput.value.trim();
  if (!text) return;
  if (isDrawer) {
    alert('نتا كترسم، ما تقدرش تخمن!');
    return;
  }
  socket.emit('guess', text);
  guessInput.value = '';
}
guessBtn.onclick = sendGuess;
guessInput.onkeypress = (e) => { if (e.key === 'Enter') sendGuess(); };

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  return { x: x * (canvas.width / rect.width), y: y * (canvas.height / rect.height) };
}

function drawLine(x0, y0, x1, y1, color, size) {
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function startDraw(e) {
  if (!isDrawer) return;
  e.preventDefault();
  isDrawing = true;
  const p = getPos(e);
  lastX = p.x; lastY = p.y;
}

function moveDraw(e) {
  if (!isDrawing || !isDrawer) return;
  e.preventDefault();
  const p = getPos(e);
  const color = isEraser ? '#ffffff' : currentColor;
  const size = isEraser ? 30 : parseInt(brushSize.value);
  drawLine(lastX, lastY, p.x, p.y, color, size);
  socket.emit('draw', { x0: lastX, y0: lastY, x1: p.x, y1: p.y, color, size });
  lastX = p.x; lastY = p.y;
}

function endDraw() { isDrawing = false; }

canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mousemove', moveDraw);
canvas.addEventListener('mouseup', endDraw);
canvas.addEventListener('mouseleave', endDraw);
canvas.addEventListener('touchstart', startDraw);
canvas.addEventListener('touchmove', moveDraw);
canvas.addEventListener('touchend', endDraw);

document.querySelectorAll('.color').forEach(btn => {
  btn.onclick = () => {
    currentColor = btn.dataset.color;
    isEraser = false;
    eraserBtn.classList.remove('on');
  };
});

eraserBtn.onclick = () => {
  isEraser = !isEraser;
  eraserBtn.classList.toggle('on', isEraser);
};

clearBtn.onclick = () => {
  if (!isDrawer) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  socket.emit('clear-canvas');
};

// ============ المايك ============
let peer = null;
let localStream = null;
let calls = {};
const micBtn = document.getElementById('micBtn');
const micStatus = document.getElementById('micStatus');

micBtn.onclick = async () => {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
    Object.values(calls).forEach(c => c.close());
    calls = {};
    if (peer) peer.destroy();
    peer = null;
    micBtn.textContent = '🎤 تشغيل المايك';
    micBtn.classList.remove('on');
    micStatus.textContent = 'المايك مطفي';
    socket.emit('mic-off');
    return;
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micBtn.textContent = '🔇 طفي المايك';
    micBtn.classList.add('on');
    micStatus.textContent = 'المايك خدام';

    peer = new Peer(socket.id, {
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    peer.on('open', (id) => {
      socket.emit('mic-on', id);
    });

    peer.on('call', (call) => {
      call.answer(localStream);
      call.on('stream', (remoteStream) => playAudio(call.peer, remoteStream));
      calls[call.peer] = call;
    });

    peer.on('error', (err) => console.error('Peer error:', err));
  } catch (err) {
    alert('ما قدرناش ناخدو المايك: ' + err.message);
  }
};

socket.on('peer-mic-on', (peerId) => {
  if (!peer || !localStream) return;
  if (calls[peerId]) return;
  const call = peer.call(peerId, localStream);
  call.on('stream', (remoteStream) => playAudio(peerId, remoteStream));
  calls[peerId] = call;
});

socket.on('peer-mic-off', (peerId) => {
  if (calls[peerId]) {
    calls[peerId].close();
    delete calls[peerId];
  }
  const audio = document.getElementById('audio-' + peerId);
  if (audio) audio.remove();
});

function playAudio(peerId, stream) {
  let audio = document.getElementById('audio-' + peerId);
  if (!audio) {
    audio = document.createElement('audio');
    audio.id = 'audio-' + peerId;
    audio.autoplay = true;
    document.body.appendChild(audio);
  }
  audio.srcObject = stream;
}

window.addEventListener('resize', resizeCanvas);