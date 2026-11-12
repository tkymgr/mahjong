#!/usr/bin/env python3
"""Synthesize eight original game effects; preserve the approved win chime.

Uses only Python's standard library. No recordings, third-party samples,
random noise or external audio services are used. Short inharmonic modes
model resin contact sounds; sine partials produce restrained UI chimes.
"""
import argparse
import array
import hashlib
import json
import math
from pathlib import Path
import sys
import wave

ROOT = Path(__file__).resolve().parents[1]
RATE = 48000


def impact(samples, start, frequency, amplitude=1.0, softness=1.0):
    modes = ((1, 1, 48), (1.91, .52, 68), (3.17, .27, 96), (4.83, .15, 132), (6.23, .065, 175))
    first = round(start * RATE)
    for i in range(first, min(len(samples), first + round(.14 * RATE))):
        age = (i - first) / RATE
        attack = 1 - math.exp(-age / (.0009 * softness))
        tone = sum(gain * math.sin(math.tau * frequency * ratio * age) * math.exp(-decay * age / softness)
                   for ratio, gain, decay in modes)
        body = .22 * math.sin(math.tau * frequency * .32 * age) * math.exp(-65 * age)
        samples[i] += amplitude * attack * (tone + body)


def bell(samples, start, frequency, amplitude=1.0, decay=13):
    first = round(start * RATE)
    for i in range(first, len(samples)):
        age = (i - first) / RATE
        attack = 1 - math.exp(-age / .0025)
        tone = (math.sin(math.tau * frequency * age) * math.exp(-decay * age)
                + .17 * math.sin(math.tau * frequency * 2 * age) * math.exp(-decay * 1.7 * age)
                + .035 * math.sin(math.tau * frequency * 3.93 * age) * math.exp(-decay * 2.8 * age))
        samples[i] += amplitude * attack * tone


# (duration, peak dBFS, purpose, impact events, bell events)
SOUNDS = {
    'tumo': (.11, -12.0, '配牌・ツモ：小さく乾いた樹脂の接触音',
             [(.006, 720, 1.0, .85), (.043, 580, .13, .9)], []),
    'sute': (.14, -9.0, '打牌：ツモより芯のある短い打音',
             [(.004, 1030, 1.0, .75), (.019, 660, .28, .8)], []),
    'naki': (.25, -10.0, '鳴き・カンの牌を置く連続した打音',
             [(.005, 920, 1.0, .72), (.058, 760, .65, .8), (.112, 1080, .8, .75)], []),
    'puyo': (.24, -13.0, '宣言・効果音ONの確認：柔らかい短い上昇音',
             [], [(.006, 659.2551, 1.0, 18), (.066, 880.0, .72, 20)]),
    'notice': (.46, -11.5, 'ツモ・ロン可能時の通知：聞き分けやすい2音',
               [], [(.008, 1046.5023, 1.0, 14), (.165, 1567.9817, .65, 15)]),
    'ribo': (.26, -11.0, '供託・支払い：点棒を置く打音と小さな余韻',
             [(.006, 820, 1.0, .9)], [(.026, 1661.2188, .16, 28)]),
    'tenbo': (.20, -16.0, '点数精算：継ぎ目が無音になる低音量のカウント音',
              [(.010, 1550, 1.0, .58)], [(.012, 2349.3181, .035, 55)]),
    'lose': (.62, -10.5, 'CPU和了：穏やかな下降チャイム',
             [], [(.008, 783.9909, 1.0, 12), (.135, 659.2551, .8, 13), (.265, 587.3295, .7, 13)]),
}


def synthesize(spec):
    duration, peak_db, _, hits, notes = spec
    samples = [0.0] * round(duration * RATE)
    for event in hits:
        impact(samples, *event)
    for event in notes:
        bell(samples, *event)
    # Smooth the tail to exact zero. Together with the leading silence this
    # also makes the repeating score effect free of boundary clicks.
    tail = min(round(.020 * RATE), len(samples))
    for i in range(tail):
        samples[-tail + i] *= math.cos(i / (tail - 1) * math.pi / 2) ** 2
    peak = max(abs(value) for value in samples)
    gain = 10 ** (peak_db / 20) / peak
    pcm = array.array('h', (round(value * gain * 32767) for value in samples))
    pcm[0] = pcm[-1] = 0
    return pcm


def save(path, samples):
    data = array.array('h', samples)
    if sys.byteorder != 'little':
        data.byteswap()
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), 'wb') as sound:
        sound.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        sound.writeframes(data.tobytes())


def read(path):
    with wave.open(str(path), 'rb') as sound:
        if (sound.getnchannels(), sound.getsampwidth(), sound.getframerate()) != (1, 2, RATE):
            raise ValueError(f'Unexpected WAV format: {path}')
        data = array.array('h', sound.readframes(sound.getnframes()))
    if sys.byteorder != 'little':
        data.byteswap()
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'public/js')
    args = parser.parse_args()
    preview = array.array('h')
    clips = []
    for name, spec in SOUNDS.items():
        pcm = synthesize(spec)
        path = args.output_dir / f'w_{name}.wav'
        save(path, pcm)
        start = len(preview) / RATE
        preview.extend(pcm)
        preview.extend([0] * round(.30 * RATE))
        rms = math.sqrt(sum((value / 32768) ** 2 for value in pcm) / len(pcm))
        clips.append({'id': name, 'file': f'public/js/w_{name}.wav', 'purpose': spec[2],
                      'duration': len(pcm) / RATE, 'previewStart': round(start, 3),
                      'peakDbfs': spec[1], 'rmsDbfs': round(20 * math.log10(rms), 2),
                      'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                      'loopable': name == 'tenbo'})
    # Do not regenerate or overwrite the win chime selected by the user.
    win = read(ROOT / 'public/js/w_clear.wav')
    win_start = len(preview) / RATE
    preview.extend(win)
    save(ROOT / 'assets/audio/effects-preview.wav', preview)
    record = {'generator': 'scripts/generate-game-sounds.py', 'sampleRate': RATE,
              'channels': 1, 'bitsPerSample': 16, 'method': 'Deterministic modal/sine synthesis; no recordings or sample libraries.',
              'clips': clips, 'approvedWin': {'file': 'public/js/w_clear.wav',
              'sha256': hashlib.sha256((ROOT / 'public/js/w_clear.wav').read_bytes()).hexdigest(),
              'previewStart': round(win_start, 3), 'changed': False}}
    (ROOT / 'assets/audio/effects.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    print('Created 8 effects and an audition WAV; the approved win chime is unchanged.')
    for clip in clips:
        print(f"{clip['id']}: {clip['duration']:.2f}s, peak {clip['peakDbfs']:.1f} dBFS")


if __name__ == '__main__':
    main()
