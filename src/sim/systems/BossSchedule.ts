/**
 * 보스 배치 (DEV_PLAN M4-5a, ENEMIES.md 4·4.1장, CAMPAIGN.md 2.2).
 *
 * - 무한 모드 (enemies.json bossCycle):
 *   - lordEvery(250)의 배수 = 👑 군주 녹스.
 *   - commanderEvery(50)의 배수 = ⭐ 4천왕 순환 (제피라 → 모르가스 → 녹투르 → 고르담, 250의 배수는 빼고 센다).
 *   - every(10)의 배수 = 대장 순환 (박쥐 여왕 → 킹 슬라임 → 고대 골렘 → 망령 군주 → 혼돈의 용 → 선봉장 그락스, 50의 배수는 빼고 센다).
 *   → 10 박쥐 여왕, 20 킹 슬라임, 30 고대 골렘, 40 망령 군주, 60 혼돈의 용, 70 그락스, 80 박쥐 여왕 …
 * - 캠페인: campaign.json 테마별 bossSchedule (이름) → 기본 보스 id.
 * - **M4에서는 기본 보스 5종만 데이터가 있다**: 그락스·4천왕·군주·테마 30단계 대장(모래 벌레 여왕 등)은 M6. 데이터가 없는 보스 자리는
 *   같은 자리의 기본 보스로 대신한다 = bosses[].stage가 ((s − 10) mod 50) + 10 인 보스 (50 → 혼돈의 용, 70 → 박쥐 여왕).
 *   M6에서 보스 데이터를 넣으면 이 대체 없이 바로 그 보스가 나온다 (훅 = scheduledBossId).
 * - ENEMIES.md 4장 표의 '기본 단계'(10 킹 슬라임 …)는 표 이름표다. 실제 순서는 무한 = 4.1 순환, 캠페인 = 테마 배치표를 따른다
 *   (M1 기록의 '문서끼리 다른 점' 결정).
 */
import { isBossStage, type BossStats, type MatchRules } from '../rules';

/** 순환표에서 그 단계의 보스 id (데이터가 없을 수도 있다: grax·zephira·nox …). 보스 단계가 아니면 ''. */
export function infiniteBossId(rules: MatchRules, stage: number): string {
  const c = rules.bossCycle;
  if (stage <= 0 || stage % c.every !== 0) return '';
  if (stage % c.lordEvery === 0) return c.lord;
  if (stage % c.commanderEvery === 0) {
    // 50의 배수 중 250의 배수를 뺀 몇 번째인가 (1부터)
    const k = stage / c.commanderEvery - Math.floor(stage / c.lordEvery);
    return c.commanders[(k - 1) % c.commanders.length] as string;
  }
  // 10의 배수 중 50의 배수를 뺀 몇 번째인가 (1부터)
  const k = stage / c.every - Math.floor(stage / c.commanderEvery);
  return c.captains[(k - 1) % c.captains.length] as string;
}

/** 그 판에서 그 단계에 나와야 하는 보스 id (무한 = 순환표, 캠페인 = 테마 배치표 이름 → id, 모르는 이름이면 ''). */
export function scheduledBossId(rules: MatchRules, mode: string, theme: number, stage: number): string {
  if (!isBossStage(rules, stage)) return '';
  if (mode !== 'campaign') return infiniteBossId(rules, stage);
  const name = rules.bossSchedules.get(theme)?.[String(stage)];
  return name ? (rules.bossByName.get(name) ?? '') : '';
}

/** 데이터가 없는 보스 자리를 대신할 기본 보스: bosses[].stage = ((s − every) mod (every × 종류 수)) + every. */
export function fallbackBoss(rules: MatchRules, stage: number): BossStats {
  const every = rules.bossCycle.every;
  const n = rules.bossOrder.length;
  const want = ((((stage - every) % (every * n)) + every * n) % (every * n)) + every;
  for (const id of rules.bossOrder) {
    const b = rules.bosses.get(id) as BossStats;
    if (b.stage === want) return b;
  }
  return rules.bosses.get(rules.bossOrder[0] as string) as BossStats;
}

/** 그 단계에 실제로 나오는 보스 (데이터가 없으면 대체 보스). 보스 단계가 아니면 null. */
export function bossForStage(rules: MatchRules, mode: string, theme: number, stage: number): BossStats | null {
  if (!isBossStage(rules, stage)) return null;
  const id = scheduledBossId(rules, mode, theme, stage);
  return rules.bosses.get(id) ?? fallbackBoss(rules, stage);
}
