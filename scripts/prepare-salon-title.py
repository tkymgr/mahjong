"""Export the original salon title and room layers with provenance records."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
manifest_path = ROOT / 'docs/source-manifest.json'
manifest = json.loads(manifest_path.read_text())
for source_name, target_name, quality, prompt, description in [
    ('salon-composite.png', 'title-salon.webp', 88, 'salon-clean-plate-prompt.json',
     'Original clean illustration composited with dimensioned CC0 3D tiles and licensed tile-face artwork.'),
    ('salon-room-source.png', 'salon-room.webp', 85, 'salon-room-prompt.json',
     'Original quiet salon backdrop behind the transparent 3D game canvas.'),
]:
    source = ROOT / 'assets/title' / source_name
    target = ROOT / 'public/js' / target_name
    with Image.open(source) as image:
        image.convert('RGB').save(target, quality=quality, method=6)
    manifest['generatedAssets'][target_name] = {
        'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        'sourceArt': f'assets/title/{source_name}',
        'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'styleReference': 'assets/characters/title-style-reference.png',
        'prompt': f'assets/title/{prompt}',
        'generator': 'scripts/prepare-salon-title.py',
        'createdOn': '2026-11-11',
        'description': description,
    }
    if target_name == 'title-salon.webp':
        manifest['generatedAssets'][target_name].update({
            'updatedOn': '2026-11-13',
            'cleanIllustration': 'assets/title/salon-base-no-tiles.png',
            'model': 'public/models/mahjong-tile.json',
            'layout': 'assets/title/title-tiles-layout.json',
            'renderMetrics': 'assets/title/title-tiles-render.json',
            'renderer': 'scripts/render-title-tiles.mjs',
            'compositor': 'scripts/compose-title-art.py',
            'tileFacePermission': 'assets/tiles/user-tile-sheet-source.json',
            'licenseNote': 'AI base art and code: MIT; tile mesh: CC0; tile-face art: Mahjong Toufu usage terms. The composite is not wholly relicensed under MIT.',
        })
    print(f'Exported {target.name}: {target.stat().st_size} bytes')
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
