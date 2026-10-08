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

// ============ الموسيقى ============
const musicBtn = document.getElementById('musicBtn');
const musicVolume = document.getElementById('musicVolume');
const musicSelect = document.getElementById('musicSelect');
const musicPanel = document.getElementById('musicPanel');
let musicAudio = null;
let musicPlaying = false;
let isHost = false;
const DEFAULT_TRACK = 'song1.mp3';

function initMusic(track) {
  if (musicAudio) {
    musicAudio.pause();
    musicAudio = null;
  }
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
  }).catch(err => {
    console.error('❌ الموسيقى ما خدمتش:', err);
  });
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

  // شغل الموسيقى أوتوماتيكياً
  setTimeout(() => {
    initMusic();
    playMusic();
  }, 500);
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

  // حدد host
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
  img.onerror = () => {
    console.error('❌ اللوغو ما تحملش:', url);
    img.style.display = 'none';
  };
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
socket.on('system-message', (msg) => {
  addChat(msg, 'system');
});

socket.on('chat', ({ name, text }) => {
  addChat(`${name}: ${text}`);
});

socket.on('chat-message', ({ name, text }) => {
  addChat(`${name}: ${text}`);
});

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

  if (isDrawer) {
    socket.emit('chat-message', text);
  } else {
    socket.emit('guess', text);
  }
  guessInput.value = '';
}
guessBtn.onclick = sendMessage;
guessInput.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };

// ============ الرسم ============
socket.on('clear-canvas', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

socket.on('draw', (data) => {
  drawLine(data.x0, data.y0, data.x1, data.y1, data.color, data.size);
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
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  return { x, y };
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

  const data = {
    x0: lastX,
    y0: lastY,
    x1: p.x,
    y1: p.y,
    color,
    size
  };

  drawLine(data.x0, data.y0, data.x1, data.y1, color, size);
  socket.emit('draw', data);

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
let pendingPeers = new Set();
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
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          }
        ]
      }
    });

    peer.on('open', (id) => {
      socket.emit('mic-on', id);
      pendingPeers.forEach((peerId) => {
        if (calls[peerId]) return;
        const call = peer.call(peerId, localStream);
        call.on('stream', (remoteStream) => playAudio(peerId, remoteStream));
        calls[peerId] = call;
      });
      pendingPeers.clear();
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
  if (!peer || !localStream) {
    pendingPeers.add(peerId);
    return;
  }
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
  pendingPeers.delete(peerId);
  const audio = document.getElementById('audio-' + peerId);
  if (audio) audio.remove();
});

function playAudio(peerId, stream) {
  let audio = document.getElementById('audio-' + peerId);
  if (!audio) {
    audio = document.createElement('audio');
    audio.id = 'audio-' + peerId;
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
    if (musicPlaying) {
      stopMusic();
      socket.emit('music-pause');
    } else {
      playMusic();
      socket.emit('music-play', { track: musicSelect?.value || DEFAULT_TRACK });
    }
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

socket.on('music-play', (data) => {
  if (isHost) return;
  initMusic(data.track);
  playMusic();
});

socket.on('music-pause', () => {
  if (isHost) return;
  stopMusic();
});

socket.on('music-volume', (vol) => {
  if (isHost) return;
  if (musicAudio) musicAudio.volume = vol / 100;
  if (musicVolume) musicVolume.value = vol;
});

socket.on('music-track', (track) => {
  if (isHost) return;
  if (musicAudio) musicAudio.pause();
  initMusic(track);
});

// ============ Resize ============
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => {
  setTimeout(resizeCanvas, 300);
});