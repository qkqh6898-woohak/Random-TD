/**
 * Boot 장면: 타이틀 배경과 대기 동작하는 타워들을 그리고, 그 위에 DOM 타이틀 화면을 띄운다.
 * [시작] → Game 장면 (무한 모드, 순환의 정원). ?debug=1 이면 [캠페인 1] → 테마 1 사거리 미로.
 * 타이틀 타워는 캐릭터 다양화 그림(art/characters, 캐릭터별 대기 동작)으로 그린다. 외형 데이터가 없으면 예전 chibi 그림.
 * 바깥 그림 매니페스트(public/assets/characters/manifest.json)도 여기서 읽어 둔다 (없거나 비면 절차 그림 그대로).
 * HF-2: 힉스필드 타이틀 그림(키 아트 1~2 중 무작위)도 여기서 받는다. 받았으면 그것을 꽉 차게 깔고 절차 배경·캐릭터는 그리지 않는다.
 */
import Phaser from 'phaser';
import { GRADE_COLORS } from '../../art/palette';
import { createChibi, type ChibiProp } from '../../art/chibi';
import { TitleCharacter } from '../../art/characters/title';
import { queueExternalCharacterArt } from '../../art/characters/phaserArt';
import { createTitleScreen } from '../../ui/screens/TitleScreen';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_BOOT, SCENE_GAME } from '../config';
import { drawTitleBackdrop } from '../render/TitleBackdrop';
import { drawTitleKeyArt, pickTitleArt, queueTitleArt } from '../render/TitleKeyArt';
import type { GameContext } from '../context';
import type { MatchMode } from '../../sim/state';
import { randomSeed, type GameSceneData } from './Game';

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
  private titleChars: TitleCharacter[] = [];
  /** 이번에 고른 타이틀 그림 텍스처 키 (없으면 null) */
  private keyArtKey: string | null = null;

  constructor(private readonly ctx: GameContext) {
    super({ key: SCENE_BOOT });
  }

  override update(time: number): void {
    for (const c of this.titleChars) c.update(time);
  }

  /** 바깥 그림(힉스필드)을 타이틀 전에 다 받아 둔다. 없거나 실패하면 절차 그림 그대로 */
  preload(): void {
    queueExternalCharacterArt(this);
    // 타이틀 그림: 켤 때마다 하나 (화면 전용 무작위). 한 번 고르면 타이틀로 돌아와도 같은 그림
    if (this.keyArtKey === null) {
      const n = pickTitleArt(this.ctx.data.game.art.titleArts, Math.random());
      if (n !== null) this.keyArtKey = queueTitleArt(this, n);
    }
    const label = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', { fontFamily: '-apple-system, "Noto Sans KR", "Malgun Gothic", sans-serif', fontSize: '44px', color: '#f7f3e9' })
      .setOrigin(0.5);
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => label.setText(`그림 불러오는 중 ${Math.round(p * 100)}%`));
    this.load.once(Phaser.Loader.Events.COMPLETE, () => label.destroy());
  }

  create(): void {
    const { data } = this.ctx;
    const kingdom = data.towers.factions.kingdom?.color ?? '#2E5AAC';
    // 타이틀 그림이 있으면 그것만 (절차 배경·캐릭터는 숨김), 없으면 예전 절차 타이틀
    const keyArt = this.keyArtKey !== null && drawTitleKeyArt(this, this.keyArtKey);
    if (!keyArt) drawTitleBackdrop(this, { kingdomColor: kingdom });

    const towers = new Map(data.towers.towers.map((t) => [t.id, t]));
    this.titleChars = [];
    if (!keyArt) TITLE_TOWERS.forEach((tt, i) => {
      const t = towers.get(tt.towerId) ?? data.towers.towers[i];
      if (!t) return;
      const titled = TitleCharacter.create(this, t.id, tt.x, tt.y, tt.scale, [0.13, 0.57, 0.81][i] ?? 0.3);
      if (titled) {
        this.titleChars.push(titled);
        return;
      }
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
        version: `v${this.ctx.version} · M2`,
        keyArt,
        onStart: () => this.startGame('infinite'),
        onCampaign: this.ctx.debug ? () => this.startGame('campaign') : undefined,
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ctx.ui.clear('screen');
      this.titleChars = [];
    });
    this.game.events.emit('rtd:title-ready');
  }

  private startGame(mode: MatchMode): void {
    const data: GameSceneData = { seed: this.ctx.seed ?? randomSeed(), mode, theme: 1 };
    this.scene.start(SCENE_GAME, data);
  }
}
