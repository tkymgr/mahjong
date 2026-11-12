"""Export generated source portraits without changing their illustration."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
record = json.loads((ROOT / 'assets/characters/prompts.json').read_text())
manifest_path = ROOT / 'docs/source-manifest.json'
manifest = json.loads(manifest_path.read_text())
files = {}
for profile in record['prompts']:
    source, output = ROOT / profile['source'], ROOT / profile['runtime']
    with Image.open(source) as image:
        if image.width != image.height:
            raise ValueError(f'Expected a square portrait: {source}')
        image.convert('RGB').resize((256, 256), Image.Resampling.LANCZOS).save(output, optimize=True)
    files[output.name] = {
        'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
        'source': profile['source'],
        'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    }
manifest['characterAvatars'].update(
    createdOn=record['createdOn'], files=files,
    generator=record['generator'], prompts='assets/characters/prompts.json',
    styleReference=record['styleReference'],
    exporter='scripts/prepare-character-assets.py',
)
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(f'Exported {len(files)} avatars at 256 x 256')
