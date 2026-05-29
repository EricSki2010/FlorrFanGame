# entities/ — API Reference

The game's entities — positioned circles that carry the data every other subsystem reads: `x`/`y` and `collisionRadius` (for `mechanics/collisions`), `collisionPoints` (for `VisualEngine`'s `SpatialGrid`), and `display` (its Pixi object, for the view).

One class with a `kind` tag rather than a deep hierarchy, so every entity shares the same hidden class — keeping property access fast in the hot collision/AI loops.

Files:
- `Entity.js` — the `Entity` class.
- `MobVariety.js` — per-mob-species data (`MobType` enum, texture / initial size / per-rarity scale).
- `Rarity.js` — shared rarity tiers + `rarityTier` helper (its own module so `Entity` and `MobVariety` don't import each other).

Dependency direction (no cycles): `Entity → MobVariety → Rarity`, and `Entity → Rarity`.

---

## `Entity`
**File:** `Entity.js`

### Constructor
- `new Entity({ x = 0, y = 0, kind = "mob", rarity = "common", mobType = null })` — creates an entity and its `collisionPoints` (allocated once here).
  - **If `mobType` is set** (a `MobType`): this is a mob — `collisionRadius` and `texture` come from `MobVariety` (keyed by species + rarity).
  - **If `mobType` is null**: `collisionRadius` uses the generic `Entity.radiusFor(kind, rarity)` and `texture` is `null` (e.g. the player, which draws via `circleBody`).

### Static
- `Entity.radiusFor(kind, rarity) → number` — generic sizing for **non-mob** kinds. Edit `BASE_RADIUS` / `RARITY_GROWTH` in `Entity.js` to retune. (Mobs size from `MobVariety` instead.)
- `RARITY` (re-exported from `Rarity.js`) — rarity tiers, lowest → highest.

### Properties
- `x: number`, `y: number` — world-space center.
- `kind: string` — broad type tag (`"player"`, `"mob"`, `"petal"`, …).
- `rarity: string` — one of `RARITY`.
- `mobType: string | null` — mob species (a `MobType`) when this is a mob, else `null`.
- `collisionRadius: number` — **derived**; from `MobVariety` for mobs, else `Entity.radiusFor`. Read every frame by collision.
- `texture: string | null` — sprite texture (mobs) or `null` (non-mobs).
- `collisionPoints: {x, y}[]` — points driving grid-cell membership. **Allocated once** in the constructor and **mutated in place** on every move — never reallocated, so moving stays allocation-free.
- `display` — the entity's Pixi display object; `null` until the view builds it on first sight, then cached here.

### Methods
- `setPosition(x, y)` — set position + refresh `collisionPoints`, **without** touching any grid. Use for initial placement / spawning before insertion.
- `moveTo(x, y, grid)` — move an entity that is already in `grid`, keeping it in sync. Uses **remove-before-mutate** (`grid.remove` against the old points → rewrite points in place → `grid.insert`), so it allocates nothing and you can't forget to re-index.

### Notes
- **Point coverage:** `collisionPoints` is the center plus 8 ring samples. That covers every overlapped cell only while an entity's diameter is roughly ≤ the grid cell size (the broadphase size/cell trade-off). Much larger entities would need area-filling points.
- **Radius changes** are picked up on the next `setPosition`/`moveTo` (which rewrite points using the current radius).

---

## `MobVariety`
**File:** `MobVariety.js`

Per-mob-species data, keyed by `MobType`.

- `MobType` — frozen-object "enum" of species (`BABY_ANT`, `HORNET`, `ROCK`, …).
- `mobVariety(type) → { texture, initialSize, rarityScale }` — the `switch` returning a species' sprite texture, base collision radius, and per-rarity multiplier array (indexed by `RARITY` tier). Unknown types fall to a `default`.
- `mobCollisionRadius(type, rarity) → number` — `initialSize × rarityScale[tier]`.
- `mobTexture(type) → string`.

> All textures / sizes / scale curves are **placeholders** — tune each `case`.

---

## `Rarity`
**File:** `Rarity.js`

- `RARITY: string[]` — rarity tiers, lowest → highest. Index = tier.
- `rarityTier(rarity) → number` — tier index, clamped (unknown rarity → 0).

---

## Usage example
```js
import { Entity } from "./GameEngine/entities/Entity.js";
import { MobType } from "./GameEngine/entities/MobVariety.js";
import { VisualEngine } from "./VisualEngine/VisualEngine.js";

const grid = VisualEngine.shared.memory.worldMap;

// a mob: size + texture come from MobVariety (species + rarity)
const hornet = new Entity({ x: 100, y: 100, mobType: MobType.HORNET, rarity: "epic" });
grid.insert(hornet);

// each frame, move it (grid stays in sync, no allocation):
hornet.moveTo(hornet.x + 2, hornet.y, grid);
```
