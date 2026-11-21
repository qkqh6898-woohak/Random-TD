#!/usr/bin/env python3
"""Jua 글꼴 줄이기 (결정 A: 앱에는 subset woff2 ≤300KB만 넣는다).

글자 범위 (원본을 다시 받아도 같은 결과가 나오게 고정 목록):
- KS X 1001 완성형 한글 2,350자 (EUC-KR 0xB0A1~0xC8FE). src/ 전체에서 쓰는 한글은 모두 이 안에 있다
  — tests/unit/font-subset.test.ts가 지킨다. 범위 밖 글자는 tokens.css의 다음 글꼴(시스템 한글 글꼴)로 그려진다.
- 한글 호환 자모(ㄱ~ㅣ), 기본 라틴(ASCII), 자주 쓰는 문장 부호·화살표·기호.

사용: python3 -I tools/font_subset.py <원본 Jua-Regular.ttf 또는 .woff> [출력 woff2]
필요: pip install fonttools brotli
원본: docs/design/v2/font.json 의 download 주소 (OFL 1.1, 예약 글꼴 이름 없음 → 줄인 판도 같은 이름 사용 가능)
"""
import sys
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

MAX_BYTES = 300 * 1024


def ks_x_1001_hangul():
    out = []
    for hi in range(0xB0, 0xC9):
        for lo in range(0xA1, 0xFF):
            try:
                out.append(ord(bytes([hi, lo]).decode('euc-kr')))
            except UnicodeDecodeError:
                pass
    return out


def unicodes():
    cps = set(ks_x_1001_hangul())
    cps.update(range(0x20, 0x7F))        # ASCII
    cps.update(range(0x3131, 0x318F))    # 한글 호환 자모
    cps.update([0xA0, 0xB7, 0xD7, 0xB0, 0xA9])  # nbsp · × ° ©
    cps.update(range(0x2010, 0x2027))    # ‐ – — ‘ ’ “ ” • …
    cps.update(range(0x2190, 0x2196))    # ← ↑ → ↓ ↔ ↕
    cps.update([0x2605, 0x2606, 0x25B2, 0x25BC, 0x25B6, 0x25C0, 0x203B, 0x2192])
    cps.update(range(0x3000, 0x3012))    # 、。〈〉《》「」『』【】
    cps.update(range(0xFF01, 0xFF5F))    # 전각 기호·영숫자 (～ ！ 등)
    return sorted(cps)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else 'public/assets/fonts/Jua-Regular.subset.woff2'
    font = TTFont(src)
    have = set(font.getBestCmap())
    want = [c for c in unicodes() if c in have]
    hangul = sum(1 for c in want if 0xAC00 <= c <= 0xD7A3)
    if hangul != 2350:
        sys.exit(f'원본 글꼴에 KS X 1001 한글이 {hangul}/2350자뿐이에요')
    opts = Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.notdef_outline = True
    opts.hinting = False
    opts.desubroutinize = True
    sub = Subsetter(opts)
    sub.populate(unicodes=want)
    sub.subset(font)
    font.flavor = 'woff2'
    font.save(dst)
    size = __import__('os').path.getsize(dst)
    print(f'{dst}: {size:,} bytes, 글자 {len(want)}개 (한글 {hangul})')
    if size > MAX_BYTES:
        sys.exit(f'{size} bytes > {MAX_BYTES} (결정 A 한도)')


if __name__ == '__main__':
    main()
