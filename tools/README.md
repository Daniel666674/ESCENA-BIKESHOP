# remove-bg.py — batch white-background converter

Converts product photo backgrounds (asphalt, pavement, whatever they were shot
on) to a clean, solid white — for the product photos used across
`assets/img/products/`.

Uses AI segmentation (`rembg`, the same class of model behind most e-commerce
background removers), not naive color thresholding — it handles low-contrast
cases (a black part on dark asphalt), reflective chrome, and holes/negative
space (dropouts, bores) correctly. Tested against 5 real product photos
spanning those cases before being added here.

## Install (one-time)

```
pip install -r tools/requirements.txt
```

First run downloads the segmentation model (~180MB) to `~/.u2net/` — cached
after that, no network needed for subsequent runs.

## Usage

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

1. Runs AI background segmentation with alpha matting (cleaner edges than the
   plain mask — no dark fringing on soft edges).
2. Crops to the subject's actual bounding box.
3. Centers it on a square white canvas (1200×1200 by default, matching the
   resolution most existing product photos already use) with ~8% padding.
4. Composites with true alpha blending, not a naive paste — avoids the dark
   halo you'd otherwise get at anti-aliased edges.
5. Saves as JPEG (quality 92) next to the rest of the catalog's photos.

## Options

| Flag | Default | What it does |
|---|---|---|
| `-o / --output` | `<input>_white` | Output directory |
| `--canvas` | `1200` | Final square canvas size in px. `0` = no canvas/padding, just the trimmed cutout |
| `--pad` | `0.08` | Padding around the subject, as a fraction of canvas size |
| `--format` | `jpg` | `jpg` or `png` |
| `--quality` | `92` | JPEG quality |
| `--model` | `isnet-general-use` | rembg model — best general edge quality. Try `u2net` if a specific photo comes out worse |
| `--no-matting` | off | Skip alpha matting (faster, slightly rougher edges) |
| `--recursive` | off | Recurse into subfolders |
| `--overwrite` | off | Write back into the source file(s) instead of a separate output dir |

## If a specific photo comes out wrong

Segmentation isn't literally perfect on every possible photo — heavily
textured/torn packaging edges blending into a similarly-textured background
are the hardest case. If one photo looks rough:

- Try `--model u2net` (different model, sometimes better on a specific image).
- Reshoot on a plainer surface if it's a recurring problem product.
- Fix that one photo manually — this script is meant to clear the easy 95%,
  not replace a human check before publishing.
