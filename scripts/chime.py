#!/usr/bin/env python3
"""Write a soft, bell-like chime WAV (no dependencies).

Two struck notes a fifth apart, each a few harmonics under an exponential
decay, with a slow attack so nothing clicks. Run once:

    python3 scripts/chime.py assets/chime.wav
"""
import math
import struct
import sys
import wave

RATE = 44100
DUR = 3.2


def bell(freq, start, amp):
    """A struck tone: harmonics 1, 2, 2.76, 5.4 (the bell ratios), decaying."""
    out = []
    n = int(RATE * DUR)
    s0 = int(RATE * start)
    for i in range(n):
        if i < s0:
            out.append(0.0)
            continue
        t = (i - s0) / RATE
        attack = min(1.0, t / 0.012)
        env = attack * math.exp(-1.45 * t)
        v = (math.sin(2 * math.pi * freq * t)
             + 0.38 * math.sin(2 * math.pi * freq * 2.0 * t)
             + 0.20 * math.sin(2 * math.pi * freq * 2.76 * t)
             + 0.09 * math.sin(2 * math.pi * freq * 5.4 * t))
        out.append(amp * env * v)
    return out


def main(path):
    a = bell(523.25, 0.00, 0.34)   # C5
    b = bell(783.99, 0.16, 0.22)   # G5, a fifth above, a breath later
    mix = [x + y for x, y in zip(a, b)]
    peak = max(abs(x) for x in mix) or 1.0
    mix = [x / peak * 0.55 for x in mix]           # headroom: soft, never clipped
    frames = b"".join(struct.pack("<h", int(x * 32767)) for x in mix)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(frames)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "assets/chime.wav")
