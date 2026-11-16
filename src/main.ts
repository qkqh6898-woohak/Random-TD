/**
 * 진입점: 데이터 로드·검사 → DOM 오버레이 → Phaser 시작 (Boot 장면 위에 타이틀).
 * 업데이트 확인(M12)은 게임 시작 뒤 백그라운드로 붙인다.
 *
 * 오류: 시작 중(동기) 오류는 try/catch로, 그 뒤 게임 루프 안(장면 create·update)이나 Promise에서 터진 예외는
 * window 'error'·'unhandledrejection' 처리기로 받아 같은 오류 화면을 띄운다.
 */
import type Phaser from 'phaser';
import './ui/styles.css';
import { loadGameData } from './data/load';
import { allLooks } from './art/characters/looks';
import { createAccountStore } from './meta/account';
import { createSettingsStore } from './meta/settings';
import { onEffectsChange, setEffectsOff } from './view/effects';
import { defaultStorage } from './save/storage';
import { MatchSaves } from './save/MatchSaves';
import { BattleRecords } from './save/BattleRecords';
import { ScreenShake } from './save/ScreenShake';
import { EffectAudio } from './audio/EffectAudio';
import { prefersReducedMotion } from './ui/motion';
import { installNativeBack } from './ui/nativeBack';
import { describeFatal, installFatalHandlers, type FatalPhase } from './ui/fatal';
import { UiRoot } from './ui/root';
import { fitStageToWindow, watchViewport } from './ui/stage';
import { readUrlOptions, type GameContext } from './view/context';
import { createGame, resizeGame } from './view/game';

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 요소가 없다 (index.html 확인)`);
  return el as T;
}

function boot(): void {
  const ui = new UiRoot(must('ui-root'));
  let game: Phaser.Game | null = null;

  const showFatal = (e: unknown, phase: FatalPhase): void => {
    console.error(e);
    // 같은 예외가 매 프레임 반복되지 않게 게임 루프를 멈춘다
    game?.loop.sleep();
    const { title, detail } = describeFatal(e, phase);
    ui.showError(title, detail);
  };
  installFatalHandlers(window, (e) => showFatal(e, 'run'));

  if (new URLSearchParams(location.search).get('gallery') === '1') {
    // 캐릭터 갤러리 (?gallery=1): 게임(Phaser)을 만들지 않고 DOM 갤러리만 띄운다 — 기존 게임 흐름과 무관
    startGallery().catch((e: unknown) => showFatal(e, 'boot'));
    return;
  }

  try {
    const data = loadGameData();
    // 캐릭터 외형 데이터도 시작할 때 검사한다 → 틀리면 첫 그림(타이틀 장면) 안 'run' 오류가 아니라 'boot' 오류 (DataError: 파일 + 필드 경로)
    allLooks();
    const url = readUrlOptions(location.search, import.meta.env.VITE_TEST_BUILD);
    const storage = defaultStorage();
    const account = createAccountStore(storage);
    const settings = createSettingsStore(storage);
    // 연출 끄기 (개발자 도구, T-2): 개발자 모드에서만 저장값을 쓴다 — 일반 주소는 늘 연출이 켜진 예전 화면
    // (DOM 애니메이션·전환은 UI 루트의 .fx-off 클래스로 한꺼번에 끈다 — styles.css)
    onEffectsChange((off) => ui.el.classList.toggle('fx-off', off));
    setEffectsOff(url.debug && settings.get().effectsOff);
    const audio = new EffectAudio(storage);
    // 효과음은 사람이 누른 입력 안에서만 켠다 (브라우저 자동 재생 규칙, A-1)
    const unlockAudio = (ev: Event): void => {
      if (ev.isTrusted) audio.unlock();
    };
    for (const type of ['click', 'touchend', 'keydown']) window.addEventListener(type, unlockAudio, true);
    // 안드로이드 뒤로 가기 (A-1): 열린 창 → 장면 처리기
    installNativeBack(window, document);
    const ctx: GameContext = {
      data,
      ui,
      debug: url.debug,
      seed: url.seed,
      accountLevel: account.level(),
      account,
      settings,
      saves: new MatchSaves(data, storage, { version: __APP_VERSION__, dev: url.debug }),
      records: new BattleRecords(storage),
      screenShake: new ScreenShake(storage, () => prefersReducedMotion(window)),
      audio,
      version: __APP_VERSION__,
    };
    // 화면 꽉 차게 (T-3): 무대 = 화면 비율대로 (가로 1080, 세로 1920~2600), 크기·방향이 바뀌면 다시 맞춘다
    const stage = must('stage');
    const fit = fitStageToWindow(window, stage);
    const g = createGame(must('game'), ctx, fit.gameH);
    game = g;
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
