/**
 * FB-1 게임 안 피드백 → GitHub 이슈 폼 주소: 제목·칸·인코딩·7500자 한도·판 기록 자르기·결정성·열기(자바 다리/브라우저).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_URL_PREFIX,
  MAX_FEEDBACK_TEXT,
  MAX_FEEDBACK_URL,
  REPLAY_COPIED_NOTE,
  TEXT_CUT_MARK,
  buildFeedbackUrl,
  feedbackReplayJson,
  feedbackTextError,
  feedbackTitle,
  gameInfoText,
  localIsoTime,
  type FeedbackGameInfo,
  type FeedbackInput,
} from '../../src/feedback/feedbackModel';
import { isAndroidApp, openFeedbackUrl, platformName } from '../../src/feedback/openFeedback';
import { dataFingerprint, playReplay, replaySnapshot, type ReplayFile } from '../../src/sim/replay';
import type { Match } from '../../src/sim/match';
import { data, realInfinite } from '../helpers/match';

const INFO: FeedbackGameInfo = {
  version: '0.1.10',
  platform: 'android-app',
  where: '전투',
  dev: false,
  screen: '412x915 @2.63x',
  time: '2026-11-17T21:03:12+09:00',
  dataHash: '1a2b3c4d',
  accountLevel: 3,
  match: { mode: 'infinite', mapId: 'circle', theme: 0, seed: 7, stage: 4, tick: 2410, speed: 2, gold: 340, mobs: 12, towers: 9, resumed: false },
};

const FP = dataFingerprint(data);

/** 판 하나를 n번 명령(💰 치트 — debug 판)으로 돌린다 */
function playedMatch(commands: number, seed = 7): Match {
  const m = realInfinite(seed, { debug: true });
  for (let i = 0; i < commands; i++) {
    const r = m.world.enqueue({ type: 'debugAddGold', amount: 10 + (i % 7) });
    if (!r.ok) throw new Error(r.reason);
    m.stepN(3);
  }
  return m;
}

function snapshot(m: Match): ReplayFile {
  return replaySnapshot(m, { name: 'feedback-test', dataHash: FP });
}

function params(url: string): URLSearchParams {
  expect(url.startsWith(FEEDBACK_URL_PREFIX)).toBe(true);
  return new URL(url).searchParams;
}

const input = (extra: Partial<FeedbackInput> = {}): FeedbackInput => ({ category: '버그', text: '보스가 길 밖으로 나가요', info: INFO, ...extra });

describe('FB-1 글·제목', () => {
  it('글 검사: 비었거나 공백뿐이면 거절, 1000자까지', () => {
    expect(feedbackTextError('')).toBe('내용을 적어 주세요.');
    expect(feedbackTextError('  \n ')).toBe('내용을 적어 주세요.');
    expect(feedbackTextError('가'.repeat(MAX_FEEDBACK_TEXT))).toBeNull();
    expect(feedbackTextError('가'.repeat(MAX_FEEDBACK_TEXT + 1))).toMatch(/1000자/);
  });

  it('제목 = [피드백] 분류: 글 앞 40자 (줄바꿈은 한 칸, 이모지 반쪽 없음)', () => {
    expect(feedbackTitle('밸런스', '광부가\n너무   세요')).toBe('[피드백] 밸런스: 광부가 너무 세요');
    const long = '😀'.repeat(50);
    const t = feedbackTitle('제안', long);
    expect(t).toBe(`[피드백] 제안: ${'😀'.repeat(40)}…`);
    expect(t.includes('\ud83d…')).toBe(false);
    expect(FEEDBACK_CATEGORIES).toEqual(['버그', '밸런스', '제안', '기타']);
  });

  it('지역 시간 ISO (초 + ±hh:mm)', () => {
    const fake = { getFullYear: () => 2026, getMonth: () => 10, getDate: () => 7, getHours: () => 9, getMinutes: () => 3, getSeconds: () => 5, getTimezoneOffset: () => -540 };
    expect(localIsoTime(fake)).toBe('2026-11-07T09:03:05+09:00');
    expect(localIsoTime({ ...fake, getTimezoneOffset: () => 150 })).toBe('2026-11-07T09:03:05-02:30');
    expect(localIsoTime(new Date())).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
  });

  it('game_info: 버전·플랫폼·모드·맵·시드·단계·틱·배속·골드·몹·타워·개발자·지문·화면·시간', () => {
    const t = gameInfoText(INFO);
    for (const line of [
      'app: 0.1.10',
      'platform: android-app',
      'where: 전투',
      'dev: no',
      'screen: 412x915 @2.63x',
      'time: 2026-11-17T21:03:12+09:00',
      'data: 1a2b3c4d',
      'account: Lv 3',
      'mode: infinite',
      'map: circle',
      'seed: 7',
      'stage: 4',
      'tick: 2410',
      'speed: x2',
      'gold: 340',
      'mobs: 12',
      'towers: 9',
      'resumed: no',
    ]) {
      expect(t.split('\n')).toContain(line);
    }
    const lobby = gameInfoText({ ...INFO, where: '로비', match: undefined, dataHash: undefined });
    expect(lobby).not.toMatch(/seed:|data:/);
  });
});

describe('FB-1 주소', () => {
  it('허용된 앞부분 + template=feedback.yml + title·category·body_text·game_info (이 순서, %20 인코딩), 기록 없으면 replay 없음', () => {
    const link = buildFeedbackUrl(input());
    expect(link.replay).toBe('none');
    expect(link.url.startsWith(`${FEEDBACK_URL_PREFIX}template=feedback.yml&title=`)).toBe(true);
    expect([...params(link.url).keys()]).toEqual(['template', 'title', 'category', 'body_text', 'game_info']);
    const p = params(link.url);
    expect(p.get('template')).toBe('feedback.yml');
    expect(p.get('title')).toBe('[피드백] 버그: 보스가 길 밖으로 나가요');
    expect(p.get('category')).toBe('버그');
    expect(p.get('body_text')).toBe('보스가 길 밖으로 나가요');
    expect(p.get('game_info')).toBe(gameInfoText(INFO));
    expect(link.url).not.toMatch(/[+\s]/); // 공백은 %20, 줄바꿈은 %0A
    expect(link.url).toContain('%0A');
    expect(link.title).toBe(p.get('title'));
  });

  it('특수 문자(&, =, #, %, 따옴표)도 칸을 깨지 않는다', () => {
    const text = 'a&b=c#d%e "f" \'g\' 100%?';
    const p = params(buildFeedbackUrl(input({ text, category: '기타' })).url);
    expect(p.get('body_text')).toBe(text);
    expect(p.get('category')).toBe('기타');
  });

  it('같은 입력 → 같은 주소 (결정적)', () => {
    const m = playedMatch(40);
    const a = buildFeedbackUrl(input({ replay: snapshot(m) }));
    const b = buildFeedbackUrl(input({ replay: snapshot(m) }));
    expect(a).toEqual(b);
  });

  it('짧은 판: 전체 기록 = 기존 리플레이 파일 모양 → playReplay로 지금 틱까지 그대로 재생', () => {
    const m = playedMatch(12);
    const link = buildFeedbackUrl(input({ replay: snapshot(m) }));
    expect(link.replay).toBe('full');
    expect(link.url.length).toBeLessThanOrEqual(MAX_FEEDBACK_URL);
    const file = JSON.parse(params(link.url).get('replay')!) as ReplayFile;
    expect((file as { truncated?: boolean }).truncated).toBeUndefined();
    expect(file.commands).toHaveLength(12);
    expect(file.endTick).toBe(m.tick);
    expect(file.seed).toBe(7);
    const r = playReplay(data, file);
    expect(r.mismatch).toBeNull();
    expect(r.dataChanged).toBe(false);
    expect(r.hash).toBe(m.hash());
  });

  it('긴 판: 입력 + 마지막 명령만 (truncated, fromTick), 주소 ≤ 7500, 들어가는 만큼 최대', () => {
    const m = playedMatch(400);
    const file = snapshot(m);
    const link = buildFeedbackUrl(input({ replay: file }));
    expect(link.replay).toBe('truncated');
    expect(link.url.length).toBeLessThanOrEqual(MAX_FEEDBACK_URL);
    const got = JSON.parse(params(link.url).get('replay')!) as ReplayFile & { truncated: boolean; fromTick: number };
    expect(got.truncated).toBe(true);
    expect(got.commands.length).toBe(link.replayCommands);
    expect(got.commands.length).toBeGreaterThan(10);
    expect(got.commands).toEqual(file.commands.slice(file.commands.length - got.commands.length));
    expect(got.fromTick).toBe(got.commands[0]!.tick);
    // 입력은 그대로
    expect(got.seed).toBe(file.seed);
    expect(got.decks).toEqual(file.decks);
    expect(got.endTick).toBe(file.endTick);
    // 하나 더 넣으면 넘친다
    const oneMore = `${link.url.slice(0, link.url.indexOf('&replay='))}&replay=${encodeURIComponent(feedbackReplayJson(file, got.commands.length + 1))}`;
    expect(oneMore.length).toBeGreaterThan(MAX_FEEDBACK_URL);
  });

  it('한글 1000자 글: 글 끝을 잘라 7500 안 (표시 붙음), 기록은 들어갈 자리가 없으면 빠진다', () => {
    const text = '가나다라마바사아자차'.repeat(100);
    const m = playedMatch(50);
    const link = buildFeedbackUrl(input({ text, replay: snapshot(m) }));
    expect(link.url.length).toBeLessThanOrEqual(MAX_FEEDBACK_URL);
    expect(link.textCut).toBe(true);
    const body = params(link.url).get('body_text')!;
    expect(body.endsWith(TEXT_CUT_MARK)).toBe(true);
    expect(text.startsWith(body.slice(0, body.length - TEXT_CUT_MARK.length))).toBe(true);
    expect(body.length).toBeGreaterThan(300);
  });

  it('[기록 복사]를 썼으면 글 끝에 안내, 기록 첨부를 껐으면 안내도 없음', () => {
    const m = playedMatch(400);
    const withCopy = params(buildFeedbackUrl(input({ replay: snapshot(m), replayCopied: true })).url);
    expect(withCopy.get('body_text')).toBe(`보스가 길 밖으로 나가요\n\n${REPLAY_COPIED_NOTE}`);
    expect(REPLAY_COPIED_NOTE).toContain('전체 기록은 클립보드에 복사됨');
    const off = buildFeedbackUrl(input({ replay: null, replayCopied: true }));
    expect(off.replay).toBe('none');
    expect(params(off.url).get('body_text')).toBe('보스가 길 밖으로 나가요');
    expect(params(off.url).has('replay')).toBe(false);
  });

  it('전체 JSON(복사용)은 자르지 않는다', () => {
    const file = snapshot(playedMatch(400));
    expect(JSON.parse(feedbackReplayJson(file))).toEqual(file);
  });
});

describe('FB-1 열기', () => {
  const url = buildFeedbackUrl(input()).url;

  it('안드로이드 앱: 자바 다리 openFeedback(url) 한 번', () => {
    const openFeedback = vi.fn();
    const open = vi.fn();
    const host = { RandomTDNative: { checkUpdate() {}, openFeedback }, open };
    expect(isAndroidApp(host)).toBe(true);
    expect(platformName(host)).toBe('android-app');
    expect(openFeedbackUrl(url, host)).toBe('native');
    expect(openFeedback).toHaveBeenCalledWith(url);
    expect(open).not.toHaveBeenCalled();
  });

  it('예전 앱(openFeedback 없음): old-app (WebView의 window.open은 열지 못함)', () => {
    const open = vi.fn();
    expect(openFeedbackUrl(url, { RandomTDNative: { checkUpdate() {} }, open })).toBe('old-app');
    expect(open).not.toHaveBeenCalled();
  });

  it('브라우저: window.open(url, _blank, noopener) · PWA 판별', () => {
    const open = vi.fn();
    expect(openFeedbackUrl(url, { open })).toBe('browser');
    expect(open).toHaveBeenCalledWith(url, '_blank', 'noopener');
    expect(platformName({ matchMedia: () => ({ matches: true }) })).toBe('pwa');
    expect(platformName({ matchMedia: () => ({ matches: false }) })).toBe('browser');
  });

  it('허용되지 않은 주소는 열지 않는다', () => {
    const open = vi.fn();
    const openFeedback = vi.fn();
    expect(openFeedbackUrl('https://example.com/issues/new?x', { open })).toBe('failed');
    expect(openFeedbackUrl('https://github.com/qkqh6898-woohak/Random-TD/issues/newx', { RandomTDNative: { openFeedback } })).toBe('failed');
    expect(open).not.toHaveBeenCalled();
    expect(openFeedback).not.toHaveBeenCalled();
  });

  it('자바(FeedbackLinks.java)와 같은 앞부분 · 웹 한도 7500 < 자바 8000 · 웹 주소는 보이는 ASCII만 (자바 검사 통과)', () => {
    const java = readFileSync(join(__dirname, '../../android/src/com/woohak/randomtd/FeedbackLinks.java'), 'utf8');
    expect(java).toContain(`PREFIX = "${FEEDBACK_URL_PREFIX}"`);
    const max = Number(/MAX_LENGTH = (\d+);/.exec(java)?.[1]);
    expect(MAX_FEEDBACK_URL).toBeLessThan(max);
    const long = buildFeedbackUrl(input({ text: '한글 😀\n\t"&=#'.repeat(60), replay: snapshot(playedMatch(300)), replayCopied: true })).url;
    expect(long.length).toBeLessThanOrEqual(MAX_FEEDBACK_URL);
    expect(/^[\x21-\x7e]+$/.test(long)).toBe(true);
  });

  it('웹 쪽 피드백 코드에는 네트워크 호출·토큰이 없다', () => {
    const files = [
      ...readdirSync(join(__dirname, '../../src/feedback')).map((f) => join(__dirname, '../../src/feedback', f)),
      join(__dirname, '../../src/ui/screens/FeedbackDialog.ts'),
      join(__dirname, '../../src/view/feedbackInfo.ts'),
    ];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|api\.github\.com|token|Authorization/i);
    }
  });
});
