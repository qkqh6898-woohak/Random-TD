/**
 * Boot 장면: 타이틀 배경과 대기 동작하는 타워들을 그리고, 그 위에 DOM 타이틀 화면을 띄운다.
 * [시작] → Game 장면으로.
 */
import Phaser from 'phaser';
import { GRADE_COLORS } from '../../art/palette';
import { createChibi, type ChibiProp } from '../../art/chibi';
import { createTitleScreen } from '../../ui/screens/TitleScreen';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_BOOT, SCENE_GAME } from '../config';
import { drawTitleBackdrop } from '../render/TitleBackdrop';
import type { GameContext } from '../context';

interface TitleTower {
  towerId: string;
  prop: ChibiProp;
  x: number;
  y: number;
  stars: number;
  scale: number;
}

/** 타이틀에 세울 타워 (기본 덱 노말 타워 중 종족이 다른 셋). 색은 데이터에서 읽는다. */
const TITLE_TOWERS: TitleTower[] = [
  { towerId: 'archer', prop: 'bow', x: 230, y: 1385, stars: 1, scale: 1 },
  { towerId: 'miner', prop: 'pickaxe', x: 540, y: 1440, stars: 1, scale: 1.1 },
  { towerId: 'warrior', prop: 'sword', x: 850, y: 1385, stars: 1, scale: 1 },
];

export class BootScene extends Phaser.Scene {
  constructor(private readonly ctx: GameContext) {
    super({ key: SCENE_BOOT });
  }

  create(): void {
    const { data } = this.ctx;
    const kingdom = data.towers.factions.kingdom?.color ?? '#2E5AAC';
    drawTitleBackdrop(this, { kingdomColor: kingdom });

    const towers = new Map(data.towers.towers.map((t) => [t.id, t]));
    TITLE_TOWERS.forEach((tt, i) => {
      const t = towers.get(tt.towerId) ?? data.towers.towers[i];
      if (!t) return;
      const factionColor = data.towers.factions[t.faction]?.color ?? '#888888';
      createChibi(this, tt.x, tt.y, {
        bodyColor: factionColor,
        pedestalColor: GRADE_COLORS[t.grade],
        prop: tt.prop,
        stars: tt.stars,
        scale: tt.scale,
        idleDelay: [0, 420, 210][i] ?? 0,
      });
    });

    this.cameras.main.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.cameras.main.fadeIn(250, 13, 18, 32);

    this.ctx.ui.clear('hud');
    this.ctx.ui.show(
      'screen',
      createTitleScreen({
        version: `v${this.ctx.version} · M0`,
        onStart: () => this.startGame(),
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.ctx.ui.clear('screen'));
    this.game.events.emit('rtd:title-ready');
  }

  private startGame(): void {
    const seed = this.ctx.seed ?? Math.floor(Math.random() * 4294967296);
    this.scene.start(SCENE_GAME, { seed });
  }
}
