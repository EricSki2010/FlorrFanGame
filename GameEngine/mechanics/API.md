# mechanics/ — API Reference

The game's rules/simulation logic, as opposed to the visual side (which lives in `VisualEngine`). Currently owns collision detection; future mechanics (movement AI, damage, spawning, …) register here too, exposed as named properties.

---

## `Mechanics`
**File:** `Mechanics.js`

Wrapper that holds the simulation subsystems. Reachable as `GameEngine.shared.mechanics`.

### Properties
- `collisions: Collisions` — collision detection. See [`collisions/API.md`](collisions/API.md).
- `inputs: Inputs` — player input → movement intent. See [`inputs/API.md`](inputs/API.md).

### Constructor
- `new Mechanics()` — constructs the owned subsystems. Normally you don't call this directly; access it via `GameEngine.shared.mechanics`.
