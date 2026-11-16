/**
 * F10-2 첫 보스 밸런스: 무한 10단계 보스 체력 배율(데이터) · 보스 예고·비행·제한 시간 패배 글자.
 */
import { describe, expect, it } from 'vitest';
import { DataError, buildGameData, bundledRawData, type GameData, type RawGameData } from '../../src/data/load';
import { BP_ONE, mulBp } from '../../src/sim/Fixed';
import { createMatch } from '../../src/sim/match';
import { buildMatchRules, stageHp } from '../../src/sim/rules';
import { bossForStage, stageBossHpMulBp } from '../../src/sim/systems/BossSchedule';
import { bossSpawnStats } from '../../src/sim/systems/Spawn';
import { bossBar, bossHudInput, defeatText } from '../../src/ui/hud/hudModel';
import { bossCounterTip, bossFlyLabel, bossHpLeftPct, bossPreviewText, bossTimeoutText, hasBatchim } from '../../src/ui/messages';
import { data, jumpToStage } from '../helpers/match';

const rules = buildMatchRules(data);
const mul10 = data.enemies.bossCycle.stageHpMul?.['10'] ?? 1;

function withMul(d: GameData, m: Record<string, number> | undefined): GameData {
  const bossCycle = { ...d.enemies.bossCycle };
  if (m) bossCycle.stageHpMul = m;
  else delete bossCycle.stageHpMul;
  return { ...d, enemies: { ...d.enemies, bossCycle } };
}

describe('10단계 첫 보스 체력 배율 (enemies.json bossCycle.stageHpMul)', () => {
  it('데이터: 10단계 배율이 있고 1 이하 (첫 보스를 쉽게 하는 손잡이)', () => {
    expect(data.enemies.bossCycle.stageHpMul?.['10']).toBeDefined();
    expect(mul10).toBeGreaterThan(0);
    expect(mul10).toBeLessThanOrEqual(1);
  });

  it('무한 10단계만 배율, 순환으로 다시 나오는 박쥐 여왕(70·130단계)·20단계·캠페인은 ×1', () => {
    expect(stageBossHpMulBp(rules, 'infinite', 10)).toBe(Math.round(mul10 * BP_ONE));
    for (const s of [20, 30, 70, 130]) expect(stageBossHpMulBp(rules, 'infinite', s)).toBe(BP_ONE);
    expect(stageBossHpMulBp(rules, 'campaign', 10)).toBe(BP_ONE);
    // 70단계도 박쥐 여왕 (대장 순환 6명 → 7번째 = 다시 첫째)
    expect(bossForStage(rules, 'infinite', 0, 70)?.id).toBe('batqueen');
  });

  it('실제 판: 10단계 박쥐 여왕 체력 = HP(10) × 45 × 배율, 70단계 박쥐 여왕은 원래 식', () => {
    const m = createMatch(data, { seed: 3, mode: 'infinite', debug: true });
    jumpToStage(m, 10);
    const bq = rules.bosses.get('batqueen')!;
    const want = mulBp(mulBp(mulBp(stageHp(rules, 10), bq.hpMulBp), BP_ONE), Math.round(mul10 * BP_ONE));
    expect(m.state.bossId).toBe('batqueen');
    expect(m.state.bossMaxHp).toBe(want);
    // 배율이 없는 기준 빌드와 비교: 10단계만 다르고 20단계 킹 슬라임·70단계 박쥐 여왕은 같다
    const base = withMul(data, undefined);
    const baseRules = buildMatchRules(base);
    const ctx = { rules, theme: m.ctx.theme };
    const baseCtx = { rules: baseRules, theme: m.ctx.theme };
    expect(bossSpawnStats(baseCtx, bq, 10).hp).toBe(mulBp(stageHp(rules, 10), bq.hpMulBp));
    expect(bossSpawnStats(ctx, bq, 70, stageBossHpMulBp(rules, 'infinite', 70)).hp).toBe(bossSpawnStats(baseCtx, bq, 70).hp);
    const ks = rules.bosses.get('kingslime')!;
    expect(bossSpawnStats(ctx, ks, 20, stageBossHpMulBp(rules, 'infinite', 20)).hp).toBe(bossSpawnStats(baseCtx, ks, 20).hp);
  });

  it('배율이 없으면 ×1 (예전 데이터 그대로)', () => {
    const r = buildMatchRules(withMul(data, undefined));
    expect(stageBossHpMulBp(r, 'infinite', 10)).toBe(BP_ONE);
  });

  it('데이터 검사: 보스 단계가 아닌 키·범위 밖 값은 오류', () => {
    const issuesFor = (m: Record<string, number>): string[] => {
      const raw = structuredClone(bundledRawData()) as RawGameData;
      (raw.enemies as { bossCycle: { stageHpMul?: Record<string, number> } }).bossCycle.stageHpMul = m;
      try {
        buildGameData(raw);
      } catch (e) {
        expect(e).toBeInstanceOf(DataError);
        return (e as DataError).issues.map((i) => `${i.path} ${i.message}`);
      }
      return [];
    };
    expect(issuesFor({ '15': 0.5 }).some((x) => x.startsWith('bossCycle.stageHpMul.15') && x.includes('보스 단계'))).toBe(true);
    expect(issuesFor({ '20': 0 }).some((x) => x.includes('stageHpMul') && x.includes('20'))).toBe(true);
    expect(issuesFor({ x: 0.5 }).length).toBeGreaterThan(0);
    expect(issuesFor({ '10': 0.5, '20': 2 })).toEqual([]);
  });
});

describe('보스 예고·비행·제한 시간 글자 (F10-2)', () => {
  it('보스 예고: 이름 + 대응 한 줄 (박쥐 여왕 대응은 비행 사거리 칸 수와 맞음)', () => {
    const bq = rules.bosses.get('batqueen')!;
    expect(bossPreviewText(bq.name)).toBe('⚠ 다음 단계 보스: 박쥐 여왕');
    expect(bossCounterTip(bq.counter)).toBe('💡 날 때는 사거리 2칸 이하 타워가 못 때려요 · 원거리 물리 타워를 길목에');
    const flyRange = Number((bq.params as { flyBlockRange: number }).flyBlockRange);
    expect(bq.counter).toContain(`사거리 ${flyRange}칸 이하`);
    for (const id of rules.bossOrder) expect(rules.bosses.get(id)!.counter.length).toBeGreaterThan(5);
  });

  it('비행 표시: 날아오른 동안만 보스 막대 아래 글자', () => {
    expect(bossFlyLabel(2)).toBe('🦇 비행 중 · 사거리 2칸 이하 공격 불가');
    const state = { bossId: 'batqueen', bossMaxHp: 1000, bossDeadline: 1200 };
    const flying = bossHudInput(rules, {}, state, [{ boss: true, hp: 600, challenge: 0, flyUntil: 110, flyBlock: 2000 }], 100);
    expect(flying?.flyRange).toBe(2);
    expect(bossBar(true, flying, { timerWarnSeconds: 10 }).bossNote).toBe('🦇 비행 중 · 사거리 2칸 이하 공격 불가');
    const landed = bossHudInput(rules, {}, state, [{ boss: true, hp: 600, challenge: 0, flyUntil: 100, flyBlock: 2000 }], 100);
    expect(landed?.flyRange).toBeUndefined();
    expect(bossBar(true, landed, { timerWarnSeconds: 10 }).bossNote).toBe('');
    expect(bossBar(true, null, { timerWarnSeconds: 10 }).bossNote).toBe('');
  });

  it('제한 시간 패배: 사유 + 남은 체력 % (올림) + 대응', () => {
    expect(bossTimeoutText('박쥐 여왕', 60, 34)).toBe('박쥐 여왕을 60초 안에 잡지 못했어요 · 남은 체력 34%');
    expect(bossTimeoutText('나비', 60, 5)).toBe('나비를 60초 안에 잡지 못했어요 · 남은 체력 5%');
    expect(hasBatchim('여왕')).toBe(true);
    expect(hasBatchim('용사')).toBe(false);
    expect(hasBatchim('golem')).toBe(false);
    expect(bossHpLeftPct(3366, 10000)).toBe(34);
    expect(bossHpLeftPct(1, 10000)).toBe(1); // 조금이라도 남으면 0%로 보이지 않는다
    expect(bossHpLeftPct(0, 10000)).toBe(0);
    expect(bossHpLeftPct(20000, 10000)).toBe(100);
    const st = { mode: 'infinite' as const, theme: 0, stage: 10, defeatReason: 'bossTime' as const, mobLimit: 150 };
    const t = defeatText(st, { name: '박쥐 여왕', hp: 3366, maxHp: 10000, seconds: 60, counter: '원거리 물리 타워를 길목에' });
    expect(t).toEqual({ reason: '박쥐 여왕을 60초 안에 잡지 못했어요 · 남은 체력 34%', record: '10단계까지 버텼어요', tip: '💡 원거리 물리 타워를 길목에' });
    // 보스 정보가 없으면 예전 글자, 다른 패배에는 대응 줄 없음
    expect(defeatText(st).reason).toBe('10단계 보스를 제한 시간 안에 잡지 못했어요');
    expect(defeatText({ ...st, defeatReason: 'mobLimit' }, { name: 'x', hp: 1, maxHp: 2, seconds: 60, counter: 'c' }).tip).toBe('');
  });
});
