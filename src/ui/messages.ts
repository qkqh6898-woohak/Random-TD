/**
 * 토스트·알림 문구 (UI.md 8장). 화면 글자는 여기 한 곳에 모은다.
 */

/** 돈 부족 (소환): "100원이 필요해요" — 비용은 데이터(game.json summon.cost)에서 */
export function needGoldForSummon(cost: number): string {
  return `${cost}원이 필요해요`;
}

/** 돈 부족 (기타): "{n}원이 더 필요해요" */
export function needMoreGold(n: number): string {
  return `${n}원이 더 필요해요`;
}

/** 배치 칸이 가득 참 */
export const BOARD_FULL = '빈 칸이 없어요 — 승급으로 칸을 비워 보세요';

/** 신 타워 강림 (전체 화면 연출 자리, 지금은 토스트) */
export function godDescends(name: string): string {
  return `👑 ${name} 강림!`;
}

/**
 * 승급 가능 (UI.md 8장, 판당 처음 3번만). 한꺼번에 여러 종류면 한 알림으로: 2종 = '고블린·전사 승급 가능!',
 * 3종 이상 = '고블린 외 2종 승급 가능!' (412px 화면에서 한 줄에 들어가게).
 */
export function mergeReadyToast(names: string | readonly string[]): string {
  const list = typeof names === 'string' ? [names] : names;
  if (list.length <= 2) return `${list.join('·')} 승급 가능!`;
  return `${list[0]} 외 ${list.length - 1}종 승급 가능!`;
}

/** 승급 실패 (sim이 거절한 merge·mergeAll) → 글자. 보여줄 것이 없으면 null. */
export function mergeFailText(reason: string, count: number): string | null {
  if (reason === 'count') return `같은 타워가 ${count}개 있어야 승급할 수 있어요`;
  if (reason === 'maxGrade') return '레전드는 승급할 수 없어요 (히든 재료)';
  return null;
}

/** 승급 결과 알림 */
export function mergedToast(name: string, gradeName: string): string {
  return `⬆ ${gradeName} ${name}!`;
}

/** 행운의 여신 소환 레어 직행 (M3b) */
export const FORTUNA_RARE = '🍀 행운의 여신 — 레어 직행!';

/** 행운의 여신 승급 2등급 상승 (M3b) */
export const FORTUNA_DOUBLE = '🍀 행운의 여신 — 2등급 상승!';

/** 그림자 암살자 즉사 (피해 숫자 자리) */
export const EXECUTE_LABEL = '즉사!';

// ---- M4 ----

/** 일꾼 최대 (UI.md 8장) */
export function workerFullText(max: number): string {
  return `일꾼이 꽉 찼어요 (${max}/${max})`;
}

/** 일꾼 고용 실패 → 글자 (돈 부족은 모자란 만큼). 보여줄 것이 없으면 null. */
export function hireFailText(reason: string, cost: number, gold: number, max: number): string | null {
  if (reason === 'max') return workerFullText(max);
  if (reason === 'gold') return needMoreGold(Math.max(1, cost - gold));
  return null;
}

/** 보스 이름표 앞부분: '질풍 군단 · 대장' (군주 직속은 계급 이름에 이미 들어 있어 '군주 직속 대장'만) */
export function bossTag(legionName: string, rank: string): string {
  return rank.startsWith(legionName) ? rank : `${legionName} · ${rank}`;
}

/** 보스 이름표 (UI.md 8장 '보스 등장'): '질풍 군단 · 대장 「박쥐 여왕」' */
export function bossNameplate(tag: string, name: string): string {
  return `${tag} 「${name}」`;
}

/**
 * 보스 등장 배너 (한 줄): '👑 10단계 · 질풍 군단 · 대장 「박쥐 여왕」'. 같은 프레임의 'N단계 보스 단계!' 알림을 대신한다
 * (검토 반영: 이름표 배너와 단계 알림이 같이 떠 두 번째 알림이 맵 0~1줄 = 보스가 나오는 시작점을 가렸다).
 */
export function bossArrivalText(stageLabel: string, tag: string, name: string): string {
  return `👑 ${stageLabel} · ${bossNameplate(tag, name)}`;
}

/** 보스 처치 */
export function bossKillText(name: string, reward: number): string {
  return `👑 ${name} 처치! +${reward}원`;
}

/** 보스를 잡은 뒤 남은 보스 단계 (휴식) */
export const BOSS_CLEARED = '👑 보스 처치! 남은 시간은 휴식';

/** 투명 몹 첫 등장 + 감지 없음 (ENEMIES.md 5장, UI.md 8장) */
export const INVISIBLE_WARN = '투명 몹 출현! 감지 타워가 필요해요 👁';

/**
 * 투명 몹 경고 둘째 줄: 내 덱에 있는 감지 타워 이름 (towers.json detect가 none이 아닌 것, 덱 등급 순).
 * 덱에 하나도 없으면 일반 문구. 예전엔 '정찰병·저격수·그림자 암살자'를 코드에 박아 기본 덱에 없는 정찰병까지 추천했다 (검토 반영).
 */
export function invisibleTip(detectNames: readonly string[]): string {
  return detectNames.length > 0 ? `💡 덱의 감지 타워: ${detectNames.join('·')}` : '💡 덱에 감지 타워를 넣어 보세요';
}

/** 편대 예고 배너 (UI.md 8장): '⚠ 다음 단계: 돌파 편대 — 보석 골렘 + 암흑 고블린 떼!' */
export function formationBanner(name: string, banner: string): string {
  return `⚠ 다음 단계: ${name} — ${banner}!`;
}

/** 보스 카드 고르기 창 제목 */
export const CARD_PICK_TITLE = '👑 보스 처치! 카드 1장을 고르세요';

/** 승급의 축복 고르기 창 제목 */
export const MERGE_PICK_TITLE = '✨ 승급의 축복 — 결과를 고르세요';

/** 카드를 고름 */
export function cardPickedText(name: string): string {
  return `🃏 ${name}!`;
}

/** 유령 회피 (피해 숫자 자리) */
export const EVADE_LABEL = '빗나감';

/** 행운의 소환 카드로 레어 */
export const LUCKY_SUMMON = '🃏 행운의 소환 — 레어!';
