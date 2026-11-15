/**
 * M4-3b 조합 편대 (등장 규칙·예고 10초 전·구성 = 데이터) + M4-5a 보스 배치 (무한 순환표·캠페인 배치표·대체 보스).
 */
import { describe, expect, it } from 'vitest';
import { listMobs } from '../../src/sim/entities/Mob';
import { buildMatchRules } from '../../src/sim/rules';
import { bossForStage, fallbackBoss, infiniteBossId, scheduledBossId } from '../../src/sim/systems/BossSchedule';
import { eligibleFormations, formationFromStage } from '../../src/sim/systems/Formation';
import { campaign, data, eventsOf, infinite, jumpToStage } from '../helpers/match';

const rules = buildMatchRules(data);
const ids = (stage: number, mode = 'infinite', theme = 0): string[] => eligibleFormations(rules, stage, mode, theme).map((f) => f.id);

describe('편대 등장 규칙 (ENEMIES.md 3.4)', () => {
  it('편대 6종, 구성 합계 20칸', () => {
    expect(rules.formations.map((f) => f.id)).toEqual(['breakthrough', 'fortress', 'shadowraid', 'splitstorm', 'ironmarch', 'magicwall']);
    for (const f of rules.formations) expect(f.mix.reduce((a, [, n]) => a + n, 0)).toBe(20);
  });

  it('무한: 45단계부터 5의 배수(보스 단계 제외), 그 단계까지 열린 편대 중', () => {
    expect(ids(40)).toEqual([]); // 보스 단계이자 45 이전
    expect(ids(44)).toEqual([]);
    expect(ids(45)).toEqual(['breakthrough']);
    expect(ids(46)).toEqual([]);
    expect(ids(50)).toEqual([]); // 보스 단계
    expect(ids(55)).toEqual(['breakthrough', 'fortress', 'shadowraid']);
    expect(ids(75)).toHaveLength(6);
  });

  it('캠페인 테마 t: from − 5 × (t − 1), 최소 25단계', () => {
    const f = rules.formations[0]!;
    expect(formationFromStage(rules, f, 'campaign', 1)).toBe(45);
    expect(formationFromStage(rules, f, 'campaign', 3)).toBe(35);
    expect(formationFromStage(rules, f, 'campaign', 10)).toBe(25); // 45 − 45 = 0 → 최소 25
    expect(ids(45, 'campaign', 1)).toEqual(['breakthrough']);
    expect(ids(35, 'campaign', 1)).toEqual([]);
    expect(ids(35, 'campaign', 3)).toEqual(['breakthrough']);
    expect(ids(25, 'campaign', 10)).toHaveLength(6);
  });

  it('45단계 편대 = 돌파 편대 데이터 그대로 (보석 골렘 5·고블린 12칸 × 3·박쥐 3 = 44마리)', () => {
    const m = infinite(5);
    jumpToStage(m, 45);
    expect(m.state.formation).toBe('breakthrough');
    expect(eventsOf(m, 'formationStart')[0]).toMatchObject({ stage: 45, id: 'breakthrough' });
    m.stepN(1000);
    const mobs = listMobs(m.world).filter((x) => x.stage === 45);
    const count = (id: string) => mobs.filter((x) => x.mob === id).length;
    expect(count('gemgolem')).toBe(5);
    expect(count('goblin')).toBe(36);
    expect(count('bat')).toBe(3);
  });

  it('예고: 다음 단계 시작 10초(200틱) 전에 formationPreview, 예고한 편대가 그대로 나온다', () => {
    const m = infinite(8);
    jumpToStage(m, 44);
    const start45 = m.state.nextStageTick;
    m.world.drainEvents();
    while (m.tick < start45 - 200) m.step();
    expect(eventsOf(m, 'formationPreview')).toHaveLength(0);
    m.step(); // 틱 start45 − 200
    const pv = eventsOf(m, 'formationPreview');
    expect(pv).toHaveLength(1);
    expect(pv[0]).toMatchObject({ stage: 45, id: 'breakthrough', tick: start45 - 200 });
    while (m.state.stage < 45) m.step();
    expect(m.state.formation).toBe('breakthrough');
  });

  it('55단계: 등장 가능한 3종 중 하나 (시드마다 세계 난수), 같은 시드는 같은 편대', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const a = infinite(seed);
      jumpToStage(a, 55);
      const b = infinite(seed);
      jumpToStage(b, 55);
      expect(a.state.formation).toBe(b.state.formation);
      seen.add(a.state.formation);
    }
    expect([...seen].sort()).toEqual(['breakthrough', 'fortress', 'shadowraid']);
  });

  it('편대 단계가 아니면 세계 난수를 쓰지 않는다 (예고 시각이 지나도 몹 등장 순서가 그대로)', () => {
    const a = infinite(3);
    jumpToStage(a, 11);
    const before = a.world.rng('world').snapshot();
    a.stepN(1100); // 12단계 예고 시각 지남, 12단계는 편대 아님
    expect(a.world.rng('world').snapshot()).toEqual(before);
  });
});

describe('무한 보스 순환 (ENEMIES.md 4.1)', () => {
  it('10의 배수 = 대장 6명 순환 (50의 배수는 빼고 셈)', () => {
    const at = (s: number) => infiniteBossId(rules, s);
    expect([10, 20, 30, 40, 60, 70, 80, 90, 110, 120].map(at)).toEqual([
      'batqueen',
      'kingslime',
      'ancientgolem',
      'wraithlord',
      'chaosdragon',
      'grax',
      'batqueen',
      'kingslime',
      'ancientgolem',
      'wraithlord',
    ]);
  });

  it('50의 배수 = 4천왕 순환 (250의 배수는 빼고 셈), 250의 배수 = 군주', () => {
    const at = (s: number) => infiniteBossId(rules, s);
    expect([50, 100, 150, 200, 250, 300, 350, 500].map(at)).toEqual(['zephira', 'morgath', 'nocturne', 'gordam', 'nox', 'zephira', 'morgath', 'nox']);
    expect(at(15)).toBe('');
    expect(at(0)).toBe('');
  });

  it('데이터가 없는 보스(그락스·4천왕·군주 = M6)는 같은 자리의 기본 보스로 대신한다', () => {
    expect(fallbackBoss(rules, 50).id).toBe('chaosdragon');
    expect(fallbackBoss(rules, 70).id).toBe('batqueen');
    expect(fallbackBoss(rules, 100).id).toBe('chaosdragon');
    expect(bossForStage(rules, 'infinite', 0, 70)?.id).toBe('batqueen');
    expect(bossForStage(rules, 'infinite', 0, 40)?.id).toBe('wraithlord');
    expect(bossForStage(rules, 'infinite', 0, 41)).toBeNull();
  });

  it('캠페인: 테마 배치표 이름 → id (테마 1: 10 박쥐 여왕 · 20 킹 슬라임 · 30 고대 골렘 · 40 망령 군주)', () => {
    expect([10, 20, 30, 40].map((s) => scheduledBossId(rules, 'campaign', 1, s))).toEqual(['batqueen', 'kingslime', 'ancientgolem', 'wraithlord']);
    expect(scheduledBossId(rules, 'campaign', 2, 10)).toBe('ancientgolem');
    expect(scheduledBossId(rules, 'campaign', 1, 50)).toBe(''); // 선봉장 그락스 (M6)
    expect(bossForStage(rules, 'campaign', 1, 50)?.id).toBe('chaosdragon');
    const m = campaign(1, 4);
    jumpToStage(m, 10);
    expect(listMobs(m.world).find((x) => x.boss)?.mob).toBe('batqueen');
  });
});
