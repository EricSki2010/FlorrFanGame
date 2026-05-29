// Shared rarity tiers. Lives in its own module so both Entity and MobVariety
// can depend on it without importing each other (no circular dependency).

/**
 * Rarity tiers, lowest → highest (florr-style). The index is the tier number
 * that size formulas scale off of. Edit/extend to match your game.
 */
export const RARITY = [
  "common",
  "unusual",
  "rare",
  "epic",
  "legendary",
  "mythic",
  "ultra",
  "super",
];

/**
 * Tier index for a rarity name, clamped so an unknown rarity reads as the lowest
 * tier (0) rather than -1.
 * @param {string} rarity
 * @returns {number}
 */
export function rarityTier(rarity) {
  const t = RARITY.indexOf(rarity);
  return t < 0 ? 0 : t;
}
