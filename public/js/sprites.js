/**
 * Pony Town Procedural Pixel Art Sprite Generator & Renderer
 * Renders ponies, animations, world tiles, items, and particle effects.
 */

const Sprites = (() => {
  // Offscreen canvas cache for generated textures
  const canvasCache = new Map();

  function getCachedCanvas(key, width, height, renderFn) {
    if (canvasCache.has(key)) return canvasCache.get(key);
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    renderFn(ctx);
    canvasCache.set(key, c);
    return c;
  }

  // Draw a pixel rect on a context
  function px(ctx, color, x, y, w = 1, h = 1) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  }

  // Helper to adjust color shade (darker/lighter)
  function adjustColor(hex, factor) {
    if (!hex || hex[0] !== '#') return hex;
    const num = parseInt(hex.slice(1), 16);
    let r = (num >> 16) + factor;
    let g = ((num >> 8) & 0x00ff) + factor;
    let b = (num & 0x0000ff) + factor;
    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  // ==========================================
  // Pony Drawing System
  // ==========================================
  /**
   * Draws a complete Pony at (x, y) on canvas
   * @param {CanvasRenderingContext2D} ctx 
   * @param {Object} pony - character data (colors, style, type, dir, state, action, frame)
   * @param {number} x - canvas screen x
   * @param {number} y - canvas screen y
   * @param {number} scale - pixel zoom scale
   */
  function drawPony(ctx, pony, x, y, scale = 3) {
    const {
      colors = {},
      style = {},
      type = 'earth',
      dir = 'down',
      state = 'stand',
      action = 'idle',
      frame = 0,
      itemInMouth = null
    } = pony;

    const coat = colors.coat || '#f2d594';
    const coatDark = adjustColor(coat, -35);
    const coatLight = adjustColor(coat, 25);
    const hooves = colors.hooves || coatDark;
    const mane = colors.mane || '#6b3e26';
    const maneAccent = colors.maneAccent || adjustColor(mane, 30);
    const tail = colors.tail || mane;
    const tailAccent = colors.tailAccent || maneAccent;
    const eyes = colors.eyes || '#3c6e91';
    const horn = colors.horn || coat;
    const wings = colors.wings || coat;

    const isFacingLeft = dir === 'left';
    const isFacingUp = dir === 'up';
    const isFacingDown = dir === 'down';
    const isSitting = action === 'sit';
    const isLying = action === 'lie';
    const isSleeping = action === 'sleep';
    const isFlying = state === 'fly' || action === 'fly';
    const isWalking = state === 'walk' || state === 'trot';
    const isBooping = action === 'boop' || action === 'kiss';

    ctx.save();
    ctx.translate(Math.floor(x), Math.floor(y));
    ctx.scale(scale, scale);

    // Flip horizontally when facing left
    if (isFacingLeft) {
      ctx.scale(-1, 1);
    }

    // Shadow on ground
    const shadowY = isFlying ? 14 : (isLying ? 4 : (isSitting ? 6 : 8));
    const shadowScale = isFlying ? 0.7 : 1.0;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, shadowY, 9 * shadowScale, 4.5 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Flight vertical bobbing
    let flyBob = 0;
    if (isFlying) {
      flyBob = -10 + Math.sin(frame * 0.2) * 2;
      ctx.translate(0, flyBob);
    }

    // Trot bounce
    let trotY = 0;
    let legOffset1 = 0;
    let legOffset2 = 0;
    if (isWalking && !isFlying && !isSitting && !isLying) {
      trotY = Math.abs(Math.sin(frame * 0.4)) * -2;
      legOffset1 = Math.sin(frame * 0.4) * 3;
      legOffset2 = -legOffset1;
    }

    // 1. Draw Tail (behind body)
    drawTail(ctx, tail, tailAccent, style.tail || 'normal', dir, frame, isSitting, isLying);

    // 2. Back legs (if not lying/sitting)
    if (!isLying && !isSitting) {
      // Left back leg
      px(ctx, coatDark, -7, 1 + trotY - legOffset1, 3, 7);
      px(ctx, hooves, -7, 6 + trotY - legOffset1, 3, 2);
      // Right back leg
      px(ctx, coatDark, -4, 1 + trotY - legOffset2, 3, 7);
      px(ctx, hooves, -4, 6 + trotY - legOffset2, 3, 2);
    }

    // 3. Draw Body
    if (isLying) {
      // Lying down pose
      px(ctx, coatDark, -8, 2, 16, 6);
      px(ctx, coat, -7, 1, 14, 6);
      // Folded hooves
      px(ctx, hooves, -6, 5, 4, 3);
      px(ctx, hooves, 2, 5, 4, 3);
    } else if (isSitting) {
      // Sitting pose
      px(ctx, coatDark, -7, -2, 12, 9);
      px(ctx, coat, -6, -3, 11, 8);
      // Front legs straight
      px(ctx, coat, 1, 0, 3, 8);
      px(ctx, hooves, 1, 6, 3, 2);
      // Back leg resting horizontally
      px(ctx, hooves, -8, 4, 4, 3);
    } else {
      // Standing / Trotting body
      px(ctx, coatDark, -6, -4 + trotY, 12, 7);
      px(ctx, coat, -5, -5 + trotY, 11, 7);
      px(ctx, coatLight, -4, -5 + trotY, 8, 2);

      // Custom Clothing / Robes (e.g. Scaramouche kimono & sash)
      if (colors.chestRobe) {
        px(ctx, colors.chestRobe, -4, -4 + trotY, 8, 6);
      }
      if (colors.waistSash) {
        px(ctx, colors.waistSash, -2, -3 + trotY, 3, 5);
        px(ctx, colors.hatGold || '#eabb5c', -1, -2 + trotY, 2, 2); // gold medallion
      }

      // Front legs
      if (isBooping) {
        // Front hoof extended forward for boop!
        px(ctx, coat, 4, -4 + trotY, 6, 3);
        px(ctx, hooves, 8, -4 + trotY, 3, 3);
      } else {
        // Normal front legs
        px(ctx, coat, 2, 0 + trotY + legOffset1, 3, 8);
        px(ctx, hooves, 2, 6 + trotY + legOffset1, 3, 2);
        px(ctx, coatDark, 5, 0 + trotY + legOffset2, 3, 8);
        px(ctx, hooves, 5, 6 + trotY + legOffset2, 3, 2);
      }
    }

    // 4. Wings (Pegasus / Alicorn)
    if (type === 'pegasus' || type === 'alicorn') {
      drawWings(ctx, wings, isFlying, frame, trotY);
    }

    // 5. Neck & Head
    const headY = (isLying ? 0 : (isSitting ? -5 : -7)) + trotY;
    const headX = isFacingUp ? -1 : 3;

    // Neck
    px(ctx, coat, headX - 2, headY + 3, 5, 4);

    // Head Base
    px(ctx, coatDark, headX - 4, headY - 6, 9, 9);
    px(ctx, coat, headX - 3, headY - 7, 8, 9);

    // Muzzle / Snout
    if (!isFacingUp) {
      px(ctx, coat, headX + 3, headY - 3, 4, 4);
      px(ctx, coatDark, headX + 5, headY - 1, 2, 1); // nostril
    }

    // Ear
    px(ctx, coatDark, headX - 3, headY - 10, 3, 4);
    px(ctx, coat, headX - 2, headY - 9, 2, 3);
    px(ctx, coatLight, headX - 2, headY - 8, 1, 2);

    // 6. Eyes & Expression
    if (!isFacingUp) {
      drawEyes(ctx, eyes, style.expression || 'normal', headX, headY, isSleeping, colors, style);
    }

    // 7. Horn (Unicorn / Alicorn)
    if (type === 'unicorn' || type === 'alicorn') {
      drawHorn(ctx, horn, headX, headY, isFacingUp);
    }

    // 8. Mane
    drawMane(ctx, mane, maneAccent, style.mane || 'normal', headX, headY, isFacingUp, frame);

    // 9. Accessories (Hat, Bandana, Flower, Bow)
    if (style.accessory && style.accessory !== 'none') {
      drawAccessory(ctx, style.accessory, headX, headY);
    }

    // 10. Item in mouth (Apple, clover, candy, etc.)
    if (itemInMouth && !isFacingUp) {
      drawItemInMouth(ctx, itemInMouth, headX + 5, headY - 1);
    }

    ctx.restore();
  }

  // Draw Wings
  function drawWings(ctx, wingColor, isFlying, frame, trotY) {
    const wingDark = adjustColor(wingColor, -30);
    if (isFlying) {
      // Flapping wings animation
      const flap = Math.sin(frame * 0.45);
      const wingHeight = flap > 0 ? -12 : -6;
      px(ctx, wingDark, -5, -8 + wingHeight + trotY, 8, 7);
      px(ctx, wingColor, -4, -9 + wingHeight + trotY, 7, 6);
      px(ctx, '#fff', -2, -8 + wingHeight + trotY, 4, 3);
    } else {
      // Folded wings on side
      px(ctx, wingDark, -3, -4 + trotY, 7, 5);
      px(ctx, wingColor, -2, -5 + trotY, 6, 4);
      px(ctx, adjustColor(wingColor, 20), -1, -5 + trotY, 4, 2);
    }
  }

  // Draw Horn
  function drawHorn(ctx, hornColor, hx, hy, isFacingUp) {
    const hornX = isFacingUp ? hx : hx + 1;
    px(ctx, adjustColor(hornColor, -20), hornX, hy - 11, 2, 4);
    px(ctx, hornColor, hornX, hy - 12, 2, 3);
    px(ctx, '#fff', hornX, hy - 13, 1, 2);
    // Subtle magical glow
    ctx.fillStyle = 'rgba(255, 230, 150, 0.4)';
    ctx.fillRect(hornX - 1, hy - 14, 3, 3);
  }

  // Draw Eyes
  function drawEyes(ctx, eyeColor, expression, hx, hy, isSleeping, colors = {}, style = {}) {
    const eyeX = hx + 1;
    const eyeY = hy - 4;

    // Eyeshadow (e.g. Scaramouche reddish eyeliner)
    if (colors.eyeshadow || style.hasEyeshadow) {
      px(ctx, colors.eyeshadow || '#ba6f6f', eyeX, eyeY - 2, 4, 1);
    }

    // Blush
    if (colors.blush || style.hasBlush) {
      px(ctx, colors.blush || '#c90040', eyeX + 1, eyeY + 3, 3, 2);
    }

    if (isSleeping || expression === 'sleepy') {
      // Closed curved eye lines
      px(ctx, '#222', eyeX, eyeY + 1, 4, 1);
      px(ctx, '#444', eyeX + 1, eyeY + 2, 2, 1);
      return;
    }

    if (expression === 'happy') {
      // Smiling eye arc ^^
      px(ctx, '#222', eyeX, eyeY, 4, 2);
      px(ctx, eyeColor, eyeX + 1, eyeY - 1, 2, 1);
      return;
    }

    // Normal open eye with pupil and shiny reflection
    px(ctx, colors.eyeWhites || '#fff', eyeX, eyeY - 1, 4, 4);
    px(ctx, eyeColor, eyeX + 1, eyeY - 1, 3, 3);
    px(ctx, '#111', eyeX + 2, eyeY, 2, 2);
    px(ctx, '#fff', eyeX + 1, eyeY - 1, 1, 1); // reflection glint
  }

  // Draw Mane (Hair styles)
  function drawMane(ctx, mColor, mAccent, maneStyle, hx, hy, isFacingUp, frame) {
    const mDark = adjustColor(mColor, -35);

    switch (maneStyle) {
      case 'spiky':
        px(ctx, mDark, hx - 5, hy - 11, 8, 4);
        px(ctx, mColor, hx - 4, hy - 12, 7, 4);
        px(ctx, mAccent, hx - 2, hy - 13, 3, 2);
        px(ctx, mDark, hx - 6, hy - 6, 3, 7);
        px(ctx, mColor, hx - 5, hy - 5, 2, 6);
        break;

      case 'curly':
        px(ctx, mDark, hx - 5, hy - 10, 9, 6);
        px(ctx, mColor, hx - 4, hy - 11, 8, 5);
        px(ctx, mAccent, hx - 3, hy - 10, 6, 3);
        // Curls on back of neck
        px(ctx, mColor, hx - 6, hy - 4, 4, 5);
        px(ctx, mAccent, hx - 7, hy - 1, 3, 4);
        break;

      case 'ponytail':
        px(ctx, mDark, hx - 4, hy - 9, 7, 4);
        px(ctx, mColor, hx - 3, hy - 10, 6, 4);
        // Ponytail band
        px(ctx, '#e74c3c', hx - 6, hy - 6, 2, 2);
        // Hanging ponytail
        px(ctx, mDark, hx - 9, hy - 5, 4, 7);
        px(ctx, mColor, hx - 8, hy - 4, 3, 7);
        px(ctx, mAccent, hx - 8, hy - 1, 3, 4);
        break;

      case 'long':
        px(ctx, mDark, hx - 5, hy - 9, 8, 5);
        px(ctx, mColor, hx - 4, hy - 10, 7, 4);
        px(ctx, mDark, hx - 7, hy - 4, 4, 10);
        px(ctx, mColor, hx - 6, hy - 3, 3, 9);
        px(ctx, mAccent, hx - 5, hy, 2, 6);
        break;

      default: // 'normal'
        px(ctx, mDark, hx - 4, hy - 9, 7, 4);
        px(ctx, mColor, hx - 3, hy - 10, 6, 4);
        px(ctx, mAccent, hx - 2, hy - 9, 4, 2);
        px(ctx, mDark, hx - 5, hy - 5, 3, 6);
        px(ctx, mColor, hx - 4, hy - 4, 2, 5);
        break;
    }
  }

  // Draw Tail
  function drawTail(ctx, tColor, tAccent, tailStyle, dir, frame, isSitting, isLying) {
    const tDark = adjustColor(tColor, -35);
    const wag = Math.sin(frame * 0.25) * 1.5;
    const tailX = -7;
    const tailY = (isLying ? 2 : (isSitting ? 2 : -2)) + wag;

    switch (tailStyle) {
      case 'fluffy':
        px(ctx, tDark, tailX - 6, tailY - 2, 7, 7);
        px(ctx, tColor, tailX - 5, tailY - 3, 6, 7);
        px(ctx, tAccent, tailX - 4, tailY - 1, 4, 4);
        break;

      case 'swish':
        px(ctx, tDark, tailX - 7, tailY - 4, 6, 9);
        px(ctx, tColor, tailX - 6, tailY - 5, 5, 8);
        px(ctx, tAccent, tailX - 5, tailY - 1, 3, 4);
        break;

      case 'short':
        px(ctx, tDark, tailX - 4, tailY - 1, 4, 4);
        px(ctx, tColor, tailX - 3, tailY - 2, 3, 4);
        break;

      default: // normal
        px(ctx, tDark, tailX - 5, tailY - 2, 5, 7);
        px(ctx, tColor, tailX - 4, tailY - 3, 4, 7);
        px(ctx, tAccent, tailX - 3, tailY, 2, 4);
        break;
    }
  }

  // Draw Accessories
  function drawAccessory(ctx, accessory, hx, hy) {
    switch (accessory) {
      case 'scaramouche_hat':
        // Scaramouche Japanese Kasa Ronin Hat with wide indigo brim and gold crest
        px(ctx, '#2f3d60', hx - 8, hy - 11, 18, 3); // wide dark indigo brim
        px(ctx, '#7488b9', hx - 7, hy - 14, 16, 4); // primary blue dome
        px(ctx, '#b29151', hx - 2, hy - 16, 6, 3);  // gold apex medallion
        px(ctx, '#eabb5c', hx - 1, hy - 17, 4, 2);  // gold crest highlight
        // Hat side hanging ribbons / tassels
        px(ctx, '#303e61', hx - 7, hy - 8, 2, 8);
        px(ctx, '#87c0c2', hx - 7, hy, 2, 4);
        break;

      case 'hat':
        // Brown cowboy / sun hat
        px(ctx, '#654321', hx - 5, hy - 10, 11, 2); // brim
        px(ctx, '#8b5a2b', hx - 2, hy - 14, 5, 4);  // crown
        px(ctx, '#d35400', hx - 2, hy - 11, 5, 1);  // band
        break;

      case 'bandana':
        // Red neck bandana
        px(ctx, '#e74c3c', hx - 2, hy + 3, 5, 3);
        px(ctx, '#c0392b', hx - 1, hy + 5, 3, 2);
        px(ctx, '#fff', hx, hy + 4, 1, 1);
        break;

      case 'flower':
        // Cute pink hair flower
        px(ctx, '#ff69b4', hx - 1, hy - 9, 3, 3);
        px(ctx, '#ffff00', hx, hy - 8, 1, 1);
        break;

      case 'glasses':
        // Cool dark sunglasses
        px(ctx, '#111', hx + 1, hy - 4, 4, 3);
        px(ctx, '#444', hx + 2, hy - 3, 2, 1);
        px(ctx, '#111', hx - 1, hy - 3, 2, 1); // bridge
        break;
    }
  }

  // Draw item in mouth
  function drawItemInMouth(ctx, itemType, x, y) {
    if (itemType === 'apple') {
      px(ctx, '#e74c3c', x, y, 4, 4);
      px(ctx, '#c0392b', x + 1, y + 3, 2, 1);
      px(ctx, '#27ae60', x + 1, y - 1, 1, 1); // stem
    } else if (itemType === 'clover') {
      px(ctx, '#2ecc71', x, y, 3, 3);
      px(ctx, '#27ae60', x + 1, y + 1, 1, 2); // stem
    } else if (itemType === 'candy') {
      px(ctx, '#9b59b6', x, y, 4, 2);
      px(ctx, '#ff7979', x + 1, y, 2, 2);
    } else if (itemType === 'muffin') {
      px(ctx, '#d35400', x, y, 4, 3);
      px(ctx, '#f39c12', x, y - 1, 4, 2);
    }
  }

  // ==========================================
  // World Tile Rendering
  // ==========================================
  /**
   * Generates or draws a world tile (size: 32x32)
   */
  function drawTile(ctx, tileType, x, y, size = 32, variant = 0) {
    switch (tileType) {
      case 'grass': {
        // Lush green grass with subtle blade texture
        ctx.fillStyle = variant % 2 === 0 ? '#639b38' : '#69a33d';
        ctx.fillRect(x, y, size, size);
        // Blades of grass
        ctx.fillStyle = '#78b846';
        ctx.fillRect(x + 4, y + 6, 2, 3);
        ctx.fillRect(x + 20, y + 18, 2, 3);
        ctx.fillRect(x + 12, y + 24, 2, 3);
        ctx.fillStyle = '#54872f';
        ctx.fillRect(x + 6, y + 8, 2, 1);
        break;
      }

      case 'dirt':
      case 'path': {
        // Warm brown dirt path
        ctx.fillStyle = '#b58a57';
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = '#9e7343';
        ctx.fillRect(x + 2, y + 3, 3, 2);
        ctx.fillRect(x + 18, y + 14, 4, 2);
        ctx.fillStyle = '#c79d69';
        ctx.fillRect(x + 10, y + 22, 3, 2);
        break;
      }

      case 'water': {
        // Serene blue water with animated wave ripples
        const time = Date.now() * 0.003;
        const wave = Math.sin(time + (x + y) * 0.05);
        ctx.fillStyle = wave > 0 ? '#4383c2' : '#3975b0';
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = '#5dade2';
        ctx.fillRect(x + 4 + Math.sin(time) * 3, y + 8, 8, 2);
        ctx.fillRect(x + 16 + Math.cos(time) * 3, y + 20, 10, 2);
        break;
      }

      case 'stone': {
        // Stone cobblestone tile
        ctx.fillStyle = '#7f8c8d';
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = '#95a5a6';
        ctx.fillRect(x + 2, y + 2, 12, 12);
        ctx.fillRect(x + 18, y + 2, 12, 12);
        ctx.fillRect(x + 2, y + 18, 12, 12);
        ctx.fillRect(x + 18, y + 18, 12, 12);
        ctx.fillStyle = '#566573';
        ctx.fillRect(x, y + 15, size, 2);
        ctx.fillRect(x + 15, y, 2, size);
        break;
      }

      case 'wood': {
        // Wooden bridge / floor
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(x, y, size, size);
        ctx.fillStyle = '#654321';
        ctx.fillRect(x, y + 7, size, 1);
        ctx.fillRect(x, y + 15, size, 1);
        ctx.fillRect(x, y + 23, size, 1);
        ctx.fillRect(x, y + 31, size, 1);
        break;
      }
    }
  }

  // Draw Apple Tree
  function drawTree(ctx, x, y, apples = 3, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Tree shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 28, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Trunk
    ctx.fillStyle = '#5c3a21';
    ctx.fillRect(-6, -14, 12, 26);
    ctx.fillStyle = '#422814';
    ctx.fillRect(-4, -12, 4, 24);

    // Foliage (fluffy green leaves layers)
    ctx.fillStyle = '#2d6a2e';
    ctx.beginPath();
    ctx.arc(0, -32, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3a873c';
    ctx.beginPath();
    ctx.arc(-10, -36, 20, 0, Math.PI * 2);
    ctx.arc(10, -36, 20, 0, Math.PI * 2);
    ctx.arc(0, -42, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4ca44f';
    ctx.beginPath();
    ctx.arc(-6, -42, 14, 0, Math.PI * 2);
    ctx.arc(6, -40, 14, 0, Math.PI * 2);
    ctx.fill();

    // Apples on tree
    const applePositions = [
      [-12, -34], [8, -32], [0, -46], [-16, -44], [14, -42]
    ];
    ctx.fillStyle = '#e74c3c';
    for (let i = 0; i < Math.min(apples, applePositions.length); i++) {
      const [ax, ay] = applePositions[i];
      ctx.beginPath();
      ctx.arc(ax, ay, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(ax - 1, ay - 6, 2, 2); // stem
      ctx.fillStyle = '#e74c3c';
    }

    ctx.restore();
  }

  // Draw Wooden Bench
  function drawBench(ctx, x, y, facing = 'down') {
    ctx.save();
    ctx.translate(x, y);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(-18, -4, 36, 12);

    // Legs
    ctx.fillStyle = '#2c3e50'; // iron legs
    ctx.fillRect(-16, -2, 4, 8);
    ctx.fillRect(12, -2, 4, 8);

    // Wooden planks
    ctx.fillStyle = '#b07d4b';
    ctx.fillRect(-18, -6, 36, 5);
    ctx.fillStyle = '#8f6134';
    ctx.fillRect(-18, -1, 36, 2);

    if (facing === 'down') {
      // Backrest
      ctx.fillStyle = '#b07d4b';
      ctx.fillRect(-18, -14, 36, 6);
      ctx.fillStyle = '#8f6134';
      ctx.fillRect(-18, -8, 36, 2);
    }

    ctx.restore();
  }

  // Draw Street Lantern
  function drawLantern(ctx, x, y, isNight = false) {
    ctx.save();
    ctx.translate(x, y);

    // Pole
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(-2, -32, 4, 34);
    ctx.fillRect(-5, 0, 10, 3); // base

    // Lamp head
    ctx.fillStyle = '#1a252f';
    ctx.fillRect(-6, -38, 12, 3);
    ctx.fillRect(-4, -42, 8, 4);

    // Glow / Glass
    if (isNight) {
      // Light aura
      const grad = ctx.createRadialGradient(0, -35, 2, 0, -35, 45);
      grad.addColorStop(0, 'rgba(255, 230, 120, 0.7)');
      grad.addColorStop(0.5, 'rgba(255, 200, 60, 0.25)');
      grad.addColorStop(1, 'rgba(255, 200, 60, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, -35, 45, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fff4b8';
      ctx.fillRect(-4, -35, 8, 8);
    } else {
      ctx.fillStyle = '#7f8c8d';
      ctx.fillRect(-4, -35, 8, 8);
    }

    ctx.restore();
  }

  // Draw Floating Emote Particles (Hearts, Zzz, Tears)
  function drawEmoteEffect(ctx, action, x, y, frame) {
    ctx.save();
    ctx.translate(x, y);

    if (action === 'boop' || action === 'kiss') {
      // Rising pulsating heart ❤️
      const bob = Math.sin(frame * 0.2) * 4;
      const alpha = Math.max(0, 1 - (frame % 30) / 30);
      ctx.fillStyle = `rgba(255, 75, 120, ${alpha})`;
      ctx.font = '16px sans-serif';
      ctx.fillText('❤️', 8, -25 - bob);
    } else if (action === 'sleep') {
      // Floating Zzz
      const zOffset = (frame % 40) * 0.6;
      ctx.fillStyle = 'rgba(220, 240, 255, 0.85)';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('Z', 6 + zOffset * 0.3, -20 - zOffset);
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('z', 2 + zOffset * 0.2, -14 - zOffset * 0.8);
    } else if (action === 'cry') {
      // Dropping tear drops 💧
      ctx.fillStyle = '#3498db';
      const drop = (frame % 20) * 1.2;
      ctx.fillRect(4, -18 + drop, 2, 3);
      ctx.fillRect(8, -16 + drop, 2, 3);
    } else if (action === 'laugh') {
      // Bouncing haha
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('Haha!', -12, -26 + Math.sin(frame * 0.3) * 3);
    }

    ctx.restore();
  }

  return {
    adjustColor,
    drawPony,
    drawTile,
    drawTree,
    drawBench,
    drawLantern,
    drawEmoteEffect
  };
})();
