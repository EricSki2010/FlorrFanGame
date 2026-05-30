// Targeting — decides what each entity aims at.
//
// A target is just a world point: { x, y }. Each entity stores one in
// `entity.target` (always an { x, y }), with `entity.hasTarget` flagging whether
// it's currently active. Movement in `GameEngine.step` steers toward it.
//
// Intentionally empty for now — the targeting logic (how an entity chooses its
// point: nearest player, fleeing, patrol, etc.) will live here.
