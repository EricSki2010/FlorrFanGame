# shaders/ — API Reference

*Planned subsystem — no implementations yet, and may not be needed.*

Would house any custom GPU shaders the visual engine needs. **PixiJS** renders through WebGL/WebGPU and covers the vast majority of cases (sprites, tints, blends, filters) without hand-written shaders, so for v1 this folder is expected to stay empty. Anything custom (e.g. tunnel-wall effects, special particle shading) that PixiJS's built-in pipeline and filters can't express would live here as a Pixi `Filter` / custom shader program.

Expected entry point: `VisualEngine.shared.shaders` (currently unwired).
