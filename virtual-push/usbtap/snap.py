#!/usr/bin/env python3
"""Turn Push screen frames captured by usbtap into PNG files (standard library only).

  snap.py [out.png]                 latest frame ($USBTAP_DIR/frame.bin) -> PNG (default push-<time>.png)
  snap.py --rec <outdir>            every distinct frame in rec.bin -> <outdir>/frame-NNNN.png
  snap.py --rate [seconds]          distinct frames per second from rec.log (last N seconds, default all)

Frames are 960x160 BGR565 little-endian, as usbtap writes them.
"""
import os, struct, sys, time, zlib

W, H = 960, 160
FRAME = W * H * 2
TAP = os.environ.get("USBTAP_DIR") or os.path.join(os.environ.get("TMPDIR", "/tmp"), "push-tap")


def png(path, bgr565):
    rows = bytearray()
    for y in range(H):
        rows.append(0)
        line = bgr565[y * W * 2:(y + 1) * W * 2]
        for (p,) in struct.iter_unpack("<H", line):
            rows += bytes((((p >> 11) & 0x1f) << 3, ((p >> 5) & 0x3f) << 2, (p & 0x1f) << 3))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0)) \
        + chunk(b"IDAT", zlib.compress(bytes(rows), 6)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(data)


def main(a):
    if a[:1] == ["--rec"]:
        out = a[1]; os.makedirs(out, exist_ok=True)
        with open(os.path.join(TAP, "rec.bin"), "rb") as f:
            n = 0
            while True:
                head = f.read(8)
                if len(head) < 8: break
                body = f.read(FRAME)
                if len(body) < FRAME: break
                png(os.path.join(out, "frame-%04d.png" % n), body); n += 1
        print(f"{n} frames -> {out}")
    elif a[:1] == ["--rate"]:
        rows = [l.split() for l in open(os.path.join(TAP, "rec.log"))]
        rows = [(float(t), h) for t, h in rows]
        if len(a) > 1: rows = [r for r in rows if r[0] >= rows[-1][0] - float(a[1])]
        span = rows[-1][0] - rows[0][0]
        changes = sum(1 for i in range(1, len(rows)) if rows[i][1] != rows[i - 1][1])
        print(f"{len(rows)} frames sent in {span:.2f} s = {len(rows) / span:.1f} fps to the Push; "
              f"{changes} changes = {changes / span:.1f} distinct fps")
    else:
        out = a[0] if a else time.strftime("push-%Y%m%d-%H%M%S.png")
        with open(os.path.join(TAP, "frame.bin"), "rb") as f:
            png(out, f.read(FRAME))
        print(out)


main(sys.argv[1:])
