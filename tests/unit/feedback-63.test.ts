/**
 * 피드백 #63 — '레어 이하 자동 승급, 유니크 이하 자동 승급... 기능 넣기' (이슈 제목만, 판 기록 JSON 없음 → 리플레이 재현 대상 없음).
 * 화면 설정 '자동 승급'(노말 / 레어 이하 / 유니크 이하, 기본 꺼짐)을 켜면 화면이 그 등급 이하의 가득 찬 무더기에 **평소 mergeStack 명령**을
 * 보낸다 → sim 규칙·명령 종류는 그대로, 리플레이에는 명령이 그대로 남는다. 자동 판매(피드백 #46)와 겹치는 등급은 판매보다 승급이 먼저
 * (그 등급은 팔지 않는다). 새 판을 시작하면 자동 판매처럼 꺼짐으로 돌아간다(피드백 #62).
 */
import { describe, expect, it } from 'vitest';
import {
  AUTO_MERGE_KEYS,
  DEFAULT_SETTINGS,
  MATCH_SETTING_KEYS,
  SETTINGS_KEY,
  autoMergeChoice,
  autoMergeRank,
  autoSellMinRank,
  createSettingsStore,
  parseSettings,
  resetMatchSettings,
  type Settings,
} from '../../src/meta/settings';
import { MemoryStorage } from '../../src/save/storage';
import type { Tower } from '../../src/sim/entities/Tower';
import type { Match } from '../../src/sim/match';
import { autoMergeStacks, fullStacks } from '../../src/sim/systems/Merge';
import { placeTower } from '../../src/sim/systems/Summon';
import { gradeRank } from '../../src/sim/rules';
import { playReplay, recordReplay, replayToJson } from '../../src/sim/replay';
import { arena, arenaData, command, infinite } from '../helpers/match';

const S = (o: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...o });

function stack(m: Match, id: string, pad: number, n: number, owner = 0): Tower[] {
  const [x, y] = m.map.buildable[pad]!;
  const out: Tower[] = [];
  for (let i = 0; i < n; i++) out.push(placeTower(m.world, id, owner, x, y));
  return out;
}

describe('자동 승급 설정 (rtd.settings v2에 필드만 추가)', () => {
  it('기본 꺼짐 · 키가 없는 v2 저장값도 꺼짐 · 불리언이 아니면 꺼짐 · 켠 값은 읽힌다', () => {
    for (const k of AUTO_MERGE_KEYS) expect(DEFAULT_SETTINGS[k]).toBe(false);
    expect(parseSettings(null)).toMatchObject({ autoMergeNormal: false, autoMergeRare: false, autoMergeUnique: false });
    // v0.1.18까지의 v2 저장값 (자동 승급 키 없음) — 다른 값은 그대로
    expect(parseSettings('{"v":2,"tapMerge":true,"autoSellRare":true}')).toEqual(S({ tapMerge: true, autoSellRare: true }));
    expect(parseSettings('{"v":2,"autoMergeRare":"yes","autoMergeUnique":1}')).toEqual(S({}));
    expect(parseSettings('{"v":2,"autoMergeRare":true}')).toEqual(S({ autoMergeRare: true }));
    // v1 이전 값의 바로 승급 꺼짐 이전(피드백 #17)은 그대로, 자동 승급 값은 따른다
    expect(parseSettings('{"tapMerge":true,"autoMergeNormal":true}')).toEqual(S({ autoMergeNormal: true }));
  });

  it('autoMergeRank: 켜진 것 중 가장 높은 등급 번호 (노말 1 · 레어 2 · 유니크 3), 모두 꺼짐이면 0', () => {
    expect(autoMergeRank(S({}))).toBe(0);
    expect(autoMergeRank(S({ autoMergeNormal: true }))).toBe(1);
    expect(autoMergeRank(S({ autoMergeRare: true }))).toBe(2);
    expect(autoMergeRank(S({ autoMergeUnique: true }))).toBe(3);
    expect(autoMergeRank(S({ autoMergeNormal: true, autoMergeUnique: true }))).toBe(3);
    // 등급 번호는 sim rules.gradeRank와 같다
    expect([gradeRank('normal'), gradeRank('rare'), gradeRank('unique')]).toEqual([1, 2, 3]);
  });

  it('autoMergeChoice: 하나만 고른다 (다른 둘은 꺼짐), null = 모두 꺼짐', () => {
    expect(autoMergeChoice('rare')).toEqual({ autoMergeNormal: false, autoMergeRare: true, autoMergeUnique: false });
    expect(autoMergeChoice('unique')).toEqual({ autoMergeNormal: false, autoMergeRare: false, autoMergeUnique: true });
    expect(autoMergeChoice(null)).toEqual({ autoMergeNormal: false, autoMergeRare: false, autoMergeUnique: false });
  });

  it('새 판을 시작하면 자동 판매처럼 꺼짐으로 (피드백 #62 규칙), 바로 승급은 그대로', () => {
    for (const k of AUTO_MERGE_KEYS) expect(MATCH_SETTING_KEYS).toContain(k);
    const st = new MemoryStorage();
    const s = createSettingsStore(st);
    s.set('tapMerge', true);
    s.set('autoMergeUnique', true);
    s.set('autoMergeNormal', true);
    resetMatchSettings(s);
    expect(s.get()).toEqual(S({ tapMerge: true }));
    expect(JSON.parse(st.getItem(SETTINGS_KEY) ?? '{}')).toMatchObject({ v: 2, autoMergeNormal: false, autoMergeUnique: false });
  });
});

describe('자동 판매와 함께 (승급이 먼저)', () => {
  it('autoSellMinRank: 자동 승급이 맡는 등급은 팔지 않는다 — 판매는 그보다 높은 등급부터', () => {
    expect(autoSellMinRank(S({ autoSellRare: true }))).toBe(1);
    expect(autoSellMinRank(S({ autoSellRare: true, autoMergeNormal: true }))).toBe(2);
    expect(autoSellMinRank(S({ autoSellRare: true, autoMergeRare: true }))).toBe(3);
    expect(autoSellMinRank(S({ autoSellNormal: true, autoMergeUnique: true }))).toBe(4);
  });
});

describe('자동 승급할 무더기 고르기 (autoMergeStacks — 상태를 바꾸지 않는 읽기)', () => {
  it('레어 이하: 노말·레어 가득 찬 무더기만 (바닥 ID 순), 유니크·덜 찬 칸·남의 칸은 빼고', () => {
    const m = arena(63, { players: 2 });
    stack(m, 'merchant', 0, 3); // 레어
    stack(m, 'icemage', 1, 3); // 유니크
    stack(m, 'goblin', 2, 3); // 노말
    stack(m, 'archer', 3, 2); // 덜 참
    stack(m, 'goblin', 4, 3, 1); // 남의 것
    const g = (id: string) => m.rules.towers.get(id)!.grade;
    expect([g('merchant'), g('icemage'), g('goblin')]).toEqual(['rare', 'unique', 'normal']);
    const picked = autoMergeStacks(m.ctx, m.world, 0, 2).map((st) => st[0]!.tower);
    expect(picked).toEqual(['merchant', 'goblin']);
    expect(autoMergeStacks(m.ctx, m.world, 0, 1).map((st) => st[0]!.tower)).toEqual(['goblin']);
    expect(autoMergeStacks(m.ctx, m.world, 0, 3)).toHaveLength(3);
    expect(autoMergeStacks(m.ctx, m.world, 0, 0)).toEqual([]);
    // 상태를 바꾸지 않는다
    expect(fullStacks(m.ctx, m.world, 0)).toHaveLength(3);
  });

  it('판이 끝났으면 없음', () => {
    const m = arena(64);
    stack(m, 'goblin', 0, 3);
    m.state.phase = 'defeat';
    expect(autoMergeStacks(m.ctx, m.world, 0, 3)).toEqual([]);
  });

  it('화면처럼 고른 칸에 평소 mergeStack 명령을 되풀이 → 기준 이하가 남지 않고, 리플레이 왕복이 같은 해시', () => {
    const m = infinite(6301, { debug: true });
    command(m, { type: 'debugAddGold', amount: 500_000 });
    for (let i = 0; i < 24; i++) command(m, { type: 'summonAuto' });
    let sent = 0;
    for (let guard = 0; guard < 50; guard++) {
      const st = autoMergeStacks(m.ctx, m.world, 0, 2)[0];
      if (!st) break;
      command(m, { type: 'mergeStack', x: st[0]!.tx, y: st[0]!.ty });
      sent++;
    }
    expect(sent).toBeGreaterThan(0);
    expect(autoMergeStacks(m.ctx, m.world, 0, 2)).toEqual([]);
    expect(m.world.drainEvents().filter((e) => e.type === 'mergeFail')).toEqual([]);
    m.stepN(60);
    const r = playReplay(arenaData, JSON.parse(replayToJson(recordReplay(arenaData, m, { name: 'fb63-auto-merge' }))));
    expect(r.mismatch).toBeNull();
    expect(r.hash).toBe(m.hash());
  });
});
