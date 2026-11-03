# Art Direction: Codebase Space Explorer

*Decided by the human, 2026-11-03 (design Q&A). Source of truth for all visual assets.*

## References
- **Planets:** Daniel Linssen, *Planetarium* (managore.itch.io/planetarium). Keep all of its elements: pastel palette, puffy cream clouds that spill past the silhouette, scattered-pixel rings, single-pixel starfield, tiny lowercase pixel font.
- **Resolution / pixel feel:** *A Short Hike*. No public default internal resolution; it scales by a factor (presets 125–250%, "big and crunchy" at lowest). Uses a soft outline effect; no source mentions dithering. We default to 320×180 with a live slider so the human can tune by eye.

## Decisions
| Area | Decision |
|---|---|
| Asset format | **Live 3D only.** three.js meshes and shaders with a pixel post-process. No sprite sheets or pre-rendered 2D. |
| Planets | Procedural shader planets (sphere, noise, palette-quantised bands, separate cloud and ring layers). |
| Planet meaning | Health shown as biome: lush with clouds = healthy, tested, active; ocean/ice = stable, rarely touched; desert/crater = stale, low coverage; lava = churn/bugfix hotspot; rings = shared lib with many dependents; size = LOC. |
| Palette | Planetarium pastels kept, plus **depth**: distant objects fade toward the dark space colour (about -35% value and cooler hue at mid range, about -70% far, almost silhouettes), snapped to palette steps with no smooth gradients. Planetarium had no depth cue; this is the "darker" ask. |
| Astronaut | Procedural 3D from primitives, pixel-filtered like everything else. Chunky toy proportions: oversized round helmet (~40% of height), reflective visor, stubby limbs, boxy backpack. Cream/pastel suit; visor and backpack stripe carry the contributor colour. |
| Outlines | None, matching the references. |

## Scope: batch 1 (for review before any GIF)
One lush planet (clouds + optional ring) and one astronaut in 3 contributor colours, in a live viewer page: orbit camera, pixel post-process, depth darkening (show a near and a far copy to prove it), seed slider. Screenshots go to the human for sign-off. Other biomes come after approval. The GIF comes after that.
