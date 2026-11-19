/**
 * 타워 정보 패널의 글자·버튼 상태 (DEV_PLAN M3-11, UI.md 4.4). 순수 함수 (DOM·Phaser 없음 → 단위 테스트).
 *
 * 표시 (판 내 강화·버프가 반영된 현재 값, 버프로 오른 값은 초록 + (기본값)):
 *   ★★★ 이름 Lv1 / 등급 · 종족 · 피해 종류 (· 특색 태그)
 *   물리 n  마법 n  공속 x (×배율)
 *   사거리 r  범위 (단일·근접 단일·광역 r·근접 광역 r·관통 n·연쇄 n·다중 n·전체)
 *   방관 n%  마관 n%  치명 n% ×m
 *   👁 감지: 없음 / 오라 r / 자신
 *   특색: 능력 설명 (특색 타워 25종) / 능력: 능력 설명 (특색이 아니어도 화상·출혈·치명타 같은 능력이 있으면) / 둘 다 없으면 특색: —
 *   보유: n/3
 *   [⬆ 승급] [⬆⬆ 모두 승급] — 같은 종류 3개 이상이고 승급할 수 있는 등급일 때만 켜짐
 *   승급 결과 미리 보기: 덱의 다음 등급 5종 이름
 *   대상: 선두 (우선순위 변경은 계정 Lv8, 아직 없음)
 *   [↔ 이동] [💰 판매 +n원] (T-2) — 판매가 = sim sellPrice, 히어로 이상 확인 중이면 '한 번 더 누르면 판매'
 * 타워 레벨은 판의 레벨(MatchContext.levels, 계정 성장 M9 전까지 모두 1)을 보여준다. 공격력·공속에는 오라·레벨 보정이 들어간다 (M3-7).
 */
import { GRADE_COLORS } from '../../art/palette';
import { GRADE_STARS } from '../../art/towerLook';
import type { DamageType, Grade, Shape, TargetRule, TowerData } from '../../data/load';
import type { TowerStats } from '../../sim/rules';
import { APS_SCALE, ATK_SCALE } from '../../sim/rules';
import type { EffectiveStats } from '../../sim/stats';

/** 등급 이름 — 정답은 src/data/grades.ts (V2.0 PR-A 통일) */
import { GRADE_NAMES } from '../../data/grades';
export { GRADE_NAMES };

export const DAMAGE_TYPE_NAMES: Readonly<Record<DamageType, string>> = Object.freeze({
  physical: '물리',
  magic: '마법',
  hybrid: '혼합',
  true: '고정',
});

export const TARGET_NAMES: Readonly<Record<TargetRule, string>> = Object.freeze({
  first: '선두',
  maxhp: '최대 체력',
  lowest: '최저 체력',
  boss: '보스 우선',
  unmarked: '무표식',
});

/** 등급 별: ★ × n (신 👑, 히든 💠). */
export function gradeStars(grade: Grade): string {
  switch (grade) {
    case 'god':
      return '👑';
    case 'hidden':
      return '💠';
    default:
      return '★'.repeat(GRADE_STARS[grade]);
  }
}

/** 소수 하나까지, 정수면 소수점 없이 (6.5, 7, 0.8). */
export function fmtNum(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * 정수 값(scale 배) → 소수 둘째 자리까지, 뒤의 0은 뺀다 (345/1000 → "0.35", 11500/10000 → "1.15", 800/1000 → "0.8").
 * 공속·공속 배율용 (검토 반영: 소수 하나로 반올림하면 저격수 0.3 × 1.15 = 0.345가 기본값과 같은 "0.3", 배율 ×1.15가 "×1.2"로 보였다).
 * 정수에서 바로 반올림해 부동소수 오차가 없다.
 */
export function fmtScaled2(value: number, scale: number): string {
  const hundredths = Math.round((value * 100) / scale);
  if (hundredths % 100 === 0) return String(hundredths / 100);
  return (hundredths / 100).toFixed(2).replace(/0$/, '');
}

/** bp → "40%" (0이면 —). */
export function fmtPct(bpValue: number): string {
  if (bpValue <= 0) return '—';
  return `${fmtNum(bpValue / 100)}%`;
}

/** 공격 범위 글자 (TOWERS.md 0.1 표기): 단일 / 근접 단일 / 광역 r0.8 / 근접 광역 r1.2 / 관통 2 / 연쇄 3 / 다중 3 / 전체. */
export function shapeText(shape: Shape, shapeValue: number): string {
  switch (shape) {
    case 'single':
      return '단일';
    case 'melee':
      return '근접 단일';
    case 'aoe':
      return `광역 r${fmtNum(shapeValue)}`;
    case 'melee_aoe':
      return `근접 광역 r${fmtNum(shapeValue)}`;
    case 'pierce':
      return `관통 ${shapeValue}`;
    case 'chain':
      return `연쇄 ${shapeValue}`;
    case 'multi':
      return `다중 ${shapeValue}`;
    case 'global':
      return '전체';
  }
}

/** 감지 글자. */
export function detectText(t: Pick<TowerData, 'detect' | 'detectRange'>): string {
  if (t.detect === 'aura') return t.detectRange >= 50 ? '오라 (맵 전체)' : `오라 r${fmtNum(t.detectRange)}`;
  if (t.detect === 'self') return '자신';
  return '없음';
}

/** 한 칸의 값: 지금 값과, 버프로 바뀌었으면 기본값. */
export interface StatCell {
  label: string;
  value: string;
  /** 버프로 오른 값 (초록) */
  buffed: boolean;
  /** 버프 전 기본값 (buffed일 때만) */
  base?: string;
}

export interface TowerPanelInput {
  data: TowerData;
  stats: TowerStats;
  eff: EffectiveStats;
  /** 종족 이름 (towers.json factions, 연합·고대신은 따로) */
  factionName: string;
  /** 판 위 같은 종류(내 것) 수 */
  owned: number;
  /** 승급 개수 (3) */
  mergeCount: number;
  /** 승급할 수 있는 등급인가 */
  mergeableGrade: boolean;
  /** 승급 결과로 나올 수 있는 타워 이름 (덱의 다음 등급) */
  outcomes: readonly string[];
  /** 이동 직후 공격 정지 중 */
  paused: boolean;
  /** 혼돈의 용에게 기절 중 (M4-5) — 생략하면 아님 */
  stunned?: boolean;
  /** 관통 최대 (bp, game.json combat.penMax) */
  penMaxBp: number;
  /** 타워 레벨 (계정 성장 M9, 지금은 1). 생략하면 1 */
  level?: number;
  /** 판매 (T-2): 판매가(원)와 '한 번 더 누르면 판매' 확인 중인가. 생략하면 0원·확인 아님 */
  sell?: { price: number; confirming: boolean };
  /** G-1 칸 무더기: 그 칸 타워 수 (2 이상이면 이름 뒤 '×n') */
  stack?: number;
}

export interface TowerPanelModel {
  towerId: string;
  name: string;
  /** 캐릭터 설명 (HF-2, towers.json lore·role): 어떤 인물인가 / 전투에서 하는 일 — 이름 아래 작게 */
  lore: string;
  role: string;
  grade: Grade;
  stars: string;
  /** 별 색 (등급 색, art/palette) */
  gradeColor: string;
  level: string;
  subtitle: string;
  stats: StatCell[][];
  detect: string;
  /** 능력 줄 이름: 특색 타워 = '특색', 그 밖에 능력이 있으면 '능력' */
  abilityLabel: string;
  ability: string;
  owned: string;
  ownedReady: boolean;
  mergeEnabled: boolean;
  mergeAllEnabled: boolean;
  /** 모두 승급하면 몇 번 승급하는가 */
  mergeAllTimes: number;
  /** 버튼 아래 안내 (레전드 불가 등) */
  note: string;
  outcomes: string;
  target: string;
  paused: boolean;
  /** 쉬는 이유 글자 ('이동 중' · '💫 기절', 쉬지 않으면 '') */
  pausedText: string;
  /** 판매 버튼 글자 '💰 판매 +50원' / '한 번 더 누르면 판매' (T-2) */
  sellLabel: string;
  sellConfirming: boolean;
  /** 판매가 글자 '+1,350원' (접힌 패널의 짧은 버튼) */
  sellPriceText: string;
}

/** 판매 버튼 글자 (T-2): '💰 판매 +1,350원', 확인 중이면 '한 번 더 누르면 판매'. */
export function sellLabel(price: number, confirming: boolean): string {
  if (confirming) return '한 번 더 누르면 판매';
  return `💰 판매 +${String(price).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;
}

/** 판매에 두 번 누르기가 필요한 등급인가 (game.json sell.confirmGrades — 히어로·레전드·신·히든). */
export function sellNeedsConfirm(grade: Grade, confirmGrades: readonly Grade[]): boolean {
  return confirmGrades.includes(grade);
}

/** 종족 이름에서 괄호 설명을 뺀다 (부제가 좁은 화면에서 잘리지 않게): '카라쉬 부족 (오크·고블린)' → '카라쉬 부족'. */
export function shortFactionName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '');
}

function cell(label: string, now: number, base: number, fmt: (v: number) => string): StatCell {
  const value = fmt(now);
  return now !== base ? { label, value, buffed: now > base, base: fmt(base) } : { label, value, buffed: false };
}

/** 능력 줄: 특색 타워는 '특색', 아니어도 능력 설명(화상·출혈·치명타 …)이 있으면 '능력'으로 보여준다. */
function abilityLine(data: Pick<TowerData, 'special' | 'ability'>): { abilityLabel: string; ability: string } {
  const text = data.ability && data.ability.trim() !== '' && data.ability !== '—' ? data.ability : '';
  if (data.special > 0) return { abilityLabel: '특색', ability: text || '—' };
  return text ? { abilityLabel: '능력', ability: text } : { abilityLabel: '특색', ability: '—' };
}

export function buildTowerPanelModel(input: TowerPanelInput): TowerPanelModel {
  const { data, stats, eff } = input;
  const atk = (c: number, mul: number): number => (c * mul) / 10_000 / ATK_SCALE;
  const dash = (v: number): string => (v > 0 ? fmtNum(v) : '—');
  // 공속·배율은 소수 둘째 자리까지 (버프로 오른 값이 기본값과 같게 보이지 않게)
  const apsCell: StatCell = {
    label: '공속',
    value: `${fmtScaled2(eff.apsMilli, APS_SCALE)} (×${fmtScaled2(eff.apsMulBp, 10_000)})`,
    buffed: eff.apsMilli > stats.apsMilli,
    ...(eff.apsMilli !== stats.apsMilli ? { base: fmtScaled2(stats.apsMilli, APS_SCALE) } : {}),
  };
  const tags = data.special > 0 && data.tags.length > 0 ? ` · ${data.tags[0]}` : '';
  const mergeAllTimes = input.owned >= input.mergeCount ? Math.floor(input.owned / input.mergeCount) : 0;
  const ready = input.mergeableGrade && input.owned >= input.mergeCount;
  let note = '';
  if (!input.mergeableGrade) note = data.grade === 'legend' ? '레전드는 승급할 수 없어요 (리미티드 재료)' : '이 타워는 승급할 수 없어요';
  else if (!ready) note = `같은 타워 ${input.mergeCount}개가 한 칸에 모이면 승급할 수 있어요`;
  const critText = eff.critBp > 0 ? `${fmtPct(eff.critBp)} ×${fmtNum(eff.critMulBp / 10_000)}` : '—';
  return {
    towerId: data.id,
    // G-1 칸 무더기: 같은 칸에 여럿이면 '궁수 ×3'
    name: (input.stack ?? 1) > 1 ? `${data.name} ×${input.stack}` : data.name,
    lore: data.lore,
    role: data.role,
    grade: data.grade,
    stars: gradeStars(data.grade),
    gradeColor: data.grade === 'god' || data.grade === 'hidden' ? '#F1C40F' : GRADE_COLORS[data.grade],
    level: `Lv${input.level ?? 1}`,
    subtitle: `${GRADE_NAMES[data.grade]} · ${shortFactionName(input.factionName)} · ${DAMAGE_TYPE_NAMES[data.damageType]}${tags}`,
    stats: [
      [
        cell('물리', atk(stats.atkC, eff.atkMulBp), atk(stats.atkC, 10_000), dash),
        cell('마법', atk(stats.matkC, eff.atkMulBp), atk(stats.matkC, 10_000), dash),
        ...(stats.tatkC > 0 ? [cell('고정', atk(stats.tatkC, eff.atkMulBp), atk(stats.tatkC, 10_000), dash)] : []),
        apsCell,
      ],
      [
        // 사거리 강화(M5-3)가 붙은 값과 기본값 (M5 검토 반영: 기본값만 보였다). 단위 → 칸, 소수 둘째 자리까지
        data.range >= 50
          ? { label: '사거리', value: '맵 전체', buffed: false }
          : cell('사거리', eff.range, stats.range, (v) => fmtScaled2(v, 1000)),
        { label: '범위', value: shapeText(data.shape, data.shapeValue), buffed: false },
      ],
      [
        cell('방관', Math.min(eff.armorPenBp, input.penMaxBp), stats.armorPenBp, fmtPct),
        cell('마관', Math.min(eff.magicPenBp, input.penMaxBp), stats.magicPenBp, fmtPct),
        { label: '치명', value: critText, buffed: eff.critBp > stats.critBp },
      ],
    ],
    detect: detectText(data),
    ...abilityLine(data),
    owned: `${input.owned}/${input.mergeCount}`,
    ownedReady: ready,
    mergeEnabled: ready,
    mergeAllEnabled: ready && mergeAllTimes >= 1,
    mergeAllTimes,
    note,
    outcomes: input.mergeableGrade ? input.outcomes.join(' · ') : '',
    target: TARGET_NAMES[data.target],
    paused: input.paused || input.stunned === true,
    pausedText: input.stunned ? '💫 기절' : input.paused ? '이동 중' : '',
    sellLabel: sellLabel(input.sell?.price ?? 0, input.sell?.confirming === true),
    sellConfirming: input.sell?.confirming === true,
    sellPriceText: `+${String(input.sell?.price ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`,
  };
}
