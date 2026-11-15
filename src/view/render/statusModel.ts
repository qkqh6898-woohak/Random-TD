/**
 * 몹 상태 이상 표시 (M3b, 순수 함수 — Phaser 없음): sim 몹 상태 → 몸 색(틴트)·머리 위 아이콘·걷기 멈춤.
 *
 * - 아이콘 순서 (최대 4개): 빙결 ❄ · 정지 ⏱ · 기절 ★ · 둔화 · 화상 · 독 · 출혈 · 표식 · 약화.
 * - 몸 색은 가장 눈에 띄는 것 하나: 빙결(하늘) > 정지(회색) > 기절(노랑) > 화상(주황) > 독(연두) > 둔화(갈색).
 * - 행동 불가(빙결·정지·기절) 동안은 걷기 흔들림을 멈춘다 (멈춘 몸이 걷는 것처럼 보이지 않게).
 * 색은 화면 표현 상수라 코드에 둔다.
 */
import type { Mob } from '../../sim/entities/Mob';

export type StatusIcon = 'freeze' | 'stop' | 'stun' | 'slow' | 'burn' | 'poison' | 'bleed' | 'mark' | 'vuln';

export const STATUS_ICONS: readonly StatusIcon[] = ['freeze', 'stop', 'stun', 'slow', 'burn', 'poison', 'bleed', 'mark', 'vuln'];
/** 머리 위 아이콘 최대 수 */
export const MAX_STATUS_ICONS = 4;

/** 상태별 몸 색 (틴트) */
export const STATUS_TINTS: Readonly<Partial<Record<StatusIcon, number>>> = {
  freeze: 0x9fe8ff,
  stop: 0xa9a9bc,
  stun: 0xfff1a0,
  burn: 0xffb37a,
  poison: 0xb4ec8e,
  slow: 0xd2ab82,
};
const TINT_ORDER: readonly StatusIcon[] = ['freeze', 'stop', 'stun', 'burn', 'poison', 'slow'];

export interface MobStatusView {
  /** 몸 색 (없으면 null) */
  tint: number | null;
  icons: StatusIcon[];
  /** 행동 불가 → 걷기 흔들림 멈춤 */
  paused: boolean;
  /** 빙결 (얼음 덩어리를 덧그림) */
  frozen: boolean;
}

export const NO_STATUS: MobStatusView = Object.freeze({ tint: null, icons: [], paused: false, frozen: false }) as MobStatusView;

type StatusFields = Pick<Mob, 'freezeUntil' | 'stopUntil' | 'stunUntil' | 'slowBp' | 'dots' | 'markBp' | 'vulns'>;

/** 지금 틱의 몹 상태 이상 표시. */
export function mobStatusView(mob: StatusFields, tick: number): MobStatusView {
  // 대부분의 몹은 아무 상태도 없다 → 매 프레임 몹마다 새 객체를 만들지 않게 먼저 거른다
  if (
    tick >= mob.freezeUntil &&
    tick >= mob.stopUntil &&
    tick >= mob.stunUntil &&
    mob.slowBp <= 0 &&
    mob.markBp <= 0 &&
    mob.dots.length === 0 &&
    mob.vulns.length === 0
  ) {
    return NO_STATUS;
  }
  const on = new Set<StatusIcon>();
  if (tick < mob.freezeUntil) on.add('freeze');
  if (tick < mob.stopUntil) on.add('stop');
  if (tick < mob.stunUntil) on.add('stun');
  if (mob.slowBp > 0) on.add('slow');
  for (const d of mob.dots) {
    if (d.until <= tick) continue;
    if (d.kind === 'burn' || d.kind === 'poison' || d.kind === 'bleed') on.add(d.kind);
  }
  if (mob.markBp > 0) on.add('mark');
  for (const v of mob.vulns) if (v.until > tick && v.bp > 0) on.add('vuln');
  if (on.size === 0) return NO_STATUS;
  const icons = STATUS_ICONS.filter((s) => on.has(s)).slice(0, MAX_STATUS_ICONS);
  const tintKey = TINT_ORDER.find((s) => on.has(s));
  return {
    tint: tintKey ? (STATUS_TINTS[tintKey] ?? null) : null,
    icons,
    paused: on.has('freeze') || on.has('stop') || on.has('stun'),
    frozen: on.has('freeze'),
  };
}

/**
 * M4 몹 겉모습 (순수 함수): 투명 몹이 드러났는가(보라 외곽선 — ENEMIES.md 5장), 정예(금색 외곽선·1.3배), 날아오름(박쥐 여왕),
 * 피해 감소 보호막(혼돈의 용), 방패병 보호막 비율(체력 바 위 하늘색 줄, 0~1), 보스·작은 조각 크기 배율.
 */
export interface MobLookView {
  /** 투명 몹이고 지금 드러남 → 보라 외곽선 + 덜 투명하게 */
  revealed: boolean;
  elite: boolean;
  flying: boolean;
  guard: boolean;
  /** 보호막 남은 비율 (0이면 줄 없음) */
  shield: number;
}

export const NO_LOOK: MobLookView = Object.freeze({ revealed: false, elite: false, flying: false, guard: false, shield: 0 }) as MobLookView;

type LookFields = Pick<Mob, 'invisible' | 'revealedUntil' | 'elite' | 'flyUntil' | 'dmgCutBp' | 'shield' | 'maxShield'>;

export function mobLookView(mob: LookFields, tick: number): MobLookView {
  const revealed = mob.invisible && tick < mob.revealedUntil;
  const flying = tick < mob.flyUntil;
  const guard = mob.dmgCutBp > 0;
  const shield = mob.maxShield > 0 && mob.shield > 0 ? mob.shield / mob.maxShield : 0;
  if (!revealed && !mob.elite && !flying && !guard && shield === 0) return NO_LOOK;
  return { revealed, elite: mob.elite, flying, guard, shield };
}

/** 몹 그림 크기 배율: 정예 ×eliteScale, 분열 조각(작은 슬라임) ×0.62, 보스 분열 조각 ×0.8. */
export function mobScaleMul(mob: Pick<Mob, 'elite' | 'small' | 'part'>, eliteScale: number): number {
  let k = 1;
  if (mob.elite) k *= eliteScale;
  if (mob.small) k *= 0.62;
  if (mob.part) k *= 0.8;
  return k;
}
