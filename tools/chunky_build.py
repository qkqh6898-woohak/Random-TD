"""3행 그림체 원본 PNG(흰 배경) → 게임용 투명 WebP (public/assets/characters/<file>.webp)
사용: python3 -I tools/chunky_build.py <원본 폴더: <file>.png 159개> [출력 폴더, 기본 public/assets/characters]
- 흰 배경은 가장자리에서 이어진 '밝고 무채색' 픽셀만 지운다 (캐릭터 안의 흰색은 남는다 — 굵은 윤곽선이 막아 줌)
- 경계 1px 부드럽게, 캐릭터 경계로 자르고 긴 변 256px, WebP q82 (기존 prep_hf_assets.py와 같은 규격)
- 파일 이름은 docs/art/higgsfield/chunky/queue.json의 file 그대로 → manifest.json은 바꿀 필요 없음 (159개 이름 동일)"""
import json, os, sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'public/assets/characters')
queue = json.load(open(os.path.join(ROOT, 'docs/art/higgsfield/chunky/queue.json'), encoding='utf-8'))

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

def crop_fit(im: Image.Image, side=256) -> Image.Image:
    bbox = im.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
    if bbox: im = im.crop(bbox)
    s = side / max(im.size)
    if s < 1: im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    return im

os.makedirs(OUT, exist_ok=True)
done, missing = 0, []
for item in queue:
    p = os.path.join(SRC, item['file'] + '.png')
    if not os.path.exists(p): missing.append(item['file']); continue
    crop_fit(knock_out_white(Image.open(p))).save(os.path.join(OUT, item['file'] + '.webp'), 'WEBP', quality=82, method=6)
    done += 1
print(f'변환 {done}개 · 없음 {len(missing)}개', missing[:10])
