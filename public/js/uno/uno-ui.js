class UnoUI {
  constructor() {
    this.client = new UnoClient();
    this.state = null;
    this.roomId = null;
    this.tableId = null;
    this.tables = [];
    this.pendingWild = null;
    this.nearbySeat = null;
    this.build();
    window.addEventListener('uno-message', e => this.handle(e.detail));
    this.client.connect();
    this.proximityTimer = setInterval(() => this.client.send({ type: 'uno_tables' }), 1000);
  }

  build() {
    const host = document.createElement('div');
    host.id = 'uno-root';
    host.innerHTML = `
      <button id="uno-world-button" class="uno-world-button" type="button" aria-label="Sit at UNO table">SIT / UNO</button>
      <div id="uno-modal" class="uno-modal" aria-hidden="true">
        <div class="uno-window">
          <header class="uno-titlebar">
            <span>UNO table</span>
            <button id="uno-close" type="button" aria-label="Close UNO">X</button>
          </header>
          <div id="uno-content" class="uno-content"></div>
        </div>
      </div>`;
    document.body.appendChild(host);
    document.getElementById('uno-world-button').addEventListener('click', () => this.open());
    document.getElementById('uno-close').addEventListener('click', () => this.close());
  }

  openAtSeat(seatInfo) {
    this.tableId = seatInfo.table.id;
    this.seatIndex = seatInfo.index;
    this.open(this.tableId);
  }

  setNearbySeat(seatInfo) {
    this.nearbySeat = seatInfo;
    const button = document.getElementById('uno-world-button');
    if (!button) return;
    button.classList.toggle('visible', !!seatInfo);
    button.textContent = seatInfo ? 'SIT / UNO' : 'UNO';
    button.onclick = () => seatInfo ? this.sitAtSeat(seatInfo) : null;
  }

  sitAtSeat(seatInfo) {
    this.client.send({
      type: 'uno_sit',
      tableId: seatInfo.table.id,
      seatIndex: seatInfo.index
    });
  }

  open(tableId = 'plaza-north') {
    this.tableId = tableId;
    document.getElementById('uno-modal').classList.add('open');
    document.getElementById('uno-modal').setAttribute('aria-hidden', 'false');
    this.client.send({ type: 'uno_tables' });
  }

  close() {
    document.getElementById('uno-modal').classList.remove('open');
    document.getElementById('uno-modal').setAttribute('aria-hidden', 'true');
  }

  handle(msg) {
    if (msg.type === 'uno_tables') {
      this.tables = msg.tables;
      const nearby = this.tables.find(table => table.nearbySeatIndex !== null);
      if (nearby) {
        this.tableId = nearby.id;
        this.seatIndex = nearby.nearbySeatIndex;
        this.setNearbySeat({
          table: nearby,
          seat: nearby.seats[nearby.nearbySeatIndex],
          index: nearby.nearbySeatIndex
        });
      } else {
        this.setNearbySeat(null);
      }
      if (!this.state && document.getElementById('uno-modal')?.classList.contains('open')) this.renderLobby();
    } else if (msg.type === 'uno_seated') {
      this.tableId = msg.tableId;
      this.seatIndex = msg.seatIndex;
      this.open(this.tableId);
    } else if (msg.type === 'uno_created') {
      this.roomId = msg.roomId;
      this.tableId = msg.tableId;
    } else if (msg.type === 'uno_state') {
      this.roomId = msg.roomId;
      this.state = msg.state;
      this.renderGame();
    } else if (msg.type === 'uno_error') {
      this.showToast(msg.error);
    } else if (msg.type === 'uno_invite') {
      if (confirm(`${msg.from} invited you to UNO. Join?`)) {
        this.open(msg.tableId);
        this.roomId = msg.roomId;
        this.client.send({ type: 'uno_join', roomId: msg.roomId, seatIndex: this.seatIndex });
      }
    }
  }

  renderLobby() {
    if (document.querySelector('.uno-modal')?.classList.contains('open') && !this.state) {
      const table = this.tables.find(t => t.id === this.tableId) || this.tables[0];
      const rooms = table?.rooms || [];
      const content = document.getElementById('uno-content');
      content.innerHTML = `
        <div class="uno-lobby">
          <div class="uno-lobby-table">
            <div class="uno-table-top"><span>UNO</span></div>
            <div class="uno-seats">${[0,1,2,3].map(() => '<i></i>').join('')}</div>
          </div>
          <div class="uno-lobby-panel">
            <h2>Waiting rooms</h2>
            <div id="uno-room-list"></div>
            <div class="uno-settings">
              <label>Players <select id="uno-max"><option>2</option><option>3</option><option selected>4</option></select></label>
              <label>Turn <select id="uno-time"><option value="20">20 sec</option><option value="30" selected>30 sec</option><option value="60">60 sec</option></select></label>
              <label><input id="uno-bots" type="checkbox"> Allow bots</label>
            </div>
            <button id="uno-create" class="uno-button uno-button-primary" type="button">Create room</button>
          </div>
        </div>`;
      document.getElementById('uno-create').onclick = () => {
        this.client.send({
          type: 'uno_create',
          tableId: this.tableId,
          seatIndex: this.seatIndex,
          settings: {
            maxPlayers: Number(document.getElementById('uno-max').value),
            turnTime: Number(document.getElementById('uno-time').value),
            allowBots: document.getElementById('uno-bots').checked
          }
        });
      };
      const list = document.getElementById('uno-room-list');
      if (!rooms.length) list.innerHTML = '<p class="uno-muted">No rooms yet.</p>';
      rooms.forEach(room => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'uno-room-row';
        button.textContent = `${room.ownerName} — ${room.playerCount}/${room.maxPlayers}`;
        button.onclick = () => {
          this.roomId = room.id;
          this.client.send({ type: 'uno_join', roomId: room.id, seatIndex: this.seatIndex });
        };
        list.appendChild(button);
      });
    }
  }

  renderGame() {
    if (!this.state) return;
    const s = this.state;
    const content = document.getElementById('uno-content');
    if (s.status === 'waiting') {
      content.innerHTML = `
        <div class="uno-game">
          <div class="uno-player-ring">
            ${s.players.map((p, i) => `<div class="uno-player uno-seat-${i}">
              <span class="uno-avatar">${this.initial(p.name)}</span>
              <span class="uno-player-name">${this.escape(p.name)}</span>
              <span class="uno-card-count">${p.cardCount}</span>
            </div>`).join('')}
          </div>
          <div class="uno-center"><div class="uno-turn">Waiting for players...</div></div>
          <div class="uno-actions">
            <button id="uno-start" class="uno-button uno-button-primary" type="button">Start</button>
            <button id="uno-leave" class="uno-button" type="button">Leave</button>
          </div>
        </div>`;
      document.getElementById('uno-start').onclick = () => this.client.send({ type: 'uno_start' });
      document.getElementById('uno-leave').onclick = () => {
        this.client.send({ type: 'uno_leave' });
        this.state = null;
        this.roomId = null;
        this.renderLobby();
      };
      return;
    }
    content.innerHTML = `
      <div class="uno-game">
        <div class="uno-player-ring">
          ${s.players.map((p, i) => `<div class="uno-player uno-seat-${i}${p.id === s.currentPlayerId ? ' active' : ''}">
            <span class="uno-avatar">${this.initial(p.name)}</span>
            <span class="uno-player-name">${this.escape(p.name)}</span>
            <span class="uno-card-count">${p.cardCount}</span>
            ${p.unoCalled ? '<span class="uno-called">UNO</span>' : ''}
            ${p.cardCount === 1 && !p.unoCalled ? `<button class="uno-catch" type="button" data-target="${p.id}">Catch</button>` : ''}
          </div>`).join('')}
        </div>
        <div class="uno-center">
          <div class="uno-piles">
            <button id="uno-draw" class="uno-card uno-card-back" type="button" aria-label="Draw card"><span>UNO</span></button>
            ${UnoCards.el(s.topCard, { small: true }).outerHTML}
          </div>
          <div class="uno-turn">
            <span class="uno-color uno-color-${s.currentColor}" title="Current color"></span>
            <span>${s.status === 'finished' ? 'Game over' : (s.currentPlayerId ? 'Turn in progress' : '')}</span>
          </div>
        </div>
        <div class="uno-hand">
          ${s.selfHand.map(card => UnoCards.el(card).outerHTML).join('')}
        </div>
        <div class="uno-actions">
          <button id="uno-call" class="uno-button" type="button">UNO</button>
          <button id="uno-pass" class="uno-button" type="button">Pass</button>
          ${s.status === 'waiting' ? '<button id="uno-start" class="uno-button uno-button-primary" type="button">Start</button>' : ''}
          ${s.status === 'finished' ? '<button id="uno-back" class="uno-button" type="button">Back</button>' : ''}
          <button id="uno-leave" class="uno-button" type="button">Leave</button>
        </div>
      </div>`;

    content.querySelectorAll('.uno-hand .uno-card').forEach(button => {
      button.onclick = () => this.playCard(Number(button.dataset.cardId), s.selfHand.find(c => c.id === Number(button.dataset.cardId)));
    });
    content.querySelectorAll('.uno-catch').forEach(button => {
      button.onclick = () => this.client.send({ type: 'uno_catch', targetId: button.dataset.target });
    });
    document.getElementById('uno-draw').onclick = () => this.client.send({ type: 'uno_draw' });
    document.getElementById('uno-call').onclick = () => this.client.send({ type: 'uno_call' });
    document.getElementById('uno-pass').onclick = () => this.client.send({ type: 'uno_pass' });
    document.getElementById('uno-leave').onclick = () => {
      this.client.send({ type: 'uno_leave' });
      this.state = null;
      this.roomId = null;
      this.renderLobby();
    };
    const start = document.getElementById('uno-start');
    if (start) start.onclick = () => this.client.send({ type: 'uno_start' });
  }

  playCard(cardId, card) {
    if (card?.type === 'wild' || card?.type === 'wild4') {
      const color = prompt('Choose color: red, yellow, green, or blue', 'red');
      if (!['red', 'yellow', 'green', 'blue'].includes(color)) return;
      this.client.send({ type: 'uno_play', cardId, color });
    } else {
      this.client.send({ type: 'uno_play', cardId });
    }
  }

  initial(name) {
    return this.escape((name || '?').replace(/^\[DEV\]\s*/, '').slice(0, 1).toUpperCase());
  }

  escape(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  showToast(text) {
    const toast = document.createElement('div');
    toast.className = 'uno-toast';
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.ponyUno = new UnoUI();
});
