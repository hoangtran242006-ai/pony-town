/**
 * Pony Town WebSocket Network Client
 * Handles real-time synchronization between player and game server.
 */

class NetClient {
  constructor(game) {
    this.game = game;
    this.ws = null;
    this.connected = false;
    this.selfId = null;
    this.reconnectTimer = null;

    // Movement throttling
    this.lastSentMove = 0;
    this.moveThrottleMs = 60; // 16 updates / sec
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    console.log(`[Net] Connecting to ${wsUrl}...`);
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[Net] Connected to game server!');
        this.connected = true;
        this.game.onConnected();

        // Send Join packet with active character
        const char = this.game.activeCharacter;
        this.send({
          type: 'join',
          name: char.name,
          ponyType: char.type,
          colors: char.colors,
          style: char.style
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (e) {
          console.error('[Net] Error parsing packet:', e);
        }
      };

      this.ws.onclose = () => {
        console.warn('[Net] Connection closed.');
        this.connected = false;
        this.game.onDisconnected();
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[Net] WebSocket error:', err);
      };
    } catch (e) {
      console.error('[Net] Failed to instantiate WebSocket:', e);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.connected) {
        this.connect();
      }
    }, 2500);
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'init': {
        this.selfId = msg.selfId;
        this.game.initWorldFromNet(msg);
        break;
      }

      case 'player_joined': {
        this.game.addRemotePlayer(msg.player);
        break;
      }

      case 'player_left': {
        this.game.removeRemotePlayer(msg.id);
        break;
      }

      case 'move': {
        this.game.updateRemotePlayerMove(msg);
        break;
      }

      case 'action': {
        this.game.updateRemotePlayerAction(msg);
        break;
      }

      case 'chat': {
        this.game.chat.receiveChat(msg);
        break;
      }

      case 'item_picked': {
        this.game.onItemPicked(msg);
        break;
      }

      case 'item_spawned': {
        this.game.onItemSpawned(msg.item);
        break;
      }
    }
  }

  // Outgoing actions
  sendMove(x, y, vx, vy, dir, state) {
    const now = Date.now();
    if (now - this.lastSentMove < this.moveThrottleMs) return;
    this.lastSentMove = now;

    this.send({
      type: 'move',
      x,
      y,
      vx,
      vy,
      dir,
      state
    });
  }

  sendAction(action, state = null, extra = null) {
    this.send({
      type: 'action',
      action,
      state,
      extra
    });
  }

  sendChat(text) {
    this.send({
      type: 'chat',
      text
    });
  }

  sendInteract(itemId, action) {
    this.send({
      type: 'interact',
      itemId,
      action
    });
  }
}
