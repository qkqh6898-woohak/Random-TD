/**
 * 연출 끄기 (개발자 도구, 시험판 2~): 켜면 꾸밈 연출을 모두 건너뛴다 — 도박 슬롯 회전, 피해 숫자·동전·입자·화면 흔들림,
 * 소환·승급 반짝임, 스킬 효과, 보스 컷인, 배경 서서히 바뀜, 배너·시트 애니메이션, 캐릭터 대기 동작·공격 몸짓.
 * 게임 정보(타워·몹·투사체·체력 막대·숫자·알림 글자)는 그대로 보인다. sim과 무관 (화면만).
 *
 * 연출을 그리는 곳은 그리기 전에 effectsOff()를 본다. 값이 바뀌면 onEffectsChange 구독자에게 알린다 (예: 이미 돌고 있는 트윈 멈추기).
 * 저장은 부르는 쪽(개발자 도구)이 Storage로 한다 — 이 모듈은 상태만 들고 있다 (단위 테스트 쉬움).
 */
let off = false;
const listeners = new Set<(off: boolean) => void>();

/** 지금 연출이 꺼져 있는가 */
export function effectsOff(): boolean {
  return off;
}

/** 연출 끄기 켜고 끄기 (같은 값이면 알리지 않음) */
export function setEffectsOff(value: boolean): void {
  if (off === value) return;
  off = value;
  for (const l of listeners) l(off);
}

/** 바뀔 때 알림 받기 → 구독 해제 함수 */
export function onEffectsChange(listener: (off: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
