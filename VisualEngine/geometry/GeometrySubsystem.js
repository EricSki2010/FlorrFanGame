// Geometry subsystem — builds the drawable shape data that the view reads off
// an entity.
//
// The Swift plan described geometry as CGPath handed to SpriteKit. On the web
// there is no SpriteKit; we render with PixiJS, which is *retained-mode* — you
// build a display object once and Pixi keeps re-rendering it, you just move it.
//
// So `circleBody` does not store a "draw every frame" call. It stores a
// build-once **factory** on the entity: a function that, when called, returns a
// fresh Pixi display object for that circle. The view calls the factory the
// first time it sees the entity, adds the result to the stage, caches it, and
// from then on only updates its position from the world map. A texture can be
// layered on top because the factory returns a `Container`, not a bare circle.

/**
 * @typedef {Object} CircleBodyOptions
 * @property {number} radius                Circle radius, in world units.
 * @property {number|string} [fill=0xffffff] Fill colour (Pixi accepts a hex
 *   number like 0xff0000 or a CSS string like "#ff0000").
 * @property {number|string} [stroke]       Outline colour. Omit for no outline.
 * @property {number} [strokeWidth=0]       Outline width in world units. Needs
 *   `stroke` set and `strokeWidth > 0` to draw.
 * @property {number} [alpha=1]             Fill opacity, 0–1.
 */

/**
 * Geometry subsystem. Reachable as `VisualEngine.shared.geometry`.
 */
export class GeometrySubsystem {
  /**
   * Attach a circle "body" to `entity`.
   *
   * Stores a **factory** at `entity.circleBody`. Calling that factory builds and
   * returns a Pixi `Container` holding the circle — so the view can do, on first
   * sight of the entity:
   *
   *     const display = entity.circleBody(worldX, worldY); // build once
   *     stage.addChild(display);
   *     // later frames: display.x = worldX; display.y = worldY;
   *
   * The circle is drawn at the container's local origin (0, 0); position lives
   * on the container, so moving the entity is just setting `.x`/`.y`. Layer a
   * texture by `display.addChild(new PIXI.Sprite(texture))`.
   *
   * Requires PixiJS to be loaded as a global `PIXI` before the factory is
   * *called* (the factory is what touches Pixi, not this method).
   *
   * @param {Object} entity   The thing to attach the body to (e.g. the player).
   * @param {CircleBodyOptions} options
   * @returns {(x?: number, y?: number) => any} the factory (also at `entity.circleBody`)
   */
  circleBody(entity, options) {
    const {
      radius,
      fill = 0xffffff,
      stroke = null,
      strokeWidth = 0,
      alpha = 1,
    } = options;

    /**
     * Build the Pixi display object for this circle.
     * @param {number} [x=0] Initial world x (the view can also set it after).
     * @param {number} [y=0] Initial world y.
     */
    const factory = (x = 0, y = 0) => {
      if (typeof PIXI === "undefined") {
        throw new Error(
          "circleBody factory called before PixiJS (global `PIXI`) was loaded"
        );
      }

      const container = new PIXI.Container();
      container.x = x;
      container.y = y;

      const g = new PIXI.Graphics();
      g.circle(0, 0, radius);            // shape, centred on the container origin
      g.fill({ color: fill, alpha });
      if (stroke !== null && strokeWidth > 0) {
        g.stroke({ color: stroke, width: strokeWidth });
      }
      container.addChild(g);

      return container;
    };

    entity.circleBody = factory;
    return factory;
  }
}
