#!/usr/bin/env python3
"""Generate the original, sample-free win chime using Python's standard library."""

import argparse
import array
import math
from pathlib import Path
import sys
import wave

SAMPLE_RATE = 48000
DURATION = 1.4
PEAK = 10 ** (-4.5 / 20)
# Time, frequency in Hz, amplitude: C5 / E5 / G5 / C6 with a quiet final chord.
NOTES = (
    (0.00, 523.2511, 1.00),
    (0.11, 659.2551, 0.95),
    (0.22, 783.9909, 0.90),
    (0.36, 1046.5023, 1.05),
    (0.36, 523.2511, 0.20),
    (0.36, 659.2551, 0.15),
    (0.36, 783.9909, 0.15),
)


def synthesize():
    samples = []
    for i in range(round(SAMPLE_RATE * DURATION)):
        t = i / SAMPLE_RATE
        value = 0.0
        for start, frequency, amplitude in NOTES:
            age = t - start
            if age < 0:
                continue
            attack = math.sin(min(age / 0.008, 1.0) * math.pi / 2) ** 2
            tone = (
                math.sin(math.tau * frequency * age) * math.exp(-4.2 * age)
                + 0.18 * math.sin(math.tau * frequency * 2 * age) * math.exp(-7.5 * age)
                + 0.04 * math.sin(math.tau * frequency * 3 * age) * math.exp(-11 * age)
            )
            value += amplitude * attack * tone
        # A smooth ending prevents clicks when the buffer stops.
        release = math.sin(min((DURATION - t) / 0.18, 1.0) * math.pi / 2) ** 2
        samples.append(value * release)
    gain = PEAK / max(abs(value) for value in samples)
    return array.array('h', (round(value * gain * 32767) for value in samples))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'public/js/w_clear.wav')
    args = parser.parse_args()
    pcm = synthesize()
    if sys.byteorder != 'little':
        pcm.byteswap()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(args.output), 'wb') as sound:
        sound.setparams((1, 2, SAMPLE_RATE, 0, 'NONE', 'not compressed'))
        sound.writeframes(pcm.tobytes())
    print(f'{args.output}: {DURATION:.1f}s, {SAMPLE_RATE} Hz, mono, 16-bit PCM, peak -4.5 dBFS')


if __name__ == '__main__':
    main()
