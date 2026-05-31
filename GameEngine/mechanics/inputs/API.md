# inputs/ — API Reference

Player input → movement intent. Input's only job is to set a player entity's **target point**; `GameEngine.step` then moves it through the *same* pipeline a seeking mob uses (`addMovement` toward `target` → integrate → decay). So player movement is calculated identically to mob movement — the only difference is who sets the target (input vs `Targeting`).

Identity is by **controller** (a connection/session id), not hardware. The server maps each connection to a player entity and feeds intent here; locally there's one controller. Clients send **intent** (a point to steer toward), never positions — the server stays authoritative.

---

## `Inputs`
**File:** `Inputs.js`

The controller→player registry + input application. Reachable as `GameEngine.shared.mechanics.inputs`.

### Methods
- `register(ownerId, entity)` — map a controller id to a player entity (e.g. on connect); stamps `entity.ownerId`.
- `unregister(ownerId)` — drop a controller's player (e.g. on disconnect); clears the back-link.
- `playerFor(ownerId) → entity | null` — the player a controller owns.
- `moveToward(ownerId, worldX, worldY)` — steer that player toward a world point by setting its `target` + `hasTarget` (the same fields a mob uses). Send a point in the held/pointed direction (e.g. the mouse's world position).
- `moveDir(ownerId, dx, dy)` — steer by a **direction** (e.g. WASD). `dx`/`dy` are summed key contributions (right `+x`, down `+y`); opposite keys cancel, diagonals combine. Aims one step ahead in that heading from the current position. Diagonals are **not** faster (movement always applies `speed`). `(0,0)` stops.
- `stop(ownerId)` — clear `hasTarget`; the player coasts to a halt via the normal movement decay.

### WASD example (client side)
```js
const held = { w:false, a:false, s:false, d:false };
const map = { KeyW:"w", KeyA:"a", KeyS:"s", KeyD:"d" };
addEventListener("keydown", e => { if (map[e.code]) held[map[e.code]] = true; });
addEventListener("keyup",   e => { if (map[e.code]) held[map[e.code]] = false; });
// each frame, before step():
inputs.moveDir("local", (held.d?1:0)-(held.a?1:0), (held.s?1:0)-(held.w?1:0));
```

### Notes
- **Client vs server split:** capturing raw device events (keyboard/mouse) and converting screen→world is a *client* concern; the methods here are the *application* side (set the target). Local dev runs both in the browser; networked, the server calls these from connection messages.
- The `Targeting` step skips `ALLIED` entities, so a player's input-set target is never overwritten by AI.
