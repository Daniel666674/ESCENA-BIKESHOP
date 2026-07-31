# Background removal — remove-bg.py (batch) + bg-server.py (admin.html button)

Converts product photo backgrounds (asphalt, pavement, whatever they were shot
on) to a clean, solid white — for the product photos used across
`assets/img/products/`.

Uses AI segmentation (`rembg` + `birefnet-general`, a high-quality
dichotomous-segmentation model), not naive color thresholding — it handles
low-contrast cases (a black part on dark asphalt), reflective chrome, fine
negative space (a 28-tooth sprocket's spoke gaps), and small/thin parts
(washers, retaining clips) cleanly. Tested against 10 real product photos
spanning those cases, including two rounds of fixes after real defects were
found by zooming into the results (blocky matting edges, then a soft halo
around small parts) — see git history on this file for what was tried and
why.

Two ways to use it:
- **`remove-bg.py`** — a batch CLI for processing a folder of photos at once.
- **`bg-server.py`** — a local server that powers the **"✂ Quitar fondo"**
  button on each photo in admin.html's product editor, for one photo at a
  time while you're publishing.

Both share the exact same processing logic (`remove_background_to_white` in
`remove-bg.py`), so results are identical either way.

## Install (one-time)

```
pip install -r tools/requirements.txt
```

First run downloads the model (~1GB, `birefnet-general`) to `~/.u2net/` —
cached after that, no network needed for subsequent runs.

## Option A: the "Quitar fondo" button in admin.html

admin.html runs entirely in the browser with no backend of its own (the
GitHub API is the only "backend" it has) — and this model is too heavy
(~1GB, 30-60s/photo even on CPU) to run inside a browser tab. So it runs as
a small server on **your own computer** instead, which the button talks to
over `localhost`.

```
python3 tools/bg-server.py
```

Leave it running, then in admin.html's product editor, click **✂** on any
photo thumbnail. It takes 30-60s (the button shows "…" while working); the
photo is replaced in place with the white-background version once done —
nothing else about publishing changes.

If the server isn't running, clicking the button just shows a toast telling
you to start it — normal photo upload is completely unaffected either way,
whether or not you ever run this.

- Default port: `8642` — change with `--port` if that's taken.
- Only accepts connections from your own machine; nothing about it is
  reachable from the internet.
- Stop it with Ctrl+C.

## Option B: batch-processing a whole folder

```
# One photo
python3 tools/remove-bg.py assets/img/products/mi-producto.jpg

# A whole folder -> writes to assets/img/products_white/ (originals untouched)
python3 tools/remove-bg.py assets/img/products -o assets/img/products_white

# Everything, including subfolders
python3 tools/remove-bg.py assets/img/products --recursive -o out
```

By default nothing is overwritten — output goes to a separate folder
(`<input>_white` if `-o` isn't given). Pass `--overwrite` to write back into
the same file(s) instead, once you've checked the results.

## What it does per photo

1. Runs AI background segmentation (`birefnet-general`).
2. Sharpens the mask's confidence toward solid black/white, then applies a
   small blur — anti-aliases the edge without carrying the model's soft,
   low-confidence boundary into the output (that softness is what caused a
   visible halo around small/thin parts before this was added).
3. Crops to the subject's actual bounding box.
4. Centers it on a square white canvas (1200×1200 by default, matching the
   resolution most existing product photos already use) with ~8% padding.
5. Composites with true alpha blending, not a naive paste — avoids a dark
   halo at anti-aliased edges.
6. Saves as JPEG (quality 92).

## remove-bg.py options

| Flag | Default | What it does |
|---|---|---|
| `-o / --output` | `<input>_white` | Output directory |
| `--model` | `birefnet-general` | rembg model. Faster/lighter fallback: `isnet-general-use` (noticeably rougher edges — this is what v1 of this tool shipped with, and it wasn't good enough) |
| `--feather` | `2.0` | Edge anti-aliasing blur radius (px) applied after mask-sharpening. `0` = hard/jagged edges |
| `--canvas` | `1200` | Final square canvas size in px. `0` = no canvas/padding, just the trimmed cutout |
| `--pad` | `0.08` | Padding around the subject, as a fraction of canvas size |
| `--format` | `jpg` | `jpg` or `png` |
| `--quality` | `92` | JPEG quality |
| `--matting` | off | Alpha matting — off by default; on this model it produced blocky, jagged edges, worse than the plain (feathered) mask |
| `--recursive` | off | Recurse into subfolders |
| `--overwrite` | off | Write back into the source file(s) instead of a separate output dir |

## bg-server.py options

| Flag | Default | What it does |
|---|---|---|
| `--port` | `8642` | Port to listen on |
| `--model` | `birefnet-general` | Must match what you want `remove-bg.py` to produce — keep these two in sync |

## If a specific photo comes out wrong

Segmentation isn't literally perfect on every possible photo. Two known hard
cases:

- **A torn/textured label blending into a similarly-textured background** —
  `birefnet-general` handles this far better than lighter models, but it's
  still the hardest case. If it looks rough, fix that one photo manually —
  this tool is meant to clear the easy ~95%, not replace a human check
  before publishing.
- **Something genuinely in the photo (not the pavement) is visible through
  a hole in the product** — e.g. a product still sealed in its own clear
  plastic packaging shows the wrinkled bag through any gaps, correctly, since
  that's real photographed content, not background. That's not a bug to
  "fix" — cropping it out would mean cutting into the actual product photo.
