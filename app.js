// app.js – extends script.js with new features + bug fixes
// DO NOT MODIFY script.js – this file hooks into it.

(function() {
  'use strict';

  // ----- Helpers -----
  function safeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function sanitizeHtml(html) {
    const tmp = document.createElement('div');
    tmp.textContent = html;
    return tmp.innerHTML;
  }

  // ----- Toast notification -----
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

  // ----- Markdown Parser (minimal) -----
  function parseMarkdown(text) {
    let html = safeHtml(text);
    // Code blocks: ```code```
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
      return `<code class="md-code-block">${safeHtml(code.trim())}</code>`;
    });
    // Inline code: `code`
    html = html.replace(/`([^`]+)`/g, (_, code) => `<code class="md-code">${safeHtml(code)}</code>`);
    // Bold: **text** or __text__
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="md-bold">$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong class="md-bold">$1</strong>');
    // Italic: *text* or _text_
    html = html.replace(/\*([^*]+)\*/g, '<em class="md-italic">$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em class="md-italic">$1</em>');
    // Blockquotes: > text
    html = html.replace(/^&gt;\s+(.*)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  // ----- Override message rendering with markdown -----
  let originalAddMessage = null;

  function overrideAddMessage() {
    if (typeof window.addMessage === 'function') {
      originalAddMessage = window.addMessage;
      window.addMessage = function(id, userId, sender, text, isSystem, timestamp, colorFromServer, replyTo) {
        if (isSystem || sender === 'system') {
          return originalAddMessage(id, userId, sender, text, isSystem, timestamp, colorFromServer, replyTo);
        }
        const messageArea = document.getElementById('message-area');
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
        div.addEventListener('pointerdown', (e) => {
          pressTimer = setTimeout(() => {
            const textToCopy = div.dataset.text || text;
            navigator.clipboard.writeText(textToCopy).then(() => {
              showToast('Copied!');
            }).catch(() => {});
          }, 500);
        });
        div.addEventListener('pointerup', () => clearTimeout(pressTimer));
        div.addEventListener('pointerleave', () => clearTimeout(pressTimer));

        // Click to reply
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
      console.log('[app] Overrode addMessage with markdown support');
    } else {
      setTimeout(overrideAddMessage, 100);
    }
  }

  // ----- Typing Indicator -----
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

  // ----- User List -----
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

  // ----- Unread Badge -----
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

  const messageArea = document.getElementById('message-area');
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

  // ----- Mention Dropdown -----
  const mentionDropdown = document.getElementById('mention-dropdown');
  const mentionList = document.getElementById('mention-list');
  let mentionFilter = '';
  let mentionIndex = -1;

  function setupMentions() {
    const input = document.getElementById('message-input');
    if (!input) return;
    let lastAtPos = -1;

    input.addEventListener('input', function() {
      const val = this.value;
      const cursor = this.selectionStart;
      const atPos = val.lastIndexOf('@', cursor - 1);
      if (atPos !== -1 && (atPos === 0 || val[atPos - 1] === ' ' || val[atPos - 1] === '\n')) {
        const afterAt = val.slice(atPos + 1, cursor);
        const match = afterAt.match(/^[a-zA-Z0-9_#]*$/);
        if (match !== null) {
          mentionFilter = afterAt;
          lastAtPos = atPos;
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
    const filtered = users.filter(p =>
      p.username.toLowerCase().includes(filter.toLowerCase())
    );
    if (filtered.length === 0) {
      hideMentionDropdown();
      return;
    }
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
    items.forEach((li, i) => {
      li.classList.toggle('active', i === mentionIndex);
    });
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

  // ----- Keyboard Shortcuts -----
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

  // ----- E2EE Implementation (client-side) -----
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

  // ----- FIX: Password visibility toggles -----
  function setupPasswordToggles() {
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    passwordInputs.forEach(input => {
      // Skip if already wrapped
      const wrapper = input.closest('.password-wrapper');
      if (wrapper) return;
      // Create wrapper
      const wrap = document.createElement('div');
      wrap.className = 'password-wrapper';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      // Eye button
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

  // ----- FIX: URL routing and 404 -----
  function routeUrl() {
    const path = window.location.pathname;
    if (path === '/' || path === '') {
      // Normal behavior – show auth or room view based on session
      return;
    }
    // Check for /room/<code>
    const match = path.match(/^\/room\/([a-f0-9]{32})$/);
    if (match) {
      const roomCode = match[1];
      // Auto-join if we have a session
      if (window.sessionToken && window.account) {
        // Wait for room view to be ready
        const checkAndJoin = () => {
          if (document.getElementById('room-view').style.display !== 'none') {
            // Fill room code and trigger join
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
        // No session – redirect to home or show 404? Actually show 404 with a message.
        show404('You need to log in first to join a room.');
        return;
      }
    }
    // Any other path -> 404
    show404('Page not found.');
  }

  function show404(message) {
    const notFound = document.getElementById('notfound-view');
    if (notFound) {
      notFound.style.display = 'flex';
      const p = notFound.querySelector('p');
      if (p && message) p.textContent = message;
      // Hide other views
      document.getElementById('auth-view').style.display = 'none';
      document.getElementById('room-view').style.display = 'none';
      document.getElementById('chat-view').style.display = 'none';
      document.getElementById('manage-room-view').style.display = 'none';
    }
  }

  // Override the "Go back" button in 404 to go to room view or auth
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

  // ----- FIX: Prevent logout on room-not-found WebSocket errors -----
  // We'll intercept WebSocket creation and override onerror/onclose
  let originalWsOpen = null;
  let wsRoomNotFound = false;

  function interceptWebSocketConnection() {
    // Override the connectWebSocket function if it exists
    if (typeof window.connectWebSocket === 'function') {
      const originalConnect = window.connectWebSocket;
      window.connectWebSocket = function(params) {
        // Call original but wrap onerror/onclose
        originalConnect.call(window, params);
        // Now patch the ws instance (will be set after)
        const checkWs = setInterval(() => {
          if (window.ws) {
            clearInterval(checkWs);
            // Store original onerror/onclose
            const origOnError = window.ws.onerror;
            const origOnClose = window.ws.onclose;
            let opened = false;
            window.ws.onopen = function(e) {
              opened = true;
              // Also override the "Connected to room" message
              const roomName = window.currentRoom?.name || 'room';
              // We'll override addSystemMessage for this one call? Better to patch the onopen handler.
              // We'll replace the message after the original onopen.
              // Since we can't modify script.js, we'll override the addSystemMessage temporarily.
              const origAddSys = window.addSystemMessage;
              if (origAddSys) {
                window.addSystemMessage = function(msg) {
                  if (msg.includes('Connected to ')) {
                    msg = `Connected to ${roomName}`;
                  }
                  origAddSys(msg);
                  window.addSystemMessage = origAddSys; // restore
                };
              }
              if (origOnOpen) origOnOpen.call(window.ws, e);
            };
            window.ws.onerror = function(e) {
              if (!opened) {
                // Connection failed before opening -> room not found or network error
                wsRoomNotFound = true;
                // Show 404, but don't log out
                show404('Room not found or network error.');
                // Hide loading
                window.hideLoading && window.hideLoading();
                // Do not call origOnError if it would log out
                return;
              }
              if (origOnError) origOnError.call(window.ws, e);
            };
            window.ws.onclose = function(e) {
              if (wsRoomNotFound) {
                // Already handled, just prevent logout
                wsRoomNotFound = false;
                return;
              }
              if (origOnClose) origOnClose.call(window.ws, e);
            };
          }
        }, 100);
      };
      console.log('[app] Intercepted connectWebSocket');
    } else {
      setTimeout(interceptWebSocketConnection, 200);
    }
  }

  // Also override the original onclose to detect 404 and not log out.
  // This is already handled above.

  // ----- FIX: Loading screen timeout -----
  function setupLoadingTimeout() {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    // If loading stays visible for more than 10 seconds, hide it
    const timeout = setTimeout(() => {
      if (overlay.style.display === 'flex') {
        overlay.style.display = 'none';
        // Also show an error if needed?
        const errorEl = document.getElementById('auth-error') || document.getElementById('room-error');
        if (errorEl && !errorEl.textContent) {
          errorEl.textContent = 'Request timed out. Please try again.';
        }
      }
    }, 10000);
    // Store timeout so we can clear on hide
    const origHide = window.hideLoading;
    window.hideLoading = function() {
      clearTimeout(timeout);
      if (origHide) origHide();
    };
  }

  // ----- Intercept WebSocket messages for typing, user list, e2ee -----
  function interceptWebSocketMessages() {
    // We'll patch ws.onmessage after it's set
    const checkWs = setInterval(() => {
      if (window.ws && typeof window.ws.onmessage === 'function') {
        clearInterval(checkWs);
        const origOnMessage = window.ws.onmessage;
        window.ws.onmessage = function(event) {
          // Call original first
          origOnMessage.call(window.ws, event);
          // Then our extra handling
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
              // Also populate participants from history? Not needed; join/leave events will populate.
            }
          } catch (e) { /* ignore parse errors */ }
        };
      }
    }, 200);
  }

  // ----- Init -----
  function init() {
    // Override addMessage with markdown
    overrideAddMessage();

    // Setup typing
    setupTyping();

    // Setup mentions
    setupMentions();

    // Setup shortcuts
    setupShortcuts();

    // Password toggles
    setupPasswordToggles();

    // URL routing
    routeUrl();

    // Intercept WebSocket connection for 404 and room name fix
    interceptWebSocketConnection();

    // Intercept WebSocket messages for extra features
    interceptWebSocketMessages();

    // Loading timeout
    setupLoadingTimeout();

    // Also override the "Connected to room" message via the onopen patch above
  }

  // Start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose some functions
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