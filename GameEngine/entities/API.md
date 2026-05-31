# entities/ — API Reference

The game's entities — positioned circles that carry the data every other subsystem reads: `x`/`y` and `collisionRadius` (for `mechanics/collisions` **and** the game engine's `SpatialGrid`, which indexes by the bounding box), and `display` (its Pixi object, for the view).

One class with a `kind` tag rather than a deep hierarchy, so every entity shares the same hidden class — keeping property access fast in the hot collision/AI loops.

Files:
- `Entity.js` — the `Entity` class.
- `MobVariety.js` — per-mob-species data (`MobType` enum, texture / size / density / speed / range / per-rarity scale).
- `Rarity.js` — shared rarity tiers + `rarityTier` helper (its own module so `Entity` and `MobVariety` don't import each other).
- `Disposition.js` — the `Disposition` enum (its own module for the same no-cycle reason; re-exported from `Entity`).
- `Targeting.js` — targeting logic: `updateTargets(entities)` picks each seeker's target point.

Dependency direction (no cycles): `Entity → MobVariety → Rarity`, and `Entity → Rarity`.

---

## `Entity`
**File:** `Entity.js`

### Constructor
- `new Entity({ x = 0, y = 0, kind = "mob", rarity = "common", mobType = null, disposition = "neutral", ownerId = null, angle = 0, momentum = 0, direction = 0, id? })` — creates an entity. `id` defaults to a unique local counter; pass one for a server-assigned id.
  - **If `mobType` is set** (a `MobType`): this is a mob — `collisionRadius` and `texture` come from `MobVariety` (keyed by species + rarity).
  - **If `mobType` is null**: `collisionRadius` uses the generic `Entity.radiusFor(kind, rarity)` and `texture` is `null` (e.g. the player, which draws via `circleBody`).

### Static
- `Entity.spawn(entityName, rarity = "common", pos = {x:0,y:0}, grid?) → Entity` — one-call mob spawn: builds an `Entity` for the species + rarity at `pos`, and (when a `grid` is passed) `insert`s it so collision/AI/the view see it. The convenience form of `new Entity(...)` + `grid.insert(...)`. `entityName` is a `MobType` (its enum values *are* their string ids, so the constant or the raw id work identically). Disposition is inherited from the mob type — construct directly to override. Omit `grid` to build-and-position without registering. The grid is passed in (not reached for) to keep `Entity` decoupled from world state and avoid an import cycle with `GameEngine`.
- `Entity.radiusFor(kind, rarity) → number` — generic sizing for **non-mob** kinds. Edit `BASE_RADIUS` / `RARITY_GROWTH` in `Entity.js` to retune. (Mobs size from `MobVariety` instead.)
- `RARITY` (re-exported from `Rarity.js`) — rarity tiers, lowest → highest.
- `Disposition` (re-exported from `Disposition.js`) — frozen-object enum: `HOSTILE` / `NEUTRAL` / `PASSIVE` / `ALLIED` (players/pets — the side mobs target).

### Properties
- `id: number` — unique **instance** id (this entity, not its species — distinct from `kind`/`mobType`). Network-stable; auto-assigned from a local counter, or pass `{ id }` to use a server-assigned one.
- `x: number`, `y: number` — world-space center.
- `angle: number` — facing/rotation in radians. Collision circles are rotation-invariant, so it never affects grid placement or `detect` — the view renders it as `sprite.rotation`. `GameEngine.step` sets it to `direction` while the entity is intending to move, so sprites face their heading; a resting/knocked-back entity keeps its last facing.
- `momentum: number` — intended-movement magnitude ("wanting to move"; 0 = at rest).
- `direction: number` — intended-movement heading in radians, independent of `angle` (the visual facing). Velocity components are `momentum·cos(direction)`, `momentum·sin(direction)`.
- `knockbackX, knockbackY: number` — per-step knockback accumulator (cartesian), kept **separate** from intended movement. Summed during collision response, applied, then cleared each step.
- `density: number` — mass-like value driving collision push ratios (denser shoves more). Derived; rarity-scaled.
- `speed: number` — movement magnitude applied per step toward a target. Derived; rarity-scaled.
- `range: number` — detection range, **derived from size**: `collisionRadius × rangeMult` (~10×, per-type from `MobVariety`). So bigger mobs detect farther. Targeting applies a ×1.5 bonus for hostiles.
- `target: {x, y}` — AI target **point** (always an x/y, not an entity). Reused/mutated, so retargeting allocates nothing.
- `hasTarget: boolean` — whether `target` is currently active (movement only seeks when true).
- `kind: string` — broad type tag (`"player"`, `"mob"`, `"petal"`, …).
- `rarity: string` — one of `RARITY`.
- `mobType: string | null` — mob species (a `MobType`) when this is a mob, else `null`.
- `disposition: string` — allegiance/behaviour, one of `Disposition` (`HOSTILE` / `NEUTRAL` / `PASSIVE` / `ALLIED`). For mobs, **defaults to the mob type's disposition** (from `MobVariety`); non-mobs default to neutral; an explicit arg overrides.
- `aggroed: boolean` — in-combat flag. Hostile mobs seek regardless; a neutral mob only seeks once this is set (e.g. by being attacked). `Targeting` clears it after ~5s with no target in range (the mob gives up — hostiles leash back to base range, neutrals stop seeking).
- `lastTargetStep: number` — step at which a target was last in range; the aggro give-up timer's reference point (see `Targeting`).
- `ownerId` — controller id (a connection/player id) when input-driven, else `null`. Set by `mechanics/inputs`; links a player entity to its controller.
- `collisionRadius: number` — **derived**; from `MobVariety` for mobs, else `Entity.radiusFor`. Read every frame by collision **and** the grid (it indexes by the `center ± collisionRadius` bounding box).
- `texture: string | null` — sprite texture (mobs) or `null` (non-mobs).
- `display` — the entity's Pixi display object; `null` until the view builds it on first sight, then cached here.

### Methods
- `setPosition(x, y)` — set position **without** touching any grid. Use for initial placement / spawning before insertion (the grid reads `x`/`y` at insert time).
- `moveTo(x, y, grid)` — move an entity that is already in `grid`, keeping it in sync: sets the position, then `grid.update(this)` re-indexes it — but only if the move crossed a cell boundary (the grid tracks each object's cells, so a small in-cell move is a cheap no-op). No points to rewrite.
- `addMovement(dir, magnitude)` — add a movement impulse to `momentum`/`direction` (polar add; impulses from different directions combine correctly).
- `addKnockback(x, y)` — accumulate cartesian knockback (separate from intended movement).
- `decayMovement(threshold, factor)` — zero `momentum` below `threshold`, else scale it by `factor` (friction).

(Targeting now lives in `Targeting.js` — see below — not on the entity.)

### Notes
- **Grid membership** is by bounding box: the grid registers each entity in every cell `center ± collisionRadius` overlaps (see `memory/API.md`). This is exact for circles — any two overlapping circles share at least one cell — so broadphase never misses a pair regardless of entity size vs cell size.
- **Radius changes** are picked up on the next `setPosition`/`moveTo` (the grid recomputes the cell-range from the live `collisionRadius`).

---

## `MobVariety`
**File:** `MobVariety.js`

Per-mob-species data, keyed by `MobType`.

- `MobType` — frozen-object "enum" of species (`BABY_ANT`, `HORNET`, `ROCK`, …).
- `mobVariety(type) → { texture, initialSize, density, speed, rangeMult, disposition, rarityScale }` — the `switch` returning a species' full stat block. Unknown types fall to a `default`.
- `mobCollisionRadius(type, rarity) → number` — `initialSize × rarityScale[tier]`.
- `mobDensity(type, rarity) → number` — base density, rarity-scaled (denser at higher tiers).
- `mobSpeed(type, rarity) → number` — base speed, rarity-scaled.
- `mobRangeMult(type) → number` — detection-range multiplier (× collision radius). `0` = inert (never detects).
- `mobDisposition(type) → string` — the type's default `Disposition` (a spawned mob inherits it unless overridden).
- `mobTexture(type) → string`.
- `allMobTextures() → string[]` — every unique mob texture path (+ fallback); the manifest the view preloads via `loadTextures()`.

> All textures / sizes / scale curves are **placeholders** — tune each `case`.

---

## `Targeting`
**File:** `Targeting.js`

- `updateTargets(entities, step)` — for each **seeker** among `entities` (a mob that is `HOSTILE`, or any `aggroed` mob; never `PASSIVE`/`ALLIED`), find the nearest `ALLIED` entity whose collision circle is within detection range and set it as the seeker's target (`target` point + `hasTarget` + `aggroed`, and stamp `lastTargetStep = step`); else clear `hasTarget`.
  - Detection range = the entity's `range`, **×1.5 for hostiles**. "In range" means `dist ≤ range + ally.collisionRadius`.
  - Neutral mobs only seek once `aggroed` (detection effectively off until provoked).
  - **Aggro times out:** a seeker that goes `AGGRO_TIMEOUT_STEPS` (≈5s at 60 ticks/s) without a target in range clears `aggroed` — a hostile leashes back to base range, a provoked neutral stops seeking. The timer (`lastTargetStep`) resets on every reacquire, so a mob still in combat never times out. Time is counted in **steps** (the sim is tick-based, no `dt`); `step` is `GameEngine._stepCount`.
  - Called from `GameEngine.step` every `RETARGET_INTERVAL` steps, over each region's active set (including sleeping mobs, so they can wake or time out).

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
