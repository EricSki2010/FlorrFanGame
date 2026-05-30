# entities/ — API Reference

The game's entities — positioned circles that carry the data every other subsystem reads: `x`/`y` and `collisionRadius` (for `mechanics/collisions`), `collisionPoints` (for the game engine's `SpatialGrid`), and `display` (its Pixi object, for the view).

One class with a `kind` tag rather than a deep hierarchy, so every entity shares the same hidden class — keeping property access fast in the hot collision/AI loops.

Files:
- `Entity.js` — the `Entity` class.
- `MobVariety.js` — per-mob-species data (`MobType` enum, texture / size / density / speed / range / per-rarity scale).
- `Rarity.js` — shared rarity tiers + `rarityTier` helper (its own module so `Entity` and `MobVariety` don't import each other).
- `Targeting.js` — *(empty stub)* future home of targeting logic (how an entity picks its `target` point).

Dependency direction (no cycles): `Entity → MobVariety → Rarity`, and `Entity → Rarity`.

---

## `Entity`
**File:** `Entity.js`

### Constructor
- `new Entity({ x = 0, y = 0, kind = "mob", rarity = "common", mobType = null, angle = 0, momentum = 0, direction = 0, id? })` — creates an entity and its `collisionPoints` (allocated once here). `id` defaults to a unique local counter; pass one for a server-assigned id.
  - **If `mobType` is set** (a `MobType`): this is a mob — `collisionRadius` and `texture` come from `MobVariety` (keyed by species + rarity).
  - **If `mobType` is null**: `collisionRadius` uses the generic `Entity.radiusFor(kind, rarity)` and `texture` is `null` (e.g. the player, which draws via `circleBody`).

### Static
- `Entity.radiusFor(kind, rarity) → number` — generic sizing for **non-mob** kinds. Edit `BASE_RADIUS` / `RARITY_GROWTH` in `Entity.js` to retune. (Mobs size from `MobVariety` instead.)
- `RARITY` (re-exported from `Rarity.js`) — rarity tiers, lowest → highest.
- `Disposition` (exported) — frozen-object enum: `HOSTILE` / `NEUTRAL` / `PASSIVE`.

### Properties
- `id: number` — unique **instance** id (this entity, not its species — distinct from `kind`/`mobType`). Network-stable; auto-assigned from a local counter, or pass `{ id }` to use a server-assigned one.
- `x: number`, `y: number` — world-space center.
- `angle: number` — facing/rotation in radians. **Visual only** — collision circles are rotation-invariant, so it never affects `collisionPoints` or `detect`. The view applies it as `sprite.rotation`.
- `momentum: number` — intended-movement magnitude ("wanting to move"; 0 = at rest).
- `direction: number` — intended-movement heading in radians, independent of `angle` (the visual facing). Velocity components are `momentum·cos(direction)`, `momentum·sin(direction)`.
- `knockbackX, knockbackY: number` — per-step knockback accumulator (cartesian), kept **separate** from intended movement. Summed during collision response, applied, then cleared each step.
- `density: number` — mass-like value driving collision push ratios (denser shoves more). Derived; rarity-scaled.
- `speed: number` — movement magnitude applied per step toward a target. Derived; rarity-scaled.
- `range: number` — target-detection range. Derived (mobs from `MobVariety`).
- `target: {x, y}` — AI target **point** (always an x/y, not an entity). Reused/mutated, so retargeting allocates nothing.
- `hasTarget: boolean` — whether `target` is currently active (movement only seeks when true).
- `kind: string` — broad type tag (`"player"`, `"mob"`, `"petal"`, …).
- `rarity: string` — one of `RARITY`.
- `mobType: string | null` — mob species (a `MobType`) when this is a mob, else `null`.
- `disposition: string` — behaviour toward the player, one of `Disposition` (`HOSTILE` / `NEUTRAL` / `PASSIVE`). Defaults to neutral.
- `collisionRadius: number` — **derived**; from `MobVariety` for mobs, else `Entity.radiusFor`. Read every frame by collision.
- `texture: string | null` — sprite texture (mobs) or `null` (non-mobs).
- `collisionPoints: {x, y}[]` — points driving grid-cell membership. **Allocated once** in the constructor and **mutated in place** on every move — never reallocated, so moving stays allocation-free.
- `display` — the entity's Pixi display object; `null` until the view builds it on first sight, then cached here.

### Methods
- `setPosition(x, y)` — set position + refresh `collisionPoints`, **without** touching any grid. Use for initial placement / spawning before insertion.
- `moveTo(x, y, grid)` — move an entity that is already in `grid`, keeping it in sync. Uses **remove-before-mutate** (`grid.remove` against the old points → rewrite points in place → `grid.insert`), so it allocates nothing and you can't forget to re-index.
- `addMovement(dir, magnitude)` — add a movement impulse to `momentum`/`direction` (polar add; impulses from different directions combine correctly).
- `addKnockback(x, y)` — accumulate cartesian knockback (separate from intended movement).
- `decayMovement(threshold, factor)` — zero `momentum` below `threshold`, else scale it by `factor` (friction).
- `retarget(candidate)` — aim `target` at `candidate`'s point if within `range` (and not self), setting `hasTarget`; else clear `hasTarget`. Stores only the position. *Placeholder until `Targeting.js` takes over.*

### Notes
- **Point coverage:** `collisionPoints` fills the whole disk as **concentric rings** — a center point, the **edge ring** at `radius` sampled finely (every `EDGE_SPACING` = 20, since the edge is where circles actually touch), and **interior rings** every `RING_SPACING` (64) inward sampled coarsely (every `POINT_SPACING` = 100, enough for cell coverage). Because the mesh is spaced under the 128 cell size in both directions, the entity is registered in **every** cell it overlaps — including interior cells — so even entities larger than a cell (and small entities fully inside large ones) are found by broadphase. Inner rings have fewer points. Offset arrays are cached and shared by radius.
- **Tied to cell size:** `RING_SPACING`/`POINT_SPACING` assume the 128 grid; keep both < the cell size if you change it (`cell/2` for rings is a safe choice).
- **Radius changes** are picked up on the next `setPosition`/`moveTo`. Point *count/layout* is fixed at construction.

---

## `MobVariety`
**File:** `MobVariety.js`

Per-mob-species data, keyed by `MobType`.

- `MobType` — frozen-object "enum" of species (`BABY_ANT`, `HORNET`, `ROCK`, …).
- `mobVariety(type) → { texture, initialSize, rarityScale }` — the `switch` returning a species' sprite texture, base collision radius, and per-rarity multiplier array (indexed by `RARITY` tier). Unknown types fall to a `default`.
- `mobVariety(type) → { texture, initialSize, density, speed, range, rarityScale }`.
- `mobCollisionRadius(type, rarity) → number` — `initialSize × rarityScale[tier]`.
- `mobDensity(type, rarity) → number` — base density, rarity-scaled (denser at higher tiers).
- `mobSpeed(type, rarity) → number` — base speed, rarity-scaled.
- `mobRange(type) → number` — target-detection range (not rarity-scaled).
- `mobTexture(type) → string`.
- `allMobTextures() → string[]` — every unique mob texture path (+ fallback); the manifest the view preloads via `loadTextures()`.

> All textures / sizes / scale curves are **placeholders** — tune each `case`.

---

## `Rarity`
**File:** `Rarity.js`

- `Rarity` — frozen-object "enum" of named rarity ids (`Rarity.COMMON … Rarity.SUPER`), same pattern as `MobType`. Use the constants instead of raw strings; the string values double as the ids stored on entities. (Re-exported from `Entity.js` too.)
- `RARITY: readonly string[]` — tiers lowest → highest, derived from `Rarity`'s order. Index = tier.
- `rarityTier(rarity) → number` — tier index, clamped (unknown rarity → 0).

Raw strings still work everywhere (the enum values *are* those strings), so existing code isn't broken.

---

## Usage example
```js
import { GameEngine } from "./GameEngine/GameEngine.js";
import { Entity } from "./GameEngine/entities/Entity.js";
import { MobType } from "./GameEngine/entities/MobVariety.js";

const grid = GameEngine.shared.memory.worldMap;

// a mob: size + texture come from MobVariety (species + rarity)
const hornet = new Entity({ x: 100, y: 100, mobType: MobType.HORNET, rarity: "epic" });
grid.insert(hornet);

// each frame, move it (grid stays in sync, no allocation):
hornet.moveTo(hornet.x + 2, hornet.y, grid);
```
