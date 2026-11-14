/** Phaser 게임 만들기: 세로 1080×1920 기준, Scale.FIT, 가운데 정렬. */
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import type { GameContext } from './context';
import { BootScene } from './scenes/Boot';
import { GameScene } from './scenes/Game';

export function createGame(parent: HTMLElement, ctx: GameContext): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
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
