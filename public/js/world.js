/**
 * Pony Town World & Map Engine
 * Manages tiles, collision maps, town objects, items, and day/night lighting.
 */

class World {
  constructor(mapData = {}) {
    this.width = mapData.width || 120;
    this.height = mapData.height || 90;
    this.tileSize = 32; // In game world coordinates, 1 unit = 1 tile (32px)

    this.spawn = mapData.spawn || { x: 60, y: 45 };
    this.trees = mapData.trees || [];
    this.benches = mapData.benches || [];
    this.lanterns = mapData.lanterns || [];
    this.items = mapData.items || [];

    // 2D tile array: 'grass', 'dirt', 'water', 'stone', 'wood'
    this.tiles = [];
    this.colliders = new Set(); // Set of "x,y" keys that block movement
    this.waterColliders = new Set(); // Water tiles (block ground ponies, but flying pegasi can fly over)

    this.timeOfDay = 0.3; // 0.0 (midnight) -> 0.25 (dawn) -> 0.5 (noon) -> 0.75 (dusk) -> 1.0 (night)
    this.timeSpeed = 0.00015; // smooth day/night cycle

    this.initMap();
  }

  initMap() {
    this.tiles = new Array(this.height);
    for (let y = 0; y < this.height; y++) {
      this.tiles[y] = new Array(this.width).fill('grass');
    }

    // 1. Central Plaza (Stone paving around town center: x: 55-65, y: 42-48)
    for (let y = 41; y <= 49; y++) {
      for (let x = 54; x <= 66; x++) {
        this.tiles[y][x] = 'stone';
      }
    }

    // 2. Main Roads (Dirt paths leading from center to borders)
    // Horizontal main street (y: 44-46)
    for (let x = 10; x < this.width - 10; x++) {
      this.tiles[44][x] = 'dirt';
      this.tiles[45][x] = 'dirt';
      this.tiles[46][x] = 'dirt';
    }
    // Vertical avenue (x: 59-61)
    for (let y = 10; y < this.height - 10; y++) {
      this.tiles[y][59] = 'dirt';
      this.tiles[y][60] = 'dirt';
      this.tiles[y][61] = 'dirt';
    }

    // 3. Serene River (Winding river flowing vertically around x: 30-36)
    for (let y = 0; y < this.height; y++) {
      const riverCenter = Math.floor(32 + Math.sin(y * 0.1) * 3);
      for (let rw = -2; rw <= 2; rw++) {
        const rx = riverCenter + rw;
        if (rx >= 0 && rx < this.width) {
          this.tiles[y][rx] = 'water';
          this.waterColliders.add(`${rx},${y}`);
        }
      }
    }

    // 4. Wooden Bridge across River (at main horizontal street y: 43-47)
    for (let y = 43; y <= 47; y++) {
      const riverCenter = Math.floor(32 + Math.sin(y * 0.1) * 3);
      for (let rw = -3; rw <= 3; rw++) {
        const rx = riverCenter + rw;
        if (rx >= 0 && rx < this.width) {
          this.tiles[y][rx] = 'wood';
          this.waterColliders.delete(`${rx},${y}`);
        }
      }
    }

    // 5. Build Colliders for trees, lanterns, and map bounds
    for (const tree of this.trees) {
      this.colliders.add(`${Math.round(tree.x)},${Math.round(tree.y)}`);
    }

    for (const lantern of this.lanterns) {
      this.colliders.add(`${Math.round(lantern.x)},${Math.round(lantern.y)}`);
    }
  }

  update(dt) {
    // Advance day/night cycle
    this.timeOfDay = (this.timeOfDay + this.timeSpeed * dt) % 1.0;
  }

  /**
   * Check if a position is passable
   * @param {number} x - tile x
   * @param {number} y - tile y
   * @param {boolean} isFlying - if entity is currently flying
   */
  isPassable(x, y, isFlying = false) {
    // Check map boundaries
    if (x < 1 || x >= this.width - 1 || y < 1 || y >= this.height - 1) {
      return false;
    }

    // Solid obstacle collider
    const key = `${Math.round(x)},${Math.round(y)}`;
    if (this.colliders.has(key)) {
      return false;
    }

    // Water collider: flying ponies can fly over water!
    if (!isFlying && this.waterColliders.has(key)) {
      return false;
    }

    return true;
  }

  /**
   * Check for nearby interactive items
   */
  getNearbyItem(x, y, radius = 1.6) {
    for (const item of this.items) {
      const dx = item.x - x;
      const dy = item.y - y;
      if (Math.hypot(dx, dy) <= radius) {
        return item;
      }
    }
    return null;
  }

  /**
   * Render all visible tiles and map ground objects
   */
  renderGround(ctx, camera) {
    const startCol = Math.max(0, Math.floor(camera.x - camera.viewportWidth / (2 * camera.zoom * this.tileSize)));
    const endCol = Math.min(this.width - 1, Math.ceil(camera.x + camera.viewportWidth / (2 * camera.zoom * this.tileSize)));
    const startRow = Math.max(0, Math.floor(camera.y - camera.viewportHeight / (2 * camera.zoom * this.tileSize)));
    const endRow = Math.min(this.height - 1, Math.ceil(camera.y + camera.viewportHeight / (2 * camera.zoom * this.tileSize)));

    // 1. Draw Ground Tiles
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const screen = camera.worldToScreen(c, r);
        const tileType = this.tiles[r][c];
        const variant = (c * 7 + r * 13) % 4;
        Sprites.drawTile(ctx, tileType, screen.x, screen.y, this.tileSize * camera.zoom, variant);
      }
    }

    // 2. Draw Ground items (apples, clovers, candy)
    for (const item of this.items) {
      const screen = camera.worldToScreen(item.x, item.y);
      if (item.type === 'apple') {
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 6 * camera.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#27ae60';
        ctx.fillRect(screen.x - 1, screen.y - 8 * camera.zoom, 2 * camera.zoom, 3 * camera.zoom);
      } else if (item.type === 'clover') {
        ctx.fillStyle = '#2ecc71';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 5 * camera.zoom, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3. Draw Benches
    for (const bench of this.benches) {
      const screen = camera.worldToScreen(bench.x, bench.y);
      Sprites.drawBench(ctx, screen.x, screen.y, bench.facing);
    }
  }

  /**
   * Render Y-sorted obstacles (Trees, Lanterns)
   */
  renderYEntities(ctx, camera) {
    const isNight = this.isNightTime();

    // Draw Lanterns
    for (const lantern of this.lanterns) {
      const screen = camera.worldToScreen(lantern.x, lantern.y);
      Sprites.drawLantern(ctx, screen.x, screen.y, isNight);
    }

    // Draw Trees
    for (const tree of this.trees) {
      const screen = camera.worldToScreen(tree.x, tree.y);
      Sprites.drawTree(ctx, screen.x, screen.y, tree.apples || 0, camera.zoom * 0.7);
    }
  }

  /**
   * Apply day/night lighting overlay
   */
  renderLighting(ctx, width, height) {
    const t = this.timeOfDay;
    let lightColor = 'transparent';

    // 0.0 - 0.2: Night
    // 0.2 - 0.35: Dawn / Sunrise (warm pink/orange)
    // 0.35 - 0.65: Day (clear / bright)
    // 0.65 - 0.8: Sunset / Dusk (golden amber)
    // 0.8 - 1.0: Night (deep blue/purple)

    if (t < 0.2 || t > 0.8) {
      // Deep night
      lightColor = 'rgba(15, 20, 50, 0.55)';
    } else if (t >= 0.2 && t < 0.35) {
      // Sunrise
      const alpha = 0.55 * (1 - (t - 0.2) / 0.15);
      lightColor = `rgba(80, 40, 70, ${alpha})`;
    } else if (t >= 0.65 && t <= 0.8) {
      // Sunset
      const progress = (t - 0.65) / 0.15;
      lightColor = `rgba(180, 80, 20, ${0.15 + progress * 0.4})`;
    }

    if (lightColor !== 'transparent') {
      ctx.save();
      ctx.fillStyle = lightColor;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  isNightTime() {
    return this.timeOfDay < 0.25 || this.timeOfDay > 0.75;
  }
}
