# map-analyze.py: read frames/*.bin (960x160 BGR565, picture blank) and report where Live painted: the rows it uses,
# and per 120-px cell the bounding box of Live's pixels in three bands (top row, parameter area, bottom row).
import glob, os, sys
W, H, CELL = 960, 160, 120
def mask(path):
    raw = open(path, 'rb').read()
    return [[(raw[2*(y*W+x)] | raw[2*(y*W+x)+1]) != 0 for x in range(W)] for y in range(H)]
def runs(flags):                       # [(start, end)] of True runs
    out, start = [], None
    for i, f in enumerate(flags + [False]):
        if f and start is None: start = i
        if not f and start is not None: out.append((start, i - 1)); start = None
    return out
def bbox(m, x0, x1, y0, y1):
    pts = [(x, y) for y in range(y0, y1) for x in range(x0, x1) if m[y][x]]
    if not pts: return '-'
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return f'x{min(xs)-x0}-{max(xs)-x0} y{min(ys)}-{max(ys)}'
names = sys.argv[1:] or sorted(os.path.basename(p)[:-4] for p in glob.glob('frames/*.bin'))
for n in names:
    m = mask(f'frames/{n}.bin')
    rows = runs([any(r) for r in m])
    print(f'{n}: painted rows {rows}, pixels {sum(map(sum, m))}')
    if '-grey' in n: continue
    for band, (y0, y1) in {'top': (0, 22), 'name': (22, 40), 'value': (40, 70), 'dial': (70, 125), 'bottom': (125, 160)}.items():
        boxes = [bbox(m, c * CELL, (c + 1) * CELL, y0, y1) for c in range(8)]
        if any(b != '-' for b in boxes): print(f'   {band:6}', ' | '.join(boxes))
