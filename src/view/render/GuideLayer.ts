/**
 * 첫 10단계 개선 (F10) 맵 위 안내 그림 (화면 전용, sim을 바꾸지 않는다). 칸 테두리는 여전히 숨기고, 필요한 칸만 빛낸다.
 *
 * - 추천 칸 (첫 소환 전): 자동 소환과 같은 점수의 앞 몇 칸에 옅은 금빛 네모가 숨 쉬고, 가장 좋은 칸에는 '추천' 글자.
 * - 승급 미리 보기 (승급할 수 있는 타워를 고르거나 첫 승급 안내 중): 결과가 생길 칸 = 금색 네모 + 금색 '결과' 알약,
 *   재료로 사라질 두 칸 = 빨간 ✕ + 빨간 '재료' 알약. 타워 위 층에 그린다 (타워 그림에 가리지 않게).
 * - 보유 n/3 배지: 같은 종류가 2개인 내 타워의 발밑 오른쪽에 작은 '2/3' 알약.
 * 몇 개 안 되는 도형이라 매 프레임 다시 그리고, 글자는 미리 만든 Text를 다시 쓴다.
 */
import Phaser from 'phaser';
import { tileCenterPx, type MapLayout } from '../layout';
import { SELECTION_DEPTH } from './SelectionLayer';

/** 추천 칸 빛: 바닥 위·타워 아래 */
const RECOMMEND_DEPTH = SELECTION_DEPTH + 1;
/** 승급 미리 보기·배지: 타워(깊이 = 발밑 y)와 끄는 칸(6400) 사이 → 맵 위 모든 타워보다 위 */
const OVER_DEPTH = 6300;
const GOLD = 0xffd84a;
const RED = 0xff4d4d;
const FONT = '-apple-system, "Noto Sans KR", "Malgun Gothic", sans-serif';

export interface GuideView {
  /** 추천 칸 (앞이 가장 좋은 칸). 없으면 빈 배열 */
  recommended: readonly (readonly [number, number])[];
  /** 승급 미리 보기 (없으면 null) */
  preview: { result: { tx: number; ty: number }; materials: readonly { tx: number; ty: number }[] } | null;
  /** 보유 n/3 배지 */
  badges: readonly { tx: number; ty: number; text: string }[];
  /** 연출 끄기: 숨쉬기·맥동 없이 */
  still: boolean;
}

export class GuideLayer {
  private readonly under: Phaser.GameObjects.Graphics;
  private readonly over: Phaser.GameObjects.Graphics;
  private readonly texts: Phaser.GameObjects.Text[] = [];
  private used = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: MapLayout,
  ) {
    this.under = scene.add.graphics().setDepth(RECOMMEND_DEPTH);
    this.over = scene.add.graphics().setDepth(OVER_DEPTH);
  }

  private text(x: number, y: number, s: string, size: number, color: string, stroke: string): void {
    let t = this.texts[this.used];
    if (!t) {
      t = this.scene.add.text(0, 0, '', { fontFamily: FONT, fontStyle: '800' }).setOrigin(0.5, 0.5).setDepth(OVER_DEPTH + 1);
      this.texts.push(t);
    }
    this.used++;
    if (t.text !== s) t.setText(s);
    t.setFontSize(size).setColor(color).setStroke(stroke, Math.max(2, size * 0.22)).setPosition(x, y).setVisible(true);
  }

  /**
   * '결과'·'재료' 이름표 (F10-4 검토: 작은 글자만 있던 때는 아래 줄 타워 머리에 묻혀 읽기 어려웠다) — 칸 아래 테두리에 걸친
   * 진한 알약 + 굵은 글자. 알약 바탕이 있어 무엇 위에 놓여도 읽힌다. 글자 층(OVER_DEPTH + 1)이 알약 위.
   */
  private chip(x: number, y: number, s: string, fill: number, line: number, color: string): void {
    const t = this.layout.tile;
    const size = Math.round(t * 0.2);
    const w = size * 2.7;
    const hgt = size * 1.45;
    this.over.fillStyle(fill, 0.96).fillRoundedRect(x - w / 2, y - hgt / 2, w, hgt, hgt / 2);
    this.over.lineStyle(Math.max(2, t * 0.025), line, 1).strokeRoundedRect(x - w / 2, y - hgt / 2, w, hgt, hgt / 2);
    this.text(x, y, s, size, color, fill === GOLD ? '#fff3c4' : '#5a0000');
  }

  draw(view: GuideView, timeMs: number): void {
    const g = this.under;
    const o = this.over;
    g.clear();
    o.clear();
    this.used = 0;
    const L = this.layout;
    const t = L.tile;
    const line = Math.max(2, t * 0.035);
    const breath = view.still ? 1 : 0.7 + 0.3 * Math.sin(timeMs / 380);
    view.recommended.forEach(([x, y], i) => {
      const c = tileCenterPx(L, x, y);
      const s = t * 0.9;
      const a = i === 0 ? 1 : 0.7;
      g.fillStyle(GOLD, 0.34 * breath * a).fillRoundedRect(c.x - s / 2, c.y - s / 2, s, s, t * 0.14);
      g.lineStyle(line * 1.8, 0xfff2b0, 0.95 * breath * a).strokeRoundedRect(c.x - s / 2, c.y - s / 2, s, s, t * 0.14);
      if (i === 0) this.text(c.x, c.y, '추천', Math.round(t * 0.22), '#fff4c2', '#5a3a00');
    });
    const p = view.preview;
    if (p) {
      const pulse = view.still ? 1 : 0.75 + 0.25 * Math.sin(timeMs / 220);
      const s = t * 0.94;
      const rc = tileCenterPx(L, p.result.tx, p.result.ty);
      o.lineStyle(line * 2.2, GOLD, pulse).strokeRoundedRect(rc.x - s / 2, rc.y - s / 2, s, s, t * 0.14);
      o.fillStyle(GOLD, 0.12 * pulse).fillRoundedRect(rc.x - s / 2, rc.y - s / 2, s, s, t * 0.14);
      this.chip(rc.x, rc.y + s / 2 - t * 0.02, '결과', GOLD, 0xfff3c4, '#3b2416');
      for (const m of p.materials) {
        const c = tileCenterPx(L, m.tx, m.ty);
        o.lineStyle(line * 1.6, RED, 0.9).strokeRoundedRect(c.x - s / 2, c.y - s / 2, s, s, t * 0.14);
        // ✕ (칸 오른쪽 위 구석, 캐릭터 얼굴을 덮지 않게)
        const k = t * 0.11;
        const cx = c.x + s / 2 - k * 1.4;
        const cy = c.y - s / 2 + k * 1.4;
        o.fillStyle(0x3a0000, 0.85).fillCircle(cx, cy, k * 1.25);
        o.lineStyle(line * 1.5, RED, 1).lineBetween(cx - k * 0.6, cy - k * 0.6, cx + k * 0.6, cy + k * 0.6);
        o.lineBetween(cx + k * 0.6, cy - k * 0.6, cx - k * 0.6, cy + k * 0.6);
        this.chip(c.x, c.y + s / 2 - t * 0.02, '재료', 0xb81f1f, 0xffb3b3, '#ffffff');
      }
    }
    for (const b of view.badges) {
      const c = tileCenterPx(L, b.tx, b.ty);
      const w = t * 0.42;
      const hgt = t * 0.23;
      const x = c.x + t * 0.3;
      const y = c.y + t * 0.36;
      o.fillStyle(0x10131f, 0.85).fillRoundedRect(x - w / 2, y - hgt / 2, w, hgt, hgt / 2);
      o.lineStyle(Math.max(1.5, line * 0.7), GOLD, 0.9).strokeRoundedRect(x - w / 2, y - hgt / 2, w, hgt, hgt / 2);
      this.text(x, y, b.text, Math.round(t * 0.17), '#ffffff', '#10131f');
    }
    for (let i = this.used; i < this.texts.length; i++) this.texts[i]?.setVisible(false);
  }

  destroy(): void {
    this.under.destroy();
    this.over.destroy();
    for (const t of this.texts) t.destroy();
    this.texts.length = 0;
  }
}
