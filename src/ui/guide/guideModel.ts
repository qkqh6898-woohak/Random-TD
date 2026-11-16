/**
 * 첫 10단계 개선 (F10) 화면 안내의 표시값 — 순수 함수 (DOM·Phaser 없음 → 단위 테스트).
 *
 * - 추천 칸: 첫 소환 전(이 판에 내 타워가 하나도 없고 소환한 적도 없음)에만, 자동 소환과 **같은 점수**(sim rankSummonTiles)의 앞 n칸을 빛낸다.
 * - [▶ 준비 완료]: 준비 단계(0단계)에서 내 타워가 하나 이상이면 보인다. 누르면 readyNow 명령 → 1단계 바로 시작.
 * - 보유 n/3 배지: 같은 종류(승급할 수 있는 등급)가 mergeCount − 1개(기본 2개)인 내 타워 발밑에 '2/3'.
 * - 승급 미리 보기: 결과가 생길 칸 = 고른(누른) 타워 칸, 재료로 사라질 칸 = sim 규칙 그대로 그 타워를 뺀 같은 종류 중
 *   가장 나중에 소환된 2개 (sim Merge.pickConsumed) → 화면 표시와 실제 재료가 늘 같다.
 * - 첫 승급 안내 (계정마다 한 번): 처음 승급할 수 있게 되면 묶음 하나(가장 먼저 소환된 타워가 있는 묶음)를 골라 결과 칸·재료 두 칸·
 *   [⬆ 승급 가능] 버튼을 강조. 안내가 떠 있는 동안 묶음의 다른 타워를 누르면 그 타워가 새 결과 칸이 된다 (재료도 다시 계산).
 * - 이번 판 기록 (개발자 도구): 첫 소환·첫 승급·준비 완료·보스 등장/처치 시각(게임 시간)과 시간 초과 때 남은 보스 체력.
 */
import { TICK_HZ } from '../../sim/World';
import { pickConsumed } from '../../sim/systems/Merge';
import type { Tower } from '../../sim/entities/Tower';

/** 계정 저장소 도움말 id: 첫 승급 안내 */
export const GUIDE_FIRST_MERGE = 'firstMerge';

export interface TileXY {
  tx: number;
  ty: number;
}

type TowerLite = Pick<Tower, 'id' | 'tx' | 'ty' | 'tower' | 'owner'>;

/** 추천 칸을 보일 때인가: 판 진행 중 + 이 판에 소환한 적 없음 + 내 타워 0개. */
export function showRecommended(phase: string, summons: number, myTowers: number): boolean {
  return phase === 'playing' && summons === 0 && myTowers === 0;
}

/** [▶ 준비 완료] 상태: 'hidden'(준비 단계가 아니거나 타워 없음) · 'ready'(누를 수 있음) · 'sent'(보냈고 실행 기다림). */
export type ReadyState = 'hidden' | 'ready' | 'sent';

export function readyButtonState(phase: string, stage: number, myTowers: number, sent: boolean): ReadyState {
  if (phase !== 'playing' || stage !== 0 || myTowers <= 0) return 'hidden';
  return sent ? 'sent' : 'ready';
}

/** 보유 n/3 배지: 같은 종류가 정확히 mergeCount − 1개인 내 타워마다 'n/3' (승급할 수 있는 등급만, 칸 순서 = 타워 ID 순). */
export function pairBadges(
  towers: readonly TowerLite[],
  owner: number,
  mergeCount: number,
  canMerge: (towerId: string) => boolean,
): { tx: number; ty: number; text: string }[] {
  const byKind = new Map<string, TowerLite[]>();
  for (const t of towers) {
    if (t.owner !== owner) continue;
    const list = byKind.get(t.tower);
    if (list) list.push(t);
    else byKind.set(t.tower, [t]);
  }
  const out: { id: number; tx: number; ty: number; text: string }[] = [];
  for (const [kind, list] of byKind) {
    if (list.length !== mergeCount - 1 || !canMerge(kind)) continue;
    for (const t of list) out.push({ id: t.id, tx: t.tx, ty: t.ty, text: `${list.length}/${mergeCount}` });
  }
  out.sort((a, b) => a.id - b.id);
  return out.map(({ tx, ty, text }) => ({ tx, ty, text }));
}

/** 승급 미리 보기: anchor가 결과 칸, sim 규칙의 재료 (mergeCount − 1개). group = 같은 종류 내 타워 (anchor 포함, 3개 이상). */
export function mergePreview(group: readonly Tower[], anchor: Tower, mergeCount: number): { result: TileXY; materials: TileXY[] } | null {
  if (group.length < mergeCount || !group.some((t) => t.id === anchor.id)) return null;
  return {
    result: { tx: anchor.tx, ty: anchor.ty },
    materials: pickConsumed(group, anchor, mergeCount - 1).map((t) => ({ tx: t.tx, ty: t.ty })),
  };
}

/** 첫 승급 안내 단계: 1 = 결과·재료 칸 설명, 2 = 누르는 법 (타워 또는 [⬆ 승급 가능]) */
export type MergeGuideStep = 1 | 2;

/** 첫 승급 안내 글자 (짧게, 두 줄 이하). tapMerge = '눌러서 바로 승급' 설정 */
export function mergeGuideText(step: MergeGuideStep, towerName: string, tapMerge: boolean): { title: string; body: string } {
  if (step === 1) {
    return {
      title: `${towerName} 3개 — 승급할 수 있어요!`,
      body: '금색 칸에 결과가 생기고, 빨간 ✕ 두 칸은 재료로 사라져요',
    };
  }
  return {
    title: '원하는 칸에서 승급하기',
    body: tapMerge ? '금색 타워를 누르면 승급 · 다른 타워를 누르면 그 칸이 결과 칸' : '타워를 눌러 [⬆ 승급] · 누른 타워 칸에 결과가 생겨요',
  };
}

/** 승급 결과 알림: '⬆ 상인' + 역할 한 줄 (towers.json role). 역할이 길면 첫 문장 앞부분만. */
export function mergeResultText(name: string, gradeName: string, role: string, maxRole = 46): { title: string; sub: string } {
  const r = role.trim();
  const sub = r.length > maxRole ? `${r.slice(0, maxRole - 1).trimEnd()}…` : r;
  return { title: `⬆ ${gradeName} ${name}`, sub };
}

// ---------------------------------------------------------------- 이번 판 기록 (개발자 도구, 결정 6)

export interface RunBossLog {
  stage: number;
  name: string;
  spawnTick: number;
  killTick: number | null;
  /** 제한 시간 초과로 졌을 때 남은 체력 (bp, 10000 = 100%). 아니면 null */
  timeoutHpBp: number | null;
}

export interface RunLog {
  firstSummonTick: number | null;
  firstSummonStage: number;
  firstMergeTick: number | null;
  firstMergeStage: number;
  readyTick: number | null;
  /** 준비 완료로 건너뛴 준비 시간 (틱) */
  readyLeftTicks: number;
  bosses: RunBossLog[];
}

export function newRunLog(): RunLog {
  return { firstSummonTick: null, firstSummonStage: 0, firstMergeTick: null, firstMergeStage: 0, readyTick: null, readyLeftTicks: 0, bosses: [] };
}

/** 기록할 사건 (화면이 sim 사건을 받아 넘긴다). stage = 그 사건 때 단계 */
export type RunEvent =
  | { type: 'summon'; tick: number; stage: number }
  | { type: 'merge'; tick: number; stage: number }
  | { type: 'readyNow'; tick: number; left: number }
  | { type: 'bossSpawn'; tick: number; stage: number; name: string }
  | { type: 'bossKill'; tick: number; stage: number }
  | { type: 'bossTimeout'; tick: number; stage: number; hp: number; maxHp: number };

export function recordRunEvent(log: RunLog, ev: RunEvent): void {
  switch (ev.type) {
    case 'summon':
      if (log.firstSummonTick === null) {
        log.firstSummonTick = ev.tick;
        log.firstSummonStage = ev.stage;
      }
      break;
    case 'merge':
      if (log.firstMergeTick === null) {
        log.firstMergeTick = ev.tick;
        log.firstMergeStage = ev.stage;
      }
      break;
    case 'readyNow':
      if (log.readyTick === null) {
        log.readyTick = ev.tick;
        log.readyLeftTicks = ev.left;
      }
      break;
    case 'bossSpawn':
      log.bosses.push({ stage: ev.stage, name: ev.name, spawnTick: ev.tick, killTick: null, timeoutHpBp: null });
      break;
    case 'bossKill': {
      const b = [...log.bosses].reverse().find((x) => x.stage === ev.stage && x.killTick === null);
      if (b) b.killTick = ev.tick;
      break;
    }
    case 'bossTimeout': {
      const b = [...log.bosses].reverse().find((x) => x.stage === ev.stage && x.killTick === null);
      if (b) b.timeoutHpBp = ev.maxHp > 0 ? Math.min(10000, Math.ceil((Math.max(0, ev.hp) * 10000) / ev.maxHp)) : 0;
      break;
    }
  }
}

/** 게임 시간 글자: 틱 → 'm:ss' */
export function gameClock(tick: number): string {
  const sec = Math.floor(tick / TICK_HZ);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function stageWord(stage: number): string {
  return stage === 0 ? '준비' : `${stage}단계`;
}

/** 남은 체력 bp → '34%' (올림) */
function hpPct(bp: number): string {
  return `${Math.ceil(bp / 100)}%`;
}

/** 이번 판 기록 줄 (개발자 도구 '이번 판 기록'). 시각은 게임 시간 (배속·일시정지와 무관). 보스는 최근 3마리. */
export function runLogRows(log: RunLog, nowTick: number): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [{ label: '게임 시간', value: gameClock(nowTick) }];
  rows.push({ label: '첫 소환', value: log.firstSummonTick === null ? '—' : `${gameClock(log.firstSummonTick)} · ${stageWord(log.firstSummonStage)}` });
  rows.push({
    label: '준비 완료',
    value: log.readyTick === null ? '— (60초 기다림)' : `${gameClock(log.readyTick)} · ${Math.round(log.readyLeftTicks / TICK_HZ)}초 일찍`,
  });
  rows.push({ label: '첫 승급', value: log.firstMergeTick === null ? '—' : `${gameClock(log.firstMergeTick)} · ${stageWord(log.firstMergeStage)}` });
  if (log.bosses.length === 0) rows.push({ label: '보스', value: '— (아직 없음)' });
  for (const b of log.bosses.slice(-3)) {
    let v = `등장 ${gameClock(b.spawnTick)}`;
    if (b.killTick !== null) v += ` → 처치 ${gameClock(b.killTick)} (${Math.round((b.killTick - b.spawnTick) / TICK_HZ)}초)`;
    else if (b.timeoutHpBp !== null) v += ` → 시간 초과 · 남은 체력 ${hpPct(b.timeoutHpBp)}`;
    else v += ' → 싸우는 중';
    rows.push({ label: `${b.stage}단계 ${b.name}`, value: v });
  }
  return rows;
}
