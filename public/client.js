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

const penBtn = document.getElementById('penBtn');
const lineBtn = document.getElementById('lineBtn');
const rectBtn = document.getElementById('rectBtn');
const circleBtn = document.getElementById('circleBtn');
const fillBtn = document.getElementById('fillBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

let myName = '';
let myRoom = '';
let isDrawer = false;
let currentColor = '#000000';
let isDrawing = false;
let isEraser = false;
let lastX = 0, lastY = 0;
let currentTool = 'pen';
let startX = 0, startY = 0;
let snapshot = null;
let undoStack = [];
let redoStack = [];

// ============ الموسيقى ============
const musicBtn = document.getElementById('musicBtn');
const musicVolume = document.getElementById('musicVolume');
const musicSelect = document.getElementById('musicSelect');
const musicPanel = document.getElementById('musicPanel');
let musicAudio = null;
let musicPlaying = false;
let isHost = false;
const DEFAULT_TRACK = 'dl.mp3';

function initMusic(track) {
  if (musicAudio) { musicAudio.pause(); musicAudio = null; }
  const src = track || DEFAULT_TRACK;
  musicAudio = new Audio('/music/' + src);
  musicAudio.loop = true;
  musicAudio.volume = (musicVolume?.value || 50) / 100;
}

function playMusic() {
  if (!musicAudio) initMusic();
  musicAudio.play().then(() => {
    musicPlaying = true;
    if (musicBtn) {
      musicBtn.textContent = '🔇 إيقاف';
      musicBtn.classList.add('on');
    }
  }).catch(err => console.error('❌ الموسيقى:', err));
}

function stopMusic() {
  if (musicAudio) {
    musicAudio.pause();
    musicPlaying = false;
    if (musicBtn) {
      musicBtn.textContent = '🎵 تشغيل';
      musicBtn.classList.remove('on');
    }
  }
}

// ============ الدخول ============
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
  setTimeout(() => { initMusic(); playMusic(); }, 500);
};

// ============ اللاعبين ============
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

  if (players.length > 0) {
    isHost = players[0].id === socket.id;
    if (musicPanel) {
      musicPanel.style.opacity = isHost ? '1' : '0.4';
      musicPanel.style.pointerEvents = isHost ? 'auto' : 'none';
    }
  }
});

// ============ الكلمة ============
socket.on('your-word', (word, logo) => {
  wordHint.innerHTML = `✏️ ارسم: ${word}`;
  wordHint.style.color = '#2ecc71';
  wordHint.style.fontWeight = 'bold';
  isDrawer = true;
  toolbar.style.opacity = '1';
  toolbar.style.pointerEvents = 'auto';
  if (logo) showLogo(logo);
});

function showLogo(url) {
  const img = document.getElementById('logoPreview');
  if (!img) return;
  img.src = url;
  img.style.display = 'inline-block';
  img.onerror = () => { img.style.display = 'none'; };
}

function hideLogo() {
  const img = document.getElementById('logoPreview');
  if (img) img.style.display = 'none';
}

socket.on('word-length', (len) => {
  wordHint.textContent = `الكلمة: ${'_ '.repeat(len)} (${len} حروف)`;
  wordHint.style.color = '#fff';
  wordHint.style.fontWeight = 'normal';
  hideLogo();
});

// ============ التايمر ============
socket.on('timer', (t) => {
  timerDisplay.textContent = `⏰ ${t}`;
  timerDisplay.style.color = t <= 10 ? '#e74c3c' : '#f39c12';
});

// ============ الشات ============
socket.on('system-message', (msg) => addChat(msg, 'system'));
socket.on('chat', ({ name, text }) => addChat(`${name}: ${text}`));
socket.on('chat-message', ({ name, text }) => addChat(`${name}: ${text}`));

function addChat(text, cls = '') {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function sendMessage() {
  const text = guessInput.value.trim();
  if (!text) return;
  if (isDrawer) socket.emit('chat-message', text);
  else socket.emit('guess', text);
  guessInput.value = '';
}
guessBtn.onclick = sendMessage;
guessInput.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };

// ============ الرسم ============
socket.on('clear-canvas', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  undoStack = [];
  redoStack = [];
});

socket.on('draw', (data) => {
  drawLine(data.x0, data.y0, data.x1, data.y1, data.color, data.size);
});

socket.on('draw-shape', (data) => {
  drawPreviewShape(data.x0, data.y0, data.x1, data.y1, data.color, data.size, data.type);
});

socket.on('draw-image', (dataArray) => {
  const imgData = new ImageData(new Uint8ClampedArray(dataArray), canvas.width, canvas.height);
  ctx.putImageData(imgData, 0, 0);
});

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const newWidth = Math.round(rect.width * dpr);
  const newHeight = Math.round(rect.height * dpr);
  if (canvas.width === newWidth && canvas.height === newHeight) return;
  canvas.width = newWidth;
  canvas.height = newHeight;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height
  };
}

function drawLine(x0, y0, x1, y1, color, size) {
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.beginPath();
  ctx.moveTo(x0 * w, y0 * h);
  ctx.lineTo(x1 * w, y1 * h);
  ctx.stroke();
}

function saveSnapshot() {
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function restoreSnapshot(data) {
  ctx.putImageData(data, 0, 0);
}

// ============ أدوات ============
function selectTool(tool) {
  currentTool = tool;
  isEraser = false;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('on'));
  if (tool === 'pen' && penBtn) penBtn.classList.add('on');
  if (tool === 'line' && lineBtn) lineBtn.classList.add('on');
  if (tool === 'rect' && rectBtn) rectBtn.classList.add('on');
  if (tool === 'circle' && circleBtn) circleBtn.classList.add('on');
  if (tool === 'fill' && fillBtn) fillBtn.classList.add('on');
}

if (penBtn) penBtn.onclick = () => selectTool('pen');
if (lineBtn) lineBtn.onclick = () => selectTool('line');
if (rectBtn) rectBtn.onclick = () => selectTool('rect');
if (circleBtn) circleBtn.onclick = () => selectTool('circle');
if (fillBtn) fillBtn.onclick = () => selectTool('fill');

function pushUndo() {
  undoStack.push(saveSnapshot());
  redoStack = [];
  if (undoStack.length > 20) undoStack.shift();
}

if (undoBtn) {
  undoBtn.onclick = () => {
    if (!isDrawer) return;
    if (undoStack.length === 0) return;
    redoStack.push(saveSnapshot());
    const prev = undoStack.pop();
    restoreSnapshot(prev);
    socket.emit('clear-canvas');
    socket.emit('draw-image', Array.from(prev.data));
  };
}

if (redoBtn) {
  redoBtn.onclick = () => {
    if (!isDrawer) return;
    if (redoStack.length === 0) return;
    undoStack.push(saveSnapshot());
    const next = redoStack.pop();
    restoreSnapshot(next);
    socket.emit('clear-canvas');
    socket.emit('draw-image', Array.from(next.data));
  };
}

function drawPreviewShape(x0, y0, x1, y1, color, size, type) {
  const t = type || currentTool;
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  if (t === 'line') {
    ctx.beginPath();
    ctx.moveTo(x0 * w, y0 * h);
    ctx.lineTo(x1 * w, y1 * h);
    ctx.stroke();
  } else if (t === 'rect') {
    ctx.beginPath();
    ctx.rect(x0 * w, y0 * h, (x1 - x0) * w, (y1 - y0) * h);
    ctx.stroke();
  } else if (t === 'circle') {
    const cx = ((x0 + x1) / 2) * w;
    const cy = ((y0 + y1) / 2) * h;
    const rx = Math.abs((x1 - x0) / 2) * w;
    const ry = Math.abs((y1 - y0) / 2) * h;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ============ Fill ============
function floodFill(x, y, fillColor) {
  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const targetRGB = getPixel(data, w, x, y);
  const fillRGB = hexToRgb(fillColor);
  if (colorsMatch(targetRGB, fillRGB)) return;
  const stack = [[x, y]];
  const visited = new Set();
  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    const key = cx + ',' + cy;
    if (visited.has(key)) continue;
    visited.add(key);
    if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
    const current = getPixel(data, w, cx, cy);
    if (!colorsMatch(current, targetRGB)) continue;
    setPixel(data, w, cx, cy, fillRGB);
    stack.push([cx + 1, cy]);
    stack.push([cx - 1, cy]);
    stack.push([cx, cy + 1]);
    stack.push([cx, cy - 1]);
  }
  ctx.putImageData(imageData, 0, 0);
}

function getPixel(data, w, x, y) {
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

function setPixel(data, w, x, y, rgb) {
  const i = (y * w + x) * 4;
  data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
}

function colorsMatch(a, b) {
  return Math.abs(a[0] - b[0]) < 30 && Math.abs(a[1] - b[1]) < 30 && Math.abs(a[2] - b[2]) < 30;
}

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ];
}

// ============ أحداث ============
function startDraw(e) {
  if (!isDrawer) return;
  e.preventDefault();
  const p = getPos(e);
  startX = p.x; startY = p.y;
  lastX = p.x; lastY = p.y;
  isDrawing = true;
  pushUndo();

  if (currentTool === 'fill') {
    const px = Math.floor(p.x * canvas.width);
    const py = Math.floor(p.y * canvas.height);
    floodFill(px, py, isEraser ? '#ffffff' : currentColor);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    socket.emit('draw-image', Array.from(imgData.data));
    isDrawing = false;
    return;
  }

  if (['line', 'rect', 'circle'].includes(currentTool)) {
    snapshot = saveSnapshot();
  }
}

function moveDraw(e) {
  if (!isDrawing || !isDrawer) return;
  e.preventDefault();
  const p = getPos(e);
  const color = isEraser ? '#ffffff' : currentColor;
  const size = isEraser ? 30 : parseInt(brushSize.value);

  if (currentTool === 'pen') {
    const data = { x0: lastX, y0: lastY, x1: p.x, y1: p.y, color, size };
    drawLine(data.x0, data.y0, data.x1, data.y1, color, size);
    socket.emit('draw', data);
    lastX = p.x; lastY = p.y;
  } else if (['line', 'rect', 'circle'].includes(currentTool)) {
    restoreSnapshot(snapshot);
    drawPreviewShape(startX, startY, p.x, p.y, color, size, currentTool);
  }
}

function endDraw(e) {
  if (!isDrawing || !isDrawer) return;
  const p = getPos(e);
  const color = isEraser ? '#ffffff' : currentColor;
  const size = isEraser ? 30 : parseInt(brushSize.value);

  if (['line', 'rect', 'circle'].includes(currentTool)) {
    socket.emit('draw-shape', {
      type: currentTool,
      x0: startX, y0: startY,
      x1: p.x, y1: p.y,
      color, size
    });
  }
  isDrawing = false;
}

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
  if (isEraser) {
    currentTool = 'pen';
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('on'));
    eraserBtn.classList.add('on');
  }
};

clearBtn.onclick = () => {
  if (!isDrawer) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  undoStack = [];
  redoStack = [];
  socket.emit('clear-canvas');
};

// ============ المايك ============
let peer = null;
let localStream = null;
let calls = {};
let pendingPeers = new Set();
let myPeerId = null;
const micBtn = document.getElementById('micBtn');
const micStatus = document.getElementById('micStatus');

micBtn.onclick = async () => {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
    Object.values(calls).forEach(c => c.close());
    calls = {};
    pendingPeers.clear();
    if (peer) peer.destroy();
    peer = null;
    myPeerId = null;
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

    myPeerId = 'u' + socket.id.replace(/[^a-zA-Z0-9]/g, '');
    peer = new Peer(myPeerId, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
          { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
        ]
      }
    });

    peer.on('open', (id) => {
      socket.emit('mic-on', id);
      pendingPeers.forEach((pid) => {
        if (calls[pid]) return;
        const call = peer.call(pid, localStream);
        call.on('stream', (rs) => playAudio(pid, rs));
        calls[pid] = call;
      });
      pendingPeers.clear();
    });

    peer.on('call', (call) => {
      call.answer(localStream);
      call.on('stream', (rs) => playAudio(call.peer, rs));
      calls[call.peer] = call;
    });

    peer.on('error', (err) => console.error('Peer error:', err));
  } catch (err) {
    alert('ما قدرناش ناخدو المايك: ' + err.message);
  }
};

socket.on('peer-mic-on', (pid) => {
  if (!peer || !localStream) { pendingPeers.add(pid); return; }
  if (calls[pid]) return;
  const call = peer.call(pid, localStream);
  call.on('stream', (rs) => playAudio(pid, rs));
  calls[pid] = call;
});

socket.on('peer-mic-off', (pid) => {
  if (calls[pid]) { calls[pid].close(); delete calls[pid]; }
  pendingPeers.delete(pid);
  const audio = document.getElementById('audio-' + pid);
  if (audio) audio.remove();
});

function playAudio(pid, stream) {
  let audio = document.getElementById('audio-' + pid);
  if (!audio) {
    audio = document.createElement('audio');
    audio.id = 'audio-' + pid;
    audio.autoplay = true;
    audio.playsInline = true;
    document.body.appendChild(audio);
  }
  audio.srcObject = stream;
  audio.play().catch(e => console.log('audio play error:', e));
}

// ============ أزرار الموسيقى ============
if (musicBtn) {
  musicBtn.onclick = () => {
    if (!isHost) return;
    if (musicPlaying) { stopMusic(); socket.emit('music-pause'); }
    else { playMusic(); socket.emit('music-play', { track: musicSelect?.value || DEFAULT_TRACK }); }
  };
}

if (musicVolume) {
  musicVolume.oninput = () => {
    const vol = musicVolume.value;
    if (musicAudio) musicAudio.volume = vol / 100;
    if (isHost) socket.emit('music-volume', vol);
  };
}

if (musicSelect) {
  musicSelect.onchange = () => {
    if (!isHost) return;
    const track = musicSelect.value;
    if (musicAudio) musicAudio.pause();
    initMusic(track);
    if (musicPlaying) playMusic();
    socket.emit('music-track', track);
    socket.emit('music-play', { track });
  };
}

socket.on('music-play', (d) => { if (isHost) return; initMusic(d.track); playMusic(); });
socket.on('music-pause', () => { if (isHost) return; stopMusic(); });
socket.on('music-volume', (v) => { if (isHost) return; if (musicAudio) musicAudio.volume = v / 100; if (musicVolume) musicVolume.value = v; });
socket.on('music-track', (t) => { if (isHost) return; if (musicAudio) musicAudio.pause(); initMusic(t); });

// ============ Resize ============
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => { setTimeout(resizeCanvas, 300); });