const API_URL = window.BACKEND_URL || 'https://chat.lime-paranoid.workers.dev';
let ws = null;
let account = null; // { accountId, username, displayTag, color }
let sessionToken = localStorage.getItem('sessionToken') || null;

// ---- DOM ----
const authView = document.getElementById('auth-view');
const roomView = document.getElementById('room-view');
const chatView = document.getElementById('chat-view');

const authLoginBtn = document.getElementById('auth-login-btn');
const authRegisterBtn = document.getElementById('auth-register-btn');
const authUsernameInput = document.getElementById('auth-username-input');
const authPasswordInput = document.getElementById('auth-password-input');
const authHint = document.getElementById('auth-hint');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authError = document.getElementById('auth-error');

const accountDisplay = document.getElementById('account-display');
const logoutBtn = document.getElementById('logout-btn');
const deleteAccountBtn = document.getElementById('delete-account-btn');

const modeJoinBtn = document.getElementById('mode-join-btn');
const modeCreateBtn = document.getElementById('mode-create-btn');
const roomNumberInput = document.getElementById('room-number-input');
const roomPasswordInput = document.getElementById('room-password-input');
const createOnly = document.getElementById('create-only');
const roomNameInput = document.getElementById('room-name-input');
const newRoomPasswordInput = document.getElementById('new-room-password-input');
const joinBtn = document.getElementById('join-btn');
const createBtn = document.getElementById('create-btn');
const roomError = document.getElementById('room-error');

const leaveBtn = document.getElementById('leave-btn');
const roomNameDisplay = document.getElementById('room-name-display');
const roomNumberDisplay = document.getElementById('room-number-display');
const userCount = document.getElementById('user-count');
const messageArea = document.getElementById('message-area');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

// ---- Deterministic color, mirrors the server's algorithm, used so
// history-replayed messages (which don't carry a color from D1) still
// render in the correct consistent color per user. ----
const USER_COLORS = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080',
  '#e6beff', '#9a6324', '#800000', '#aaffc3', '#808000',
  '#ffd8b1', '#000075', '#ff4500', '#2e8b57', '#8b008b',
];
function colorForUserId(userId) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return USER_COLORS[hash % USER_COLORS.length];
}

// ---- Auth mode toggle ----
let authMode = 'login';
authLoginBtn.addEventListener('click', () => setAuthMode('login'));
authRegisterBtn.addEventListener('click', () => setAuthMode('register'));

function setAuthMode(m) {
  authMode = m;
  authError.textContent = '';
  if (m === 'login') {
    authLoginBtn.classList.add('mode-active');
    authRegisterBtn.classList.remove('mode-active');
    authSubmitBtn.textContent = 'Log In';
    authHint.textContent = '';
  } else {
    authRegisterBtn.classList.add('mode-active');
    authLoginBtn.classList.remove('mode-active');
    authSubmitBtn.textContent = 'Sign Up';
    authHint.textContent = 'Username: 3-20 chars, letters/numbers/underscore. Password: 8+ chars. There is no password recovery — store it safely.';
  }
}

authSubmitBtn.addEventListener('click', async () => {
  authError.textContent = '';
  const username = authUsernameInput.value.trim();
  const password = authPasswordInput.value;

  if (!username || !password) {
    authError.textContent = 'Username and password required';
    return;
  }

  authSubmitBtn.disabled = true;
  const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';

  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (res.status === 429) {
      authError.textContent = data.error || 'Too many attempts — please wait.';
    } else if (!res.ok || !data.success) {
      authError.textContent = data.error || 'Authentication failed';
    } else {
      sessionToken = data.sessionToken;
      localStorage.setItem('sessionToken', sessionToken);
      account = data.account;
      showRoomView();
    }
  } catch (err) {
    console.error('Auth error:', err);
    authError.textContent = 'Network error';
  } finally {
    authSubmitBtn.disabled = false;
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { 'X-Session-Token': sessionToken },
    });
  } catch {}
  localStorage.removeItem('sessionToken');
  sessionToken = null;
  account = null;
  showAuthView();
});

deleteAccountBtn.addEventListener('click', async () => {
  if (!confirm('Permanently delete your account? This cannot be undone. Your password cannot be recovered later either way, so make sure this is what you want.')) {
    return;
  }
  try {
    const res = await fetch(`${API_URL}/api/auth/account`, {
      method: 'DELETE',
      headers: { 'X-Session-Token': sessionToken },
    });
    const data = await res.json();
    if (data.success) {
      localStorage.removeItem('sessionToken');
      sessionToken = null;
      account = null;
      showAuthView();
    } else {
      alert(data.error || 'Failed to delete account');
    }
  } catch (err) {
    alert('Network error while deleting account');
  }
});

async function tryResumeSession() {
  if (!sessionToken) {
    showAuthView();
    return;
  }
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { 'X-Session-Token': sessionToken },
    });
    const data = await res.json();
    if (data.success) {
      account = data.account;
      showRoomView();
    } else {
      localStorage.removeItem('sessionToken');
      sessionToken = null;
      showAuthView();
    }
  } catch {
    showAuthView();
  }
}

function showAuthView() {
  authView.style.display = 'block';
  roomView.style.display = 'none';
  chatView.style.display = 'none';
  authUsernameInput.value = '';
  authPasswordInput.value = '';
  setAuthMode('login');
}

function showRoomView() {
  authView.style.display = 'none';
  roomView.style.display = 'block';
  chatView.style.display = 'none';
  accountDisplay.textContent = `${account.username}#${account.displayTag}`;
  setRoomMode('join');
}

// ---- Room join/create mode ----
let roomMode = 'join';
modeJoinBtn.addEventListener('click', () => setRoomMode('join'));
modeCreateBtn.addEventListener('click', () => setRoomMode('create'));
joinBtn.addEventListener('click', joinChat);
createBtn.addEventListener('click', createAndJoin);

function setRoomMode(m) {
  roomMode = m;
  roomError.textContent = '';
  if (m === 'join') {
    modeJoinBtn.classList.add('mode-active');
    modeCreateBtn.classList.remove('mode-active');
    createOnly.style.display = 'none';
    roomNumberInput.style.display = 'block';
    roomPasswordInput.style.display = 'block';
    joinBtn.style.display = 'block';
    createBtn.style.display = 'none';
  } else {
    modeCreateBtn.classList.add('mode-active');
    modeJoinBtn.classList.remove('mode-active');
    createOnly.style.display = 'block';
    roomNumberInput.style.display = 'none';
    roomPasswordInput.style.display = 'none';
    joinBtn.style.display = 'none';
    createBtn.style.display = 'block';
  }
}

async function createAndJoin() {
  roomError.textContent = '';
  const roomName = roomNameInput.value.trim() || 'general';
  const roomPassword = newRoomPasswordInput.value;

  if (!roomPassword || roomPassword.length < 4) {
    roomError.textContent = 'Room password required (min 4 characters)';
    return;
  }

  createBtn.disabled = true;
  createBtn.textContent = 'Creating...';

  try {
    const res = await fetch(`${API_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': sessionToken,
      },
      body: JSON.stringify({ name: roomName, roomPassword }),
    });
    const data = await res.json();

    if (res.status === 401) {
      roomError.textContent = 'Session expired — please log in again';
      showAuthView();
      return;
    }
    if (res.status === 429) {
      roomError.textContent = data.error || 'Too many attempts — please wait.';
      resetCreateBtn();
      return;
    }
    if (!res.ok || !data.success) {
      roomError.textContent = data.error || 'Failed to create room';
      resetCreateBtn();
      return;
    }

    connectWebSocket(data.roomNumber, roomName, roomPassword);
  } catch (err) {
    console.error('Create room error:', err);
    roomError.textContent = 'Network error';
    resetCreateBtn();
  }
}

function resetCreateBtn() {
  createBtn.disabled = false;
  createBtn.textContent = 'Create & Join';
}

function joinChat() {
  roomError.textContent = '';
  const roomNumberRaw = roomNumberInput.value.trim();
  const roomPassword = roomPasswordInput.value;

  if (!roomNumberRaw || !/^\d+$/.test(roomNumberRaw)) {
    roomError.textContent = 'Enter a valid room number';
    return;
  }

  connectWebSocket(parseInt(roomNumberRaw), null, roomPassword);
}

function connectWebSocket(roomNumber, roomLabel, roomPassword) {
  const params = new URLSearchParams({ session: sessionToken });
  if (roomPassword) params.set('roomPassword', roomPassword);

  const wsUrl = API_URL
    .replace('http://', 'wss://')
    .replace('https://', 'wss://') + `/api/rooms/${roomNumber}/join?${params.toString()}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    roomView.style.display = 'none';
    chatView.style.display = 'flex';
    roomNameDisplay.textContent = roomLabel || '';
    roomNumberDisplay.textContent = `#${roomNumber}`;
    addSystemMessage(`Connected to room #${roomNumber}`);
  };

  ws.onmessage = (event) => {
    try {
      handleMessage(JSON.parse(event.data));
    } catch (e) {
      console.error('Parse error:', e);
    }
  };

  ws.onclose = () => {
    if (chatView.style.display === 'none' || chatView.style.display === '') {
      roomError.textContent = 'Connection failed — check room number/password';
      resetCreateBtn();
    } else {
      addSystemMessage('Disconnected');
      chatView.style.display = 'none';
      roomView.style.display = 'block';
    }
  };

  ws.onerror = (err) => console.error('WebSocket error:', err);
}

function handleMessage(data) {
  switch (data.type) {
    case 'chat-message':
      addMessage(data.userId, data.username, data.message, false, data.timestamp, data.color);
      break;
    case 'room-history':
      data.messages.forEach(msg => {
        addMessage(msg.user_id || msg.userId, msg.username, msg.message, false, msg.timestamp);
      });
      break;
    case 'user-joined':
      addSystemMessage(`${data.username} joined`);
      updateUserCount('+1');
      break;
    case 'user-left':
      addSystemMessage(`${data.username} left`);
      updateUserCount('-1');
      break;
    case 'error':
      addSystemMessage(`⚠ ${data.message}`);
      break;
    default:
      console.log('Unknown message:', data);
  }
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function addMessage(userId, sender, text, isSystem, timestamp, colorFromServer) {
  const div = document.createElement('div');
  div.className = 'message';
  const timeStr = formatTime(timestamp);
  const isSelf = account && sender === `${account.username}#${account.displayTag}`;
  const color = colorFromServer || (userId ? colorForUserId(userId) : '#333');

  if (isSystem || sender === 'system') {
    div.classList.add('system');
    div.textContent = text;
  } else if (isSelf) {
    div.classList.add('self');
    div.innerHTML = `<div class="sender" style="color:${color}">You <span class="time">${timeStr}</span></div><div>${escapeHtml(text)}</div>`;
  } else {
    div.classList.add('other');
    div.innerHTML = `<div class="sender" style="color:${color}">${escapeHtml(sender)} <span class="time">${timeStr}</span></div><div>${escapeHtml(text)}</div>`;
  }

  messageArea.appendChild(div);
  messageArea.scrollTop = messageArea.scrollHeight;
}

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'message system';
  div.textContent = text;
  messageArea.appendChild(div);
  messageArea.scrollTop = messageArea.scrollHeight;
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  if (text.length > 2000) {
    addSystemMessage('⚠ Message too long');
    return;
  }
  ws.send(JSON.stringify({ type: 'chat-message', message: text }));
  messageInput.value = '';
}

leaveBtn.addEventListener('click', leaveChat);
function leaveChat() {
  if (ws) { ws.close(); ws = null; }
  chatView.style.display = 'none';
  roomView.style.display = 'block';
  messageArea.innerHTML = '';
  userCount.textContent = '0 users';
  resetCreateBtn();
}

function updateUserCount(delta) {
  const current = parseInt(userCount.textContent) || 0;
  userCount.textContent = `${delta === '+1' ? current + 1 : Math.max(0, current - 1)} users`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

tryResumeSession();
