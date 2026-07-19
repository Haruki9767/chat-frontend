// Config - Backend URL from environment variable
const API_URL = window.BACKEND_URL || 'https://chat.lime-paranoid.workers.dev';
let ws = null;
let username = '';
let room = '';

// DOM elements
const loginView = document.getElementById('login-view');
const chatView = document.getElementById('chat-view');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const leaveBtn = document.getElementById('leave-btn');
const roomNameDisplay = document.getElementById('room-name-display');
const userCount = document.getElementById('user-count');
const messageArea = document.getElementById('message-area');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

// Join chat
joinBtn.addEventListener('click', joinChat);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});
sendBtn.addEventListener('click', sendMessage);
leaveBtn.addEventListener('click', leaveChat);

function joinChat() {
  username = usernameInput.value.trim() || 'Anonymous';
  room = roomInput.value.trim() || 'general';

  const wsUrl = API_URL
    .replace('http://', 'wss://')
    .replace('https://', 'wss://') + `/api/rooms/${room}/join?username=${encodeURIComponent(username)}`;

  console.log('Connecting to:', wsUrl);

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    loginView.style.display = 'none';
    chatView.style.display = 'flex';
    roomNameDisplay.textContent = room;
    addSystemMessage(`Connected to #${room}`);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleMessage(data);
    } catch (e) {
      console.error('Parse error:', e);
    }
  };

  ws.onclose = () => {
    addSystemMessage('Disconnected');
    chatView.style.display = 'none';
    loginView.style.display = 'flex';
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
    addSystemMessage('Connection error');
  };
}

function handleMessage(data) {
  switch (data.type) {
    case 'chat-message':
      addMessage(data.username, data.message);
      break;

    case 'room-history':
      data.messages.forEach(msg => {
        // Only true system events are centered/muted; regular chat
        // messages always show their sender, even on history replay.
        addMessage(msg.username, msg.message, false);
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

    case 'participants-list':
      userCount.textContent = `${data.participants.length} users`;
      break;

    case 'error':
      addSystemMessage(`Error: ${data.message}`);
      break;

    default:
      console.log('Unknown message:', data);
  }
}

function addMessage(sender, text, isSystem = false) {
  const div = document.createElement('div');
  div.className = 'message';

  if (isSystem || sender === 'system') {
    div.classList.add('system');
    div.textContent = text;
  } else if (sender === username) {
    div.classList.add('self');
    div.innerHTML = `<div class="sender">You</div><div>${escapeHtml(text)}</div>`;
  } else {
    div.classList.add('other');
    div.innerHTML = `<div class="sender">${escapeHtml(sender)}</div><div>${escapeHtml(text)}</div>`;
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

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

  ws.send(JSON.stringify({
    type: 'chat-message',
    message: text
  }));

  messageInput.value = '';
}

function leaveChat() {
  if (ws) {
    ws.close();
    ws = null;
  }
  chatView.style.display = 'none';
  loginView.style.display = 'flex';
  messageArea.innerHTML = '';
  userCount.textContent = '0 users';
}

function updateUserCount(delta) {
  const current = parseInt(userCount.textContent) || 0;
  const newCount = delta === '+1' ? current + 1 : Math.max(0, current - 1);
  userCount.textContent = `${newCount} users`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Auto-join on load (optional)
document.addEventListener('DOMContentLoaded', () => {
  usernameInput.value = '';
  roomInput.value = 'general';
});
