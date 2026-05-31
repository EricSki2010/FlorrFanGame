// Headless simulation benchmark — measures GameEngine.step() cost vs entity
// count. The whole GameEngine side is pure JS (no PIXI), so it runs under jsc:
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m GameEngine/dev/bench.mjs
//
// Measures the SIMULATION cost only (collision + targeting + movement + grid
// re-indexing). Rendering (Pixi) is separate and batches well; the sim is the
// variable cost the framerate question hinges on.
//
// Two scenarios per mob, because the cost is gated by LOCAL crowding, not the
// raw count:
//   - SCATTERED: spread across the active region. Most mobs are out of the
//     player's range → no target → asleep (skipped, #2). Realistic "big world".
//   - SWARM: packed around the player, all aggroed and overlapping. Worst case
//     — collision is genuinely ~quadratic in local density; #2/#5 can't help.

import { GameEngine } from "../GameEngine.js";
import { Entity, Rarity, Disposition } from "../entities/Entity.js";
import { MobType } from "../entities/MobVariety.js";

// jsc has no performance.now(); Date.now() (1ms resolution) is fine when we time
// many steps and divide.
const now = () => Date.now();

// Camera in world units: a 16:9 "screen" at gameMeasure long-axis 2000. step()
// simulates the active set = 1.5× this rect.
const CAMERA = { x: 0, y: 0, width: 2000, height: 1125 };
const ACTIVE_W = CAMERA.width * 1.5;
const ACTIVE_H = CAMERA.height * 1.5;
const SWARM_RADIUS = 350; // inside a spider's aggro range → everyone awake

const WARMUP = 40; // steps to let targeting/movement/sleep reach steady state
const TIMED = 120; // timed steps to average over

function addPlayer(grid) {
  const player = new Entity({ x: 0, y: 0, kind: "player", disposition: Disposition.ALLIED });
  grid.insert(player);
  return player;
}

/** Build a fresh world of N mobs + a center player, placed per `scenario`. */
function buildWorld(mobType, n, scenario) {
  const game = new GameEngine();
  const grid = game.memory.worldMap;
  addPlayer(grid);

  for (let i = 0; i < n; i++) {
    let x, y;
    if (scenario === "swarm") {
      // Uniform-ish disk around the origin (sqrt for area-uniform radius).
      const ang = (i / n) * Math.PI * 2;
      const rad = Math.sqrt((i + 1) / n) * SWARM_RADIUS;
      x = Math.cos(ang) * rad;
      y = Math.sin(ang) * rad;
    } else {
      x = (Math.random() - 0.5) * ACTIVE_W;
      y = (Math.random() - 0.5) * ACTIVE_H;
    }
    Entity.spawn(mobType, Rarity.COMMON, { x, y }, grid);
  }
  return game;
}

/** Run WARMUP + TIMED steps; return { msPerStep, hits } from the timed window. */
function measure(game) {
  for (let i = 0; i < WARMUP; i++) game.step(CAMERA);
  const t0 = now();
  let lastHits = 0;
  for (let i = 0; i < TIMED; i++) lastHits = game.step(CAMERA).length;
  return { msPerStep: (now() - t0) / TIMED, hits: lastHits };
}

const pad = (v, w) => String(v).padStart(w);

function sweep(label, mobType, scenario, counts) {
  print("");
  print(`=== ${label} ===`);
  print("     N | ms/step |    fps | collisions | verdict");
  print("-------|---------|--------|------------|--------");
  for (const n of counts) {
    const { msPerStep, hits } = measure(buildWorld(mobType, n, scenario));
    const fps = 1000 / msPerStep;
    const verdict =
      msPerStep <= 8 ? "60fps + render headroom"
      : msPerStep <= 16.6 ? "60fps (sim only; tight)"
      : "below 60fps";
    print(`${pad(n, 6)} | ${pad(msPerStep.toFixed(3), 7)} | ${pad(fps.toFixed(0), 6)} | ${pad(hits, 10)} | ${verdict}`);
  }
}

// --- Correctness self-test: exercises AABB insert + cell-change update + detect.
function selfTest() {
  const game = new GameEngine();
  const grid = game.memory.worldMap;
  const detect = (list) => game.mechanics.collisions.detect(list, grid).length;

  const a = Entity.spawn(MobType.SPIDER, Rarity.COMMON, { x: 0, y: 0 }, grid);   // r25
  const b = Entity.spawn(MobType.SPIDER, Rarity.COMMON, { x: 30, y: 0 }, grid);  // overlaps a (d=30 < 50)

  let ok = true;
  const check = (name, got, want) => {
    const pass = got === want;
    ok = ok && pass;
    print(`  [${pass ? "PASS" : "FAIL"}] ${name}: got ${got}, want ${want}`);
  };

  check("overlapping pair detected", detect([a, b]), 1);
  b.moveTo(35, 0, grid);                 // tiny move, same cells → grid.update no-op path
  check("still detected after in-cell move", detect([a, b]), 1);
  b.moveTo(1000, 0, grid);               // big move → cell-range changes, old cells cleared
  check("separated pair not detected", detect([a, b]), 0);
  b.moveTo(20, 0, grid);                 // move back into overlap
  check("re-overlap detected after return", detect([a, b]), 1);

  print(`  self-test: ${ok ? "ALL PASS" : "FAILURES ABOVE"}`);
  return ok;
}

const radius = (mt) => new Entity({ mobType: mt, rarity: Rarity.COMMON }).collisionRadius;

print("GameEngine.step() benchmark — simulation cost only (no rendering)");
print(`active region: ${ACTIVE_W} x ${ACTIVE_H} world units | warmup ${WARMUP}, timed ${TIMED} steps`);
print(`SPIDER radius=${radius(MobType.SPIDER)} (hostile)  BABY_ANT radius=${radius(MobType.BABY_ANT)} (neutral)`);
print("");
print("--- correctness self-test (AABB grid + cell-change update) ---");
selfTest();

const COUNTS = [100, 250, 500, 1000, 2000, 4000, 8000];
sweep("SPIDER scattered (most out of range → asleep; #2/#5 in play)", MobType.SPIDER, "scattered", COUNTS);
sweep("SPIDER swarm (all packed on player, aggroed, overlapping — worst case)", MobType.SPIDER, "swarm", COUNTS);
sweep("BABY_ANT scattered (neutral, never seeks → idle world floor)", MobType.BABY_ANT, "scattered", COUNTS);
