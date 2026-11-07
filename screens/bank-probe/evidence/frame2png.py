# frame2png.py <frame.bin> <out.png>: decode a 960x160 BGR565 little-endian Push frame into a PNG (no PIL: write via zlib)
import struct, sys, zlib
raw = open(sys.argv[1], 'rb').read(); W, H = 960, 160
rows = []
for y in range(H):
    row = bytearray([0])
    for x in range(W):
        v = raw[2*(y*W+x)] | (raw[2*(y*W+x)+1] << 8)
        b = (v >> 11) & 31; g = (v >> 5) & 63; r = v & 31
        row += bytes(((r*255)//31, (g*255)//63, (b*255)//31))
    rows.append(bytes(row))
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b'')
open(sys.argv[2], 'wb').write(png); print('wrote', sys.argv[2])
