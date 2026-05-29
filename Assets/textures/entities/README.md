# Assets/textures/entities/

Sprite textures for entities. The path base is set in
[`GameEngine/entities/MobVariety.js`](../../../GameEngine/entities/MobVariety.js)
via `TEXTURE_DIR` — change it there if this folder ever moves.

Drop a PNG here named to match each `MobType` (one per `case` in `mobVariety`):

| MobType | file |
|---|---|
| `BABY_ANT` | `baby_ant.png` |
| `WORKER_ANT` | `worker_ant.png` |
| `SOLDIER_ANT` | `soldier_ant.png` |
| `BEE` | `bee.png` |
| `HORNET` | `hornet.png` |
| `SPIDER` | `spider.png` |
| `BEETLE` | `beetle.png` |
| `LADYBUG` | `ladybug.png` |
| `ROCK` | `rock.png` |
| _(fallback)_ | `unknown.png` |

Until a file exists, the view renders that entity with a white placeholder
(`PIXI.Texture.WHITE`). Preload them at boot with
`VisualEngine.shared.view.load([...])`.
