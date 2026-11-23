'use strict';

const COLORS = ['red', 'yellow', 'green', 'blue'];
const ACTIONS = ['skip', 'reverse', 'draw2'];

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

class UnoEngine {
  constructor(options = {}) {
    this.options = {
      maxPlayers: Math.min(4, Math.max(2, Number(options.maxPlayers) || 4)),
      turnTime: Math.min(120, Math.max(10, Number(options.turnTime) || 30)),
      allowBots: !!options.allowBots,
      stacking: false
    };
    this.players = [];
    this.deck = [];
    this.discard = [];
    this.current = 0;
    this.direction = 1;
    this.status = 'waiting';
    this.currentColor = null;
    this.winnerId = null;
    this.turnStartedAt = 0;
    this.drawnCardId = null;
  }

  createDeck() {
    const deck = [];
    let id = 1;
    const add = (color, type, value = null) => deck.push({ id: id++, color, type, value });
    for (const color of COLORS) {
      add(color, 'number', 0);
      for (let n = 1; n <= 9; n++) {
        add(color, 'number', n);
        add(color, 'number', n);
      }
      for (const action of ACTIONS) {
        add(color, action);
        add(color, action);
      }
    }
    for (let i = 0; i < 4; i++) {
      add(null, 'wild');
      add(null, 'wild4');
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  start(playerIds) {
    if (playerIds.length < 2 || playerIds.length > 4) throw new Error('UNO requires 2-4 players');
    this.players = playerIds.map(p => typeof p === 'string'
      ? { id: p, name: p, hand: [], unoCalled: false, disconnected: false, bot: false }
      : { ...p, hand: [], unoCalled: false, disconnected: false, bot: !!p.bot });
    this.deck = this.createDeck();
    this.discard = [];
    this.direction = 1;
    this.current = 0;
    this.winnerId = null;
    for (const player of this.players) {
      for (let i = 0; i < 7; i++) player.hand.push(this.drawFromDeck());
    }
    const firstIndex = this.deck.findIndex(card => card.type === 'number');
    const first = this.deck.splice(firstIndex >= 0 ? firstIndex : 0, 1)[0];
    this.discard.push(first);
    this.currentColor = first.color;
    this.status = 'playing';
    this.turnStartedAt = Date.now();
    this.drawnCardId = null;
  }

  drawFromDeck() {
    if (!this.deck.length) {
      const top = this.discard.pop();
      this.deck = this.discard;
      this.discard = top ? [top] : [];
      for (let i = this.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
      }
    }
    return this.deck.pop();
  }

  getTop() {
    return this.discard[this.discard.length - 1];
  }

  getPlayer(playerId) {
    return this.players.find(p => p.id === playerId);
  }

  isCurrent(playerId) {
    return this.status === 'playing' && this.players[this.current]?.id === playerId;
  }

  getActiveColor() {
    return this.currentColor;
  }

  wildDrawFourIsLegal(player, color) {
    return !player.hand.some(card => card.color === color);
  }

  canPlayCard(playerId, cardId, chosenColor = null) {
    if (!this.isCurrent(playerId)) return { ok: false, error: 'Not your turn' };
    const player = this.getPlayer(playerId);
    if (!player) return { ok: false, error: 'Unknown player' };
    const card = player.hand.find(c => c.id === Number(cardId));
    if (!card) return { ok: false, error: 'Card not owned' };
    const top = this.getTop();
    if (card.type === 'wild') {
      if (!COLORS.includes(chosenColor)) return { ok: false, error: 'Choose a color' };
      return { ok: true, card };
    }
    if (card.type === 'wild4') {
      if (!COLORS.includes(chosenColor)) return { ok: false, error: 'Choose a color' };
      if (!this.wildDrawFourIsLegal(player, this.currentColor)) return { ok: false, error: 'Wild Draw Four is only legal without the active color' };
      return { ok: true, card };
    }
    const match = card.color === this.currentColor ||
      (card.type === 'number' && top.type === 'number' && card.value === top.value) ||
      (card.type !== 'number' && card.type === top.type);
    if (!match) return { ok: false, error: 'Card does not match' };
    return { ok: true, card };
  }

  play(playerId, cardId, chosenColor = null) {
    const check = this.canPlayCard(playerId, cardId, chosenColor);
    if (!check.ok) throw new Error(check.error);
    const player = this.getPlayer(playerId);
    const card = check.card;
    player.hand = player.hand.filter(c => c.id !== card.id);
    this.discard.push(card);
    this.drawnCardId = null;
    if (card.type === 'wild' || card.type === 'wild4') this.currentColor = chosenColor;
    else this.currentColor = card.color;

    if (player.hand.length === 1) player.unoCalled = false;
    if (player.hand.length === 0) {
      this.status = 'finished';
      this.winnerId = player.id;
      return { winnerId: player.id, card };
    }

    let steps = 1;
    if (card.type === 'reverse') {
      if (this.players.length === 2) steps = 2;
      else this.direction *= -1;
    } else if (card.type === 'skip') {
      steps = 2;
    } else if (card.type === 'draw2') {
      const target = this.advanceIndex(steps);
      for (let i = 0; i < 2; i++) this.getPlayer(this.players[target].id).hand.push(this.drawFromDeck());
      steps = 2;
    } else if (card.type === 'wild4') {
      const target = this.advanceIndex(1);
      for (let i = 0; i < 4; i++) this.getPlayer(this.players[target].id).hand.push(this.drawFromDeck());
      steps = 2;
    }

    this.current = this.advanceIndex(steps);
    this.turnStartedAt = Date.now();
    return { card };
  }

  advanceIndex(steps) {
    const size = this.players.length;
    return (this.current + (this.direction * steps) + size) % size;
  }

  draw(playerId) {
    if (!this.isCurrent(playerId)) throw new Error('Not your turn');
    if (this.drawnCardId) throw new Error('Card already drawn');
    const player = this.getPlayer(playerId);
    const card = this.drawFromDeck();
    player.hand.push(card);
    this.drawnCardId = card.id;
    const playable = this.canPlayCard(playerId, card.id, card.type === 'wild' || card.type === 'wild4' ? this.currentColor : null);
    if (!playable.ok) {
      this.drawnCardId = null;
      this.current = this.advanceIndex(1);
      this.turnStartedAt = Date.now();
    }
    return { card, canPlay: playable.ok };
  }

  pass(playerId) {
    if (!this.isCurrent(playerId)) throw new Error('Not your turn');
    if (!this.drawnCardId) throw new Error('Draw before passing');
    this.drawnCardId = null;
    this.current = this.advanceIndex(1);
    this.turnStartedAt = Date.now();
  }

  callUno(playerId) {
    const player = this.getPlayer(playerId);
    if (!player) throw new Error('Unknown player');
    if (player.hand.length !== 1) throw new Error('UNO may only be called with one card');
    player.unoCalled = true;
  }

  catchUno(catcherId, targetId) {
    if (!this.getPlayer(catcherId)) throw new Error('Unknown catcher');
    const target = this.getPlayer(targetId);
    if (!target || target.hand.length !== 1 || target.unoCalled) throw new Error('No UNO mistake to catch');
    for (let i = 0; i < 2; i++) target.hand.push(this.drawFromDeck());
    target.unoCalled = false;
    return true;
  }

  timeout() {
    if (this.status !== 'playing') return null;
    if (Date.now() - this.turnStartedAt < this.options.turnTime * 1000) return null;
    const player = this.players[this.current];
    const card = this.drawFromDeck();
    player.hand.push(card);
    this.current = this.advanceIndex(1);
    this.turnStartedAt = Date.now();
    return { playerId: player.id, cardId: card.id };
  }

  publicState(viewerId) {
    return {
      status: this.status,
      winnerId: this.winnerId,
      currentPlayerId: this.status === 'playing' ? this.players[this.current]?.id : null,
      direction: this.direction,
      currentColor: this.currentColor,
      topCard: this.getTop(),
      turnEndsAt: this.turnStartedAt + this.options.turnTime * 1000,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        cardCount: p.hand.length,
        unoCalled: p.unoCalled,
        disconnected: p.disconnected,
        bot: p.bot,
        seatIndex: p.seatIndex,
        ready: p.ready !== false
      })),
      selfHand: this.getPlayer(viewerId)?.hand || [],
      drawnCardId: this.drawnCardId
    };
  }
}

module.exports = { UnoEngine, COLORS, randomItem };
