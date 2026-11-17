/**
 * G-2 화면·캐릭터 디자인 (순수 함수):
 *  - 테두리 테마 「금테 성채」: 코드로 그린 SVG 장식(바깥 주소 없음), 글자 대비 ≥ 4.5:1, theme.css 변수 = theme.ts 색, 크기 속성을 바꾸지 않음.
 *  - 소환·승급 연출 (주사위 → 초상 카드): 카드 뒤집기, 승급 등급 별 수.
 *  - 캐릭터 겉모습: 등급 받침대 7종이 서로 다르고 경계 안, 종족 문장, 별 배지, 받침대 크기, 공격 펀치·살랑·반짝임.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEME, contrastRatio, cornerSvg, crestSvg, gemSvg, latticeSvg, summonIconSvg, svgUrl, themeVariables, trimSvg } from '../../src/ui/theme';
import { cardFlip, mergeStarCount } from '../../src/view/render/fxModel';
import { EMBLEM_SIZE, FACTION_GLYPH, GRADE_STYLE, STAR_BADGE, drawFactionEmblem, drawGradePedestal, drawStarBadge } from '../../src/art/presentation';
import { PEDESTAL_BOUNDS } from '../../src/art/chibiBounds';
import { pedestalScaleFor, PEDESTAL_WIDTH_TILES, FOOT_OFFSET_TILES } from '../../src/view/render/towerGeom';
import { ATTACK_WINDUP, GLINT_MS, GLINT_PERIOD_MS, SWAY_RAD, towerPose } from '../../src/view/render/towerPose';

const GRADES = ['normal', 'rare', 'unique', 'hero', 'legend', 'god', 'hidden'] as const;

describe('G-2 테두리 테마: 코드로 그린 SVG 장식', () => {
  const all = [cornerSvg(0), cornerSvg(90), cornerSvg(180), cornerSvg(270), gemSvg(), trimSvg(), latticeSvg(), crestSvg('knight'), crestSvg('mage'), summonIconSvg()];

  it('모두 SVG 한 장이고 바깥 주소(이미지·글꼴·링크)를 부르지 않는다', () => {
    for (const s of all) {
      expect(s.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      expect(s.endsWith('</svg>')).toBe(true);
      // 이름공간 말고는 주소가 없다 (완전 오프라인)
      expect(s.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:|href=|<image|@import|url\(http/);
      expect(s).not.toContain('NaN');
    }
  });

  it('모서리 장식은 네 방향이 다르고, 문장 둘(기사·마법사)도 다르다', () => {
    expect(new Set([cornerSvg(0), cornerSvg(90), cornerSvg(180), cornerSvg(270)]).size).toBe(4);
    expect(crestSvg('knight')).not.toBe(crestSvg('mage'));
  });

  it('CSS 변수 값은 data URI url("…")', () => {
    const vars = themeVariables();
    for (const k of ['--orn-corner-tl', '--orn-corner-tr', '--orn-corner-br', '--orn-corner-bl', '--orn-gem-ruby', '--orn-trim', '--orn-lattice', '--orn-crest-knight', '--orn-crest-mage', '--orn-summon']) {
      expect(vars[k], k).toMatch(/^url\("data:image\/svg\+xml,%3Csvg/);
    }
    expect(svgUrl('<svg a="b"/>')).not.toContain('"b"'); // 따옴표는 이스케이프 → url("…")이 끊기지 않음
  });

  it('글자 대비 ≥ 4.5:1 (판 배경 위 흰 글자·흐린 글자, 소환 버튼 글자)', () => {
    for (const bg of [THEME.wood, THEME.woodLo, THEME.woodHi, THEME.ink]) {
      expect(contrastRatio(THEME.text, bg), `text on ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(THEME.textDim, bg), `dim on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    // 금빛 버튼(열린 메뉴·소환) 위 진한 갈색 글자
    expect(contrastRatio('#3b2416', THEME.gold)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#412513', '#ffd267')).toBeGreaterThanOrEqual(4.5);
  });

  const css = readFileSync('src/ui/theme.css', 'utf8');

  it('theme.css 변수 색 = theme.ts THEME 색 (한 곳만 고치는 실수 방지)', () => {
    const pairs: [string, string][] = [
      ['--frame-wood-hi', THEME.woodHi],
      ['--frame-wood', THEME.wood],
      ['--frame-wood-lo', THEME.woodLo],
      ['--frame-ink', THEME.ink],
      ['--frame-gold', THEME.gold],
      ['--frame-gold-hi', THEME.goldHi],
      ['--frame-gold-lo', THEME.goldLo],
      ['--text-dim', THEME.textDim],
    ];
    for (const [name, value] of pairs) expect(css, name).toMatch(new RegExp(`${name}: ${value};`, 'i'));
  });

  it('테마 규칙은 크기를 바꾸지 않는다 (HUD 높이 재기·아래 띠 한 줄·맵 영역 그대로): 띠·메뉴·시트·패널 규칙에 여백·글자 크기·높이 없음', () => {
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));
    const frame = blocks.filter((b) => /\.(hud-bar|hud-bottom|hud-menu|hud-menu-btn|bsheet|tower-panel|pause-panel|title-dialog|hud-towers|hud-stage)\b/.test(b.sel) && !/::(before|after)/.test(b.sel));
    expect(frame.length).toBeGreaterThan(6);
    for (const b of frame) expect(b.body, b.sel).not.toMatch(/(^|[\s;])(padding|margin|font-size|min-height|height|width|border-width|border:|gap)\s*:/);
    // 장식 가상 요소는 모두 누르기 통과 + 절대 위치
    for (const b of blocks.filter((x) => /::(before|after)/.test(x.sel) && x.body.includes('content'))) {
      expect(b.body, b.sel).toContain('pointer-events: none');
      expect(b.body, b.sel).toContain('position: absolute');
    }
    // 테마 규칙은 :where(…)로 원래 규칙과 같은 우선순위
    for (const b of blocks.filter((x) => x.sel.includes('data-theme'))) expect(b.sel).toMatch(/:where\(\[data-theme='gilded'\]\)/);
  });
});

describe('G-2 소환·승급 초상 카드', () => {
  it('뒤집기: 뒷면 1 → 얇아짐 → 앞면 얇게 → 앞면 1, 사라지는 프레임 없음', () => {
    expect(cardFlip(0)).toEqual({ scaleX: 1, front: false });
    expect(cardFlip(0.49).front).toBe(false);
    expect(cardFlip(0.5).front).toBe(true);
    expect(cardFlip(1)).toEqual({ scaleX: 1, front: true });
    expect(cardFlip(1.3)).toEqual({ scaleX: 1, front: true });
    expect(cardFlip(-1)).toEqual({ scaleX: 1, front: false });
    let prev = 2;
    for (let i = 0; i <= 50; i++) {
      const f = cardFlip(i / 100);
      expect(f.scaleX).toBeGreaterThan(0.03);
      expect(f.scaleX).toBeLessThanOrEqual(prev + 1e-9);
      prev = f.scaleX;
    }
    prev = 0;
    for (let i = 50; i <= 100; i++) {
      const f = cardFlip(i / 100);
      expect(f.scaleX).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = f.scaleX;
    }
  });

  it('승급 등급 별: 노말 1 ~ 레전드 5, 신·신화 5', () => {
    expect(GRADES.map((g) => mergeStarCount(g))).toEqual([1, 2, 3, 4, 5, 5, 5]);
    expect(mergeStarCount('???')).toBe(1);
  });
});

/** 2D 캔버스 흉내: 타원·원·사각형 좌표를 모아 경계를 본다 (변환은 translate·scale만). */
function recorder(): { ctx: CanvasRenderingContext2D; box: { l: number; r: number; t: number; b: number }; calls: string[] } {
  const box = { l: Infinity, r: -Infinity, t: Infinity, b: -Infinity };
  const calls: string[] = [];
  let tx = 0;
  let ty = 0;
  let sx = 1;
  let sy = 1;
  const stack: [number, number, number, number][] = [];
  const add = (x: number, y: number): void => {
    const X = tx + x * sx;
    const Y = ty + y * sy;
    box.l = Math.min(box.l, X);
    box.r = Math.max(box.r, X);
    box.t = Math.min(box.t, Y);
    box.b = Math.max(box.b, Y);
  };
  const grad = { addColorStop: () => undefined };
  const target: Record<string, unknown> = {
    save: () => stack.push([tx, ty, sx, sy]),
    restore: () => ([tx, ty, sx, sy] = stack.pop() ?? [0, 0, 1, 1]),
    translate: (x: number, y: number) => {
      tx += x * sx;
      ty += y * sy;
    },
    scale: (a: number, b: number) => {
      sx *= a;
      sy *= b;
    },
    ellipse: (x: number, y: number, rx: number, ry: number) => {
      calls.push('ellipse');
      add(x - rx, y - ry);
      add(x + rx, y + ry);
    },
    arc: (x: number, y: number, r: number) => {
      calls.push('arc');
      add(x - r, y - r);
      add(x + r, y + r);
    },
    moveTo: (x: number, y: number) => add(x, y),
    lineTo: (x: number, y: number) => add(x, y),
    roundRect: (x: number, y: number, w: number, h: number) => {
      add(x, y);
      add(x + w, y + h);
    },
    closePath: () => calls.push('closePath'),
    createRadialGradient: () => grad,
    createLinearGradient: () => grad,
  };
  const ctx = new Proxy(target, {
    get: (t, k: string) => (k in t ? t[k] : () => undefined),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, box, calls };
}

describe('G-2 캐릭터 겉모습: 등급 받침대·별 배지·종족 문장', () => {
  it('등급 7종의 받침대 장식이 모두 다르다 (노말 → 신·신화)', () => {
    expect(new Set(GRADES.map((g) => GRADE_STYLE[g].deco)).size).toBe(7);
    expect(GRADES.map((g) => GRADE_STYLE[g].stars)).toEqual([1, 2, 3, 4, 5, 1, 1]);
    // 유니크 이상만 빛 고리
    expect(GRADES.filter((g) => GRADE_STYLE[g].glow !== null)).toEqual(['unique', 'hero', 'legend', 'god', 'hidden']);
  });

  it('받침대 그림은 예전 경계(PEDESTAL_BOUNDS) 안 → 탭 판정·패널 배치 그대로', () => {
    for (const g of GRADES) {
      const r = recorder();
      drawGradePedestal(r.ctx, g);
      expect(r.box.l, g).toBeGreaterThanOrEqual(PEDESTAL_BOUNDS.left);
      expect(r.box.r, g).toBeLessThanOrEqual(PEDESTAL_BOUNDS.right);
      expect(r.box.t, g).toBeGreaterThanOrEqual(PEDESTAL_BOUNDS.top);
      expect(r.box.b, g).toBeLessThanOrEqual(PEDESTAL_BOUNDS.bottom);
    }
  });

  it('별 배지: 별 수 = 등급, 배지 크기 안', () => {
    for (const g of GRADES) {
      const r = recorder();
      drawStarBadge(r.ctx, g);
      // 별 하나 = 큰 별 + 반짝임 두 경로
      expect(r.calls.filter((c) => c === 'closePath').length, g).toBe(GRADE_STYLE[g].stars * 2);
      expect(r.box.r - r.box.l).toBeLessThanOrEqual(STAR_BADGE.w);
      expect(r.box.b - r.box.t).toBeLessThanOrEqual(STAR_BADGE.h);
    }
  });

  it('종족 문장: towers.json 모든 종족 + 신·연합이 서로 다른 문양, 배지 크기 안', () => {
    const towers = JSON.parse(readFileSync('src/data/towers.json', 'utf8')) as { towers: { faction: string }[] };
    const factions = [...new Set(towers.towers.map((t) => t.faction))];
    for (const f of factions) expect(FACTION_GLYPH[f], f).toBeDefined();
    expect(new Set(factions.map((f) => FACTION_GLYPH[f])).size).toBe(factions.length);
    for (const f of factions) {
      const r = recorder();
      drawFactionEmblem(r.ctx, f, '#336699');
      expect(r.box.r - r.box.l, f).toBeLessThanOrEqual(EMBLEM_SIZE);
    }
  });

  it('받침대 너비: 2배 그림이면 칸 안에서 커지고(≤ 0.95칸), 붙은 1.4배면 작게', () => {
    expect(PEDESTAL_WIDTH_TILES * pedestalScaleFor(2)).toBeLessThanOrEqual(0.96);
    expect(PEDESTAL_WIDTH_TILES * pedestalScaleFor(2)).toBeGreaterThan(0.9);
    expect(pedestalScaleFor(1.4)).toBeLessThan(pedestalScaleFor(2));
    expect(pedestalScaleFor(0.5)).toBe(0.85);
    expect(pedestalScaleFor(9)).toBe(1.22);
    // 1.22배여도 받침대 아래 끝은 칸 아래 경계 근처 (칸 중심 +0.52칸 이하)
    expect(FOOT_OFFSET_TILES + (PEDESTAL_WIDTH_TILES * 1.22 * PEDESTAL_BOUNDS.bottom) / (PEDESTAL_BOUNDS.right - PEDESTAL_BOUNDS.left)).toBeLessThan(0.52);
  });
});

describe('G-2 대기·공격 동작: 살랑·반짝임·공격 펀치', () => {
  const idle = (timeMs: number, seed: number) => towerPose({ timeMs, seed, attackAtMs: null, attackMs: 250, appearAtMs: null });

  it('살랑 흔들림은 늘 아주 작고(갸웃 기준 0.02 아래) 계속 바뀐다', () => {
    let min = 1;
    let max = -1;
    for (let t = 0; t < 7000; t += 40) {
      const p = idle(t, 0.37);
      expect(Math.abs(p.sway)).toBeLessThanOrEqual(SWAY_RAD + 1e-9);
      min = Math.min(min, p.sway);
      max = Math.max(max, p.sway);
    }
    expect(SWAY_RAD).toBeLessThan(0.02);
    expect(max - min).toBeGreaterThan(SWAY_RAD);
  });

  it('반짝임: 주기마다 한 번 짧게(대부분의 시간은 0), 타워마다 다른 때', () => {
    const on = (seed: number): number[] => {
      const out: number[] = [];
      for (let t = 0; t < GLINT_PERIOD_MS * 4; t += 20) if (idle(t, seed).glint > 0.05) out.push(t);
      return out;
    };
    const a = on(0.21);
    const b = on(0.73);
    expect(a.length).toBeGreaterThan(10);
    expect(a.length * 20).toBeLessThan(GLINT_MS * 4 + 200);
    expect(a.join()).not.toBe(b.join());
  });

  it('공격 펀치: 처음엔 뒤로 당기고(준비), 찌를 때 가장 멀리·밝게, 끝나면 0', () => {
    const at = 1000;
    const pose = (dt: number) => towerPose({ timeMs: at + dt, seed: 0.2, attackAtMs: at, attackMs: 250, appearAtMs: null });
    expect(pose(250 * ATTACK_WINDUP * 0.8).lunge).toBeLessThan(0);
    expect(pose(250 * (ATTACK_WINDUP + 0.02)).punch).toBeGreaterThan(0.8);
    let best = 0;
    for (let dt = 0; dt < 250; dt += 5) best = Math.max(best, pose(dt).lunge);
    expect(best).toBeGreaterThan(0.15);
    expect(pose(260).lunge).toBe(0);
    expect(pose(260).punch).toBe(0);
  });
});
