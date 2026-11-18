/**
 * M5 화면 모델 (순수): 하단 메뉴 배지, 도전·강화·도박·미션 시트 표시값, 도전 보스 막대, 바텀 시트 끌기, 길게 눌러 연속 간격,
 * 도박 슬롯 연출, 계정 저장소(계정 레벨·히든 미션 영구 기록), M5 알림 문구.
 */
import { describe, expect, it } from 'vitest';
import { createAccountStore, ACCOUNT_KEY } from '../../src/meta/account';
import { BrowserStorage, MemoryStorage } from '../../src/save/storage';
import { MISSION_CLAIMED, MISSION_DONE } from '../../src/sim/state';
import { listMobs } from '../../src/sim/entities/Mob';
import { buildHudModel, challengeBar } from '../../src/ui/hud/hudModel';
import { HOLD_DELAY_MS, HOLD_MIN_MS, HOLD_START_MS, holdRepeatDelay } from '../../src/ui/hold';
import {
  challengeFailText,
  challengeClearText,
  gambleJackpotText,
  gambleResultText,
  hiddenMissionText,
  missionClaimText,
  missionDoneText,
  needGoldForSummon,
  upgradeFailText,
} from '../../src/ui/messages';
import { placeTower } from '../../src/sim/systems/Summon';
import { SHEET_DRAG_RATIO, sheetDragResult } from '../../src/ui/sheets/BottomSheet';
import {
  abilityLine,
  challengeNote,
  challengeHudInput,
  challengeSheetModel,
  gambleSheetModel,
  menuBadges,
  missionSheetModel,
  missionTabLabels,
  mulText,
  pctText,
  sortMissionRows,
  statCapNote,
  upgradeSheetModel,
  type MissionRowModel,
} from '../../src/ui/sheets/sheetModels';
import { SLOT_SPIN_MS, SLOT_STEP_MS, slotFrame } from '../../src/ui/sheets/slot';
import { arena, command, data, infinite } from '../helpers/match';

const hudCfg = data.game.hud;
const abilities = new Map(data.enemies.challenges.map((c) => [c.level, c.ability]));

describe('숫자 표시', () => {
  it('pctText: bp → 퍼센트 (소수 둘째 자리까지, 끝 0 뺌)', () => {
    expect(pctText(400)).toBe('4');
    expect(pctText(1050)).toBe('10.5');
    expect(pctText(5)).toBe('0.05');
    expect(pctText(20000)).toBe('200');
    expect(pctText(-250)).toBe('-2.5');
  });

  it('mulText: 배율 bp → ×2.6 (내림)', () => {
    expect(mulText(26000)).toBe('×2.6');
    expect(mulText(10400)).toBe('×1.04');
    expect(mulText(5000)).toBe('×0.5');
    expect(mulText(0)).toBe('×0');
    expect(mulText(50000)).toBe('×5');
    expect(mulText(12349)).toBe('×1.23');
  });
});

describe('하단 메뉴 배지 (M5-7)', () => {
  it('판 시작: 도전 1 가능 · 강화 Lv 0 · 미션 배지 없음', () => {
    const m = arena();
    expect(menuBadges(m.ctx, m.tick, 0)).toEqual({ challenge: '1 가능', challengeAlert: true, upgrade: 'Lv 0', mission: '', missionAlert: false });
  });

  it('도전 진행 중 · 강화 레벨 합 · 받을 미션 수', () => {
    const m = arena();
    m.state.gold = 2000; // 보유금 미션(3,000원)이 달성되지 않게
    command(m, { type: 'upgrade', k: 0, player: 0 });
    command(m, { type: 'upgrade', k: 3, player: 0 });
    command(m, { type: 'startChallenge', lv: 1, player: 0 });
    m.state.missionStatus[0] = MISSION_DONE;
    m.state.missionStatus[1] = MISSION_DONE;
    m.state.missionStatus[2] = MISSION_CLAIMED;
    const b = menuBadges(m.ctx, m.tick, 0);
    expect(b.challenge).toBe('진행 중');
    expect(b.challengeAlert).toBe(false);
    expect(b.upgrade).toBe('Lv 2');
    expect(b.mission).toBe('2 받기');
    expect(b.missionAlert).toBe(true);
  });

  it('HUD 모델이 배지를 그대로 싣는다 (생략하면 빈 배지)', () => {
    const m = arena();
    const base = { state: m.state, ticksLeft: 100, mobCount: 0, tick: m.tick, speed: 1 };
    expect(buildHudModel(base, hudCfg)).toMatchObject({ menuChallenge: '', menuUpgrade: '', menuMission: '' });
    const withMenu = buildHudModel({ ...base, menu: menuBadges(m.ctx, m.tick, 0) }, hudCfg);
    expect(withMenu).toMatchObject({ menuChallenge: '1 가능', menuChallengeAlert: true, menuUpgrade: 'Lv 0' });
  });
});

describe('⚔ 도전 시트', () => {
  it('처음: 1단계 [시작], 나머지 🔒, 진행 줄 없음, 능력 글자는 ** 제거', () => {
    const m = arena();
    const s = challengeSheetModel(m.ctx, m.tick, abilities);
    expect(s.activeText).toBe('');
    expect(s.rows).toHaveLength(10);
    expect(s.rows[0]).toMatchObject({ lv: 1, name: '황금 슬라임', hp: '체력 2,700', reward: '+20원', state: 'ready', label: '시작', cleared: false });
    expect(s.rows[1]).toMatchObject({ state: 'locked', label: '🔒' });
    expect(s.rows[8]?.ability).toBe('투명 (감지 필요)');
    expect(s.rows[0]?.ability).toBe('(입문용)');
    expect(abilityLine('— (입문용)')).toBe('(입문용)');
  });

  it('진행 중: 맨 위 "진행 중 · 1단계 황금 슬라임 · 30초", 그 단계 진행 중, 열린 다른 단계는 대기', () => {
    const m = arena();
    m.state.challengeOpen = 2;
    command(m, { type: 'startChallenge', lv: 1, player: 0 });
    const s = challengeSheetModel(m.ctx, m.tick, abilities);
    expect(s.activeText).toBe('진행 중 · 1단계 황금 슬라임 · 30초');
    expect(s.activeSec).toBe(30);
    expect(s.rows[0]).toMatchObject({ state: 'active', label: '진행 중' });
    expect(s.rows[1]).toMatchObject({ state: 'busy', label: '대기' });
  });

  it('끝난 단계: 쿨타임 ⏳5:00, 처치하면 ✅', () => {
    const m = arena();
    command(m, { type: 'startChallenge', lv: 1, player: 0 });
    const boss = listMobs(m.world).find((e) => e.challenge === 1)!;
    boss.hp = 1;
    m.state.challengeBest = 1; // 처치 표시만 확인
    m.world.entities.remove(boss.id);
    m.stepN(600); // 시간 초과로 끝남 → 쿨타임
    const s = challengeSheetModel(m.ctx, m.tick, abilities);
    expect(s.rows[0]?.state).toBe('cooldown');
    expect(s.rows[0]?.label).toMatch(/^⏳[45]:\d\d$/);
    expect(s.rows[0]?.cleared).toBe(true);
  });

  it('도전 보스 막대 입력: 진행 중일 때만, 쌍둥이는 한 마리 체력', () => {
    const m = arena();
    expect(challengeHudInput(m.ctx, listMobs(m.world), m.tick)).toBeNull();
    m.state.challengeOpen = 4;
    command(m, { type: 'startChallenge', lv: 4, player: 0 });
    const c = challengeHudInput(m.ctx, listMobs(m.world), m.tick);
    expect(c).toMatchObject({ lv: 4, name: '쌍둥이 박쥐', hp: 28750, maxHp: 28750 });
    expect(c!.ticksLeft).toBe(600 - 1);
    const bar = challengeBar(c, hudCfg);
    expect(bar).toEqual({ challengeBanner: '⚔ 도전 4단계 「쌍둥이 박쥐」', challengeHp: 1000, challengeTime: '30초', challengeTimeWarn: false });
    expect(challengeBar({ lv: 1, name: 'a', hp: 1350, maxHp: 2700, ticksLeft: 100 }, hudCfg)).toMatchObject({ challengeHp: 500, challengeTime: '5초', challengeTimeWarn: true });
    expect(challengeBar(null, hudCfg)).toMatchObject({ challengeBanner: null, challengeHp: -1 });
  });
});

describe('⬆ 강화 시트', () => {
  it('등급 3줄 · 능력치 6줄 + 소환 확률(피드백 #27) · 초월은 잠겨 있으면 없음, 공속 배율 ⚡×1', () => {
    const m = arena();
    const s = upgradeSheetModel(m.ctx, 0);
    expect(s.apsMul).toBe('⚡×1');
    expect(s.grade.map((r) => r.id)).toEqual(['normal', 'hero', 'legend']);
    expect(s.stat.map((r) => r.id)).toEqual(['aps', 'armorPen', 'magicPen', 'crit', 'critDmg', 'range', 'summonLuck']);
    expect(s.transcend).toBeNull();
    expect(s.grade[0]).toMatchObject({ levelText: 'Lv 0/50', effect: '+0% → +10%', cost: 50, costText: '50원', target: '노말·레어' });
    expect(s.stat[3]).toMatchObject({ effect: '+0%p → +1%p', target: '모든 타워' });
  });

  it('비용 공식 GDD 7.1 그대로 · 돈이 모자라면 gold · 최대면 (최대)', () => {
    const m = arena();
    m.state.gold = 100_000;
    for (let j = 0; j < 4; j++) command(m, { type: 'upgrade', k: 3, player: 0 }); // 공속 4
    let s = upgradeSheetModel(m.ctx, 0);
    expect(s.stat[0]).toMatchObject({ levelText: 'Lv 4/50', effect: '+16% → +20%', cost: 100 + 60 * 4, state: 'ok' });
    expect(s.apsMul).toBe('⚡×1.16');
    m.state.gold = 0;
    s = upgradeSheetModel(m.ctx, 0);
    expect(s.stat[0]?.state).toBe('gold');
    m.state.upgrades[0]![8] = 10; // 사거리 최대
    s = upgradeSheetModel(m.ctx, 0);
    expect(s.stat[5]).toMatchObject({ effect: '+20% (최대)', cost: null, costText: '최대', state: 'max' });
  });

  it('공속 배율은 한도(×5)에서 자른다 · 초월은 등급 강화 모두 50이면 나타남', () => {
    const m = arena();
    m.state.mods[0]!.apsPctBp = 60_000;
    expect(upgradeSheetModel(m.ctx, 0).apsMul).toBe('⚡×5');
    m.state.upgrades[0]![0] = 50;
    m.state.upgrades[0]![1] = 50;
    m.state.upgrades[0]![2] = 50;
    const t = upgradeSheetModel(m.ctx, 0).transcend;
    expect(t).toMatchObject({ id: 'transcend', levelText: 'Lv 0', effect: '+0% → +5%', cost: 50000 });
  });
});

describe('🎰 도박 탭', () => {
  it('테이블 4개: 10원·100원 열림, 1000원 Lv7 · 10000원 Lv20 잠김 (계정 Lv1)', () => {
    const m = arena();
    m.state.gold = 100_000;
    const g = gambleSheetModel(m.ctx, m.world, 0);
    expect(g.tables.map((t) => [t.costText, t.range, t.state, t.lockText])).toEqual([
      ['10원', '0 ~ 50원', 'ok', ''],
      ['100원', '0 ~ 500원', 'ok', ''],
      ['1,000원', '0 ~ 5,000원', 'locked', '🔒 계정 Lv7'],
      ['10,000원', '0 ~ 50,000원', 'locked', '🔒 계정 Lv20'],
    ]);
  });

  it('계정 Lv7이면 1000원 열림, debug 판은 잠긴 테이블도 debug', () => {
    const a = arena(1, { accountLevels: [7] });
    a.state.gold = 100_000;
    expect(gambleSheetModel(a.ctx, a.world, 0).tables.map((t) => t.state)).toEqual(['ok', 'ok', 'ok', 'locked']);
    const b = arena(1, { debug: true });
    b.state.gold = 100_000;
    expect(gambleSheetModel(b.ctx, b.world, 0).tables.map((t) => t.state)).toEqual(['ok', 'ok', 'debug', 'debug']);
  });

  it('배율표·기대값 91% (잭팟 포함 실제 기대값 — M5 검토 반영) · 잭팟 게이지 · 최근 결과', () => {
    const m = arena();
    const g = gambleSheetModel(m.ctx, m.world, 0);
    expect(g.odds).toEqual([
      { mul: '×0', pct: '40%' },
      { mul: '×0.5', pct: '20%' },
      { mul: '×1', pct: '21%' },
      { mul: '×2', pct: '11%' },
      { mul: '×3', pct: '6%' },
      { mul: '×5', pct: '2%' },
    ]);
    expect(g.expectation).toBe('기대값 91% (잭팟 포함)');
    expect(g.gaugeMax).toBe(10);
    expect(g.readyText).toBe('다음 ×3 이상!');
    m.state.gamble[0]!.gauge = 10;
    m.state.gamble[0]!.recent = [0, 5000, 20000];
    const j = gambleSheetModel(m.ctx, m.world, 0);
    expect(j.jackpotReady).toBe(true);
    expect(j.odds.map((o) => o.pct)).toEqual(['0%', '0%', '0%', '0%', '75%', '25%']);
    expect(j.expectation).toBe('이번 기대값 350%');
    expect(j.recent).toEqual(['×0', '×0.5', '×2']);
  });

  it('도박꾼이 판 위에 있으면 기대값 93% (잭팟 포함), 잭팟 문구는 game.json minMul에서', () => {
    const m = arena();
    placeTower(m.world, 'gambler', 0, 4, 0);
    expect(gambleSheetModel(m.ctx, m.world, 0).expectation).toBe('기대값 93% (잭팟 포함)');
    const rules = { ...m.rules, jackpotMinMulBp: 20000 };
    expect(gambleSheetModel({ ...m.ctx, rules }, m.world, 0).readyText).toBe('다음 ×2 이상!');
  });
});

describe('📋 미션 시트', () => {
  it('일반 30 · 히든 11 (발견 전 ??? — 이름·보상·진행도 숨김)', () => {
    const m = arena();
    const s = missionSheetModel(m.ctx, m.world, new Set());
    expect(s.normal).toHaveLength(30);
    expect(s.hidden).toHaveLength(11);
    expect(s.hidden.every((r) => r.name === '???' && r.reward === '???' && r.progressText === '')).toBe(true);
    expect(s.normalSummary).toBe('달성 0/30');
    expect(s.hiddenSummary).toBe('발견 0/11');
    expect(s.normal[0]).toMatchObject({ id: 'n01', reward: '+100원', progressText: '0/5', status: 'open' });
    expect(missionTabLabels(m.rules)).toEqual({ normal: '일반 30', hidden: '히든 ???' });
  });

  it('영구 기록된 히든은 이름이 보인다 · 이번 판에 달성하면 공개', () => {
    const m = arena();
    const s = missionSheetModel(m.ctx, m.world, new Set(['h02']));
    const h02 = s.hidden.find((r) => r.id === 'h02')!;
    expect(h02).toMatchObject({ revealed: true, name: '도박 중독', reward: '+1,000원', progressText: '0/5' });
    const hi = m.rules.missions.findIndex((x) => x.id === 'h09');
    m.state.missionStatus[hi] = MISSION_DONE;
    const s2 = missionSheetModel(m.ctx, m.world, new Set());
    expect(s2.hidden[0]).toMatchObject({ id: 'h09', revealed: true, status: 'done' });
    expect(s2.hiddenSummary).toBe('발견 1/11');
  });

  it('정렬: 받을 수 있는 것 → 진행 중 → 받은 것 · 모두 받기 합계', () => {
    const m = arena();
    m.state.missionStatus[0] = MISSION_CLAIMED;
    m.state.missionStatus[5] = MISSION_DONE;
    m.state.missionStatus[8] = MISSION_DONE;
    const s = missionSheetModel(m.ctx, m.world, new Set());
    expect(s.normal.slice(0, 2).map((r) => r.id)).toEqual(['n06', 'n09']);
    expect(s.normal[29]?.id).toBe('n01');
    expect(s.claimable).toBe(2);
    expect(s.claimableTotal).toBe(500 + 100);
    expect(s.normalSummary).toBe('달성 3/30');
    const rows = [{ i: 2, status: 'claimed' }, { i: 1, status: 'open' }, { i: 0, status: 'done' }] as MissionRowModel[];
    expect(sortMissionRows(rows).map((r) => r.i)).toEqual([0, 1, 2]);
  });

  it('진행도는 sim 상태 그대로 (소환 횟수)', () => {
    const m = infinite();
    m.state.summons = 7;
    const s = missionSheetModel(m.ctx, m.world, new Set());
    expect(s.normal.find((r) => r.id === 'n09')?.progressText).toBe('7/10');
    expect(s.normal.find((r) => r.id === 'n14')?.progressText).toBe('0/60');
  });
});

describe('바텀 시트 끌기 (M5-1)', () => {
  const H = 732;
  const need = H * SHEET_DRAG_RATIO;
  it('짧게 누르면 55% ↔ 85%', () => {
    expect(sheetDragResult('half', 2, H)).toBe('full');
    expect(sheetDragResult('full', -3, H)).toBe('half');
  });
  it('위로 충분히 → 85%, 아래로 → 85%면 55%, 55%면 닫기, 조금이면 그대로', () => {
    expect(sheetDragResult('half', -need, H)).toBe('full');
    expect(sheetDragResult('full', need, H)).toBe('half');
    expect(sheetDragResult('half', need + 1, H)).toBe('close');
    expect(sheetDragResult('half', need / 2, H)).toBe('half');
    expect(sheetDragResult('full', -need * 3, H)).toBe('full');
  });
});

describe('길게 눌러 연속 간격', () => {
  it('처음 대기 → 시작 간격 → 점점 빨라져 최소 간격', () => {
    expect(holdRepeatDelay(0)).toBe(HOLD_DELAY_MS);
    expect(holdRepeatDelay(1)).toBe(HOLD_START_MS);
    expect(holdRepeatDelay(2)).toBeLessThan(HOLD_START_MS);
    expect(holdRepeatDelay(50)).toBe(HOLD_MIN_MS);
    // 최소 간격도 로직 틱(50ms)보다 길다 → 명령 하나가 실행된 뒤 다음을 보낸다
    expect(HOLD_MIN_MS).toBeGreaterThan(50);
  });
});

describe('도박 슬롯 연출 (1초)', () => {
  const symbols = ['×0', '×0.5', '×1', '×2', '×3', '×5'];
  it('1초 동안 배율을 돌고, 결과가 있으면 멈춘다 (처음 멈춘 프레임만 justRevealed)', () => {
    const s = { startMs: 1000, result: null, revealedMs: null } as Parameters<typeof slotFrame>[0];
    expect(slotFrame(s, 1000, symbols)).toEqual({ reel: '×0', spinning: true, justRevealed: false });
    expect(slotFrame(s, 1000 + SLOT_STEP_MS, symbols).reel).toBe('×0.5');
    s.result = { mul: '×2', mulBp: 20000, win: 200, cost: 100, jackpot: false };
    expect(slotFrame(s, 1000 + SLOT_SPIN_MS - 1, symbols).spinning).toBe(true);
    expect(slotFrame(s, 1000 + SLOT_SPIN_MS, symbols)).toEqual({ reel: '×2', spinning: false, justRevealed: true });
    s.revealedMs = 2000;
    expect(slotFrame(s, 2500, symbols).justRevealed).toBe(false);
  });
  it('결과가 늦으면 1초가 지나도 계속 돈다', () => {
    const s = { startMs: 0, result: null, revealedMs: null };
    expect(slotFrame(s, 5000, symbols).spinning).toBe(true);
  });
});

describe('계정 저장소 (meta/account)', () => {
  it('저장값이 없으면 계정 Lv1, 히든 기록 없음', () => {
    const a = createAccountStore(new MemoryStorage());
    expect(a.level()).toBe(1);
    expect(a.hiddenFound().size).toBe(0);
  });

  it('히든 미션 영구 기록: 새로 기록하면 true, 다시 읽어도 남아 있다', () => {
    const st = new MemoryStorage();
    const a = createAccountStore(st);
    expect(a.recordHidden('h02')).toBe(true);
    expect(a.recordHidden('h02')).toBe(false);
    const b = createAccountStore(st);
    expect([...b.hiddenFound()]).toEqual(['h02']);
    expect(JSON.parse(st.getItem(ACCOUNT_KEY)!)).toEqual({ v: 1, level: 1, hidden: ['h02'], guides: [], codex: {} });
  });

  it('저장된 계정 레벨을 읽는다 · 망가진 값은 기본값', () => {
    const st = new MemoryStorage();
    st.setItem(ACCOUNT_KEY, JSON.stringify({ v: 1, level: 7, hidden: ['h01', 3] }));
    const a = createAccountStore(st);
    expect(a.level()).toBe(7);
    expect([...a.hiddenFound()]).toEqual(['h01']);
    st.setItem(ACCOUNT_KEY, '{망가짐');
    expect(createAccountStore(st).level()).toBe(1);
    st.setItem(ACCOUNT_KEY, JSON.stringify({ level: -3 }));
    expect(createAccountStore(st).level()).toBe(1);
  });

  it('localStorage가 예외를 던져도 메모리로 이어 간다', () => {
    const broken = {
      getItem: () => {
        throw new Error('막힘');
      },
      setItem: () => {
        throw new Error('가득');
      },
      removeItem: () => {
        throw new Error('막힘');
      },
    };
    const st = new BrowserStorage(broken);
    st.setItem('k', 'v');
    expect(st.getItem('k')).toBe('v');
    st.removeItem('k');
    expect(st.getItem('k')).toBeNull();
  });
});

describe('M5 문구', () => {
  it('미션·도전·강화·도박', () => {
    expect(missionDoneText(['소환 10회'], 100)).toBe('📋 미션 달성! 소환 10회 (+100원)');
    expect(missionDoneText(['a', 'b'], 700)).toBe('📋 미션 2개 달성! (+700원)');
    expect(challengeClearText(3, 100, 4)).toBe('⚔ 도전 3단계 클리어! +100원 · 4단계 열림');
    expect(challengeClearText(10, 6000, null)).toBe('⚔ 도전 10단계 클리어! +6,000원');
    expect(challengeFailText(2, 'time', 5)).toBe('⚔ 도전 2단계 실패 — 시간 초과 · 5분 뒤 다시');
    expect(upgradeFailText('gold', 30)).toBe('30원이 더 필요해요');
    expect(upgradeFailText('locked', 0)).toBe('등급 강화 3종을 모두 최대로 올리면 열려요');
    expect(gambleResultText('×2', 200, 100)).toBe('×2 → +200원 (+100)');
    expect(gambleResultText('×0.5', 50, 100)).toBe('×0.5 → +50원 (−50)');
    expect(gambleResultText('×0', 0, 100)).toBe('×0 … 꽝! (−100원)');
  });

  it('돈은 세 자리마다 쉼표 (배너·결과도 HUD·시트와 같게 — M5 검토 반영)', () => {
    expect(missionDoneText(['a', 'b'], 1300)).toBe('📋 미션 2개 달성! (+1,300원)');
    expect(missionDoneText(['보유금 10,000원 달성'], 1000)).toBe('📋 미션 달성! 보유금 10,000원 달성 (+1,000원)');
    expect(hiddenMissionText('고블린 왕국', 1000)).toBe('🎉 히든 미션 발견! 「고블린 왕국」 +1,000원');
    expect(gambleResultText('×5', 50000, 10000)).toBe('×5 → +50,000원 (+40,000)');
    expect(gambleResultText('×0', 0, 10000)).toBe('×0 … 꽝! (−10,000원)');
    expect(gambleResultText('×0.5', 5000, 10000)).toBe('×0.5 → +5,000원 (−5,000)');
    expect(gambleJackpotText('×5', 50000)).toBe('🎰 ×5 대박! +50,000원');
    expect(missionClaimText(1300, 2)).toBe('📋 미션 2개 보상 +1,300원');
    expect(upgradeFailText('gold', 9000)).toBe('9,000원이 더 필요해요');
    expect(needGoldForSummon(1000)).toBe('1,000원이 필요해요');
  });
});

describe('M5 검토 반영: 안내 문구는 JSON 값에서, 보상 표시는 실제로 받는 돈', () => {
  it('능력치 한도 안내 = game.json combat (공속 ×5·초당 15회 · 관통 90% · 치명 100%), 값을 바꾸면 따라 바뀐다', () => {
    const m = arena();
    expect(upgradeSheetModel(m.ctx, 0).statNote).toBe('모든 타워 · 한도: 공속 ×5(초당 15회) · 관통 90% · 치명 100%');
    expect(statCapNote({ apsMaxMul: 4, apsMaxMilli: 12_500, penMaxBp: 8000, critChanceMaxBp: 7550 })).toBe(
      '모든 타워 · 한도: 공속 ×4(초당 12.5회) · 관통 80% · 치명 75.5%',
    );
  });

  it('도전 안내 = game.json challenge (30초 · 5분), 값을 바꾸면 따라 바뀐다', () => {
    const m = arena();
    expect(challengeSheetModel(m.ctx, m.tick, new Map()).note).toBe('단계마다 30초 · 끝나면 그 단계만 5분 쉬어요 · 실패해도 벌칙 없음');
    expect(challengeNote({ challengeTimeTicks: 900, challengeCooldownTicks: 1800 })).toBe('단계마다 45초 · 끝나면 그 단계만 90초 쉬어요 · 실패해도 벌칙 없음');
  });

  it('카드 \'황금 손\'(+25%)이 있으면 미션 줄 보상·[모두 받기] 합·도전 보상이 실제로 받는 돈', () => {
    const m = arena();
    m.state.goldPctBp = 2500;
    const n22 = m.rules.missions.findIndex((x) => x.id === 'n22');
    const n23 = m.rules.missions.findIndex((x) => x.id === 'n23');
    m.state.missionStatus[n22] = MISSION_DONE;
    m.state.missionStatus[n23] = MISSION_DONE;
    const s = missionSheetModel(m.ctx, m.world, new Set());
    expect(s.normal.find((r) => r.id === 'n22')?.reward).toBe('+375원'); // 300 × 1.25
    expect(s.claimableTotal).toBe(375 + 1250); // 1000 × 1.25
    expect(challengeSheetModel(m.ctx, m.tick, new Map()).rows[0]?.reward).toBe('+25원'); // 20 × 1.25
    // 실제 받기와 같다
    const g0 = m.state.gold;
    command(m, { type: 'claimAllMissions', player: 0 });
    expect(m.state.gold - g0).toBe(s.claimableTotal);
  });

  it('발견한 히든 미션은 조건 설명(desc)을 같이 보인다, 이름과 같은 일반 미션은 설명 없음', () => {
    const m = arena();
    const s = missionSheetModel(m.ctx, m.world, new Set(['h07']));
    expect(s.hidden.find((r) => r.id === 'h07')).toMatchObject({ name: '고블린 왕국', desc: '고블린 계열 타워 10개 동시 보유' });
    expect(s.hidden.find((r) => r.id === 'h02')).toMatchObject({ name: '???', desc: '' });
    expect(s.normal.find((r) => r.id === 'n01')?.desc).toBe('');
    expect(s.normal.find((r) => r.id === 'n14')?.desc).toBe('1분 동안 아무 조작도 하지 않기 (일시정지 시간 제외)');
  });
});
