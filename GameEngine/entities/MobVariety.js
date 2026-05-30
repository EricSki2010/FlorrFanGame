// Per-mob-type definitions: texture, base collision size, and how that size
// scales across rarity tiers. This is where mob-specific data lives, keyed by
// MobType, so Entity sizing for mobs comes from here rather than a generic
// formula.
//
// (Filename is "MobVariety" — the correct spelling of variety.)

import { rarityTier } from "./Rarity.js";

/** Base directory for entity sprite assets — the one place to change where
 * images are loaded from. Filenames join onto this. */
const TEXTURE_DIR = "Assets/textures/entities";

/** Build a texture path from a filename under {@link TEXTURE_DIR}. */
const tex = (file) => `${TEXTURE_DIR}/${file}`;

/**
 * Mob type "enum". JS has no native enums; a frozen object of string constants
 * is the idiomatic stand-in — the string values stay readable in logs/saves and
 * can't be reassigned.
 */
export const MobType = Object.freeze({
  BABY_ANT: "baby_ant",
  WORKER_ANT: "worker_ant",
  SOLDIER_ANT: "soldier_ant",
  BEE: "bee",
  HORNET: "hornet",
  SPIDER: "spider",
  BEETLE: "beetle",
  LADYBUG: "ladybug",
  ROCK: "rock",
});

/**
 * @typedef {Object} MobVariety
 * @property {string} texture       Asset path/name for the mob's sprite.
 * @property {number} initialSize   Collision radius at the lowest rarity.
 * @property {number} density       Mass-like value at the lowest rarity — drives
 *   how hard it pushes vs gets pushed in collisions. (Denser = shoves more.)
 * @property {number} speed         Movement magnitude per step at the lowest rarity.
 * @property {number} range         Target-detection range in world units.
 * @property {number[]} rarityScale Multipliers applied to `initialSize`, indexed
 *   by {@link RARITY} tier. Length must equal `RARITY.length`.
 */

/** Per-tier growth (placeholders) — density and speed scale up with rarity. */
const DENSITY_RARITY_GROWTH = 0.5; // +50% density per rarity tier
const SPEED_RARITY_GROWTH = 0.1; // +10% speed per rarity tier

// PLACEHOLDER data — textures, sizes, and scale curves are guesses. Tune each
// case to your art and balance. Each `rarityScale` row is indexed by rarity:
//                 common unusual  rare   epic  legend mythic  ultra  super
/**
 * Per-type definition for a mob. Add a `case` per new {@link MobType}.
 * @param {string} type One of {@link MobType}.
 * @returns {MobVariety}
 */
export function mobVariety(type) {
  //                                   size  dens spd  range
  switch (type) {
    case MobType.BABY_ANT:
      return {
        texture: tex("baby_ant.png"),
        initialSize: 55, density: 15, speed: 4, range: 600,
        rarityScale: [1, 1.15, 1.35, 1.6, 2.0, 2.6, 3.4, 4.5],
      };
    case MobType.WORKER_ANT:
      return {
        texture: tex("worker_ant.png"),
        initialSize: 75, density: 25, speed: 3.5, range: 650,
        rarityScale: [1, 1.18, 1.4, 1.7, 2.1, 2.8, 3.7, 5.0],
      };
    case MobType.SOLDIER_ANT:
      return {
        texture: tex("soldier_ant.png"),
        initialSize: 90, density: 35, speed: 3, range: 700,
        rarityScale: [1, 1.2, 1.45, 1.8, 2.3, 3.0, 4.0, 5.4],
      };
    case MobType.BEE:
      return {
        texture: tex("bug.png"), // TEMP: using bug.png for now
        initialSize: 70, density: 20, speed: 4.5, range: 600,
        rarityScale: [1, 1.15, 1.35, 1.65, 2.1, 2.7, 3.5, 4.6],
      };
    case MobType.HORNET:
      return {
        texture: tex("hornet.png"),
        initialSize: 100, density: 30, speed: 4, range: 750,
        rarityScale: [1, 1.2, 1.5, 1.9, 2.4, 3.2, 4.2, 5.6],
      };
    case MobType.SPIDER:
      return {
        texture: tex("spider.png"),
        initialSize: 95, density: 40, speed: 5, range: 800,
        rarityScale: [1, 1.22, 1.5, 1.9, 2.45, 3.2, 4.3, 5.8],
      };
    case MobType.BEETLE:
      return {
        texture: tex("beetle.png"),
        initialSize: 110, density: 60, speed: 2.5, range: 700,
        rarityScale: [1, 1.25, 1.6, 2.05, 2.7, 3.6, 4.8, 6.4],
      };
    case MobType.LADYBUG:
      return {
        texture: tex("ladybug.png"),
        initialSize: 80, density: 30, speed: 3.5, range: 650,
        rarityScale: [1, 1.18, 1.4, 1.75, 2.2, 2.9, 3.8, 5.1],
      };
    case MobType.ROCK:
      return {
        texture: tex("rock.png"),
        initialSize: 130, density: 100, speed: 0, range: 0, // inert: doesn't move/seek
        rarityScale: [1, 1.3, 1.7, 2.2, 2.9, 3.9, 5.2, 7.0],
      };
    default:
      return {
        texture: tex("unknown.png"),
        initialSize: 85, density: 30, speed: 3, range: 600,
        rarityScale: [1, 1.2, 1.45, 1.75, 2.2, 2.9, 3.8, 5.0],
      };
  }
}

/**
 * Collision radius for a mob of `type` at `rarity` — `initialSize` scaled by the
 * type's per-rarity multiplier.
 * @param {string} type   One of {@link MobType}.
 * @param {string} rarity One of {@link RARITY}.
 * @returns {number} radius in world units
 */
export function mobCollisionRadius(type, rarity) {
  const v = mobVariety(type);
  const t = rarityTier(rarity);
  const scale = v.rarityScale[t] ?? v.rarityScale[v.rarityScale.length - 1];
  return v.initialSize * scale;
}

/**
 * Density for a mob of `type` at `rarity` — base density scaled up per tier.
 * @param {string} type One of {@link MobType}.
 * @param {string} rarity One of {@link RARITY}.
 * @returns {number}
 */
export function mobDensity(type, rarity) {
  return mobVariety(type).density * (1 + rarityTier(rarity) * DENSITY_RARITY_GROWTH);
}

/**
 * Movement speed for a mob of `type` at `rarity` — base speed scaled per tier.
 * @param {string} type One of {@link MobType}.
 * @param {string} rarity One of {@link RARITY}.
 * @returns {number}
 */
export function mobSpeed(type, rarity) {
  return mobVariety(type).speed * (1 + rarityTier(rarity) * SPEED_RARITY_GROWTH);
}

/**
 * Target-detection range for a mob `type` (not rarity-scaled).
 * @param {string} type One of {@link MobType}.
 * @returns {number}
 */
export function mobRange(type) {
  return mobVariety(type).range;
}

/**
 * Texture for a mob `type`.
 * @param {string} type One of {@link MobType}.
 * @returns {string}
 */
export function mobTexture(type) {
  return mobVariety(type).texture;
}

/**
 * Every unique mob texture path (all `MobType`s + the unknown fallback). The
 * manifest the view preloads at boot.
 * @returns {string[]}
 */
export function allMobTextures() {
  const paths = new Set();
  for (const type of Object.values(MobType)) paths.add(mobTexture(type));
  paths.add(mobVariety("__fallback__").texture); // the default/unknown sprite
  return [...paths];
}
