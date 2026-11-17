/**
 * 게임 안 피드백 (FB-1): GitHub 새 이슈 화면(이슈 폼 `feedback.yml`)을 미리 채운 주소를 만든다 — 순수 함수만.
 *
 * - 앱은 아무것도 보내지 않는다 (네트워크 코드·토큰 없음). 주소를 휴대폰 브라우저로 열면 플레이어가 GitHub에서 [Submit new issue]를 누른다.
 * - 이슈 폼은 칸의 `id`로 미리 채운다: category(드롭다운: 버그·밸런스·제안·기타) · body_text · game_info · replay. 제목은 `title`.
 * - 주소 전체는 MAX_FEEDBACK_URL(7500자) 이하. 판 기록(replay)이 넘치면 입력 + **마지막** 명령만 남기고 `truncated: true, fromTick: N`.
 *   글(body_text)만으로도 넘치면(한글은 글자당 9자로 인코딩) 글 끝을 자르고 표시한다.
 * - 판 기록 모양은 기존 리플레이 파일(src/sim/replay.ts `ReplayFile`, `replaySnapshot`) 그대로 — 잘리지 않았으면 `playReplay`로 바로 재생된다.
 * - 같은 입력 → 같은 주소 (시간·화면 크기 등은 부르는 쪽이 입력으로 준다).
 */
import type { ReplayFile } from '../sim/replay';

export const FEEDBACK_URL_PREFIX = 'https://github.com/qkqh6898-woohak/Random-TD/issues/new?';
export const FEEDBACK_TEMPLATE = 'feedback.yml';
/** 주소 전체 상한 (GitHub·브라우저 주소 길이 여유) */
export const MAX_FEEDBACK_URL = 7500;
/** 글 상한 (글자 수) */
export const MAX_FEEDBACK_TEXT = 1000;
/** 제목에 넣는 글 앞부분 (글자 수) */
export const TITLE_TEXT_CHARS = 40;

export const FEEDBACK_CATEGORIES = ['버그', '밸런스', '제안', '기타'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const TEXT_CUT_MARK = '\n…(글이 길어 뒷부분이 잘렸어요)';
export const REPLAY_COPIED_NOTE = '전체 기록은 클립보드에 복사됨 — [판 기록] 칸에 붙여 넣어 주세요.';

/** 지금 판 정보 (전투 중일 때만) */
export interface FeedbackMatchInfo {
  mode: string;
  mapId: string;
  theme: number;
  seed: number;
  /** 지금 단계(웨이브) */
  stage: number;
  tick: number;
  /** 배속 (일시정지 중이면 계속하면 돌아갈 배속) */
  speed: number;
  gold: number;
  mobs: number;
  towers: number;
  /** 저장에서 이어 한 판 */
  resumed: boolean;
}

/** game_info 칸에 들어갈 정보 */
export interface FeedbackGameInfo {
  /** 앱 버전 (__APP_VERSION__) */
  version: string;
  /** 'android-app' · 'browser' · 'pwa' */
  platform: string;
  /** '로비' · '전투' */
  where: string;
  /** 개발자 모드 (?debug=1 · ?dev=1 · 테스트 빌드) */
  dev: boolean;
  /** 화면 크기 (예: '412x915 @2.6x') */
  screen: string;
  /** 지역 시간 ISO (예: '2026-11-17T21:03:12+09:00') */
  time: string;
  /** 데이터 지문 (16진수 8자리) — 없으면 줄을 쓰지 않음 */
  dataHash?: string;
  /** 계정 레벨 (있으면) */
  accountLevel?: number;
  match?: FeedbackMatchInfo;
}

export interface FeedbackInput {
  category: FeedbackCategory;
  text: string;
  info: FeedbackGameInfo;
  /** 판 기록 (첨부를 껐거나 판이 없으면 null) */
  replay?: ReplayFile | null;
  /** [기록 복사]로 전체 기록을 클립보드에 넣었다 → 글 끝에 안내 */
  replayCopied?: boolean;
}

export interface FeedbackLink {
  url: string;
  title: string;
  /** 'full' = 전체 기록, 'truncated' = 마지막 명령만, 'none' = 기록 없음(껐거나 판이 없거나 너무 김) */
  replay: 'full' | 'truncated' | 'none';
  /** 주소에 들어간 명령 수 */
  replayCommands: number;
  /** 글 끝이 잘렸나 */
  textCut: boolean;
}

/** 글 검사: 문제가 있으면 화면에 보일 이유, 없으면 null */
export function feedbackTextError(text: string): string | null {
  const t = text.trim();
  if (t.length === 0) return '내용을 적어 주세요.';
  if (chars(t).length > MAX_FEEDBACK_TEXT) return `${MAX_FEEDBACK_TEXT}자까지 적을 수 있어요.`;
  return null;
}

/** 글자(코드 포인트) 단위로 나눈다 — 이모지 반쪽이 남지 않게 */
function chars(s: string): string[] {
  return Array.from(s);
}

/** 제목: `[피드백] <분류>: <글 앞 40자>` (줄바꿈·연속 공백은 한 칸으로) */
export function feedbackTitle(category: FeedbackCategory, text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const c = chars(flat);
  const head = c.length > TITLE_TEXT_CHARS ? `${c.slice(0, TITLE_TEXT_CHARS).join('')}…` : flat;
  return `[피드백] ${category}: ${head}`;
}

const yesNo = (v: boolean): string => (v ? 'yes' : 'no');

/** game_info 칸 글 (한 줄에 `키: 값` 하나 — 사람이 읽고 grep하기 쉽게) */
export function gameInfoText(info: FeedbackGameInfo): string {
  const lines = [
    `app: ${info.version}`,
    `platform: ${info.platform}`,
    `where: ${info.where}`,
    `dev: ${yesNo(info.dev)}`,
    `screen: ${info.screen}`,
    `time: ${info.time}`,
  ];
  if (info.dataHash !== undefined) lines.push(`data: ${info.dataHash}`);
  if (info.accountLevel !== undefined) lines.push(`account: Lv ${info.accountLevel}`);
  const m = info.match;
  if (m) {
    lines.push(
      `mode: ${m.mode}`,
      `map: ${m.mapId}`,
      `theme: ${m.theme}`,
      `seed: ${m.seed}`,
      `stage: ${m.stage}`,
      `tick: ${m.tick}`,
      `speed: x${m.speed}`,
      `gold: ${m.gold}`,
      `mobs: ${m.mobs}`,
      `towers: ${m.towers}`,
      `resumed: ${yesNo(m.resumed)}`,
    );
  }
  return lines.join('\n');
}

/** 판 기록 → 한 줄 JSON (기존 ReplayFile 모양, 공백 없음). keepLast를 주면 마지막 명령만 남기고 truncated·fromTick을 단다. */
export function feedbackReplayJson(file: ReplayFile, keepLast?: number): string {
  if (keepLast === undefined || keepLast >= file.commands.length) return JSON.stringify(file);
  const kept = keepLast <= 0 ? [] : file.commands.slice(file.commands.length - keepLast);
  const first = kept[0];
  const fromTick = first && typeof first.tick === 'number' ? first.tick : file.endTick;
  return JSON.stringify({ ...file, commands: kept, truncated: true, fromTick });
}

/** 지역 시간 ISO 8601 (초까지 + ±hh:mm) — Date를 받는다 (src/sim 밖) */
export function localIsoTime(d: Pick<Date, 'getFullYear' | 'getMonth' | 'getDate' | 'getHours' | 'getMinutes' | 'getSeconds' | 'getTimezoneOffset'>): string {
  const p = (n: number, w = 2): string => String(Math.trunc(Math.abs(n))).padStart(w, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${p(off / 60)}:${p(off % 60)}`;
}

function query(params: [string, string][]): string {
  return params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

/**
 * 피드백 주소 만들기. 순서: template · title · category · body_text · game_info · replay.
 * 1) 기록 없이 맞춰 본다 — 넘치면 글 끝을 잘라 맞춘다.
 * 2) 기록이 있으면 전체 → 안 들어가면 마지막 명령을 들어가는 만큼(이분 탐색) → 명령 0개도 안 들어가면 기록 없음.
 */
export function buildFeedbackUrl(input: FeedbackInput, maxLength = MAX_FEEDBACK_URL): FeedbackLink {
  const title = feedbackTitle(input.category, input.text);
  const info = gameInfoText(input.info);
  const note = input.replayCopied && input.replay ? `\n\n${REPLAY_COPIED_NOTE}` : '';
  const body = (text: string): string => `${text}${note}`;
  const base = (text: string): [string, string][] => [
    ['template', FEEDBACK_TEMPLATE],
    ['title', title],
    ['category', input.category],
    ['body_text', body(text)],
    ['game_info', info],
  ];
  const urlOf = (params: [string, string][]): string => `${FEEDBACK_URL_PREFIX}${query(params)}`;

  let text = input.text.trim();
  let textCut = false;
  if (urlOf(base(text)).length > maxLength) {
    textCut = true;
    const c = chars(text);
    let lo = 0;
    let hi = c.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (urlOf(base(c.slice(0, mid).join('') + TEXT_CUT_MARK)).length <= maxLength) lo = mid;
      else hi = mid - 1;
    }
    text = c.slice(0, lo).join('') + TEXT_CUT_MARK;
  }
  const params = base(text);
  const plain = urlOf(params);
  const file = input.replay ?? null;
  if (!file) return { url: plain, title, replay: 'none', replayCommands: 0, textCut };

  const withReplay = (json: string): string => `${plain}&replay=${encodeURIComponent(json)}`;
  const full = withReplay(feedbackReplayJson(file));
  if (full.length <= maxLength) return { url: full, title, replay: 'full', replayCommands: file.commands.length, textCut };

  const fits = (k: number): boolean => withReplay(feedbackReplayJson(file, k)).length <= maxLength;
  if (!fits(0)) return { url: plain, title, replay: 'none', replayCommands: 0, textCut };
  let lo = 0;
  let hi = file.commands.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return { url: withReplay(feedbackReplayJson(file, lo)), title, replay: 'truncated', replayCommands: lo, textCut };
}
