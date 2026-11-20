"""V2 아이콘 원본 PNG(흰 배경, 힉스필드) → 게임용 투명 WebP (public/assets/ui/icons/<file>.webp)
사용: python3 -I tools/icon_build.py <원본 폴더: <file>.png> [출력 폴더, 기본 public/assets/ui/icons]
- 배경 지우기·자르기는 tools/chunky_build.py와 같은 방법 (가장자리에서 이어진 밝은 무채색만 지움)
- 긴 변 192px (화면 64px × 기기 배율 3), 정사각 캔버스 가운데, WebP q82
- 파일 이름 = docs/art/higgsfield/icons/queue.json의 file"""
import json, os, sys
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'public/assets/ui/icons')
from collections import deque
import numpy as np
from PIL import ImageFilter

# tools/chunky_build.py와 같은 배경 지우기 (그 파일은 불러오면 바로 변환을 돌려서 함수만 옮김)
def knock_out_white(im: Image.Image) -> Image.Image:
    rgba = np.array(im.convert('RGBA'))
    rgb = rgba[..., :3].astype(np.int16)
    light = rgb.min(axis=2) >= 225
    gray = (rgb.max(axis=2) - rgb.min(axis=2)) <= 24
    cand = light & gray
    h, w = cand.shape
    bg = np.zeros_like(cand)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if cand[y, x] and not bg[y, x]: bg[y, x] = True; dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if cand[y, x] and not bg[y, x]: bg[y, x] = True; dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and cand[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True; dq.append((ny, nx))
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    a = Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    rgba[..., 3] = np.minimum(rgba[..., 3], np.array(a))
    return Image.fromarray(rgba)


def fit_square(im: Image.Image, side=192, pad=0.04) -> Image.Image:
    box = im.getbbox() or (0, 0, im.width, im.height)
    im = im.crop(box)
    s = (side * (1 - 2 * pad)) / max(im.width, im.height)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    out = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    out.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return out

queue = json.load(open(os.path.join(ROOT, 'docs/art/higgsfield/icons/queue.json'), encoding='utf-8'))
os.makedirs(OUT, exist_ok=True)
done = missing = 0
for item in queue:
    p = os.path.join(SRC, item['file'] + '.png')
    if not os.path.exists(p):
        missing += 1; print('없음', item['file']); continue
    fit_square(knock_out_white(Image.open(p))).save(os.path.join(OUT, item['file'] + '.webp'), 'WEBP', quality=82, method=6)
    done += 1
print(f'변환 {done}개 · 없음 {missing}개 → {OUT}')
