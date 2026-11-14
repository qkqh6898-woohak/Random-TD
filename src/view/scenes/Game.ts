/**
 * Game 장면: 한 판(Match = World 고정 20틱 + 시스템) + TickClock(누적 시간·배속)으로 로직과 렌더를 분리한다.
 *
 * 프레임마다: 흐른 시간 → TickClock이 돌릴 틱 수 → match.step() n번 (마지막 틱 직전 진행도·투사체 위치를 기억)
 *           → 사건 처리(단계 알림·패배·소환·공격·피해·처치) → 몹·타워·투사체를 보간(alpha)으로 그림 → 숫자·동전 → HUD 갱신.
 * 화면은 sim 상태를 읽기만 한다. 바꾸는 것은 명령(world.enqueue)으로만: 소환(맵 탭), debug 단계 건너뛰기.
 *
 * - 맵 탭 (M2-7): 빈 배치 칸 → 소환 명령, 돈 부족 → "100원이 필요해요" + 칸 흔들림, 칸이 가득 참 → "빈 칸이 없어요 …".
 *   화면이 sim 상태로 미리 검사하고(summonCheck), sim은 실행 틱에 다시 검사한다 (거절되면 summonFail 사건 → 같은 알림).
 * - 연출은 최근 몇 틱의 사건에만 만든다 → 빨리 감기·높은 배속으로 사건이 한꺼번에 쌓여도 화면이 멈추지 않는다.
 *
 * - 무한 모드: 순환의 정원 / 캠페인(debug): 테마 1 사거리 미로.
 * - ⏸ 또는 앱이 백그라운드로 가면 일시정지 메뉴(UI.md 4.6). 열려 있는 동안 TickClock 배속 0 = 게임 시간 정지.
 * - 패배하면 시간을 멈추고 패배 화면 ([다시 하기] / [타이틀로]).
 * - 맵 배치: DOM HUD(2줄 + 보스 막대 자리)의 실제 높이를 재서 그 아래에 맵을 놓는다 → HUD가 맵 칸을 가리지 않는다.
 *   버튼 최소 44px 때문에 좁은·가로 화면일수록 HUD가 기준 px로 커지므로, 화면 크기가 바뀌면(ResizeObserver) 다시 배치한다.
 */
import Phaser from 'phaser';
import { GRADE_COLORS, hexToInt } from '../../art/palette';
import type { Grade } from '../../data/load';
import { TickClock } from '../../sim/World';
import type { Projectile } from '../../sim/entities/Projectile';
import { createMatch, type Match } from '../../sim/match';
import type { MatchMode } from '../../sim/state';
import { summonCheck, towerCount } from '../../sim/systems/Summon';
import { godDescends } from '../../ui/messages';
import { createHud, type HudView } from '../../ui/hud/Hud';
import { buildHudModel, defeatText, stageToastText } from '../../ui/hud/hudModel';
import { availableSpeeds, nextSpeed } from '../../ui/hud/speed';
import { createGameOverScreen } from '../../ui/screens/GameOverScreen';
import { createPauseMenu } from '../../ui/screens/PauseMenu';
import { SCENE_BOOT, SCENE_GAME } from '../config';
import type { GameContext } from '../context';
import { decideTap, summonFailText, tapAllowed } from '../input/tap';
import { computeMapLayout, cssToGamePx, mapAreaBelowHud, pxToTile, unitsToPx, type MapLayout, type Rect } from '../layout';
import { FloatingTextLayer } from '../render/DamageText';
import { FxLayer } from '../render/Fx';
import { MapRenderer } from '../render/MapRenderer';
import { MobLayer } from '../render/MobSprite';
import { ProjectileLayer, type ProjectileLook } from '../render/ProjectileSprite';
import { TowerLayer } from '../render/TowerSprite';
import { DAMAGE_COLORS, damageColor } from '../render/fxModel';

/** 연출을 만드는 사건: 지금 틱에서 이만큼 안쪽 (빨리 감기로 쌓인 옛 사건은 연출 없이 넘긴다) */
const FX_RECENT_TICKS = 3;
/** 한 프레임에 띄우는 피해 숫자 최대 수 */
const MAX_DAMAGE_TEXTS_PER_FRAME = 16;
/** 한 프레임에 만드는 맞음 불꽃 최대 수 */
const MAX_SPARKS_PER_FRAME = 12;

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
  private towerLayer!: TowerLayer;
  private projectileLayer!: ProjectileLayer;
  private floatingText!: FloatingTextLayer;
  private fx!: FxLayer;
  /** 마지막 틱 직전의 투사체 위치 (보간용) */
  private prevProjectiles = new Map<number, { x: number; y: number }>();
  /** 마지막으로 받은 소환 탭 시각 (연타 거르기) */
  private lastTapMs: number | null = null;
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
    this.prevProjectiles = new Map();
    this.lastTapMs = null;
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
      this.resizeObserver.observe(this.hud.bottomBand);
      this.resizeObserver.observe(this.ctx.ui.el);
    }

    // 맵 탭 → 소환 (M2-7)
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);

    // 앱이 백그라운드로 가면 자동 일시정지 (UI.md 7장: 돌아오면 일시정지 메뉴)
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.pause, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.pause, this);
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
      this.destroyLayers();
      this.mapRenderer = null;
      this.ctx.ui.clear('hud');
      this.ctx.ui.setToastTop(null);
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
      if (Math.abs(area.y - this.mapArea.y) >= 2 || Math.abs(area.h - this.mapArea.h) >= 2) this.applyLayout(area);
      this.updateToastTop();
    }
    if (!this.gameOver) this.runTicks(this.clock.advance(deltaMs));
    this.handleEvents(time);
    const alpha = this.gameOver ? 1 : this.clock.alpha;
    this.mobLayer.sync(this.match.mobs(), this.prevProgress, alpha, time);
    this.towerLayer.sync(this.match.towers(), time);
    this.projectileLayer.sync(this.match.projectiles(), this.prevProjectiles, (p) => this.projectileOrigin(p), alpha);
    this.floatingText.update(time);
    this.fx.update(time, () => this.goldAnchorPx());
    this.refreshHud();
  }

  /** 틱 n번 실행. 마지막 틱 직전의 진행도를 기억해 보간에 쓴다. 패배하면 그 자리에서 멈춘다. */
  private runTicks(n: number): void {
    for (let i = 0; i < n; i++) {
      if (this.match.defeated) break;
      if (i === n - 1) {
        this.prevProgress.clear();
        for (const m of this.match.mobs()) this.prevProgress.set(m.id, m.progress);
        this.prevProjectiles.clear();
        for (const p of this.match.projectiles()) this.prevProjectiles.set(p.id, { x: p.x, y: p.y });
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
    this.prevProjectiles.clear();
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

  /** 화면에 그려진 타워 수 (E2E가 sim 타워 수와 비교). */
  get renderedTowerCount(): number {
    return this.towerLayer.count;
  }

  /** 화면에 그려진 투사체 수. */
  get renderedProjectileCount(): number {
    return this.projectileLayer.count;
  }

  /** 떠 있는 숫자 (피해·돈) 글자 목록. */
  get floatingLabels(): string[] {
    return this.floatingText.activeLabels;
  }

  /** 날아가는 동전 수. */
  get flyingCoins(): number {
    return this.fx.activeCoins;
  }

  /** 타워 그림의 지금 변환 (E2E: 공격하지 않아도 대기 동작으로 움직이는지). */
  towerFigureTransform(id: number): { y: number; scaleY: number; angle: number } | null {
    return this.towerLayer.figureTransform(id);
  }

  /** HUD 띠 아래 끝과 아래 띠 위쪽 끝(기준 px)으로 맵 영역을 정한다. */
  private measureMapArea(): Rect {
    const w = this.ctx.ui.el.clientWidth;
    return mapAreaBelowHud(cssToGamePx(this.hud.bandBottom(), w), cssToGamePx(this.hud.bottomTop(), w));
  }

  /** 알림을 HUD 띠 바로 아래에 띄운다. */
  private updateToastTop(): void {
    const bottom = this.hud.bandBottom();
    this.ctx.ui.setToastTop(bottom > 0 ? bottom + this.ctx.ui.el.clientWidth * 0.02 : null);
  }

  /** HUD 돈 글자 위치 (기준 px) — 동전이 날아갈 곳. */
  private goldAnchorPx(): { x: number; y: number } {
    const a = this.hud.goldAnchor();
    const w = this.ctx.ui.el.clientWidth;
    return { x: cssToGamePx(a.x, w), y: cssToGamePx(a.y, w) };
  }

  /** 새 투사체의 출발 위치 = 쏜 타워 칸 중심 (타워가 없으면 null). */
  private projectileOrigin(p: Projectile): { x: number; y: number } | null {
    const t = this.match.world.entities.get(p.source);
    return t && t.kind === 'tower' ? { x: t.x as number, y: t.y as number } : null;
  }

  private destroyLayers(): void {
    this.mobLayer?.destroy();
    this.towerLayer?.destroy();
    this.projectileLayer?.destroy();
    this.floatingText?.destroy();
    this.fx?.destroy();
  }

  /** 맵 탭: 빈 배치 칸이면 소환 명령, 아니면 알림 (UI.md 4.3·8장). */
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.paused || this.gameOver) return;
    const { tx, ty } = pxToTile(this.layout, pointer.worldX, pointer.worldY);
    const action = decideTap(summonCheck(this.match.ctx, this.match.world, tx, ty), tx, ty, this.match.rules.summonCost);
    if (action.kind === 'summon') {
      const now = this.time.now;
      if (!tapAllowed(this.lastTapMs, now)) return;
      this.lastTapMs = now;
      this.match.world.enqueue({ type: 'summon', x: action.x, y: action.y });
    } else if (action.kind === 'toast') {
      this.ctx.ui.toast(action.text);
      if (action.shake) this.fx.shakeTile(action.x, action.y);
    }
  }

  /** 맵 영역에 맞춰 바닥을 굽고 몹 층을 (다시) 만든다. 몹 그림은 다음 sync에서 새 배치로 다시 생긴다. */
  private applyLayout(area: Rect): void {
    const { maps, towers, enemies } = this.ctx.data;
    const mapData = maps[this.match.state.mapId];
    if (!mapData) throw new Error(`맵 데이터가 없다: ${this.match.state.mapId}`);
    const prevRenderer = this.mapRenderer;
    if (prevRenderer) this.destroyLayers();
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
    const rules = this.match.rules;
    const towerData = new Map(towers.towers.map((t) => [t.id, t]));
    this.towerLayer = new TowerLayer(this, this.layout, {
      look: (id) => {
        const t = towerData.get(id);
        if (!t) throw new Error(`없는 타워: ${id}`);
        return { id: t.id, grade: t.grade, faction: t.faction, damageType: t.damageType, shape: t.shape };
      },
      factionColor: (f) => towers.factions[f]?.color,
      attackIntervalMs: (id) => {
        const aps = rules.towers.get(id)?.apsMilli ?? 1000;
        return aps > 0 ? (1000 * 1000) / aps : 1000;
      },
    });
    this.projectileLayer = new ProjectileLayer(this, this.layout, {
      look: (id): ProjectileLook => {
        const type = rules.towers.get(id)?.damageType;
        return type === 'magic' || type === 'hybrid' ? 'magic' : type === 'true' ? 'true' : 'arrow';
      },
    });
    this.floatingText = new FloatingTextLayer(this, this.layout.tile);
    this.fx = new FxLayer(this, this.layout);
    this.updateToastTop();
  }

  private handleEvents(time: number): void {
    // 한 프레임에 단계가 여러 번 바뀌면(빨리 감기·높은 배속) 마지막 단계 알림 하나만
    let lastStage: { stage: number; boss: boolean } | null = null;
    let defeated = false;
    const recentFrom = this.match.tick - FX_RECENT_TICKS;
    const cost = this.match.rules.summonCost;
    let texts = 0;
    let sparks = 0;
    for (const ev of this.match.world.drainEvents()) {
      const recent = ev.tick >= recentFrom;
      switch (ev.type) {
        case 'stageStart':
          lastStage = { stage: Number(ev.stage), boss: ev.boss === true };
          break;
        case 'defeat':
          defeated = true;
          break;
        case 'summon':
          if (!recent) break;
          this.towerLayer.noteSummoned(Number(ev.id));
          this.fx.summonPillar(Number(ev.x), Number(ev.y), hexToInt(GRADE_COLORS[(ev.grade as Grade) || 'normal'] ?? GRADE_COLORS.normal));
          if (ev.god === true) this.ctx.ui.toast(godDescends(this.ctx.data.towers.towers.find((t) => t.id === ev.tower)?.name ?? String(ev.tower)), 2400);
          break;
        case 'summonFail': {
          if (!recent || ev.player !== 0) break;
          const text = summonFailText(String(ev.reason), cost);
          if (text) this.ctx.ui.toast(text);
          if (ev.reason === 'gold') this.fx.shakeTile(Number(ev.x), Number(ev.y));
          break;
        }
        case 'attack':
          if (recent) this.towerLayer.attack(Number(ev.tower), Number(ev.x), Number(ev.y), time);
          break;
        case 'hit': {
          if (!recent) break;
          this.mobLayer.flash(Number(ev.target), time);
          const color = damageColor(Number(ev.p), Number(ev.m), Number(ev.t));
          if (texts < MAX_DAMAGE_TEXTS_PER_FRAME) {
            texts++;
            const px = unitsToPx(this.layout, Number(ev.x), Number(ev.y));
            const jitter = (Math.random() - 0.5) * this.layout.tile * 0.3;
            this.floatingText.spawn(px.x + jitter, px.y - this.layout.tile * 0.42, String(ev.damage), color, time);
          }
          if (sparks < MAX_SPARKS_PER_FRAME) {
            sparks++;
            this.fx.hitSpark(Number(ev.x), Number(ev.y), hexToInt(color));
          }
          break;
        }
        case 'kill': {
          this.mobLayer.markKilled(Number(ev.id));
          if (!recent) break;
          const reward = Number(ev.reward);
          const px = unitsToPx(this.layout, Number(ev.x), Number(ev.y));
          this.floatingText.spawn(px.x, px.y - this.layout.tile * 0.15, `+${reward}원`, DAMAGE_COLORS.gold, time, true);
          this.fx.coin(Number(ev.x), Number(ev.y), time, () => this.hud.gainGold(reward));
          break;
        }
        case 'miss':
          if (recent) this.fx.missPuff(Number(ev.x), Number(ev.y));
          break;
      }
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
          towerCount: towerCount(this.match.world),
          buildableCount: this.match.map.buildable.length,
          summonCost: this.match.rules.summonCost,
        },
        this.ctx.data.game.hud,
      ),
    );
  }
}
