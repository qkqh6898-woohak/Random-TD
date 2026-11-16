/**
 * F10 첫 10단계 개선 (UI 갈래): 준비 완료(readyNow 명령), 추천 칸 순위(= 자동 소환 점수), 계정 도움말 기록,
 * 안내 표시값(보유 2/3·승급 미리 보기·준비 완료 버튼·추천 칸), 이번 판 기록, 강화·미션 완료 기준(문서 1장).
 */
import { describe, expect, it } from 'vitest';
import { validatePayload } from '../../src/sim/Commands';
import { playReplay, recordReplay, replayToJson, type ReplayFile } from '../../src/sim/replay';
import { autoSummonTile, rankSummonTiles, pathTilesAround, placeTower } from '../../src/sim/systems/Summon';
import { readyNow } from '../../src/sim/systems/Stage';
import { sameKindTowers, pickConsumed } from '../../src/sim/systems/Merge';
import { upgradeLevel } from '../../src/sim/systems/Upgrade';
import { towerBonus } from '../../src/sim/systems/Aura';
import { MISSION_CLAIMED, MISSION_DONE } from '../../src/sim/state';
import { createAccountStore, ACCOUNT_KEY } from '../../src/meta/account';
import { MemoryStorage } from '../../src/save/storage';
import {
  GUIDE_FIRST_MERGE,
  gameClock,
  mergeGuideText,
  mergePreview,
  mergeResultText,
  newRunLog,
  pairBadges,
  readyButtonState,
  recordRunEvent,
  runLogRows,
  showRecommended,
} from '../../src/ui/guide/guideModel';
import { menuBadges, missionSheetModel, upgradeSheetModel } from '../../src/ui/sheets/sheetModels';
import { command, data, eventsOf, infinite, realInfinite } from '../helpers/match';
import { tapTile } from '../../src/view/input/tap';
import { towerHeadZone } from '../../src/view/render/towerGeom';
import type { MapLayout } from '../../src/view/layout';

describe('준비 완료 (readyNow 명령)', () => {
  it('명령 검사: 필드 없음만 받는다', () => {
    expect(validatePayload({ type: 'readyNow' })).toBeNull();
    expect(validatePayload({ type: 'readyNow', x: 1 })).toMatch(/모르는 필드/);
  });

  it('준비 단계에서 누르면 그 틱에 1단계가 시작되고 다음 단계는 그로부터 60초 뒤', () => {
    const m = realInfinite(7);
    m.stepN(300); // 틱 0~299 (15초 기다림)
    command(m, { type: 'readyNow' }); // 틱 300
    expect(m.state.stage).toBe(1);
    expect(m.state.stageStartTick).toBe(300);
    expect(m.state.nextStageTick).toBe(300 + m.rules.stageTicks);
    const ev = m.world.drainEvents();
    expect(ev.find((e) => e.type === 'readyNow')).toMatchObject({ tick: 300, player: 0, left: 900 });
    expect(ev.filter((e) => e.type === 'stageStart')).toEqual([{ type: 'stageStart', tick: 300, stage: 1, boss: false }]);
    // 1단계 몹이 바로 나오기 시작한다
    m.stepN(40);
    expect(m.mobCount()).toBeGreaterThan(0);
  });

  it('연타해도 1단계는 한 번: 같은 틱 3번 + 다음 틱 2번 → stageStart 1번, 2단계는 원래 60초 뒤', () => {
    const m = realInfinite(8);
    m.stepN(100);
    for (let i = 0; i < 3; i++) m.world.enqueue({ type: 'readyNow' });
    m.step(); // 틱 100
    for (let i = 0; i < 2; i++) m.world.enqueue({ type: 'readyNow' });
    m.step();
    const ev = m.world.drainEvents();
    expect(ev.filter((e) => e.type === 'stageStart').map((e) => e.stage)).toEqual([1]);
    expect(ev.filter((e) => e.type === 'readyNow')).toHaveLength(1);
    expect(m.state.stage).toBe(1);
    expect(m.state.nextStageTick).toBe(100 + m.rules.stageTicks);
  });

  it('준비 단계가 아니면 무시 (1단계·패배 판), 60초를 기다리는 예전 길도 그대로', () => {
    const m = realInfinite(9);
    m.stepN(m.rules.prepTicks + 1); // 기다려서 1단계
    expect(m.state.stage).toBe(1);
    const next = m.state.nextStageTick;
    command(m, { type: 'readyNow' });
    expect(m.state.nextStageTick).toBe(next);
    expect(m.state.stage).toBe(1);
    const d = realInfinite(10);
    d.state.phase = 'defeat';
    expect(readyNow(d.ctx, d.world, 0)).toBe(false);
  });

  it('같은 명령 = 같은 결과 (결정성): 준비 완료를 넣은 두 판의 해시가 같다', () => {
    const run = (): number => {
      const m = realInfinite(11);
      m.world.enqueue({ type: 'summon', x: m.map.buildable[0]![0], y: m.map.buildable[0]![1] });
      m.world.enqueue({ type: 'readyNow', tick: 40 });
      m.stepN(800);
      return m.hash();
    };
    expect(run()).toBe(run());
  });
});

describe('준비 완료가 든 판의 리플레이', () => {
  it('추천 칸 소환 → 준비 완료 → 소환·승급을 기록해 재생하면 주기 해시·끝 해시가 같다', () => {
    const m = realInfinite(65);
    const summonRec = (): void => {
      const t = rankSummonTiles(m.ctx, m.world, 1)[0]!;
      m.world.enqueue({ type: 'summon', x: t[0], y: t[1] });
    };
    summonRec();
    m.stepN(100);
    m.world.enqueue({ type: 'readyNow' });
    m.world.enqueue({ type: 'readyNow' });
    m.stepN(200);
    for (let i = 0; i < 3; i++) {
      summonRec();
      m.stepN(20);
    }
    const w = m.towers().find((t) => m.towers().filter((x) => x.tower === t.tower).length >= 3)!;
    m.world.enqueue({ type: 'merge', x: w.tx, y: w.ty });
    m.stepN(800);
    expect(m.state.merges).toBe(1);
    expect(m.state.stage).toBe(1);
    const file = recordReplay(data, m, { name: 'ready', checkpointTicks: 100 });
    expect(file.commands.filter((c) => c.type === 'readyNow')).toHaveLength(2);
    const r = playReplay(data, JSON.parse(replayToJson(file)) as ReplayFile);
    expect(r.mismatch).toBeNull();
    expect(r.hash).toBe(m.hash());
  });
});

describe('추천 칸 순위 (rankSummonTiles = 자동 소환 점수)', () => {
  it('1등 = autoSummonTile, 점수 내림차순 → y → x, 찬 칸은 빠짐', () => {
    const m = realInfinite(1);
    const top = rankSummonTiles(m.ctx, m.world, 5);
    expect(top).toHaveLength(5);
    expect(top[0]).toEqual(autoSummonTile(m.ctx, m.world));
    const score = (t: readonly [number, number]): number => pathTilesAround(m.map, t[0], t[1], m.rules.autoSummonRadius);
    for (let i = 1; i < top.length; i++) {
      const a = top[i - 1]!;
      const b = top[i]!;
      expect(score(a) > score(b) || (score(a) === score(b) && (a[1] < b[1] || (a[1] === b[1] && a[0] < b[0])))).toBe(true);
    }
    placeTower(m.world, 'goblin', 0, top[0]![0], top[0]![1]);
    expect(rankSummonTiles(m.ctx, m.world, 1)[0]).toEqual(top[1]);
    expect(rankSummonTiles(m.ctx, m.world, 0)).toEqual([]);
  });
});

describe('계정 도움말 기록 (첫 승급 안내 한 번)', () => {
  it('markGuide → 저장 → 다시 읽어도 봤음, resetGuides로 다시 보기, 예전 저장(guides 없음)도 읽는다', () => {
    const st = new MemoryStorage();
    st.setItem(ACCOUNT_KEY, JSON.stringify({ v: 1, level: 3, hidden: ['h01'] }));
    const a = createAccountStore(st);
    expect(a.guideSeen(GUIDE_FIRST_MERGE)).toBe(false);
    expect(a.markGuide(GUIDE_FIRST_MERGE)).toBe(true);
    expect(a.markGuide(GUIDE_FIRST_MERGE)).toBe(false);
    const b = createAccountStore(st);
    expect(b.guideSeen(GUIDE_FIRST_MERGE)).toBe(true);
    expect(b.level()).toBe(3);
    expect(b.hiddenFound().has('h01')).toBe(true);
    b.resetGuides();
    expect(createAccountStore(st).guideSeen(GUIDE_FIRST_MERGE)).toBe(false);
  });
});

describe('안내 표시값', () => {
  it('추천 칸: 소환 전·타워 0개만, [준비 완료]: 준비 단계 + 타워 1개 이상 (보냈으면 sent)', () => {
    expect(showRecommended('playing', 0, 0)).toBe(true);
    expect(showRecommended('playing', 1, 0)).toBe(false);
    expect(showRecommended('playing', 0, 1)).toBe(false);
    expect(showRecommended('defeat', 0, 0)).toBe(false);
    expect(readyButtonState('playing', 0, 0, false)).toBe('hidden');
    expect(readyButtonState('playing', 0, 1, false)).toBe('ready');
    expect(readyButtonState('playing', 0, 1, true)).toBe('sent');
    expect(readyButtonState('playing', 1, 3, false)).toBe('hidden');
    expect(readyButtonState('defeat', 0, 3, false)).toBe('hidden');
  });

  it('보유 2/3 배지: 같은 종류 2개인 내 타워만 (1개·3개·레전드·남의 타워는 없음)', () => {
    const m = infinite(1, { players: 2 });
    const w = m.world;
    placeTower(w, 'goblin', 0, 1, 0);
    placeTower(w, 'goblin', 0, 2, 0);
    placeTower(w, 'archer', 0, 3, 0);
    for (const x of [4, 5, 6]) placeTower(w, 'miner', 0, x, 0);
    placeTower(w, 'dragoncaller', 0, 7, 0);
    placeTower(w, 'dragoncaller', 0, 8, 0);
    placeTower(w, 'warrior', 1, 0, 2);
    placeTower(w, 'warrior', 1, 0, 3);
    const canMerge = (id: string): boolean => !['legend', 'god', 'hidden'].includes(m.rules.towers.get(id)?.grade ?? '');
    const b = pairBadges(m.towers(), 0, m.rules.mergeCount, canMerge);
    expect(b).toEqual([
      { tx: 1, ty: 0, text: '2/3' },
      { tx: 2, ty: 0, text: '2/3' },
    ]);
  });

  it('승급 미리 보기 = sim 규칙: 결과 = 고른 타워 칸, 재료 = 그 타워를 뺀 가장 나중 2개 → 실제 merge와 같다', () => {
    const m = infinite(3);
    const ts = [1, 2, 3, 4].map((x) => placeTower(m.world, 'goblin', 0, x, 0));
    const group = sameKindTowers(m.world, 'goblin', 0);
    for (const anchor of ts) {
      const p = mergePreview(group, anchor, 3)!;
      expect(p.result).toEqual({ tx: anchor.tx, ty: anchor.ty });
      expect(p.materials).toEqual(pickConsumed(group, anchor, 2).map((t) => ({ tx: t.tx, ty: t.ty })));
    }
    // 둘째 타워를 고르면 재료 = 넷째·셋째 → merge 뒤 그 두 칸이 비고 둘째 칸에 결과
    const p = mergePreview(group, ts[1]!, 3)!;
    expect(p.materials).toEqual([
      { tx: 4, ty: 0 },
      { tx: 3, ty: 0 },
    ]);
    command(m, { type: 'merge', x: 2, y: 0 });
    const after = m.towers();
    expect(after.find((t) => t.tx === 2 && t.ty === 0)?.tower).not.toBe('goblin');
    expect(after.some((t) => t.tx === 3 || t.tx === 4)).toBe(false);
    expect(after.find((t) => t.tx === 1)?.tower).toBe('goblin');
    expect(mergePreview(group.slice(0, 2), ts[0]!, 3)).toBeNull();
  });

  it('안내 글자·결과 알림 글자 (짧게)', () => {
    expect(mergeGuideText(1, '고블린', true).title).toBe('고블린 3개 — 승급할 수 있어요!');
    expect(mergeGuideText(2, '고블린', true).body).toContain('금색 타워를 누르면 승급');
    expect(mergeGuideText(2, '고블린', false).body).toContain('[⬆ 승급]');
    const role = data.towers.towers.find((t) => t.id === 'merchant')!.role ?? '';
    const r = mergeResultText('상인', '레어', role);
    expect(r.title).toBe('⬆ 레어 상인');
    expect(r.sub.length).toBeLessThanOrEqual(46);
    expect(mergeResultText('a', '레어', '짧은 역할').sub).toBe('짧은 역할');
  });
});

describe('이번 판 기록 (개발자 도구)', () => {
  it('첫 소환·준비 완료·첫 승급은 처음 것만, 보스 등장 → 처치 / 시간 초과 남은 체력 %', () => {
    const log = newRunLog();
    recordRunEvent(log, { type: 'summon', tick: 140, stage: 0 });
    recordRunEvent(log, { type: 'summon', tick: 400, stage: 0 });
    recordRunEvent(log, { type: 'readyNow', tick: 420, left: 780 });
    recordRunEvent(log, { type: 'merge', tick: 1500, stage: 2 });
    recordRunEvent(log, { type: 'bossSpawn', tick: 11220, stage: 10, name: '박쥐 여왕' });
    expect(runLogRows(log, 11300).map((r) => `${r.label}=${r.value}`)).toEqual([
      '게임 시간=9:25',
      '첫 소환=0:07 · 준비',
      '준비 완료=0:21 · 39초 일찍',
      '첫 승급=1:15 · 2단계',
      '10단계 박쥐 여왕=등장 9:21 → 싸우는 중',
    ]);
    recordRunEvent(log, { type: 'bossTimeout', tick: 12420, stage: 10, hp: 3301, maxHp: 10000 });
    expect(runLogRows(log, 12420).at(-1)?.value).toBe('등장 9:21 → 시간 초과 · 남은 체력 34%');
    const log2 = newRunLog();
    recordRunEvent(log2, { type: 'bossSpawn', tick: 1200, stage: 10, name: '박쥐 여왕' });
    recordRunEvent(log2, { type: 'bossKill', tick: 1940, stage: 10 });
    expect(runLogRows(log2, 2000).at(-1)?.value).toBe('등장 1:00 → 처치 1:37 (37초)');
    expect(runLogRows(newRunLog(), 0).map((r) => r.value)).toEqual(['0:00', '—', '— (60초 기다림)', '—', '— (아직 없음)']);
    expect(gameClock(1200 * 61)).toBe('61:00');
  });
});

describe('문서 1장 강화·미션 완료 기준 (sim + 시트 표시값)', () => {
  it('일반 강화 Lv0: 표시 비용 50원 → 내면 Lv1, 노말·레어 공격력 +10% / 돈 부족·최대면 차감 없음', () => {
    const m = realInfinite(1);
    const row = upgradeSheetModel(m.ctx, 0).grade[0]!;
    expect(row).toMatchObject({ id: 'normal', lv: 0, levelText: 'Lv 0/50', effect: '+0% → +10%', cost: 50, costText: '50원', state: 'ok' });
    const goblin = placeTower(m.world, 'goblin', 0, m.map.buildable[0]![0], m.map.buildable[0]![1]);
    const merchant = placeTower(m.world, 'merchant', 0, m.map.buildable[1]![0], m.map.buildable[1]![1]);
    const sniper = placeTower(m.world, 'sniper', 0, m.map.buildable[2]![0], m.map.buildable[2]![1]);
    const gold = m.state.gold;
    command(m, { type: 'upgrade', k: 0 });
    expect(m.state.gold).toBe(gold - 50);
    expect(upgradeLevel(m.state, 0, 0)).toBe(1);
    const none = new Map();
    expect(towerBonus(m.ctx, goblin, none).atkPctBp).toBe(1000);
    expect(towerBonus(m.ctx, merchant, none).atkPctBp).toBe(1000);
    expect(towerBonus(m.ctx, sniper, none).atkPctBp).toBe(0);
    expect(upgradeSheetModel(m.ctx, 0).grade[0]).toMatchObject({ levelText: 'Lv 1/50', effect: '+10% → +20%', costText: '100원' });
    // 돈 부족: 99원에 100원짜리 → 그대로
    m.state.gold = 99;
    expect(upgradeSheetModel(m.ctx, 0).grade[0]!.state).toBe('gold');
    command(m, { type: 'upgrade', k: 0 });
    expect(m.state.gold).toBe(99);
    expect(upgradeLevel(m.state, 0, 0)).toBe(1);
    // 최대
    m.state.upgrades[0]![0] = 50;
    m.state.gold = 1_000_000;
    expect(upgradeSheetModel(m.ctx, 0).grade[0]).toMatchObject({ state: 'max', costText: '최대', effect: '+500% (최대)' });
    command(m, { type: 'upgrade', k: 0 });
    expect(m.state.gold).toBe(1_000_000);
    expect(upgradeLevel(m.state, 0, 0)).toBe(50);
  });

  it('미션: 달성 → 배지 → 받기 연타(같은 틱 5번·다음 틱)는 한 번만 지급, 모두 받기 연타도 한 번, 시트는 받을 것 먼저', () => {
    const m = realInfinite(2);
    const idx = (id: string): number => m.rules.missions.findIndex((x) => x.id === id);
    m.state.missionStatus[idx('n09')] = MISSION_DONE;
    m.state.missionStatus[idx('n15')] = MISSION_DONE;
    m.state.missionStatus[idx('n18')] = MISSION_DONE;
    expect(menuBadges(m.ctx, m.tick, 0).mission).toBe('3 받기');
    const sheet = missionSheetModel(m.ctx, m.world, new Set());
    expect(sheet.normal.slice(0, 3).map((r) => r.id)).toEqual(['n09', 'n15', 'n18']);
    expect(sheet.normal[0]).toMatchObject({ name: '소환 10회', reward: '+100원', status: 'done' });
    expect(sheet.normal[0]!.progressText).toMatch(/\/10$/);
    const g0 = m.state.gold;
    for (let i = 0; i < 5; i++) m.world.enqueue({ type: 'claimMission', i: idx('n09') });
    m.step();
    m.world.enqueue({ type: 'claimMission', i: idx('n09') });
    m.step();
    expect(m.state.gold).toBe(g0 + 100);
    expect(m.state.missionStatus[idx('n09')]).toBe(MISSION_CLAIMED);
    expect(menuBadges(m.ctx, m.tick, 0).mission).toBe('2 받기');
    const g1 = m.state.gold;
    for (let i = 0; i < 4; i++) m.world.enqueue({ type: 'claimAllMissions' });
    m.step();
    expect(m.state.gold).toBe(g1 + 200 + 100);
    expect(menuBadges(m.ctx, m.tick, 0).mission).toBe('');
    expect(eventsOf(m, 'missionClaim')).toHaveLength(3);
  });
});

describe('캐릭터별 크기와 이웃 칸 누르기 (문서 4장)', () => {
  const L: MapLayout = { tile: 100, originX: 0, originY: 0, minCol: 0, minRow: 0, cols: 9, rows: 11 };
  const only34 = (tx: number, ty: number): boolean => tx === 3 && ty === 4;
  const both = (tx: number, ty: number): boolean => tx === 3 && (ty === 4 || ty === 3);
  it('큰 캐릭터(×1.27)는 머리 영역이 높고 넓다: 위 칸이 비었으면 머리를 눌러도 그 타워', () => {
    const big = towerHeadZone(3, 4, 1.27);
    const base = towerHeadZone(3, 4, 1);
    expect(big.top).toBeLessThan(base.top - 0.25);
    expect(big.right - big.left).toBeGreaterThan(base.right - base.left);
    expect(tapTile(L, 350, 345, only34, () => 1.27)).toEqual({ tx: 3, ty: 4 });
    expect(tapTile(L, 350, 345, only34, () => 1)).toEqual({ tx: 3, ty: 3 });
  });
  it('위 칸에 타워가 있으면 큰 캐릭터라도 크기 1 높이까지만 → 위 타워의 칸 대부분을 누를 수 있다', () => {
    expect(towerHeadZone(3, 4, 1.27, true).top).toBeCloseTo(towerHeadZone(3, 4, 1).top, 6);
    expect(tapTile(L, 350, 345, both, (_x, y) => (y === 4 ? 1.27 : 1))).toEqual({ tx: 3, ty: 3 });
    expect(tapTile(L, 350, 380, both, (_x, y) => (y === 4 ? 1.27 : 1))).toEqual({ tx: 3, ty: 4 });
  });
  it('작은 캐릭터(×0.84)는 머리 영역이 낮다: 위 칸 아래쪽 0.3칸은 위 칸', () => {
    expect(tapTile(L, 350, 370, only34, () => 0.84)).toEqual({ tx: 3, ty: 3 });
    expect(tapTile(L, 350, 392, only34, () => 0.84)).toEqual({ tx: 3, ty: 4 });
  });
});
