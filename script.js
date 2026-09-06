const API_URL = window.BACKEND_URL || 'https://chat.lime-paranoid.workers.dev';

// Bump this whenever the Privacy Policy or Terms of Service change in a
// way that needs re-acceptance
const CONSENT_VERSION = '1';


const HCAPTCHA_SITE_KEY = '5a780a88-6cf4-45c4-8b18-4f64fd7823d0';


const HCAPTCHA_VERIFY_URL = 'https://turnstile---io.lime-paranoid.workers.dev/verify';

let ws = null;
let intentionalClose = false; // set right before we call ws.close() ourselves, so onclose can tell a deliberate leave apart from a real disconnect/failure
let account = null; // { accountId, username, displayTag, color }
let sessionToken = localStorage.getItem('sessionToken') || null;


let typingUsers = new Map();
let myTypingTimer = null; // debounce for THIS client's own outgoing typing signal

const consentGate = document.getElementById('consent-gate');
const consentCheckbox = document.getElementById('consent-checkbox');
const consentAcceptBtn = document.getElementById('consent-accept-btn');

// Settings 
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

// Auth 
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

// Room join
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

// Owner key modal
const ownerKeyValue = document.getElementById('owner-key-value');
const ownerKeyCopyBtn = document.getElementById('owner-key-copy-btn');
const ownerKeyCloseBtn = document.getElementById('owner-key-close-btn');

//  Chat 
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

//  Manage room panel 
const manageCloseBtn = document.getElementById('manage-close-btn');
const manageRoomCodeValue = document.getElementById('manage-room-code-value');
const manageRoomCodeCopyBtn = document.getElementById('manage-room-code-copy-btn');
const managePasswordSection = document.getElementById('manage-password-section');
const manageCurrentPasswordInput = document.getElementById('manage-current-password-input');
const manageNewPasswordInput = document.getElementById('manage-new-password-input');
const manageChangePasswordBtn = document.getElementById('manage-change-password-btn');
const managePasswordError = document.getElementById('manage-password-error');
const manageE2eeKeySection = document.getElementById('manage-e2ee-key-section');
const manageSecretInput = document.getElementById('manage-secret-input');
const manageMintTokenBtn = document.getElementById('manage-mint-token-btn');
const manageNewTokenBox = document.getElementById('manage-new-token-box');
const manageNewTokenValue = document.getElementById('manage-new-token-value');
const manageTokensList = document.getElementById('manage-tokens-list');
const manageTokensError = document.getElementById('manage-tokens-error');

let replyingTo = null; // { id, username, snippet }

// Deterministic color
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

verifyHcaptchaClientSide(token) {
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

// Auth mode toggle 
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
    // The app password gates account creation (registration) but not
    // login — a returning account holder isn't creating anything new.
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

  // App password gates
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

// ---- Room type selector (create panel) ----
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
  newRoomPasswordInput.style.display = needsRoomPassword ? 'block' : 'none';
  newRoomPasswordInput.value = '';

  // The app password is now required to create ANY room type, not just
  // ephemeral/e2ee — always shown.
  gatedRoomPasswordWrap.style.display = 'block';
  gatedRoomAppPasswordInput.value = '';
}

async function createAndJoin() {
  roomError.textContent = '';
  const roomName = roomNameInput.value.trim() || undefined;

  // App password is now required for every room type — checked once,
  // outside the per-type branch below (previously only ephemeral/e2ee
  // required it; password rooms now do too).
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

    // e2ee rooms return a one-time owner key that is NEVER shown again —
    // block on the modal before connecting, so it can't be missed by a
    // fast auto-connect flashing past it.
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

  // Map http(s) -> ws(s) by scheme, not by blindly forcing wss:// — a
  // local http:// dev backend needs a plain ws:// connection, since it
  // has no TLS to upgrade to.
  const wsUrl = API_URL.replace(/^http/, 'ws') + `/api/rooms/${roomCode}/join?${params.toString()}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    // Clears whichever of Join/Create triggered this connection — only
    // one is ever actually mid-loading at a time, resetting both
    // unconditionally is harmless and avoids needing to track which one
    // initiated this particular connectWebSocket call.
    resetJoinBtn();
    resetCreateBtn();
    currentRoom = { roomCode, name: roomLabel || '', roomType: roomType || 'password', isOwner: false };
    roomView.style.display = 'none';
    chatView.style.display = 'flex';
    roomNameDisplay.textContent = `#${currentRoom.name}`;
    roomCodeDisplay.textContent = 'Copy code';
    roomTypeBadge.textContent = currentRoom.roomType;
    addSystemMessage(`Connected to ${currentRoom.name || 'room'}`);
  };

  ws.onmessage = (event) => {
    try {
      handleMessage(JSON.parse(event.data));
    } catch (e) {
      console.error('Parse error:', e);
    }
  };

  ws.onclose = (event) => {
    // 4001: this account was just deleted (see ChatRoom.kickAccount) —
    // log out entirely, not just disconnect from the room.
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

    // 4002: the room's password was just changed by its owner — everyone
    // gets disconnected and needs to rejoin with the new password. 4003:
    // an ephemeral room hit its 24h expiry.
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
      // Now carries isOwner (whether THIS session is the room's owner),
      // roomType, and participantCount alongside history — see
      // chat-room.js's fetch() handler for why this piggybacks on
      // room-history rather than being a separate message type. isOwner
      // drives whether the "Manage" button is shown at all; it's purely
      // a UI convenience — every actual owner-gated action re-checks
      // ownership server-side independently (see requireRoomOwner in
      // index.js), so nothing security-relevant depends on the client
      // believing this flag.
      if (currentRoom) {
        currentRoom.isOwner = !!data.isOwner;
        currentRoom.roomType = data.roomType || currentRoom.roomType;
        roomTypeBadge.textContent = currentRoom.roomType;
        manageRoomBtn.style.display = (currentRoom.isOwner && currentRoom.roomType !== 'ephemeral') ? 'inline-block' : 'none';
      }
      // participantCount is authoritative (computed server-side from the
      // Durable Object's actual connected-socket count, AFTER this
      // client's own socket was accepted) — set it directly rather than
      // ever doing local +1/-1 arithmetic from a hardcoded starting
      // point. That old approach undercounted every room this client
      // didn't personally watch every join/leave event for, including
      // itself: a hardcoded "0 users" baseline never learned about its
      // OWN connection, only other people's subsequent events.
      if (typeof data.participantCount === 'number') {
        userCount.textContent = `${data.participantCount} users`;
      }
      // Best-effort seed of roomParticipants from history authors — see
      // the declaration comment above for why this is approximate, not
      // authoritative (a historical sender may have since left).
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
      // Same authoritative-count approach as room-history above — trust
      // the server's count rather than incrementing a local one, which
      // stays correct even if this client ever missed a prior event.
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
    // e2ee handshake/message types (Phase 5) are relayed by the server
    // but this build doesn't yet implement client-side key generation or
    // encrypt/decrypt — see the TODO block below handleMessage. Until
    // that lands, e2ee rooms will connect and show history/join events
    // normally, but sent "messages" won't actually be end-to-end
    // encrypted content yet.
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

// TODO(e2ee crypto): this build wires the e2ee room TYPE end to end
// (creation, owner key, joining, the server-side pairwise relay) but does
// NOT yet implement the actual client-side cryptography — WebCrypto
// keypair generation/storage, the e2ee-public-key handshake, or
// encrypting/decrypting e2ee-message payloads. sendMessage() below
// currently sends plain chat-message for every room type, which the
// backend will correctly REJECT for e2ee rooms (see chat-room.js's
// explicit guard against plaintext chat-message in e2ee rooms) — so e2ee
// rooms are joinable and show presence/history correctly, but sending an
// actual message in one will currently fail with a server error until
// this TODO is implemented.

// ==================== Markdown + @mentions (constrained, safe subset) ====================
// Deliberately narrow: **bold**, *italic*, `inline code`, ```code
// blocks```, and auto-linked bare URLs. No headers/images/tables/lists —
// those don't fit a chat bubble and only expand the surface for a
// rendering mistake to matter. This function receives text that has
// ALREADY been through escapeHtml() — every regex below only ever
// constructs SPECIFIC, hardcoded tags (<strong>, <em>, <code>, <pre>,
// <a>, <span class="mention">) around already-safe escaped content. It
// never re-parses or trusts anything resembling raw HTML from the
// message itself, so there is no injection path through this function.
//
// roomParticipants is the CURRENT room's actual connected members (from
// presence events), not a static list — a message that mentions someone
// who was never really in the room is deliberately left as plain text,
// since highlighting a false match would be misleading, not helpful.
function renderMessageBody(escapedText, roomParticipants) {
  // Step 1: pull out fenced code blocks and inline code FIRST, replacing
  // each with a placeholder token, so none of the later markdown/mention/
  // URL rules can accidentally reach inside code content (e.g. an
  // asterisk inside a code span must never become <em>).
  const codeBlocks = [];
  let text = escapedText.replace(/```([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(`<pre><code>${code}</code></pre>`);
    return `\u0000CODEBLOCK${codeBlocks.length - 1}\u0000`;
  });
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    codeBlocks.push(`<code>${code}</code>`);
    return `\u0000CODEBLOCK${codeBlocks.length - 1}\u0000`;
  });

  // Step 2: bold before italic — **x** must resolve fully before a
  // single-asterisk rule gets a chance to misparse it. The bold pattern
  // matches non-greedily up to the closing ** and allows any content in
  // between (including a nested *italic* span) — an earlier, stricter
  // version ([^\n*]+) failed on "**bold *italic* still bold**" because it
  // couldn't match across the inner asterisks, letting the italic rule
  // wrongly fire first and garble the result. Verified against that exact
  // case, plus the simple/no-nesting cases, before shipping this version.
  text = text.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^\n*]+)\*/g, '<em>$1</em>');

  // Step 3: auto-link bare URLs. Escaped text means a literal "&" in a
  // URL already reads as "&amp;" at this point — matched as part of the
  // URL body so links with query strings still work, and rel/target are
  // hardcoded (never derived from the message) to prevent any tab-nabbing
  // trick via a crafted URL scheme beyond http(s).
  text = text.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,:;!?)\]]/g, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`;
  });

  // Step 4: @mentions — ONLY matched against actual current room
  // participants (passed in), never a bare @word pattern. Longer names
  // are checked before shorter ones sharing a prefix (sorted by length
  // descending) so "@al" doesn't shadow a match for "@alex" typed first
  // in the regex alternation.
  if (roomParticipants && roomParticipants.length > 0) {
    const escapedNames = roomParticipants
      .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .sort((a, b) => b.length - a.length);
    const mentionRe = new RegExp('@(' + escapedNames.join('|') + ')\\b', 'g');
    text = text.replace(mentionRe, '<span class="mention">@$1</span>');
  }

  // Step 5: restore code blocks/spans last, after everything else has
  // already run — their content was never exposed to steps 2-4 at all.
  text = text.replace(/\u0000CODEBLOCK(\d+)\u0000/g, (_, i) => codeBlocks[Number(i)]);

  return text;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ==================== Timestamp grouping state ====================
// Tracks the previous rendered (non-system) message's timestamp/sender,
// so addMessage can decide whether to insert a day/gap divider and
// whether to show this message's own inline timestamp or suppress it as
// part of a consecutive run from the same sender. Reset alongside
// roomParticipants/typingUsers in leaveChat, so a newly joined room
// starts its own grouping from scratch.
let lastRenderedTimestamp = null;
let lastRenderedSender = null;
const TIME_DIVIDER_GAP_MS = 15 * 60 * 1000; // new divider after a 15-minute gap
const SENDER_GROUP_GAP_MS = 2 * 60 * 1000; // show a fresh timestamp if 2+ minutes passed even from the same sender

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
    return true; // signals "this message starts a new visual group" to the caller
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

  // Suppress the inline per-bubble timestamp for a quick consecutive run
  // from the SAME sender — only show it when the sender changed, a
  // divider was just inserted, or enough time passed even within one
  // sender's run that a fresh timestamp is actually informative again.
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

  // Rich rendering: escape first (always), THEN run the constrained
  // markdown/mention transform on the already-safe result — see
  // renderMessageBody's own notes on why this ordering is what makes it
  // safe. Never skip escapeHtml() here even though the transform looks
  // like it "renders HTML" — it only ever wraps already-escaped content
  // in a fixed, hardcoded set of tags.
  const bodyHtml = renderMessageBody(escapeHtml(text), Array.from(roomParticipants));

  const senderLabel = isSelf ? 'You' : escapeHtml(sender);
  const timeHtml = showTimestamp ? ` <span class="time">${timeStr}</span>` : '';
  const senderHtml = showTimestamp
    ? `<div class="sender" style="color:${color}">${senderLabel}${timeHtml}</div>`
    : '';

  div.classList.add(isSelf ? 'self' : 'other');
  div.innerHTML = `${senderHtml}${replyHtml}<div class="bubble">${bodyHtml}</div>`;

  // Short tap/click = reply (existing behavior, unchanged). Long-press
  // (touch) or right-click (desktop, via contextmenu) = copy the raw
  // message text — see wireMessageCopyGestures below for why these are
  // handled together as one function per bubble, applied identically
  // regardless of which surface rendered it (self/other/reply-carrying).
  if (id) {
    div.addEventListener('click', () => {
      // Defensive check independent of touchend's preventDefault (which
      // has known cross-browser inconsistencies for suppressing the
      // synthetic click after a touch sequence — see
      // wireMessageCopyGestures' notes) — a long-press that just fired
      // should never ALSO trigger a reply.
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

// One shared wiring function for the long-press (touch) / right-click
// (desktop) "copy this message" gesture, applied to every message bubble
// regardless of sender. Deliberately kept independent of the existing
// tap-to-reply click handler (registered separately on the same element)
// rather than merged into one handler with branching — a timer-based
// long-press naturally coexists with a plain click handler: a short tap
// fires the click listener as it always did, a held tap fires this one
// instead and suppresses the subsequent click via preventDefault on
// touchend.
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
      // Belt-and-suspenders against the tap-to-reply click that would
      // otherwise ALSO fire right after a long-press release: preventDefault
      // here suppresses the browser's synthetic click on current Chrome
      // Mobile/iOS Safari, but that specific behavior has a history of
      // cross-browser inconsistency, so the reply click handler ALSO checks
      // el.dataset.longPress itself (see the click listener above, in
      // addMessage) rather than depending on preventDefault alone.
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

const TYPING_DEBOUNCE_MS = 3000; // stop signaling "typing" after this long with no further input
const TYPING_SEND_THROTTLE_MS = 2000; // minimum gap between outgoing "still typing" sends, so holding a key down doesn't flood the socket

let lastTypingSentAt = 0;

function sendTypingSignal(isTyping) {
  if (!typingIndicatorsEnabled()) return; // full opt-out — see the settings toggle notes
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (currentRoom && currentRoom.roomType === 'e2ee') return; // no chat-message support there yet either (see the e2ee TODO) — nothing meaningful to signal about
  ws.send(JSON.stringify({ type: 'typing', isTyping }));
}

const TYPING_EXPIRE_MS = 4000; // safety-net auto-clear if a "stopped typing" signal is ever dropped (e.g. tab closes uncleanly)

function handleTypingEvent(data) {
  if (!typingIndicatorsEnabled()) return; // full opt-out — never render others' signals either, matching the settings toggle notes
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

// ==================== @mention autocomplete ====================
// Suggests only ACTUAL current room participants (see roomParticipants),
// same restriction as renderMessageBody's highlighting — never an
// arbitrary/freeform mention target.
let mentionActiveIndex = -1;
let mentionMatchStart = -1; // index into messageInput.value where the "@" of the current mention attempt starts

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
      // mousedown (not click) so this fires BEFORE the input loses focus,
      // which would otherwise close the dropdown first and lose the
      // selection.
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

// Arrow-key navigation and Enter-to-select while the dropdown is open —
// added as its own keydown listener (not merged into the existing Enter-
// to-send one) so the two concerns stay easy to reason about separately;
// the existing Enter-to-send handler already checks
// mentionSuggestions.classList.contains('visible') and backs off when
// this one should act instead.
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
  // Only trigger on the actual Enter press, not the browser's repeat-fire
  // while the key is held, and ignore IME composition Enters (e.g.
  // confirming a suggestion on some mobile keyboards) — e.isComposing is
  // the standard way to detect that. Without this, some mobile virtual
  // keyboards were firing this handler in a way that, combined with the
  // Send button's own click handler, sent the same message twice.
  if (e.key === 'Enter' && !e.repeat && !e.isComposing && !mentionSuggestions.classList.contains('visible')) {
    e.preventDefault();
    sendMessage();
  }
});

let sendInFlight = false; // guards against sending the same message twice from two rapid triggers on the same physical action — e.g. a double-tap on the Send button (confirmed cause), or Enter's keydown plus a near-simultaneous click landing together
const SEND_DEBOUNCE_MS = 500; // long enough to absorb a real double-tap (typically 100-300ms apart), short enough that it never blocks two genuinely separate messages sent close together

function sendMessage() {
  if (sendInFlight) return;

  const text = messageInput.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
  if (text.length > 2000) {
    addSystemMessage('\u26a0 Message too long');
    return;
  }
  if (currentRoom && currentRoom.roomType === 'e2ee') {
    // See the e2ee crypto TODO above handleMessage — sending here would
    // just be rejected by the server as plaintext in an e2ee room.
    addSystemMessage('\u26a0 Sending in e2ee rooms isn\u2019t implemented in this build yet');
    return;
  }

  sendInFlight = true;
  sendBtn.disabled = true;
  setTimeout(() => { sendInFlight = false; sendBtn.disabled = false; }, SEND_DEBOUNCE_MS);

  // Sending counts as "done typing" — stop the indicator immediately
  // rather than waiting for the idle debounce to expire on its own.
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

// Available to EVERYONE in the room, not just the owner — this is the
// only way a non-owner (or anyone in an ephemeral room, which has no
// Manage panel at all — see manageRoomBtn's visibility logic above) can
// ever see/copy the room's full code. Labeled "Copy code" explicitly
// (rather than showing a truncated hex string that looked like plain
// text and wasn't discoverable as tappable — the original version of
// this element failed exactly that way in practice).
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
  // Reset explicitly rather than relying on chatView (its parent) being
  // hidden to make this moot — the next room-history message will
  // re-evaluate this correctly regardless, but leaving stale state lying
  // around is fragile to reason about later.
  manageRoomBtn.style.display = 'none';
  currentRoom = null;
  // Reset per-room state that would otherwise leak stale names/timers
  // into whatever room is joined next.
  roomParticipants = new Set();
  typingUsers.forEach(u => clearTimeout(u.timer));
  typingUsers.clear();
  clearTimeout(myTypingTimer);
  myTypingTimer = null;
  renderTypingIndicator();
  resetCreateBtn();
}

// updateUserCount was removed — participant counts now come directly
// from the server's authoritative participantCount field on room-history/
// user-joined/user-left (see handleMessage above), never computed
// client-side.

// Copies text to the clipboard and only shows a success confirmation
// once it's actually confirmed to have worked — the original version of
// every copy button here fired-and-forgot the Clipboard API promise and
// showed "Copied" unconditionally, which would have been a silent lie in
// any environment where navigator.clipboard is unavailable or denied
// (several Android WebView configurations fall into this category,
// unlike a full mobile browser). Falls back to the older
// document.execCommand('copy') approach — a hidden, temporary textarea
// — which has much broader compatibility, including in WebViews that
// don't expose the modern Clipboard API at all.
// Copies text to the clipboard and only shows a success confirmation
// once it's actually confirmed to have worked — the original version of
// every copy button here fired-and-forgot the Clipboard API promise and
// showed "Copied" unconditionally, which would have been a silent lie in
// any environment where navigator.clipboard is unavailable or denied
// (several Android WebView configurations fall into this category,
// unlike a full mobile browser). Falls back to the older
// document.execCommand('copy') approach — a hidden, temporary textarea
// — which has much broader compatibility, including in WebViews that
// don't expose the modern Clipboard API at all.
//
// Two feedback modes: pass a button + its reset label to relabel that
// button temporarily (the original use case — owner-key/token/room-code
// copy buttons that have a natural place to show "Copied"), or pass
// useToast=true for a gesture with no dedicated button to relabel (the
// long-press/right-click message-copy gesture) — shows the floating
// #copy-toast instead.
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


// Feature: loading states for any action with real network latency (join,
// create, sign in, log in, etc.) — replaces a button's label with a
// spinner + "Working..." text and disables it, so an action with a wait
// never just sits there with no feedback. Restores the original label on
// loading(false), so callers don't need to remember it themselves.
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

// ==================== Room management (owner-only) ====================
// currentRoom.isOwner is set from the room-history message's isOwner
// field (see handleMessage above), which the DO now includes based on
// the X-Is-Owner header the Worker's join route sets. That flag is
// purely a UI convenience for showing/hiding this button — every actual
// owner-gated action (password change, minting/revoking join tokens)
// independently re-checks ownership server-side via requireRoomOwner, so
// nothing security-relevant depends on the client's copy of this flag
// being honest.
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
    // Success kicks everyone (including this owner) via close code 4002,
    // which ws.onclose already handles by returning to the room view with
    // an explanatory message — nothing further to do here.
    manageCurrentPasswordInput.value = '';
    manageNewPasswordInput.value = '';
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

    const info = document.createElement('div');
    const created = new Date(t.createdAt * 1000).toLocaleDateString();
    const usesText = t.uses.length === 0
      ? 'never used'
      : `used by ${t.uses.length} join${t.uses.length === 1 ? '' : 's'}`;
    info.innerHTML = `Token ${escapeHtml(t.tokenId.slice(0, 8))}\u2026 \u00b7 created ${created}` +
      `<div class="token-uses">${escapeHtml(usesText)}${t.revokedAt ? ' \u00b7 revoked' : ''}</div>`;

    row.appendChild(info);

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

// ==================== Settings: theme & font ====================
const THEMES = [
  { id: 'default', label: 'Ledger Green' },
  { id: 'dusk', label: 'Dusk' },
  { id: 'ledger', label: 'Sepia' },
];
const FONTS = [
  { id: 'default', label: 'Newsreader' },
  { id: 'sans-only', label: 'Sans only' },
  { id: 'mono-numerals', label: 'Monospace numerals' },
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
  // Settings is reachable from the room list; returning to it is the
  // correct default regardless of whether the person came from an active
  // chat, since opening Settings itself always hid chatView above.
  roomView.style.display = 'flex';
});

// Full opt-out, not just muting the display: when off, this client
// neither SENDS its own typing signal nor renders anyone else's. Not
// sending your own signal is the more genuinely private default (matches
// this app's whole "discretion" design world) — a person who wants
// privacy from typing-presence shouldn't still be broadcasting it to
// others just because they personally don't want to see it back.
function typingIndicatorsEnabled() {
  return localStorage.getItem('typingIndicatorsEnabled') !== 'false'; // default ON
}

typingIndicatorToggle.addEventListener('change', () => {
  localStorage.setItem('typingIndicatorsEnabled', typingIndicatorToggle.checked ? 'true' : 'false');
  if (!typingIndicatorToggle.checked) {
    // Turning it off mid-room: stop showing what's already been received
    // and tell the room we've stopped typing, in case a signal was
    // mid-flight when the setting changed.
    typingUsers.forEach(u => clearTimeout(u.timer));
    typingUsers.clear();
    renderTypingIndicator();
    sendTypingSignal(false);
  }
});

// ==================== Password visibility toggles ====================
// One generic wiring pass over every .password-toggle button, rather than
// a separate handler per field (there are 8 password inputs across auth,
// join/create, and room management) — each toggle's data-for attribute
// names the input it controls.
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

// ==================== Consent gate ====================
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

// ==================== Bootstrap ====================
// The consent gate blocks EVERYTHING else — auth, room join/create,
// resuming a session — until accepted. A returning user who already
// accepted the current CONSENT_VERSION skips straight past it, same as
// any other one-time acknowledgment.
if (hasAcceptedCurrentConsent()) {
  bootstrapApp();
} else {
  consentGate.style.display = 'flex';
}
