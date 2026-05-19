#!/usr/bin/env python3
import argparse
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def load_font(font_path: str | None, size: int):
    candidates = [
        font_path,
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--template", required=True)
    parser.add_argument("--handle", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--font-path")
    args = parser.parse_args()

    template = Image.open(args.template).convert("RGBA")
    if template.size != (1082, 108):
        raise SystemExit(f"Template must be 1082x108, got {template.size}")

    draw = ImageDraw.Draw(template)
    # Clear only the URL text region, preserving the black bar and KICK branding.
    draw.rectangle((475, 45, 1075, 100), fill=(0, 0, 0, 255))

    label = f"KICK.COM/{args.handle.upper()}"
    font = load_font(args.font_path, 30)
    bbox = draw.textbbox((0, 0), label, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = 475 + max(0, (600 - text_w) // 2)
    y = 45 + max(0, (55 - text_h) // 2) - bbox[1]
    draw.text((x, y), label, fill=(255, 255, 255, 255), font=font)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    template.save(output)
    print(str(output))


if __name__ == "__main__":
    main()
