# map-render.py <blank frame> <grey frame> <out.png>: colour the Push screen by who owns each pixel.
# red: Live draws it above our picture (names, values, dials, name fade); amber: Live draws it below our picture (top and
# bottom rows; an opaque picture covers it); dark green: free (Live draws nothing there in this layout).
import struct, sys, zlib
W, H = 960, 160
def px(path):
    raw = open(path, 'rb').read()
    return [raw[2*i] | raw[2*i+1] << 8 for i in range(W * H)]
blank, grey = px(sys.argv[1]), px(sys.argv[2])
g = max(set(grey), key=grey.count)                 # the grey we sent
rows = []
for y in range(H):
    row = bytearray([0])
    for x in range(W):
        i = y * W + x
        above, below = grey[i] != g, blank[i] != 0 and grey[i] == g
        row += bytes((200, 40, 40) if above else (230, 150, 30) if below else (20, 70, 35))
    rows.append(bytes(row))
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
open(sys.argv[3], 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0))
                              + chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b''))
print('wrote', sys.argv[3])
