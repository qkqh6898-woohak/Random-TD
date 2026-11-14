/**
 * 고른 타워 표시 (DEV_PLAN M3-10·M3-11, UI.md 4.3).
 *
 * - 타워를 터치하면: 사거리 원(흰색) + 같은 종류 타워 모두 강조(금색 고리). 감지 오라 타워는 👁 감지 범위 원(보라 점선)도.
 * - 길게 눌러 끄는 동안: 놓을 칸을 색으로 미리 보여준다 (빈 칸 이동 = 초록, 교환 = 파랑, 못 놓음 = 빨강)
 *   + 그 칸에 놓았을 때의 사거리 원.
 * 화면 전용 (sim을 바꾸지 않는다). 몇 개 안 되는 도형이라 매 프레임 다시 그린다.
 */
import Phaser from 'phaser';
import { tileCenterPx, type MapLayout } from '../layout';
import { DROP_COLORS, type DropPreview } from '../input/press';
import { FOOT_OFFSET_TILES } from './towerGeom';

/** 몹·타워보다 아래, 바닥보다 위 */
export const SELECTION_DEPTH = 900;
/** 끌기 미리 보기 칸은 타워 위에 */
export const DROP_DEPTH = 6400;
const DETECT_COLOR = 0xb36bff;
const RANGE_COLOR = 0xffffff;
const SAME_KIND_COLOR = 0xffc93c;

export interface SelectionView {
  /** 고른 타워 칸 (없으면 null) */
  selected: { tx: number; ty: number; range: number; detectRange: number } | null;
  /** 같은 종류 타워 칸 (고른 타워 포함) */
  sameKind: readonly { tx: number; ty: number }[];
  /** 끄는 중 놓을 칸 미리 보기 (없으면 null) */
  drop: { tx: number; ty: number; preview: DropPreview; range: number } | null;
}

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
    if (view.selected) {
      const c = tileCenterPx(L, view.selected.tx, view.selected.ty);
      const r = this.px(view.selected.range);
      if (r < L.tile * 40) {
        g.fillStyle(RANGE_COLOR, 0.08).fillCircle(c.x, c.y, r);
        g.lineStyle(line, RANGE_COLOR, 0.55).strokeCircle(c.x, c.y, r);
      }
      if (view.selected.detectRange > 0) this.dashedCircle(g, c.x, c.y, this.px(view.selected.detectRange), line, DETECT_COLOR, timeMs);
    }
    // 같은 종류: 발밑에 금색 고리 (천천히 맥동)
    const pulse = 0.55 + 0.25 * Math.sin(timeMs / 260);
    for (const t of view.sameKind) {
      const c = tileCenterPx(L, t.tx, t.ty);
      g.lineStyle(line * 1.4, SAME_KIND_COLOR, pulse).strokeEllipse(c.x, c.y + L.tile * FOOT_OFFSET_TILES, L.tile * 0.86, L.tile * 0.4);
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
