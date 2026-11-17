/**
 * 피드백 주소 열기·환경 읽기 (FB-1). 웹은 아무것도 보내지 않는다 — 주소를 휴대폰 브라우저로 열 뿐.
 *
 * - 안드로이드 앱: 자바 다리 `window.RandomTDNative.openFeedback(url)` (GameActivity.NativeBridge — 자바가 주소 앞부분·길이·제어 문자를 다시 확인하고
 *   ACTION_VIEW로 바깥 브라우저를 연다. WebView 자신은 여전히 APK 안 파일만 연다).
 * - 예전 앱(다리는 있는데 openFeedback이 없음, v0.1.10~): WebView에서 window.open은 아무것도 열지 못하므로 주소를 클립보드에 복사하고 알린다.
 * - 브라우저·PWA: window.open(url, '_blank', 'noopener').
 */
import { FEEDBACK_URL_PREFIX } from './feedbackModel';

export interface FeedbackHost {
  RandomTDNative?: unknown;
  open?: (url?: string | URL, target?: string, features?: string) => unknown;
  matchMedia?: (query: string) => { matches: boolean };
}

export type OpenResult = 'native' | 'browser' | 'old-app' | 'failed';

/** 안드로이드 앱인가 (자바 다리가 있음) */
export function isAndroidApp(host: FeedbackHost): boolean {
  const b = host.RandomTDNative;
  return (typeof b === 'object' || typeof b === 'function') && b !== null;
}

/** 'android-app' · 'pwa' · 'browser' */
export function platformName(host: FeedbackHost): string {
  if (isAndroidApp(host)) return 'android-app';
  try {
    if (host.matchMedia?.('(display-mode: standalone)').matches) return 'pwa';
  } catch {
    /* 무시 */
  }
  return 'browser';
}

/** 주소를 연다. 허용된 주소 앞부분이 아니면 열지 않는다. */
export function openFeedbackUrl(url: string, host: FeedbackHost): OpenResult {
  if (!url.startsWith(FEEDBACK_URL_PREFIX)) return 'failed';
  if (isAndroidApp(host)) {
    const bridge = host.RandomTDNative as Record<string, unknown>;
    if (typeof bridge.openFeedback !== 'function') return 'old-app';
    try {
      (bridge.openFeedback as (u: string) => void).call(bridge, url);
      return 'native';
    } catch {
      return 'failed';
    }
  }
  try {
    host.open?.(url, '_blank', 'noopener');
    return 'browser';
  } catch {
    return 'failed';
  }
}

/** 글을 클립보드로 (navigator.clipboard → 안 되면 숨긴 textarea + execCommand('copy')). 됐으면 true. */
export async function copyText(text: string, doc: Document = document, nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator): Promise<boolean> {
  try {
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 아래 방법으로 */
  }
  try {
    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    (doc.querySelector('dialog[open]') ?? doc.body).append(ta);
    ta.select();
    const ok = doc.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
