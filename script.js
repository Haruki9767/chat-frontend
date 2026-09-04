const API_URL = window.BACKEND_URL || 'https://chat.lime-paranoid.workers.dev';

const HCAPTCHA_SITE_KEY = '5a780a88-6cf4-45c4-8b18-4f64fd7823d0';

const HCAPTCHA_VERIFY_URL = 'https://turnstile---io.lime-paranoid.workers.dev/verify';

let ws = null;
let intentionalClose = false;
let account = null;
let sessionToken = localStorage.getItem('sessionToken') || null;

let currentRoom = null; // { roomCode, name, roomType, isOwner }

const authView = document.getElementById('auth-view');
const roomView = document.getElementById('room-view');
const chatView = document.getElementById('chat-view');
const manageRoomView = document.getElementById('manage-room-view');
const ownerKeyModal = document.getElementById('owner-key-modal');

// auth
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

// ---- Owner key modal ----
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

let replyingTo = null;

// ---- Deterministic color ----
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
      : 'hCaptcha is not configured (see HCAPTCHA_SITE_KEY in script.js) — login/register cannot succeed until it is';
    return;
  }

  authSubmitBtn.disabled = true;

  const verified = await verifyHcaptchaClientSide(hcaptchaToken);
  if (!verified) {
    authError.textContent = 'hCaptcha verification failed — please try again';
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
  password: 'A standard room, protected by the password you set below. Requires the app password to create.',
  ephemeral: 'Deletes itself and everyone in it after 24 hours. Max 10 people. No room password. Requires the app password to create.',
  e2ee: 'End-to-end encrypted — messages are never stored on the server, not even briefly. No room password; instead you\'ll get a one-time owner key after creating it. Requires the app password to create.',
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

// ============================================================================
// END OF ORIGINAL SCRIPT.JS — ENHANCEMENTS CONTINUE BELOW
// ============================================================================

// ============================================================================
// ENHANCEMENTS – merged from app.js with fixes
// ============================================================================

(function() {
  'use strict';

  // ---- Helpers ----
  function safeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showToast(msg) {
    const old = document.querySelector('.toast-notification');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = msg;
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '80px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      padding: '0.5rem 1rem',
      boxShadow: 'var(--shadow-md)',
      zIndex: '300',
      fontSize: '0.85rem',
      color: 'var(--text)',
      transition: 'opacity 0.2s',
      opacity: '1',
    });
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 1500);
  }

  // ---- Markdown Parser ----
  function parseMarkdown(text) {
    let html = safeHtml(text);
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<code class="md-code-block">${safeHtml(code.trim())}</code>`);
    html = html.replace(/`([^`]+)`/g, (_, code) => `<code class="md-code">${safeHtml(code)}</code>`);
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="md-bold">$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong class="md-bold">$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em class="md-italic">$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em class="md-italic">$1</em>');
    html = html.replace(/^&gt;\s+(.*)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  // ---- Override addMessage with markdown ----
  let originalAddMessage = null;
  function overrideAddMessage() {
    if (typeof window.addMessage === 'function') {
      originalAddMessage = window.addMessage;
      window.addMessage = function(id, userId, sender, text, isSystem, timestamp, colorFromServer, replyTo) {
        if (isSystem || sender === 'system') {
          return originalAddMessage(id, userId, sender, text, isSystem, timestamp, colorFromServer, replyTo);
        }
        const div = document.createElement('div');
        div.className = 'message';
        if (id) div.dataset.messageId = id;
        if (sender) div.dataset.sender = sender;
        if (text) div.dataset.text = text;

        const timeStr = formatTime(timestamp);
        const isSelf = window.account && sender === `${window.account.username}#${window.account.displayTag}`;
        const color = colorFromServer || (userId ? colorForUserId(userId) : '#333');

        const replyHtml = replyTo
          ? `<div class="reply-quote">↪ ${safeHtml(replyTo.username || '')}: ${safeHtml((replyTo.snippet || '').slice(0, 80))}</div>`
          : '';

        const renderedBody = parseMarkdown(text);

        if (isSelf) {
          div.classList.add('self');
          div.innerHTML = `<div class="sender" style="color:${color}">You <span class="time">${timeStr}</span></div>${replyHtml}<div>${renderedBody}</div>`;
        } else {
          div.classList.add('other');
          div.innerHTML = `<div class="sender" style="color:${color}">${safeHtml(sender)} <span class="time">${timeStr}</span></div>${replyHtml}<div>${renderedBody}</div>`;
        }

        // Long press copy
        let pressTimer = null;
        div.addEventListener('pointerdown', () => {
          pressTimer = setTimeout(() => {
            const textToCopy = div.dataset.text || text;
            navigator.clipboard.writeText(textToCopy).then(() => showToast('Copied!')).catch(() => {});
          }, 500);
        });
        div.addEventListener('pointerup', () => clearTimeout(pressTimer));
        div.addEventListener('pointerleave', () => clearTimeout(pressTimer));

        if (!isSystem && id) {
          div.addEventListener('click', (e) => {
            if (e.pointerType === 'mouse' && e.detail === 1) {
              startReply(id, sender, text);
            }
          });
        }

        messageArea.appendChild(div);
        messageArea.scrollTop = messageArea.scrollHeight;
      };
      console.log('[enhance] Markdown + long-press + reply active');
    } else {
      setTimeout(overrideAddMessage, 100);
    }
  }

  // ---- Typing Indicator ----
  let typingTimeout = null;
  let typingEnabled = false;
  const typingUsers = new Map();
  const typingEl = document.getElementById('typing-indicator');
  const typingText = document.getElementById('typing-text');

  function updateTypingIndicator() {
    const users = Array.from(typingUsers.values());
    if (users.length === 0) {
      typingEl.style.display = 'none';
      return;
    }
    typingEl.style.display = 'block';
    if (users.length === 1) {
      typingText.textContent = `${users[0]} is typing…`;
    } else if (users.length === 2) {
      typingText.textContent = `${users[0]} and ${users[1]} are typing…`;
    } else {
      typingText.textContent = 'Several people are typing…';
    }
  }

  function setupTyping() {
    const input = document.getElementById('message-input');
    if (!input) return;
    input.addEventListener('input', function() {
      if (!window.ws || window.ws.readyState !== WebSocket.OPEN) return;
      if (!typingEnabled) {
        typingEnabled = true;
        window.ws.send(JSON.stringify({ type: 'typing', isTyping: true }));
      }
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
          window.ws.send(JSON.stringify({ type: 'typing', isTyping: false }));
        }
        typingEnabled = false;
      }, 1500);
    });
  }

  // ---- User List ----
  const userListEl = document.getElementById('user-list');
  const userListToggle = document.getElementById('user-list-toggle');
  const userListPanel = document.getElementById('user-list-panel');
  const participants = new Map();

  function updateUserList() {
    if (!userListEl) return;
    userListEl.innerHTML = '';
    const sorted = Array.from(participants.values()).sort((a, b) => a.username.localeCompare(b.username));
    for (const p of sorted) {
      const item = document.createElement('div');
      item.className = 'user-item';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color || '#888';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'name';
      nameSpan.textContent = p.username;
      if (window.account && p.username === `${window.account.username}#${window.account.displayTag}`) {
        nameSpan.textContent += ' (you)';
        item.classList.add('you');
      }
      item.appendChild(dot);
      item.appendChild(nameSpan);
      userListEl.appendChild(item);
    }
  }

  if (userListToggle) {
    userListToggle.addEventListener('click', () => {
      const visible = userListPanel.style.display !== 'none';
      userListPanel.style.display = visible ? 'none' : 'block';
    });
  }

  // ---- Unread Badge ----
  const unreadBadge = document.getElementById('unread-badge');
  let unreadCount = 0;
  let scrollAtBottom = true;

  function updateUnreadBadge() {
    if (unreadCount === 0 || scrollAtBottom) {
      unreadBadge.style.display = 'none';
      return;
    }
    unreadBadge.style.display = 'block';
    unreadBadge.textContent = unreadCount;
  }

  if (messageArea) {
    messageArea.addEventListener('scroll', () => {
      const threshold = 30;
      const atBottom = messageArea.scrollHeight - messageArea.scrollTop - messageArea.clientHeight < threshold;
      if (atBottom !== scrollAtBottom) {
        scrollAtBottom = atBottom;
        if (scrollAtBottom) {
          unreadCount = 0;
          updateUnreadBadge();
        }
      }
    });
  }

  // ---- Mention Dropdown ----
  const mentionDropdown = document.getElementById('mention-dropdown');
  const mentionList = document.getElementById('mention-list');
  let mentionFilter = '';
  let mentionIndex = -1;

  function setupMentions() {
    const input = document.getElementById('message-input');
    if (!input) return;
    input.addEventListener('input', function() {
      const val = this.value;
      const cursor = this.selectionStart;
      const atPos = val.lastIndexOf('@', cursor - 1);
      if (atPos !== -1 && (atPos === 0 || val[atPos - 1] === ' ' || val[atPos - 1] === '\n')) {
        const afterAt = val.slice(atPos + 1, cursor);
        if (/^[a-zA-Z0-9_#]*$/.test(afterAt)) {
          mentionFilter = afterAt;
          showMentionDropdown(mentionFilter);
          return;
        }
      }
      hideMentionDropdown();
    });

    input.addEventListener('keydown', function(e) {
      if (mentionDropdown.style.display === 'block') {
        const items = mentionList.querySelectorAll('li');
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          mentionIndex = Math.min(mentionIndex + 1, items.length - 1);
          updateMentionHighlight(items);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          mentionIndex = Math.max(mentionIndex - 1, -1);
          updateMentionHighlight(items);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          if (mentionIndex >= 0 && items[mentionIndex]) {
            e.preventDefault();
            selectMention(items[mentionIndex]);
          }
        } else if (e.key === 'Escape') {
          hideMentionDropdown();
        }
      }
    });
  }

  function showMentionDropdown(filter) {
    const users = Array.from(participants.values());
    const filtered = users.filter(p => p.username.toLowerCase().includes(filter.toLowerCase()));
    if (filtered.length === 0) { hideMentionDropdown(); return; }
    mentionList.innerHTML = '';
    filtered.forEach((p, i) => {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color || '#888';
      li.appendChild(dot);
      li.appendChild(document.createTextNode(p.username));
      li.dataset.username = p.username;
      li.addEventListener('click', () => selectMention(li));
      li.addEventListener('mouseenter', () => {
        const items = mentionList.querySelectorAll('li');
        mentionIndex = i;
        updateMentionHighlight(items);
      });
      mentionList.appendChild(li);
    });
    mentionIndex = -1;
    mentionDropdown.style.display = 'block';
    const input = document.getElementById('message-input');
    const rect = input.getBoundingClientRect();
    mentionDropdown.style.bottom = (rect.height + 8) + 'px';
    mentionDropdown.style.left = '0';
    mentionDropdown.style.width = Math.min(200, rect.width) + 'px';
  }

  function hideMentionDropdown() {
    mentionDropdown.style.display = 'none';
    mentionIndex = -1;
  }

  function updateMentionHighlight(items) {
    items.forEach((li, i) => li.classList.toggle('active', i === mentionIndex));
  }

  function selectMention(li) {
    const username = li.dataset.username;
    const input = document.getElementById('message-input');
    const val = input.value;
    const cursor = input.selectionStart;
    const atPos = val.lastIndexOf('@', cursor - 1);
    if (atPos !== -1) {
      const before = val.slice(0, atPos);
      const after = val.slice(cursor);
      input.value = before + '@' + username + ' ' + after;
      input.focus();
      input.selectionStart = input.selectionEnd = before.length + username.length + 2;
    }
    hideMentionDropdown();
  }

  // ---- Keyboard Shortcuts ----
  function setupShortcuts() {
    document.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const input = document.getElementById('message-input');
        if (input) { input.focus(); input.select(); }
      }
      if (e.key === 'Escape') {
        const cancelBtn = document.getElementById('reply-cancel-btn');
        if (cancelBtn) cancelBtn.click();
        if (mentionDropdown && mentionDropdown.style.display === 'block') {
          hideMentionDropdown();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const sendBtn = document.getElementById('send-btn');
        if (sendBtn) sendBtn.click();
      }
    });
  }

  // ---- E2EE (client-side) ----
  async function generateE2EEKeyPair() {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' },
      true,
      ['encrypt', 'decrypt']
    );
    const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    return { publicKey: publicJwk, privateKey: privateJwk };
  }

  function getE2EEKey(roomCode) {
    const stored = localStorage.getItem(`e2ee_keys_${roomCode}`);
    if (stored) {
      try { return JSON.parse(stored); } catch { return null; }
    }
    return null;
  }

  function storeE2EEKey(roomCode, keys) {
    localStorage.setItem(`e2ee_keys_${roomCode}`, JSON.stringify(keys));
  }

  async function importPublicKey(jwk) {
    return crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  }

  async function importPrivateKey(jwk) {
    return crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
  }

  async function encryptFor(plaintext, publicJwk) {
    const pubKey = await importPublicKey(publicJwk);
    const enc = new TextEncoder();
    const data = enc.encode(plaintext);
    const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, data);
    return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  }

  async function decryptWithPrivate(ciphertextB64, privateJwk) {
    const privKey = await importPrivateKey(privateJwk);
    const ciphertext = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privKey, ciphertext);
    return new TextDecoder().decode(decrypted);
  }

  async function sendE2EEMessage(text) {
    const roomCode = window.currentRoom?.roomCode;
    if (!roomCode) return false;
    const myKeys = getE2EEKey(roomCode);
    if (!myKeys) { showToast('E2EE keys not initialized'); return false; }
    const recipients = {};
    const myId = window.account?.accountId;
    for (const [userId, p] of participants) {
      if (userId === myId) continue;
      if (p.publicKey) {
        try {
          const cipher = await encryptFor(text, p.publicKey);
          recipients[userId] = cipher;
        } catch (e) { console.warn('Encrypt fail for', userId, e); }
      }
    }
    if (Object.keys(recipients).length === 0) {
      showToast('No other participants with public keys');
      return false;
    }
    const id = crypto.randomUUID();
    window.ws.send(JSON.stringify({ type: 'e2ee-message', id, recipients }));
    return true;
  }

  async function handleE2EEMessage(data) {
    const roomCode = window.currentRoom?.roomCode;
    if (!roomCode) return;
    const myKeys = getE2EEKey(roomCode);
    if (!myKeys) return;
    const { id, from, ciphertext } = data;
    try {
      const plaintext = await decryptWithPrivate(ciphertext, myKeys.privateKey);
      if (typeof window.addMessage === 'function') {
        const sender = participants.get(from)?.username || from;
        window.addMessage(id, from, sender, '🔒 ' + plaintext, false, Date.now(), null, null);
      }
    } catch (e) { console.warn('Decrypt E2EE failed', e); }
  }

  function broadcastPublicKey(roomCode) {
    const keys = getE2EEKey(roomCode);
    if (!keys) return;
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify({ type: 'e2ee-public-key', publicKey: keys.publicKey }));
    }
  }

  // ---- Password visibility toggles (fixed alignment) ----
  function setupPasswordToggles() {
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    passwordInputs.forEach(input => {
      if (input.closest('.password-wrapper')) return;
      const wrap = document.createElement('div');
      wrap.className = 'password-wrapper';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'password-toggle';
      btn.setAttribute('aria-label', 'Toggle password visibility');
      btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      wrap.appendChild(btn);
      btn.addEventListener('click', () => {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.innerHTML = isPassword
          ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
          : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
      });
    });
  }

  // ---- 404 & URL routing ----
  function show404(message) {
    const notFound = document.getElementById('notfound-view');
    if (notFound) {
      notFound.style.display = 'flex';
      const p = notFound.querySelector('p');
      if (p && message) p.textContent = message;
      // Hide all other views
      document.getElementById('auth-view').style.display = 'none';
      document.getElementById('room-view').style.display = 'none';
      document.getElementById('chat-view').style.display = 'none';
      document.getElementById('manage-room-view').style.display = 'none';
    }
  }

  function routeUrl() {
    const path = window.location.pathname;
    if (path === '/' || path === '') return;
    const match = path.match(/^\/room\/([a-f0-9]{32})$/);
    if (match) {
      const roomCode = match[1];
      if (window.sessionToken && window.account) {
        const checkAndJoin = () => {
          if (document.getElementById('room-view').style.display !== 'none') {
            const input = document.getElementById('room-code-input');
            if (input) {
              input.value = roomCode;
              const joinBtn = document.getElementById('join-btn');
              if (joinBtn) joinBtn.click();
            }
          } else {
            setTimeout(checkAndJoin, 200);
          }
        };
        checkAndJoin();
        return;
      } else {
        show404('You need to log in first to join a room.');
        return;
      }
    }
    show404('Page not found.');
  }

  const notFoundBack = document.getElementById('notfound-back-btn');
  if (notFoundBack) {
    notFoundBack.addEventListener('click', function() {
      document.getElementById('notfound-view').style.display = 'none';
      if (window.account && window.sessionToken) {
        document.getElementById('room-view').style.display = 'flex';
      } else {
        document.getElementById('auth-view').style.display = 'flex';
      }
    });
  }

  // ---- Intercept WebSocket for 404 & "Connected to room" name ----
  function interceptWebSocketConnection() {
    if (typeof window.connectWebSocket === 'function') {
      const originalConnect = window.connectWebSocket;
      window.connectWebSocket = function(params) {
        originalConnect.call(window, params);
        const checkWs = setInterval(() => {
          if (window.ws) {
            clearInterval(checkWs);
            const origOnOpen = window.ws.onopen;
            const origOnError = window.ws.onerror;
            const origOnClose = window.ws.onclose;
            let opened = false;
            window.ws.onopen = function(e) {
              opened = true;
              const roomName = window.currentRoom?.name || 'room';
              // Override system message for "Connected to"
              const origAddSys = window.addSystemMessage;
              if (origAddSys) {
                window.addSystemMessage = function(msg) {
                  if (msg.includes('Connected to ')) {
                    msg = `Connected to ${roomName}`;
                  }
                  origAddSys(msg);
                  window.addSystemMessage = origAddSys;
                };
              }
              if (origOnOpen) origOnOpen.call(window.ws, e);
            };
            window.ws.onerror = function(e) {
              if (!opened) {
                // Room not found – show 404, keep session
                show404('Room not found or network error.');
                window.hideLoading && window.hideLoading();
                return;
              }
              if (origOnError) origOnError.call(window.ws, e);
            };
            window.ws.onclose = function(e) {
              // If we already handled 404, do nothing more
              if (document.getElementById('notfound-view').style.display === 'flex') return;
              if (origOnClose) origOnClose.call(window.ws, e);
            };
          }
        }, 100);
      };
    } else {
      setTimeout(interceptWebSocketConnection, 200);
    }
  }

  // ---- Intercept WebSocket messages for extra features ----
  function interceptWebSocketMessages() {
    const checkWs = setInterval(() => {
      if (window.ws && typeof window.ws.onmessage === 'function') {
        clearInterval(checkWs);
        const origOnMessage = window.ws.onmessage;
        window.ws.onmessage = function(event) {
          origOnMessage.call(window.ws, event);
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'typing') {
              const userId = data.userId;
              if (data.isTyping) {
                typingUsers.set(userId, data.username);
              } else {
                typingUsers.delete(userId);
              }
              updateTypingIndicator();
            } else if (data.type === 'e2ee-message') {
              handleE2EEMessage(data);
            } else if (data.type === 'e2ee-public-key') {
              const userId = data.userId;
              const pubKey = data.publicKey;
              if (participants.has(userId)) {
                participants.get(userId).publicKey = pubKey;
              }
            } else if (data.type === 'e2ee-existing-keys') {
              for (const keyInfo of data.keys) {
                if (participants.has(keyInfo.userId)) {
                  participants.get(keyInfo.userId).publicKey = keyInfo.publicKey;
                }
              }
            } else if (data.type === 'user-joined') {
              participants.set(data.userId, {
                username: data.username,
                color: data.color,
                publicKey: null
              });
              updateUserList();
            } else if (data.type === 'user-left') {
              participants.delete(data.userId);
              typingUsers.delete(data.userId);
              updateTypingIndicator();
              updateUserList();
            } else if (data.type === 'room-history') {
              if (data.roomType === 'e2ee') {
                const roomCode = window.currentRoom?.roomCode;
                if (roomCode) {
                  let keys = getE2EEKey(roomCode);
                  if (!keys) {
                    generateE2EEKeyPair().then(k => {
                      storeE2EEKey(roomCode, k);
                      broadcastPublicKey(roomCode);
                    });
                  } else {
                    setTimeout(() => broadcastPublicKey(roomCode), 500);
                  }
                }
              }
            }
          } catch (e) { /* ignore parse errors */ }
        };
      }
    }, 200);
  }

  // ---- Loading timeout ----
  function setupLoadingTimeout() {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    const timeout = setTimeout(() => {
      if (overlay.style.display === 'flex') {
        overlay.style.display = 'none';
        const errorEl = document.getElementById('auth-error') || document.getElementById('room-error');
        if (errorEl && !errorEl.textContent) {
          errorEl.textContent = 'Request timed out. Please try again.';
        }
      }
    }, 10000);
    const origHide = window.hideLoading;
    window.hideLoading = function() {
      clearTimeout(timeout);
      if (origHide) origHide();
    };
  }

  // ---- Init ----
  function initEnhancements() {
    overrideAddMessage();
    setupTyping();
    setupMentions();
    setupShortcuts();
    setupPasswordToggles();
    routeUrl();
    interceptWebSocketConnection();
    interceptWebSocketMessages();
    setupLoadingTimeout();
    console.log('[enhance] All enhancements active (merged)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEnhancements);
  } else {
    initEnhancements();
  }

  // Expose helpers
  window.__paranoid = {
    participants,
    typingUsers,
    unreadCount,
    generateE2EEKeyPair,
    getE2EEKey,
    storeE2EEKey,
    encryptFor,
    decryptWithPrivate,
    sendE2EEMessage,
    show404,
  };

})();

