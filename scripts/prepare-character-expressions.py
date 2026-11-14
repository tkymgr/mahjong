"""Slice generated expression sheets and resize finished portraits; never repaint art."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
IDS = ['hinata','ponta','suzume','ren','saki','teppei','rei','jin','gen']
STATES = ['normal','happy','upset','flustered','crisis']
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--allow-incomplete',action='store_true')
args=parser.parse_args()
source_dir=ROOT/'assets/characters/expressions'
out_dir=ROOT/'public/characters/expressions';out_dir.mkdir(parents=True,exist_ok=True)
files={}
for id in IDS:
    sheet=source_dir/f'{id}-sheet-source.png'
    crisis=source_dir/f'{id}-crisis-source.png'
    if not args.allow_incomplete and (not sheet.exists() or not crisis.exists()):
        raise ValueError(f'Missing source for {id}')
    if sheet.exists():
        with Image.open(sheet) as image:
            if abs(image.width/image.height-3)>.08:raise ValueError(f'Not a three-square sheet: {sheet} {image.size}')
            for i,state in enumerate(STATES[1:4]):
                panel=image.crop((round(image.width*i/3),0,round(image.width*(i+1)/3),image.height))
                out=out_dir/f'{id}-{state}.webp'
                panel.convert('RGB').resize((256,256),Image.Resampling.LANCZOS).save(out,quality=90,method=6)
                files[out.name]={'source':str(sheet.relative_to(ROOT)),'sourcePanel':i,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}
    if crisis.exists():
        with Image.open(crisis) as image:
            if image.width!=image.height:raise ValueError(f'Expected square: {crisis}')
            out=out_dir/f'{id}-crisis.webp'
            image.convert('RGB').resize((256,256),Image.Resampling.LANCZOS).save(out,quality=90,method=6)
            files[out.name]={'source':str(crisis.relative_to(ROOT)),'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}
# Contact sheet for identity, expression and crop QA. Runtime uses individual assets.
contact=Image.new('RGB',(5*192,9*218),'#132b22');draw=ImageDraw.Draw(contact)
for row,id in enumerate(IDS):
    for col,state in enumerate(STATES):
        path=ROOT/f'public/characters/{id}.png' if state=='normal' else out_dir/f'{id}-{state}.webp'
        if path.exists():
            with Image.open(path) as image:contact.paste(image.resize((192,192),Image.Resampling.LANCZOS),(col*192,row*218+22))
        draw.text((col*192+5,row*218+5),f'{id} / {state}',fill='#fff0be')
contact.save(ROOT/'docs/character-expression-preview.jpg',quality=92)
manifest_path=ROOT/'docs/source-manifest.json';manifest=json.loads(manifest_path.read_text())
manifest['characterExpressions']={'generator':'built-in image_gen','createdOn':'2026-11-14','specification':'assets/characters/expressions/generation.json','exporter':'scripts/prepare-character-expressions.py','runtimeSize':[256,256],'states':STATES,'files':files}
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(f'Exported {len(files)} expression portraits')
