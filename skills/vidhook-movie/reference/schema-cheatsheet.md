# Movie JSON schema cheat sheet

The authoritative source is the API's `MovieSchema` (validated by the `validate` tool). This page
mirrors its constraints so you can write a correct Movie on the first try. When in doubt, run
`validate` — it returns the exact field-level error.

A Movie is JSON. Asset references (`src`) are **http(s) URLs only** — vidhook never generates or
uploads assets. The example URLs (`https://cdn.example.com/...`) are placeholders; replace them with
real, reachable assets you host yourself or get from a generation MCP.

## Movie (top level)

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `resolution` | preset \| `custom` | `custom` | Preset sets the dimensions (see table below). `custom` **requires** `width` + `height`. |
| `width` | int 50..3840 | — | Required only when `resolution: "custom"`. |
| `height` | int 50..3840 | — | Required only when `resolution: "custom"`. |
| `fps` | `24` \| `25` \| `30` | `30` | **Only these three values.** Any other value is a 400 error. |
| `quality` | `low` \| `medium` \| `high` | `high` | Encoding quality hint. |
| `scenes` | Scene[] | — | **Required, at least 1.** Played in order. |
| `elements` | Element[] | `[]` | Movie-wide overlays rendered across **all** scenes (e.g. BGM, watermark text). |

### Resolution presets → pixel dimensions

| Preset | Dimensions |
| --- | --- |
| `sd` | 640 × 480 |
| `hd` | 1280 × 720 |
| `full-hd` | 1920 × 1080 |
| `squared` | 1080 × 1080 |
| `instagram-story` | 1080 × 1920 |
| `instagram-feed` | 1080 × 1080 |
| `twitter-landscape` | 1280 × 720 |
| `twitter-portrait` | 1080 × 1350 |

Use `custom` + `width`/`height` only for sizes outside this list.

## Scene

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `duration` | number | `-1` | `-1` = **auto**: the max placement end of contained elements (container `-2` elements excluded). Falls back to 5s if nothing determines a length. |
| `background-color` | hex \| `transparent` | `#000000` | |
| `elements` | Element[] | `[]` | Elements layered in this scene. |
| `transition` | Transition | — | Applied at the boundary **from this scene to the NEXT one**. On the last scene it is ignored. |

## Element common fields (all element types)

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `type` | `video` \| `image` \| `text` \| `audio` | — | Discriminator. Required. |
| `start` | number (s) | `0` | Start offset within the container. |
| `duration` | number (s) | `-1` | `-1` = intrinsic: source natural length (video/audio), trimmed to the container if longer; image/text have no natural length so they fall back to the container length. `-2` = container: match the container (Scene, or Movie for movie-level elements), trimming the source if longer. |
| `position` | 9-grid \| `custom` | `custom` | 9-grid: `top-left`, `top-center`, `top-right`, `center-left`, `center-center`, `center-right`, `bottom-left`, `bottom-center`, `bottom-right`. `custom` uses `x`/`y`. |
| `x`, `y` | number | — | Pixel position (used with `position: "custom"`). |
| `width`, `height` | number | — | Element box size. |
| `z-index` | int -99..99 | `0` | Stacking order. |
| `fade-in`, `fade-out` | number (s) | — | Fade durations. |

> Unknown fields are silently dropped — every element type is strict. If a field you set has no
> effect, check its spelling and that it belongs to that element type.

### `video`

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `src` | URL | — | **Required.** http(s) only. |
| `seek` | number ≥ 0 (s) | `0` | In-source trim start. |
| `volume` | number 0..10 | `1` | Gain. `0` = silent. |
| `muted` | boolean | `false` | |
| `fit` | `cover`/`fill`/`contain`/`fit` | `cover` | `fill`→`cover`, `fit`→`contain` (normalized to `cover`/`contain`). |

### `image` (with Ken Burns)

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `src` | URL | — | **Required.** http(s) only. |
| `fit` | `cover`/`fill`/`contain`/`fit` | `cover` | Same normalization as video. |
| `zoom` | int -10..10 | `0` | Positive = zoom in, negative = zoom out, `0` = none. |
| `pan` | 8-direction enum | — | `left`, `top`, `right`, `bottom`, `top-left`, `top-right`, `bottom-left`, `bottom-right`. Omit for no pan. |
| `pan-distance` | number 0.01..0.5 | `0.1` | Pan travel as a fraction. |

`zoom` and `pan` combine into a zoom-while-panning Ken Burns effect — but mind
the **black-border rule** (with the default `fit: cover`):

- At `zoom: 0` the image fills the frame exactly. Any `pan` then moves part of the
  frame off the image edge → black borders. To pan safely, use **positive zoom**
  whose margin exceeds the pan travel.
- The zoom-per-unit is small, so keep `pan-distance` modest. **Verified safe:
  `zoom: 10` with `pan-distance ≤ 0.06`.** (`pan-distance: 0.2` shows borders even
  at `zoom: 6`.)
- **Negative zoom (zoom-out) with `fit: cover` always ends below cover → borders.**
  Don't combine negative `zoom` with `pan`.

### `text`

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `text` | string | — | **Required.** Content to render. |
| `settings` | TextSettings | — | See below. Any Google Font family name is accepted. |

`settings` keys (all optional):

| Key | Type | Notes |
| --- | --- | --- |
| `font-family` | string | Any Google Font name. Falls back to sans-serif if unresolved. |
| `font-size` | number (px) | |
| `font-weight` | string \| number | e.g. `"bold"`, `"400"`, `700`. |
| `font-color` | hex \| `transparent` | |
| `background-color` | hex \| `transparent` | Text box background. |
| `text-align` | `left`/`center`/`right` | Horizontal text alignment within the box. |
| `vertical-position` | `top`/`center`/`bottom` | Where the text sits inside the element box. |
| `horizontal-position` | `left`/`center`/`right` | Where the text sits inside the element box. |

A text element's box fills the whole frame, so position text with `vertical-position`
+ `horizontal-position` **inside `settings`** (defaults to center). The element-level
`position` / `x` / `y` fields do **not** move text — a top-level `position` on a text
element is ignored.

### `audio`

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `src` | URL | — | **Required.** http(s) only. |
| `volume` | number 0..10 | `1` | Gain. For BGM under voice/video, `0.2` is a good target. |
| `seek` | number ≥ 0 (s) | `0` | In-source trim start. |
| `loop` | int ≥ -1 | `1` | `-1` = loop indefinitely, `1` = play once. |
| `muted` | boolean | `false` | |

For full-movie BGM, put the audio element at the **Movie level** (`elements`) with `duration: -2`
(match the whole movie) and `loop: -1`.

## Transition

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `style` | string | `fade` | One of the 58 supported styles below. Unknown styles fall back to `fade` with a warning (the render never fails). |
| `duration` | number > 0 (s) | `0.5` | Transition length. |
| `type` | string | `xfade` | Only `xfade` is meaningful today. |

Set `transition` on a scene to control how it hands off to the **next** scene. Total movie length is
preserved (transitions overlap adjacent scenes rather than adding time).

### Supported `style` values (58)

```
fade, fadeblack, fadewhite,
wipeleft, wiperight, wipeup, wipedown, wipetl, wipetr, wipebl, wipebr,
slideleft, slideright, slideup, slidedown,
smoothleft, smoothright, smoothup, smoothdown,
circleopen, circleclose, dissolve, pixelize, radial,
fadefast, fadeslow,
coverleft, coverright, coverup, coverdown,
revealleft, revealright, revealup, revealdown,
horzopen, horzclose, vertopen, vertclose,
diagtl, diagtr, diagbl, diagbr,
hlslice, hrslice, vuslice, vdslice,
hlwind, hrwind, vuwind, vdwind,
squeezeh, squeezev, zoomin, hblur, fadegrays,
circlecrop, rectcrop, distance
```

## Colors

Every color is a hex string (`#rgb` or `#rrggbb`) or the literal `transparent`. No named colors,
no `rgb()`, no alpha hex.

## Credit cost & the 600 limit

A render's credit cost is estimated as:

```
credits = ceil( ceil(totalDurationSeconds) × (width × height) / (1920 × 1080) )
```

So full-HD (1920×1080) costs ≈ 1 credit per second; 4K costs ≈ 4× per second; sub-FHD is cheaper.
A render whose estimate exceeds **600 credits** is rejected with a 400 error by both `validate` and
`render`. Call `validate` first to see the exact `estimatedCredits` before spending anything.
