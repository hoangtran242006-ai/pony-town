'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { UnoEngine } = require('../server/uno/uno-engine');

function card(id, color, type = 'number', value = null) {
  return { id, color, type, value };
}

test('creates a standard deck and deals 7 cards', () => {
  const engine = new UnoEngine();
  const deck = engine.createDeck();
  assert.equal(deck.length, 108);
  engine.start(['p1', 'p2']);
  assert.equal(engine.players[0].hand.length, 7);
  assert.equal(engine.players[1].hand.length, 7);
  assert.equal(engine.status, 'playing');
});

test('allows matching color and rejects mismatched number', () => {
  const engine = new UnoEngine();
  engine.players = [
    { id: 'p1', name: 'One', hand: [card(1, 'red', 'number', 5)], unoCalled: false },
    { id: 'p2', name: 'Two', hand: [card(2, 'blue', 'number', 1)], unoCalled: false }
  ];
  engine.discard = [card(99, 'red', 'number', 2)];
  engine.currentColor = 'red';
  engine.current = 0;
  engine.status = 'playing';
  assert.equal(engine.canPlayCard('p1', 1).ok, true);
  engine.players[0].hand = [card(1, 'blue', 'number', 2)];
  assert.equal(engine.canPlayCard('p1', 1).ok, true);
  engine.players[0].hand = [card(1, 'green', 'number', 7)];
  assert.equal(engine.canPlayCard('p1', 1).ok, false);
});

test('reverse swaps direction and skips in two-player games', () => {
  const engine = new UnoEngine();
  engine.players = [
    { id: 'p1', name: 'One', hand: [card(1, 'red', 'reverse')], unoCalled: false },
    { id: 'p2', name: 'Two', hand: [], unoCalled: false }
  ];
  engine.discard = [card(99, 'red', 'number', 2)];
  engine.currentColor = 'red';
  engine.current = 0;
  engine.status = 'playing';
  engine.players[0].hand.push(card(3, 'red', 'number', 3));
  const result = engine.play('p1', 1);
  assert.equal(result.card.type, 'reverse');
  assert.equal(engine.current, 0);
  assert.equal(engine.direction, 1);

  const engine3 = new UnoEngine();
  engine3.start(['p1', 'p2', 'p3']);
  engine3.players[0].hand = [card(1, 'red', 'reverse'), card(4, 'blue', 'number', 4)];
  engine3.discard = [card(99, 'red', 'number', 2)];
  engine3.currentColor = 'red';
  engine3.current = 0;
  const before = engine3.direction;
  engine3.play('p1', 1);
  assert.equal(engine3.direction, -before);
});

test('draw two and wild draw four apply penalties', () => {
  const drawTwo = new UnoEngine();
  drawTwo.players = [
    { id: 'p1', name: 'One', hand: [card(1, 'red', 'draw2'), card(3, 'blue', 'number', 3)], unoCalled: false },
    { id: 'p2', name: 'Two', hand: [], unoCalled: false }
  ];
  drawTwo.discard = [card(99, 'red', 'number', 2)];
  drawTwo.deck = [card(2, 'blue', 'number', 1)];
  drawTwo.currentColor = 'red';
  drawTwo.status = 'playing';
  drawTwo.current = 0;
  drawTwo.play('p1', 1);
  assert.equal(drawTwo.players[1].hand.length, 2);
  assert.equal(drawTwo.current, 0);

  const wild4 = new UnoEngine();
  wild4.start(['p1', 'p2']);
  wild4.players[0].hand = [card(1, null, 'wild4'), card(3, 'blue', 'number', 3)];
  wild4.players[1].hand = [];
  wild4.discard = [card(99, 'red', 'number', 2)];
  wild4.currentColor = 'red';
  wild4.current = 0;
  wild4.play('p1', 1, 'blue');
  assert.equal(wild4.players[1].hand.length, 4);
  assert.equal(wild4.currentColor, 'blue');
  assert.equal(wild4.current, 0);
});

test('wild draw four is rejected when matching active color exists', () => {
  const engine = new UnoEngine();
  engine.players = [
    { id: 'p1', name: 'One', hand: [card(1, null, 'wild4'), card(2, 'red', 'number', 8)], unoCalled: false },
    { id: 'p2', name: 'Two', hand: [], unoCalled: false }
  ];
  engine.discard = [card(99, 'red', 'number', 2)];
  engine.currentColor = 'red';
  engine.current = 0;
  engine.status = 'playing';
  assert.equal(engine.canPlayCard('p1', 1, 'blue').ok, false);
});

test('draw, UNO call and catch UNO penalty work', () => {
  const engine = new UnoEngine();
  engine.start(['p1', 'p2']);
  const p1 = engine.players[0];
  p1.hand = [card(1, 'red', 'number', 7)];
  engine.status = 'playing';
  engine.current = 0;
  engine.currentColor = 'red';
  engine.drawnCardId = null;
  assert.equal(engine.canPlayCard('p1', 1).ok, true);
  engine.play('p1', 1);
  assert.equal(engine.status, 'finished');

  const catchEngine = new UnoEngine();
  catchEngine.start(['p1', 'p2']);
  catchEngine.players[0].hand = [card(1, 'red', 'number', 5)];
  catchEngine.status = 'playing';
  catchEngine.current = 1;
  assert.equal(catchEngine.catchUno('p2', 'p1'), true);
  assert.equal(catchEngine.players[0].hand.length, 3);
});

test('private state contains only the viewer hand', () => {
  const engine = new UnoEngine();
  engine.start(['p1', 'p2']);
  const state1 = engine.publicState('p1');
  const state2 = engine.publicState('p2');
  assert.equal(state1.selfHand.length, 7);
  assert.equal(state2.selfHand.length, 7);
  assert.deepEqual(state1.players.map(p => p.cardCount), [7, 7]);
});
