/**
 * 토스트·알림 문구 (UI.md 8장). 화면 글자는 여기 한 곳에 모은다.
 * 돈은 HUD·시트처럼 세 자리마다 쉼표 (M5 검토 반영: 배너·결과 글자만 '+50000원'이었다).
 */

/** 세 자리마다 쉼표 (기기 로케일과 상관없이 같게). */
export function withCommas(n: number): string {
  const sign = n < 0 ? '-' : '';
  const digits = String(Math.abs(Math.trunc(n)));
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return sign + out;
}

/** 돈 부족 (소환): "100원이 필요해요" — 비용은 데이터(game.json summon.cost)에서 */
export function needGoldForSummon(cost: number): string {
  return `${withCommas(cost)}원이 필요해요`;
}

/** 돈 부족 (기타): "{n}원이 더 필요해요" */
export function needMoreGold(n: number): string {
  return `${withCommas(n)}원이 더 필요해요`;
}

/** 배치 칸이 가득 참 */
export const BOARD_FULL = '빈 칸이 없어요 — 승급으로 칸을 비워 보세요';

/** G-1: 굴린 타워가 들어갈 칸이 없어 돈을 돌려받음 */
export const SUMMON_NO_FIT = '들어갈 칸이 없어 소환을 취소했어요 (돈은 그대로)';

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
  if (reason === 'stack') return `같은 타워 ${count}개가 한 칸에 모여야 승급해요`;
  if (reason === 'maxGrade') return '레전드는 승급할 수 없어요 (신화 재료)';
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

/** 단계 이자 알림 (피드백 #10): '💰 이자 +100원 (100원마다 10원)' */
export function stageInterestText(amount: number, per: number, each: number): string {
  return `💰 이자 +${withCommas(amount)}원 (${withCommas(per)}원마다 ${withCommas(each)}원)`;
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
  return `👑 ${name} 처치! +${withCommas(reward)}원`;
}

// ---- F10-2 첫 보스: 예고·비행·실패 사유 ----

/** 받침 있는 글자로 끝나면 true (한글 음절만 본다, 아니면 false). 을/를·이/가 고르기. */
export function hasBatchim(word: string): boolean {
  const c = word.trim().charCodeAt(word.trim().length - 1);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return false;
  return (c - 0xac00) % 28 !== 0;
}

/** 보스 예고 배너 제목 (보스 단계 바로 앞 단계 시작 때): '⚠ 다음 단계 보스: 박쥐 여왕' */
export function bossPreviewText(name: string): string {
  return `⚠ 다음 단계 보스: ${name}`;
}

/** 보스 예고 둘째 줄 = 보스 대응 한 줄 (enemies.json bosses[].counter) */
export function bossCounterTip(counter: string): string {
  return `💡 ${counter}`;
}

/** 박쥐 여왕이 날아오른 동안 보스 막대 아래 짧은 표시: '🦇 비행 중 · 사거리 2칸 이하 공격 불가' (칸 = flyBlockRange) */
export function bossFlyLabel(rangeTiles: number): string {
  const n = Number.isInteger(rangeTiles) ? String(rangeTiles) : rangeTiles.toFixed(1);
  return `🦇 비행 중 · 사거리 ${n}칸 이하 공격 불가`;
}

/**
 * 보스 제한 시간 패배 사유 (사용자 결정: 시간 초과는 패배 그대로, 남은 체력·사유를 보여 줌):
 * '박쥐 여왕을 60초 안에 잡지 못했어요 · 남은 체력 34%'. 남은 체력은 올림 정수 % (살아 있으면 1% 이상).
 */
export function bossTimeoutText(name: string, seconds: number, hpLeftPct: number): string {
  return `${name}${hasBatchim(name) ? '을' : '를'} ${seconds}초 안에 잡지 못했어요 · 남은 체력 ${hpLeftPct}%`;
}

/** 남은 보스 체력 % (올림 정수, 0~100). 조금이라도 남으면 1% 이상 → '남은 체력 0%'로 지는 일이 없다. */
export function bossHpLeftPct(hp: number, maxHp: number): number {
  if (maxHp <= 0 || hp <= 0) return 0;
  return Math.min(100, Math.ceil((hp * 100) / maxHp));
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

// ---- M5 ----

/** 도전 보스 막대 이름표 (HUD): '⚔ 도전 3단계 「돌거북」' */
export function challengeNameplate(lv: number, name: string): string {
  return `⚔ 도전 ${lv}단계 「${name}」`;
}

/** 도전 시작 알림 */
export function challengeStartText(lv: number, name: string, seconds: number): string {
  return `⚔ 도전 ${lv}단계 「${name}」 — ${seconds}초!`;
}

/** 도전 처치 배너 (처음 잡으면 다음 단계 해금도) */
export function challengeClearText(lv: number, reward: number, unlocked: number | null): string {
  return unlocked !== null ? `⚔ 도전 ${lv}단계 클리어! +${withCommas(reward)}원 · ${unlocked}단계 열림` : `⚔ 도전 ${lv}단계 클리어! +${withCommas(reward)}원`;
}

/** 도전 실패 (시간 초과 / 캠페인 출구) — 패배·목숨 감소 없음 */
export function challengeFailText(lv: number, reason: string, cooldownMin: number): string {
  const why = reason === 'escape' ? '빠져나갔어요' : '시간 초과';
  return `⚔ 도전 ${lv}단계 실패 — ${why} · ${cooldownMin}분 뒤 다시`;
}

/** 도전 쿨타임 끝 (UI.md 8장) */
export function challengeReadyText(lv: number): string {
  return `도전 ${lv}단계 준비 완료`;
}

/** 도전 시작 실패 → 글자 (보여줄 것이 없으면 null) */
export function challengeStartFailText(reason: string): string | null {
  if (reason === 'busy') return '도전은 한 번에 하나만 할 수 있어요';
  if (reason === 'locked') return '앞 단계를 먼저 잡아야 열려요';
  if (reason === 'cooldown') return '아직 쉬는 중이에요';
  return null;
}

/** 강화 실패 → 글자 (돈 부족은 모자란 만큼) */
export function upgradeFailText(reason: string, short: number): string | null {
  if (reason === 'gold') return needMoreGold(Math.max(1, short));
  if (reason === 'max') return '최대 레벨이에요';
  if (reason === 'locked') return '등급 강화 3종을 모두 최대로 올리면 열려요';
  return null;
}

/** 도박 실패 → 글자 */
export function gambleFailText(reason: string, short: number, unlockLevel: number): string | null {
  if (reason === 'gold') return needMoreGold(Math.max(1, short));
  if (reason === 'locked') return `계정 Lv${unlockLevel}에 열려요`;
  return null;
}

/** 도박 결과 한 줄 (릴 아래): '×2 → +200원' / '×0 … 0원' */
export function gambleResultText(mul: string, win: number, cost: number): string {
  if (win <= 0) return `${mul} … 꽝! (−${withCommas(cost)}원)`;
  const net = win - cost;
  return `${mul} → +${withCommas(win)}원 (${net >= 0 ? '+' : '−'}${withCommas(Math.abs(net))})`;
}

/** 도박 대박 배너 (×5 이상) */
export function gambleJackpotText(mul: string, win: number): string {
  return `🎰 ${mul} 대박! +${withCommas(win)}원`;
}

/** 미션 달성 알림 (한 줄 배너): 하나면 이름, 같은 프레임에 여럿이면 개수 + 보상 합 */
export function missionDoneText(names: readonly string[], total: number): string {
  if (names.length === 1) return `📋 미션 달성! ${names[0]} (+${withCommas(total)}원)`;
  return `📋 미션 ${names.length}개 달성! (+${withCommas(total)}원)`;
}

/** 히든 미션 발견 배너 (한 줄 — 알림 자리에 들어가게) */
export function hiddenMissionText(name: string, reward: number): string {
  return `🎉 히든 미션 발견! 「${name}」 +${withCommas(reward)}원`;
}

/** 미션 보상 받음 */
export function missionClaimText(total: number, count: number): string {
  return count > 1 ? `📋 미션 ${count}개 보상 +${withCommas(total)}원` : `📋 미션 보상 +${withCommas(total)}원`;
}

// ---------------------------------------------------------------- T-2 판매·이동·변환·자동 소환

/** 판매 알림 '판매 +1,350원' */
export function sellText(gold: number): string {
  return `판매 +${withCommas(gold)}원`;
}

/** 이동 모드 안내 (패널 [↔ 이동]) */
export const MOVE_PICK_HINT = '옮길 칸을 누르세요';
/** 이동 모드를 그만둠 (같은 타워·맵 밖·Esc) */
export const MOVE_CANCELED = '이동을 취소했어요';

/** 변환 알림 (개발자) '🛠 용 소환사 → 대마법사' */
export function convertText(from: string, to: string): string {
  return `🛠 ${from} → ${to}`;
}

// ---------------------------------------------------------------- G-1 게임 시스템

/** 연쇄 승급 알림 (두 번 이상일 때) */
export function chainMergeText(steps: number): string {
  return `연쇄 승급 ×${steps}!`;
}

/** 3택 1 강화 선택 제목·부제 */
export const PICK_CARD_TITLE = '✨ 강화 카드 1장을 고르세요';
export function pickCardSub(stage: number): string {
  return `${stage}단계 보너스 · 고르는 동안에도 시간이 흘러요`;
}

/** 천장까지 남은 횟수 ('천장까지 7회' · 0이면 '다음 1회 확정!') */
export function pityText(left: number, gradeName: string): string {
  return left <= 0 ? `다음 1회 ${gradeName} 확정!` : `천장까지 ${left}회`;
}

/** 소환 도박 결과 알림 */
export function gachaResultText(kindName: string, gradeName: string, towerName: string, pity: boolean): string {
  if (!towerName) return `${kindName} — 꽝!`;
  return `${kindName} — ${gradeName} ${towerName}${pity ? ' (천장)' : ''}!`;
}

/** 소환 도박 실패 → 글자 (없으면 null) */
export function gachaFailText(reason: string, short: number): string | null {
  if (reason === 'gold') return `${withCommas(short)}원이 더 필요해요`;
  if (reason === 'full') return BOARD_FULL;
  if (reason === 'cap') return UNIT_CAP_FULL;
  return null;
}

/** G-1 인원 한도 */
export const UNIT_CAP_FULL = '인원이 가득 찼어요 — 승급으로 줄여 보세요';

/** 필살기 알림 */
export function ultText(towerName: string, ultName: string, count: number): string {
  return count > 0 ? `${towerName}의 ${ultName}! (${count})` : `${towerName}의 ${ultName}!`;
}

/** 신화 조합 알림 */
export function craftText(name: string, first: boolean): string {
  return first ? `💠 신화 ${name} 탄생! 도감에 기록했어요` : `💠 신화 ${name} 탄생!`;
}

/** 신화 재료가 모두 모였을 때 */
export function craftReadyText(name: string): string {
  return `💠 ${name} 재료가 모였어요 — [신화]에서 만들어요`;
}

/** 신화 조합 실패 → 글자 */
export function craftFailText(reason: string): string | null {
  if (reason === 'locked') return '아직 해방하지 않은 신화예요';
  if (reason === 'material') return '재료가 모자라요';
  if (reason === 'full') return BOARD_FULL;
  return null;
}
