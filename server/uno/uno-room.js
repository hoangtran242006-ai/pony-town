'use strict';

const { UnoEngine } = require('./uno-engine');

class UnoRoomManager {
  constructor() {
    this.rooms = new Map();
  }

  create(tableId, owner, settings) {
    const roomId = `${tableId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const room = {
      id: roomId,
      tableId,
      ownerId: owner.id,
      ownerName: owner.name,
      settings: {
        maxPlayers: Math.min(4, Math.max(2, Number(settings?.maxPlayers) || 4)),
        turnTime: Math.min(120, Math.max(10, Number(settings?.turnTime) || 30)),
        allowBots: !!settings?.allowBots
      },
      players: [{ id: owner.id, name: owner.name, ws: owner.ws, disconnected: false, bot: false }],
      engine: null
    };
    this.rooms.set(roomId, room);
    return room;
  }

  list(tableId) {
    return [...this.rooms.values()]
      .filter(r => (!tableId || r.tableId === tableId) && r.engine?.status !== 'finished')
      .map(r => ({
        id: r.id,
        tableId: r.tableId,
        ownerName: r.ownerName,
        playerCount: r.players.length,
        maxPlayers: r.settings.maxPlayers
      }));
  }

  join(roomId, player) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (room.engine?.status === 'finished') throw new Error('Game is finished');
    if (room.engine?.status === 'playing') throw new Error('Game already started');
    if (room.players.length >= room.settings.maxPlayers) throw new Error('Room is full');
    let existing = room.players.find(p => p.id === player.id);
    if (existing) {
      existing.ws = player.ws;
      existing.disconnected = false;
      return room;
    }
    room.players.push({ id: player.id, name: player.name, ws: player.ws, disconnected: false, bot: false });
    return room;
  }

  leave(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== playerId);
    if (!room.players.length) {
      this.rooms.delete(roomId);
      return;
    }
    if (room.ownerId === playerId) room.ownerId = room.players[0].id;
  }

  markDisconnect(roomId, playerId) {
    const room = this.rooms.get(roomId);
    const player = room?.players.find(p => p.id === playerId);
    if (player) player.disconnected = true;
  }

  start(roomId, ownerId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    if (room.ownerId !== ownerId) throw new Error('Only the owner can start');
    if (room.players.length < 2 && !room.settings.allowBots) throw new Error('At least 2 players required');
    const players = room.players.slice();
    if (room.settings.allowBots) {
      let botIndex = 1;
      while (players.length < room.settings.maxPlayers) {
        players.push({ id: `bot-${roomId}-${botIndex}`, name: `Bot Pony ${botIndex}`, ws: null, disconnected: false, bot: true });
        botIndex++;
      }
    }
    room.players = players;
    room.engine = new UnoEngine(room.settings);
    room.engine.start(players);
  }

  broadcast(room, type, payload = {}, privateState = false) {
    if (!room) return;
    for (const player of room.players) {
      if (!player.ws || player.ws.readyState !== 1 || player.bot) continue;
      const body = privateState
        ? { type, ...payload, state: room.engine?.publicState(player.id) }
        : { type, ...payload };
      player.ws.send(JSON.stringify(body));
    }
  }

  sync(room) {
    if (room.engine) {
      this.broadcast(room, 'uno_state', { roomId: room.id }, true);
      return;
    }
    for (const player of room.players) {
      if (!player.ws || player.ws.readyState !== 1 || player.bot) continue;
      player.ws.send(JSON.stringify({
        type: 'uno_state',
        roomId: room.id,
        state: {
          status: 'waiting',
          winnerId: null,
          currentPlayerId: null,
          direction: 1,
          currentColor: null,
          topCard: null,
          turnEndsAt: null,
          players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            cardCount: 0,
            unoCalled: false,
            disconnected: p.disconnected,
            bot: p.bot
          })),
          selfHand: []
        }
      }));
    }
  }

  byPlayer(playerId) {
    for (const room of this.rooms.values()) {
      if (room.players.some(p => p.id === playerId)) return room;
    }
    return null;
  }
}

module.exports = UnoRoomManager;
