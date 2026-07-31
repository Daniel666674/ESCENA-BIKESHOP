#!/usr/bin/env python3
"""Batch-convert product photo backgrounds to solid white.

Usage:
  python3 tools/remove-bg.py <file-or-directory> [-o OUTPUT_DIR] [options]

Examples:
  python3 tools/remove-bg.py assets/img/products/mi-producto.jpg
  python3 tools/remove-bg.py assets/img/products -o assets/img/products-white
  python3 tools/remove-bg.py assets/img/products -o out --canvas 1200 --feather 1.5

See tools/README.md for the full option list and install instructions.
"""

import argparse
import sys
import traceback
from pathlib import Path

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}


def eprint(*a, **kw):
    print(*a, file=sys.stderr, **kw)


def build_arg_parser():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("input", help="Image file or directory of images")
    p.add_argument("-o", "--output", help="Output directory (default: <input>_white next to the source)")
    p.add_argument("--model", default="birefnet-general",
                    help="rembg model (default: birefnet-general — highest edge quality, including hard "
                         "cases like a torn/textured label blending into the pavement background; ~1GB "
                         "download, slow on CPU (~30-60s/photo)). Faster fallback: isnet-general-use")
    p.add_argument("--matting", action="store_true", default=False,
                    help="Use alpha matting (off by default — on this model it produced blocky, jagged "
                         "edges, worse than the plain mask; --feather already gives smooth edges without it)")
    p.add_argument("--no-matting", dest="matting", action="store_false", help=argparse.SUPPRESS)
    p.add_argument("--feather", type=float, default=2.0,
                    help="Gaussian blur radius (px) applied to the alpha channel for smooth, anti-aliased "
                         "edges (default: 2.0). 0 = off (hard/jagged edges)")
    p.add_argument("--canvas", type=int, default=1200,
                    help="Final square canvas size in px (default: 1200). 0 = keep original cutout size, no padding/centering")
    p.add_argument("--pad", type=float, default=0.08,
                    help="Padding around the subject as a fraction of canvas size (default: 0.08 = 8%%)")
    p.add_argument("--format", choices=["jpg", "png"], default="jpg",
                    help="Output format (default: jpg — white bg doesn't need transparency)")
    p.add_argument("--quality", type=int, default=92, help="JPEG quality 1-100 (default: 92)")
    p.add_argument("--recursive", action="store_true", help="Recurse into subdirectories")
    p.add_argument("--overwrite", action="store_true",
                    help="Write back into the SAME file/directory as the input instead of a separate output dir. "
                         "Use with care — originals are lost.")
    return p


def find_images(root: Path, recursive: bool):
    if root.is_file():
        return [root]
    pattern = "**/*" if recursive else "*"
    return sorted(f for f in root.glob(pattern) if f.is_file() and f.suffix.lower() in IMG_EXTS)


def composite_on_white(rgba_img):
    """True alpha compositing (out = alpha*fg + (1-alpha)*white), not a naive
    paste — a naive paste leaves a dark fringe at soft/anti-aliased edges
    because semi-transparent edge pixels still carry some of the original
    (often dark) background color mixed into their RGB."""
    from PIL import Image
    import numpy as np

    arr = np.asarray(rgba_img.convert("RGBA"), dtype=np.float32)
    rgb, alpha = arr[..., :3], arr[..., 3:4] / 255.0
    white = np.full_like(rgb, 255.0)
    out = rgb * alpha + white * (1 - alpha)
    return Image.fromarray(out.astype("uint8"), "RGB")


def trim_and_pad(rgba_img, canvas_size, pad_frac):
    """Crop to the subject's bounding box (from alpha), then center it on a
    square white canvas of canvas_size with pad_frac of breathing room —
    matches the site's square product-card crop (see tienda.html cardHTML)."""
    from PIL import Image

    alpha = rgba_img.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:  # fully transparent — nothing detected, bail to original
        return rgba_img
    subject = rgba_img.crop(bbox)

    if canvas_size <= 0:
        return subject

    usable = canvas_size * (1 - 2 * pad_frac)
    scale = min(usable / subject.width, usable / subject.height)
    new_w, new_h = max(1, round(subject.width * scale)), max(1, round(subject.height * scale))
    subject = subject.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGBA", (canvas_size, canvas_size), (255, 255, 255, 255))
    canvas.paste(subject, ((canvas_size - new_w) // 2, (canvas_size - new_h) // 2), subject)
    return canvas


def remove_background_to_white(img, session, feather=2.0, canvas=1200, pad=0.08, matting=False):
    """Core pipeline, shared by the CLI (process_one, below) and bg-server.py
    (the local-helper HTTP server admin.html's photo upload can call) — both
    must produce identical results, so this is the one place the actual
    processing logic lives.

    img: a PIL RGB Image. Returns a PIL RGB Image (white background)."""
    from rembg import remove

    cutout = remove(
        img,
        session=session,
        alpha_matting=matting,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=10,
        alpha_matting_erode_size=8,
        post_process_mask=True,
    )  # returns RGBA

    if feather > 0:
        # Two-step edge cleanup: sharpen the mask's confidence first, then
        # blur lightly for anti-aliasing — blurring alone was carrying the
        # model's soft, low-confidence boundary straight into the output,
        # which is barely visible on a large solid part but shows up as a
        # visible warm-grey halo around small/thin ones (a washer, a
        # retaining clip) where that soft boundary is a big fraction of the
        # object's own size. The sigmoid pushes mid-confidence alpha toward
        # solid 0/255 (a crisp boundary) before the blur only softens that
        # crisp edge into anti-aliasing, instead of smoothing over genuine
        # uncertainty.
        import numpy as np
        from PIL import Image, ImageFilter
        r, g, b, a = cutout.split()
        a_arr = np.asarray(a, dtype=np.float32) / 255.0
        a_sharp = 1.0 / (1.0 + np.exp(-12.0 * (a_arr - 0.5)))
        a = Image.fromarray((a_sharp * 255).astype("uint8"))
        a = a.filter(ImageFilter.GaussianBlur(radius=min(feather, 1.2)))
        cutout = Image.merge("RGBA", (r, g, b, a))

    framed = trim_and_pad(cutout, canvas, pad)
    return composite_on_white(framed)


def process_one(path: Path, out_path: Path, session, args):
    from PIL import Image

    img = Image.open(path).convert("RGB")
    flat = remove_background_to_white(img, session, args.feather, args.canvas, args.pad, args.matting)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    if args.format == "png":
        flat.save(out_path.with_suffix(".png"), "PNG", optimize=True)
    else:
        flat.save(out_path.with_suffix(".jpg"), "JPEG", quality=args.quality, optimize=True)


def main():
    args = build_arg_parser().parse_args()
    in_root = Path(args.input).resolve()
    if not in_root.exists():
        eprint(f"Input not found: {in_root}")
        sys.exit(1)

    images = find_images(in_root, args.recursive)
    if not images:
        eprint(f"No images found under {in_root}")
        sys.exit(1)

    if args.overwrite:
        out_root = None
    elif args.output:
        out_root = Path(args.output).resolve()
    else:
        out_root = in_root.parent / (in_root.stem + "_white") if in_root.is_file() else in_root.parent / (in_root.name + "_white")

    try:
        from rembg import new_session
    except ImportError:
        eprint("Missing dependency. Install with: pip install rembg onnxruntime pillow numpy")
        sys.exit(1)

    print(f"Loading model '{args.model}' (first run downloads it, ~100-180MB)...")
    session = new_session(args.model)

    ok, failed = 0, []
    for i, path in enumerate(images, 1):
        if args.overwrite:
            out_path = path
        else:
            rel = path.relative_to(in_root) if in_root.is_dir() else Path(path.name)
            out_path = out_root / rel
        print(f"[{i}/{len(images)}] {path.name} ...", end=" ", flush=True)
        try:
            process_one(path, out_path, session, args)
            print("done")
            ok += 1
        except Exception as e:
            print(f"FAILED ({e})")
            eprint(traceback.format_exc())
            failed.append((path, str(e)))

    print(f"\n{ok}/{len(images)} succeeded.")
    if failed:
        eprint(f"{len(failed)} failed:")
        for p, msg in failed:
            eprint(f"  - {p}: {msg}")
        sys.exit(2)


if __name__ == "__main__":
    main()
