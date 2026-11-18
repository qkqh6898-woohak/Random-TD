/**
 * M2 화면 쪽 순수 계산: 탭 → 소환/알림, 타워 대기 동작(숨쉬기 1.5초·흔들림·무작위 위상·공격·등장),
 * 피해 숫자 색·떠오름·겹침 방지, 동전 경로, 아래 띠 안내, 맵 영역(위 HUD·아래 띠 사이), 타워 소품,
 * 검토 반영: 타워 머리 탭 → 그 타워 칸, 사건 연출 범위(소환·실패는 느린 프레임에도).
 */
import { describe, expect, it } from 'vitest';
import { GRADE_STARS, propFor } from '../../src/art/towerLook';
import { summonInfo } from '../../src/ui/hud/hudModel';
import { BOARD_FULL, needGoldForSummon } from '../../src/ui/messages';
import { GAME_HEIGHT } from '../../src/view/config';
import { decideTap, summonFailText, tapAllowed, tapTile } from '../../src/view/input/tap';
import { BOTTOM_UI_PX, HUD_TOP_PX, MIN_MAP_AREA_PX, computeMapLayout, mapAreaBelowHud, type MapLayout } from '../../src/view/layout';
import {
  DAMAGE_COLORS,
  FX_RECENT_TICKS,
  bigTextSlot,
  boxesOverlap,
  coinPath,
  damageColor,
  eventFxVisible,
  floatingTextFrame,
  stackSlot,
  type TextBox,
} from '../../src/view/render/fxModel';
import { FIGURE_TOP_TILES, towerHeadZone } from '../../src/view/render/towerGeom';
import {
  APPEAR_MS,
  ATTACK_CALM_MS,
  BREATH_PERIOD_MS,
  BREATH_STRETCH,
  attackAnimMs,
  breathPose,
  hash01,
  towerPose,
  type PoseInput,
} from '../../src/view/render/towerPose';
import { data } from '../helpers/match';

describe('맵 탭 → 할 일 (UI.md 4.3·8·9장)', () => {
  it('빈 배치 칸 → 소환 명령, 돈 부족 → "100원이 필요해요" + 칸 흔들림, 가득 참 → 빈 칸 없음 알림', () => {
    expect(decideTap(null, 3, 4, 100)).toEqual({ kind: 'summon', x: 3, y: 4 });
    expect(decideTap('gold', 3, 4, 100)).toEqual({ kind: 'toast', text: '100원이 필요해요', shake: true, x: 3, y: 4 });
    expect(decideTap('full', 3, 4, 100)).toEqual({ kind: 'toast', text: '빈 칸이 없어요 — 승급으로 칸을 비워 보세요', shake: false, x: 3, y: 4 });
    expect(needGoldForSummon(75)).toBe('75원이 필요해요');
  });

  it('경로·장식·타워가 있는 칸(빈 칸 남음)·끝난 판 → 아무 일 없음', () => {
    for (const f of ['occupied', 'notBuildable', 'phase'] as const) expect(decideTap(f, 0, 0, 100)).toEqual({ kind: 'none' });
  });

  it('sim이 거절한 소환 → 돈·칸 이유만 알림', () => {
    expect(summonFailText('gold', 100)).toBe('100원이 필요해요');
    expect(summonFailText('full', 100)).toBe(BOARD_FULL);
    expect(summonFailText('occupied', 100)).toBeNull();
  });

  it('소환 연타는 0.1초 간격까지', () => {
    expect(tapAllowed(null, 0)).toBe(true);
    expect(tapAllowed(1000, 1099)).toBe(false);
    expect(tapAllowed(1000, 1100)).toBe(true);
  });
});

describe('타워 대기 동작 (ART.md 2.2, DEV_PLAN M2-8)', () => {
  const idle = (timeMs: number, seed: number): PoseInput => ({ timeMs, seed, attackAtMs: null, attackMs: 250, appearAtMs: null });

  it('숨쉬기: 1.5초 주기, 세로로 최대 2% 늘어남, 위아래로 흔들림', () => {
    for (const t of [0, 123, 777, 1400]) {
      const a = breathPose(t, 0.3);
      const b = breathPose(t + BREATH_PERIOD_MS, 0.3);
      expect(b.sy).toBeCloseTo(a.sy, 9);
      expect(b.bob).toBeCloseTo(a.bob, 9);
    }
    let maxSy = 0;
    let minSy = 2;
    let minBob = 0;
    for (let t = 0; t < BREATH_PERIOD_MS; t += 10) {
      const p = breathPose(t, 0);
      maxSy = Math.max(maxSy, p.sy);
      minSy = Math.min(minSy, p.sy);
      minBob = Math.min(minBob, p.bob);
    }
    expect(maxSy).toBeCloseTo(1 + BREATH_STRETCH, 3);
    expect(minSy).toBeCloseTo(1, 3);
    expect(minBob).toBeLessThan(-0.02);
  });

  it('공격하지 않아도 계속 움직인다 (어느 0.2초 구간이든 자세가 바뀐다)', () => {
    for (let t = 0; t < 6000; t += 200) {
      const a = towerPose(idle(t, 0.42));
      const b = towerPose(idle(t + 200, 0.42));
      const moved = Math.abs(a.sy - b.sy) + Math.abs(a.bob - b.bob) + Math.abs(a.angle - b.angle);
      expect(moved).toBeGreaterThan(1e-4);
    }
  });

  it('시작 위상이 다르면 같은 시각에 다른 자세 (같은 타워 여러 개가 똑같이 움직이지 않음)', () => {
    const a = towerPose(idle(1000, 0.1));
    const b = towerPose(idle(1000, 0.6));
    expect(Math.abs(a.sy - b.sy) + Math.abs(a.bob - b.bob)).toBeGreaterThan(0.005);
  });

  it('고유 동작 자리: 3초마다 한 번 갸웃 (몇 주기 안에 기울기가 생긴다)', () => {
    let tilted = 0;
    for (let t = 0; t < 9000; t += 20) if (Math.abs(towerPose(idle(t, 0.77)).angle) > 0.02) tilted++;
    expect(tilted).toBeGreaterThan(20);
    expect(tilted).toBeLessThan(450 / 2); // 대부분의 시간은 숨쉬기만
  });

  it('공격: 공격 동작 동안 대상 쪽으로 내밀고, 끝나면 0. 공격 직후 0.3초는 고유 동작 없이 숨쉬기만', () => {
    const at = 5000;
    const mid = towerPose({ timeMs: at + 125, seed: 0.2, attackAtMs: at, attackMs: 250, appearAtMs: null });
    expect(mid.lunge).toBeGreaterThan(0.1);
    const after = towerPose({ timeMs: at + 260, seed: 0.2, attackAtMs: at, attackMs: 250, appearAtMs: null });
    expect(after.lunge).toBe(0);
    for (let t = at + 250; t < at + ATTACK_CALM_MS; t += 5) {
      expect(towerPose({ timeMs: t, seed: 0.77, attackAtMs: at, attackMs: 250, appearAtMs: null }).angle).toBe(0);
    }
  });

  it('공격 동작 길이: 0.25초, 공격 간격의 60%를 넘지 않음 (공속 1 → 250ms, 공속 6.25 → 96ms)', () => {
    expect(attackAnimMs(1000)).toBe(250);
    expect(attackAnimMs(160)).toBeCloseTo(96);
  });

  it('등장: 작게 시작해 넘쳤다가 제 크기 (피드백 #17: 0.6초, 커졌다 작아졌다 — feedback-17.test)', () => {
    const start = towerPose({ timeMs: 0, seed: 0, attackAtMs: null, attackMs: 250, appearAtMs: 0 });
    expect(start.sx).toBeLessThan(0.4);
    const peak = towerPose({ timeMs: APPEAR_MS * 0.4, seed: 0, attackAtMs: null, attackMs: 250, appearAtMs: 0 });
    expect(peak.sx).toBeGreaterThan(1.05);
    const done = towerPose({ timeMs: APPEAR_MS + 1, seed: 0, attackAtMs: null, attackMs: 250, appearAtMs: 0 });
    expect(done.sx).toBeCloseTo(breathPose(APPEAR_MS + 1, 0).sx, 9);
  });

  it('hash01: 0 이상 1 미만, 같은 입력 같은 값', () => {
    for (let i = 0; i < 200; i++) {
      const v = hash01(12345, i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(hash01(12345, i)).toBe(v);
    }
  });
});

describe('피해 숫자·동전 (GDD 5.4, ART.md 2.4)', () => {
  it('색: 물리 흰색, 마법 하늘색, 고정 노란색, 섞이면 큰 쪽', () => {
    expect(damageColor(10, 0, 0)).toBe(DAMAGE_COLORS.physical);
    expect(damageColor(0, 7, 0)).toBe(DAMAGE_COLORS.magic);
    expect(damageColor(0, 0, 100)).toBe(DAMAGE_COLORS.true);
    expect(damageColor(19, 39, 0)).toBe(DAMAGE_COLORS.magic);
    expect(damageColor(5, 5, 0)).toBe(DAMAGE_COLORS.physical);
  });

  it('떠오름: 처음엔 제자리·불투명, 끝에서 0.7칸 위·투명', () => {
    expect(floatingTextFrame(0)).toMatchObject({ rise: 0, alpha: 1 });
    expect(floatingTextFrame(0.5).alpha).toBe(1);
    expect(floatingTextFrame(1)).toMatchObject({ rise: 0.7, alpha: 0 });
    expect(floatingTextFrame(0.8).alpha).toBeCloseTo(0.5);
  });

  it('동전: 처치 자리에서 출발해 HUD 돈에 도착, 가는 길에 위로 튄다', () => {
    const a = { x: 500, y: 1200 };
    const b = { x: 120, y: 200 };
    expect(coinPath(a, b, 0, 100)).toEqual(a);
    const end = coinPath(a, b, 1, 100);
    expect(end.x).toBeCloseTo(b.x);
    expect(end.y).toBeCloseTo(b.y);
    const flat = { x: 900, y: 1200 };
    const mid = coinPath(a, flat, 0.5, 100);
    expect(mid.y).toBeLessThan(a.y); // 같은 높이로 가도 위로 휜다
  });
});

describe('아래 띠·맵 영역', () => {
  it('타워 수/배치 칸 수, 돈이 있으면 소환 안내, 가득 차면 빈 칸 없음', () => {
    expect(summonInfo(1000, 3, 71, 100)).toEqual({ towers: '3/71', summonHint: '', summonCost: '100원', summonAffordable: true });
    expect(summonInfo(99, 3, 71, 100).summonAffordable).toBe(false);
    expect(summonInfo(5000, 71, 71, 100)).toEqual({ towers: '71/71', summonHint: '빈 칸이 없어요', summonCost: '100원', summonAffordable: false });
  });

  it('알림 영역과 아래 띠 사이를 여백 없이 쓰고, 아래 띠를 못 재면 기본 330px 비움', () => {
    expect(mapAreaBelowHud(382, 1780)).toEqual({ x: 0, y: 382, w: 1080, h: 1780 - 382 });
    const unmeasured = mapAreaBelowHud(382);
    expect(unmeasured.y + unmeasured.h).toBe(GAME_HEIGHT - BOTTOM_UI_PX);
    // 아래 띠가 아주 커져도 맵 영역은 최소 높이를 지킨다
    const squeezed = mapAreaBelowHud(382, 800);
    expect(squeezed.h).toBeGreaterThanOrEqual(MIN_MAP_AREA_PX);
    expect(squeezed.y).toBeGreaterThanOrEqual(HUD_TOP_PX);
    const circle = data.maps.circle!;
    const L = computeMapLayout(circle, mapAreaBelowHud(382, 1780));
    expect(L.originY + (L.minRow + L.rows) * L.tile).toBeLessThanOrEqual(1780);
  });
});

describe('검토 반영: 타워 머리 탭 → 그 타워 칸 (위 칸 소환 아님)', () => {
  // 1칸 100px, 칸 (0, 0) 왼쪽 위 = (0, 0)
  const L: MapLayout = { tile: 100, originX: 0, originY: 0, minCol: 0, minRow: 0, cols: 9, rows: 11 };
  const towerAt34 = (tx: number, ty: number): boolean => tx === 3 && ty === 4;

  it('캐릭터 맨 위는 칸 중심에서 약 0.78칸 위 → 칸 위쪽 경계보다 약 0.28칸 위 칸으로 삐져나온다', () => {
    expect(FIGURE_TOP_TILES).toBeCloseTo(-0.776, 2);
    const z = towerHeadZone(3, 4);
    expect(z.bottom).toBe(4);
    expect(z.top).toBeLessThan(4 - 0.28);
    expect(z.top).toBeGreaterThan(4 - 0.4);
  });

  it('(3, 4) 타워의 헬멧 자리(위 칸 아래쪽 가운데)를 누르면 (3, 4), 머리에서 먼 위 칸 자리는 (3, 3)', () => {
    // 리뷰 재현: 칸 위쪽 경계에서 0.12칸 위 = 헬멧
    expect(tapTile(L, 350, 388, towerAt34)).toEqual({ tx: 3, ty: 4 });
    expect(tapTile(L, 350, 372, towerAt34)).toEqual({ tx: 3, ty: 4 }); // 0.28칸 위 (별)
    expect(tapTile(L, 350, 350, towerAt34)).toEqual({ tx: 3, ty: 3 }); // 위 칸 가운데
    expect(tapTile(L, 305, 390, towerAt34)).toEqual({ tx: 3, ty: 3 }); // 위 칸 왼쪽 아래 구석 (머리 밖)
    expect(tapTile(L, 350, 450, towerAt34)).toEqual({ tx: 3, ty: 4 }); // 타워 칸 자체
  });

  it('아래 칸에 타워가 없으면 늘 그 자리의 칸', () => {
    expect(tapTile(L, 350, 388, () => false)).toEqual({ tx: 3, ty: 3 });
    expect(tapTile(L, 250, 388, towerAt34)).toEqual({ tx: 2, ty: 3 });
  });

  it('커진 타워는 두 줄 위의 장식 칸에서도 선택되고 소환 칸 가운데 터치를 막지 않는다', () => {
    const heroScale = () => 2;
    expect(tapTile(L, 350, 280, towerAt34, heroScale)).toEqual({ tx: 3, ty: 4 });
    const summonPad = (tx: number, ty: number) => tx === 3 && ty === 3;
    expect(tapTile(L, 350, 350, towerAt34, heroScale, summonPad)).toEqual({ tx: 3, ty: 3 });
  });
});

describe('검토 반영: 사건 연출 범위 (느린 프레임에도 소환 응답이 빠지지 않게)', () => {
  it("'bulk'(피해·처치): 지금 틱에서 3틱 안쪽만", () => {
    expect(FX_RECENT_TICKS).toBe(3);
    expect(eventFxVisible('bulk', 97, 100, 95)).toBe(true);
    expect(eventFxVisible('bulk', 96, 100, 95)).toBe(false);
  });

  it("'action'(소환·실패): 한 프레임에 5틱이 돌아도(느린 프레임 250ms) 이번 프레임 사건은 모두", () => {
    // 소환 명령은 다음 프레임 첫 틱 T에 실행 → 그 프레임에 5틱 돌면 지금 틱 = T + 5
    const T = 1000;
    expect(eventFxVisible('bulk', T, T + 5, T)).toBe(false); // 예전: 버려짐
    expect(eventFxVisible('action', T, T + 5, T)).toBe(true);
    // 빨리 감기로 프레임 밖에서 돈 옛 사건은 최근 것만
    expect(eventFxVisible('action', T - 500, T + 5, T)).toBe(false);
    expect(eventFxVisible('action', T + 3, T + 5, T + 10)).toBe(true);
  });

  it("'rare'(신 강림): 언제나", () => {
    expect(eventFxVisible('rare', 0, 1_000_000, 999_999)).toBe(true);
  });
});

describe('검토 반영: 피해 숫자 겹침 방지', () => {
  const box = (cx: number, bottom: number, w = 40, h = 30): TextBox => ({ cx, bottom, w, h });

  it('상자 겹침: 가로·세로 둘 다 겹쳐야 겹침, 모서리만 닿으면 아님', () => {
    expect(boxesOverlap(box(100, 100), box(110, 100))).toBe(true);
    expect(boxesOverlap(box(100, 100), box(140, 100))).toBe(false); // 가로로 딱 닿음
    expect(boxesOverlap(box(100, 100), box(100, 70))).toBe(false); // 세로로 딱 닿음
    expect(boxesOverlap(box(100, 100), box(100, 80))).toBe(true);
  });

  it('같은 자리에 몰리면 한 칸씩 위로 쌓고, 빈 칸이 없으면 −1', () => {
    const others: TextBox[] = [];
    const slots: number[] = [];
    for (let i = 0; i < 5; i++) {
      const b = box(100 + (i % 2) * 6, 200);
      const k = stackSlot(b, others, 4);
      slots.push(k);
      if (k >= 0) others.push({ ...b, bottom: b.bottom - k * b.h });
    }
    expect(slots).toEqual([0, 1, 2, 3, -1]);
    // 쌓인 숫자끼리 겹치지 않는다
    for (let i = 0; i < others.length; i++) for (let j = i + 1; j < others.length; j++) expect(boxesOverlap(others[i]!, others[j]!)).toBe(false);
    // 옆으로 충분히 떨어져 있으면 원래 자리
    expect(stackSlot(box(200, 200), others, 4)).toBe(0);
  });

  it('큰 글자(즉사!·돈)는 빈 칸이 없으면 다른 큰 글자를 피한 가장 낮은 칸 + 그 자리를 가리는 작은 피해 숫자를 지운다 (검토 반영)', () => {
    // 같은 자리에 작은 숫자 0·2칸, 큰 글자(+10원) 1·3칸 → 큰 글자가 없는 가장 낮은 칸 = 0칸, 0칸의 작은 숫자만 지움
    const at = (k: number) => box(100, 200 - k * 30);
    const others = [
      { box: at(0), big: false },
      { box: at(1), big: true },
      { box: at(2), big: false },
      { box: at(3), big: true },
    ];
    expect(stackSlot(box(100, 200), others.map((o) => o.box), 4)).toBe(-1);
    expect(bigTextSlot(box(100, 200), others, 6)).toEqual({ slot: 0, drop: [0] });
    // 0칸도 큰 글자면 → 큰 글자가 없는 2칸에, 그 칸의 작은 숫자를 지움 (큰 글자끼리는 겹치지 않는다)
    const busy = [{ box: at(0), big: true }, ...others.slice(1)];
    expect(bigTextSlot(box(100, 200), busy, 6)).toEqual({ slot: 2, drop: [2] });
    // 큰 글자로 다 차 있으면 0칸 (작은 숫자만 지운다)
    const full = [0, 1, 2].map((k) => ({ box: at(k), big: true }));
    expect(bigTextSlot(box(100, 200), full, 3)).toEqual({ slot: 0, drop: [] });
  });

  it('떠오름은 일정 속도: 먼저 뜬 숫자와의 간격이 끝까지 그대로 (따라잡아 겹치지 않음)', () => {
    const gapAt = (k: number, lag: number): number => floatingTextFrame(k).rise - floatingTextFrame(k - lag).rise;
    for (const k of [0.3, 0.5, 0.8, 1]) expect(gapAt(k, 0.2)).toBeCloseTo(gapAt(0.2, 0.2), 9);
  });
});

describe('타워 소품 (임시 그림)', () => {
  it('기본 덱 노말: 광부 곡괭이, 고블린 단검, 궁수 활, 견습 마법사 지팡이, 전사 검 / 표에 없으면 피해·형태로', () => {
    const towers = new Map(data.towers.towers.map((t) => [t.id, t]));
    const props = ['miner', 'goblin', 'archer', 'apprentice', 'warrior'].map((id) => propFor(towers.get(id)!));
    expect(props).toEqual(['pickaxe', 'dagger', 'bow', 'staff', 'sword']);
    expect(propFor({ id: 'x', damageType: 'magic', shape: 'aoe' })).toBe('staff');
    expect(propFor({ id: 'x', damageType: 'physical', shape: 'melee_aoe' })).toBe('sword');
    expect(propFor({ id: 'x', damageType: 'physical', shape: 'pierce' })).toBe('bow');
    expect(GRADE_STARS.legend).toBe(5);
  });
});
