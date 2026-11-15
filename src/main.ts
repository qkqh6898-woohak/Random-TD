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
import { createAccountStore } from './meta/account';
import { defaultStorage } from './save/storage';
import { describeFatal, installFatalHandlers, type FatalPhase } from './ui/fatal';
import { UiRoot } from './ui/root';
import { readUrlOptions, type GameContext } from './view/context';
import { createGame } from './view/game';

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

  try {
    const data = loadGameData();
    const url = readUrlOptions(location.search);
    const account = createAccountStore(defaultStorage());
    const ctx: GameContext = {
      data,
      ui,
      debug: url.debug,
      seed: url.seed,
      accountLevel: account.level(),
      account,
      version: __APP_VERSION__,
    };
    game = createGame(must('game'), ctx);
    if (import.meta.env.DEV || url.debug) {
      // 개발·디버그 확인용 (E2E에서 장면 상태를 볼 때도 사용)
      (window as unknown as { __rtd?: unknown }).__rtd = { game, ctx };
    }
  } catch (e) {
    showFatal(e, 'boot');
  }
}

boot();
