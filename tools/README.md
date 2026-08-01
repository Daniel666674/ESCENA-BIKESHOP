# Background removal — the admin.html button + remove-bg.py (batch)

Converts product photo backgrounds (asphalt, pavement, whatever they were shot
on) to a clean, solid white — for the product photos used across
`assets/img/products/`.

Two ways to use it:
- **The "✂ Quitar fondo" button** on each photo in admin.html's product
  editor — runs **entirely in your browser**, nothing to install. Click it,
  the first time on a given browser it downloads a small AI model (~50MB,
  cached afterward), then the photo is replaced in place with the
  white-background version. This is what admins use day to day.
- **`remove-bg.py`** — a batch CLI for processing a whole folder of photos at
  once from the terminal (e.g. bulk-cleaning existing product photos).
  Optional, only needed for bulk work — not required for the button above.

They use different engines (the button runs `@imgly/background-removal` — a
WASM build light enough for a browser tab; the CLI uses `rembg` +
`birefnet-general`, heavier but even higher quality) but both apply the same
post-processing: sharpen the AI mask's confidence toward solid black/white
before a small blur (avoids the soft halo a raw mask leaves around small/thin
parts), crop to the subject, center it on a padded white square canvas.

## The "Quitar fondo" button (admin.html)

Nothing to install — just click **✂** on a photo thumbnail in the product
editor. First click on a given browser downloads the model (progress shown
as a percentage on the button); after that it's cached and later clicks are
much faster. Everything happens on your device — no photo is ever uploaded
anywhere for this. Normal photo upload/publish is unaffected either way.

## remove-bg.py — batch-processing a whole folder from the terminal

```
pip install -r tools/requirements.txt
```

First run downloads the model (~1GB, `birefnet-general`) to `~/.u2net/` —
cached after that, no network needed for subsequent runs.

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
