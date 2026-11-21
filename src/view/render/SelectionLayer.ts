/**
 * 고른 타워 표시 (DEV_PLAN M3-10·M3-11, UI.md 4.3).
 *
 * - 타워를 터치하면: 사거리 원(흰색) + 같은 종류 타워 모두 강조(금색 고리). 감지 오라 타워는 👁 감지 범위 원(보라 점선)도.
 * - 지원 효과(오라) 타워(M3b): 주변 8칸(3×3)·24칸(5×5)을 초록 네모로 (자신 칸은 빼고 칠함), 그 안에서 효과를 받는 타워 발밑에 초록 고리.
 * - 평소에도(고르지 않아도) 내 오라 타워 발밑에 옅은 초록 빛이 천천히 숨 쉰다 (#79: 효과 칸 네모는 그리지 않음).
 *   정확한 효과 칸은 고른 동안 위의 진한 표시로 보여준다.
 * - 길게 눌러 끄는 동안: 놓을 칸을 색으로 미리 보여준다 (빈 칸 이동 = 초록, 교환 = 파랑, 못 놓음 = 빨강)
 *   + 그 칸에 놓았을 때의 사거리 원.
 * - 패널 [↔ 이동] 모드 (T-2): 옮길 수 있는 칸 모두 — 빈 칸 = 옅은 초록, 내 다른 타워(교환) = 옅은 파랑, 옮길 타워 = 흰 테두리.
 * - 조작 칸 (#79, buildHint.ts fieldContext): 정적 맵 텍스처에는 소환 바닥이 없다. 끄는 중·[↔ 이동]·선택·강화 중의 관련 칸과,
 *   놓을 수 없는 곳(길·막힌 칸)을 짧게 누른 뒤 잠깐(BUILD_HINT_MS, 끝에 서서히)의 배치 가능한 전체 칸을 옅은 흰 네모로 그린다 (buildable, alpha 0~1).
 * 화면 전용 (sim을 바꾸지 않는다). 몇 개 안 되는 도형이라 매 프레임 다시 그린다.
 */
import Phaser from 'phaser';
import { tileCenterPx, type MapLayout } from '../layout';
import { DROP_COLORS, type DropPreview } from '../input/press';
import type { AuraGlow } from './abilityModel';
import { FOOT_OFFSET_TILES } from './towerGeom';

/** 몹·타워보다 아래, 바닥보다 위 */
export const SELECTION_DEPTH = 900;
/** 끌기 미리 보기 칸은 타워 위에 */
export const DROP_DEPTH = 6400;
const DETECT_COLOR = 0xb36bff;
const RANGE_COLOR = 0xffffff;
const SAME_KIND_COLOR = 0xffc93c;
const AURA_COLOR = 0x5ee05e;
/** 평소 오라 빛 (잔디 위에서 보이는 옅은 박하색) */
const AURA_GLOW_COLOR = 0xd8ffcf;

export interface SelectionView {
  /** 고른 타워 칸 (없으면 null). auraRadius = 지원 효과 칸 거리 (주변 8칸 = 1, 24칸 = 2, 없거나 '전체'면 0) */
  selected: { tx: number; ty: number; range: number; detectRange: number; auraRadius?: number } | null;
  /** 고른 오라 타워의 효과를 받는 타워 칸 */
  buffed?: readonly { tx: number; ty: number }[];
  /** 평소 옅게 빛낼 오라 타워 (고른 타워 제외, abilityModel.passiveAuraGlows) */
  auras?: readonly AuraGlow[];
  /** 같은 종류 타워 칸 (고른 타워 포함) */
  sameKind: readonly { tx: number; ty: number }[];
  /** 끄는 중 놓을 칸 미리 보기 (없으면 null) */
  drop: { tx: number; ty: number; preview: DropPreview; range: number } | null;
  /** [↔ 이동] 모드 (T-2): 옮길 타워 칸과 놓을 수 있는 칸 (move = 빈 칸, swap = 교환) */
  moveMode?: { from: { tx: number; ty: number }; targets: readonly { tx: number; ty: number; kind: 'move' | 'swap' }[] } | null;
  /** 조작 칸 (#79): 칠할 칸들과 진하기 alpha (0~1). 없거나 null·alpha 0이면 안 그림 */
  buildable?: { tiles: readonly (readonly [number, number])[]; alpha: number } | null;
}

/** 배치 칸 표시 색 (풀밭·배경 그림 위의 옅은 흰색) */
const BUILD_COLOR = 0xffffff;

export class SelectionLayer {
  private readonly under: Phaser.GameObjects.Graphics;
  private readonly over: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly layout: MapLayout,
  ) {
    this.under = scene.add.graphics().setDepth(SELECTION_DEPTH);
    this.over = scene.add.graphics().setDepth(DROP_DEPTH);
  }

  /** 단위 → 화면 px 길이 */
  private px(units: number): number {
    return (units / 1000) * this.layout.tile;
  }

  draw(view: SelectionView, timeMs: number): void {
    const g = this.under;
    const o = this.over;
    g.clear();
    o.clear();
    const L = this.layout;
    const line = Math.max(2, L.tile * 0.035);
    if (view.buildable && view.buildable.alpha > 0) this.drawBuildable(g, view.buildable.tiles, view.buildable.alpha, line);
    this.drawPassiveAuras(g, view.auras ?? [], timeMs);
    if (view.selected) {
      const c = tileCenterPx(L, view.selected.tx, view.selected.ty);
      const r = this.px(view.selected.range);
      if (r < L.tile * 40) {
        g.fillStyle(RANGE_COLOR, 0.08).fillCircle(c.x, c.y, r);
        g.lineStyle(line, RANGE_COLOR, 0.55).strokeCircle(c.x, c.y, r);
      }
      if (view.selected.detectRange > 0) this.dashedCircle(g, c.x, c.y, this.px(view.selected.detectRange), line, DETECT_COLOR, timeMs);
      const ar = view.selected.auraRadius ?? 0;
      if (ar > 0) {
        const half = (ar + 0.5) * L.tile;
        g.fillStyle(AURA_COLOR, 0.1).fillRoundedRect(c.x - half, c.y - half, half * 2, half * 2, L.tile * 0.15);
        g.lineStyle(line, AURA_COLOR, 0.75).strokeRoundedRect(c.x - half, c.y - half, half * 2, half * 2, L.tile * 0.15);
      }
    }
    for (const t of view.buffed ?? []) {
      const c = tileCenterPx(L, t.tx, t.ty);
      g.lineStyle(line * 1.2, AURA_COLOR, 0.85).strokeEllipse(c.x, c.y + L.tile * FOOT_OFFSET_TILES, L.tile * 0.7, L.tile * 0.32);
    }
    // 같은 종류: 발밑에 금색 고리 (천천히 맥동)
    const pulse = 0.55 + 0.25 * Math.sin(timeMs / 260);
    for (const t of view.sameKind) {
      const c = tileCenterPx(L, t.tx, t.ty);
      g.lineStyle(line * 1.4, SAME_KIND_COLOR, pulse).strokeEllipse(c.x, c.y + L.tile * FOOT_OFFSET_TILES, L.tile * 0.86, L.tile * 0.4);
    }
    const mm = view.moveMode;
    if (mm) {
      const s = L.tile * 0.86;
      for (const t of mm.targets) {
        const c = tileCenterPx(L, t.tx, t.ty);
        const color = DROP_COLORS[t.kind];
        o.fillStyle(color, 0.16).fillRoundedRect(c.x - s / 2, c.y - s / 2, s, s, L.tile * 0.12);
        o.lineStyle(line, color, 0.7).strokeRoundedRect(c.x - s / 2, c.y - s / 2, s, s, L.tile * 0.12);
      }
      const f = tileCenterPx(L, mm.from.tx, mm.from.ty);
      o.lineStyle(line * 1.6, 0xffffff, 0.95).strokeRoundedRect(f.x - s / 2, f.y - s / 2, s, s, L.tile * 0.12);
    }
    if (view.drop && view.drop.preview !== 'none') {
      const c = tileCenterPx(L, view.drop.tx, view.drop.ty);
      const color = DROP_COLORS[view.drop.preview];
      const s = L.tile * 0.92;
      o.fillStyle(color, 0.28).fillRoundedRect(c.x - s / 2, c.y - s / 2, s, s, L.tile * 0.12);
      o.lineStyle(line * 1.4, color, 0.95).strokeRoundedRect(c.x - s / 2, c.y - s / 2, s, s, L.tile * 0.12);
      if (view.drop.preview !== 'invalid') {
        const r = this.px(view.drop.range);
        if (r < L.tile * 40) g.lineStyle(line, color, 0.6).strokeCircle(c.x, c.y, r);
      }
    }
  }

  /** 조작 중에만 각 칸을 옅은 사각형으로 표시한다. 지형·배치 판정은 바꾸지 않는다. */
  private drawBuildable(g: Phaser.GameObjects.Graphics, tiles: readonly (readonly [number, number])[], alpha: number, line: number): void {
    const L = this.layout;
    const size = L.tile * 0.92;
    for (const [x, y] of tiles) {
      const c = tileCenterPx(L, x, y);
      g.fillStyle(BUILD_COLOR, 0.14 * alpha).fillRoundedRect(c.x - size / 2, c.y - size / 2, size, size, L.tile * 0.06);
      g.lineStyle(line, BUILD_COLOR, 0.36 * alpha).strokeRoundedRect(c.x - size / 2, c.y - size / 2, size, size, L.tile * 0.06);
    }
  }

  /** 평소 오라는 발밑 빛만. 정확한 효과 범위는 타워를 고른 동안 위에서 표시한다. */
  private drawPassiveAuras(g: Phaser.GameObjects.Graphics, glows: readonly AuraGlow[], timeMs: number): void {
    const breath = 0.75 + 0.25 * Math.sin((timeMs / 2400) * Math.PI * 2);
    for (const a of glows) {
      const c = tileCenterPx(this.layout, a.tx, a.ty);
      g.fillStyle(AURA_GLOW_COLOR, 0.32 * breath).fillEllipse(c.x, c.y + this.layout.tile * FOOT_OFFSET_TILES, this.layout.tile * 0.92, this.layout.tile * 0.44);
    }
  }

  /** 점선 원 (조각 24개, 천천히 돈다). */
  private dashedCircle(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, width: number, color: number, timeMs: number): void {
    const n = 24;
    const step = (Math.PI * 2) / n;
    const spin = (timeMs / 4000) % (Math.PI * 2);
    g.lineStyle(width, color, 0.85);
    for (let i = 0; i < n; i++) {
      const a = spin + i * step;
      g.beginPath();
      g.arc(x, y, r, a, a + step * 0.55, false);
      g.strokePath();
    }
  }

  destroy(): void {
    this.under.destroy();
    this.over.destroy();
  }
}
