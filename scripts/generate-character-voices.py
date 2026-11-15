#!/usr/bin/env python3
"""Create original character declaration clips with local Qwen3-TTS VoiceDesign.

Creation-only dependencies: Apple Silicon, mlx-audio==0.6.5, numpy, soundfile,
ffmpeg. The model stays in Hugging Face's local cache and is never distributed.
No voice actor recording or reference-speaker audio is used.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import numpy as np
import soundfile as sf

ROOT=Path(__file__).resolve().parents[1]
PROFILE_PATH=ROOT/'assets/voices/profiles.json'
RATE=24000


def segments(audio,rate,count=6):
    """Locate complete declarations, merging within-word consonant gaps."""
    frame=round(rate*.01)
    padded=np.pad(audio,(0,(-len(audio))%frame))
    rms=np.sqrt(np.mean(padded.reshape(-1,frame)**2,axis=1))
    active=rms>max(.003,float(rms.max())*.075)
    starts=np.flatnonzero(np.diff(np.r_[False,active].astype(int))==1)
    ends=np.flatnonzero(np.diff(np.r_[active,False].astype(int))==-1)+1
    for gap in [.18,.14,.12,.10,.22,.26,.30,.08]:
        groups=[]
        for start,end in zip(starts,ends):
            if groups and (start-groups[-1][1])*.01<gap:groups[-1][1]=int(end)
            else:groups.append([int(start),int(end)])
        groups=[(a,b) for a,b in groups if (b-a)*.01>=.10]
        if len(groups)==count:
            return [audio[max(0,a*frame-round(.035*rate)):min(len(audio),b*frame+round(.09*rate))] for a,b in groups]
    raise ValueError(f'Expected {count} declarations, detected {len(groups)}')


def normalize(audio,rate):
    audio=np.asarray(audio,dtype=np.float32).squeeze()
    audio-=float(audio.mean())
    peak=float(np.max(np.abs(audio)))
    rms=float(np.sqrt(np.mean(audio**2)))
    if peak<.01 or len(audio)/rate<.15:raise ValueError('Empty or too-short speech')
    audio*=min(.46/peak,.10/max(rms,1e-6),3)
    fade=min(round(.004*rate),len(audio)//4)
    audio[:fade]*=np.linspace(0,1,fade);audio[-fade:]*=np.linspace(1,0,fade)
    return np.r_[np.zeros(round(.025*rate)),audio,np.zeros(round(.025*rate))].astype(np.float32)


def mp3(path,audio,rate):
    path.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory() as temp:
        wav=Path(temp)/'clip.wav';sf.write(wav,audio,rate,subtype='PCM_16')
        subprocess.run(['ffmpeg','-y','-v','error','-i',str(wav),'-ac','1','-ar',str(rate),'-codec:a','libmp3lame','-b:a','64k','-map_metadata','-1',str(path)],check=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only',help='Generate just this character ID')
    parser.add_argument('--reuse-source',action='store_true',help='Use saved full-phrase source audio')
    args=parser.parse_args()
    spec=json.loads(PROFILE_PATH.read_text());source_dir=ROOT/'assets/voices/source';source_dir.mkdir(parents=True,exist_ok=True)
    records=[];model=None
    old_manifest=ROOT/'assets/voices/catalogue.json'
    if old_manifest.exists():records=json.loads(old_manifest.read_text()).get('clips',[])
    for profile in spec['profiles']:
        id=profile['id']
        if args.only and args.only!=id:continue
        source=source_dir/f'{id}.wav'
        parts=None;render_seed=next((r.get('seed',profile['seed']) for r in records if r['id']==id),profile['seed'])
        if args.reuse_source and source.exists():
            audio,rate=sf.read(source,dtype='float32')
            try:
                if len(audio)/rate>17:raise ValueError('Overlong generation')
                parts=segments(audio,rate,len(spec['actions']))
            except ValueError:print(f'Regenerating invalid source: {id}',flush=True)
        if parts is None:
            import mlx.core as mx
            if model is None:
                from mlx_audio.tts.utils import load_model
                print('Loading local VoiceDesign model',flush=True)
                model=load_model(spec['model'],revision=spec['revision'])
            text='\n\n'.join(spec['actions'].values())
            prompt=profile['instruct']+' '+spec['sharedInstruction']
            for attempt in range(3):
                render_seed=profile['seed']+attempt*1000;mx.random.seed(render_seed)
                print(f'Generating {id}: {profile["name"]} (take {attempt+1})',flush=True)
                results=list(model.generate_voice_design(text=text,language=spec['language'],instruct=prompt,max_tokens=220,temperature=.65,verbose=False))
                if not results:continue
                rate=results[0].sample_rate;audio=np.asarray(results[0].audio)
                try:
                    if len(audio)/rate>17:raise ValueError('Overlong generation')
                    parts=segments(audio,rate,len(spec['actions']));break
                except ValueError as error:print(f'Rejected take: {error}',flush=True)
            if parts is None:raise ValueError(f'Could not isolate the six declarations for {id}')
            sf.write(source,audio,rate,subtype='PCM_16')
        records=[r for r in records if r['id']!=id]
        for (action,text),part in zip(spec['actions'].items(),parts):
            part=normalize(part,rate);path=ROOT/f'public/voices/{id}/{action}.mp3';mp3(path,part,rate)
            records.append({'id':id,'action':action,'text':text,'file':str(path.relative_to(ROOT)),'duration':round(len(part)/rate,4),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'source':str(source.relative_to(ROOT)),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'seed':render_seed,'peak':round(float(np.max(np.abs(part))),5)})
        record={'generator':'scripts/generate-character-voices.py','model':spec['model'],'revision':spec['revision'],'modelLicense':spec['modelLicense'],'profiles':'assets/voices/profiles.json','language':spec['language'],'clips':records}
        old_manifest.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
        print(f'Exported six clips for {id}',flush=True)
    # Combined comparison uses the runtime files to include encoding in the audition.
    previews=[]
    for profile in spec['profiles']:
        id=profile['id'];files=[ROOT/f'public/voices/{id}/{a}.mp3' for a in ['zimo','rong','lizhi']]
        if not all(p.exists() for p in files):continue
        for p in files:
            raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-f','f32le','-ar',str(RATE),'-ac','1','-'])
            previews.extend([np.frombuffer(raw,dtype=np.float32),np.zeros(round(.20*RATE))])
        previews.append(np.zeros(round(.70*RATE)))
    if previews:mp3(ROOT/'assets/voices/preview.mp3',np.concatenate(previews),RATE)

if __name__=='__main__':main()
