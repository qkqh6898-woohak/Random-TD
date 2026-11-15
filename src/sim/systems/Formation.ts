/**
 * 조합 편대 (DEV_PLAN M4-3b, ENEMIES.md 3.4).
 *
 * - 편대 단계: 편대 주기(5)의 배수이면서 보스 단계가 아닌 단계 중, 등장 가능한 편대가 하나라도 있는 단계.
 *   - 무한 모드: 편대의 from(45·50·55·60·65·70) 이상인 단계에 등장 가능.
 *   - 캠페인 테마 t: from − 5 × (t − 1) 이상 (최소 25단계) — game.json formation.
 * - 고르기: 등장 가능한 편대 중 하나를 **세계 난수**로 균등하게. 처음 필요할 때(예고 때 또는 단계 시작 때) 한 번 고르고
 *   판 상태(formationStage·formation)에 적어 둔다 → 예고한 편대가 그대로 나온다.
 * - 예고: 다음 단계 시작 10초 전 'formationPreview' 사건 { stage, id } (Stage 시스템이 낸다, 화면은 배너 + 힌트).
 * - 편대 단계의 20칸은 구성표 대신 편대 mix로 채우고, 등장 순서 규칙(치유사 가운데·투명 뒤쪽)은 같다 (Spawn).
 */
import type { World } from '../World';
import { STREAM_WORLD } from '../World';
import { isBossStage, type FormationStats, type MatchRules } from '../rules';
import type { MatchContext } from '../state';

/** 편대 f가 그 판(모드·테마)에서 등장할 수 있는 첫 단계. */
export function formationFromStage(rules: MatchRules, f: Pick<FormationStats, 'from'>, mode: string, theme: number): number {
  if (mode !== 'campaign') return f.from;
  const s = f.from - rules.formationCampaignShift * (theme - 1);
  return s < rules.formationCampaignMin ? rules.formationCampaignMin : s;
}

/** 그 단계에 등장할 수 있는 편대 (편대 단계가 아니면 빈 배열). 데이터 순서. */
export function eligibleFormations(rules: MatchRules, stage: number, mode: string, theme: number): FormationStats[] {
  if (stage <= 0 || stage % rules.formationEvery !== 0 || isBossStage(rules, stage)) return [];
  return rules.formations.filter((f) => formationFromStage(rules, f, mode, theme) <= stage);
}

/**
 * 그 단계의 편대 id ('' = 편대 단계 아님). 이미 골라 두었으면 그것, 아니면 지금 세계 난수로 고르고 적어 둔다.
 * 편대 단계가 아니면 난수를 쓰지 않는다.
 */
export function chooseFormation(ctx: MatchContext, world: World, stage: number): string {
  const { state, rules } = ctx;
  if (state.formationStage === stage) return state.formation;
  const list = eligibleFormations(rules, stage, state.mode, state.theme);
  state.formationStage = stage;
  state.formation = list.length === 0 ? '' : world.rng(STREAM_WORLD).pick(list).id;
  return state.formation;
}

/** 편대 id → 편대 (없으면 undefined). */
export function formationById(rules: MatchRules, id: string): FormationStats | undefined {
  return rules.formations.find((f) => f.id === id);
}

/** 편대의 20칸 (섞기 전, 몹 순서 = enemies.json 순서). */
export function formationSlots(f: FormationStats): string[] {
  const out: string[] = [];
  for (const [id, count] of f.mix) for (let i = 0; i < count; i++) out.push(id);
  return out;
}
