#!/usr/bin/env python3
"""Compose and synthesize an original looping lounge cue without recorded samples.

Python standard library + ffmpeg (MP3 encoding only). No existing song, soundfont
or third-party sample library is used. Musical score and synthesis are MIT.
"""
import array
import hashlib
import json
import math
from pathlib import Path
import random
import subprocess
import sys
import tempfile
import wave

ROOT = Path(__file__).resolve().parents[1]
RATE, BPM, BARS = 32000, 84, 16
BEAT = 60 / BPM
FRAMES = round(BARS * 4 * BEAT * RATE)
LENGTH = FRAMES / RATE
rng = random.Random(20261114)
left = array.array('f', [0.0]) * FRAMES
right = array.array('f', [0.0]) * FRAMES


def note(beat, midi, length, level, pan, kind):
    frequency = 440 * 2 ** ((midi - 69) / 12)
    first = round(beat * BEAT * RATE)
    duration = length * BEAT
    release = .45 if kind == 'pad' else .10
    frames = round((duration + release) * RATE)
    gl, gr = math.sqrt((1 - pan) / 2) * level, math.sqrt((1 + pan) / 2) * level
    for i in range(frames):
        t = i / RATE
        fade = min(1, max(0, (duration + release - t) / release)) ** 2
        if kind == 'pad':
            envelope = min(1, t / .45) * fade
            sample = .5 * math.sin(math.tau * frequency * t) + .14 * math.sin(math.tau * frequency * 1.002 * t) + .05 * math.sin(math.tau * frequency * 2 * t)
        elif kind == 'bass':
            envelope = (1 - math.exp(-t / .012)) * math.exp(-t * 3.6) * fade
            sample = math.sin(math.tau * frequency * t) + .17 * math.sin(math.tau * frequency * 2 * t)
        else:
            # Felt-piano / plucked-string partials, softer than a hard bell.
            decay = 2.6 if kind == 'piano' else 3.8
            envelope = (1 - math.exp(-t / (.008 if kind == 'piano' else .003))) * fade
            sample = (math.sin(math.tau * frequency * t) * math.exp(-decay * t)
                      + .22 * math.sin(math.tau * frequency * 2.001 * t) * math.exp(-decay * 1.8 * t)
                      + .055 * math.sin(math.tau * frequency * 3.996 * t) * math.exp(-decay * 3.1 * t))
        value = sample * envelope
        index = (first + i) % FRAMES
        left[index] += value * gl
        right[index] += value * gr


# Dm9 / Bbmaj7 / Fmaj9 / C6: a restrained original 16-bar phrase.
chords = [[62, 65, 69, 72, 76], [58, 62, 65, 69, 72], [53, 57, 60, 64, 67], [60, 64, 67, 69, 74]]
melody = [
    [(0, 81, 1.4), (2, 79, .7), (3, 77, .7)],
    [(1, 77, 1.4), (3, 74, .7)],
    [(0, 72, 1.4), (2.5, 74, .7)],
    [(1, 76, 1.7)],
    [(0, 77, .8), (1.5, 81, 1.5)],
    [(1, 79, .8), (2.5, 77, 1)],
    [(0, 76, 1.5), (2.5, 72, 1)],
    [(1, 74, 1.8)],
    [(0, 81, 1.5), (2.5, 84, 1)],
    [(1, 81, 1.5), (3, 77, .7)],
    [(0, 79, 1.5), (2.5, 76, 1)],
    [(1, 74, 1.8)],
    [(0, 77, 1.4), (2, 79, .7), (3, 81, .7)],
    [(1, 77, 1.4), (3, 74, .7)],
    [(0, 72, 1.5), (2.5, 76, .8)],
    [(0, 74, 2.2)]
]
for bar in range(BARS):
    chord = chords[bar % 4]
    base = bar * 4
    for i, midi in enumerate(chord):
        note(base, midi - 12, 3.8, .030, (i - 2) * .25, 'pad')
    note(base, chord[0] - 24 if chord[0] >= 60 else chord[0] - 12, 1.6, .15, 0, 'bass')
    note(base + 2.5, chord[2] - 24, 1, .10, 0, 'bass')
    for i, index in enumerate([0, 2, 3, 1, 4, 2]):
        note(base + i * .5 + .45 + rng.uniform(-.012, .012), chord[index], 1.5, .080 * rng.uniform(.85, 1), -.28, 'piano')
    for offset, midi, length in melody[bar]:
        note(base + offset + .03, midi, length, .085, .23, 'pluck')
    # Quiet brushed rhythm, broad and short rather than a sharp electronic hat.
    for beat in range(8):
        first = round((base + beat * .5) * BEAT * RATE)
        low = 0
        for i in range(round(.065 * RATE)):
            noise = rng.uniform(-1, 1)
            low += .2 * (noise - low)
            value = (noise - low) * math.exp(-i / RATE * 110) * min(1, i / 35) * (.008 if beat % 2 else .005)
            index = (first + i) % FRAMES
            left[index] += value * .65
            right[index] += value * .8

# Circular early reflections preserve the loop's tail across the bar boundary.
dry_l, dry_r = array.array('f', left), array.array('f', right)
for seconds, level in [(.071, .13), (.113, .10), (.239, .065)]:
    delay = round(seconds * RATE)
    for i in range(FRAMES):
        left[i] += dry_r[(i - delay) % FRAMES] * level
        right[i] += dry_l[(i - delay) % FRAMES] * level
peak = max(max(abs(x) for x in left), max(abs(x) for x in right))
gain = 10 ** (-5 / 20) / peak
pcm = array.array('h')
for l, r in zip(left, right):
    pcm.extend((round(l * gain * 32767), round(r * gain * 32767)))
if sys.byteorder != 'little':
    pcm.byteswap()
output = ROOT / 'public/js/bgm-salon.mp3'
with tempfile.TemporaryDirectory() as temp:
    wav = Path(temp) / 'salon.wav'
    with wave.open(str(wav), 'wb') as sound:
        sound.setparams((2, 2, RATE, 0, 'NONE', 'not compressed'))
        sound.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(wav), '-codec:a', 'libmp3lame', '-b:a', '128k', '-map_metadata', '-1', str(output)], check=True)
record = {'title': '月灯りの卓 / Moonlit Table', 'generator': 'scripts/generate-salon-bgm.py',
          'method': 'Original score and mathematical stereo synthesis; no recordings, existing music or sample libraries.',
          'license': 'MIT', 'file': 'public/js/bgm-salon.mp3', 'bpm': BPM, 'bars': BARS,
          'duration': LENGTH, 'sampleRate': RATE, 'channels': 2, 'loop': 'Circular synthesis and reverb tails; gapless MP3 encoding.',
          'chordsMidi': chords, 'melodyMidi': melody,
          'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}
(ROOT / 'assets/audio/bgm.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(f'{output}: {LENGTH:.3f}s, {BPM} BPM, 16 bars, stereo, original composition')
