// Cell-size experiment — how grid cellSize trades re-indexing cost against
// broadphase false-positives, as a function of entity size. Run under jsc:
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m GameEngine/dev/bench-cellsize.mjs
//
// Same world (a dense swarm, everyone awake + moving + colliding), varying ONLY
// the grid cellSize. Bigger cells → fewer cells per entity (cheaper inserts,
// more #1 no-ops) but more entities per cell (more candidates per query). The
// sweet spot is ~the entity's size.

import { GameEngine } from "../GameEngine.js";
import { SpatialGrid } from "../memory/SpatialGrid.js";
import { Entity, Rarity, Disposition } from "../entities/Entity.js";
import { MobType } from "../entities/MobVariety.js";

const now = () => Date.now();
const CAMERA = { x: 0, y: 0, width: 2000, height: 1125 };
const WARMUP = 40;
const TIMED = 120;

/**
 * Dense swarm of N mobs (each forced awake + seeking the center) on a grid of
 * `cellSize`. `radiusOverride` lets us test a big-mob radius directly.
 */
function buildWorld(mobType, n, cellSize, swarmRadius, radiusOverride) {
  const game = new GameEngine();
  game.memory.worldMap = new SpatialGrid(cellSize); // swap before anything is inserted
  const grid = game.memory.worldMap;

  const player = new Entity({ x: 0, y: 0, kind: "player", disposition: Disposition.ALLIED });
  grid.insert(player);

  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const rad = Math.sqrt((i + 1) / n) * swarmRadius;
    const e = new Entity({ x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, mobType, rarity: Rarity.COMMON });
    if (radiusOverride) {
      e.collisionRadius = radiusOverride;
      e.range = radiusOverride * 12; // keep detection well beyond the swarm
    }
    grid.insert(e);
  }
  return game;
}

function measure(game) {
  for (let i = 0; i < WARMUP; i++) game.step(CAMERA);
  const t0 = now();
  let hits = 0;
  for (let i = 0; i < TIMED; i++) hits = game.step(CAMERA).length;
  return { msPerStep: (now() - t0) / TIMED, hits };
}

const pad = (v, w) => String(v).padStart(w);

function compare(label, mobType, n, swarmRadius, radiusOverride, radiusLabel) {
  print("");
  print(`=== ${label} | N=${n}, radius≈${radiusLabel}, swarm r=${swarmRadius} ===`);
  print(" cellSize | ms/step |    fps | collisions | vs 128");
  print("----------|---------|--------|------------|-------");
  let base = null;
  for (const cs of [128, 256, 512]) {
    const { msPerStep, hits } = measure(buildWorld(mobType, n, cs, swarmRadius, radiusOverride));
    if (base === null) base = msPerStep;
    const delta = cs === 128 ? "—" : `${((msPerStep / base - 1) * 100).toFixed(0)}%`;
    print(`${pad(cs, 9)} | ${pad(msPerStep.toFixed(3), 7)} | ${pad((1000 / msPerStep).toFixed(0), 6)} | ${pad(hits, 10)} | ${pad(delta, 6)}`);
  }
}

// --- Pure re-indexing microbench: isolates the cost bigger cells REDUCE. ---
// N circles of `radius`, each moved a small step every frame (grid.update only).
// No collisions, so no knockback explosion — just the grid bookkeeping. Bigger
// cells → each entity spans fewer cells AND crosses boundaries less often (#1
// no-ops), so this should get cheaper with cellSize, more so for big entities.
function reindexBench(n, radius, cellSize, frames) {
  const grid = new SpatialGrid(cellSize);
  const ents = [];
  for (let i = 0; i < n; i++) {
    const e = { x: (i % 100) * 60, y: Math.floor(i / 100) * 60, collisionRadius: radius };
    grid.insert(e);
    ents.push(e);
  }
  // Each entity drifts in its own fixed direction at ~5 units/frame.
  const step = (e, i) => { e.x += Math.cos(i) * 5; e.y += Math.sin(i) * 5; grid.update(e); };
  for (let f = 0; f < 20; f++) for (let i = 0; i < n; i++) step(ents[i], i); // warmup
  const t0 = now();
  for (let f = 0; f < frames; f++) for (let i = 0; i < n; i++) step(ents[i], i);
  return (now() - t0) / frames; // ms per frame (all N updates)
}

function cellsPerEntity(radius, cellSize) {
  const span = Math.floor((radius * 2) / cellSize) + 2; // worst-case cells per axis
  return span * span;
}

function reindexCompare(radius, n, frames) {
  print("");
  print(`=== re-index only | N=${n}, radius=${radius} (≈ a 'size ${radius}' mob), ${frames} frames ===`);
  print(" cellSize | ms/frame | ~cells/entity | vs 128");
  print("----------|----------|---------------|-------");
  let base = null;
  for (const cs of [128, 256, 512]) {
    const ms = reindexBench(n, radius, cs, frames);
    if (base === null) base = ms;
    const delta = cs === 128 ? "—" : `${((ms / base - 1) * 100).toFixed(0)}%`;
    print(`${pad(cs, 9)} | ${pad(ms.toFixed(4), 8)} | ${pad("≤" + cellsPerEntity(radius, cs), 13)} | ${pad(delta, 6)}`);
  }
}

print("Cell-size experiment — vary cellSize only");
print(`camera ${CAMERA.width}x${CAMERA.height} | warmup ${WARMUP}, timed ${TIMED} steps`);

print("");
print("########## A. FULL SIM, dense small mobs (the only thousands-on-screen case)");
// r25 mobs: 128 is already 5× their diameter, so bigger cells only add
// broadphase false-positives → expect 256/512 to HURT.
compare("SPIDER (small, r25)", MobType.SPIDER, 2000, 350, null, 25);
compare("SPIDER (small, r25)", MobType.SPIDER, 4000, 350, null, 25);

print("");
print("########## B. RE-INDEX ONLY, isolating the cost bigger cells reduce");
// The grid-bookkeeping side of the trade-off, with no collision/explosion.
reindexCompare(25, 4000, 200);   // small mob
reindexCompare(200, 4000, 200);  // ~size-200 mob (the game's typical)
