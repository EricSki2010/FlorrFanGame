// Sim regions ("regions of interest") — the rectangles the simulation runs
// inside. Each corresponds to a client's render area; the engine itself is
// headless, so it thinks in regions, not cameras. A tick can have one region
// (single player) or many (one per player), passed to `GameEngine.step`.
//
// Rectangles are CENTER-based: { x, y, width, height } with (x, y) the center
// (same convention the camera already used). This is what the "center inside
// another" merge rule keys off.

/**
 * Is point (px, py) inside center-based rect `r` (optionally with a `slack`
 * multiplier on the extents, e.g. 1.05 for a little edge hysteresis)?
 * @param {number} px
 * @param {number} py
 * @param {{x:number,y:number,width:number,height:number}} r
 * @param {number} [slack=1]
 * @returns {boolean}
 */
export function pointInRegion(px, py, r, slack = 1) {
  return (
    Math.abs(px - r.x) <= (r.width * slack) / 2 &&
    Math.abs(py - r.y) <= (r.height * slack) / 2
  );
}

/** Is (px, py) inside ANY of `regions` (with optional `slack`)? */
export function pointInAnyRegion(px, py, regions, slack = 1) {
  for (let i = 0; i < regions.length; i++) {
    if (pointInRegion(px, py, regions[i], slack)) return true;
  }
  return false;
}

/** @private — center-based bounding box of two boxes, carrying their combined
 * `sources` (the original render regions that folded into it). */
function boundingRect(a, b) {
  const minX = Math.min(a.x - a.width / 2, b.x - b.width / 2);
  const maxX = Math.max(a.x + a.width / 2, b.x + b.width / 2);
  const minY = Math.min(a.y - a.height / 2, b.y - b.height / 2);
  const maxY = Math.max(a.y + a.height / 2, b.y + b.height / 2);
  return {
    x: (minX + maxX) / 2, y: (minY + maxY) / 2,
    width: maxX - minX, height: maxY - minY,
    sources: a.sources.concat(b.sources),
  };
}

/**
 * Merge regions by the **center-containment** rule: if one region's center lies
 * inside another, replace the pair with their bounding rectangle. Applied to a
 * fixpoint, so a chain of overlapping regions collapses transitively into one
 * box.
 *
 * The merged box gains some area at the corners that neither original covered —
 * that's intentional. Those corners get simulated (cheaply, via the step loop's
 * LOD throttle, since they're outside every real render region), and in exchange
 * the overlap is swept **once** instead of once per region. The closer two
 * players are, the more overlap is collapsed and the more it saves.
 *
 * Pure: the input array and its rects are not mutated; returns fresh boxes.
 * Each returned box carries `sources` — the original region(s) that folded into
 * it (a lone region's `sources` is just itself). `step` uses `sources` to tell a
 * real render area from the box's cheap merge-padding corners.
 *
 * @param {Array<{x:number,y:number,width:number,height:number}>} regions
 *   Center-based rectangles.
 * @returns {Array<{x:number,y:number,width:number,height:number,sources:Array}>}
 *   merged set; each box has the originals it covers in `sources`.
 */
export function mergeRegions(regions) {
  const out = [];
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    out.push({ x: r.x, y: r.y, width: r.width, height: r.height, sources: [r] });
  }

  // Repeatedly find a mergeable pair and fold it in; restart after each merge
  // (region counts are tiny — one per player — so the simplicity wins).
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        // "center of one inside the other" — symmetric check.
        if (pointInRegion(a.x, a.y, b) || pointInRegion(b.x, b.y, a)) {
          out[i] = boundingRect(a, b);
          out.splice(j, 1);
          merged = true;
          break;
        }
      }
    }
  }
  return out;
}
