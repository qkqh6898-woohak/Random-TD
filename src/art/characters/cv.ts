/**
 * Canvas 2D 그리기 도우미 (캐릭터 그림 공통). Phaser 없음 — 게임(Phaser 캔버스 텍스처)과 갤러리(DOM 캔버스)가 같은 함수로 그린다.
 *
 * 화풍 (docs/CHARACTERS.md 공통 화풍): 진한 갈색 외곽선, 부드러운 셀 셰이딩(오른쪽 아래 그늘 + 왼쪽 위 반짝임), 밝은 채도.
 * 좌표는 '그림 단위'(타워 기준 발밑 원점, 머리 반지름 약 60). 호출하는 쪽이 해상도만큼 scale 해 둔다.
 */

/** 그리기 대상: 브라우저 CanvasRenderingContext2D와 같은 부분집합 (테스트는 기록용 가짜를 넣는다) */
export type Ctx = CanvasRenderingContext2D;

export const OUTLINE = '#3B2416';
export const LW = 5;

/** '#RRGGBB' → [r, g, b] */
export function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [128, 128, 128];
  const n = Number.parseInt(m[1] as string, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** 두 색 섞기 (t: 0 = a, 1 = b) */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** 밝게(+) / 어둡게(−), −1~1 */
export function shade(hex: string, amt: number): string {
  return amt >= 0 ? mix(hex, '#FFFFFF', amt) : mix(hex, '#000000', -amt);
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** 밝기 (0~1) */
export function luma(hex: string): number {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export type PathFn = (c: Ctx) => void;

export interface FillOpts {
  /** 외곽선 굵기 (0 = 없음) */
  lw?: number;
  stroke?: string;
  /** 셀 셰이딩 (그늘 + 반짝임) */
  cel?: boolean;
  /** 그늘 방향 거리 (그림 단위) */
  celOffset?: number;
  alpha?: number;
}

/**
 * 경로를 채우고(선택: 셀 셰이딩) 외곽선을 그린다.
 * 셀 셰이딩: 경로 안을 그늘 색으로 칠한 뒤, 왼쪽 위로 옮긴 같은 경로를 본래 색으로 덮어 오른쪽 아래에 그늘 초승달이 남게 한다.
 */
export function paint(c: Ctx, path: PathFn, fill: string | CanvasGradient | null, opts: FillOpts = {}): void {
  const lw = opts.lw ?? LW;
  c.save();
  if (opts.alpha !== undefined) c.globalAlpha *= opts.alpha;
  if (fill !== null) {
    if (opts.cel && typeof fill === 'string') {
      const k = opts.celOffset ?? 6;
      c.save();
      path(c);
      c.clip();
      c.fillStyle = shade(fill, -0.22);
      path(c);
      c.fill();
      c.translate(-k, -k * 1.1);
      c.fillStyle = fill;
      path(c);
      c.fill();
      c.restore();
    } else {
      c.fillStyle = fill;
      path(c);
      c.fill();
    }
  }
  if (lw > 0) {
    c.lineWidth = lw;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.strokeStyle = opts.stroke ?? OUTLINE;
    path(c);
    c.stroke();
  }
  c.restore();
}

export const P = {
  circle:
    (x: number, y: number, r: number): PathFn =>
    (c) => {
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
    },
  ellipse:
    (x: number, y: number, rx: number, ry: number, rot = 0): PathFn =>
    (c) => {
      c.beginPath();
      c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
    },
  rrect:
    (x: number, y: number, w: number, h: number, r: number): PathFn =>
    (c) => {
      const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
      c.beginPath();
      c.moveTo(x + rr, y);
      c.lineTo(x + w - rr, y);
      c.quadraticCurveTo(x + w, y, x + w, y + rr);
      c.lineTo(x + w, y + h - rr);
      c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
      c.lineTo(x + rr, y + h);
      c.quadraticCurveTo(x, y + h, x, y + h - rr);
      c.lineTo(x, y + rr);
      c.quadraticCurveTo(x, y, x + rr, y);
      c.closePath();
    },
  /** 꺾은선 다각형 */
  poly:
    (pts: readonly number[], close = true): PathFn =>
    (c) => {
      c.beginPath();
      c.moveTo(pts[0] ?? 0, pts[1] ?? 0);
      for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i] ?? 0, pts[i + 1] ?? 0);
      if (close) c.closePath();
    },
  /** 점들을 부드럽게 잇는 닫힌 곡선 (중점 2차 곡선) */
  blob:
    (pts: readonly number[]): PathFn =>
    (c) => {
      const n = pts.length / 2;
      const px = (i: number): number => pts[((i + n) % n) * 2] ?? 0;
      const py = (i: number): number => pts[((i + n) % n) * 2 + 1] ?? 0;
      c.beginPath();
      c.moveTo((px(-1) + px(0)) / 2, (py(-1) + py(0)) / 2);
      for (let i = 0; i < n; i++) c.quadraticCurveTo(px(i), py(i), (px(i) + px(i + 1)) / 2, (py(i) + py(i + 1)) / 2);
      c.closePath();
    },
  /** 열린 부드러운 곡선 (선 그리기용) */
  curve:
    (pts: readonly number[]): PathFn =>
    (c) => {
      const n = pts.length / 2;
      c.beginPath();
      c.moveTo(pts[0] ?? 0, pts[1] ?? 0);
      if (n === 2) {
        c.lineTo(pts[2] ?? 0, pts[3] ?? 0);
        return;
      }
      for (let i = 1; i < n - 1; i++) {
        const x = pts[i * 2] ?? 0;
        const y = pts[i * 2 + 1] ?? 0;
        const nx = pts[i * 2 + 2] ?? 0;
        const ny = pts[i * 2 + 3] ?? 0;
        if (i === n - 2) c.quadraticCurveTo(x, y, nx, ny);
        else c.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
      }
    },
  /** 별 (points 꼭짓점) */
  star:
    (x: number, y: number, r: number, points = 5, inner = 0.45, rot = -Math.PI / 2): PathFn =>
    (c) => {
      c.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const a = rot + (i * Math.PI) / points;
        const rr = i % 2 === 0 ? r : r * inner;
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
    },
  /** 위쪽 반원(돔) */
  dome:
    (x: number, y: number, r: number, squash = 1): PathFn =>
    (c) => {
      c.beginPath();
      c.ellipse(x, y, r, r * squash, 0, Math.PI, 0);
      c.closePath();
    },
};

export function circle(c: Ctx, x: number, y: number, r: number, fill: string | null, opts: FillOpts = {}): void {
  paint(c, P.circle(x, y, r), fill, opts);
}

export function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, fill: string | null, opts: FillOpts = {}, rot = 0): void {
  paint(c, P.ellipse(x, y, rx, ry, rot), fill, opts);
}

export function rrect(c: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string | null, opts: FillOpts = {}): void {
  paint(c, P.rrect(x, y, w, h, r), fill, opts);
}

export function poly(c: Ctx, pts: readonly number[], fill: string | null, opts: FillOpts = {}): void {
  paint(c, P.poly(pts), fill, opts);
}

export function blob(c: Ctx, pts: readonly number[], fill: string | null, opts: FillOpts = {}): void {
  paint(c, P.blob(pts), fill, opts);
}

export function star(c: Ctx, x: number, y: number, r: number, fill: string, opts: FillOpts = {}, points = 5, inner = 0.45): void {
  paint(c, P.star(x, y, r, points, inner), fill, { lw: 3, ...opts });
}

/** 선 (외곽선 위에 색 선을 겹쳐 굵은 테두리 선) */
export function line(c: Ctx, pts: readonly number[], color: string, w: number, outline = true): void {
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  if (outline) {
    c.strokeStyle = OUTLINE;
    c.lineWidth = w + 5;
    P.curve(pts)(c);
    c.stroke();
  }
  c.strokeStyle = color;
  c.lineWidth = w;
  P.curve(pts)(c);
  c.stroke();
  c.restore();
}

/** 가는 선 (외곽선 없음) */
export function stroke(c: Ctx, pts: readonly number[], color: string, w: number, alpha = 1): void {
  c.save();
  c.globalAlpha *= alpha;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = color;
  c.lineWidth = w;
  P.curve(pts)(c);
  c.stroke();
  c.restore();
}

/** 부드러운 빛 (방사형 그라데이션) */
export function glow(c: Ctx, x: number, y: number, r: number, color: string, alpha = 0.6): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.45, rgba(color, alpha * 0.45));
  g.addColorStop(1, rgba(color, 0));
  c.save();
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** 작은 반짝임 (네 갈래 별) */
export function sparkle(c: Ctx, x: number, y: number, r: number, color = '#FFFFFF', alpha = 1): void {
  c.save();
  c.globalAlpha *= alpha;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y);
  c.quadraticCurveTo(x, y, x, y - r);
  c.fill();
  c.restore();
}

/** 반짝이는 하이라이트 점 (왼쪽 위) */
export function shine(c: Ctx, x: number, y: number, rx: number, ry: number, alpha = 0.55): void {
  c.save();
  c.globalAlpha *= alpha;
  c.fillStyle = '#FFFFFF';
  c.beginPath();
  c.ellipse(x, y, rx, ry, -0.5, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** 무지개 그라데이션 (가로) */
export function rainbow(c: Ctx, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  const cols = ['#FF5E5E', '#FFB547', '#FFE66B', '#6BE38A', '#5EC8FF', '#9B7BFF'];
  cols.forEach((col, i) => g.addColorStop(i / (cols.length - 1), col));
  return g;
}

/** 번개 지그재그 */
export function bolt(c: Ctx, x: number, y: number, len: number, color = '#FFF27A', w = 4, ang = Math.PI / 2): void {
  const pts: number[] = [x, y];
  const segs = 4;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  for (let i = 1; i <= segs; i++) {
    const t = (i / segs) * len;
    const off = i === segs ? 0 : (i % 2 === 0 ? -1 : 1) * len * 0.16;
    pts.push(x + dx * t - dy * off, y + dy * t + dx * off);
  }
  c.save();
  c.lineJoin = 'miter';
  c.lineCap = 'round';
  c.strokeStyle = OUTLINE;
  c.lineWidth = w + 4;
  P.poly(pts, false)(c);
  c.stroke();
  c.strokeStyle = color;
  c.lineWidth = w;
  P.poly(pts, false)(c);
  c.stroke();
  c.restore();
}

/** 금화 (옆에서 본 동그라미) */
export function coin(c: Ctx, x: number, y: number, r: number, color = '#F5C518'): void {
  circle(c, x, y, r, color, { lw: Math.max(2, r * 0.3) });
  circle(c, x, y, r * 0.55, null, { lw: Math.max(1.5, r * 0.18), stroke: shade(color, -0.35) });
  shine(c, x - r * 0.35, y - r * 0.35, r * 0.25, r * 0.15, 0.8);
}

/** 네잎클로버 */
export function clover(c: Ctx, x: number, y: number, r: number, color = '#4CC26A'): void {
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    circle(c, x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.52, color, { lw: 2.5 });
  }
  circle(c, x, y, r * 0.18, shade(color, -0.3), { lw: 0 });
  stroke(c, [x, y, x + r * 0.3, y + r * 1.1], OUTLINE, 3);
}

/** 해골 (작은 장식) */
export function skullIcon(c: Ctx, x: number, y: number, r: number, color = '#EDE6D6'): void {
  circle(c, x, y, r, color, { lw: Math.max(2, r * 0.22), cel: true, celOffset: r * 0.2 });
  rrect(c, x - r * 0.55, y + r * 0.55, r * 1.1, r * 0.6, r * 0.2, color, { lw: Math.max(2, r * 0.18) });
  circle(c, x - r * 0.38, y + r * 0.05, r * 0.26, '#2B2340', { lw: 0 });
  circle(c, x + r * 0.38, y + r * 0.05, r * 0.26, '#2B2340', { lw: 0 });
  poly(c, [x, y + r * 0.32, x - r * 0.12, y + r * 0.55, x + r * 0.12, y + r * 0.55], '#2B2340', { lw: 0 });
}

/** 음표 */
export function note(c: Ctx, x: number, y: number, r: number, color = '#FFFFFF'): void {
  ellipse(c, x, y, r * 0.55, r * 0.42, color, { lw: 2 }, -0.4);
  line(c, [x + r * 0.45, y - r * 0.1, x + r * 0.45, y - r * 1.4], color, Math.max(2, r * 0.18), true);
  line(c, [x + r * 0.45, y - r * 1.4, x + r * 1.05, y - r * 1.0], color, Math.max(2, r * 0.18), true);
}

/** 눈송이 */
export function snowflake(c: Ctx, x: number, y: number, r: number, color = '#E8FAFF'): void {
  c.save();
  c.lineCap = 'round';
  for (const [w, col] of [
    [r * 0.42, OUTLINE],
    [r * 0.22, color],
  ] as const) {
    c.strokeStyle = col;
    c.lineWidth = w;
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      c.beginPath();
      c.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
      c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      c.stroke();
    }
  }
  c.restore();
}

/** 불꽃 (위로 뾰족) */
export function flame(c: Ctx, x: number, y: number, r: number, color = '#FF8A2F', inner = '#FFE27A'): void {
  blob(c, [x, y - r * 1.6, x + r * 0.8, y - r * 0.2, x + r * 0.6, y + r * 0.7, x - r * 0.6, y + r * 0.7, x - r * 0.8, y - r * 0.2], color, { lw: Math.max(2, r * 0.25) });
  blob(c, [x, y - r * 0.7, x + r * 0.4, y + r * 0.1, x, y + r * 0.55, x - r * 0.4, y + r * 0.1], inner, { lw: 0 });
}

/** 각도(rad) 회전한 좌표계에서 그리기 */
export function rotated(c: Ctx, x: number, y: number, ang: number, draw: () => void): void {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  draw();
  c.restore();
}

/** 0~1 결정적 의사 난수 (그림 무늬용, 같은 seed면 같은 그림) */
export function prng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 문자열 → 32비트 해시 (그림 무늬 시드) */
export function strHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
