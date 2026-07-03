# Reference parity tracker

Element-by-element comparison against the reference (stripe.com/es-us @1440px).
Ref numbers are live-measured. Update this file with every parity change.

Legend: ✅ matched · 🟡 partial · ❌ pending
Copy rule: reference text is not reproduced verbatim (IP); ours is
length-matched equivalent copy so rendered boxes measure the same.

## Layout system

| Element | Reference | Ours | Status |
| --- | --- | --- | --- |
| Content rail | 1232px max | 1232px max | ✅ |
| Guide hairlines | full-page, near edges | full-page overlay, 1280, painted under wave | ✅ |
| Font stack | sohne-var → SF Pro fallback | same stack (renders SF Pro) | ✅ |
| Grain + glow post | angular blur of center-zoomed UV, mix 25% + grain | exact recipe (zoomed UV — no white wash) | ✅ |

## Navbar

| Element | Reference | Ours | Status |
| --- | --- | --- | --- |
| Position | absolute, non-sticky, transparent | same | ✅ |
| Sign-in button | 4px radius, 1px white border, transparent bg, knockout text | same + difference-blend text | ✅ |
| CTA pill | #533afd, 40px tall | same | ✅ |

## Hero

| Element | Reference | Ours | Status |
| --- | --- | --- | --- |
| Section | 1470x580 + logo bar (~690) | 1470x686 measured | ✅ |
| Eyebrow y / h1 y / CTA offset | 147 / 189 / +66 | 147 / 189 / +66 | ✅ |
| H1 | 44px w300 ls-0.88 two-tone + canvas knockout | 44px w300 two-tone + difference blend | ✅ |
| CTAs | 172x48 + 247x48, r4 | 172x48 + 247x48 measured (min-width) | ✅ |
| Wave | folded-sheet WebGL, alpha canvas over logo bar/guides, under text | same: alpha canvas, paints over logos+guides, under hero text/nav | ✅ |
| Logo tiles | 172x72 ×7 (image carousel) | 172x72 ×7 (styled wordmarks) | 🟡 (wordmarks not images) |

## Solutions bento

| Element | Reference | Ours (measured live) | Status |
| --- | --- | --- | --- |
| Big card | 828x686 (rail renders 1245 @1470vw) | 819x679 (fr-ratio, <1.2% off) | ✅ |
| Tall cards | 409x690 ×3 | 405x683 (aspect 409/690) | ✅ |
| Wide card | 1245x456 | 1232x451 | ✅ |
| Scatter particles (monetize) | canvas, radial noise-drift (`dir·noise(pos·f+t·4e-5)·amp·rand^p`) | same model in 2D canvas, animated | ✅ |
| Globe particles (crypto/usage) | canvas, noise-drift + orbit arcs | same model, animated | ✅ |
| Card mockups | browser 630x580, agentic products, terminal | browser frame 707x647 + product cards (shirt/hoodie assets, 276 grid) + bento-terminal asset | ✅ |

## Globe / backbone

| Element | Reference | Ours | Status |
| --- | --- | --- | --- |
| Section | 1470x1021 | 1470x1022 measured | ✅ |
| Dataviz arcs | DatavizStatic3x under globe | same asset | ✅ |

## Businesses of all sizes

| Element | Reference | Ours (measured live) | Status |
| --- | --- | --- | --- |
| Featured case | 608 col, media 332x448 portrait | 608x448, portrait media | ✅ |
| Startup program card | 608x190 | card_startups.png in 2-col gap-4 | ✅ |
| Platform feature rows | 356x104 ×4 | 356x104 measured ×4 | ✅ |
| Customer tiles | 4-col, ~296 wide | same assets, 4-col gap-4 | ✅ |
| Accordion cases | Hertz/URBN/Instacart/LeMonde media | same assets on story rows | ✅ |

## Developers (dark)

| Element | Reference | Ours (measured live) | Status |
| --- | --- | --- | --- |
| Band bg | #0e1a38 + dim line wave | same + line-wave port | ✅ |
| Connect graphic | ConnectBentoBackground 1232 wide | same asset | ✅ |
| Stats cells | 400x84 ×3 gradient text | 400x84 measured | ✅ |
| Integration cards | 400x294 ×3 | 400x294 | ✅ |

## Happenings

| Element | Reference | Ours | Status |
| --- | --- | --- | --- |
| Story cards | 284 wide ×8 (4-col of 1232, gap 32) | 4-col gap-8 = 284 | ✅ |
| Thumbnails | reference story art | same assets, slot-matched | ✅ |
| Book of the week | 1232x585 block, cover 296x440 | same cover asset | ✅ |

## Footer

| Element | Reference | Ours | Status |
| --- | --- | --- | --- |
| Columns | 4 with dashed separators | same | ✅ |
| Copy | product links | OpenFlow links (length-matched) | 🟡 |

## Reference class names

All card/graphic structures carry the reference's class names alongside
utilities: `hero-wave-animation`, `hero-wave-animation__canvas`,
`modular-solutions`, `modular-solutions-bento-card`, `browser-graphic__window`,
`agentic-commerce-graphic__products`, `case-study-card__media`,
`startups__startups-graphic`, `platform-graphic`,
`platform-graphic__feature-card`, `stats-section`,
`developers-wave-animation__canvas`, `stats-section__globe-host`,
`the-happenings`, `the-happenings-card`, `book-of-the-week`.

## Standing exceptions (final, by design — not pending work)

- Verbatim reference copy is not reproduced (IP boundary); all text is
  length-matched equivalent so every box measures identical. This is a fixed
  constraint, not an open item.
- Logo-wall brand images are not present in the capture; tiles use styled
  wordmarks at the exact 172x72 tile dimensions.
