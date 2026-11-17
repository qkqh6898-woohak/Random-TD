/**
 * 피드백 창(FB-1)에 넣을 게임 정보 모으기 — 장면(Boot 로비 · Game 일시정지)이 부른다.
 * 화면·시간·플랫폼은 여기서 읽고(src/sim 밖이라 Date 사용 가능), 주소 만들기는 순수 모델(src/feedback/feedbackModel.ts)이 한다.
 */
import type { GameData } from '../data/load';
import { hashHex } from '../sim/hash';
import type { Match } from '../sim/match';
import { dataFingerprint, replaySnapshot, type ReplayFile } from '../sim/replay';
import { localIsoTime, type FeedbackGameInfo } from '../feedback/feedbackModel';
import { platformName, type FeedbackHost } from '../feedback/openFeedback';
import { createFeedbackDialog, type FeedbackDialogView, type FeedbackSnapshot } from '../ui/screens/FeedbackDialog';
import type { GameContext } from './context';

const fingerprints = new WeakMap<GameData, number>();

/** 데이터 지문 (처음 한 번 계산 — 약 15ms) */
export function cachedFingerprint(data: GameData): number {
  let f = fingerprints.get(data);
  if (f === undefined) {
    f = dataFingerprint(data);
    fingerprints.set(data, f);
  }
  return f;
}

function screenText(): string {
  if (typeof window === 'undefined') return '?';
  const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
  return `${window.innerWidth}x${window.innerHeight} @${dpr}x`;
}

/** 판 밖·안 공통 정보 */
export function baseFeedbackInfo(ctx: GameContext, where: string): FeedbackGameInfo {
  return {
    version: ctx.version,
    platform: platformName(window as unknown as FeedbackHost),
    where,
    dev: ctx.debug,
    screen: screenText(),
    time: localIsoTime(new Date()),
    dataHash: hashHex(cachedFingerprint(ctx.data)),
    accountLevel: ctx.progress ? ctx.progress.level() : undefined,
  };
}

/** 전투 중 정보 + 판 기록 */
export function matchFeedbackSnapshot(ctx: GameContext, match: Match, speed: number, resumed: boolean): FeedbackSnapshot {
  const s = match.state;
  return {
    info: {
      ...baseFeedbackInfo(ctx, '전투'),
      match: {
        mode: s.mode,
        mapId: match.map.id,
        theme: s.theme,
        seed: match.world.seed,
        stage: s.stage,
        tick: match.tick,
        speed,
        gold: s.gold,
        mobs: match.mobCount(),
        towers: match.towers().length,
        resumed,
      },
    },
    replay: (): ReplayFile => {
      // 이어 한 긴 판은 저장에서 실행 기록이 빠질 수 있다 (MatchSaves MAX_SAVED_EXECUTED) → 재생할 수 없다고 적어 둔다
      const missing = resumed && match.world.executed.length === 0 && match.tick > 0;
      return replaySnapshot(match, {
        name: `feedback-${match.world.seed}-${match.tick}`,
        note: missing ? 'FB-1 게임 안 피드백 · 이어 한 판이라 실행 기록이 없어요 (재생 불가)' : 'FB-1 게임 안 피드백',
        dataHash: cachedFingerprint(ctx.data),
      });
    },
  };
}

/** 피드백 창 만들기 (장면 공용) */
export function createSceneFeedback(ctx: GameContext, snapshot: () => FeedbackSnapshot, attachDefault: boolean): FeedbackDialogView {
  return createFeedbackDialog({
    snapshot,
    host: window as unknown as FeedbackHost,
    toast: (text, ms) => ctx.ui.toast(text, ms),
    attachDefault,
  });
}
