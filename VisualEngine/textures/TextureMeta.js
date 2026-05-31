// Per-texture VISUAL metadata — how a sprite aligns to, and is sized against,
// the entity's collision circle. Keyed by texture PATH (the image file), because
// several mob types can share one PNG (e.g. the temporary `bug.png`).
//
// This is strictly a RENDER concern: the headless GameEngine knows nothing about
// it — only the view reads it. It exists because art is rarely centered and
// exactly filling its image: a hornet's wings spill past the body, a sprite has
// transparent padding, some art faces "up" instead of +x. Rather than scatter
// those per-PNG fudge factors through the view, each image gets one entry here.

// NOTE: keys must match the paths MobVariety builds
// (GameEngine/entities/MobVariety.js uses this same TEXTURE_DIR). Kept as a local
// copy so VisualEngine doesn't reach into GameEngine internals; if a path here
// doesn't match, the lookup simply falls back to DEFAULT (no crash, no offset).
const TEXTURE_DIR = "Assets/textures/entities";
const tex = (file) => `${TEXTURE_DIR}/${file}`;

/**
 * @typedef {Object} TextureMeta
 * @property {number} scale    Drawn diameter = entity collision diameter × this.
 *   `>1` when the art spills past the collision body (wings, glow, legs); `<1` to
 *   pull a padded image in tighter so the body matches the circle. Default `1`.
 * @property {number} offsetX  Horizontal nudge as a FRACTION of the drawn size
 *   (`+x` = right). Use when the body sits off-center in the image. Because it's
 *   a fraction, it scales correctly across rarities. Default `0`.
 * @property {number} offsetY  Vertical nudge as a fraction of the drawn size
 *   (`+y` = down). Default `0`.
 * @property {number} directionOffset Facing offset in RADIANS added to the
 *   entity's heading (`entity.angle`, which `GameEngine.step` points along the
 *   intended movement direction). Use it when the art doesn't face `+x` at
 *   angle 0 — a sprite drawn facing up wants `-Math.PI / 2`, facing left wants
 *   `Math.PI`, etc. Default `0`.
 */

/** Centered, collision-sized, no facing correction — what a clean sprite drawn
 * facing `+x` (right) wants. */
const DEFAULT = Object.freeze({ scale: 1, offsetX: 0, offsetY: 0, directionOffset: 0 });

/**
 * Visual metadata for a texture path. Unknown paths — and the player, which has
 * no texture — fall back to {@link DEFAULT} (so adding art without an entry just
 * renders it centered + collision-sized).
 *
 * Add a `case` per image that needs tweaking. Values are PLACEHOLDERS — measure
 * against the real art. (Two illustrative entries are commented out below.)
 *
 * @param {string|null} path A texture path (e.g. from `entity.texture`).
 * @returns {TextureMeta}
 */
export function textureMeta(path) {
  switch (path) {
    // --- examples of the shape (uncomment + tune once real art exists) ---
    // case tex("hornet.png"):
    //   // Wings reach well past the body, so draw ~30% bigger than the circle.
    //   return { scale: 1.3, offsetX: 0, offsetY: 0, directionOffset: 0 };
    // case tex("spider.png"):
    //   // Body sits a touch high in the image; art is drawn facing UP, so rotate
    //   // it −90° to line the sprite up with the heading it's moving toward.
    //   return { scale: 1.1, offsetX: 0, offsetY: 0.08, directionOffset: -Math.PI / 2 };

    default:
      return DEFAULT;
  }
}
