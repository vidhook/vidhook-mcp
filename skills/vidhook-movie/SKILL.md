---
name: vidhook-movie
description: Write correct vidhook Movie JSON and render videos through the vidhook MCP server (validate, render, get_status). Use when the user wants to create or render a video with vidhook — slideshows, Ken Burns photo motion, scene transitions, text/title overlays, or background music — or when authoring/validating a Movie JSON definition.
---

# vidhook: authoring Movie JSON

vidhook is a **rendering primitive**: you give it a Movie JSON (scenes, images/video/text/audio,
transitions) and it renders an MP4. It does **not** generate or host assets. Every `src` is an
**http(s) URL** you provide — host them yourself (your own CDN/storage) or get URLs from a
generation MCP, then reference them. The example URLs here (`https://cdn.example.com/...`) are
placeholders; **replace them with real, reachable assets**.

This skill is the **brain** (how to write correct Movie JSON). The `vidhook-mcp` server is the
**hands** (`validate`, `render`, `get_status` tools that call the vidhook API). Use them together.

## Workflow — always `validate` first

1. **Author** a Movie JSON (see patterns and `examples/` below).
2. **`validate`** the Movie. This consumes **no credits** and starts no render. It returns either
   field-level errors or `estimatedCredits`. Fix errors and re-validate until it is valid and the
   cost is acceptable. `estimatedCredits` is exactly what `render` will reserve.
3. **`render`** a draft using a `vh_test_` key (free tier → watermarked output) to preview the
   actual video. It returns `renderId` + `bucketName`.
4. **`get_status`** with that `renderId` + `bucketName`, polling until `done` is true. When done and
   not `fatalErrorEncountered`, `outputFile` is the result video URL.
5. **Finalize** with a `vh_live_` key (paid → clean, no watermark) once the draft looks right.

Never skip step 2. Validating first is free and catches every schema mistake before you spend
credits or wait on a render.

## API key axes (set via environment, never tool arguments)

Two **independent** axes, both configured on the MCP server via environment variables:

- **Key type → watermark & billing**: `vh_test_…` = free tier, **watermarked** (drafts);
  `vh_live_…` = paid, **clean** (finals).
- **Base URL → environment**: `VIDHOOK_API_BASE_URL` selects which environment you talk to. It does
  **not** change watermarking. A `vh_test_` key always watermarks, regardless of base URL.

You never pass an API key as a tool argument — it lives only in the server's environment.

## Schema essentials

- **fps**: only `24`, `25`, or `30` (default `30`). Anything else is a 400 error.
- **Asset `src`**: http(s) URLs only.
- **Colors**: hex (`#rgb` / `#rrggbb`) or `transparent`. No named colors, no `rgb()`.
- **Resolution**: a preset (e.g. `full-hd`, `instagram-story`) sets dimensions; `custom` requires
  `width` + `height`.
- **Credit limit**: a render estimated over **600 credits** is rejected (400). Roughly, full-HD
  costs ≈ 1 credit/second. `validate` shows the exact `estimatedCredits`.
- **Four element types**: `video`, `image`, `text`, `audio` (discriminated by `type`). Unknown
  fields are silently dropped, so check spelling if a field has no effect.
- **Duration semantics** (`duration` on elements): `-1` = intrinsic (source natural length), `-2` =
  container length (the Scene, or the whole Movie for movie-level elements). Scene `duration: -1` =
  auto (longest contained element).
- **Transitions** are set on a scene and apply to the boundary **to the next scene** (ignored on the
  last scene); 58 styles, unknown styles fall back to `fade`.

Full field-by-field reference (every field, default, and constraint, plus the 58 transition styles
and resolution dimensions): **`reference/schema-cheatsheet.md`**. Read it when you need exact ranges
or are unsure whether a field exists.

### Authoritative, always-current schema

`reference/schema-cheatsheet.md` is a **local snapshot that can lag the API**. The schema truth lives
in the vidhook API, published as machine-readable docs:

- **<https://docs.vidhook.app/llms.txt>** — docs index; start here.
- **<https://docs.vidhook.app/llms-full.txt>** — full docs inlined for one-shot reading.

Fetch these when the cheatsheet lacks a field, when a field has no effect (it may have been
renamed/removed), or when `validate` returns an error you can't explain. When the live docs and this
skill's snapshot disagree, **trust the live docs**.

## Patterns (with runnable examples)

Each example in `examples/` is a complete, valid Movie JSON (it passes `validate`). Read the one
that matches the request, copy its structure, and swap in real asset URLs.

- **Image slideshow + BGM + title** → `examples/slideshow-bgm-title.json`. Several image scenes with
  fade transitions, a Movie-level title (`text` with `duration: -2` spanning the whole movie), and
  Movie-level BGM (`audio`, `duration: -2`, `loop: -1`, `volume: 0.2`).
- **Ken Burns photo motion** → `examples/ken-burns.json`. `image` elements using `zoom` (in/out) and
  `pan` (8 directions) with `pan-distance`.
- **Scene transitions + duration semantics** → `examples/transitions.json`. Different transition
  styles between scenes, plus `duration: -1` (auto/intrinsic) on a scene and its video.
- **Everything together** → `examples/composite.json`. `video` + Ken Burns `image` + `text`
  overlays + Movie-level `audio` BGM + a scene transition.

## Walkthrough: "make a slideshow of 3 photos with music and a title"

1. Start from `examples/slideshow-bgm-title.json`.
2. Replace the three image `src` URLs with the real photo URLs, and the audio `src` with the BGM URL.
3. Edit the title `text` and adjust `font-family`/`font-size`/`font-color` to taste.
4. Pick `resolution` for the target platform (e.g. `instagram-story` for vertical, `full-hd` for
   landscape).
5. `validate` → fix any errors, check `estimatedCredits`.
6. `render` with a `vh_test_` key → `get_status` until done → review the watermarked draft.
7. When happy, render the final with a `vh_live_` key.
