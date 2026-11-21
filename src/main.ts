/**
 * 진입점: 데이터 로드·검사 → DOM 오버레이 → Phaser 시작 (Boot 장면 위에 타이틀).
 * 앱 안 업데이트(U-1): 안드로이드 앱(자바 다리가 있을 때)만 — 타이틀이 보이면 한 번 확인한다 (Boot 장면 → UpdateService).
 *
 * 오류: 시작 중(동기) 오류는 try/catch로, 그 뒤 게임 루프 안(장면 create·update)이나 Promise에서 터진 예외는
 * window 'error'·'unhandledrejection' 처리기로 받아 같은 오류 화면을 띄운다.
 */
import type Phaser from 'phaser';
import './ui/styles.css';
import './ui/theme.css';
import './ui/lobby/lobby.css';
import './ui/screens/feedback.css';
import './ui/feedback-design.css';
import { assetUrl } from './assets';
import { loadGameData } from './data/load';
import { allLooks } from './art/characters/looks';
import { createAccountStore } from './meta/account';
import { createSettingsStore } from './meta/settings';
import { loadProgression } from './meta/progressionData';
import { ProgressStore } from './meta/progressStore';
import { onEffectsChange, setEffectsOff } from './view/effects';
import { defaultStorage } from './save/storage';
import { MatchSaves } from './save/MatchSaves';
import { BattleRecords } from './save/BattleRecords';
import { settleAbandonedRun } from './save/settleAbandoned';
import { buildMatchRules, type MatchRules } from './sim/rules';
import { ScreenShake } from './save/ScreenShake';
import { EffectAudio } from './audio/EffectAudio';
import { prefersReducedMotion } from './ui/motion';
import { installNativeBack } from './ui/nativeBack';
import { UpdateService } from './update/UpdateService';
import { mountUpdateDialog } from './ui/screens/UpdateDialog';
import { describeFatal, installFatalHandlers, type FatalPhase } from './ui/fatal';
import { UiRoot } from './ui/root';
import { applyTheme } from './ui/theme';
import { fitStageToWindow, watchViewport } from './ui/stage';
import { readUrlOptions, type GameContext } from './view/context';
import { createGame, resizeGame } from './view/game';
import { createLoadingController, type LoadingController } from './ui/loading/LoadingController';
import { bindLoading } from './ui/loading/bindLoading';

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 요소가 없다 (index.html 확인)`);
  return el as T;
}

function boot(): void {
  document.getElementById('rtd-boot-placeholder')?.remove();
  // 한 파일 빌드에서도 내장된 PNG로 앱 대표 얼굴을 표시한다.
  document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute('href', assetUrl('assets/ui/app-192.png'));
  const touchIcon = document.createElement('link');
  touchIcon.rel = 'apple-touch-icon'; touchIcon.href = assetUrl('assets/ui/app-192.png');
  document.head.append(touchIcon);
  // G-2 테두리 테마 「금테 성채」: data-theme + 코드로 그린 장식 SVG 변수 (theme.css)
  applyTheme();
  const ui = new UiRoot(must('ui-root'));
  let game: Phaser.Game | null = null;
  let loading: LoadingController | null = null;

  const showFatal = (e: unknown, phase: FatalPhase): void => {
    loading?.destroy();
    console.error(e);
    // 같은 예외가 매 프레임 반복되지 않게 게임 루프를 멈춘다
    game?.loop.sleep();
    const { title, detail } = describeFatal(e, phase);
    ui.showError(title, detail);
  };
  installFatalHandlers(window, (e) => showFatal(e, 'run'));

  // PR-B: development-only design system review. No game menu or production route.
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('ui-gallery') === '1') {
    import('./ui/design-system/gallery').then(({ mountDesignGallery }) => mountDesignGallery(must('app'))).catch((e: unknown) => showFatal(e, 'boot'));
    return;
  }

  // PR-C preview is a development-only page, never a game menu entry.
  const loadingPreview = new URLSearchParams(location.search).get('loading-preview');
  if (import.meta.env.DEV && (loadingPreview === 'startup' || loadingPreview === 'transition')) {
    import('./ui/loading/preview').then(({ mountLoadingPreview }) => mountLoadingPreview(document.body, must('app'), loadingPreview)).catch((e: unknown) => showFatal(e, 'boot'));
    return;
  }

  if (new URLSearchParams(location.search).get('gallery') === '1') {
    // 캐릭터 갤러리 (?gallery=1): 게임(Phaser)을 만들지 않고 DOM 갤러리만 띄운다 — 기존 게임 흐름과 무관
    startGallery().catch((e: unknown) => showFatal(e, 'boot'));
    return;
  }

  try {
    loading = createLoadingController(document.body, must('app'), `v${__APP_VERSION__}`);
    const data = loadGameData();
    // 캐릭터 외형 데이터도 시작할 때 검사한다 → 틀리면 첫 그림(타이틀 장면) 안 'run' 오류가 아니라 'boot' 오류 (DataError: 파일 + 필드 경로)
    allLooks();
    const url = readUrlOptions(location.search, import.meta.env.VITE_TEST_BUILD);
    const storage = defaultStorage();
    const account = createAccountStore(storage);
    // 판 밖 성장 (G-3 로비·영웅 수집): 개발자 모드는 따로 된 계정 슬롯. 계정 레벨도 여기서 (경험치로 오름)
    const progress = new ProgressStore(storage, loadProgression(data), data, { dev: url.debug });
    const settings = createSettingsStore(storage);
    // 효과 끄기 (T-2 개발자 도구 → 피드백 #75 일시정지 메뉴·로비 설정 '✨ 화려한 효과' 꺼짐 — 결정 M): 계정 설정 저장값을 일반·개발자 모드 모두 쓴다
    // (DOM 애니메이션·전환은 UI 루트의 .fx-off 클래스로 한꺼번에 끈다 — styles.css)
    onEffectsChange((off) => ui.el.classList.toggle('fx-off', off));
    setEffectsOff(settings.get().effectsOff);
    const audio = new EffectAudio(storage);
    // 효과음은 사람이 누른 입력 안에서만 켠다 (브라우저 자동 재생 규칙, A-1)
    const unlockAudio = (ev: Event): void => {
      if (ev.isTrusted) audio.unlock();
    };
    for (const type of ['click', 'touchend', 'keydown']) window.addEventListener(type, unlockAudio, true);
    // 안드로이드 뒤로 가기 (A-1): 열린 창 → 장면 처리기
    installNativeBack(window, document);
    // 자바가 보내는 짧은 알림 (FB-1 — 브라우저를 열지 못함 등). 글자로만 보인다 (textContent)
    window.__rtdToast = (text: unknown) => {
      if (typeof text === 'string' && text.length > 0) ui.toast(text.slice(0, 80), 2400);
    };
    // 앱 안 업데이트 (U-1): 다리가 없으면(브라우저·PWA) null → 아무것도 하지 않음. 실패해도 게임은 그대로
    const update = UpdateService.fromWindow(window);
    if (update) mountUpdateDialog(update, ui);
    const records = new BattleRecords(storage);
    let rules: MatchRules | null = null;
    const ctx: GameContext = {
      data,
      ui,
      debug: url.debug,
      seed: url.seed,
      // 판을 시작할 때마다 지금 레벨을 읽는다 (로비에서 레벨이 오를 수 있음)
      get accountLevel() {
        return progress.level();
      },
      account,
      progress,
      settings,
      saves: new MatchSaves(data, storage, {
        version: __APP_VERSION__,
        dev: url.debug,
        // V2 M2a: 업데이트로 이어 할 수 없게 된 판은 버리기 전에 정산 (보상·최고 웨이브·전투 기록, runId로 한 번만)
        onAbandoned: (run) => settleAbandonedRun(run, { progress, records, rules: () => (rules ??= buildMatchRules(data)) }),
      }),
      records,
      screenShake: new ScreenShake(storage, () => prefersReducedMotion(window)),
      audio,
      version: __APP_VERSION__,
      update,
    };
    // 화면 꽉 차게 (T-3): 무대 = 화면 비율대로 (가로 1080, 세로 1920~2600), 크기·방향이 바뀌면 다시 맞춘다
    const stage = must('stage');
    const fit = fitStageToWindow(window, stage);
    const g = createGame(must('game'), ctx, fit.gameH);
    game = g;
    bindLoading(g.events, loading);
    // Phaser may finish synchronously when every asset is already embedded/cached.
    if (ui.has('screen')) loading.completeStartup();
    watchViewport(window, () => resizeGame(g, fitStageToWindow(window, stage)));
    if (import.meta.env.DEV || url.debug) {
      // 개발 서버·개발자 모드 확인용 (E2E에서 장면 상태를 볼 때도 사용)
      (window as unknown as { __rtd?: unknown }).__rtd = { game, ctx };
    }
  } catch (e) {
    showFatal(e, 'boot');
  }
}

/** 캐릭터 갤러리 (따로 나눈 묶음 — 게임 시작에는 내려받지 않는다). */
async function startGallery(): Promise<void> {
  const data = loadGameData();
  allLooks();
  const legions = (data.enemies.hierarchy as { legions?: Record<string, { color?: string }> }).legions ?? {};
  const { mountGallery, readGalleryOptions } = await import('./ui/gallery/Gallery');
  const o = readGalleryOptions(location.search);
  mountGallery(document.body, { ...o, legionColor: (legion) => legions[legion]?.color ?? '#9B4DFF' });
}

boot();
