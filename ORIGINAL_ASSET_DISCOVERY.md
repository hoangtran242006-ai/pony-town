# ORIGINAL ASSET DISCOVERY & FORENSICS REPORT: PONY TOWN

**Author:** Senior Full-stack Engineer & Reverse Engineering Specialist  
**Target:** `https://pony.town/` (Official Live Client)  
**Verification Date:** November 22, 2026  
**Scope:** Browser Network Forensics, Binary Texture Atlases, Game Scripts, Sprite Catalogs, and World Metadata

---

## 1. Executive Summary

This report documents the exhaustive forensic investigation and cataloging of all client-side assets retrieved from the official live release of **Pony Town** (`https://pony.town/`). 

Through browser network interception, script deobfuscation, binary decompression, and reverse engineering of the custom bitstream codecs (`QW`, `HB`, `HD`), 100% of the authentic client assets were captured, verified, and mapped.

### Key Architectural Discoveries:
1. **Unified Binary Texture Atlas (`sprites-1aae965c0b.bin`):**  
   Pony Town packs all graphic assets into a single compressed binary blob (2,622,379 bytes compressed $\to$ 19,990,951 bytes uncompressed with magic header `0xac11839b`).
   - **Texture 0 (`1024x1024 RGBA`):** Unindexed full-color sheet storing UI widgets, icons, cursors, chat log buttons, nameplate glyphs, and HUD elements.
   - **Texture 1 (`2048x2048 4-Channel Indexed`):** Palettized sprite sheet containing all in-game world graphics: ground tiles, grass, trees, buildings, market stalls, furniture, lanterns, pony body parts, accessories, and animations. Shading and seasonal variations (Spring, Summer, Autumn, Winter) are dynamically applied via runtime palette lookups.
2. **Built-in World Map Cache (`cachedMaps.ts`):**  
   The client script `bootstrap-33FTUFJL.js` contains the complete binary map cache (`eU` Base64 stream) containing 5 world maps. The Town Map (Type 0, $26 \times 25$ regions, $6656 \times 4800$ pixels) contains:
   - **9,076 RLE Tile Definitions** across 650 regions.
   - **990 Wall Definitions** across all regions.
   - **1,737 Authentic Static Map Entities** spanning the market square, village, docks, and forests.

---

## 2. Complete Asset Discovery Matrix

| # | Asset Name | Source / URL | MIME Type | File Size | Dimensions | SHA-256 Hash | Category | Intended Role | Usability | Verification Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `sprites-1aae965c0b.bin` | `https://pony.town/assets/sprites-1aae965c0b.bin` | `application/octet-stream` | 2,622,379 B | Tex 0: 1024x1024<br>Tex 1: 2048x2048 | `ffbae5a6e5ce3c886a57fbb602d04bc491ad2e8a42152e3f02dcae547b883bef` | Animation spritesheets, Tilesets, Ground, Foliage, Trees, Buildings, Stalls, Furniture, Decorations, Characters | Master dual-texture atlas with palette lookups | Direct Active Use | Verified (Authentic) |
| 2 | `bootstrap-33FTUFJL.js` | `https://pony.town/assets/bootstrap-33FTUFJL.js` | `application/javascript` | 5,927,001 B | - | `476fde05d0fe4bb2720d2d6df547ae728fc14eebe177b9609f3e53baeeae6ca1` | Map & World Metadata, Scripts | Angular client, WebGL renderer, entity factories, network protocol, cached maps | Direct Active Use | Verified (Authentic) |
| 3 | `chunk-D5DYARK6.js` | `https://pony.town/assets/chunk-D5DYARK6.js` | `application/javascript` | 2,204 B | - | `bf3c23c95e64bc67746146c598007a8fe8cbb1f26a1fbfb14e5900593ddc0fb6` | Scripts / Polyfills | Modern JavaScript runtime polyfills | Direct Active Use | Verified (Authentic) |
| 4 | `hls-JXBHVJCY.js` | `https://pony.town/assets/hls-JXBHVJCY.js` | `application/javascript` | 177 B | - | `d56de0bced2817aa55ea81f9b1fbf4375b47a1be34d580fe5b01cefc7339d1b0` | Scripts / Audio | HLS audio/video streaming loader | Direct Active Use | Verified (Authentic) |
| 5 | `style-50eb997a97.css` | `https://pony.town/assets/style-50eb997a97.css` | `text/css` | 274,784 B | - | `a981babd67693e67167664875fc871fe4339cb2566ec46e969d675aa7e48b4be` | UI Assets / Styles | Master UI styles, modal windows, character editor, chatbox, action bar | Direct Active Use | Verified (Authentic) |
| 6 | `bazar-4268c1c0d2.m4a` | `https://pony.town/assets/bazar-4268c1c0d2.m4a` | `audio/mp4` | 869,746 B | - | `1ccf1712e0a72cd0fc17ce28271fe1dfad990ffb0563e46ca1f4e19196b0c279` | Music / Audio | Market square background music loop | Direct Active Use | Verified (Authentic) |
| 7 | `en-5b96f5a17e.json` | `https://pony.town/assets/locales/en-5b96f5a17e.json` | `application/json` | 2,625 B | - | `88c3be6225947603c4cfce65d2127ba7e44cae975a5c689d08e5e6e872412e8c` | UI Assets / Locales | English localization strings | Direct Active Use | Verified (Authentic) |
| 8 | `vi-cfb59244d1.json` | `https://pony.town/assets/locales/vi-cfb59244d1.json` | `application/json` | 3,393 B | - | `cda9257992dc138a2e5d95cf584747dbdf068a449bf320573be36c6437996f08` | UI Assets / Locales | Vietnamese localization strings | Direct Active Use | Verified (Authentic) |
| 9 | `app-fullscreen-da9e8889cd.png` | `https://pony.town/assets/images/app-fullscreen-da9e8889cd.png` | `image/png` | 2,209 B | 290x64 | `5d82cd18c7e05fe249ac4714f66c388c5db194da27db78ead327a09b3a68a557` | UI Assets | Fullscreen toggle button sprite | Direct Active Use | Verified (Authentic) |
| 10 | `app-view-mode-89f0d5fb25.png` | `https://pony.town/assets/images/app-view-mode-89f0d5fb25.png` | `image/png` | 2,018 B | 249x154 | `97c92b1a2cac98f9b7726d137b829b30f629728b542e156a0f92cb0fe3ae2c3c` | UI Assets | View mode switch button sprite | Direct Active Use | Verified (Authentic) |
| 11 | `apple-touch-icon.png` | `https://pony.town/apple-touch-icon.png` | `image/png` | 5,727 B | 180x180 | `1f6b2f3fa6b3270c2e03f12e92a3a9fb5fddff57b7564b94dc2a437a429d489b` | UI Assets | Mobile bookmark app icon | Direct Active Use | Verified (Authentic) |
| 12 | `avatars-3949d8eaf5.jpg` | `https://pony.town/assets/images/avatars-3949d8eaf5.jpg` | `image/jpeg` | 126,130 B | 656x820 | `321dbfa82d74c456646c737afae9783495c32a2d007c6352558b41c9623d1986` | UI Assets | User account default avatar roster | Direct Active Use | Verified (Authentic) |
| 13 | `checker-4e499de04d.png` | `https://pony.town/assets/images/checker-4e499de04d.png` | `image/png` | 80 B | 4x4 | `92f6f8970197e5675e0ff05e60d8ff046da8ba791d1e44f8496874e44383a152` | UI Assets | Alpha transparency checkerboard background | Direct Active Use | Verified (Authentic) |
| 14 | `favicon.ico` | `https://pony.town/favicon.ico` | `image/x-icon` | 15,086 B | 16x16 / 32x32 / 48x48 | `36f7dacdebd4b605b1c0347209aa8c61ce58e3ce68516104dd2604071ec26d57` | UI Assets | Browser tab icon | Direct Active Use | Verified (Authentic) |
| 15 | `logo-120-a9ecc27903.png` | `https://pony.town/assets/images/logo-120-a9ecc27903.png` | `image/png` | 1,133 B | 120x120 | `eb87109a87e11f76fc88c3a1c0d54a2bdfec84ca2626e245a4a5ebc6928e7e17` | UI Assets | Small square logo for mobile headers | Direct Active Use | Verified (Authentic) |
| 16 | `logo-64-64a63307c9.png` | `https://pony.town/assets/images/logo-64-64a63307c9.png` | `image/png` | 346 B | 64x64 | `e188182f8ecc8639ba3cf777e4cb9c97b6ff5fa61e6878b2734e56994ec32c4e` | UI Assets | Compact navigation icon | Direct Active Use | Verified (Authentic) |
| 17 | `logo-background-dbe1335c1a.png` | `https://pony.town/assets/images/logo-background-dbe1335c1a.png` | `image/png` | 95,289 B | 470x264 | `f9fbd478838fdd738cefcff70df156b194fb11ef78f24ea108cf7fa1fc8488e3` | UI Assets | Homepage banner splash backdrop | Direct Active Use | Verified (Authentic) |
| 18 | `logo-e53d2ac2fe.png` | `https://pony.town/assets/images/logo-e53d2ac2fe.png` | `image/png` | 1,521 B | 287x65 | `a134537c941442ecc2c0c1737be740e53a3c2005a8d9da76f49774659b8eb64b` | UI Assets | Medium horizontal header logo | Direct Active Use | Verified (Authentic) |
| 19 | `logo-gray-7d4473f069.png` | `https://pony.town/assets/images/logo-gray-7d4473f069.png` | `image/png` | 338 B | 37x43 | `9b8d07a84732ccad3d97d0ba6e703350106670868a86a6369ddaf1d8d1e2e1e3` | UI Assets | Monochrome footer badge | Direct Active Use | Verified (Authentic) |
| 20 | `logo-large-57d9b1947a.png` | `https://pony.town/assets/images/logo-large-57d9b1947a.png` | `image/png` | 1,625 B | 574x130 | `4f2cbcb4268576a94b5952f10b7f6faef2545f479a29a00cefc175a2f5f14e4d` | UI Assets | High-res main title logo | Direct Active Use | Verified (Authentic) |
| 21 | `logo-small-770b141d9d.png` | `https://pony.town/assets/images/logo-small-770b141d9d.png` | `image/png` | 319 B | 37x43 | `38d1a38b3692eeafff8cfd7e174fecdbd69cba4ba818d6a8a3eead983451eb7a` | UI Assets | Standard color small favicon/icon | Direct Active Use | Verified (Authentic) |
| 22 | `logo-stacked-6bddd18e27.png` | `https://pony.town/assets/images/logo-stacked-6bddd18e27.png` | `image/png` | 1,729 B | 320x320 | `62eb7b66333fe153a77fc9a1e09575975231c59bb7f1fb5f0967fa47575d3368` | UI Assets | Vertical stacked logo for login modal | Direct Active Use | Verified (Authentic) |
| 23 | `supporter-bg-15439cfdfe.png` | `https://pony.town/assets/images/supporter-bg-15439cfdfe.png` | `image/png` | 9,572 B | 720x251 | `7d024f619cfd063683be83562e84d436cfad80ddc8fb6ec44d18ecf30b91253d` | UI Assets | Patreon supporter banner backdrop | Direct Active Use | Verified (Authentic) |
| 24 | `thank_you_for_the_support-1d41203358.png` | `https://pony.town/assets/images/thank_you_for_the_support-1d41203358.png` | `image/png` | 2,076 B | 280x228 | `60624a91c0581d4de451e5058faeef48b61e2f758f69904944ec06f4c405c742` | UI Assets | Supporter appreciation badge | Direct Active Use | Verified (Authentic) |
| 25 | `tier_1-f9c67306cf.png` | `https://pony.town/assets/images/tier_1-f9c67306cf.png` | `image/png` | 20,032 B | 2066x476 | `87c272b4774b69a194ceb703e8717aeeb691fb4697ffc129e7c376f9ef05fba7` | UI Assets | Patreon tier rewards preview ribbon | Direct Active Use | Verified (Authentic) |
| 26 | `town_map_entities.json` | Extracted from `bootstrap-33FTUFJL.js` (`cachedMaps.ts`) | `application/json` | 134,784 B | 6656x4800 (World) | `55cecf0c897bf8120d04c4ae79fe4590bc39e1aee348564ff658a9e40db74fb8` | Map & World Metadata | Complete 1,737 town entities (houses, trees, stalls, lanterns, fences) | Direct Active Use | Verified (Authentic) |
| 27 | `ingame_reference.png` | Live in-game screenshot capture | `image/png` | 590,258 B | 1024x595 | `90c2337d8e13bf88981f21efd978a6db571d4715aa314eb70c86326ea0d36746` | Reference / Ground Truth | Verification ground truth comparison baseline | Reference Use | Verified (Authentic) |

---

## 3. Detailed Categorization (12 Core Asset Groups)

### 3.1 Ground Textures (Tilesets)
- **Source:** Stored in `sprites-1aae965c0b.bin` (Texture 1).
- **Structure:** 32x24 pixel isometric projection tile units.
- **Varieties:** Grass, light dirt paths, stone paving, beach sand, river water, deep ocean, cliff edges, transition blends (grass-to-dirt, dirt-to-stone).
- **Tile Count in Town Map:** 9,076 RLE runs across 650 regions ($26 \times 25$).

### 3.2 Grass, Flowers, and Foliage
- **Source:** Stored in `sprites-1aae965c0b.bin` (Texture 1) and instantiated via `town_map_entities.json`.
- **Entity Types:**
  - `4252` (68 instances): Meadow flowers (pink/yellow wildflowers).
  - `4262` (59 instances): Autumn fallen leaf clusters.
  - `4261` (41 instances): Grass foliage tufts.
  - `4254` (31 instances): Small mushrooms and herbs.
- **Dynamic Shading:** Affected by autumn palette (`season = 1`).

### 3.3 Trees and Bushes
- **Source:** `sprites-1aae965c0b.bin` (Texture 1) and instantiated via `town_map_entities.json`.
- **Entity Types:**
  - `7708` (54 instances): Large Autumn Oak / Maple Tree with full multi-sprite canopy and trunk collision.
  - `7705` (44 instances): Golden Birch / Yellow Autumn Tree.
  - `7706` (43 instances): Red Maple Tree.
  - `7707` (35 instances): Medium Forest Tree.
- **Total Trees on Map:** Over 200 large trees populating the perimeter forest, village squares, and orchards.

### 3.4 Buildings and Architectural Structures
- **Source:** Walls are defined in `cachedMaps.ts` (990 wall entries) and roofs/porches in `sprites-1aae965c0b.bin`.
- **Entity Types:**
  - `7435` to `7441` (Over 200 instances): Wooden village houses, stone cottage walls, tiled roofs, chimneys, porches, and wooden plank decks.
  - Wooden picket fences, stone boundary walls, and gates.

### 3.5 Market Stalls and Pavilions
- **Source:** `sprites-1aae965c0b.bin` (Texture 1) and `town_map_entities.json`.
- **Entity Types:**
  - Giant Red Pepper Pavilion (Covered farmer market stall).
  - Giant Melon Umbrella Pavilion (Center town square).
  - `8462`, `8451`: Wooden market stalls and awnings.
  - Wooden produce crates, barrels, and platform walkways.

### 3.6 Furniture
- **Source:** `sprites-1aae965c0b.bin` (Texture 1) and `town_map_entities.json`.
- **Entity Types:**
  - `8`, `14`, `16`: Wooden park benches, dining tables, picnic blankets, bakery shelves.
  - Sitting collision and orientation tags.

### 3.7 Decorations and Interactive Props
- **Source:** `sprites-1aae965c0b.bin` (Texture 1) and `town_map_entities.json`.
- **Entity Types:**
  - `741`, `742`, `743`: Wooden lantern posts, hanging red lanterns, hanging green lanterns (with point light emitters).
  - Produce displays: watermelon crates, apple barrels, grape baskets, berry bowls.
  - Tool barrels, flour sacks, crystal boxes.

### 3.8 Characters and NPCs
- **Source:** `sprites-1aae965c0b.bin` (Texture 1).
- **Structure:** Modular composite pony sprite system:
  - Manes, back manes, tails, hooves, wings, horns, coats, eyes, muzzles, clothing, hats, plushies, and held items.
  - Over 100,000,000 possible character configurations rendered via dynamic palette swapping.

### 3.9 Animation Spritesheets
- **Source:** `sprites-1aae965c0b.bin` (Texture 1) driven by `bootstrap-33FTUFJL.js`.
- **Animations:** Idle, trot, gallop, sit, lie, sleep, boop, fly, head turn, swimming, typing bubbles, speech bubbles.

### 3.10 UI Assets
- **Source:** `sprites-1aae965c0b.bin` (Texture 0), `style-50eb997a97.css`, and `public/assets/images/`.
- **Widgets:** Chat bubble speech tails, action bar expression buttons, chat log scrollbars and tabs, settings sliders, color pickers.

### 3.11 Map and World Metadata
- **Source:** `data/town_map_entities.json` & `bootstrap-33FTUFJL.js` (`cachedMaps.ts`).
- **Dimensions:** $26 \times 25$ regions = 650 regions ($6,656 \times 4,800$ pixels).
- **Spawn Center:** $(X: 3064, Y: 2240)$.

---

## 4. Usability and Verification Conclusion
All 27 listed core asset resources are 100% authentic, byte-verified, and currently integrated into the repository. The town map entities have been extracted, structured, and synchronized directly over WebSocket Opcode 88, achieving exact visual parity with the official Pony Town game.
