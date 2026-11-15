/**
 * 주 소품의 움직임 정보 (순수 데이터): 쥐는가(grip), 돌릴 때 중심(spin), 파츠가 없는 자세 소품(prayer·meditate).
 * idle.ts(자세 계산)와 props.ts(그리기)가 같이 쓴다.
 */
import type { PropId } from './library';

export interface PropMeta {
  /** 손이 소품을 쥔다 → prop 파츠에 손을 한 번 더 그려 위에 덮는다 */
  grip: boolean;
  /** 제자리 회전(돌리기·수레바퀴·궤도) 중심: 손 기준 그림 단위. 없으면 손 */
  spin?: readonly [number, number];
  /** 소품 그림이 없는 자세 (두 손 모으기 등) → prop 파츠를 만들지 않는다 */
  pose?: 'pray' | 'meditate';
  /** 키 큰 소품 (끝이 등급 별 줄 높이까지 올라온다) → 별 줄을 소품 반대쪽(왼쪽)으로 비켜 그린다 */
  tall?: boolean;
}

const G: PropMeta = { grip: true };
const F: PropMeta = { grip: false };

export const PROP_META: Readonly<Record<PropId, PropMeta>> = {
  none: F,
  pickaxe: G,
  drumsticks: G,
  dagger: G,
  twin_daggers: G,
  longbow: G,
  wand: G,
  crystal_staff: G,
  short_sword: G,
  longsword: G,
  spear: G,
  spear_banner: G,
  boulder: G,
  shuriken: { grip: true, spin: [4, -36] },
  radio: G,
  money_bag: G,
  scales: G,
  mud_totem: G,
  lute: G,
  tablet: G,
  sat_tablet: G,
  fireball: { grip: false, spin: [2, -30] },
  cleaver: G,
  machine_gun: G,
  minigun: G,
  bombs: F,
  leaf_bow: G,
  ice_staff: G,
  dice: F,
  hammer: G,
  carved_staff: G,
  skull_staff: G,
  crystal_ball: F,
  ledger: G,
  sniper_rifle: G,
  railgun: G,
  twin_axes: G,
  spark_orb: { grip: false, spin: [0, -32] },
  venom_arrow: G,
  viper_bow: G,
  rune_staff: G,
  thick_book: F,
  pocket_watch: G,
  flask: G,
  tower_shield: F,
  skull: F,
  scythe: G,
  binoculars: G,
  katana: G,
  arrows: G,
  dragon_staff: G,
  spellbook: F,
  twin_blades: G,
  clover: G,
  storm_staff: G,
  fan: G,
  prayer: { grip: false, pose: 'pray' },
  portal: { grip: false, spin: [16, -28] },
  fate_wheel: { grip: true, spin: [0, 0] },
  horn_of_plenty: G,
  dark_orb: { grip: false, spin: [0, -32] },
  element_orbs: { grip: false, spin: [0, -34] },
  juggle_mix: F,
  star_bow: G,
  legion_banner: G,
  gold_sword: G,
  clock_staff: G,
  goblin_scepter: G,
  gold_cannon: G,
  dice_orb: { grip: false, spin: [4, -30] },
  chain_lightning: F,
  meditate: { grip: false, pose: 'meditate' },
  baton: G,
  gold_pickaxe: G,
  skull_drumsticks: G,
  silver_bow: G,
  crystal_daggers: G,
  swirl_bow: G,
  philosopher_flask: G,
  ancient_tome: F,
  sky_spear: { grip: true, tall: true },
  flame_axes: G,
  lava_cleaver: G,
  gold_bombs: F,
  giant_spear: { grip: true, tall: true },
  war_banner: { grip: true, tall: true },
};

/** prop 파츠(따로 움직이는 소품 그림)가 있는가 */
export function hasPropPart(prop: PropId | undefined): boolean {
  return prop !== undefined && prop !== 'none' && PROP_META[prop].pose === undefined;
}
