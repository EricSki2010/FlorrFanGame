// Multiplayer scaling experiment — several players in DIFFERENT areas of one
// world, each with a local mob population. Run under jsc:
//
//   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m GameEngine/dev/bench-multiplayer.mjs
//
// step(regions) takes all the render regions at once and merges overlapping
// ones into a single sweep; disjoint regions are simulated independently. So one
// step(allRegions) call per tick covers every player. Total cost per tick = the
// sum over (merged) regions of their local crowd cost. We compare a baseline mob
// density against 4× the mobs, across player counts.
//
// Each player's local population mirrors a real area: mostly NEUTRAL mobs idling
// (asleep until provoked) + some HOSTILE mobs near the player (awake, chasing).

import { GameEngine } from "../GameEngine.js";
import { mergeRegions } from "../Regions.js";
import { Entity, Rarity, Disposition } from "../entities/Entity.js";
import { MobType } from "../entities/MobVariety.js";

const now = () => Date.now();

// Per-player render region (gameMeasure 16:9). Active region = 1.5× this.
const CAM_W = 2000, CAM_H = 1125;
const ACT_W = CAM_W * 1.5, ACT_H = CAM_H * 1.5;
const FAR = 8000;       // players this far apart → disjoint regions (no merge)
const AGGRO_BAND = 380; // hostiles within this of their player wake & chase

const WARMUP = 40;
const TIMED = 100;

/**
 * Build one world: `players` ALLIED entities on a grid `spacing` apart, each
 * surrounded by `mobsPerPlayer` mobs in its local region. ~30% of each player's
 * mobs are hostile (spiders, near the player → awake); the rest neutral baby
 * ants (scattered → idle). Returns { game, regions }.
 */
function buildWorld(players, mobsPerPlayer, spacing) {
  const game = new GameEngine();
  const grid = game.memory.worldMap;
  const regions = [];

  const cols = Math.ceil(Math.sqrt(players));
  for (let p = 0; p < players; p++) {
    const px = (p % cols) * spacing;
    const py = Math.floor(p / cols) * spacing;

    const player = new Entity({ x: px, y: py, kind: "player", disposition: Disposition.ALLIED });
    grid.insert(player);
    regions.push({ x: px, y: py, width: CAM_W, height: CAM_H });

    for (let i = 0; i < mobsPerPlayer; i++) {
      const hostile = i % 10 < 3; // ~30% hostile
      let x, y;
      if (hostile) {
        // Near the player so they aggro and chase (the "awake" cost).
        const ang = (i / mobsPerPlayer) * Math.PI * 2;
        const rad = Math.sqrt((i + 1) / mobsPerPlayer) * AGGRO_BAND;
        x = px + Math.cos(ang) * rad;
        y = py + Math.sin(ang) * rad;
      } else {
        // Neutral, scattered across the local area → idle/asleep (#2).
        x = px + (((i * 73) % 1000) / 1000 - 0.5) * ACT_W;
        y = py + (((i * 149) % 1000) / 1000 - 0.5) * ACT_H;
      }
      Entity.spawn(hostile ? MobType.SPIDER : MobType.BABY_ANT, Rarity.COMMON, { x, y }, grid);
    }
  }
  return { game, regions };
}

// Two ways to run a tick:
//   merged    — one step() over ALL regions; overlaps merge + dedup → swept once.
//   perRegion — step() once per region; overlapping mobs get processed N times.
function tickMerged(game, regions) { game.step(regions); }
function tickPerRegion(game, regions) { for (let c = 0; c < regions.length; c++) game.step([regions[c]]); }

function measure(world, tickFn) {
  const { game, regions } = world;
  for (let i = 0; i < WARMUP; i++) tickFn(game, regions);
  const t0 = now();
  for (let i = 0; i < TIMED; i++) tickFn(game, regions);
  return (now() - t0) / TIMED;
}

const pad = (v, w) => String(v).padStart(w);

function sweep(label, mobsPerPlayer) {
  print("");
  print(`=== ${label}: ${mobsPerPlayer} mobs/player (≈${Math.round(mobsPerPlayer * 0.3)} hostile + ${Math.round(mobsPerPlayer * 0.7)} idle), spread out ===`);
  print(" players | total mobs | ms/tick |    fps | verdict");
  print("---------|------------|---------|--------|--------");
  for (const players of [1, 2, 4, 8, 16]) {
    const ms = measure(buildWorld(players, mobsPerPlayer, FAR), tickMerged);
    const fps = 1000 / ms;
    const verdict = ms <= 8 ? "60fps + render headroom" : ms <= 16.6 ? "60fps (sim only; tight)" : "below 60fps";
    print(`${pad(players, 8)} | ${pad(players * mobsPerPlayer, 10)} | ${pad(ms.toFixed(3), 7)} | ${pad(fps.toFixed(0), 6)} | ${verdict}`);
  }
}

// Merge self-test: overlapping-center regions collapse; far ones don't.
function selfTest() {
  const r = (x, y) => ({ x, y, width: 2000, height: 1125 });
  let ok = true;
  const check = (name, got, want) => { ok = ok && got === want; print(`  [${got === want ? "PASS" : "FAIL"}] ${name}: ${got} (want ${want})`); };
  check("far apart → unchanged", mergeRegions([r(0, 0), r(8000, 0)]).length, 2);
  check("center inside → merge to 1", mergeRegions([r(0, 0), r(600, 0)]).length, 1);
  check("chain collapses transitively", mergeRegions([r(0, 0), r(600, 0), r(1200, 0)]).length, 1);
  const m = mergeRegions([r(0, 0), r(600, 0)])[0];
  check("merged box spans both (width)", Math.round(m.width), 2600); // [-1000 .. 1600]
  print(`  merge self-test: ${ok ? "ALL PASS" : "FAILURES ABOVE"}`);
}

// Clustered savings: when players pile into one area their regions overlap, so
// the correct call — one step(allRegions) — merges them and sweeps the shared
// crowd ONCE. The naive alternative (a step() per player) re-sweeps that crowd
// per player. This is the case the merge feature targets.
//   NOTE: the per-region column also advances the step counter P× per tick, so
//   it isn't a fair baseline for DISJOINT regions (it shifts LOD scheduling).
//   For disjoint, see the linear scaling in the sweeps above — each merged box
//   is simulated independently, so spread-out players cost the same as before.
function clusterCompare(mobsPerPlayer) {
  print("");
  print(`=== CLUSTERED (players in the SAME area, spacing 500) ===`);
  print(" players | step(all) ms | step-per-player ms | speedup");
  print("---------|--------------|--------------------|--------");
  for (const players of [2, 4, 8]) {
    const merged = measure(buildWorld(players, mobsPerPlayer, 500), tickMerged);
    const per = measure(buildWorld(players, mobsPerPlayer, 500), tickPerRegion);
    print(`${pad(players, 8)} | ${pad(merged.toFixed(3), 12)} | ${pad(per.toFixed(3), 18)} | ${pad((per / merged).toFixed(2) + "x", 7)}`);
  }
}

print("Multiplayer scaling — engine takes render REGIONS; overlaps merge into one sweep");
print(`per-player region ${CAM_W}x${CAM_H} | warmup ${WARMUP}, timed ${TIMED} ticks`);
print("");
print("--- merge self-test ---");
selfTest();

sweep("BASELINE", 300);
sweep("4x MOBS", 1200);
clusterCompare(300);
