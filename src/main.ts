/**
 * 진입점: 데이터 로드·검사 → DOM 오버레이 → Phaser 시작 (Boot 장면 위에 타이틀).
 * 업데이트 확인(M12)은 게임 시작 뒤 백그라운드로 붙인다.
 */
import './ui/styles.css';
import { DataError, loadGameData } from './data/load';
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
  try {
    const data = loadGameData();
    const url = readUrlOptions(location.search);
    const ctx: GameContext = {
      data,
      ui,
      debug: url.debug,
      seed: url.seed,
      accountLevel: 1,
      version: __APP_VERSION__,
    };
    const game = createGame(must('game'), ctx);
    if (import.meta.env.DEV || url.debug) {
      // 개발·디버그 확인용 (E2E에서 장면 상태를 볼 때도 사용)
      (window as unknown as { __rtd?: unknown }).__rtd = { game, ctx };
    }
  } catch (e) {
    console.error(e);
    const title = e instanceof DataError ? '데이터 파일에 문제가 있어요' : '게임을 시작하지 못했어요';
    ui.showError(title, e instanceof Error ? e.message : String(e));
  }
}

boot();
