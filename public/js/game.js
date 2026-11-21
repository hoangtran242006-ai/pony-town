/**
 * Pony Town Core Game Engine & Main Loop
 * Handles camera, player physics, input handling, entity management, and rendering.
 */

class GameEngine {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    if (this.ctx) this.ctx.imageSmoothingEnabled = false;

    // Subsystems
    this.world = new World();
    this.net = new NetClient(this);
    this.chat = new ChatSystem(this);
    this.customizer = new CharacterCustomizer(this);

    // Characters & local player state
    this.characters = [];
    this.activeCharacter = null;
    this.localPlayer = null;
    this.remotePlayers = new Map(); // id -> pony data

    // Camera
    this.camera = {
      x: 60,
      y: 45,
      zoom: 3.0,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      worldToScreen: (wx, wy) => {
        const cx = this.camera.viewportWidth / 2;
        const cy = this.camera.viewportHeight / 2;
        const sx = cx + (wx - this.camera.x) * (this.world.tileSize * this.camera.zoom);
        const sy = cy + (wy - this.camera.y) * (this.world.tileSize * this.camera.zoom);
        return { x: sx, y: sy };
      },
      screenToWorld: (sx, sy) => {
        const cx = this.camera.viewportWidth / 2;
        const cy = this.camera.viewportHeight / 2;
        const wx = this.camera.x + (sx - cx) / (this.world.tileSize * this.camera.zoom);
        const wy = this.camera.y + (sy - cy) / (this.world.tileSize * this.camera.zoom);
        return { x: wx, y: wy };
      }
    };

    // Input state
    this.keys = {};
    this.targetPos = null; // Click-to-move target
    this.isRunning = false;
    this.lastTime = 0;
    this.animFrameCount = 0;

    // Audio step tracking
    this.stepDistance = 0;

    this.init();
  }

  async init() {
    this.setupResize();
    this.setupInputs();
    this.setupUI();

    // Fetch characters from server
    await this.fetchCharacters();

    // Start render loop
    requestAnimationFrame((t) => this.loop(t));
  }

  setupResize() {
    const resize = () => {
      if (!this.canvas) return;
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.camera.viewportWidth = window.innerWidth;
      this.camera.viewportHeight = window.innerHeight;
      if (this.ctx) this.ctx.imageSmoothingEnabled = false;
    };
    window.addEventListener('resize', resize);
    resize();
  }

  setupInputs() {
    // Keyboard inputs
    window.addEventListener('keydown', (e) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      this.keys[e.code] = true;

      // Hotkey Actions
      switch (e.code) {
        case 'KeyF':
          this.toggleFly();
          break;
        case 'KeyX':
          this.triggerAction('sit');
          break;
        case 'KeyC':
          this.triggerAction('lie');
          break;
        case 'KeyZ':
          this.triggerAction('sleep');
          break;
        case 'KeyB':
          this.triggerAction('boop');
          break;
        case 'KeyL':
          this.triggerAction('laugh');
          break;
        case 'KeyK':
          this.triggerAction('cry');
          break;
        case 'KeyY':
          this.triggerAction('yawn');
          break;
        case 'KeyE':
          this.interactNearestItem();
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    // Mouse / Touch click-to-move & interaction
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.isRunning) {
        Audio.init(); // initialize audio context on user interaction
        const worldPos = this.camera.screenToWorld(e.clientX, e.clientY);
        this.targetPos = worldPos;

        // Check if clicked near an interactive item
        const item = this.world.getNearbyItem(worldPos.x, worldPos.y, 1.2);
        if (item) {
          this.pickupItem(item.id);
        }
      }
    });
  }

  setupUI() {
    // Play button
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        Audio.init();
        this.startGame();
      });
    }

    // Customize button on start screen
    const custBtn = document.getElementById('customizeBtn');
    if (custBtn) {
      custBtn.addEventListener('click', () => {
        this.customizer.open(this.activeCharacter);
      });
    }

    // Action bar buttons
    document.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = btn.dataset.action;
        if (action === 'fly') this.toggleFly();
        else if (action === 'interact') this.interactNearestItem();
        else if (action === 'roll') {
          const val = Math.floor(Math.random() * 100) + 1;
          this.net.sendChat(`Rolled ${val} of 100`);
        } else this.triggerAction(action);
      });
    });

    // Minimap toggle
    const minimapBtn = document.getElementById('minimapToggleBtn');
    const minimapEl = document.getElementById('minimap-container');
    if (minimapBtn && minimapEl) {
      minimapBtn.addEventListener('click', () => {
        minimapEl.style.display = minimapEl.style.display === 'block' ? 'none' : 'block';
      });
    }

    // Settings Modal
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const settingsClose = document.getElementById('settingsCloseBtn');
    if (settingsBtn && settingsModal) {
      settingsBtn.addEventListener('click', () => settingsModal.classList.add('open'));
    }
    if (settingsClose && settingsModal) {
      settingsClose.addEventListener('click', () => settingsModal.classList.remove('open'));
    }

    // Volume sliders
    const musicSlider = document.getElementById('musicVolSlider');
    if (musicSlider) {
      musicSlider.addEventListener('input', (e) => Audio.setMusicVolume(parseFloat(e.target.value)));
    }
    const sfxSlider = document.getElementById('sfxVolSlider');
    if (sfxSlider) {
      sfxSlider.addEventListener('input', (e) => Audio.setSfxVolume(parseFloat(e.target.value)));
    }
  }

  isModalOpen() {
    return document.querySelector('.modal.open') !== null;
  }

  async fetchCharacters() {
    try {
      const res = await fetch('/api/account-characters');
      const data = await res.json();
      this.characters = data || [];
      if (this.characters.length > 0) {
        this.selectCharacter(this.characters[0]);
      }
    } catch (e) {
      console.warn('Failed to fetch characters, using default:', e);
      this.characters = [this.customizer.createDefaultPony()];
      this.selectCharacter(this.characters[0]);
    }
  }

  selectCharacter(char) {
    this.activeCharacter = char;

    // Update lobby preview
    const nameEl = document.getElementById('lobbyPonyName');
    const typeEl = document.getElementById('lobbyPonyType');
    const previewCanvas = document.getElementById('lobbyPreviewCanvas');

    if (nameEl) nameEl.textContent = char.name;
    if (typeEl) typeEl.textContent = char.type.toUpperCase() + ' PONY';

    if (previewCanvas) {
      const pctx = previewCanvas.getContext('2d');
      pctx.imageSmoothingEnabled = false;
      pctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      Sprites.drawPony(pctx, { ...char, dir: 'right' }, previewCanvas.width / 2, previewCanvas.height / 2 + 10, 3);
    }
  }

  async saveCharacter(character) {
    try {
      const res = await fetch('/api/pony/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(character)
      });
      const data = await res.json();
      if (data.characters) this.characters = data.characters;
      this.selectCharacter(character);

      // If already playing, update local player look
      if (this.localPlayer) {
        this.localPlayer.name = character.name;
        this.localPlayer.type = character.type;
        this.localPlayer.colors = character.colors;
        this.localPlayer.style = character.style;
      }
    } catch (e) {
      console.error('Failed to save character:', e);
    }
  }

  startGame() {
    // Hide start overlay
    const overlay = document.getElementById('startOverlay');
    if (overlay) overlay.classList.add('hidden');

    this.isRunning = true;

    // Initialize local player entity
    this.localPlayer = {
      id: 'self',
      name: this.activeCharacter.name,
      type: this.activeCharacter.type,
      colors: this.activeCharacter.colors,
      style: this.activeCharacter.style,
      x: this.world.spawn.x,
      y: this.world.spawn.y,
      vx: 0,
      vy: 0,
      dir: 'down',
      state: 'stand',
      action: 'idle',
      frame: 0,
      itemInMouth: null
    };

    this.camera.x = this.localPlayer.x;
    this.camera.y = this.localPlayer.y;

    // Connect to WebSocket server
    this.net.connect();

    // Update HUD profile
    const hudName = document.getElementById('hudPlayerName');
    if (hudName) hudName.textContent = this.localPlayer.name;
  }

  onConnected() {
    const badge = document.getElementById('hudOnlineStatus');
    if (badge) badge.innerHTML = '<span class="server-dot"></span> Online';
  }

  onDisconnected() {
    const badge = document.getElementById('hudOnlineStatus');
    if (badge) badge.innerHTML = '<span class="server-dot" style="background:#e74c3c;box-shadow:0 0 8px #e74c3c"></span> Connecting...';
  }

  initWorldFromNet(data) {
    if (data.items) this.world.items = data.items;
    if (data.players) {
      for (const p of data.players) {
        if (p.id !== this.net.selfId) {
          this.remotePlayers.set(p.id, p);
        }
      }
    }
    this.updateOnlineCounter();
  }

  addRemotePlayer(player) {
    this.remotePlayers.set(player.id, player);
    this.updateOnlineCounter();
  }

  removeRemotePlayer(id) {
    this.remotePlayers.delete(id);
    this.updateOnlineCounter();
  }

  updateRemotePlayerMove(data) {
    const p = this.remotePlayers.get(data.id);
    if (p) {
      p.x = data.x;
      p.y = data.y;
      p.vx = data.vx;
      p.vy = data.vy;
      p.dir = data.dir;
      p.state = data.state;
      p.action = data.action;
    }
  }

  updateRemotePlayerAction(data) {
    const p = this.remotePlayers.get(data.id);
    if (p) {
      p.action = data.action;
      if (data.state) p.state = data.state;
      if (data.action === 'boop') Audio.playBoop();
      else if (data.action === 'eat') Audio.playAppleCrunch();
      else if (data.action === 'fly') Audio.playWingFlap();
    }
  }

  updateOnlineCounter() {
    const countEl = document.getElementById('hudOnlineCount');
    if (countEl) {
      countEl.textContent = `${this.remotePlayers.size + 1} online`;
    }
  }

  onItemPicked(data) {
    this.world.items = this.world.items.filter(i => i.id !== data.itemId);
    if (data.playerId === this.net.selfId) {
      this.localPlayer.itemInMouth = data.itemType;
    } else {
      const p = this.remotePlayers.get(data.playerId);
      if (p) p.itemInMouth = data.itemType;
    }
  }

  onItemSpawned(item) {
    this.world.items.push(item);
  }

  getPonyById(id) {
    if (id === this.net.selfId || id === 'self') return this.localPlayer;
    return this.remotePlayers.get(id);
  }

  // ==========================================
  // Player Actions
  // ==========================================
  toggleFly() {
    if (!this.localPlayer) return;
    if (this.localPlayer.type !== 'pegasus' && this.localPlayer.type !== 'alicorn') {
      this.chat.addBubble('self', this.localPlayer.name, "*flaps hooves, but only pegasi can fly!*", 'public');
      return;
    }

    const isFlying = this.localPlayer.state === 'fly';
    this.localPlayer.state = isFlying ? 'stand' : 'fly';
    this.localPlayer.action = 'idle';

    Audio.playWingFlap();
    this.net.sendAction('fly', this.localPlayer.state);
  }

  triggerAction(action) {
    if (!this.localPlayer) return;

    if (this.localPlayer.action === action) {
      this.localPlayer.action = 'idle'; // toggle off
    } else {
      this.localPlayer.action = action;
      if (action === 'sit' || action === 'lie' || action === 'sleep') {
        this.localPlayer.state = 'stand'; // grounded
      }
    }

    if (action === 'boop') Audio.playBoop();

    this.net.sendAction(this.localPlayer.action, this.localPlayer.state);
  }

  pickupItem(itemId) {
    this.net.sendInteract(itemId, 'pickup');
  }

  interactNearestItem() {
    if (!this.localPlayer) return;

    // If already holding item, eat or drop it
    if (this.localPlayer.itemInMouth) {
      const action = this.localPlayer.itemInMouth === 'apple' ? 'eat' : 'drop';
      if (action === 'eat') Audio.playAppleCrunch();
      this.net.sendInteract(null, action);
      this.localPlayer.itemInMouth = null;
      return;
    }

    // Try to pick up nearest item
    const item = this.world.getNearbyItem(this.localPlayer.x, this.localPlayer.y, 2.0);
    if (item) {
      this.pickupItem(item.id);
    }
  }

  // ==========================================
  // Main Update & Physics Loop
  // ==========================================
  update(dt) {
    if (!this.isRunning || !this.localPlayer) return;

    this.animFrameCount++;
    this.world.update(dt);
    this.chat.update();

    const speed = this.localPlayer.state === 'fly' ? 6.5 : 4.5;
    let dx = 0;
    let dy = 0;

    // Keyboard movement
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) dx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) dx += 1;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) dy -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) dy += 1;

    // Mouse click-to-move interpolation
    if (this.targetPos) {
      const dist = Math.hypot(this.targetPos.x - this.localPlayer.x, this.targetPos.y - this.localPlayer.y);
      if (dist > 0.4) {
        dx = (this.targetPos.x - this.localPlayer.x) / dist;
        dy = (this.targetPos.y - this.localPlayer.y) / dist;
      } else {
        this.targetPos = null;
      }
    }

    // Normalize diagonal velocity
    if (dx !== 0 && dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
    }

    // Movement state & direction
    const isMoving = dx !== 0 || dy !== 0;
    if (isMoving) {
      // Cancel resting actions when walking
      if (['sit', 'lie', 'sleep'].includes(this.localPlayer.action)) {
        this.localPlayer.action = 'idle';
      }

      if (Math.abs(dx) > Math.abs(dy)) {
        this.localPlayer.dir = dx < 0 ? 'left' : 'right';
      } else {
        this.localPlayer.dir = dy < 0 ? 'up' : 'down';
      }

      if (this.localPlayer.state !== 'fly') {
        this.localPlayer.state = 'trot';
      }

      // Trot hoofstep sounds
      this.stepDistance += speed * dt;
      if (this.stepDistance > 1.2 && this.localPlayer.state !== 'fly') {
        this.stepDistance = 0;
        const curTile = this.world.tiles[Math.floor(this.localPlayer.y)]?.[Math.floor(this.localPlayer.x)] || 'grass';
        Audio.playHoofStep(curTile);
      }
    } else {
      if (this.localPlayer.state !== 'fly') {
        this.localPlayer.state = 'stand';
      }
    }

    // Collision check & sliding movement
    const isFlying = this.localPlayer.state === 'fly';
    const newX = this.localPlayer.x + dx * speed * dt;
    const newY = this.localPlayer.y + dy * speed * dt;

    if (this.world.isPassable(newX, this.localPlayer.y, isFlying)) {
      this.localPlayer.x = newX;
    }
    if (this.world.isPassable(this.localPlayer.x, newY, isFlying)) {
      this.localPlayer.y = newY;
    }

    this.localPlayer.vx = dx * speed;
    this.localPlayer.vy = dy * speed;
    this.localPlayer.frame = this.animFrameCount;

    // Send move packet to server
    this.net.sendMove(
      this.localPlayer.x,
      this.localPlayer.y,
      this.localPlayer.vx,
      this.localPlayer.vy,
      this.localPlayer.dir,
      this.localPlayer.state
    );

    // Smooth camera tracking (lerp)
    this.camera.x += (this.localPlayer.x - this.camera.x) * 0.12;
    this.camera.y += (this.localPlayer.y - this.camera.y) * 0.12;
  }

  // ==========================================
  // Render Pipeline
  // ==========================================
  render() {
    if (!this.ctx || !this.canvas) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    // 1. Render World Ground Tiles & items
    this.world.renderGround(this.ctx, this.camera);

    // 2. Y-sorted Entity Render Queue (Trees, Lanterns, Ponies)
    const renderQueue = [];

    // Add Y-obstacles
    for (const tree of this.world.trees) {
      renderQueue.push({ type: 'tree', y: tree.y, obj: tree });
    }
    for (const lantern of this.world.lanterns) {
      renderQueue.push({ type: 'lantern', y: lantern.y, obj: lantern });
    }

    // Add Remote Players & NPCs
    for (const p of this.remotePlayers.values()) {
      renderQueue.push({ type: 'pony', y: p.y, obj: p });
    }

    // Add Local Player
    if (this.localPlayer) {
      renderQueue.push({ type: 'pony', y: this.localPlayer.y, obj: this.localPlayer, isSelf: true });
    }

    // Sort entities from top to bottom (Y-sorting for depth)
    renderQueue.sort((a, b) => a.y - b.y);

    // Render sorted entities
    for (const item of renderQueue) {
      if (item.type === 'tree') {
        const screen = this.camera.worldToScreen(item.obj.x, item.obj.y);
        Sprites.drawTree(this.ctx, screen.x, screen.y, item.obj.apples || 0, this.camera.zoom * 0.7);
      } else if (item.type === 'lantern') {
        const screen = this.camera.worldToScreen(item.obj.x, item.obj.y);
        Sprites.drawLantern(this.ctx, screen.x, screen.y, this.world.isNightTime());
      } else if (item.type === 'pony') {
        const p = item.obj;
        const screen = this.camera.worldToScreen(p.x, p.y);
        Sprites.drawPony(this.ctx, p, screen.x, screen.y, this.camera.zoom);

        // Name tag & badge
        this.ctx.save();
        this.ctx.font = 'bold 12px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = item.isSelf ? '#ffe066' : (p.isNpc ? '#85e085' : '#ffffff');
        this.ctx.shadowColor = 'rgba(0,0,0,0.8)';
        this.ctx.shadowBlur = 4;
        this.ctx.fillText(p.name, screen.x, screen.y - 28 * this.camera.zoom);
        this.ctx.restore();

        // Emote effect (hearts, zzz, tears)
        if (p.action && p.action !== 'idle') {
          Sprites.drawEmoteEffect(this.ctx, p.action, screen.x, screen.y, this.animFrameCount);
        }
      }
    }

    // 3. Render Speech Bubbles
    this.chat.renderBubbles(this.ctx, this.camera);

    // 4. Apply Day / Night lighting overlay
    this.world.renderLighting(this.ctx, w, h);

    // 5. Render Minimap
    this.renderMinimap();
  }

  renderMinimap() {
    const mCanvas = document.getElementById('minimapCanvas');
    if (!mCanvas || mCanvas.parentElement.style.display !== 'block') return;

    const mctx = mCanvas.getContext('2d');
    const mw = mCanvas.width;
    const mh = mCanvas.height;
    mctx.clearRect(0, 0, mw, mh);

    // Scale map to minimap size
    const sx = mw / this.world.width;
    const sy = mh / this.world.height;

    // Background
    mctx.fillStyle = '#4c782b';
    mctx.fillRect(0, 0, mw, mh);

    // River
    mctx.fillStyle = '#3975b0';
    for (let y = 0; y < this.world.height; y++) {
      const rc = Math.floor(32 + Math.sin(y * 0.1) * 3);
      mctx.fillRect((rc - 2) * sx, y * sy, 4 * sx, sy);
    }

    // Plaza
    mctx.fillStyle = '#85929e';
    mctx.fillRect(54 * sx, 41 * sy, 12 * sx, 8 * sy);

    // Remote players (green dots)
    mctx.fillStyle = '#2ecc71';
    for (const p of this.remotePlayers.values()) {
      mctx.fillRect(p.x * sx - 1, p.y * sy - 1, 3, 3);
    }

    // Local player (yellow pulsing dot)
    if (this.localPlayer) {
      mctx.fillStyle = '#f1c40f';
      mctx.fillRect(this.localPlayer.x * sx - 2, this.localPlayer.y * sy - 2, 5, 5);
    }
  }

  loop(currentTime) {
    if (!this.lastTime) this.lastTime = currentTime;
    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    this.update(dt);
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  window.Game = new GameEngine();
});
