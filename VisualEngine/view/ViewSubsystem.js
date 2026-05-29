// The view: the PixiJS presentation layer. Owns the renderer/canvas, the camera
// transform, and per-frame drawing of whatever the grid says is on screen.
//
// Three coordinate spaces are in play:
//   - pixel space   — the actual tab/canvas pixels (varies per device/window)
//   - gameMeasure   — a resolution-independent logical space: the LONGER screen
//                     axis is always GAME_LONG (2000), the shorter is scaled to
//                     keep aspect. Game logic/camera sizing live here.
//   - world space   — where entities + the SpatialGrid live.
//
// Requires PixiJS loaded as a global `PIXI` before any method that touches it.

const GAME_LONG = 2000; // gameMeasure units along the longer screen axis

/**
 * Presentation subsystem. Reachable as `VisualEngine.shared.view`.
 */
export class ViewSubsystem {
  constructor() {
    /** gameMeasure dimensions (longest axis = GAME_LONG). Set by `measureGameSize`. */
    this.gameWidth = 0;
    this.gameHeight = 0;

    /** @type {any} PIXI.Application — created by `createCanvas`. */
    this.app = null;
    /** @type {any} The container the camera transforms; sprites live in here. */
    this.world = null;

    /** path → PIXI.Texture cache. @private */
    this._textures = new Map();
    /** Reused grid-query buffer (zero per-frame alloc). @private */
    this._visibleBuf = [];
    /** Sprites shown this/last frame, for cull toggling. Reused. @private */
    this._shown = new Set();
    this._nextShown = new Set();
  }

  /**
   * Derive the gameMeasure dimensions from the tab/viewport size. The longer
   * pixel axis maps to `GAME_LONG` (2000); the shorter is scaled proportionally
   * (`shorterPx / longerPx * GAME_LONG`) so aspect ratio is preserved. This makes
   * game/camera logic resolution-independent.
   *
   * @param {number} [pxWidth=window.innerWidth]   Viewport width in pixels.
   * @param {number} [pxHeight=window.innerHeight]  Viewport height in pixels.
   * @returns {{ gameWidth: number, gameHeight: number }}
   */
  measureGameSize(pxWidth = window.innerWidth, pxHeight = window.innerHeight) {
    const longest = Math.max(pxWidth, pxHeight);
    const shortest = Math.min(pxWidth, pxHeight);
    const shortGame = (shortest / longest) * GAME_LONG;

    if (pxWidth >= pxHeight) {
      this.gameWidth = GAME_LONG; // wide (the common case)
      this.gameHeight = shortGame;
    } else {
      this.gameHeight = GAME_LONG; // tall
      this.gameWidth = shortGame;
    }
    return { gameWidth: this.gameWidth, gameHeight: this.gameHeight };
  }

  /**
   * Create the Pixi renderer + canvas at the viewport's pixel size and attach it
   * so it fills the tab with no margins or letterboxing. `resizeTo: window` keeps
   * it filling as the window changes. Also creates the camera-transformed
   * `world` container that sprites are added to.
   *
   * @param {number} [background=0x1a1a1a]
   * @returns {Promise<any>} the PIXI.Application
   */
  async createCanvas(background = 0x1a1a1a) {
    this.measureGameSize();

    this.app = new PIXI.Application();
    await this.app.init({
      resizeTo: window, // fill the tab, auto-resize, no blank edges
      background,
      antialias: true,
    });
    document.body.appendChild(this.app.canvas);

    this.world = new PIXI.Container();
    this.app.stage.addChild(this.world);
    return this.app;
  }

  /**
   * Preload textures into the cache so sprites show immediately. Call once at
   * boot with the paths you'll use.
   * @param {string[]} paths
   */
  async load(paths) {
    for (const path of paths) {
      this._textures.set(path, await PIXI.Assets.load(path));
    }
  }

  /**
   * Draw one frame: ask the grid what's inside the camera, then create/position
   * a sprite for each visible entity and hide ones that left the view.
   *
   * The camera is in WORLD units; its aspect ratio should match the screen
   * (e.g. width = some world span, height = width * gameHeight/gameWidth) or the
   * image will stretch.
   *
   * @param {import("../memory/SpatialGrid.js").SpatialGrid} grid
   * @param {{ x: number, y: number, width: number, height: number }} camera
   *   World-space camera center (`x`,`y`) and size (`width`,`height`).
   */
  draw(grid, camera) {
    const app = this.app;
    if (!app) return;

    const left = camera.x - camera.width / 2;
    const top = camera.y - camera.height / 2;

    // Camera transform: the camera's world rect maps onto the whole canvas.
    const scale = app.renderer.width / camera.width;
    this.world.scale.set(scale);
    this.world.position.set(-left * scale, -top * scale);

    // What's on screen this frame.
    const visible = grid.query(
      { x: left, y: top, width: camera.width, height: camera.height },
      this._visibleBuf
    );

    const next = this._nextShown;
    next.clear();
    for (let i = 0; i < visible.length; i++) {
      const e = visible[i];
      const sprite = this._spriteFor(e);
      sprite.visible = true;
      sprite.x = e.x; // sprites placed at world coords; `world` transform → pixels
      sprite.y = e.y;
      sprite.rotation = e.angle; // radians; visual only
      next.add(sprite);
    }

    // Hide sprites that were shown last frame but aren't visible now.
    for (const s of this._shown) {
      if (!next.has(s)) s.visible = false;
    }

    // Swap the reused sets (no allocation).
    const tmp = this._shown;
    this._shown = next;
    this._nextShown = tmp;

    return visible;
  }

  /**
   * Get (or lazily create + cache) the sprite for an entity, stored on
   * `entity.display`. Sprite is scaled so its drawn diameter matches the
   * entity's collision diameter.
   * @private
   */
  _spriteFor(entity) {
    if (entity.display) return entity.display;

    const tex = this._texture(entity.texture);
    const sprite = new PIXI.Sprite(tex);
    sprite.anchor.set(0.5);
    if (tex.width) {
      sprite.scale.set((entity.collisionRadius * 2) / tex.width);
    }
    this.world.addChild(sprite);
    entity.display = sprite;
    return sprite;
  }

  /**
   * Cached texture for a path. Returns a white fallback for a missing path or one
   * not yet preloaded (so call {@link ViewSubsystem#load} first for real art).
   * @private
   */
  _texture(path) {
    if (!path) return PIXI.Texture.WHITE;
    const t = this._textures.get(path);
    return t !== undefined ? t : PIXI.Texture.WHITE;
  }
}
