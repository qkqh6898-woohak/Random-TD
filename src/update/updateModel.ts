/**
 * 앱 안 업데이트 (U-1) — 순수 규칙: 앱(자바)이 보내는 사건 읽기, 상태 기계, 화면 글.
 *
 * 앱(android/…/Updater.java)이 `window.__rtdUpdate(JSON)`으로 보내는 사건:
 *   none · available(version, current, notes, size) · permission · progress(received, total) · verifying · installing(step?) ·
 *   installed · cancelled · error(code)
 * 상태: idle → checking → available → (permission →) downloading(진행) → verifying → installing → (설치 화면) / error · dismissed(나중에)
 * 웹은 받을 주소를 모른다 — 자바가 릴리스 JSON에서 정한다. 여기서는 받은 값의 모양만 확인한다.
 * 다시 읽기 (V2 L6): 받는 중·설치 중에 페이지가 다시 읽히면 웹은 idle → checking에서 시작한다. 자바 check()는 그때 제안(available)부터
 * 지금 단계(progress → verifying / installing(step) / permission)까지 다시 보낸다 (UpdateLogic.resyncEvents) → 아래 상태 기계가 그대로 따라간다.
 */

export interface UpdateOffer {
  /** 새 버전 (x.y.z) */
  version: string;
  /** 지금 설치된 버전 */
  current: string;
  /** 릴리스 노트 (정리 전 원문, 최대 4000자) */
  notes: string;
  /** APK 크기 (바이트) */
  size: number;
}

export type UpdateErrorCode = 'network' | 'release' | 'digest' | 'permission' | 'install' | 'aborted' | 'bridge';

export type NativeUpdateEvent =
  | { type: 'none'; current: string | null }
  | ({ type: 'available' } & UpdateOffer)
  | { type: 'permission' }
  | { type: 'progress'; received: number; total: number }
  | { type: 'verifying' }
  | { type: 'installing'; confirm: boolean }
  | { type: 'installed' }
  | { type: 'cancelled' }
  | { type: 'error'; code: UpdateErrorCode };

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'none' }
  | { kind: 'available'; offer: UpdateOffer }
  | { kind: 'permission'; offer: UpdateOffer }
  | { kind: 'downloading'; offer: UpdateOffer; received: number; total: number }
  | { kind: 'verifying'; offer: UpdateOffer }
  | { kind: 'installing'; offer: UpdateOffer; confirm: boolean }
  | { kind: 'installed' }
  /** [나중에]·[취소]·뒤로 가기 — 이번 실행에서는 다시 묻지 않는다 */
  | { kind: 'dismissed' }
  /** during: 'check' = 시작할 때 확인 실패(조용히), 'update' = 사람이 누른 업데이트 중 실패(알림) */
  | { kind: 'error'; code: UpdateErrorCode; during: 'check' | 'update' };

export type UpdateAction = { type: 'check' } | { type: 'later' } | { type: 'cancel' } | { type: 'native'; event: NativeUpdateEvent };

const SEMVER = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
const ERROR_CODES: readonly UpdateErrorCode[] = ['network', 'release', 'digest', 'permission', 'install', 'aborted', 'bridge'];
export const MAX_NOTES_CHARS = 4000;
/** 받을 수 있는 APK 최대 크기 (자바 UpdateLogic.MAX_APK_BYTES와 같음) */
export const MAX_APK_BYTES = 64 * 1024 * 1024;

const isCount = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;

/** 앱이 보낸 값 → 사건 (모양이 틀리면 null — 무시한다) */
export function parseNativeEvent(raw: unknown): NativeUpdateEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  switch (o.type) {
    case 'none':
      return { type: 'none', current: typeof o.current === 'string' ? o.current : null };
    case 'available': {
      const { version, current, notes, size } = o;
      if (typeof version !== 'string' || !SEMVER.test(version)) return null;
      if (typeof current !== 'string' || !SEMVER.test(current)) return null;
      if (!isCount(size, MAX_APK_BYTES) || size === 0) return null;
      const text = typeof notes === 'string' ? notes.slice(0, MAX_NOTES_CHARS) : '';
      return { type: 'available', version, current, notes: text, size };
    }
    case 'permission':
    case 'verifying':
    case 'installed':
    case 'cancelled':
      return { type: o.type };
    case 'progress':
      if (!isCount(o.received, MAX_APK_BYTES) || !isCount(o.total, MAX_APK_BYTES)) return null;
      return { type: 'progress', received: Math.min(o.received, o.total), total: o.total };
    case 'installing':
      return { type: 'installing', confirm: o.step === 'confirm' };
    case 'error':
      return { type: 'error', code: ERROR_CODES.includes(o.code as UpdateErrorCode) ? (o.code as UpdateErrorCode) : 'install' };
    default:
      return null;
  }
}

function offerOf(s: UpdateState): UpdateOffer | null {
  return 'offer' in s ? s.offer : null;
}

/** 상태 기계 (순수). 맞지 않는 때 온 사건은 무시한다 (같은 상태 객체를 돌려줌). */
export function reduceUpdate(s: UpdateState, a: UpdateAction): UpdateState {
  if (a.type === 'check') return s.kind === 'idle' ? { kind: 'checking' } : s;
  if (a.type === 'later') {
    return s.kind === 'available' || s.kind === 'permission' || s.kind === 'installing' || s.kind === 'error' ? { kind: 'dismissed' } : s;
  }
  if (a.type === 'cancel') {
    return s.kind === 'downloading' || s.kind === 'verifying' || s.kind === 'permission' || s.kind === 'available' ? { kind: 'dismissed' } : s;
  }
  const e = a.event;
  const offer = offerOf(s);
  switch (e.type) {
    case 'none':
      return s.kind === 'checking' ? { kind: 'none' } : s;
    case 'available':
      return s.kind === 'checking'
        ? { kind: 'available', offer: { version: e.version, current: e.current, notes: e.notes, size: e.size } }
        : s;
    case 'permission':
      return offer && (s.kind === 'available' || s.kind === 'permission') ? { kind: 'permission', offer } : s;
    case 'progress':
      return offer && (s.kind === 'available' || s.kind === 'permission' || s.kind === 'downloading')
        ? { kind: 'downloading', offer, received: e.received, total: e.total }
        : s;
    case 'verifying':
      return offer && s.kind === 'downloading' ? { kind: 'verifying', offer } : s;
    case 'installing':
      return offer && (s.kind === 'downloading' || s.kind === 'verifying' || s.kind === 'installing')
        ? { kind: 'installing', offer, confirm: e.confirm }
        : s;
    case 'installed':
      return s.kind === 'installing' ? { kind: 'installed' } : s;
    case 'cancelled':
      return s.kind === 'dismissed' ? s : offer ? { kind: 'dismissed' } : s;
    case 'error':
      if (s.kind === 'checking') return { kind: 'error', code: e.code, during: 'check' };
      if (offer) return { kind: 'error', code: e.code, during: 'update' };
      return s;
  }
}

/** 업데이트 중 실패 알림 글 (짧게, 해요체) */
export function errorMessage(code: UpdateErrorCode): string {
  switch (code) {
    case 'network':
      return '업데이트를 받지 못했어요. 인터넷 연결을 확인해 주세요';
    case 'digest':
      return '받은 파일이 맞지 않아 지웠어요. 다음에 다시 해 주세요';
    case 'permission':
      return '설치 권한이 없어 업데이트를 멈췄어요';
    case 'install':
      return '설치하지 못했어요. 다음에 다시 해 주세요';
    case 'aborted':
      return '업데이트를 취소했어요';
    case 'release':
    case 'bridge':
      return '업데이트를 확인하지 못했어요';
  }
}

/** 바이트 → 'n.nMB' */
export function formatMb(bytes: number): string {
  return `${(Math.max(0, bytes) / (1024 * 1024)).toFixed(1)}MB`;
}

/** 진행률 0~100 (전체를 모르면 0) */
export function progressPercent(received: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(100, Math.floor((received * 100) / total)));
}

const INSTALL_NOTE = /^Assets의 APK/;
export const MAX_NOTE_LINES = 30;

/**
 * 릴리스 노트(마크다운 원문) → 창에 보여 줄 줄들: 설치 안내 줄·빈 줄 빼기, '### 제목' → '제목', '- 항목' → '• 항목', 최대 30줄.
 * 남는 것이 없으면 기본 한 줄.
 */
export function cleanNotes(body: string): string[] {
  const out: string[] = [];
  for (const raw of body.slice(0, MAX_NOTES_CHARS).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || INSTALL_NOTE.test(line)) continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      if (heading[1]) out.push(heading[1]);
      continue;
    }
    const item = /^[-*]\s+(.*)$/.exec(line);
    out.push(item ? `• ${item[1]}` : line);
    if (out.length >= MAX_NOTE_LINES) break;
  }
  return out.length > 0 ? out : ['자잘한 개선이 들어 있어요.'];
}
