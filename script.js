const API_URL = window.BACKEND_URL || 'https://chat.lime-paranoid.workers.dev';

const CONSENT_VERSION = '1';

const HCAPTCHA_SITE_KEY = '5a780a88-6cf4-45c4-8b18-4f64fd7823d0';

const HCAPTCHA_VERIFY_URL = 'https://turnstile---io.lime-paranoid.workers.dev/verify';

let ws = null;
let intentionalClose = false;
let account = null;
let sessionToken = localStorage.getItem('sessionToken') || null;

let currentRoom = null;
let roomParticipants = new Set();
let typingUsers = new Map();
let myTypingTimer = null;

const consentGate = document.getElementById('consent-gate');
const consentCheckbox = document.getElementById('consent-checkbox');
const consentAcceptBtn = document.getElementById('consent-accept-btn');

const settingsBtn = document.getElementById('settings-btn');
const settingsView = document.getElementById('settings-view');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const themeOptionGrid = document.getElementById('theme-option-grid');
const fontOptionGrid = document.getElementById('font-option-grid');
const typingIndicatorToggle = document.getElementById('typing-indicator-toggle');
const typingIndicatorEl = document.getElementById('typing-indicator');
const mentionSuggestions = document.getElementById('mention-suggestions');
const copyToast = document.getElementById('copy-toast');
const authView = document.getElementById('auth-view');
const roomView = document.getElementById('room-view');
const chatView = document.getElementById('chat-view');
const manageRoomView = document.getElementById('manage-room-view');
const ownerKeyModal = document.getElementById('owner-key-modal');

const authLoginBtn = document.getElementById('auth-login-btn');
const authRegisterBtn = document.getElementById('auth-register-btn');
const authUsernameInput = document.getElementById('auth-username-input');
const authPasswordInput = document.getElementById('auth-password-input');
const authAppPasswordWrap = document.getElementById('auth-app-password-wrap');
const authAppPasswordInput = document.getElementById('auth-app-password-input');
const authHint = document.getElementById('auth-hint');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authError = document.getElementById('auth-error');

const accountDisplay = document.getElementById('account-display');
const logoutBtn = document.getElementById('logout-btn');
const deleteAccountBtn = document.getElementById('delete-account-btn');

const modeJoinBtn = document.getElementById('mode-join-btn');
const modeCreateBtn = document.getElementById('mode-create-btn');
const joinPanel = document.getElementById('join-panel');
const createPanel = document.getElementById('create-panel');
const roomCodeInput = document.getElementById('room-code-input');
const roomPasswordInput = document.getElementById('room-password-input');
const joinTokenInput = document.getElementById('join-token-input');
const joinBtn = document.getElementById('join-btn');

const typePasswordBtn = document.getElementById('type-password-btn');
const typeEphemeralBtn = document.getElementById('type-ephemeral-btn');
const typeE2eeBtn = document.getElementById('type-e2ee-btn');
const roomTypeHint = document.getElementById('room-type-hint');
const roomNameInput = document.getElementById('room-name-input');
const newRoomPasswordInput = document.getElementById('new-room-password-input');
const gatedRoomPasswordWrap = document.getElementById('gated-room-password-wrap');
const gatedRoomAppPasswordInput = document.getElementById('gated-room-app-password-input');
const createBtn = document.getElementById('create-btn');
const roomError = document.getElementById('room-error');

const ownerKeyValue = document.getElementById('owner-key-value');
const ownerKeyCopyBtn = document.getElementById('owner-key-copy-btn');
const ownerKeyCloseBtn = document.getElementById('owner-key-close-btn');

const leaveBtn = document.getElementById('leave-btn');
const manageRoomBtn = document.getElementById('manage-room-btn');
const roomNameDisplay = document.getElementById('room-name-display');
const roomCodeDisplay = document.getElementById('room-code-display');
const roomTypeBadge = document.getElementById('room-type-badge');
const userCount = document.getElementById('user-count');
const messageArea = document.getElementById('message-area');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const replyPreview = document.getElementById('reply-preview');
const replyPreviewText = document.getElementById('reply-preview-text');
const replyCancelBtn = document.getElementById('reply-cancel-btn');

const manageCloseBtn = document.getElementById('manage-close-btn');
const manageRoomCodeValue = document.getElementById('manage-room-code-value');
const manageRoomCodeCopyBtn = document.getElementById('manage-room-code-copy-btn');
const managePasswordSection = document.getElementById('manage-password-section');
const manageCurrentPasswordInput = document.getElementById('manage-current-password-input');
const manageNewPasswordInput = document.getElementById('manage-new-password-input');
const manageChangePasswordBtn = document.getElementById('manage-change-password-btn');
const managePasswordError = document.getElementById('manage-password-error');
const managePasswordSuccess = document.getElementById('manage-password-success');
const manageE2eeKeySection = document.getElementById('manage-e2ee-key-section');
const manageSecretInput = document.getElementById('manage-secret-input');
const manageMintTokenBtn = document.getElementById('manage-mint-token-btn');
const manageNewTokenBox = document.getElementById('manage-new-token-box');
const manageNewTokenValue = document.getElementById('manage-new-token-value');
const manageTokensList = document.getElementById('manage-tokens-list');
const manageTokensError = document.getElementById('manage-tokens-error');

let replyingTo = null;

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

function getHcaptchaToken() {
  if (typeof hcaptcha === 'undefined') return '';
  try {
    return hcaptcha.getResponse() || '';
  } catch {
    return '';
  }
}
function resetHcaptcha() {
  if (typeof hcaptcha === 'undefined') return;
  try { hcaptcha.reset(); } catch {}
}

async function verifyHcaptchaClientSide(token) {
  if (!token) return false;
  try {
    const res = await fetch(HCAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data && data.ok === true;
  } catch (err) {
    console.error('hCaptcha verification request failed:', err);
    return false;
  }
}

(function initHcaptchaWidget() {
  const el = document.getElementById('auth-hcaptcha');
  const warning = document.getElementById('auth-hcaptcha-missing-warning');
  if (!HCAPTCHA_SITE_KEY) {
    if (warning) warning.style.display = 'block';
    if (el) el.style.display = 'none';
    return;
  }
  if (el) el.setAttribute('data-sitekey', HCAPTCHA_SITE_KEY);
})();

let authMode = 'login';
authLoginBtn.addEventListener('click', () => setAuthMode('login'));
authRegisterBtn.addEventListener('click', () => setAuthMode('register'));

function setAuthMode(m) {
  authMode = m;
  authError.textContent = '';
  authAppPasswordInput.value = '';
  if (m === 'login') {
    authLoginBtn.classList.add('mode-active');
    authRegisterBtn.classList.remove('mode-active');
    authSubmitBtn.textContent = 'Log In';
    authHint.textContent = '';
    authAppPasswordWrap.style.display = 'none';
  } else {
    authRegisterBtn.classList.add('mode-active');
    authLoginBtn.classList.remove('mode-active');
    authSubmitBtn.textContent = 'Sign Up';
    authHint.textContent = 'Username: 3-20 chars, letters/numbers/underscore. Password: 8+ chars. There is no password recovery — store it safely.';
    authAppPasswordWrap.style.display = 'block';
  }
}

authSubmitBtn.addEventListener('click', async () => {
  authError.textContent = '';
  const username = authUsernameInput.value.trim();
  const password = authPasswordInput.value;
  const hcaptchaToken = getHcaptchaToken();

  if (!username || !password) {
    authError.textContent = 'Username and password required';
    return;
  }

  let appPassword = '';
  if (authMode === 'register') {
    appPassword = authAppPasswordInput.value;
    if (!appPassword) {
      authError.textContent = 'App password required to create an account';
      return;
    }
  }

  if (!hcaptchaToken) {
    authError.textContent = HCAPTCHA_SITE_KEY
      ? 'Please complete the captcha'
      : 'hCaptcha is not configured (see HCAPTCHA_SITE_KEY in script.js) \u2014 login/register cannot succeed until it is';
    return;
  }

  authSubmitBtn.disabled = true;
  setButtonLoading(authSubmitBtn, true);

  const verified = await verifyHcaptchaClientSide(hcaptchaToken);
  if (!verified) {
    authError.textContent = 'hCaptcha verification failed \u2014 please try again';
    authSubmitBtn.disabled = false;
    setButtonLoading(authSubmitBtn, false);
    resetHcaptcha();
    return;
  }

  const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
  const extraHeaders = authMode === 'register' ? { 'X-App-Password': appPassword } : {};

  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
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
    setButtonLoading(authSubmitBtn, false);
    resetHcaptcha();
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
  authView.style.display = 'flex';
  roomView.style.display = 'none';
  chatView.style.display = 'none';
  manageRoomView.style.display = 'none';
  authUsernameInput.value = '';
  authPasswordInput.value = '';
  setAuthMode('login');
}

function showRoomView() {
  authView.style.display = 'none';
  roomView.style.display = 'flex';
  chatView.style.display = 'none';
  manageRoomView.style.display = 'none';
  accountDisplay.textContent = `${account.username}#${account.displayTag}`;
  setRoomMode('join');
}

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
    joinPanel.style.display = 'flex';
    createPanel.style.display = 'none';
  } else {
    modeCreateBtn.classList.add('mode-active');
    modeJoinBtn.classList.remove('mode-active');
    joinPanel.style.display = 'none';
    createPanel.style.display = 'flex';
    setCreateRoomType('password');
  }
}

let createRoomType = 'password';
typePasswordBtn.addEventListener('click', () => setCreateRoomType('password'));
typeEphemeralBtn.addEventListener('click', () => setCreateRoomType('ephemeral'));
typeE2eeBtn.addEventListener('click', () => setCreateRoomType('e2ee'));

const ROOM_TYPE_HINTS = {
  password: 'A standard room, protected by the password you set below. Requires the app password to create.',
  ephemeral: 'Deletes itself and everyone in it after 24 hours. Max 10 people. No room password. Requires the app password to create.',
  e2ee: 'End-to-end encrypted — messages are never stored on the server, not even briefly. No room password; instead you\u2019ll get a one-time owner key after creating it. Requires the app password to create.',
};

function setCreateRoomType(t) {
  createRoomType = t;
  roomError.textContent = '';
  [typePasswordBtn, typeEphemeralBtn, typeE2eeBtn].forEach(b => b.classList.remove('mode-active'));
  ({ password: typePasswordBtn, ephemeral: typeEphemeralBtn, e2ee: typeE2eeBtn })[t].classList.add('mode-active');
  roomTypeHint.textContent = ROOM_TYPE_HINTS[t];

  const needsRoomPassword = t === 'password';
  const newRoomPasswordField = newRoomPasswordInput.closest('.password-field');
  newRoomPasswordField.style.display = needsRoomPassword ? 'block' : 'none';
  newRoomPasswordInput.value = '';

  gatedRoomPasswordWrap.style.display = 'block';
  gatedRoomAppPasswordInput.value = '';
}

async function createAndJoin() {
  roomError.textContent = '';
  const roomName = roomNameInput.value.trim() || undefined;

  const appPassword = gatedRoomAppPasswordInput.value;
  if (!appPassword) {
    roomError.textContent = 'App password required';
    return;
  }
  const extraHeaders = { 'X-App-Password': appPassword };

  let endpoint, bodyFields = {};

  if (createRoomType === 'password') {
    const roomPassword = newRoomPasswordInput.value;
    if (!roomPassword || roomPassword.length < 4) {
      roomError.textContent = 'Room password required (min 4 characters)';
      return;
    }
    endpoint = '/api/rooms';
    bodyFields = { name: roomName, roomPassword };
  } else {
    endpoint = createRoomType === 'ephemeral' ? '/api/rooms/ephemeral' : '/api/rooms/e2ee';
    bodyFields = { name: roomName };
  }

  createBtn.disabled = true;
  setButtonLoading(createBtn, true, 'Creating\u2026');

  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': sessionToken,
        ...extraHeaders,
      },
      body: JSON.stringify(bodyFields),
    });
    const data = await res.json();

    if (res.status === 401 && data.error === 'Not logged in') {
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

    if (createRoomType === 'e2ee' && data.ownerKey) {
      showOwnerKeyModal(data.ownerKey, () => {
        connectWebSocket({
          roomCode: data.roomToken,
          roomLabel: data.room.name,
          roomType: 'e2ee',
        });
      });
      return;
    }

    connectWebSocket({
      roomCode: data.roomToken,
      roomLabel: data.room.name,
      roomType: data.room.roomType || 'password',
      roomPassword: createRoomType === 'password' ? bodyFields.roomPassword : undefined,
    });
  } catch (err) {
    console.error('Create room error:', err);
    roomError.textContent = 'Network error';
    resetCreateBtn();
  }
}

function resetCreateBtn() {
  createBtn.disabled = false;
  setButtonLoading(createBtn, false);
}

function showOwnerKeyModal(key, onContinue) {
  ownerKeyValue.textContent = key;
  ownerKeyModal.style.display = 'flex';
  const close = () => {
    ownerKeyModal.style.display = 'none';
    onContinue();
  };
  ownerKeyCloseBtn.onclick = close;
  ownerKeyCopyBtn.onclick = () => {
    copyToClipboard(key, ownerKeyCopyBtn, 'Copy');
  };
}

function joinChat() {
  roomError.textContent = '';
  const roomCode = roomCodeInput.value.trim().toLowerCase();
  const roomPassword = roomPasswordInput.value;
  const joinToken = joinTokenInput.value.trim();

  if (!/^[a-f0-9]{32}$/.test(roomCode)) {
    roomError.textContent = 'Enter a valid room code (32 characters)';
    return;
  }

  joinBtn.disabled = true;
  setButtonLoading(joinBtn, true, 'Joining\u2026');

  connectWebSocket({ roomCode, roomPassword, joinToken });
}

function resetJoinBtn() {
  joinBtn.disabled = false;
  setButtonLoading(joinBtn, false);
}

function connectWebSocket({ roomCode, roomLabel, roomType, roomPassword, joinToken }) {
  const params = new URLSearchParams({ session: sessionToken });
  if (roomPassword) params.set('roomPassword', roomPassword);
  if (joinToken) params.set('joinToken', joinToken);

  const wsUrl = API_URL.replace(/^http/, 'ws') + `/api/rooms/${roomCode}/join?${params.toString()}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    resetJoinBtn();
    resetCreateBtn();
    currentRoom = { roomCode, name: roomLabel || '', roomType: roomType || 'password', isOwner: false };
    roomView.style.display = 'none';
    chatView.style.display = 'flex';
    roomNameDisplay.textContent = `#${currentRoom.name}`;
    roomCodeDisplay.textContent = 'Copy code';
    roomTypeBadge.textContent = currentRoom.roomType;
  };

  ws.onmessage = (event) => {
    try {
      handleMessage(JSON.parse(event.data));
    } catch (e) {
      console.error('Parse error:', e);
    }
  };

  ws.onclose = (event) => {
    if (event.code === 4001) {
      ws = null;
      localStorage.removeItem('sessionToken');
      sessionToken = null;
      account = null;
      chatView.style.display = 'none';
      showAuthView();
      authError.textContent = 'This account was deleted — connection closed.';
      return;
    }

    if (event.code === 4002 || event.code === 4003) {
      ws = null;
      chatView.style.display = 'none';
      manageRoomView.style.display = 'none';
      showRoomView();
      roomError.textContent = event.code === 4002
        ? 'This room\u2019s password was changed \u2014 enter the new password to rejoin.'
        : 'This room has expired.';
      if (event.code === 4002 && currentRoom) {
        roomCodeInput.value = currentRoom.roomCode;
      }
      return;
    }

    if (intentionalClose) {
      intentionalClose = false;
      return;
    }

    if (chatView.style.display === 'none' || chatView.style.display === '') {
      roomError.textContent = 'Connection failed — check room code/password';
      resetCreateBtn();
      resetJoinBtn();
    } else {
      addSystemMessage('Disconnected');
      chatView.style.display = 'none';
      manageRoomView.style.display = 'none';
      roomView.style.display = 'flex';
    }
  };

  ws.onerror = (err) => console.error('WebSocket error:', err);
}

function handleMessage(data) {
  switch (data.type) {
    case 'chat-message':
      addMessage(data.id, data.userId, data.username, data.message, false, data.timestamp, data.color, data.replyTo);
      break;
    case 'room-history':
      if (currentRoom) {
        currentRoom.isOwner = !!data.isOwner;
        currentRoom.roomType = data.roomType || currentRoom.roomType;
        roomTypeBadge.textContent = currentRoom.roomType;
        manageRoomBtn.style.display = (currentRoom.isOwner && currentRoom.roomType !== 'ephemeral') ? 'inline-block' : 'none';
        if (data.roomName) {
          currentRoom.name = data.roomName;
          roomNameDisplay.textContent = `#${currentRoom.name}`;
        }
      }
      addSystemMessage(`Connected to ${currentRoom && currentRoom.name ? currentRoom.name : 'room'}`);
      if (typeof data.participantCount === 'number') {
        userCount.textContent = `${data.participantCount} users`;
      }
      data.messages.forEach(msg => {
        if (msg.username) roomParticipants.add(msg.username);
      });
      data.messages.forEach(msg => {
        const replyTo = msg.replyTo || (msg.replied_to_id ? {
          id: msg.replied_to_id,
          username: msg.replied_to_username,
          snippet: msg.replied_to_snippet
        } : null);
        addMessage(msg.id, msg.user_id || msg.userId, msg.username, msg.message, false, msg.timestamp, null, replyTo);
      });
      break;
    case 'user-joined':
      addSystemMessage(`${data.username} joined`);
      roomParticipants.add(data.username);
      if (typeof data.participantCount === 'number') {
        userCount.textContent = `${data.participantCount} users`;
      }
      break;
    case 'user-left':
      addSystemMessage(`${data.username} left`);
      roomParticipants.delete(data.username);
      clearTypingUser(data.userId);
      if (typeof data.participantCount === 'number') {
        userCount.textContent = `${data.participantCount} users`;
      }
      break;
    case 'typing':
      handleTypingEvent(data);
      break;
    case 'e2ee-public-key':
    case 'e2ee-existing-keys':
    case 'e2ee-message':
    case 'e2ee-message-sent':
      console.log('e2ee protocol message (not yet handled client-side):', data);
      break;
    case 'error':
      addSystemMessage(`\u26a0 ${data.message}`);
      break;
    default:
      console.log('Unknown message:', data);
  }
}

function renderMessageBody(escapedText, roomParticipants) {
  const codeBlocks = [];
  let text = escapedText.replace(/```([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(`<pre><code>${code}</code></pre>`);
    return `\u0000CODEBLOCK${codeBlocks.length - 1}\u0000`;
  });
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    codeBlocks.push(`<code>${code}</code>`);
    return `\u0000CODEBLOCK${codeBlocks.length - 1}\u0000`;
  });

  text = text.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^\n*]+)\*/g, '<em>$1</em>');

  text = text.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,:;!?)\]]/g, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`;
  });

  if (roomParticipants && roomParticipants.length > 0) {
    const escapedNames = roomParticipants
      .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .sort((a, b) => b.length - a.length);
    const mentionRe = new RegExp('@(' + escapedNames.join('|') + ')\\b', 'g');
    text = text.replace(mentionRe, '<span class="mention">@$1</span>');
  }

  text = text.replace(/\u0000CODEBLOCK(\d+)\u0000/g, (_, i) => codeBlocks[Number(i)]);

  return text;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

let lastRenderedTimestamp = null;
let lastRenderedSender = null;
const TIME_DIVIDER_GAP_MS = 15 * 60 * 1000;
const SENDER_GROUP_GAP_MS = 2 * 60 * 1000;

function toMs(ts) {
  if (!ts) return Date.now();
  return typeof ts === 'number' && ts < 1e12 ? ts * 1000 : Number(ts);
}

function formatDividerLabel(ms) {
  const d = new Date(ms);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  if (isYesterday) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

function maybeInsertTimeDivider(timestamp) {
  const ms = toMs(timestamp);
  const isNewDay = lastRenderedTimestamp !== null &&
    new Date(ms).toDateString() !== new Date(lastRenderedTimestamp).toDateString();
  const gapExceeded = lastRenderedTimestamp !== null && (ms - lastRenderedTimestamp) > TIME_DIVIDER_GAP_MS;

  if (lastRenderedTimestamp === null || isNewDay || gapExceeded) {
    const divider = document.createElement('div');
    divider.className = 'time-divider';
    divider.textContent = formatDividerLabel(ms);
    messageArea.appendChild(divider);
    return true;
  }
  return false;
}

function addMessage(id, userId, sender, text, isSystem, timestamp, colorFromServer, replyTo) {
  if (isSystem || sender === 'system') {
    addSystemMessage(text);
    return;
  }

  const ms = toMs(timestamp);
  const startedNewGroup = maybeInsertTimeDivider(ms);

  const sameSenderContinuation = !startedNewGroup && sender === lastRenderedSender &&
    lastRenderedTimestamp !== null && (ms - lastRenderedTimestamp) <= SENDER_GROUP_GAP_MS;
  const showTimestamp = !sameSenderContinuation;

  lastRenderedTimestamp = ms;
  lastRenderedSender = sender;

  const div = document.createElement('div');
  div.className = 'message' + (showTimestamp ? ' group-start' : '');
  if (id) div.dataset.messageId = id;
  if (sender) div.dataset.sender = sender;
  if (text) div.dataset.text = text;

  const timeStr = formatTime(timestamp);
  const isSelf = account && sender === `${account.username}#${account.displayTag}`;
  const color = colorFromServer || (userId ? colorForUserId(userId) : '#333');

  const replyHtml = replyTo
    ? `<div class="reply-quote">\u21aa ${escapeHtml(replyTo.username || '')}: ${escapeHtml((replyTo.snippet || '').slice(0, 80))}</div>`
    : '';

  const bodyHtml = renderMessageBody(escapeHtml(text), Array.from(roomParticipants));

  const senderLabel = isSelf ? 'You' : escapeHtml(sender);
  const timeHtml = showTimestamp ? ` <span class="time">${timeStr}</span>` : '';
  const senderHtml = showTimestamp
    ? `<div class="sender" style="color:${color}">${senderLabel}${timeHtml}</div>`
    : '';

  div.classList.add(isSelf ? 'self' : 'other');
  div.innerHTML = `${senderHtml}${replyHtml}<div class="bubble">${bodyHtml}</div>`;

  if (id) {
    div.addEventListener('click', () => {
      if (div.dataset.longPress === 'true') {
        div.dataset.longPress = 'false';
        return;
      }
      startReply(id, sender, text);
    });
    wireMessageCopyGestures(div, text);
  }

  messageArea.appendChild(div);
  messageArea.scrollTop = messageArea.scrollHeight;
}

const LONG_PRESS_MS = 500;

function wireMessageCopyGestures(el, text) {
  let pressTimer = null;

  el.addEventListener('touchstart', () => {
    el.dataset.longPress = 'false';
    pressTimer = setTimeout(() => {
      el.dataset.longPress = 'true';
      el.classList.add('pressing');
      copyToClipboard(text, null, null, true);
      if (navigator.vibrate) navigator.vibrate(15);
    }, LONG_PRESS_MS);
  }, { passive: true });

  const cancelPress = () => {
    clearTimeout(pressTimer);
    el.classList.remove('pressing');
  };
  el.addEventListener('touchmove', cancelPress);
  el.addEventListener('touchend', (e) => {
    cancelPress();
    if (el.dataset.longPress === 'true') {
      e.preventDefault();
    }
  });
  el.addEventListener('touchcancel', cancelPress);

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    copyToClipboard(text, null, null, true);
  });
}

function startReply(id, sender, text) {
  replyingTo = { id, username: sender, snippet: text.slice(0, 120) };
  replyPreviewText.textContent = `Replying to ${sender}: ${text.slice(0, 60)}${text.length > 60 ? '\u2026' : ''}`;
  replyPreview.style.display = 'flex';
  messageInput.focus();
}

replyCancelBtn.addEventListener('click', () => {
  replyingTo = null;
  replyPreview.style.display = 'none';
});

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'message system';
  div.textContent = text;
  messageArea.appendChild(div);
  messageArea.scrollTop = messageArea.scrollHeight;
}

const TYPING_DEBOUNCE_MS = 3000;
const TYPING_SEND_THROTTLE_MS = 2000;

let lastTypingSentAt = 0;

function sendTypingSignal(isTyping) {
  if (!typingIndicatorsEnabled()) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (currentRoom && currentRoom.roomType === 'e2ee') return;
  ws.send(JSON.stringify({ type: 'typing', isTyping }));
}

const TYPING_EXPIRE_MS = 4000;

function handleTypingEvent(data) {
  if (!typingIndicatorsEnabled()) return;
  if (!data.userId) return;

  clearTimeout((typingUsers.get(data.userId) || {}).timer);

  if (data.isTyping) {
    const timer = setTimeout(() => clearTypingUser(data.userId), TYPING_EXPIRE_MS);
    typingUsers.set(data.userId, { username: data.username, timer });
  } else {
    typingUsers.delete(data.userId);
  }
  renderTypingIndicator();
}

function clearTypingUser(userId) {
  const entry = typingUsers.get(userId);
  if (entry) clearTimeout(entry.timer);
  typingUsers.delete(userId);
  renderTypingIndicator();
}

function renderTypingIndicator() {
  const names = Array.from(typingUsers.values()).map(u => u.username);
  if (names.length === 0) {
    typingIndicatorEl.innerHTML = '';
  } else if (names.length === 1) {
    typingIndicatorEl.innerHTML = `${escapeHtml(names[0])} is typing<span class="dots"></span>`;
  } else if (names.length === 2) {
    typingIndicatorEl.innerHTML = `${escapeHtml(names[0])} and ${escapeHtml(names[1])} are typing<span class="dots"></span>`;
  } else {
    typingIndicatorEl.innerHTML = `Several people are typing<span class="dots"></span>`;
  }
}

let mentionActiveIndex = -1;
let mentionMatchStart = -1;

function handleMentionAutocomplete() {
  const value = messageInput.value;
  const cursor = messageInput.selectionStart;
  const upToCursor = value.slice(0, cursor);
  const match = upToCursor.match(/@([a-zA-Z0-9_]*)$/);

  if (!match) {
    hideMentionSuggestions();
    return;
  }

  const query = match[1].toLowerCase();
  mentionMatchStart = cursor - match[0].length;

  const candidates = Array.from(roomParticipants)
    .filter(name => name.toLowerCase().includes(query))
    .slice(0, 6);

  if (candidates.length === 0) {
    hideMentionSuggestions();
    return;
  }

  mentionActiveIndex = 0;
  mentionSuggestions.innerHTML = '';
  candidates.forEach((name, i) => {
    const opt = document.createElement('div');
    opt.className = 'mention-option' + (i === 0 ? ' active' : '');
    opt.textContent = name;
    opt.addEventListener('mousedown', (e) => {
      e.preventDefault();
      applyMentionSelection(name);
    });
    mentionSuggestions.appendChild(opt);
  });
  mentionSuggestions.classList.add('visible');
}

function hideMentionSuggestions() {
  mentionSuggestions.classList.remove('visible');
  mentionSuggestions.innerHTML = '';
  mentionActiveIndex = -1;
  mentionMatchStart = -1;
}

function applyMentionSelection(name) {
  const value = messageInput.value;
  const cursor = messageInput.selectionStart;
  const before = value.slice(0, mentionMatchStart);
  const after = value.slice(cursor);
  const newValue = `${before}@${name} ${after}`;
  messageInput.value = newValue;
  const newCursor = before.length + name.length + 2;
  messageInput.setSelectionRange(newCursor, newCursor);
  hideMentionSuggestions();
  messageInput.focus();
}

messageInput.addEventListener('keydown', (e) => {
  if (!mentionSuggestions.classList.contains('visible')) return;
  const options = mentionSuggestions.querySelectorAll('.mention-option');
  if (options.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    mentionActiveIndex = (mentionActiveIndex + 1) % options.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    mentionActiveIndex = (mentionActiveIndex - 1 + options.length) % options.length;
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    applyMentionSelection(options[mentionActiveIndex].textContent);
    return;
  } else if (e.key === 'Escape') {
    hideMentionSuggestions();
    return;
  } else {
    return;
  }
  options.forEach((o, i) => o.classList.toggle('active', i === mentionActiveIndex));
});

messageInput.addEventListener('input', () => {
  handleMentionAutocomplete();

  const now = Date.now();
  if (now - lastTypingSentAt > TYPING_SEND_THROTTLE_MS) {
    sendTypingSignal(true);
    lastTypingSentAt = now;
  }
  clearTimeout(myTypingTimer);
  myTypingTimer = setTimeout(() => {
    sendTypingSignal(false);
    lastTypingSentAt = 0;
  }, TYPING_DEBOUNCE_MS);
});

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.repeat && !e.isComposing && !mentionSuggestions.classList.contains('visible')) {
    e.preventDefault();
    sendMessage();
  }
});

let sendInFlight = false;
const SEND_DEBOUNCE_MS = 500;

function sendMessage() {
  if (sendInFlight) return;

  const text = messageInput.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  if (text.length > 2000) {
    addSystemMessage('\u26a0 Message too long');
    return;
  }
  if (currentRoom && currentRoom.roomType === 'e2ee') {
    addSystemMessage('\u26a0 Sending in e2ee rooms isn\u2019t implemented in this build yet');
    return;
  }

  sendInFlight = true;
  sendBtn.disabled = true;
  setTimeout(() => { sendInFlight = false; sendBtn.disabled = false; }, SEND_DEBOUNCE_MS);

  clearTimeout(myTypingTimer);
  myTypingTimer = null;
  sendTypingSignal(false);
  lastTypingSentAt = 0;

  const payload = { type: 'chat-message', message: text };
  if (replyingTo) {
    payload.replyTo = replyingTo.id;
  }

  ws.send(JSON.stringify(payload));
  messageInput.value = '';
  replyingTo = null;
  replyPreview.style.display = 'none';
  hideMentionSuggestions();
}

leaveBtn.addEventListener('click', leaveChat);

roomCodeDisplay.addEventListener('click', () => {
  if (!currentRoom) return;
  copyToClipboard(currentRoom.roomCode, roomCodeDisplay, 'Copy code');
});

function leaveChat() {
  if (ws) { intentionalClose = true; ws.close(); ws = null; }
  chatView.style.display = 'none';
  manageRoomView.style.display = 'none';
  roomView.style.display = 'flex';
  messageArea.innerHTML = '';
  userCount.textContent = '0 users';
  manageRoomBtn.style.display = 'none';
  currentRoom = null;
  roomParticipants = new Set();
  typingUsers.forEach(u => clearTimeout(u.timer));
  typingUsers.clear();
  clearTimeout(myTypingTimer);
  myTypingTimer = null;
  renderTypingIndicator();
  resetCreateBtn();
}

async function copyToClipboard(text, button, resetLabel, useToast) {
  let ok = false;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = false;
    }
  }
  if (!ok) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch {
      ok = false;
    }
  }

  const message = ok ? 'Copied' : 'Copy failed \u2014 select manually';

  if (useToast) {
    copyToast.textContent = message;
    copyToast.classList.add('visible');
    setTimeout(() => { copyToast.classList.remove('visible'); }, 1500);
  } else if (button) {
    button.textContent = message;
    setTimeout(() => { button.textContent = resetLabel; }, 1800);
  }
}

const buttonOriginalLabels = new WeakMap();
function setButtonLoading(button, loading, loadingText) {
  if (loading) {
    if (!buttonOriginalLabels.has(button)) {
      buttonOriginalLabels.set(button, button.innerHTML);
    }
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${escapeHtml(loadingText || 'Working\u2026')}`;
  } else {
    const original = buttonOriginalLabels.get(button);
    if (original !== undefined) {
      button.innerHTML = original;
    }
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

manageRoomBtn.addEventListener('click', () => {
  if (!currentRoom) return;
  openManageRoom();
});
manageCloseBtn.addEventListener('click', () => {
  manageRoomView.style.display = 'none';
  chatView.style.display = 'flex';
});

function openManageRoom() {
  chatView.style.display = 'none';
  manageRoomView.style.display = 'flex';
  managePasswordError.textContent = '';
  managePasswordSuccess.textContent = '';
  manageTokensError.textContent = '';
  manageNewTokenBox.style.display = 'none';
  manageCurrentPasswordInput.value = '';
  manageNewPasswordInput.value = '';
  manageSecretInput.value = '';

  manageRoomCodeValue.textContent = currentRoom.roomCode;

  const isE2ee = currentRoom.roomType === 'e2ee';
  managePasswordSection.style.display = isE2ee ? 'none' : 'flex';
  manageE2eeKeySection.style.display = isE2ee ? 'flex' : 'none';
  manageSecretInput.placeholder = isE2ee ? 'Owner key' : 'Room password';

  loadJoinTokens();
}

manageRoomCodeCopyBtn.addEventListener('click', () => {
  if (!currentRoom) return;
  copyToClipboard(currentRoom.roomCode, manageRoomCodeCopyBtn, 'Copy');
});

manageChangePasswordBtn.addEventListener('click', async () => {
  managePasswordError.textContent = '';
  managePasswordSuccess.textContent = '';
  const currentPassword = manageCurrentPasswordInput.value;
  const newPassword = manageNewPasswordInput.value;
  if (!currentPassword || !newPassword || newPassword.length < 4) {
    managePasswordError.textContent = 'Both fields required; new password min 4 characters';
    return;
  }

  manageChangePasswordBtn.disabled = true;
  try {
    const res = await fetch(`${API_URL}/api/rooms/${currentRoom.roomCode}/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': sessionToken,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      managePasswordError.textContent = data.error || 'Failed to change password';
      return;
    }
    manageCurrentPasswordInput.value = '';
    manageNewPasswordInput.value = '';
    managePasswordSuccess.textContent = 'Password changed. Other participants have been disconnected and must rejoin with the new password.';
  } catch (err) {
    managePasswordError.textContent = 'Network error';
  } finally {
    manageChangePasswordBtn.disabled = false;
  }
});

manageMintTokenBtn.addEventListener('click', async () => {
  manageTokensError.textContent = '';
  const secret = manageSecretInput.value;
  if (!secret) {
    manageTokensError.textContent = 'Enter the room password / owner key first';
    return;
  }

  const isE2ee = currentRoom.roomType === 'e2ee';
  const body = isE2ee ? { ownerKey: secret } : { currentPassword: secret };

  manageMintTokenBtn.disabled = true;
  try {
    const res = await fetch(`${API_URL}/api/rooms/${currentRoom.roomCode}/join-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': sessionToken,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      manageTokensError.textContent = data.error || 'Failed to mint join token';
      return;
    }
    manageNewTokenValue.textContent = data.token;
    manageNewTokenBox.style.display = 'block';
    manageSecretInput.value = '';
    loadJoinTokens();
  } catch (err) {
    manageTokensError.textContent = 'Network error';
  } finally {
    manageMintTokenBtn.disabled = false;
  }
});

async function loadJoinTokens() {
  manageTokensList.innerHTML = 'Loading\u2026';
  try {
    const res = await fetch(`${API_URL}/api/rooms/${currentRoom.roomCode}/join-tokens`, {
      headers: { 'X-Session-Token': sessionToken },
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      manageTokensList.innerHTML = '';
      manageTokensError.textContent = data.error || 'Failed to load join tokens';
      return;
    }
    renderJoinTokens(data.tokens);
  } catch (err) {
    manageTokensList.innerHTML = '';
    manageTokensError.textContent = 'Network error loading join tokens';
  }
}

function renderJoinTokens(tokens) {
  manageTokensList.innerHTML = '';
  if (!tokens || tokens.length === 0) {
    manageTokensList.innerHTML = '<p class="hint">No join tokens minted yet.</p>';
    return;
  }

  tokens.forEach(t => {
    const row = document.createElement('div');
    row.className = 'token-row' + (t.revokedAt ? ' revoked' : '');

    const wrap = document.createElement('div');
    wrap.className = 'token-row-info';

    const info = document.createElement('div');
    const created = new Date(t.createdAt * 1000).toLocaleDateString();
    info.innerHTML = `Token ${escapeHtml(t.tokenId.slice(0, 8))}\u2026 \u00b7 created ${created}${t.revokedAt ? ' \u00b7 revoked' : ''}`;

    const usesList = document.createElement('div');
    usesList.className = 'token-uses';
    if (t.uses.length === 0) {
      usesList.textContent = 'Never used';
    } else {
      t.uses.forEach(u => {
        const useLine = document.createElement('div');
        useLine.className = 'token-use-line';
        const who = u.username ? escapeHtml(u.username) : '(deleted account)';
        const when = new Date(u.joinedAt * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        useLine.innerHTML = `<span class="numeric">${who}</span> \u2014 ${when}`;
        usesList.appendChild(useLine);
      });
    }

    wrap.appendChild(info);
    wrap.appendChild(usesList);
    row.appendChild(wrap);

    if (!t.revokedAt) {
      const revokeBtn = document.createElement('button');
      revokeBtn.type = 'button';
      revokeBtn.textContent = 'Revoke';
      revokeBtn.addEventListener('click', () => revokeJoinToken(t.tokenId));
      row.appendChild(revokeBtn);
    }

    manageTokensList.appendChild(row);
  });
}

async function revokeJoinToken(tokenId) {
  manageTokensError.textContent = '';
  try {
    const res = await fetch(`${API_URL}/api/rooms/${currentRoom.roomCode}/join-tokens/${tokenId}`, {
      method: 'DELETE',
      headers: { 'X-Session-Token': sessionToken },
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      manageTokensError.textContent = data.error || 'Failed to revoke token';
      return;
    }
    loadJoinTokens();
  } catch (err) {
    manageTokensError.textContent = 'Network error';
  }
}

const THEMES = [
  { id: 'default', label: 'Ledger Green' },
  { id: 'dusk', label: 'Dusk' },
  { id: 'ledger', label: 'Sepia' },
];
const FONTS = [
  { id: 'default', label: 'Newsreader + Inter' },
  { id: 'mono', label: 'Monospace' },
  { id: 'classic-serif', label: 'Source Serif' },
  { id: 'grotesk', label: 'Space Grotesk' },
];

function applyTheme(themeId) {
  if (themeId === 'default') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', themeId);
  }
  localStorage.setItem('theme', themeId);
  renderSettingsOptions();
}

function applyFont(fontId) {
  if (fontId === 'default') {
    document.documentElement.removeAttribute('data-font');
  } else {
    document.documentElement.setAttribute('data-font', fontId);
  }
  localStorage.setItem('font', fontId);
  renderSettingsOptions();
}

function renderSettingsOptions() {
  const currentTheme = localStorage.getItem('theme') || 'default';
  const currentFont = localStorage.getItem('font') || 'default';

  themeOptionGrid.innerHTML = '';
  THEMES.forEach(t => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'option-chip' + (t.id === currentTheme ? ' active' : '');
    chip.textContent = t.label;
    chip.addEventListener('click', () => applyTheme(t.id));
    themeOptionGrid.appendChild(chip);
  });

  fontOptionGrid.innerHTML = '';
  FONTS.forEach(f => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'option-chip' + (f.id === currentFont ? ' active' : '');
    chip.textContent = f.label;
    chip.addEventListener('click', () => applyFont(f.id));
    fontOptionGrid.appendChild(chip);
  });
}

settingsBtn.addEventListener('click', () => {
  renderSettingsOptions();
  typingIndicatorToggle.checked = typingIndicatorsEnabled();
  roomView.style.display = 'none';
  chatView.style.display = 'none';
  settingsView.style.display = 'flex';
});

settingsCloseBtn.addEventListener('click', () => {
  settingsView.style.display = 'none';
  roomView.style.display = 'flex';
});

function typingIndicatorsEnabled() {
  return localStorage.getItem('typingIndicatorsEnabled') !== 'false';
}

typingIndicatorToggle.addEventListener('change', () => {
  localStorage.setItem('typingIndicatorsEnabled', typingIndicatorToggle.checked ? 'true' : 'false');
  if (!typingIndicatorToggle.checked) {
    typingUsers.forEach(u => clearTimeout(u.timer));
    typingUsers.clear();
    renderTypingIndicator();
    sendTypingSignal(false);
  }
});

const EYE_OPEN_SVG = '<svg class="icon" viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_CLOSED_SVG = '<svg class="icon" viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 5.2A11 11 0 0 1 12 5c7 0 11 7 11 7a13.4 13.4 0 0 1-3.4 4.1M6.7 6.7C3.4 8.9 1 12 1 12s4 7 11 7a10.6 10.6 0 0 0 5.3-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

document.querySelectorAll('.password-toggle').forEach(btn => {
  const input = document.getElementById(btn.dataset.for);
  if (!input) return;
  btn.innerHTML = EYE_OPEN_SVG;
  btn.addEventListener('click', () => {
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.innerHTML = showing ? EYE_OPEN_SVG : EYE_CLOSED_SVG;
    btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  });
});

consentCheckbox.addEventListener('change', () => {
  consentAcceptBtn.disabled = !consentCheckbox.checked;
});

consentAcceptBtn.addEventListener('click', () => {
  localStorage.setItem('consentVersion', CONSENT_VERSION);
  consentGate.style.display = 'none';
  bootstrapApp();
});

function hasAcceptedCurrentConsent() {
  return localStorage.getItem('consentVersion') === CONSENT_VERSION;
}

function bootstrapApp() {
  tryResumeSession();
}

if (hasAcceptedCurrentConsent()) {
  bootstrapApp();
} else {
  consentGate.style.display = 'flex';
}