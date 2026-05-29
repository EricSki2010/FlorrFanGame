# view/ — API Reference

*Planned subsystem — no implementations yet.*

Will own the **PixiJS** presentation layer — the `PIXI.Application` (renderer + stage), the render loop, and the camera that drives viewport queries against `memory/SpatialGrid`. (The web has no SpriteKit; PixiJS is the renderer.)

Expected responsibilities:
- Initialise the Pixi app and attach its canvas (replacing the placeholder `<canvas>` in `index.html`).
- On first sight of an entity, call its `entity.circleBody(x, y)` factory (from `geometry/`), `addChild` the result to the stage, cache it, then only update `.x`/`.y` each frame.
- Query `VisualEngine.shared.memory.worldMap` for the camera viewport and draw what's visible.
- Keep the entity layer batched (sprites sharing one texture/atlas → ~1 draw call), separate from a terrain layer.

Expected entry point: `VisualEngine.shared.view` (currently unwired).
