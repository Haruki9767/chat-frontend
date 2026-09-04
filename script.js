const API_URL = window.BACKEND_URL || 'https://chat.lime-paranoid.workers.dev';

// TODO
const HCAPTCHA_SITE_KEY = '5a780a88-6cf4-45c4-8b18-4f64fd7823d0';

// The separate, standalone Cloudflare Worker dedicated to hCaptcha
// verification (owns the secret key and the actual siteverify call —
// never this frontend, never the chat backend). Called DIRECTLY from
// here, in the browser, rather than by the chat backend server-to-server
// — that Worker's own CORS layer (HCAPTCHA_ALLOWED_ORIGINS) exists
// specifically to support being called this way. This backend/frontend
// split was chosen after repeated, unresolved 404s calling this same
// endpoint Worker-to-Worker from inside the chat backend, which did not
// reproduce via curl or from a browser — see index.js's comments above
// where verifyHcaptcha used to live for the full account of that.
//
// Security note: since verification now happens entirely client-side,
// hCaptcha is an abuse deterrent, not a hard guarantee — the chat
// backend no longer independently re-checks it. This was a deliberate,
// informed tradeoff.
const HCAPTCHA_VERIFY_URL = 'https://turnstile---io.lime-paranoid.workers.dev/verify';

let ws = null;
let intentionalClose = false; // set right before we call ws.close() ourselves, so onclose can tell a deliberate leave apart from a real disconnect/failure
let account = null; // { accountId, username, displayTag, color }
let sessionToken = localStorage.getItem('sessionToken') || null;

// Current room's info, populated once join succeeds — needed by the
// "Manage" panel (owner-only actions) and to label the chat header
// correctly per room type.
let currentRoom = null; // { roomCode, name, roomType, isOwner }

const authView = document.getElementById('auth-view');
const roomView = document.getElementById('room-view');
const chatView = document.getElementById('chat-view');
const manageRoomView = document.getElementById('manage-room-view');
const ownerKeyModal = document.getElementById('owner-key-modal');

// ---- Auth ----
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

// ---- Room join/create ----
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

// ---- Owner key modal (shown once, at e2ee room creation) ----
const ownerKeyValue = document.getElementById('owner-key-value');
const ownerKeyCopyBtn = document.getElementById('owner-key-copy-btn');
const ownerKeyCloseBtn = document.getElementById('owner-key-close-btn');

// ---- Chat ----
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

// ---- Manage room panel ----
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

// Reads the hCaptcha widget's current response token. Returns '' if the
// widget hasn't rendered (e.g. HCAPTCHA_SITE_KEY is blank) or hasn't been
// solved yet — the backend will correctly reject an empty token rather
// than this needing its own client-side validation.
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

// Calls the hCaptcha verification Worker DIRECTLY from the browser (a
// real cross-origin request the Worker's own CORS layer is built to
// accept — no manual Origin header needed here, the browser sets one
// automatically and truthfully, unlike the abandoned server-to-server
// approach). Returns true only on an explicit { ok: true } — every other
// outcome (network failure, non-200, malformed body, explicit
// { ok: false }) is treated as "not verified." This is now the ONLY
// verification that happens anywhere in this app — see the note by
// HCAPTCHA_VERIFY_URL above for why the chat backend no longer
// independently re-checks it.
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

// The hCaptcha script auto-renders any element with class="h-captcha" and
// a data-sitekey attribute the moment it loads, so data-sitekey has to be
// set on the container BEFORE that script runs — done here, at the top
// of this file, rather than waiting for a DOMContentLoaded-style event,
// since api.js is loaded with defer (runs after the DOM is parsed but the
// exact ordering relative to this script depends on load timing either
// way — setting the attribute as early as possible is the safe choice).
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
  const hcaptchaToken = getHcaptchaToken();

  if (!username || !password) {
    authError.textContent = 'Username and password required';
    return;
  }
  if (!hcaptchaToken) {
    authError.textContent = HCAPTCHA_SITE_KEY
      ? 'Please complete the captcha'
      : 'hCaptcha is not configured (see HCAPTCHA_SITE_KEY in script.js) \u2014 login/register cannot succeed until it is';
    return;
  }

  authSubmitBtn.disabled = true;

  // Verified directly against the hCaptcha verification Worker, in the
  // browser, BEFORE ever calling the chat backend — see
  // verifyHcaptchaClientSide's notes for why this replaced a
  // server-to-server check.
  const verified = await verifyHcaptchaClientSide(hcaptchaToken);
  if (!verified) {
    authError.textContent = 'hCaptcha verification failed \u2014 please try again';
    authSubmitBtn.disabled = false;
    resetHcaptcha();
    return;
  }

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
  password: 'A standard room, protected by the password you set below.',
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

  const needsAppPassword = t === 'ephemeral' || t === 'e2ee';
  gatedRoomPasswordWrap.style.display = needsAppPassword ? 'block' : 'none';
  gatedRoomAppPasswordInput.value = '';
}

async function createAndJoin() {
  roomError.textContent = '';
  const roomName = roomNameInput.value.trim() || undefined;

  let endpoint, bodyFields = {}, extraHeaders = {};

  if (createRoomType === 'password') {
    const roomPassword = newRoomPasswordInput.value;
    if (!roomPassword || roomPassword.length < 4) {
      roomError.textContent = 'Room password required (min 4 characters)';
      return;
    }
    endpoint = '/api/rooms';
    bodyFields = { name: roomName, roomPassword };
  } else {
    const appPassword = gatedRoomAppPasswordInput.value;
    if (!appPassword) {
      roomError.textContent = 'App password required for this room type';
      return;
    }
    endpoint = createRoomType === 'ephemeral' ? '/api/rooms/ephemeral' : '/api/rooms/e2ee';
    bodyFields = { name: roomName };
    extraHeaders = { 'X-App-Password': appPassword };
  }

  createBtn.disabled = true;
  createBtn.textContent = 'Creating...';

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
  createBtn.textContent = 'Create Room';
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
    navigator.clipboard.writeText(key).catch(() => {});
    ownerKeyCopyBtn.textContent = 'Copied';
    setTimeout(() => { ownerKeyCopyBtn.textContent = 'Copy'; }, 1500);
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

  connectWebSocket({ roomCode, roomPassword, joinToken });
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
    currentRoom = { roomCode, name: roomLabel || '', roomType: roomType || 'password', isOwner: false };
    roomView.style.display = 'none';
    chatView.style.display = 'flex';
    roomNameDisplay.textContent = currentRoom.name;
    roomCodeDisplay.textContent = `#${roomCode.slice(0, 8)}`;
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
      // Same authoritative-count approach as room-history above — trust
      // the server's count rather than incrementing a local one, which
      // stays correct even if this client ever missed a prior event.
      if (typeof data.participantCount === 'number') {
        userCount.textContent = `${data.participantCount} users`;
      }
      break;
    case 'user-left':
      addSystemMessage(`${data.username} left`);
      if (typeof data.participantCount === 'number') {
        userCount.textContent = `${data.participantCount} users`;
      }
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

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function addMessage(id, userId, sender, text, isSystem, timestamp, colorFromServer, replyTo) {
  const div = document.createElement('div');
  div.className = 'message';
  if (id) div.dataset.messageId = id;
  if (sender) div.dataset.sender = sender;
  if (text) div.dataset.text = text;

  const timeStr = formatTime(timestamp);
  const isSelf = account && sender === `${account.username}#${account.displayTag}`;
  const color = colorFromServer || (userId ? colorForUserId(userId) : '#333');

  const replyHtml = replyTo
    ? `<div class="reply-quote">\u21aa ${escapeHtml(replyTo.username || '')}: ${escapeHtml((replyTo.snippet || '').slice(0, 80))}</div>`
    : '';

  if (isSystem || sender === 'system') {
    div.classList.add('system');
    div.textContent = text;
  } else if (isSelf) {
    div.classList.add('self');
    div.innerHTML = `<div class="sender" style="color:${color}">You <span class="time">${timeStr}</span></div>${replyHtml}<div>${escapeHtml(text)}</div>`;
  } else {
    div.classList.add('other');
    div.innerHTML = `<div class="sender" style="color:${color}">${escapeHtml(sender)} <span class="time">${timeStr}</span></div>${replyHtml}<div>${escapeHtml(text)}</div>`;
  }

  if (!isSystem && sender !== 'system' && id) {
    div.addEventListener('click', () => startReply(id, sender, text));
  }

  messageArea.appendChild(div);
  messageArea.scrollTop = messageArea.scrollHeight;
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

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
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

  const payload = { type: 'chat-message', message: text };
  if (replyingTo) {
    payload.replyTo = replyingTo.id;
  }

  ws.send(JSON.stringify(payload));
  messageInput.value = '';
  replyingTo = null;
  replyPreview.style.display = 'none';
}

leaveBtn.addEventListener('click', leaveChat);
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
  resetCreateBtn();
}

// updateUserCount was removed — participant counts now come directly
// from the server's authoritative participantCount field on room-history/
// user-joined/user-left (see handleMessage above), never computed
// client-side.

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
  navigator.clipboard.writeText(currentRoom.roomCode).catch(() => {});
  manageRoomCodeCopyBtn.textContent = 'Copied';
  setTimeout(() => { manageRoomCodeCopyBtn.textContent = 'Copy'; }, 1500);
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

// ==================== Bootstrap ====================
// No site-wide gate anymore — go straight to resuming a session or
// showing the login/register screen.
tryResumeSession();
