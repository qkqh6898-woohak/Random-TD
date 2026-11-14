/**
 * Game 장면: 한 판(Match = World 고정 20틱 + 시스템) + TickClock(누적 시간·배속)으로 로직과 렌더를 분리한다.
 *
 * 프레임마다: 흐른 시간 → TickClock이 돌릴 틱 수 → match.step() n번 (마지막 틱 직전 진행도를 기억)
 *           → 사건 처리(단계 알림·패배) → 몹을 진행도 보간(alpha)으로 그림 → HUD 갱신.
 * 화면은 sim 상태를 읽기만 한다. 바꾸는 것은 명령(world.enqueue)으로만 (지금은 debug 단계 건너뛰기).
 *
 * - 무한 모드: 순환의 정원 / 캠페인(debug): 테마 1 사거리 미로.
 * - ⏸ 또는 앱이 백그라운드로 가면 일시정지 메뉴(UI.md 4.6). 열려 있는 동안 TickClock 배속 0 = 게임 시간 정지.
 * - 패배하면 시간을 멈추고 패배 화면 ([다시 하기] / [타이틀로]).
 * - 맵 배치: DOM HUD(2줄 + 보스 막대 자리)의 실제 높이를 재서 그 아래에 맵을 놓는다 → HUD가 맵 칸을 가리지 않는다.
 *   버튼 최소 44px 때문에 좁은·가로 화면일수록 HUD가 기준 px로 커지므로, 화면 크기가 바뀌면(ResizeObserver) 다시 배치한다.
 */
import Phaser from 'phaser';
import { hexToInt } from '../../art/palette';
import { TickClock } from '../../sim/World';
import { createMatch, type Match } from '../../sim/match';
import type { MatchMode } from '../../sim/state';
import { createHud, type HudView } from '../../ui/hud/Hud';
import { buildHudModel, defeatText, stageToastText } from '../../ui/hud/hudModel';
import { availableSpeeds, nextSpeed } from '../../ui/hud/speed';
import { createGameOverScreen } from '../../ui/screens/GameOverScreen';
import { createPauseMenu } from '../../ui/screens/PauseMenu';
import { SCENE_BOOT, SCENE_GAME } from '../config';
import type { GameContext } from '../context';
import { computeMapLayout, cssToGamePx, mapAreaBelowHud, type MapLayout, type Rect } from '../layout';
import { MapRenderer } from '../render/MapRenderer';
import { MobLayer } from '../render/MobSprite';

export interface GameSceneData {
  seed: number;
  mode?: MatchMode;
  /** 캠페인 테마 (기본 1) */
  theme?: number;
}

/** 무작위 시드 (화면 쪽에서만 만든다. sim 안에서는 Math.random 금지). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296);
}

export class GameScene extends Phaser.Scene {
  /** 지금 판 (E2E·디버그가 읽을 수 있게 공개, 화면은 읽기만) */
  match!: Match;
  private clock!: TickClock;
  private hud!: HudView;
  private layout!: MapLayout;
  private mapArea!: Rect;
  private mapRenderer: MapRenderer | null = null;
  private mobLayer!: MobLayer;
  /** HUD 크기가 바뀌었다 → 다음 프레임에 맵 배치를 다시 확인 */
  private layoutDirty = false;
  private resizeObserver: ResizeObserver | null = null;
  private speeds: number[] = [1];
  private paused = false;
  private gameOver = false;
  /** 일시정지 전 배속 (계속하면 되돌린다) */
  private resumeSpeed = 1;
  /** 마지막 틱 직전의 몹 진행도 (보간용) */
  private prevProgress = new Map<number, number>();
  private sceneData: Required<GameSceneData> = { seed: 0, mode: 'infinite', theme: 1 };
  private bossNames: Readonly<Record<string, string>> | undefined;

  constructor(private readonly ctx: GameContext) {
    super({ key: SCENE_GAME });
  }

  create(data: GameSceneData): void {
    const { game: config, campaign } = this.ctx.data;
    this.sceneData = { seed: data?.seed ?? 0, mode: data?.mode ?? 'infinite', theme: data?.theme ?? 1 };
    this.match = createMatch(this.ctx.data, {
      seed: this.sceneData.seed,
      mode: this.sceneData.mode,
      theme: this.sceneData.theme,
      maxPlayers: config.maxPlayers,
      debug: this.ctx.debug,
    });
    this.clock = new TickClock({ speed: 1, maxFrameMs: config.maxFrameMs });
    this.speeds = availableSpeeds(config.speeds, this.ctx.accountLevel, this.ctx.debug);
    this.paused = false;
    this.gameOver = false;
    this.prevProgress = new Map();
    this.bossNames =
      this.sceneData.mode === 'campaign' ? campaign.themes.find((t) => t.theme === this.sceneData.theme)?.bossSchedule : undefined;

    // HUD를 먼저 띄워 높이를 잰 뒤 그 아래에 맵을 놓는다
    this.hud = createHud({
      onSpeed: () => {
        if (this.paused || this.gameOver) return;
        this.clock.speed = nextSpeed(this.clock.speed, this.speeds);
        this.refreshHud();
      },
      onPause: () => this.pause(),
      onSkipStage: this.ctx.debug ? () => this.match.world.enqueue({ type: 'debugSkipStage' }) : undefined,
    });
    this.ctx.ui.clear('screen');
    this.ctx.ui.show('hud', this.hud);
    this.refreshHud();

    this.mapRenderer = null;
    this.applyLayout(this.measureMapArea());
    this.layoutDirty = false;
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.layoutDirty = true;
      });
      this.resizeObserver.observe(this.hud.band);
      this.resizeObserver.observe(this.ctx.ui.el);
    }

    // 앱이 백그라운드로 가면 자동 일시정지 (UI.md 7장: 돌아오면 일시정지 메뉴)
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.pause, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.pause, this);
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      this.mobLayer.destroy();
      this.mapRenderer = null;
      this.ctx.ui.clear('hud');
      if (this.paused || this.gameOver) this.ctx.ui.clear('screen');
      this.paused = false;
      this.gameOver = false;
    });
    this.cameras.main.fadeIn(200, 13, 18, 32);
    this.game.events.emit('rtd:game-ready', { seed: this.match.world.seed, mode: this.sceneData.mode });
  }

  override update(time: number, deltaMs: number): void {
    if (this.layoutDirty) {
      this.layoutDirty = false;
      const area = this.measureMapArea();
      // 글자 반올림 같은 작은 흔들림으로 맵을 다시 굽지 않게 (기준 px 2 이상 바뀔 때만)
      if (Math.abs(area.y - this.mapArea.y) >= 2) this.applyLayout(area);
    }
    if (!this.gameOver) this.runTicks(this.clock.advance(deltaMs));
    this.handleEvents();
    this.mobLayer.sync(this.match.mobs(), this.prevProgress, this.gameOver ? 1 : this.clock.alpha, time);
    this.refreshHud();
  }

  /** 틱 n번 실행. 마지막 틱 직전의 진행도를 기억해 보간에 쓴다. 패배하면 그 자리에서 멈춘다. */
  private runTicks(n: number): void {
    for (let i = 0; i < n; i++) {
      if (this.match.defeated) break;
      if (i === n - 1) {
        this.prevProgress.clear();
        for (const m of this.match.mobs()) this.prevProgress.set(m.id, m.progress);
      }
      this.match.step();
    }
  }

  /**
   * 화면 없이 틱을 빨리 돌린다 (?debug=1·E2E 확인용, 배속을 크게 올린 것과 같다 → 결정성에 영향 없음).
   * 패배하면 멈춘다. 실제로 돈 틱 수를 돌려준다.
   */
  debugFastForward(ticks: number): number {
    let done = 0;
    while (done < ticks && !this.match.defeated) {
      this.match.step();
      done++;
    }
    this.prevProgress.clear();
    return done;
  }

  /** 화면에 그려진 몹 수 (E2E가 sim 몹 수와 비교). */
  get renderedMobCount(): number {
    return this.mobLayer.count;
  }

  /** 머리 위 👁를 단 몹 그림 수 (E2E가 sim 투명 몹 수와 비교). */
  get renderedEyeIconCount(): number {
    return this.mobLayer.eyeIconCount;
  }

  /** 지금 맵 배치 (E2E가 칸 위치를 화면 좌표로 바꿀 때, M2 탭 입력). 읽기 전용. */
  get mapLayout(): Readonly<MapLayout> {
    return this.layout;
  }

  /** HUD 띠 아래 끝(기준 px)으로 맵 영역을 정한다. */
  private measureMapArea(): Rect {
    return mapAreaBelowHud(cssToGamePx(this.hud.bandBottom(), this.ctx.ui.el.clientWidth));
  }

  /** 맵 영역에 맞춰 바닥을 굽고 몹 층을 (다시) 만든다. 몹 그림은 다음 sync에서 새 배치로 다시 생긴다. */
  private applyLayout(area: Rect): void {
    const { maps, towers, enemies } = this.ctx.data;
    const mapData = maps[this.match.state.mapId];
    if (!mapData) throw new Error(`맵 데이터가 없다: ${this.match.state.mapId}`);
    const prevRenderer = this.mapRenderer;
    if (this.mobLayer && prevRenderer) this.mobLayer.destroy();
    this.mapArea = area;
    this.layout = computeMapLayout(mapData, area);
    const renderer = new MapRenderer(this, this.match.map, this.layout, {
      kingdomColor: hexToInt(towers.factions.kingdom?.color ?? '#2E5AAC'),
    });
    if (prevRenderer) prevRenderer.destroy(prevRenderer.textureKey !== renderer.textureKey);
    renderer.draw();
    this.mapRenderer = renderer;

    const legions = (enemies.hierarchy as { legions?: Record<string, { color?: string }> }).legions ?? {};
    const sizes = new Map(enemies.mobs.map((m) => [m.id, m.size]));
    this.mobLayer = new MobLayer(
      this,
      this.layout,
      this.match.map.path,
      { legionColor: (legion) => hexToInt(legions[legion]?.color ?? '#9B4DFF') },
      (id) => sizes.get(id) ?? '소형',
    );
  }

  private handleEvents(): void {
    // 한 프레임에 단계가 여러 번 바뀌면(빨리 감기·높은 배속) 마지막 단계 알림 하나만
    let lastStage: { stage: number; boss: boolean } | null = null;
    let defeated = false;
    for (const ev of this.match.world.drainEvents()) {
      if (ev.type === 'stageStart') lastStage = { stage: Number(ev.stage), boss: ev.boss === true };
      else if (ev.type === 'defeat') defeated = true;
    }
    if (lastStage) {
      const { mode, theme } = this.match.state;
      this.ctx.ui.toast(stageToastText({ mode, theme, stage: lastStage.stage, bossStage: lastStage.boss }));
    }
    if (defeated) this.showGameOver();
  }

  private showGameOver(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    if (this.paused) this.paused = false;
    this.clock.speed = 0;
    const text = defeatText(this.match.state);
    this.ctx.ui.show(
      'screen',
      createGameOverScreen({
        ...text,
        onRetry: () => this.scene.restart({ ...this.sceneData, seed: this.ctx.seed ?? randomSeed() }),
        onExit: () => this.scene.start(SCENE_BOOT),
      }),
    );
    this.game.events.emit('rtd:game-over', { stage: this.match.state.stage, reason: this.match.state.defeatReason });
  }

  /** 일시정지 메뉴 열기: 게임 시간을 멈춘다 (배속 0). */
  private pause(): void {
    if (this.paused || this.gameOver) return;
    this.paused = true;
    this.resumeSpeed = this.clock.speed;
    this.clock.speed = 0;
    this.ctx.ui.show(
      'screen',
      createPauseMenu({
        onResume: () => this.resume(),
        onExit: () => this.scene.start(SCENE_BOOT),
      }),
    );
    this.refreshHud();
  }

  /** 일시정지 메뉴 닫고 이전 배속으로. */
  private resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.clock.speed = this.resumeSpeed;
    this.ctx.ui.clear('screen');
    this.refreshHud();
  }

  private refreshHud(): void {
    // 일시정지 중에도 배속 칩은 계속하면 돌아갈 배속을 보여준다
    const speed = this.paused ? this.resumeSpeed : this.gameOver ? 1 : this.clock.speed;
    this.hud.update(
      buildHudModel(
        {
          state: this.match.state,
          ticksLeft: this.match.ticksToNextStage(),
          mobCount: this.match.mobCount(),
          tick: this.match.tick,
          speed,
          bossNames: this.bossNames,
        },
        this.ctx.data.game.hud,
      ),
    );
  }
}
