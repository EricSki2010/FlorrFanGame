# textures/ — API Reference

Per-texture **visual metadata**: how a sprite aligns to, and is sized against, the entity's collision circle. Keyed by texture **path** (the image file), because several mob types can share one PNG.

This is purely a render concern — the headless `GameEngine` knows nothing about it; only `view` reads it. It exists because art is rarely centered and exactly filling its image (wings spill past the body, sprites have transparent padding, some art faces the wrong way), and we don't want those per-PNG fudge factors scattered through the view.

---

## `TextureMeta` (shape)
**File:** `TextureMeta.js`

- `scale: number` — drawn diameter = entity collision diameter × this. `>1` when art spills past the collision body (wings/glow/legs); `<1` to pull a padded image tighter. Default `1`.
- `offsetX: number` — horizontal nudge as a **fraction of the drawn size** (`+x` = right). A fraction (not pixels) so it scales correctly across rarities. Default `0`.
- `offsetY: number` — vertical nudge, fraction of drawn size (`+y` = down). Default `0`.
- `directionOffset: number` — facing offset in **radians** added to the entity's heading (`entity.angle`, which `GameEngine.step` points along the intended movement direction). Use it when the art doesn't face `+x` at angle 0 — facing up wants `-Math.PI / 2`, facing left wants `Math.PI`. Default `0`. This is what aligns a sprite with the direction it's moving.

## `textureMeta(path) → TextureMeta`
The `switch` returning a texture's metadata. Unknown paths — and the player, which has no texture — fall back to a frozen `DEFAULT` (`scale 1`, no offset, no rotation), so adding art **without** an entry just renders it centered + collision-sized. Add a `case` per image that needs tuning.

> Keys must match the paths `GameEngine/entities/MobVariety.js` builds (same `TEXTURE_DIR`). A mismatched key silently falls back to `DEFAULT` — no crash, just no offset. Current values are **placeholders**; measure against the real art.

---

## How the view applies it
In `ViewSubsystem._spriteFor`, on first sight of a textured entity:
- `anchor = (0.5 - offsetX, 0.5 - offsetY)` — the offset rides the anchor, so it's normalized to the sprite and scales with it.
- `scale = (collisionRadius × 2 × meta.scale) / texture.width`.
- `directionOffset` is cached on the sprite as `_texRotation`; each frame `draw` sets `sprite.rotation = entity.angle + sprite._texRotation`.

## Usage example
```js
import { textureMeta } from "../textures/TextureMeta.js";

const meta = textureMeta(entity.texture);
sprite.anchor.set(0.5 - meta.offsetX, 0.5 - meta.offsetY);
sprite.scale.set((entity.collisionRadius * 2 * meta.scale) / tex.width);
sprite._texRotation = meta.directionOffset;
```
