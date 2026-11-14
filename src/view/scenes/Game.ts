/**
 * Game 장면: World(고정 20틱) + TickClock(누적 시간·배속)으로 로직과 렌더를 분리한다 (DEV_PLAN M0-4).
 *
 * 프레임마다: 흐른 시간 → TickClock이 돌릴 틱 수 계산 → world.step() n번 → 상태를 읽어 그림 (alpha로 보간).
 * M0에는 맵·몹이 없어서, 고정 틱이 도는 것을 보여주는 표식(1.5칸/초로 사각형을 도는 점)만 그린다.
 * M1에서 MapRenderer·MobSprite로 바뀐다.
 */
import Phaser from 'phaser';
import { TICK_HZ, TickClock, World } from '../../sim/World';
import { createHud, type HudView } from '../../ui/hud/Hud';
import { availableSpeeds, nextSpeed } from '../../ui/hud/speed';
import { FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, SCENE_BOOT, SCENE_GAME } from '../config';
import type { GameContext } from '../context';

const TILE_PX = 108; // 화면에서 1칸 = 108px (가로 10칸)
const PROBE_TILES_PER_SEC = 1.5; // 슬라임 이동 속도와 같게 (enemies.json slime.speed)
const LOOP_TILES = 6; // 표식이 도는 사각형 한 변 (칸)

export interface GameSceneData {
  seed: number;
}

export class GameScene extends Phaser.Scene {
  private world!: World;
  private clock!: TickClock;
  private hud!: HudView;
  private speeds: number[] = [1];
  private probe!: Phaser.GameObjects.Arc;
  private probeGlow!: Phaser.GameObjects.Arc;

  constructor(private readonly ctx: GameContext) {
    super({ key: SCENE_GAME });
  }

  create(data: GameSceneData): void {
    const { game: config } = this.ctx.data;
    this.world = new World({ seed: data?.seed ?? 0 });
    this.clock = new TickClock({ speed: 1, maxFrameMs: config.maxFrameMs });
    this.speeds = availableSpeeds(config.speeds, this.ctx.accountLevel, this.ctx.debug);

    this.drawPlaceholderField();

    this.hud = createHud({
      onSpeed: () => {
        this.clock.speed = nextSpeed(this.clock.speed, this.speeds);
        this.refreshHud();
      },
      onExit: () => this.scene.start(SCENE_BOOT),
    });
    this.ctx.ui.clear('screen');
    this.ctx.ui.show('hud', this.hud);
    this.refreshHud();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.ctx.ui.clear('hud'));
    this.cameras.main.fadeIn(200, 13, 18, 32);
    this.game.events.emit('rtd:game-ready', { seed: this.world.seed });
  }

  override update(_time: number, deltaMs: number): void {
    const ticks = this.clock.advance(deltaMs);
    if (ticks > 0) this.world.stepN(ticks);
    this.world.drainEvents(); // M1부터 사건(피해 숫자·소리)을 여기서 처리
    this.renderProbe();
    this.refreshHud();
  }

  private refreshHud(): void {
    this.hud.update({ tick: this.world.tick, elapsedMs: this.world.elapsedMs, speed: this.clock.speed });
  }

  private drawPlaceholderField(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const half = (LOOP_TILES * TILE_PX) / 2;
    const key = 'game-placeholder-field';
    if (!this.textures.exists(key)) {
      // 정적인 바탕은 한 번 그려서 텍스처로 굽는다
      const g = this.make.graphics({}, false);
      g.fillStyle(0x24452b, 1);
      g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      g.lineStyle(2, 0x2f5a37, 1);
      for (let x = 0; x <= GAME_WIDTH; x += TILE_PX) g.lineBetween(x, 0, x, GAME_HEIGHT);
      for (let y = 0; y <= GAME_HEIGHT; y += TILE_PX) g.lineBetween(0, y, GAME_WIDTH, y);
      g.lineStyle(10, 0xc9a36b, 0.9);
      g.strokeRect(cx - half, cy - half, half * 2, half * 2);
      g.generateTexture(key, GAME_WIDTH, GAME_HEIGHT);
      g.destroy();
    }
    this.add.image(0, 0, key).setOrigin(0);

    this.add
      .text(cx, cy - 40, '전투 화면 준비 중', { fontFamily: FONT_FAMILY, fontSize: '64px', color: '#f7f3e9', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(cx, cy + 40, `M1에서 맵·몹이 나와요 · 로직 ${TICK_HZ}틱/초`, { fontFamily: FONT_FAMILY, fontSize: '34px', color: '#c9c3b4' })
      .setOrigin(0.5);

    this.probeGlow = this.add.circle(cx - half, cy - half, 44, 0x7ed957, 0.18);
    this.probe = this.add.circle(cx - half, cy - half, 26, 0x7ed957).setStrokeStyle(6, 0x3b2416);
  }

  /** 틱 + 보간(alpha)으로 표식 위치 계산. 화면 전용 계산이라 sim 상태를 바꾸지 않는다. */
  private renderProbe(): void {
    const ticks = this.world.tick + this.clock.alpha;
    const perimeterPx = LOOP_TILES * 4 * TILE_PX;
    const distPx = ((ticks / TICK_HZ) * PROBE_TILES_PER_SEC * TILE_PX) % perimeterPx;
    const side = LOOP_TILES * TILE_PX;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const x0 = cx - side / 2;
    const y0 = cy - side / 2;
    let x: number;
    let y: number;
    if (distPx < side) {
      x = x0 + distPx;
      y = y0;
    } else if (distPx < side * 2) {
      x = x0 + side;
      y = y0 + (distPx - side);
    } else if (distPx < side * 3) {
      x = x0 + side - (distPx - side * 2);
      y = y0 + side;
    } else {
      x = x0;
      y = y0 + side - (distPx - side * 3);
    }
    this.probe.setPosition(x, y);
    this.probeGlow.setPosition(x, y);
  }
}
