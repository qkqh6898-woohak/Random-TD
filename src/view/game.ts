/**
 * Phaser 게임 만들기: 가로 1080 고정, 세로는 화면 비율대로 1920~2600 (T-3 '화면 꽉 차게', viewport.ts), Scale.FIT, 가운데 정렬.
 * 무대(#stage)가 게임과 같은 비율이라 FIT 캔버스가 무대를 빈 띠 없이 덮는다.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import type { GameContext } from './context';
import type { StageFit } from './viewport';
import { BootScene } from './scenes/Boot';
import { GameScene } from './scenes/Game';

export function createGame(parent: HTMLElement, ctx: GameContext, height = GAME_HEIGHT): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height,
    backgroundColor: '#0d1220',
    banner: false,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: true,
      roundPixels: false,
    },
    input: {
      activePointers: 2,
    },
    // 소리는 M11에서 WebAudio 절차 합성으로 직접 만든다
    audio: { noAudio: true },
    // smoothStep을 끄면 update(delta)가 실제 흐른 시간 → 게임 시간이 느려지지 않는다 (탭 전환 등 큰 값은 TickClock이 자름)
    fps: { target: 60, smoothStep: false },
    scene: [new BootScene(ctx), new GameScene(ctx)],
  });
}

/**
 * 화면 크기가 바뀐 뒤 (무대 CSS는 이미 맞춤): 논리 높이가 달라졌으면 게임 크기를 바꾸고(장면에 Scale 'resize' 사건),
 * 같아도 캔버스 표시 크기를 무대에 다시 맞춘다.
 */
export function resizeGame(game: Phaser.Game, fit: StageFit): void {
  if (game.scale.height !== fit.gameH || game.scale.width !== fit.gameW) game.scale.setGameSize(fit.gameW, fit.gameH);
  game.scale.refresh();
}
