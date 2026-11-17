/**
 * G-2 테두리 테마 「금테 성채」 (사용자 요청 '게임 테두리 테마 업데이트'): 따뜻한 호두나무·돌 판 + 금테 + 작은 보석.
 *
 * - 색은 CSS 변수(`src/ui/theme.css` 맨 위)로, 장식(모서리 금장식·보석·금줄·성채 문장·소환문 아이콘)은 여기서 **코드로 그린 SVG**를
 *   data URI로 만들어 `:root`의 CSS 변수(`--orn-*`)에 넣는다 → 바깥 그림 없음(완전 오프라인), 글자는 DOM 그대로라 또렷하다.
 * - `applyTheme()`이 `<html data-theme="gilded">`를 붙인다. theme.css 규칙은 모두 `:where([data-theme='gilded'])` 아래라
 *   원래 styles.css 규칙과 우선순위가 같고(뒤에 와서 이김) 더 구체적인 상태 규칙(.is-on·.is-off·.btn-primary …)은 그대로 이긴다.
 * - 순수 함수(문자열)만 → 단위 테스트(tests/unit/g2.test.ts)가 SVG 모양·바깥 주소 없음·대비를 확인한다.
 */

/** 테마 이름 (data-theme 값) */
export const THEME_NAME = 'gilded';

/** 테마 색 (theme.css 변수와 같은 값 — 대비 검사·캔버스 그림이 같이 쓴다) */
export const THEME = {
  woodHi: '#5a3822',
  wood: '#3d2416',
  woodLo: '#24150c',
  ink: '#170f0a',
  gold: '#e8b64a',
  goldHi: '#ffe7a3',
  goldLo: '#8a5a1c',
  ruby: '#d6334a',
  sapphire: '#3d7bfd',
  emerald: '#2fae6a',
  amethyst: '#9b59d0',
  text: '#f7f3e9',
  textDim: '#d9cfbb',
} as const;

const svg = (w: number, h: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;

/** SVG 문자열 → CSS `url("data:…")` 값 */
export function svgUrl(markup: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(markup)}")`;
}

/** 금 그라데이션 정의 (id 겹침 방지용 접두사) */
function goldDefs(id: string): string {
  return (
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${THEME.goldHi}"/><stop offset="0.45" stop-color="${THEME.gold}"/><stop offset="1" stop-color="${THEME.goldLo}"/>` +
    `</linearGradient></defs>`
  );
}

/** 깎은 보석 (마름모 + 면 + 반짝임). cx, cy 중심, r 반지름 */
function gemPath(cx: number, cy: number, r: number, color: string): string {
  const p = (dx: number, dy: number): string => `${(cx + dx).toFixed(2)},${(cy + dy).toFixed(2)}`;
  return (
    `<polygon points="${p(0, -r)} ${p(r, 0)} ${p(0, r)} ${p(-r, 0)}" fill="${color}" stroke="${THEME.ink}" stroke-width="${(r * 0.22).toFixed(2)}" stroke-linejoin="round"/>` +
    `<polygon points="${p(0, -r)} ${p(r * 0.5, -r * 0.1)} ${p(0, r * 0.2)} ${p(-r * 0.5, -r * 0.1)}" fill="#ffffff" fill-opacity="0.32"/>` +
    `<polygon points="${p(0, r)} ${p(r, 0)} ${p(0, r * 0.2)}" fill="#000000" fill-opacity="0.22"/>` +
    `<circle cx="${(cx - r * 0.3).toFixed(2)}" cy="${(cy - r * 0.42).toFixed(2)}" r="${(r * 0.16).toFixed(2)}" fill="#ffffff" fill-opacity="0.9"/>`
  );
}

/** 보석 하나 (정사각 24) */
export function gemSvg(color: string = THEME.ruby): string {
  return svg(24, 24, `<circle cx="12" cy="12" r="11" fill="${THEME.ink}" fill-opacity="0.55"/>` + `<circle cx="12" cy="12" r="10" fill="none" stroke="${THEME.gold}" stroke-width="2"/>` + gemPath(12, 12, 6.6, color));
}

/**
 * 모서리 금장식 (정사각 48, 왼쪽 위 모서리 기준): 두 줄 금테가 꺾이는 자리에 덩굴 소용돌이 + 작은 보석.
 * rot = 0(왼쪽 위)·90(오른쪽 위)·180(오른쪽 아래)·270(왼쪽 아래)
 */
export function cornerSvg(rot: 0 | 90 | 180 | 270 = 0, gem: string = THEME.ruby): string {
  const id = `g${rot}`;
  const body =
    goldDefs(id) +
    `<g transform="rotate(${rot} 24 24)">` +
    // 바깥 금테 두 줄 (모서리에서 꺾임)
    `<path d="M3 46 V9 Q3 3 9 3 H46" fill="none" stroke="${THEME.ink}" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M3 46 V9 Q3 3 9 3 H46" fill="none" stroke="url(#${id})" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M9 40 V13 Q9 9 13 9 H40" fill="none" stroke="${THEME.gold}" stroke-opacity="0.75" stroke-width="1.4" stroke-linecap="round"/>` +
    // 덩굴 소용돌이 (가로·세로로 하나씩)
    `<path d="M14 9 C22 9 26 15 22 19 C19 22 15 19 17 16" fill="none" stroke="url(#${id})" stroke-width="2.2" stroke-linecap="round"/>` +
    `<path d="M9 14 C9 22 15 26 19 22 C22 19 19 15 16 17" fill="none" stroke="url(#${id})" stroke-width="2.2" stroke-linecap="round"/>` +
    // 잎 두 장
    `<path d="M26 7 q5 -4 9 0 q-5 4 -9 0z" fill="url(#${id})" stroke="${THEME.ink}" stroke-width="0.8"/>` +
    `<path d="M7 26 q-4 5 0 9 q4 -5 0 -9z" fill="url(#${id})" stroke="${THEME.ink}" stroke-width="0.8"/>` +
    gemPath(9, 9, 5.2, gem) +
    `</g>`;
  return svg(48, 48, body);
}

/** 가로 금줄 (반복 무늬, 40×8): 금 막대 + 작은 구슬 */
export function trimSvg(): string {
  return svg(
    40,
    8,
    goldDefs('t') +
      `<rect x="0" y="2.5" width="40" height="3" fill="url(#t)"/>` +
      `<rect x="0" y="2" width="40" height="0.8" fill="${THEME.ink}" fill-opacity="0.6"/>` +
      `<rect x="0" y="5.4" width="40" height="0.8" fill="${THEME.ink}" fill-opacity="0.6"/>` +
      `<circle cx="20" cy="4" r="2.6" fill="url(#t)" stroke="${THEME.ink}" stroke-width="0.8"/>`,
  );
}

/** 넓은 화면 양옆 띠: 어두운 호두나무 위 아주 옅은 마름모 격자 + 작은 금 점 (60×60 반복) */
export function latticeSvg(): string {
  return svg(
    60,
    60,
    `<rect width="60" height="60" fill="${THEME.woodLo}"/>` +
      `<path d="M30 0 L60 30 L30 60 L0 30 Z" fill="none" stroke="${THEME.gold}" stroke-opacity="0.13" stroke-width="1.2"/>` +
      `<path d="M30 8 L52 30 L30 52 L8 30 Z" fill="${THEME.wood}" fill-opacity="0.5"/>` +
      `<circle cx="30" cy="30" r="2" fill="${THEME.gold}" fill-opacity="0.35"/>` +
      `<circle cx="0" cy="0" r="1.6" fill="${THEME.gold}" fill-opacity="0.3"/><circle cx="60" cy="0" r="1.6" fill="${THEME.gold}" fill-opacity="0.3"/>` +
      `<circle cx="0" cy="60" r="1.6" fill="${THEME.gold}" fill-opacity="0.3"/><circle cx="60" cy="60" r="1.6" fill="${THEME.gold}" fill-opacity="0.3"/>`,
  );
}

/**
 * 타이틀 문장 (주사위 장식 대신, 64×72): 금테 방패 + 가운데 SD 캐릭터 얼굴 실루엣(투구·검 / 고깔모자·지팡이) + 위에 별.
 * kind 'knight' = 왼쪽(검·투구, 루비), 'mage' = 오른쪽(지팡이·고깔, 사파이어).
 */
export function crestSvg(kind: 'knight' | 'mage'): string {
  const id = `c${kind}`;
  const field = kind === 'knight' ? THEME.ruby : THEME.sapphire;
  const shield = 'M32 6 L58 14 V36 C58 52 46 62 32 68 C18 62 6 52 6 36 V14 Z';
  const face =
    `<circle cx="32" cy="40" r="12" fill="#f6d7b0" stroke="${THEME.ink}" stroke-width="2"/>` +
    `<ellipse cx="27.5" cy="41" rx="1.8" ry="2.6" fill="${THEME.ink}"/><ellipse cx="36.5" cy="41" rx="1.8" ry="2.6" fill="${THEME.ink}"/>` +
    `<ellipse cx="24" cy="46" rx="2.4" ry="1.3" fill="#ff8a8a" fill-opacity="0.6"/><ellipse cx="40" cy="46" rx="2.4" ry="1.3" fill="#ff8a8a" fill-opacity="0.6"/>`;
  const hat =
    kind === 'knight'
      ? // 투구 + 깃털 + 뒤로 비스듬한 검
        `<path d="M16 58 L48 24" stroke="${THEME.ink}" stroke-width="5" stroke-linecap="round"/><path d="M16 58 L48 24" stroke="#dfe6ee" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M20 50 L26 56" stroke="url(#${id})" stroke-width="4" stroke-linecap="round"/>` +
        face +
        `<path d="M19 38 C19 26 45 26 45 38 L45 36 C45 30 19 30 19 36 Z" fill="#c9d2dc" stroke="${THEME.ink}" stroke-width="2"/>` +
        `<path d="M19 38 C19 25 45 25 45 38 Z" fill="#b7c2cf" stroke="${THEME.ink}" stroke-width="2"/>` +
        `<path d="M32 26 C36 18 42 18 44 22 C39 22 36 24 33 27 Z" fill="${THEME.ruby}" stroke="${THEME.ink}" stroke-width="1.4"/>`
      : // 고깔모자 + 별 지팡이
        `<path d="M48 60 L48 26" stroke="${THEME.ink}" stroke-width="5" stroke-linecap="round"/><path d="M48 60 L48 26" stroke="#8b5a2b" stroke-width="3" stroke-linecap="round"/>` +
        `<circle cx="48" cy="24" r="4.5" fill="#9be7ff" stroke="${THEME.ink}" stroke-width="1.6"/>` +
        face +
        `<path d="M17 36 L33 12 L47 36 Z" fill="#6a3fc8" stroke="${THEME.ink}" stroke-width="2" stroke-linejoin="round"/>` +
        `<path d="M15 36 Q32 30 49 36 Q32 40 15 36 Z" fill="#7d52d8" stroke="${THEME.ink}" stroke-width="2"/>` +
        `<circle cx="30" cy="25" r="1.6" fill="${THEME.goldHi}"/><circle cx="36" cy="30" r="1.2" fill="${THEME.goldHi}"/>`;
  const star = (cx: number, cy: number, r: number): string => {
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="url(#${id})" stroke="${THEME.ink}" stroke-width="1.2" stroke-linejoin="round"/>`;
  };
  return svg(
    64,
    72,
    goldDefs(id) +
      `<path d="${shield}" fill="${THEME.ink}" transform="translate(0 2)" fill-opacity="0.45"/>` +
      `<path d="${shield}" fill="${field}" stroke="url(#${id})" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M32 12 L52 18 V36 C52 48 43 56 32 61 C21 56 12 48 12 36 V18 Z" fill="#000000" fill-opacity="0.18"/>` +
      hat +
      star(32, 7, 6.5),
  );
}

/**
 * 아래 띠 [소환] 아이콘 (주사위 🎲 대신, 32×32): 금빛 소환문(고리 + 룬 점) 안에서 나타나는 SD 캐릭터 실루엣(머리·어깨).
 */
export function summonIconSvg(): string {
  const runes = [0, 1, 2, 3, 4, 5]
    .map((i) => {
      const a = (i * Math.PI) / 3 + Math.PI / 6;
      return `<circle cx="${(16 + Math.cos(a) * 12.4).toFixed(2)}" cy="${(17 + Math.sin(a) * 5.6).toFixed(2)}" r="1.1" fill="#fff6c9"/>`;
    })
    .join('');
  return svg(
    32,
    32,
    `<defs><radialGradient id="sp" cx="0.5" cy="0.6" r="0.5"><stop offset="0" stop-color="#fffbe0"/><stop offset="0.6" stop-color="#ffcf5a" stop-opacity="0.85"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient></defs>` +
      `<ellipse cx="16" cy="25" rx="14" ry="5.6" fill="#5b2f12" fill-opacity="0.35"/>` +
      `<ellipse cx="16" cy="24" rx="13" ry="5" fill="none" stroke="#7a3e10" stroke-width="2.4"/>` +
      `<ellipse cx="16" cy="24" rx="13" ry="5" fill="none" stroke="#ffd25a" stroke-width="1.3"/>` +
      `<ellipse cx="16" cy="16" rx="11" ry="12" fill="url(#sp)"/>` +
      // 머리 + 어깨 실루엣 (SD: 큰 머리)
      `<path d="M7.5 25 C8 19 11 17.5 16 17.5 C21 17.5 24 19 24.5 25 Z" fill="#412513"/>` +
      `<circle cx="16" cy="11.5" r="6.4" fill="#412513"/>` +
      `<path d="M10 10.5 C10.5 5.5 21.5 5.5 22 10.5 C19 8.6 13 8.6 10 10.5 Z" fill="#7a3e10"/>` +
      `<circle cx="13.6" cy="12.4" r="1" fill="#fff6c9"/><circle cx="18.4" cy="12.4" r="1" fill="#fff6c9"/>` +
      runes,
  );
}

/** :root에 넣을 장식 변수 (이름 → CSS 값) */
export function themeVariables(): Record<string, string> {
  return {
    '--orn-corner-tl': svgUrl(cornerSvg(0, THEME.ruby)),
    '--orn-corner-tr': svgUrl(cornerSvg(90, THEME.sapphire)),
    '--orn-corner-br': svgUrl(cornerSvg(180, THEME.ruby)),
    '--orn-corner-bl': svgUrl(cornerSvg(270, THEME.sapphire)),
    '--orn-gem-ruby': svgUrl(gemSvg(THEME.ruby)),
    '--orn-gem-sapphire': svgUrl(gemSvg(THEME.sapphire)),
    '--orn-gem-emerald': svgUrl(gemSvg(THEME.emerald)),
    '--orn-trim': svgUrl(trimSvg()),
    '--orn-lattice': svgUrl(latticeSvg()),
    '--orn-crest-knight': svgUrl(crestSvg('knight')),
    '--orn-crest-mage': svgUrl(crestSvg('mage')),
    '--orn-summon': svgUrl(summonIconSvg()),
  };
}

/** 테마 적용: data-theme + 장식 변수. 문서가 없으면(테스트·워커) 아무것도 안 함. */
export function applyTheme(root: HTMLElement | null = typeof document === 'undefined' ? null : document.documentElement): void {
  if (!root) return;
  root.dataset.theme = THEME_NAME;
  for (const [k, v] of Object.entries(themeVariables())) root.style.setProperty(k, v);
}

/** WCAG 상대 휘도 대비 ('#rrggbb' 두 색) — 테마 글자 대비 검사용 */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string): number => {
    const n = Number.parseInt(hex.replace('#', ''), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
