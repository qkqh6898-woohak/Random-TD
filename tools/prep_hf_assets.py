"""Higgsfield PNG 원본 → 게임용 WebP (public/assets/...) + manifest.json"""
import json, os, sys
from PIL import Image
SRC = sys.argv[1]            # charart dir
OUT = sys.argv[2]            # .../public/assets
art = json.load(open(os.path.join(SRC, 'characterArt.json')))['characters']
img = os.path.join(SRC, 'img')
for d in ('characters', 'backgrounds', 'cutins', 'title'):
    os.makedirs(os.path.join(OUT, d), exist_ok=True)

def crop_alpha(im, t=16):
    a = im.getchannel('A')
    bbox = a.point(lambda v: 255 if v > t else 0).getbbox()
    return im.crop(bbox) if bbox else im

def fit_max(im, side):
    s = side / max(im.size)
    if s < 1: im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    return im

def cover(im, W, H):
    s = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    l, t = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((l, t, l + W, t + H))

entries, total = [], 0
def save(im, rel, q):
    global total
    p = os.path.join(OUT, rel); im.save(p, 'WEBP', quality=q, method=6); total += os.path.getsize(p)

for c in art:
    kind, cid, f = c['kind'], c['id'], c['file']
    pairs = [(f, False)]
    if c.get('awaken') or c.get('awakenPrompt'):
        if os.path.exists(os.path.join(img, f + '_awaken.png')): pairs.append((f + '_awaken', True))
    for src, aw in pairs:
        p = os.path.join(img, src + '.png')
        if not os.path.exists(p): print('MISSING', src); continue
        im = fit_max(crop_alpha(Image.open(p).convert('RGBA')), 256)
        if kind == 'tower': name, entry = cid + ('_awaken' if aw else ''), cid + ('_awaken' if aw else '')
        elif kind == 'enemy': name, entry = f'enemy_{cid}', f'enemy:{cid}'
        else: name, entry = f'person_{cid}', f'person:{cid}'
        save(im, f'characters/{name}.webp', 82); entries.append(entry)

for f in sorted(os.listdir(img)):
    n, p = f[:-4], os.path.join(img, f)
    if n.startswith('bg_'): save(cover(Image.open(p).convert('RGB'), 720, 1280), f'backgrounds/{n}.webp', 78)
    elif n.startswith('cutin_'): save(fit_max(crop_alpha(Image.open(p).convert('RGBA')), 640), f'cutins/{n}.webp', 82)
    elif n.startswith('title_keyart_') or n == 'worldmap': save(cover(Image.open(p).convert('RGB'), 720, 1280), f'title/{n}.webp', 80)

json.dump({'version': 1, 'characters': entries}, open(os.path.join(OUT, 'characters', 'manifest.json'), 'w'), ensure_ascii=False, indent=1)
print('entries', len(entries), 'total MB', round(total / 1e6, 2))
