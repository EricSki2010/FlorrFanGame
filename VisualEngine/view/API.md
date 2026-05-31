# view/ — API Reference

The PixiJS presentation layer — owns the renderer/canvas, the camera transform, and per-frame drawing of whatever the grid reports as on-screen.

Three coordinate spaces:
- **pixel** — actual tab/canvas pixels (device/window dependent).
- **gameMeasure** — resolution-independent logical space: the longer screen axis is always `GAME_LONG` (2000), the shorter scaled to preserve aspect. Game/camera logic lives here.
- **world** — where entities + `SpatialGrid` live.

> Requires PixiJS loaded as a global `PIXI` before any method that touches it.

---

## `ViewSubsystem`
**File:** `ViewSubsystem.js`

Reachable as `VisualEngine.shared.view`.

### Properties
- `gameWidth`, `gameHeight` — gameMeasure dimensions (set by `measureGameSize`).
- `app` — the `PIXI.Application` (after `createCanvas`).
- `world` — the camera-transformed container sprites are added to.

### Methods

#### `measureGameSize(pxWidth?, pxHeight?) → { gameWidth, gameHeight }`
Derives the gameMeasure dimensions from the viewport (tab) size. The longer pixel axis maps to `GAME_LONG` (2000); the shorter is `shorterPx / longerPx * 2000`, preserving aspect. Defaults to `window.innerWidth/Height`.

#### `createCanvas(background = 0x1a1a1a) → Promise<PIXI.Application>`
Creates the Pixi renderer + canvas at the viewport's pixel size and attaches it so it fills the tab with **no margins or letterboxing** (`resizeTo: window` keeps it filling on resize). Also creates the camera-transformed `world` container.

#### `load(paths) → Promise<void>`
Preloads the given texture paths into the cache so sprites show immediately.

#### `loadTextures() → Promise<void>`
Convenience: preloads **all** known game textures (every mob sprite + the fallback, via `allMobTextures()`) — the usual "load everything at boot" call.

#### `draw(grid, camera)`
Draws one frame: queries `grid` for entities inside the `camera` world rect, creates/positions a sprite per visible entity (caching it on `entity.display`), and hides sprites that left the view. `camera` is `{ x, y, width, height }` in **world units**; its aspect should match the screen or art will stretch. Allocation-free per frame (reused query buffer + cull sets).

### Notes
- Sprites are placed at world coordinates inside `world`; the `world` container's scale/position implements the camera, mapping world → pixels.
- **Per-texture alignment** comes from [`textures/TextureMeta.js`](../textures/API.md), keyed by texture path: `scale` (drawn diameter = collision diameter × scale), `offsetX`/`offsetY` (anchor nudge, fraction of drawn size), and `directionOffset` (facing correction added to `entity.angle`). Defaults reproduce plain centered + collision-sized rendering, so untuned art is unaffected.
- Each sprite's `rotation` is `entity.angle + textureMeta.directionOffset` (radians) — visual only. The facing offset is cached on the sprite as `_texRotation`.
- A sprite is scaled so its drawn diameter matches the entity's collision diameter (`2 × collisionRadius`) times the texture's `scale`.
- Missing/not-yet-loaded textures fall back to `PIXI.Texture.WHITE` — preload real art with `load()`.

### Still needed to spawn a mob on screen
- PixiJS loaded + a boot script in `index.html`.
- An entity manager / `spawn` that creates an `Entity`, inserts it into `GameEngine.shared.memory.worldMap`, and calls `draw` each tick.
