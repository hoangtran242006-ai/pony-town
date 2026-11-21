/**
 * Pony Town Chat & Speech Bubble System
 * Renders in-game speech bubbles over ponies and manages the HUD chat box.
 */

class ChatSystem {
  constructor(game) {
    this.game = game;
    this.bubbles = []; // Array of { playerId, senderName, text, chatType, createdAt, duration }
    this.activeTab = 'all'; // 'all', 'whisper', 'party'

    this.chatLogEl = document.getElementById('chat-log');
    this.chatInputEl = document.getElementById('chatInput');
    this.chatModePillEl = document.getElementById('chatModePill');

    this.setupListeners();
  }

  setupListeners() {
    if (!this.chatInputEl) return;

    this.chatInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submitMessage();
      } else if (e.key === 'Escape') {
        this.chatInputEl.blur();
      }
    });

    if (this.chatModePillEl) {
      this.chatModePillEl.addEventListener('click', () => {
        // Toggle whisper / public mode
        if (this.chatInputEl.value.startsWith('/w ')) {
          this.chatInputEl.value = '';
          this.chatModePillEl.textContent = 'Say';
        } else {
          this.chatInputEl.value = '/w ';
          this.chatModePillEl.textContent = 'Whisper';
          this.chatInputEl.focus();
        }
      });
    }

    // Enter key anywhere unfocuses or focuses chat
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && document.activeElement !== this.chatInputEl) {
        if (!this.game.isModalOpen()) {
          e.preventDefault();
          this.chatInputEl.focus();
        }
      }
    });
  }

  submitMessage() {
    const text = this.chatInputEl.value.trim();
    if (!text) {
      this.chatInputEl.blur();
      return;
    }

    this.chatInputEl.value = '';
    this.chatInputEl.blur();

    // Send through network
    this.game.net.sendChat(text);
  }

  // Handle incoming chat packet from server
  receiveChat(msg) {
    const { senderId, senderName, text, chatType = 'public', isEcho, delivered, recipientName } = msg;

    // 1. Add speech bubble in world (for public messages)
    if (chatType === 'public') {
      this.addBubble(senderId, senderName, text, chatType);
    } else if (chatType === 'whisper') {
      // Show whisper bubble locally if we are sender or recipient
      this.addBubble(senderId, `Whisper to ${recipientName}`, text, 'whisper');
    }

    // 2. Play soft bubble pop sound
    Audio.playChatPop();

    // 3. Append to HUD chat log
    this.appendToLog(msg);
  }

  addBubble(senderId, senderName, text, chatType) {
    // Remove previous bubble from same sender
    this.bubbles = this.bubbles.filter(b => b.senderId !== senderId);

    this.bubbles.push({
      senderId,
      senderName,
      text,
      chatType,
      createdAt: Date.now(),
      duration: Math.max(5000, text.length * 120) // at least 5s, longer for long text
    });
  }

  update() {
    const now = Date.now();
    this.bubbles = this.bubbles.filter(b => now - b.createdAt < b.duration);
  }

  /**
   * Render speech bubbles above ponies in screen space
   */
  renderBubbles(ctx, camera) {
    const now = Date.now();

    for (const b of this.bubbles) {
      // Find pony position
      const pony = this.game.getPonyById(b.senderId);
      if (!pony) continue;

      const screen = camera.worldToScreen(pony.x, pony.y);
      const isWhisper = b.chatType === 'whisper';

      // Bubble position right above head
      const bubbleX = screen.x;
      const bubbleY = screen.y - (38 * camera.zoom);

      // Measure text width
      ctx.save();
      ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const maxW = 200;
      const words = b.text.split(' ');
      const lines = [];
      let curLine = '';

      for (const w of words) {
        const testLine = curLine ? `${curLine} ${w}` : w;
        if (ctx.measureText(testLine).width > maxW) {
          lines.push(curLine);
          curLine = w;
        } else {
          curLine = testLine;
        }
      }
      if (curLine) lines.push(curLine);

      let textWidth = 0;
      for (const l of lines) {
        textWidth = Math.max(textWidth, ctx.measureText(l).width);
      }

      const padX = 10;
      const padY = 6;
      const boxW = textWidth + padX * 2;
      const boxH = lines.length * 18 + padY * 2;
      const boxX = bubbleX - boxW / 2;
      const boxY = bubbleY - boxH;

      // Fade out in last 0.8s
      const elapsed = now - b.createdAt;
      const remaining = b.duration - elapsed;
      const alpha = remaining < 800 ? remaining / 800 : 1.0;
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

      // Draw bubble background (Pixel rounded border)
      ctx.fillStyle = isWhisper ? 'rgba(40, 20, 45, 0.95)' : 'rgba(25, 25, 30, 0.92)';
      ctx.strokeStyle = isWhisper ? '#ff80df' : '#e6c880';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 8);
      ctx.fill();
      ctx.stroke();

      // Tail pointing to pony head
      ctx.fillStyle = isWhisper ? '#ff80df' : '#e6c880';
      ctx.beginPath();
      ctx.moveTo(bubbleX - 4, bubbleY);
      ctx.lineTo(bubbleX + 4, bubbleY);
      ctx.lineTo(bubbleX, bubbleY + 5);
      ctx.fill();

      // Draw text lines
      ctx.fillStyle = isWhisper ? '#ffc2f4' : '#ffffff';
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], boxX + padX, boxY + padY + (i + 1) * 14);
      }

      ctx.restore();
    }
  }

  appendToLog(msg) {
    if (!this.chatLogEl) return;

    const row = document.createElement('div');
    row.className = `chat-msg ${msg.chatType || 'public'}`;

    if (msg.chatType === 'whisper') {
      if (msg.isEcho) {
        row.innerHTML = `<span class="name">[To ${msg.recipientName}]:</span> ${this.escapeHtml(msg.text)}`;
      } else {
        row.innerHTML = `<span class="name">[From ${msg.senderName}]:</span> ${this.escapeHtml(msg.text)}`;
      }
    } else {
      row.innerHTML = `<span class="name">${this.escapeHtml(msg.senderName)}:</span> ${this.escapeHtml(msg.text)}`;
    }

    this.chatLogEl.appendChild(row);
    this.chatLogEl.scrollTop = this.chatLogEl.scrollHeight;
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
