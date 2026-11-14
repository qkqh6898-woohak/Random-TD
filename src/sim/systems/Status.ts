/**
 * 상태 이상·원소 (DEV_PLAN M3-6, GDD 5.5, ENEMIES.md 1장 '상태이상 저항').
 *
 * | 상태 | 효과 | 중첩 | 보스 |
 * |------|------|------|------|
 * | 둔화 (진흙 등) | 이동속도 −x% | 가장 강한 것만, 최대 70% | 효과 절반 (최대 35%) |
 * | 기절 | 이동 정지 | 지속시간 갱신 | 지속시간 30% |
 * | 정지 (시간) | 이동·회복·능력 정지 | 갱신 | 지속시간 30% |
 * | 빙결 (얼음) | 일시 정지 + 받는 피해 +10% | 갱신 | 지속시간 30% |
 * | 되돌리기 | 출발 지점으로 이동 | — | 면역 |
 * | 화상·독·출혈 | 초당 공격력의 x% (고정 피해, 치명타 없음) | 타워 데이터 dot.stacks까지 | 적용 |
 * | 표식 | 방어력·마법 저항 감소 | 가장 강한 것만 | 적용 |
 * | 약화 | 받는 피해 +x% | 서로 다른 출처는 합산, 최대 +100% | 적용 |
 *
 * - 기절·정지·빙결(행동 불가)이 끝난 직후 **1초 동안 행동 불가 면역** (무한 정지 방지). 행동 불가가 걸려 있는 동안 새로 걸리면 지속시간 갱신.
 * - 상태이상 저항(ccResist, 보스가 아닌 몹): 둔화 세기와 기절·정지·빙결 지속시간을 그 비율만큼 줄인다 (골렘 20% → 둔화 50%는 40%).
 *   보스는 ccResist 대신 위 표의 보스 규칙(둔화 절반·지속 30%)을 쓴다 — 보스 데이터의 상태이상 저항 70%와 '지속 30%'는 같은 뜻이라 겹쳐 곱하지 않는다.
 * - 같은 출처(타워 종류 등)에서 다시 걸면 갱신(더 늦게 풀리는 쪽). 출처가 다르면 따로 들고 있다가 규칙대로 합친다
 *   (둔화 30% + 둔화 45% → 45%만, 45%가 먼저 풀리면 30%가 남는다).
 * - 걸린 틱 T부터 효과가 시작되고(같은 틱의 다음 공격부터 약화·표식이 적용) 이동에는 다음 틱부터: 지속 d틱 = 이동 T+1 ~ T+d틱 (until = T + 1 + d).
 * - 지속 피해: 틱마다 걸린 중첩의 초당 피해를 누적하고, dotIntervalTicks(0.5초)마다 고정 피해로 넣는다 (약화가 곱해짐, 방어 무시, 치명타 없음).
 *   몹마다 나머지를 이어 가서 소수 피해도 평균이 정확하다. 지속 피해로 죽어도 처치 보상은 같다.
 * - 드러나지 않은 투명 몹에게는 상태 이상이 걸리지 않는다 (GDD 5.7, 대상 후보에 없음). 드러남은 M4.
 * 수치(최대 70%·보스 절반·30%·면역 1초·빙결 +10%·간격)는 game.json status (rules.status).
 */
import type { System, World } from '../World';
import { TICK_HZ } from '../World';
import { BP_ONE, mulBp } from '../Fixed';
import { isMob, type Mob, type StatusEntry } from '../entities/Mob';
import type { StatusRules } from '../rules';
import type { MatchContext } from '../state';
import { damageAgainst, damageCaps, splitAtk } from './Damage';
import { killMob } from './Kill';
import { positionAt } from '../map';

/** 행동 불가 종류 */
export type HardCc = 'stun' | 'stop' | 'freeze';

/** 상태이상 저항 (bp, 0 ~ 100%로 자름). */
function resistBp(mob: Pick<Mob, 'ccResistBp'>): number {
  const r = mob.ccResistBp;
  return r <= 0 ? 0 : r >= BP_ONE ? BP_ONE : r;
}

/** 몹에게 실제로 들어가는 둔화 세기 (bp): 최대 70%로 자름 → 보스면 절반 / 아니면 × (1 − 상태이상 저항). */
export function slowStrength(rules: StatusRules, mob: Pick<Mob, 'boss' | 'ccResistBp'>, rawBp: number): number {
  if (rawBp <= 0) return 0;
  const v = rawBp > rules.slowMaxBp ? rules.slowMaxBp : rawBp;
  if (mob.boss) return mulBp(v, rules.bossSlowMulBp);
  const r = resistBp(mob);
  return r > 0 ? mulBp(v, BP_ONE - r) : v;
}

/** 기절·정지·빙결 실제 지속 (틱): 보스면 30%, 아니면 × (1 − 상태이상 저항). 내림 → 0이면 걸리지 않는다. */
export function ccDuration(rules: StatusRules, mob: Pick<Mob, 'boss' | 'ccResistBp'>, ticks: number): number {
  if (ticks <= 0) return 0;
  if (mob.boss) return mulBp(ticks, rules.bossCcDurMulBp);
  const r = resistBp(mob);
  return r > 0 ? mulBp(ticks, BP_ONE - r) : ticks;
}

/** 지금 행동 불가(기절·정지·빙결)인가 → 움직이지 않는다. */
export function isDisabled(mob: Pick<Mob, 'ccEnd'>, tick: number): boolean {
  return tick < mob.ccEnd;
}

export function isStunned(mob: Pick<Mob, 'stunUntil'>, tick: number): boolean {
  return tick < mob.stunUntil;
}

/** 시간 정지 중 (이동·회복·능력 정지 — 회복·능력은 M4 몹 특성이 읽는다). */
export function isStopped(mob: Pick<Mob, 'stopUntil'>, tick: number): boolean {
  return tick < mob.stopUntil;
}

export function isFrozen(mob: Pick<Mob, 'freezeUntil'>, tick: number): boolean {
  return tick < mob.freezeUntil;
}

/** 행동 불가 면역 중인가: 마지막 행동 불가가 끝난 틱(ccEnd)부터 면역 시간 동안. */
export function isCcImmune(rules: StatusRules, mob: Pick<Mob, 'ccEnd'>, tick: number): boolean {
  return mob.ccEnd > 0 && tick >= mob.ccEnd && tick < mob.ccEnd + rules.ccImmuneTicks;
}

/** 걸린 목록에서 풀린 것(until ≤ tick)을 뺀다. 풀린 것이 없으면 같은 배열. */
function prune<T extends { until: number }>(list: T[], tick: number): T[] {
  for (const e of list) if (e.until <= tick) return list.filter((x) => x.until > tick);
  return list;
}

/** 목록에서 출처 src의 항목을 bp·until로 갱신하거나 새로 넣는다 (until은 더 늦은 쪽). */
function upsert(list: StatusEntry[], src: string, bpValue: number, until: number): void {
  for (const e of list) {
    if (e.src !== src) continue;
    e.bp = bpValue;
    if (until > e.until) e.until = until;
    return;
  }
  list.push({ src, bp: bpValue, until });
}

/**
 * 걸린 목록 → 몹의 지금 값 (slowBp·vulnBp·markBp)을 다시 계산하고 풀린 것을 지운다.
 * 둔화 = 가장 강한 것 (규칙대로 조정), 약화 = 합 + 빙결 중이면 빙결 약화, 표식 = 가장 강한 것.
 */
export function refreshStatus(rules: StatusRules, mob: Mob, tick: number): void {
  mob.slows = prune(mob.slows, tick);
  mob.vulns = prune(mob.vulns, tick);
  mob.marks = prune(mob.marks, tick);
  mob.cds = prune(mob.cds, tick);
  mob.dots = prune(mob.dots, tick);
  let slow = 0;
  for (const e of mob.slows) if (e.bp > slow) slow = e.bp;
  mob.slowBp = slowStrength(rules, mob, slow);
  let vuln = 0;
  for (const e of mob.vulns) vuln += e.bp;
  if (isFrozen(mob, tick)) vuln += mob.freezeVulnBp;
  mob.vulnBp = vuln;
  let mark = 0;
  for (const e of mob.marks) if (e.bp > mark) mark = e.bp;
  mob.markBp = mark;
}

/** 걸린 틱 T, 지속 d틱 → 풀리는 틱 (이동은 T+1 ~ T+d틱 동안 영향을 받는다). */
export function untilFor(tick: number, durTicks: number): number {
  return tick + 1 + durTicks;
}

/** 둔화 걸기 (출처 src, 세기 bp, 지속 틱). 세기·보스·저항 조정은 refreshStatus가 한다. 걸렸으면 true. */
export function applySlow(rules: StatusRules, mob: Mob, tick: number, src: string, bpValue: number, durTicks: number): boolean {
  if (bpValue <= 0 || durTicks <= 0) return false;
  upsert(mob.slows, src, bpValue, untilFor(tick, durTicks));
  refreshStatus(rules, mob, tick);
  return true;
}

/** 약화 걸기 (받는 피해 +bp, 출처마다 하나 → 서로 다른 출처는 합산, 같은 출처는 갱신). */
export function applyVuln(rules: StatusRules, mob: Mob, tick: number, src: string, bpValue: number, durTicks: number): boolean {
  if (bpValue <= 0 || durTicks <= 0) return false;
  upsert(mob.vulns, src, bpValue, untilFor(tick, durTicks));
  refreshStatus(rules, mob, tick);
  return true;
}

/** 표식 걸기 (방어력·마법 저항 −bp, 가장 강한 것만 적용). */
export function applyMark(rules: StatusRules, mob: Mob, tick: number, src: string, bpValue: number, durTicks: number): boolean {
  if (bpValue <= 0 || durTicks <= 0) return false;
  upsert(mob.marks, src, bpValue, untilFor(tick, durTicks));
  refreshStatus(rules, mob, tick);
  return true;
}

/**
 * 행동 불가 걸기 (기절·정지·빙결). 지속은 보스·저항으로 줄이고(ccDuration), 0틱이면 걸리지 않는다.
 * 면역 중(직전 행동 불가가 끝나고 1초 안)이면 무시. 이미 행동 불가 중이면 지속시간 갱신 (더 늦게 풀리는 쪽).
 * 빙결은 freezeVulnBp(받는 피해 증가)를 같이 건다. 걸렸으면 true.
 */
export function applyHardCc(rules: StatusRules, mob: Mob, tick: number, kind: HardCc, rawTicks: number, freezeVulnBp = 0): boolean {
  const d = ccDuration(rules, mob, rawTicks);
  if (d <= 0) return false;
  if (isCcImmune(rules, mob, tick)) return false;
  const until = untilFor(tick, d);
  const wasFrozen = isFrozen(mob, tick);
  switch (kind) {
    case 'stun':
      if (until > mob.stunUntil) mob.stunUntil = until;
      break;
    case 'stop':
      if (until > mob.stopUntil) mob.stopUntil = until;
      break;
    case 'freeze':
      if (until > mob.freezeUntil) mob.freezeUntil = until;
      // 이미 빙결 중이면 더 큰 약화만 남기고, 새로 얼면 이번 값
      if (!wasFrozen || freezeVulnBp > mob.freezeVulnBp) mob.freezeVulnBp = freezeVulnBp;
      break;
  }
  if (until > mob.ccEnd) mob.ccEnd = until;
  refreshStatus(rules, mob, tick);
  return true;
}

/**
 * 지속 피해 걸기: 출처 src(타워 종류)·종류 kind의 중첩이 maxStacks보다 적으면 하나 더, 가득 찼으면 가장 먼저 풀릴 중첩을 새로 갱신.
 * @param dps 초당 피해 (× ATK_SCALE)
 */
export function applyDot(mob: Mob, tick: number, src: string, kind: string, dps: number, durTicks: number, maxStacks: number): boolean {
  if (dps <= 0 || durTicks <= 0 || maxStacks <= 0) return false;
  const until = untilFor(tick, durTicks);
  let count = 0;
  let oldest = -1;
  mob.dots.forEach((d, i) => {
    if (d.src !== src || d.kind !== kind || d.until <= tick) return;
    count++;
    if (oldest < 0 || d.until < (mob.dots[oldest] as { until: number }).until) oldest = i;
  });
  if (count < maxStacks) {
    mob.dots.push({ src, kind, dps, until });
  } else {
    const d = mob.dots[oldest];
    if (!d) return false;
    d.dps = dps;
    d.until = until;
  }
  return true;
}

/**
 * 되돌리기 (GDD 5.5, 차원술사 특색 M7-2가 쓴다): 출발 지점(진행도 0)으로 옮긴다. 보스는 면역 → false.
 * 순환 맵(무한 모드)에는 출발 지점이 의미가 없어 차원술사는 대신 정지를 건다 (TOWERS.md 5장) — 그 분기는 특색 쪽에서.
 */
export function applyReturn(mob: Mob): boolean {
  if (mob.boss) return false;
  mob.progress = 0;
  mob.moveRem = 0;
  return true;
}

/** 지금 걸린 지속 피해 중첩 수 (종류별, 화면·테스트용). */
export function dotStacks(mob: Pick<Mob, 'dots'>, kind: string, tick: number): number {
  let n = 0;
  for (const d of mob.dots) if (d.kind === kind && d.until > tick) n++;
  return n;
}

/** 몹별 재사용 대기: 출처 src가 지금 쓸 수 있는가. */
export function cdReady(mob: Pick<Mob, 'cds'>, src: string, tick: number): boolean {
  for (const c of mob.cds) if (c.src === src && c.until > tick) return false;
  return true;
}

/** 몹별 재사용 대기 걸기: 지금부터 durTicks 동안 출처 src는 이 몹에게 다시 쓸 수 없다. */
export function setCd(mob: Mob, src: string, tick: number, durTicks: number): void {
  upsert(mob.cds, src, 0, tick + durTicks);
}

/** 상태 이상이 하나라도 남아 있는가 (상태 이상 시스템이 건너뛸지 정할 때). */
function hasAnyStatus(mob: Mob): boolean {
  return mob.slows.length > 0 || mob.vulns.length > 0 || mob.marks.length > 0 || mob.dots.length > 0 || mob.cds.length > 0 || mob.dotAcc > 0 || mob.freezeVulnBp > 0;
}

/**
 * 지속 피해 한 번 넣기 (× ATK_SCALE 고정 피해): 약화가 곱해지고 방어는 무시, 몹의 나머지를 이어 정수 피해로 자른다.
 * 'hit' 사건 { dot: true }. 죽으면 처치 (보상 그대로) 후 true.
 */
export function dealDotDamage(ctx: MatchContext, world: World, mob: Mob, dmgC: number): boolean {
  const d = damageAgainst({ p: 0, m: 0, t: dmgC }, mob, damageCaps(ctx.rules));
  const { dmg, rem } = splitAtk(d.total, mob.dotRem);
  mob.dotRem = rem;
  if (dmg <= 0) return false;
  mob.hp -= dmg;
  const at = positionAt(ctx.map.path, mob.progress);
  const kill = mob.hp <= 0;
  world.emit('hit', { target: mob.id, source: 0, damage: dmg, p: 0, m: 0, t: d.t, crit: false, x: at.x, y: at.y, kill, dot: true });
  if (kill) killMob(ctx, world, mob, at.x, at.y);
  return kill;
}

/**
 * 상태 이상 시스템 (틱마다, 이동 앞): 몹마다 ① 걸린 지속 피해의 초당 피해를 누적 ② 풀린 상태 이상 정리·지금 값 다시 계산
 * ③ 간격(0.5초)마다 누적분을 고정 피해로. 몹은 ID 순.
 */
export function createStatusSystem(ctx: MatchContext): System {
  const rules = ctx.rules.status;
  return (world) => {
    if (ctx.state.phase !== 'playing') return;
    const tick = world.tick;
    const pulse = tick % rules.dotIntervalTicks === 0;
    for (const e of world.entities.list()) {
      if (!isMob(e) || !hasAnyStatus(e)) continue;
      for (const d of e.dots) if (d.until > tick) e.dotAcc += d.dps;
      // 빙결이 풀렸으면 빙결 약화도 지운다 (해시를 작게, 다음 빙결이 새 값을 건다)
      if (e.freezeVulnBp > 0 && !isFrozen(e, tick)) e.freezeVulnBp = 0;
      refreshStatus(rules, e, tick);
      if (!pulse || e.dotAcc < TICK_HZ) continue;
      const dmgC = Math.floor(e.dotAcc / TICK_HZ);
      e.dotAcc -= dmgC * TICK_HZ;
      if (e.dots.length === 0) e.dotAcc = 0; // 다 풀렸으면 1 미만 찌꺼기는 버린다
      dealDotDamage(ctx, world, e, dmgC);
    }
  };
}
