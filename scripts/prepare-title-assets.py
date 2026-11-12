#!/usr/bin/env python3
"""Fit newly generated title, felt and seal sources to the game's image slots.

Only the new sources in assets/title are read. No legacy artwork is used.
Requires Pillow (scripts/requirements-art.txt).
"""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/title'
TARGET = ROOT / 'public/js'


def transparent_asset(filename, size, padding):
    image = Image.open(SOURCE / filename).convert('RGBA')
    bounds = image.getchannel('A').point(lambda alpha: 255 if alpha >= 5 else 0).getbbox()
    if not bounds:
        raise ValueError(f'Empty image: {filename}')
    image = image.crop(bounds)
    image.thumbnail((size[0] - 2 * padding, size[1] - 2 * padding), Image.Resampling.LANCZOS)
    output = Image.new('RGBA', size)
    output.alpha_composite(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
    return output


def main():
    TARGET.mkdir(parents=True, exist_ok=True)
    transparent_asset('title-source.png', (299, 442), 8).save(TARGET / 'title.png', optimize=True)
    transparent_asset('harmony-seal-source.png', (52, 52), 1).save(TARGET / 'jong.png', optimize=True)
    background = Image.open(SOURCE / 'felt-source.png').convert('RGB')
    ImageOps.fit(background, (960, 720), Image.Resampling.LANCZOS).save(TARGET / 'bg.png', optimize=True)
    print('title.png: 299x442 RGBA; jong.png: 52x52 RGBA; bg.png: 960x720 RGB')


if __name__ == '__main__':
    main()
