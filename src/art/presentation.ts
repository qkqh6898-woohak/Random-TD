/**
 * G-2 캐릭터 겉모습 통일 (사용자 요청 '현재 캐릭터들도 전반적으로 디자인 수정'): 타워 id·능력치·그림 원본은 그대로 두고,
 * 모든 캐릭터에 같은 문법의 **등급 받침대 · 땅 그림자 · 종족 문장 배지 · 별 배지**를 2D 캔버스로 그린다 (Phaser 없음).
 *
 * - Phaser 쪽(art/towers.ts)은 이 함수로 텍스처를 한 번 굽고, DOM 갤러리(domArt.drawPedestal2D)도 같은 함수를 쓴다 → 게임과 갤러리가 같은 받침대.
 * - 받침대 경계는 예전 그대로(chibiBounds PEDESTAL_BOUNDS: −98~98 × −26~44) → 탭 판정·정보 패널 배치·머리 높이 계산이 그대로.
 * - 등급 문법 (ART.md 1.1 색 그대로): 노말 돌판 · 레어 사파이어 징 4개 · 유니크 보라 점 고리 · 히어로 금별 징 5개 ·
 *   레전드 금테 + 뒤쪽 왕관 뿔 · 신 무지개 면 + 구름 · 히든(UI 이름 '리미티드') 검정 + 금테 + 일곱 종족 색 룬.
 *   유니크 이상은 받침대 둘레에 등급 색 빛 고리.
 * 색·모양은 화면 표현 상수라 코드에 둔다.
 */
import type { Grade } from '../data/load';
import { GRADE_COLORS } from './palette';

type C2D = CanvasRenderingContext2D;

const INK = '#2a170c';
const GOLD = '#e8b64a';
const GOLD_HI = '#ffe7a3';

/** 등급별 받침대 문법 (단위 테스트가 등급마다 다른지 본다) */
export interface GradeStyle {
  /** 윗면 색 */
  top: string;
  /** 옆면(두께) 색 */
  side: string;
  /** 테두리 색 */
  rim: string;
  /** 빛 고리 색 (없으면 null) */
  glow: string | null;
  /** 장식 종류 */
  deco: 'cracks' | 'studs' | 'dots' | 'starStuds' | 'crown' | 'clouds' | 'runes';
  /** 별 배지 별 수 (신·리미티드는 1 + 특별 색) */
  stars: number;
}

export const GRADE_STYLE: Readonly<Record<Grade, GradeStyle>> = {
  normal: { top: '#a7adb3', side: '#62676d', rim: INK, glow: null, deco: 'cracks', stars: 1 },
  rare: { top: '#4f97ff', side: '#1f4d9c', rim: INK, glow: null, deco: 'studs', stars: 2 },
  unique: { top: '#a96bdc', side: '#5a2d87', rim: INK, glow: '#c99bff', deco: 'dots', stars: 3 },
  hero: { top: '#f5a62a', side: '#9a5a0a', rim: '#5a3208', glow: '#ffd27a', deco: 'starStuds', stars: 4 },
  legend: { top: '#e9574a', side: '#8c1f17', rim: GOLD, glow: '#ff8a6a', deco: 'crown', stars: 5 },
  god: { top: '#ffffff', side: '#b9a3ff', rim: GOLD_HI, glow: '#ffffff', deco: 'clouds', stars: 1 },
  hidden: { top: '#1e1e2a', side: '#0b0b12', rim: '#f1c40f', glow: '#f1c40f', deco: 'runes', stars: 1 },
};

/** 리미티드(hidden) 받침대 룬 색: 일곱 종족 (towers.json factions 색, ART.md 1.2 '7종족 문양 원판') */
export const RUNE_COLORS = ['#6B7A3A', '#2E5AAC', '#A0522D', '#3A9D5D', '#5B3A8C', '#B23A2E', '#E58FC4'] as const;

function ellipse(c: C2D, x: number, y: number, rx: number, ry: number): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

function star(c: C2D, cx: number, cy: number, r: number, inner = 0.45): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * inner;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
}

function rainbow(c: C2D, x0: number, x1: number): CanvasGradient {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  ['#ff6b6b', '#ffb347', '#ffe66d', '#7ee081', '#6ec6ff', '#a78bfa', '#ff8ad8'].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
  return g;
}

/** 받침대 윗면 위 점 자리 (윗면 타원 둘레, 각도 a) */
function rimPoint(a: number, k = 0.82): [number, number] {
  return [Math.cos(a) * 85 * k, Math.sin(a) * 23 * k];
}

/**
 * 등급 받침대 + 땅 그림자. 원점 = 발밑 중심, 그림은 PEDESTAL_BOUNDS(−98~98 × −26~44) 안.
 */
export function drawGradePedestal(c: C2D, grade: Grade): void {
  const s = GRADE_STYLE[grade];
  c.save();
  // 부드러운 땅 그림자 (가운데 진하고 가장자리로 사라짐)
  c.save();
  c.translate(0, 17);
  c.scale(1, 0.27);
  const sh = c.createRadialGradient(0, 0, 10, 0, 0, 97);
  sh.addColorStop(0, 'rgba(0,0,0,0.5)');
  sh.addColorStop(0.7, 'rgba(0,0,0,0.25)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sh;
  ellipse(c, 0, 0, 97, 97);
  c.fill();
  c.restore();
  // 빛 고리 (유니크 이상)
  if (s.glow) {
    c.save();
    c.translate(0, 4);
    c.scale(1, 0.3);
    const gl = c.createRadialGradient(0, 0, 60, 0, 0, 97);
    gl.addColorStop(0, `${s.glow}00`);
    gl.addColorStop(0.55, `${s.glow}88`);
    gl.addColorStop(1, `${s.glow}00`);
    c.fillStyle = gl;
    ellipse(c, 0, 0, 97, 97);
    c.fill();
    c.restore();
  }
  // 옆면 (두께)
  c.fillStyle = s.side;
  ellipse(c, 0, 9, 85, 25);
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = INK;
  c.stroke();
  // 윗면: 가운데 밝은 빛
  const top = grade === 'god' ? rainbow(c, -85, 85) : s.top;
  c.fillStyle = top;
  ellipse(c, 0, 0, 85, 23);
  c.fill();
  c.save();
  ellipse(c, 0, 0, 85, 23);
  c.clip();
  const hl = c.createRadialGradient(-18, -8, 4, 0, 0, 90);
  hl.addColorStop(0, 'rgba(255,255,255,0.55)');
  hl.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  hl.addColorStop(1, 'rgba(0,0,0,0.28)');
  c.fillStyle = hl;
  c.fillRect(-90, -30, 180, 60);
  c.restore();
  // 윗면 가장자리 밝은 테 (캐릭터 발에 가운데가 가려도 등급 색 고리가 읽히게)
  c.lineWidth = 3.5;
  c.strokeStyle = grade === 'hidden' ? '#ffe27a' : grade === 'god' ? '#ffffff' : 'rgba(255,255,255,0.65)';
  ellipse(c, 0, -0.5, 80, 20.5);
  c.stroke();
  // 안쪽 고리
  c.lineWidth = 2;
  c.strokeStyle = grade === 'hidden' ? GOLD : 'rgba(255,255,255,0.55)';
  ellipse(c, 0, 0, 62, 16);
  c.stroke();
  // 등급 장식
  switch (s.deco) {
    case 'cracks':
      c.strokeStyle = 'rgba(60,60,66,0.6)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-50, -4);
      c.lineTo(-38, 2);
      c.lineTo(-30, -1);
      c.moveTo(34, 6);
      c.lineTo(46, 2);
      c.lineTo(56, 7);
      c.stroke();
      break;
    case 'studs':
      for (const a of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
        const [x, y] = rimPoint(a, 0.86);
        c.fillStyle = '#cfe3ff';
        ellipse(c, x, y, 7, 4.5);
        c.fill();
        c.strokeStyle = INK;
        c.lineWidth = 1.6;
        c.stroke();
      }
      break;
    case 'dots':
      for (let i = 0; i < 8; i++) {
        const [x, y] = rimPoint((i * Math.PI) / 4 + Math.PI / 8, 0.86);
        c.fillStyle = '#f0dcff';
        ellipse(c, x, y, 4.5, 3);
        c.fill();
      }
      break;
    case 'starStuds':
      for (let i = 0; i < 5; i++) {
        const [x, y] = rimPoint(Math.PI * 0.1 + (i * Math.PI * 2) / 5, 0.86);
        star(c, x, y, 7);
        c.fillStyle = GOLD_HI;
        c.fill();
        c.strokeStyle = INK;
        c.lineWidth = 1.4;
        c.stroke();
      }
      break;
    case 'crown':
      // 뒤쪽 왕관 띠 (윗면 뒤쪽 안에서 뿔 끝이 가장자리까지, 경계 −26 안)
      for (const x of [-46, -23, 0, 23, 46]) {
        const hgt = x === 0 ? 12 : Math.abs(x) > 30 ? 8 : 10;
        const by = -Math.sqrt(Math.max(0, 1 - (x * x) / (85 * 85))) * 23 + hgt;
        c.beginPath();
        c.moveTo(x - 7, by);
        c.lineTo(x, by - hgt);
        c.lineTo(x + 7, by);
        c.closePath();
        c.fillStyle = GOLD;
        c.fill();
        c.strokeStyle = INK;
        c.lineWidth = 1.6;
        c.stroke();
      }
      break;
    case 'clouds':
      for (const [x, y, r] of [
        [-74, 12, 13],
        [-58, 18, 11],
        [60, 18, 12],
        [76, 11, 12],
        [-8, 30, 10],
        [10, 31, 9],
      ] as const) {
        c.fillStyle = '#ffffff';
        ellipse(c, x, y, r, r * 0.72);
        c.fill();
        c.strokeStyle = 'rgba(160,140,220,0.8)';
        c.lineWidth = 1.5;
        c.stroke();
      }
      break;
    case 'runes':
      RUNE_COLORS.forEach((col, i) => {
        const [x, y] = rimPoint(-Math.PI / 2 + (i * Math.PI * 2) / 7, 0.86);
        c.fillStyle = col;
        ellipse(c, x, y, 5.5, 3.6);
        c.fill();
        c.strokeStyle = GOLD;
        c.lineWidth = 1.4;
        c.stroke();
      });
      break;
  }
  // 바깥 테두리 (레전드 이상은 금)
  c.lineWidth = grade === 'legend' || grade === 'god' || grade === 'hidden' ? 4.5 : 4;
  c.strokeStyle = grade === 'god' ? GOLD_HI : s.rim === INK ? INK : s.rim;
  ellipse(c, 0, 0, 85, 23);
  c.stroke();
  if (s.rim !== INK) {
    c.lineWidth = 1.5;
    c.strokeStyle = INK;
    ellipse(c, 0, 0, 87.5, 25.2);
    c.stroke();
  }
  c.restore();
}

/** 별 배지 크기 (그림 단위) */
export const STAR_BADGE = { w: 120, h: 30 } as const;

/**
 * 별 배지: 어두운 알약 위 등급 별 (노말 1 ~ 레전드 5, 신 = 무지개 별 하나, 리미티드 = 검정 알약 + 금별 하나). 원점 = 가운데.
 */
export function drawStarBadge(c: C2D, grade: Grade): void {
  const s = GRADE_STYLE[grade];
  const n = s.stars;
  const r = 10.5;
  const gap = 21;
  const w = Math.max(34, n * gap + 12);
  const h = STAR_BADGE.h - 4;
  c.save();
  c.beginPath();
  c.roundRect(-w / 2, -h / 2, w, h, h / 2);
  c.fillStyle = grade === 'hidden' ? '#0b0b12' : 'rgba(23,15,10,0.82)';
  c.fill();
  c.lineWidth = 2.4;
  c.strokeStyle = grade === 'hidden' || grade === 'god' || grade === 'legend' ? GOLD : GRADE_COLORS[grade];
  c.stroke();
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * gap;
    star(c, x, 1, r);
    c.fillStyle = grade === 'god' ? rainbow(c, x - r, x + r) : '#ffd84a';
    c.fill();
    c.lineWidth = 1.8;
    c.strokeStyle = INK;
    c.stroke();
    star(c, x - 2, -1.5, r * 0.4);
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fill();
  }
  c.restore();
}

/** 종족 문장 모양 */
export type FactionGlyph = 'crosshair' | 'shield' | 'hammer' | 'leaf' | 'moon' | 'tusk' | 'flower' | 'sun' | 'sevenStar';

export const FACTION_GLYPH: Readonly<Record<string, FactionGlyph>> = {
  modern: 'crosshair',
  kingdom: 'shield',
  dwarf: 'hammer',
  elf: 'leaf',
  darkelf: 'moon',
  orc: 'tusk',
  fairy: 'flower',
  ancient: 'sun',
  alliance: 'sevenStar',
};

/** 문장 배지 지름 (그림 단위) */
export const EMBLEM_SIZE = 40;

/** 종족 문장 배지: 금테 동그라미 + 종족 색 + 흰 문양. 원점 = 가운데, 반지름 EMBLEM_SIZE/2. */
export function drawFactionEmblem(c: C2D, faction: string, color: string): void {
  const R = EMBLEM_SIZE / 2 - 1.5;
  const glyph = FACTION_GLYPH[faction] ?? 'shield';
  c.save();
  c.beginPath();
  c.arc(0, 0, R, 0, Math.PI * 2);
  c.fillStyle = faction === 'ancient' ? rainbow(c, -R, R) : color;
  c.fill();
  const shade = c.createRadialGradient(-5, -6, 2, 0, 0, R);
  shade.addColorStop(0, 'rgba(255,255,255,0.35)');
  shade.addColorStop(1, 'rgba(0,0,0,0.3)');
  c.fillStyle = shade;
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = GOLD;
  c.stroke();
  c.lineWidth = 1.2;
  c.strokeStyle = INK;
  c.beginPath();
  c.arc(0, 0, R + 1.5, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = '#fffaf0';
  c.strokeStyle = '#fffaf0';
  c.lineWidth = 2.6;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  switch (glyph) {
    case 'crosshair':
      c.beginPath();
      c.arc(0, 0, 8, 0, Math.PI * 2);
      c.moveTo(0, -13);
      c.lineTo(0, -4);
      c.moveTo(0, 13);
      c.lineTo(0, 4);
      c.moveTo(-13, 0);
      c.lineTo(-4, 0);
      c.moveTo(13, 0);
      c.lineTo(4, 0);
      c.stroke();
      break;
    case 'shield':
      c.beginPath();
      c.moveTo(0, -11);
      c.lineTo(9, -7);
      c.lineTo(8, 3);
      c.quadraticCurveTo(5, 9, 0, 12);
      c.quadraticCurveTo(-5, 9, -8, 3);
      c.lineTo(-9, -7);
      c.closePath();
      c.fill();
      break;
    case 'hammer':
      c.fillRect(-9, -10, 18, 7);
      c.fillRect(-1.8, -4, 3.6, 15);
      break;
    case 'leaf':
      c.beginPath();
      c.moveTo(-9, 10);
      c.quadraticCurveTo(-10, -9, 10, -10);
      c.quadraticCurveTo(9, 9, -9, 10);
      c.fill();
      break;
    case 'moon':
      c.beginPath();
      c.arc(0, 0, 10, Math.PI * 0.25, Math.PI * 1.75);
      c.arc(5, 0, 7.5, Math.PI * 1.6, Math.PI * 0.4, true);
      c.closePath();
      c.fill();
      break;
    case 'tusk':
      c.beginPath();
      c.moveTo(-8, 10);
      c.quadraticCurveTo(-11, -4, -2, -11);
      c.quadraticCurveTo(-5, 0, -2, 10);
      c.closePath();
      c.moveTo(8, 10);
      c.quadraticCurveTo(11, -4, 2, -11);
      c.quadraticCurveTo(5, 0, 2, 10);
      c.closePath();
      c.fill();
      break;
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
        c.beginPath();
        c.ellipse(Math.cos(a) * 6, Math.sin(a) * 6, 5, 3.6, a, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#ffd84a';
      c.beginPath();
      c.arc(0, 0, 3.4, 0, Math.PI * 2);
      c.fill();
      break;
    case 'sun':
      c.fillStyle = INK;
      c.strokeStyle = INK;
      c.beginPath();
      c.arc(0, 0, 5.5, 0, Math.PI * 2);
      c.fill();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        c.beginPath();
        c.moveTo(Math.cos(a) * 8, Math.sin(a) * 8);
        c.lineTo(Math.cos(a) * 12, Math.sin(a) * 12);
        c.stroke();
      }
      break;
    case 'sevenStar':
      c.fillStyle = GOLD_HI;
      c.beginPath();
      for (let i = 0; i < 14; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 7;
        const rr = i % 2 === 0 ? 12 : 5.5;
        if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath();
      c.fill();
      break;
  }
  c.restore();
}
