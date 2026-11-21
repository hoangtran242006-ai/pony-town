// ==UserScript==
// @name         Pony Town Magic Link Auto-Recruiter Bot
// @namespace    https://pt.akira-dev.me/
// @version      1.0
// @description  Lắng nghe lệnh -play, -game, -web; tự động tạo Magic Link SHA-256 an toàn và gửi Whisper mời người chơi sang pt.akira-dev.me
// @author       Akira
// @match        https://pony.town/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
  'use strict';

  // Shared Secret with Server & Custom Short Domain
  const MAGIC_SECRET = 'pt_magic_secret_2026_9f82d1c6';
  const BASE_URL = 'https://pt.akira-dev.me/';
  const COOLDOWN_MS = 15000; // 15s spam protection per user

  const playerCooldowns = new Map();

  console.log('%c[PT-BOT] Pony Town Magic Link Bot Loaded! Listening for -play, -game, -web...', 'color: #38bdf8; font-weight: bold; font-size: 14px;');

  /**
   * Generate SHA-256 signature using browser native Web Crypto API
   * Format: First 10 hex characters of SHA-256("${name}|${timestamp}|${MAGIC_SECRET}")
   */
  async function generateSignature(name, timestamp) {
    const data = `${name}|${timestamp}|${MAGIC_SECRET}`;
    const encoder = new TextEncoder();
    const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    const hashArray = Array.from(new Uint8Array(hashBuf));
    const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hex.substring(0, 10);
  }

  /**
   * Extract accurate player name from chat element (handling #2, #3 duplicates and emoji img alt)
   */
  function extractCleanSenderName(nameEl) {
    if (!nameEl) return '';
    const clone = nameEl.cloneNode(true);
    // Replace emoji images with their alt text (e.g. 🍎, 🦄)
    const imgs = clone.querySelectorAll('img');
    imgs.forEach(img => {
      const alt = img.getAttribute('alt') || '';
      img.replaceWith(document.createTextNode(alt));
    });
    // Remove supporter badges or extra UI badges if nested
    const tags = clone.querySelectorAll('.tag, [class*="tag-"], .supporter-tag');
    tags.forEach(t => t.remove());

    return clone.textContent.trim();
  }

  /**
   * Send a chat message or whisper into Pony Town
   */
  function sendChatMessage(text) {
    const chatInput = document.querySelector('input.chat-input, .chat-box input, input[placeholder*="chat" i], input[placeholder*="Say" i], input[type="text"]');
    if (!chatInput) {
      console.warn('[PT-BOT] Chat input element not found!');
      return false;
    }

    // Set input value
    chatInput.focus();
    chatInput.value = text;
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    chatInput.dispatchEvent(new Event('change', { bubbles: true }));

    // Trigger Enter key events
    const enterDown = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
    chatInput.dispatchEvent(enterDown);
    const enterUp = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
    chatInput.dispatchEvent(enterUp);

    return true;
  }

  /**
   * Process incoming chat line
   */
  async function processChatLine(lineEl) {
    if (!lineEl || lineEl.dataset.botSeen) return;
    lineEl.dataset.botSeen = 'true';

    // Find name element and message element
    const nameEl = lineEl.querySelector('.chat-line-name, [class*="chat-line-name"], strong, b');
    const msgEl = lineEl.querySelector('.chat-line-message, [class*="chat-line-message"], .chat-line-text, span:last-child');

    if (!nameEl || !msgEl) return;

    const rawMsg = msgEl.textContent.trim().toLowerCase();
    const senderName = extractCleanSenderName(nameEl);

    if (!senderName) return;

    // Check for bot trigger commands: -play, -game, -web
    const isCommand = rawMsg === '-play' || rawMsg === '-game' || rawMsg === '-web' ||
                      rawMsg.startsWith('-play ') || rawMsg.startsWith('-game ') || rawMsg.startsWith('-web ');

    if (!isCommand) return;

    console.log(`[PT-BOT] Command detected: "${rawMsg}" from "${senderName}"`);

    // Anti-spam cooldown check
    const now = Date.now();
    const lastActive = playerCooldowns.get(senderName.toLowerCase()) || 0;
    if (now - lastActive < COOLDOWN_MS) {
      console.log(`[PT-BOT] Player "${senderName}" is on cooldown (${Math.ceil((COOLDOWN_MS - (now - lastActive)) / 1000)}s left).`);
      return;
    }
    playerCooldowns.set(senderName.toLowerCase(), now);

    // Build Signed Magic Link
    const timestampSec = Math.floor(now / 1000);
    const signature = await generateSignature(senderName, timestampSec);
    const magicLink = `${BASE_URL}?u=${encodeURIComponent(senderName)}&t=${timestampSec}&s=${signature}`;

    // Click on name to enter Whisper mode with player
    try {
      nameEl.click();
    } catch (e) {
      console.warn('[PT-BOT] Could not click sender name plate:', e);
    }

    // Wait 120ms for whisper channel switch, then dispatch message
    setTimeout(() => {
      // Craft concise message ensuring total length <= 80 characters
      let whisperText = `Vao choi: ${magicLink}`;
      if (whisperText.length > 80) {
        // Fallback to bare link if sender name is long
        whisperText = magicLink;
      }

      const sent = sendChatMessage(whisperText);
      if (sent) {
        console.log(`%c[PT-BOT] Successfully whispered link (${whisperText.length} chars) to ${senderName}: ${whisperText}`, 'color: #10b981; font-weight: bold;');
      }
    }, 150);
  }

  /**
   * Chat DOM Observer Setup
   */
  function initChatObserver() {
    const chatContainer = document.querySelector('.chat-log, [class*="chat-log"], [class*="chatLog"], .chat-messages') || document.body;
    console.log('[PT-BOT] Observing chat container:', chatContainer);

    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            processChatLine(node);
            const subLines = node.querySelectorAll('.chat-line, [class*="chat-line"]');
            subLines.forEach(processChatLine);
          }
        }
      }
    });

    observer.observe(chatContainer, { childList: true, subtree: true });

    // Anti-AFK keepalive ping every 90 seconds
    setInterval(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 200, bubbles: true }));
    }, 90000);
  }

  // Startup hook
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatObserver);
  } else {
    initChatObserver();
  }
})();
