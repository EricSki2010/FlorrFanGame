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

import { allMobTextures } from "../../GameEngine/entities/MobVariety.js";
import { textureMeta } from "../textures/TextureMeta.js";

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
      try {
        this._textures.set(path, await PIXI.Assets.load(path));
      } catch (err) {
        // A missing/failed texture must NOT abort the rest — it just falls back
        // to the white placeholder. (e.g. only some art exists yet.)
        console.warn("texture failed to load (using placeholder):", path);
      }
    }
  }

  /**
   * Preload ALL known game textures (every mob sprite + the fallback) into the
   * cache. Convenience over `load(paths)` for the common "load everything at
   * boot" case. Extend the manifest as more asset categories are added.
   */
  async loadTextures() {
    await this.load(allMobTextures());
  }

  /**
   * Draw one frame: ask the grid what's inside the camera, then create/position
   * a sprite for each visible entity and hide ones that left the view.
   *
   * The camera is in WORLD units; its aspect ratio should match the screen
   * (e.g. width = some world span, height = width * gameHeight/gameWidth) or the
   * image will stretch.
   *
   * @param {import("../../GameEngine/memory/SpatialGrid.js").SpatialGrid} grid
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
      // radians; visual only. `_texRotation` is the texture's baked-in facing
      // offset (0 for circleBody/player), set once in `_spriteFor`.
      sprite.rotation = e.angle + (sprite._texRotation || 0);
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
   * Get (or lazily create + cache) the display object for an entity, stored on
   * `entity.display`.
   *
   * - If the entity has a `circleBody` factory (from `geometry`), build that — a
   *   Pixi circle drawn at its real world radius (used for the player).
   * - Otherwise make a texture sprite, scaled so its drawn diameter matches the
   *   entity's collision diameter.
   * @private
   */
  _spriteFor(entity) {
    if (entity.display) return entity.display;

    let display;
    if (typeof entity.circleBody === "function") {
      display = entity.circleBody(); // Pixi Container with a circle at world radius
    } else {
      const tex = this._texture(entity.texture);
      const meta = textureMeta(entity.texture); // per-PNG offset + sizing
      display = new PIXI.Sprite(tex);
      // Offset via the anchor (normalized → scales with the sprite): a +x offset
      // shifts the art right, so the anchored point moves left of center.
      display.anchor.set(0.5 - meta.offsetX, 0.5 - meta.offsetY);
      if (tex.width) {
        // Drawn diameter = collision diameter × the texture's scale factor.
        display.scale.set((entity.collisionRadius * 2 * meta.scale) / tex.width);
      }
      display._texRotation = meta.directionOffset; // read each frame in `draw`
    }
    this.world.addChild(display);
    entity.display = display;
    return display;
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
