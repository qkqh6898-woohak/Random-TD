/**
 * Game 장면: 한 판(Match = World 고정 20틱 + 시스템) + TickClock(누적 시간·배속)으로 로직과 렌더를 분리한다.
 *
 * 프레임마다: 흐른 시간 → TickClock이 돌릴 틱 수 → match.step() n번 (마지막 틱 직전 진행도·투사체 위치를 기억)
 *           → 사건 처리(단계 알림·패배·소환·공격·피해·처치) → 몹·타워·투사체를 보간(alpha)으로 그림 → 숫자·동전 → HUD 갱신.
 * 화면은 sim 상태를 읽기만 한다. 바꾸는 것은 명령(world.enqueue)으로만: 소환(맵 탭), 승급·모두 승급(패널), 이동·교환(끌기), debug 치트.
 *
 * - 맵 탭 (M2-7): 빈 배치 칸 → 소환 명령, 돈 부족 → "100원이 필요해요" + 칸 흔들림, 칸이 가득 참 → "빈 칸이 없어요 …".
 *   화면이 sim 상태로 미리 검사하고(summonCheck), sim은 실행 틱에 다시 검사한다 (거절되면 summonFail 사건 → 같은 알림).
 * - 공격·피해·처치 연출은 최근 몇 틱의 사건에만 만든다 → 빨리 감기·높은 배속으로 사건이 한꺼번에 쌓여도 화면이 멈추지 않는다.
 *   소환·소환 실패(사람이 한 행동의 응답)는 이번 프레임에 돈 틱이면 모두, 신 강림 알림은 언제나 (fxModel.eventFxVisible).
 *
 * - 타워 탭 (M3-11): 정보 패널(DOM) + 사거리 원·같은 종류 강조. 패널의 [승급]·[모두 승급] → merge·mergeAll 명령,
 *   승급 직후 0.3초는 입력을 받지 않는다 (UI.md 9장). 아래 띠 '⬆ 승급 가능 n'을 누르면 승급할 수 있는 타워를 고른다.
 * - 타워 길게 눌러 끌기 (M3-10): 0.3초 누르면 타워가 손가락 위로 들리고(hold 명령 → 끄는 동안 공격 정지, GDD 4.5),
 *   놓을 칸을 초록(이동)·파랑(교환)·빨강(불가)으로 보여준다. 놓을 칸은 손가락이 움직인 만큼만 바뀐다(처음 누른 자리와 무관).
 *   손을 떼면 hold 해제 + move 명령. 명령이 실행될 때까지 놓은 자리에 붙잡아 둔다. 움직이지 않고 떼면 느린 탭 = 정보 패널.
 *   타워를 누르고 있는 동안 다른 손가락의 터치는 받지 않는다 (두 손가락 확대는 M11).
 * - 승급 연출: 사라진 2칸에서 빛 구슬이 결과 칸으로 빨려 들어간 뒤 빛 기둥 (레전드·신은 화면 흔들림). 치명타 숫자는 크게 + '!'.
 * - M3b: 몹 상태 이상(색·머리 위 아이콘·얼음·멈춘 걸음), 진흙 웅덩이·소환 병사, 특색 연출(운석·시간 정지 흑백·주사위·
 *   '+n원' 특색 돈·즉사), 행운의 여신 알림, 오라 타워를 고르면 효과 범위(3×3·5×5)와 효과를 받는 타워 표시, 패널에 오라 반영 값.
 * - M4: 일꾼 고용 버튼(아래 띠)·👷 수(2줄)·일꾼 수입 반짝, 보스 막대(이름표·체력·남은 초)·보스 이름표 배너·보스 처치 배너,
 *   편대 예고 배너(10초 전, 힌트 한 줄)·투명 몹 경고 배너, 보스 카드 3장 고르기 창·승급의 축복 고르기 창(modal 층, 시간은 흐름),
 *   드러난 투명 몹 보라 외곽선·정예 금색 외곽선·보스 크기·날기·피해 감소 고리·보호막 줄, 기절한 타워 잿빛, 회복 초록 숫자·'빗나감'.
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
import { towerAt, type Tower } from '../../sim/entities/Tower';
import { canMergeGrade, mergeOutcomes } from '../../sim/Deck';
import { createMatch, type Match } from '../../sim/match';
import type { MatchMode } from '../../sim/state';
import { NO_MODS, effectiveStats } from '../../sim/stats';
import { mergeableGroups, sameKindTowers } from '../../sim/systems/Merge';
import { isPaused, moveCheck } from '../../sim/systems/Move';
import { auraCovers, auraRadiusOf, auraSpecOf, computeAuras, towerBonus } from '../../sim/systems/Aura';
import { towerLevel } from '../../sim/abilities';
import { METEOR_FX } from '../../sim/abilities/archmage';
import { summonCheck, summonCost, towerCount } from '../../sim/systems/Summon';
import { hireCheck } from '../../sim/systems/Economy';
import { formationById } from '../../sim/systems/Formation';
import { currentOffer } from '../../sim/systems/Cards';
import {
  BOARD_FULL,
  EVADE_LABEL,
  EXECUTE_LABEL,
  FORTUNA_DOUBLE,
  FORTUNA_RARE,
  INVISIBLE_WARN,
  LUCKY_SUMMON,
  bossArrivalText,
  bossKillText,
  bossTag,
  cardPickedText,
  formationBanner,
  godDescends,
  hireFailText,
  invisibleTip,
  mergeFailText,
  mergeReadyToast,
} from '../../ui/messages';
import { createChoicePanel, type ChoicePanelView } from '../../ui/panels/ChoicePanel';
import { cardChoiceModel, mergeChoiceModel } from '../../ui/panels/choiceModel';
import { createTowerPanel, type TowerPanelView } from '../../ui/panels/TowerPanel';
import { buildTowerPanelModel } from '../../ui/panels/towerPanelModel';
import { createHud, type HudView } from '../../ui/hud/Hud';
import { bossHudInput, buildHudModel, deckDetectNames, defeatText, formatStage, legionNameMap, stageToastText } from '../../ui/hud/hudModel';
import { availableSpeeds, nextSpeed } from '../../ui/hud/speed';
import { createGameOverScreen } from '../../ui/screens/GameOverScreen';
import { createPauseMenu } from '../../ui/screens/PauseMenu';
import { SCENE_BOOT, SCENE_GAME } from '../config';
import type { GameContext } from '../context';
import {
  MERGE_INPUT_LOCK_MS,
  dragAim,
  dragFootPx,
  dropPreview,
  inputLocked,
  isTap,
  pressPhase,
  releaseAction,
  type DropPreview,
} from '../input/press';
import { decideTap, summonFailText, tapAllowed, tapTile } from '../input/tap';
import {
  computeMapLayout,
  cssToGamePx,
  gameToCssPx,
  mapAreaBelowHud,
  pxToTile,
  tileCenterPx,
  unitsToPx,
  type MapLayout,
  type Rect,
} from '../layout';
import { FloatingTextLayer } from '../render/DamageText';
import { FxLayer } from '../render/Fx';
import { MapRenderer } from '../render/MapRenderer';
import { MobLayer } from '../render/MobSprite';
import { ProjectileLayer, type ProjectileLook } from '../render/ProjectileSprite';
import { SelectionLayer } from '../render/SelectionLayer';
import { TowerLayer } from '../render/TowerSprite';
import { DAMAGE_COLORS, damageColor, eventFxVisible } from '../render/fxModel';
import { FOOT_OFFSET_TILES, towerFigureSpanTiles } from '../render/towerGeom';
import { PuddleLayer, SoldierLayer } from '../render/AbilitySprites';
import { passiveAuraGlows, type AuraGlow } from '../render/abilityModel';
import { mobLookView, mobScaleMul, mobStatusView } from '../render/statusModel';
/** HUD 띠 아래 끝과 알림 사이 간격 (무대 너비 비율, 2cqw) */
const TOAST_GAP_OF_WIDTH = 0.02;
/** 한 프레임에 띄우는 피해 숫자 최대 수 */
const MAX_DAMAGE_TEXTS_PER_FRAME = 16;
/** 한 프레임에 만드는 맞음 불꽃 최대 수 */
const MAX_SPARKS_PER_FRAME = 12;
/** 한 프레임에 만드는 광역 폭발·연쇄 번개 최대 수 */
const MAX_AREA_FX_PER_FRAME = 8;
/** 운석 한 번에 떨어뜨리는 불덩이 최대 수 */
const MAX_METEOR_FX = 8;
/** '{타워} 승급 가능!' 알림은 판당 처음 몇 번만 (UI.md 8장) */
const MERGE_READY_TOASTS_PER_MATCH = 3;
/** 끌어 놓은 뒤 이동 명령이 실행될 때까지 그 자리에 붙잡아 두는 최대 시간 (ms) */
const DROP_HOLD_MS = 400;
/** 로컬 플레이어 (2인 판은 M13) */
const LOCAL_PLAYER = 0;

/** 타워를 누르고 있는 중 (탭 또는 길게 눌러 끌기). */
interface PressState {
  /** 누른 포인터 (손을 뗀 사건을 놓쳐도 isDown으로 끝을 안다) */
  pointer: Phaser.Input.Pointer;
  id: number;
  tx: number;
  ty: number;
  downMs: number;
  downX: number;
  downY: number;
  /** 지금 손가락 위치 (기준 px) */
  x: number;
  y: number;
  dragging: boolean;
  /** 끌기를 시작하며 hold(on = 1) 명령을 보냈다 → 끝날 때 꼭 on = 0을 보낸다 */
  holdSent: boolean;
  /** 끄는 중 놓을 칸과 미리 보기 */
  drop: { tx: number; ty: number; preview: DropPreview } | null;
}

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
  private puddleLayer!: PuddleLayer;
  private soldierLayer!: SoldierLayer;
  /** 마지막 틱 직전의 병사 진행도 (보간용) */
  private prevSoldiers = new Map<number, number>();
  /** 고른 오라 타워의 효과 범위 표시 (E2E 확인용, 오라 타워가 아니면 null) */
  private auraView: { area: string; radius: number; buffed: number } | null = null;
  /** 평소 옅게 빛나는 오라 타워 자리 (E2E 확인용으로도 읽는다) */
  private auraGlows: AuraGlow[] = [];
  /** 특색 연출 수 (E2E 확인용): 종류 → 횟수 */
  private abilityFx = new Map<string, number>();
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
  /** 이번 프레임에 틱을 돌리기 전의 틱 번호 (이 틱부터 난 사건 = 이번 프레임의 사건) */
  private frameStartTick = 0;
  /** 만든 소환 연출 수 (E2E 확인용) */
  private summonFxCount = 0;
  /** 만든 승급 연출 수 (E2E 확인용) */
  private mergeFxCount = 0;
  private sceneData: Required<GameSceneData> = { seed: 0, mode: 'infinite', theme: 1 };
  private selectionLayer!: SelectionLayer;
  /** 고른 타워 (정보 패널) 엔티티 id */
  private selectedId: number | null = null;
  private panel: TowerPanelView | null = null;
  private press: PressState | null = null;
  /** 끌어 놓고 이동 명령을 기다리는 타워 (그 자리에 붙잡아 둔다) */
  private pendingDrop: { id: number; untilMs: number } | null = null;
  /** 승급 직후 맵 입력 잠금 (UI.md 9장) */
  private inputLockUntil: number | null = null;
  /** 승급 가능 알림을 띄운 종류와 횟수 (판당 3번) */
  private mergeReadyKinds = new Set<string>();
  private mergeReadyToasts = 0;
  private mergeReadyCount = 0;
  /** 타워 종류 → 초상화 이미지 주소 */
  private portraits = new Map<string, string | null>();
  /** 타워 id → 이름 (패널 승급 결과 미리 보기) */
  private towerNames = new Map<string, string>();
  /** 정보 패널 자리를 마지막으로 정한 조건 (고른 타워·칸·배치가 같고 글자가 그대로면 다시 재지 않는다) */
  private panelPlaceKey = '';
  /** 위쪽 정보 패널의 위쪽 끝 = HUD 띠 + 알림 한 줄 자리 아래 (무대 CSS px) */
  private panelTopCss = 0;
  /** M4 고르기 창 (보스 카드·승급의 축복) */
  private choice: ChoicePanelView | null = null;
  /** 군단 id → 이름 (보스 이름표) */
  private legionNames: Record<string, string> = {};

  constructor(private readonly ctx: GameContext) {
    super({ key: SCENE_GAME });
  }

  create(data: GameSceneData): void {
    const { game: config } = this.ctx.data;
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
    this.prevSoldiers = new Map();
    this.abilityFx = new Map();
    this.lastTapMs = null;
    this.frameStartTick = 0;
    this.summonFxCount = 0;
    this.mergeFxCount = 0;
    this.selectedId = null;
    this.panel = null;
    this.press = null;
    this.pendingDrop = null;
    this.inputLockUntil = null;
    this.mergeReadyKinds = new Set();
    this.mergeReadyToasts = 0;
    this.mergeReadyCount = 0;
    this.panelPlaceKey = '';
    this.choice = null;
    this.legionNames = legionNameMap(this.ctx.data.enemies.hierarchy);
    this.towerNames = new Map(this.ctx.data.towers.towers.map((t) => [t.id, t.name]));

    // HUD를 먼저 띄워 높이를 잰 뒤 그 아래에 맵을 놓는다
    this.hud = createHud({
      onSpeed: () => {
        if (this.paused || this.gameOver) return;
        this.clock.speed = nextSpeed(this.clock.speed, this.speeds);
        this.refreshHud();
      },
      onPause: () => this.pause(),
      onSkipStage: this.ctx.debug ? () => this.match.world.enqueue({ type: 'debugSkipStage' }) : undefined,
      onAddGold: this.ctx.debug ? () => this.match.world.enqueue({ type: 'debugAddGold', amount: config.debug.addGold }) : undefined,
      onMergeReady: () => this.selectFirstMergeable(),
      onHire: () => this.hire(),
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

    // 맵 탭 → 소환 (M2-7), 타워 탭 → 정보 패널 (M3-11), 타워 길게 눌러 끌기 → 이동·교환 (M3-10)
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    // 캔버스 위의 DOM(HUD 버튼 등)에서 손을 떼면 Phaser는 'pointerupoutside'를 낸다 → 끌기가 붙잡힌 채 남지 않게 같이 받는다
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);

    // 앱이 백그라운드로 가면 자동 일시정지 (UI.md 7장: 돌아오면 일시정지 메뉴)
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.pause, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.pause, this);
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
      this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
      this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
      this.closePanel();
      this.closeChoice();
      this.press = null;
      this.pendingDrop = null;
      this.destroyLayers();
      this.mapRenderer = null;
      this.ctx.ui.clear('hud');
      this.ctx.ui.setToastTop(null);
      this.ctx.ui.setToastSingle(false);
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
    this.frameStartTick = this.match.tick;
    if (!this.gameOver) this.runTicks(this.clock.advance(deltaMs));
    this.handleEvents(time);
    this.updatePress(this.time.now);
    // 들려 있어야 할 타워(끄는 중 / 놓고 명령을 기다리는 중) 말고는 내려놓는다 — 끌기를 끝내는 길을 놓쳐도 유령 그림이 남지 않게
    this.towerLayer.releaseDragsExcept(this.press?.dragging ? this.press.id : (this.pendingDrop?.id ?? null), this.time.now);
    const alpha = this.gameOver ? 1 : this.clock.alpha;
    const tick = this.match.tick;
    this.puddleLayer.sync(this.match.puddles(), tick, alpha);
    this.mobLayer.sync(
      this.match.mobs(),
      this.prevProgress,
      alpha,
      time,
      (m) => mobStatusView(m, tick),
      (m) => mobLookView(m, tick),
    );
    this.soldierLayer.sync(this.match.soldiers(), this.prevSoldiers, alpha, time);
    this.towerLayer.sync(this.match.towers(), time, tick);
    this.syncChoice();
    this.updateSelection(time);
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
        this.prevSoldiers.clear();
        for (const s of this.match.soldiers()) this.prevSoldiers.set(s.id, s.progress);
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
    this.prevSoldiers.clear();
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

  /** 화면에 그려진 진흙 웅덩이 수 (E2E가 sim 웅덩이 수와 비교). */
  get renderedPuddleCount(): number {
    return this.puddleLayer.count;
  }

  /** 화면에 그려진 소환 병사 수 (E2E가 sim 병사 수와 비교). */
  get renderedSoldierCount(): number {
    return this.soldierLayer.count;
  }

  /** 몹 머리 위 상태 아이콘 수 (E2E). */
  get statusIconCount(): number {
    return this.mobLayer.statusIconCount;
  }

  /** 상태 이상 색이 칠해진 몹 수 (E2E). */
  get tintedMobCount(): number {
    return this.mobLayer.tintedCount;
  }

  /** 고른 오라 타워의 효과 범위 표시: 범위 종류·칸 거리·효과를 받는 타워 수 (E2E). */
  get selectedAura(): { area: string; radius: number; buffed: number } | null {
    return this.auraView;
  }

  /** 평소 옅게 빛나는 오라 타워 자리 (고른 타워 제외, E2E). */
  get passiveAuras(): readonly AuraGlow[] {
    return this.auraGlows;
  }

  /** 지금까지 만든 특색 연출 수 (종류별, E2E). */
  abilityFxCount(kind: string): number {
    return this.abilityFx.get(kind) ?? 0;
  }

  private noteFx(kind: string): void {
    this.abilityFx.set(kind, (this.abilityFx.get(kind) ?? 0) + 1);
  }

  /** 화면에 그려진 투사체 수. */
  get renderedProjectileCount(): number {
    return this.projectileLayer.count;
  }

  /** 떠 있는 숫자의 화면 상자 (기준 px, E2E: 숫자끼리 겹치지 않는지). */
  floatingTextBounds(): { label: string; big: boolean; x: number; y: number; w: number; h: number }[] {
    return this.floatingText.activeBounds();
  }

  /** 떠 있는 숫자 (피해·돈) 글자 목록. */
  get floatingLabels(): string[] {
    return this.floatingText.activeLabels;
  }

  /** 지금까지 만든 소환 연출(빛 기둥 + 등장 동작) 수 (E2E: 느린 프레임에도 소환 연출이 빠지지 않는지). */
  get summonEffects(): number {
    return this.summonFxCount;
  }

  /** 지금까지 만든 승급 연출 수 (E2E). */
  get mergeEffects(): number {
    return this.mergeFxCount;
  }

  /** 고른 타워 엔티티 id (정보 패널, 없으면 null) — E2E. */
  get selectedTowerId(): number | null {
    return this.selectedId;
  }

  /** 끄는 중인가와 놓을 칸 미리 보기 (E2E). */
  get dragState(): { id: number; drop: { tx: number; ty: number; preview: DropPreview } | null } | null {
    return this.press?.dragging ? { id: this.press.id, drop: this.press.drop } : null;
  }

  /** 손가락 위에 들려 그려진 타워 그림 수 (E2E: 끌기가 끝나면 0 — 유령 그림이 남지 않는지). */
  get draggingTowerCount(): number {
    return this.towerLayer.draggingCount;
  }

  /** 타워 그림의 지금 발밑 위치 (기준 px, E2E: 끌기·미끄러짐). */
  towerFootPx(id: number): { x: number; y: number } | null {
    return this.towerLayer.footPx(id);
  }

  /** 날아가는 동전 수. */
  get flyingCoins(): number {
    return this.fx.activeCoins;
  }

  /** 타워 그림의 지금 변환 (E2E: 공격하지 않아도 대기 동작으로 움직이는지). */
  towerFigureTransform(id: number): { y: number; scaleY: number; angle: number } | null {
    return this.towerLayer.figureTransform(id);
  }

  /**
   * HUD 띠 아래 끝과 아래 띠 위쪽 끝(기준 px)으로 맵 영역을 정한다.
   * HUD 띠 바로 아래에는 알림 한 줄 자리(간격 + 실제 알림 높이)를 비워 둔다 → 단계 시작·돈 부족 알림이 맵 첫 줄을 가리지 않는다.
   */
  private measureMapArea(): Rect {
    const w = this.ctx.ui.el.clientWidth;
    const band = this.hud.bandBottom();
    const toastLane = band > 0 ? w * TOAST_GAP_OF_WIDTH + this.ctx.ui.measureToastHeight() : 0;
    return mapAreaBelowHud(cssToGamePx(band + toastLane, w), cssToGamePx(this.hud.bottomTop(), w));
  }

  /**
   * 알림을 HUD 띠 바로 아래(맵 영역 위에 비워 둔 자리)에 띄운다.
   * 위쪽 정보 패널은 그 알림 한 줄 자리 아래에 붙인다 → 알림이 패널 머리줄(이름·별·✕)을 덮지 않는다.
   */
  private updateToastTop(): void {
    const bottom = this.hud.bandBottom();
    const w = this.ctx.ui.el.clientWidth;
    const gap = w * TOAST_GAP_OF_WIDTH;
    this.ctx.ui.setToastTop(bottom > 0 ? bottom + gap : null);
    this.panelTopCss = bottom + gap + this.ctx.ui.measureToastHeight() + gap / 2;
    this.panelPlaceKey = '';
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
    this.selectionLayer?.destroy();
    this.mobLayer?.destroy();
    this.towerLayer?.destroy();
    this.projectileLayer?.destroy();
    this.puddleLayer?.destroy();
    this.soldierLayer?.destroy();
    this.floatingText?.destroy();
    this.fx?.destroy();
  }

  /**
   * 맵 누름 (UI.md 4.3):
   * - 내 타워 칸 → 누르기 시작 (떼면 탭 = 정보 패널, 0.3초 누르고 있으면 끌기 = 이동·교환).
   * - 패널이 열려 있을 때 타워가 아닌 곳 → 패널만 닫는다 (실수로 소환하지 않게).
   * - 빈 배치 칸 → 즉시 소환 명령, 돈 부족·칸 없음 → 알림 (M2).
   */
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.paused || this.gameOver) return;
    const now = this.time.now;
    // 다른 손가락이 타워를 누르거나 끄는 중이면 이 터치는 받지 않는다 (누르기를 덮어쓰면 끌던 그림이 놓은 자리에 남는다).
    // 앞 누르기의 손가락이 이미 떨어졌는데(사건을 놓침) 남아 있으면 취소하고 새로 받는다.
    if (this.press) {
      if (this.press.pointer !== pointer && this.press.pointer.isDown) return;
      this.cancelPress(now);
    }
    if (inputLocked(this.inputLockUntil, now)) return;
    // 아래 칸 타워의 머리(위 칸으로 삐져나온 부분)를 누르면 그 타워 칸 (위 칸 소환 아님)
    const world = this.match.world;
    const { tx, ty } = tapTile(this.layout, pointer.worldX, pointer.worldY, (x, y) => towerAt(world, x, y) !== undefined);
    const tower = towerAt(world, tx, ty);
    if (tower && tower.owner === LOCAL_PLAYER) {
      this.press = {
        pointer,
        id: tower.id,
        tx,
        ty,
        downMs: now,
        downX: pointer.worldX,
        downY: pointer.worldY,
        x: pointer.worldX,
        y: pointer.worldY,
        dragging: false,
        holdSent: false,
        drop: null,
      };
      return;
    }
    if (this.panel) {
      this.closePanel();
      return;
    }
    const action = decideTap(summonCheck(this.match.ctx, this.match.world, tx, ty), tx, ty, summonCost(this.match.ctx));
    if (action.kind === 'summon') {
      if (!tapAllowed(this.lastTapMs, now)) return;
      this.lastTapMs = now;
      this.match.world.enqueue({ type: 'summon', x: action.x, y: action.y });
    } else if (action.kind === 'toast') {
      this.ctx.ui.toast(action.text);
      if (action.shake) this.fx.shakeTile(action.x, action.y);
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const p = this.press;
    if (!p || p.pointer !== pointer) return;
    p.x = pointer.worldX;
    p.y = pointer.worldY;
    this.updatePress(this.time.now);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    const p = this.press;
    if (!p || p.pointer !== pointer) return;
    this.press = null;
    const now = this.time.now;
    p.x = pointer.worldX;
    p.y = pointer.worldY;
    if (p.dragging) {
      this.finishDrag(p, now);
      return;
    }
    if (this.paused || this.gameOver) return;
    const moved = Math.hypot(p.x - p.downX, p.y - p.downY);
    if (!isTap(now - p.downMs, moved, this.layout.tile)) return;
    this.tapTower(p);
  }

  /** 타워 탭: 정보 패널 (같은 타워를 다시 누르면 닫기). 칸이 가득 찼으면 M2 안내도 같이. */
  private tapTower(p: PressState): void {
    if (this.selectedId === p.id && this.panel) this.closePanel();
    else this.selectTower(p.id);
    if (summonCheck(this.match.ctx, this.match.world, p.tx, p.ty) === 'full') this.ctx.ui.toast(BOARD_FULL);
  }

  /** 누르는 중: 0.3초가 지나면 끌기 시작, 끄는 중이면 놓을 칸 미리 보기와 타워 그림 위치 갱신. */
  private updatePress(now: number): void {
    if (this.pendingDrop && now >= this.pendingDrop.untilMs) {
      this.towerLayer.setDrag(this.pendingDrop.id, null, now);
      this.pendingDrop = null;
    }
    const p = this.press;
    if (!p) return;
    if (this.paused || this.gameOver || !this.match.world.entities.has(p.id)) {
      this.cancelPress(now);
      return;
    }
    // 손을 뗀 사건을 놓쳤으면 (터치 취소·창 밖) 여기서 끝낸다
    if (!p.pointer.isDown) {
      this.onPointerUp(p.pointer);
      return;
    }
    const moved = Math.hypot(p.x - p.downX, p.y - p.downY);
    const phase = pressPhase(now - p.downMs, moved, this.layout.tile, p.dragging);
    if (phase === 'cancel') {
      this.press = null;
      return;
    }
    if (phase !== 'drag') return;
    if (!p.dragging) {
      p.dragging = true;
      this.closePanel();
      this.selectedId = p.id;
      // 끄는 동안 이 타워는 공격하지 않는다 (GDD 4.5 '이동 중인 타워는 공격하지 않음'). 끝날 때 on = 0
      p.holdSent = this.match.world.enqueue({ type: 'hold', x: p.tx, y: p.ty, on: 1 }).ok;
    }
    // 놓을 칸 = 원래 칸 중심 + 손가락이 움직인 만큼 (처음 누른 자리가 얼굴이든 머리든 같다). 그림만 0.45칸 들어 올린다
    const L = this.layout;
    const aim = dragAim(tileCenterPx(L, p.tx, p.ty), { x: p.downX, y: p.downY }, { x: p.x, y: p.y });
    const t = pxToTile(L, aim.x, aim.y);
    const inMap = t.tx >= 0 && t.ty >= 0 && t.tx < this.match.map.width && t.ty < this.match.map.height;
    const check = inMap ? moveCheck(this.match.ctx, this.match.world, LOCAL_PLAYER, p.tx, p.ty, t.tx, t.ty) : null;
    p.drop = check ? { tx: t.tx, ty: t.ty, preview: dropPreview(check) } : null;
    this.towerLayer.setDrag(p.id, dragFootPx(aim, L.tile), now);
  }

  /** 끌기를 시작할 때 보낸 hold(on = 1)를 푼다 (놓기·취소 모두). 옮길 때는 이 뒤에 move를 보낸다 (같은 틱, 이 순서로 실행). */
  private releaseHold(p: PressState): void {
    if (!p.holdSent) return;
    p.holdSent = false;
    this.match.world.enqueue({ type: 'hold', x: p.tx, y: p.ty, on: 0 });
  }

  /**
   * 끌기 끝: hold를 풀고, 놓을 수 있는 칸이면 move 명령 (명령이 실행될 때까지 그 자리에 붙잡아 둔다).
   * 제자리에서 거의 움직이지 않고 떼면 느린 탭으로 보고 정보 패널을 연다.
   */
  private finishDrag(p: PressState, now: number): void {
    const drop = p.drop;
    this.selectedId = null;
    this.releaseHold(p);
    const moved = Math.hypot(p.x - p.downX, p.y - p.downY);
    const action = this.paused || this.gameOver ? 'none' : releaseAction(drop?.preview ?? null, moved, this.layout.tile);
    if (action === 'move' && drop) {
      const r = this.match.world.enqueue({ type: 'move', fx: p.tx, fy: p.ty, tx: drop.tx, ty: drop.ty });
      if (r.ok) {
        const c = tileCenterPx(this.layout, drop.tx, drop.ty);
        const at = { x: c.x, y: c.y + this.layout.tile * FOOT_OFFSET_TILES };
        this.towerLayer.setDrag(p.id, at, now);
        this.pendingDrop = { id: p.id, untilMs: now + DROP_HOLD_MS };
        return;
      }
    }
    this.towerLayer.setDrag(p.id, null, now);
    if (action === 'tap' && this.match.world.entities.has(p.id)) this.tapTower(p);
  }

  /** 누르기·끌기 취소 (일시정지·패배·타워가 사라짐·손을 뗀 사건을 놓침). */
  private cancelPress(now: number): void {
    const p = this.press;
    this.press = null;
    if (!p) return;
    this.releaseHold(p);
    if (p.dragging) {
      this.towerLayer.setDrag(p.id, null, now);
      this.selectedId = null;
    }
  }

  /** 타워 고르기 → 정보 패널 열기 (UI.md 4.4). */
  private selectTower(id: number): void {
    const t = this.match.world.entities.get(id);
    if (!t || t.kind !== 'tower') return;
    this.selectedId = id;
    // 바텀 시트는 하나만: 펼친 고르기 창은 알약으로 접는다 (창 뒤에 패널이 열려 ✕가 가려지던 것, 검토 반영)
    if (this.choice && !this.choice.collapsed) this.choice.collapse();
    if (!this.panel) {
      this.panel = createTowerPanel({
        onMerge: () => this.sendMerge('merge'),
        onMergeAll: () => this.sendMerge('mergeAll'),
        onClose: () => this.closePanel(),
      });
      this.ctx.ui.show('panel', this.panel);
    }
    this.refreshPanel();
  }

  /** 아래 띠 '⬆ 승급 가능 n': 가장 먼저 소환된 승급 가능 타워를 고른다. */
  private selectFirstMergeable(): void {
    if (this.paused || this.gameOver) return;
    const g = mergeableGroups(this.match.ctx, this.match.world, LOCAL_PLAYER)[0];
    if (g) this.selectTower(g.first.id);
  }

  private closePanel(): void {
    if (this.panel) this.ctx.ui.clear('panel');
    this.panel = null;
    this.panelPlaceKey = '';
    this.ctx.ui.setToastSingle(false);
    if (!this.press?.dragging) this.selectedId = null;
  }

  /** 정보 패널의 승급 버튼 → 명령. 승급 직후 0.3초는 다시 받지 않는다. */
  private sendMerge(type: 'merge' | 'mergeAll'): void {
    if (this.paused || this.gameOver || this.selectedId === null) return;
    const now = this.time.now;
    if (inputLocked(this.inputLockUntil, now)) return;
    const t = this.match.world.entities.get(this.selectedId) as Tower | undefined;
    if (!t) return;
    const r = this.match.world.enqueue({ type, x: t.tx, y: t.ty });
    if (r.ok) this.inputLockUntil = now + MERGE_INPUT_LOCK_MS;
  }

  /** 지금 고른 타워 (없거나 사라졌으면 null). */
  private selectedTower(): Tower | null {
    if (this.selectedId === null) return null;
    const t = this.match.world.entities.get(this.selectedId);
    return t && t.kind === 'tower' ? (t as Tower) : null;
  }

  /** 초상화: 타워 텍스처 → 이미지 주소 (종류마다 한 번). */
  private portraitOf(towerId: string): string | null {
    if (!this.portraits.has(towerId)) {
      let url: string | null = null;
      try {
        const key = this.towerLayer.textureKey(towerId);
        const b64 = this.textures.getBase64(key);
        url = typeof b64 === 'string' && b64.startsWith('data:') ? b64 : null;
      } catch {
        url = null;
      }
      this.portraits.set(towerId, url);
    }
    return this.portraits.get(towerId) ?? null;
  }

  /** 정보 패널 글자 갱신 (고른 타워가 사라졌으면 닫는다). */
  private refreshPanel(): void {
    if (!this.panel) return;
    const t = this.selectedTower();
    if (!t) {
      this.closePanel();
      return;
    }
    const { rules, decks, state } = this.match.ctx;
    const data = this.ctx.data.towers.towers.find((x) => x.id === t.tower);
    const stats = rules.towers.get(t.tower);
    if (!data || !stats) return;
    const deck = decks[t.owner] ?? rules.baseDeck;
    const names = this.towerNames;
    const factions = this.ctx.data.towers.factions;
    const factionName = factions[data.faction]?.name ?? (data.faction === 'alliance' ? '연합' : data.faction === 'ancient' ? '고대신' : data.faction);
    const model = buildTowerPanelModel({
      data,
      stats,
      // 오라·타워 레벨·자기 특색까지 반영한 지금 값 (버프로 오른 값은 초록, M3-7)
      eff: effectiveStats(rules, stats, state.mods[t.owner] ?? NO_MODS, towerBonus(this.match.ctx, t, computeAuras(this.match.ctx, this.match.world))),
      level: towerLevel(this.match.ctx, t.owner, t.tower),
      factionName,
      owned: sameKindTowers(this.match.world, t.tower, t.owner).length,
      mergeCount: rules.mergeCount,
      mergeableGrade: canMergeGrade(stats.grade),
      outcomes: mergeOutcomes(deck, stats.grade).map((id) => names.get(id) ?? id),
      // '이동 중' = 놓은 뒤 0.5초 정지만 (끄는 동안에는 패널이 닫혀 있다. 느린 탭으로 다시 열 때 hold 해제 전 한 틱 깜빡이지 않게)
      paused: isPaused({ pauseUntil: t.pauseUntil, held: false }, this.match.tick),
      stunned: this.match.tick < t.stunUntil,
      penMaxBp: rules.penMaxBp,
    });
    const changed = this.panel.update(model, this.portraitOf(t.tower));
    // 패널이 고른 타워 그림을 가리지 않게: 실제 패널 높이와 그림 위치를 재서 쪽·접기 단계를 정한다 (바뀔 때만)
    const ui = this.ctx.ui.el;
    const key = `${t.id}|${t.tx},${t.ty}|${this.layout.tile}|${this.layout.originY}|${ui.clientWidth}x${ui.clientHeight}`;
    if (!changed && key === this.panelPlaceKey) return;
    this.panelPlaceKey = key;
    const L = this.layout;
    const c = tileCenterPx(L, t.tx, t.ty);
    const span = towerFigureSpanTiles();
    const w = ui.clientWidth;
    const figure = { top: gameToCssPx(c.y + L.tile * span.top, w), bottom: gameToCssPx(c.y + L.tile * span.bottom, w) };
    const placement = this.panel.place(figure, this.panelTopCss);
    this.ctx.ui.setToastSingle(placement.side === 'top');
  }

  /** 고른 타워의 사거리 원·같은 종류 강조, 끌기 미리 보기 + 패널 갱신. */
  private updateSelection(timeMs: number): void {
    const t = this.selectedTower();
    if (this.selectedId !== null && !t) {
      this.closePanel();
      this.selectedId = null;
    }
    const rules = this.match.rules;
    const p = this.press?.dragging ? this.press : null;
    const stats = t ? rules.towers.get(t.tower) : undefined;
    // 오라 타워: 효과 범위(3×3·5×5)와 지금 효과를 받는 타워 (전체 오라는 판 위 내 타워 모두)
    const aura = t && !p ? auraSpecOf(this.match.ctx, t) : null;
    const buffed =
      t && aura ? this.match.towers().filter((x) => x.owner === t.owner && auraCovers(rules, aura.area, t, x)).map((x) => ({ tx: x.tx, ty: x.ty })) : [];
    this.auraView = aura ? { area: aura.area, radius: auraRadiusOf(rules, aura.area), buffed: buffed.length } : null;
    // 평소 오라 빛 (고른 타워 말고 내 오라 타워 모두, ART.md 2.4)
    this.auraGlows = passiveAuraGlows(
      this.match.towers(),
      LOCAL_PLAYER,
      t && !p ? t.id : null,
      (x) => auraSpecOf(this.match.ctx, x)?.area ?? null,
      (area) => auraRadiusOf(rules, area),
    );
    this.selectionLayer.draw(
      {
        auras: this.auraGlows,
        selected:
          t && stats && !p
            ? {
                tx: t.tx,
                ty: t.ty,
                range: stats.range,
                detectRange: stats.detect === 'aura' ? stats.detectRange : 0,
                auraRadius: aura ? auraRadiusOf(rules, aura.area) : 0,
              }
            : null,
        buffed,
        sameKind: t && !p ? sameKindTowers(this.match.world, t.tower, t.owner).map((x) => ({ tx: x.tx, ty: x.ty })) : [],
        drop: p && p.drop && stats ? { ...p.drop, range: stats.range } : null,
      },
      timeMs,
    );
    this.refreshPanel();
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
    const sizes = new Map<string, string>(enemies.mobs.map((m) => [m.id, m.size]));
    for (const b of enemies.bosses) sizes.set(b.id, '보스');
    const eliteScale = enemies.eliteChance.scale;
    this.mobLayer = new MobLayer(
      this,
      this.layout,
      this.match.map.path,
      // 혼돈의 용(군주 직속)은 군주 보라
      { legionColor: (legion) => hexToInt(legions[legion]?.color ?? '#9B4DFF') },
      (id) => sizes.get(id) ?? '소형',
      (m) => mobScaleMul(m, eliteScale),
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
    this.puddleLayer = new PuddleLayer(this, this.layout);
    this.soldierLayer = new SoldierLayer(this, this.layout, this.match.map.path);
    this.floatingText = new FloatingTextLayer(this, this.layout.tile);
    this.fx = new FxLayer(this, this.layout);
    this.selectionLayer = new SelectionLayer(this, this.layout);
    this.updateToastTop();
  }

  private handleEvents(time: number): void {
    // 한 프레임에 단계가 여러 번 바뀌면(빨리 감기·높은 배속) 마지막 단계 알림 하나만
    let lastStage: { stage: number; boss: boolean } | null = null;
    /** 이번 프레임에 보스 등장 배너를 띄웠다 → 'N단계 보스 단계!' 알림은 생략 (배너가 단계까지 보여 준다) */
    let bossArrived = false;
    let defeated = false;
    const now = this.match.tick;
    const frameStart = this.frameStartTick;
    const cost = summonCost(this.match.ctx);
    let texts = 0;
    let heals = 0;
    let sparks = 0;
    let areaFx = 0;
    let meteors = 0;
    /** 이번 프레임에 운석을 떨어뜨린 '타워:틱' (그 틱의 그 타워 피해 자리마다 불덩이) */
    const meteorKeys = new Set<string>();
    for (const ev of this.match.world.drainEvents()) {
      const recent = eventFxVisible('bulk', ev.tick, now, frameStart);
      switch (ev.type) {
        case 'stageStart':
          lastStage = { stage: Number(ev.stage), boss: ev.boss === true };
          break;
        case 'defeat':
          defeated = true;
          break;
        case 'summon':
          if (ev.god === true && eventFxVisible('rare', ev.tick, now, frameStart)) {
            this.ctx.ui.toast(godDescends(this.ctx.data.towers.towers.find((t) => t.id === ev.tower)?.name ?? String(ev.tower)), 2400);
          }
          if (!eventFxVisible('action', ev.tick, now, frameStart)) break;
          this.towerLayer.noteSummoned(Number(ev.id));
          this.fx.summonPillar(Number(ev.x), Number(ev.y), hexToInt(GRADE_COLORS[(ev.grade as Grade) || 'normal'] ?? GRADE_COLORS.normal));
          this.summonFxCount++;
          if (ev.rare === true && ev.player === LOCAL_PLAYER) {
            this.ctx.ui.toast(FORTUNA_RARE);
            this.noteFx('fortuna');
          }
          if (ev.lucky === true && ev.player === LOCAL_PLAYER) this.ctx.ui.toast(LUCKY_SUMMON);
          if (ev.twin === true) this.noteFx('twin');
          break;
        case 'summonFail': {
          if (!eventFxVisible('action', ev.tick, now, frameStart) || ev.player !== 0) break;
          const text = summonFailText(String(ev.reason), cost);
          if (text) this.ctx.ui.toast(text);
          if (ev.reason === 'gold') this.fx.shakeTile(Number(ev.x), Number(ev.y));
          break;
        }
        case 'attack':
          if (recent) this.towerLayer.attack(Number(ev.tower), Number(ev.x), Number(ev.y), time);
          break;
        case 'merge': {
          if (ev.player !== LOCAL_PLAYER) break;
          // 고른 타워가 승급되면 패널이 결과 타워를 따라간다
          if (this.selectedId === Number(ev.from)) this.selectedId = Number(ev.id);
          if (ev.god === true && eventFxVisible('rare', ev.tick, now, frameStart)) {
            this.ctx.ui.toast(godDescends(this.ctx.data.towers.towers.find((t) => t.id === ev.tower)?.name ?? String(ev.tower)), 2400);
          }
          if (!eventFxVisible('action', ev.tick, now, frameStart)) break;
          this.towerLayer.noteSummoned(Number(ev.id));
          const from = String(ev.removed)
            .split(';')
            .filter((x) => x !== '')
            .map((xy) => {
              const [a, b] = xy.split(',');
              return { tx: Number(a), ty: Number(b) };
            });
          this.fx.mergeSuck(from, { tx: Number(ev.x), ty: Number(ev.y) }, hexToInt(GRADE_COLORS[(ev.grade as Grade) || 'normal'] ?? GRADE_COLORS.normal));
          this.mergeFxCount++;
          if (ev.grade === 'legend' || ev.grade === 'god') this.cameras.main.shake(260, 0.006);
          if (ev.double === true) {
            this.ctx.ui.toast(FORTUNA_DOUBLE);
            this.noteFx('fortuna');
          }
          break;
        }
        case 'mergeFail': {
          if (ev.player !== LOCAL_PLAYER || !eventFxVisible('action', ev.tick, now, frameStart)) break;
          const text = mergeFailText(String(ev.reason), this.match.rules.mergeCount);
          if (text) this.ctx.ui.toast(text);
          break;
        }
        case 'move':
        case 'moveFail':
          if (this.pendingDrop && (Number(ev.id) === this.pendingDrop.id || ev.type === 'moveFail')) {
            this.towerLayer.setDrag(this.pendingDrop.id, null, this.time.now);
            this.pendingDrop = null;
          }
          break;
        case 'blast':
          if (!recent || areaFx >= MAX_AREA_FX_PER_FRAME) break;
          areaFx++;
          this.fx.blastRing(Number(ev.x), Number(ev.y), Number(ev.r), this.areaColor(Number(ev.tower)));
          break;
        case 'chain':
          if (!recent || areaFx >= MAX_AREA_FX_PER_FRAME) break;
          areaFx++;
          this.fx.chainBolt(Number(ev.x1), Number(ev.y1), Number(ev.x2), Number(ev.y2));
          break;
        case 'hit': {
          if (!recent) break;
          // 운석 피해에만 불덩이 (같은 틱에 착탄한 그 대마법사의 일반 투사체 피해에는 붙이지 않는다 — fx 표시로 고름)
          if (ev.fx === METEOR_FX && meteors < MAX_METEOR_FX && meteorKeys.has(`${ev.source}:${ev.tick}`)) {
            meteors++;
            this.fx.meteor(Number(ev.x), Number(ev.y));
          }
          // 지속 피해(화상·독·출혈)는 깜빡이지 않고 숫자만 (0.5초마다라 몹이 늘 하얗게 보이지 않게)
          if (ev.dot !== true) this.mobLayer.flash(Number(ev.target), time);
          const color = damageColor(Number(ev.p), Number(ev.m), Number(ev.t));
          const crit = ev.crit === true;
          if (texts < MAX_DAMAGE_TEXTS_PER_FRAME || crit) {
            const px = unitsToPx(this.layout, Number(ev.x), Number(ev.y));
            const jitter = (Math.random() - 0.5) * this.layout.tile * 0.3;
            // 같은 자리에 몰리면 위로 쌓고, 쌓을 자리가 없으면 띄우지 않는다 (겹쳐서 다른 숫자처럼 읽히지 않게). 치명타는 크게 + '!'
            const label = crit ? `${ev.damage}!` : String(ev.damage);
            if (this.floatingText.spawn(px.x + jitter, px.y - this.layout.tile * 0.42, label, color, time, crit)) texts++;
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
          // 보상 없는 조각(작은 슬라임)·보스 조각은 '+0원'을 띄우지 않는다 (보스 보상은 bossKill 사건)
          if (!(reward > 0)) break;
          const px = unitsToPx(this.layout, Number(ev.x), Number(ev.y));
          this.floatingText.spawn(px.x, px.y - this.layout.tile * 0.15, `+${reward}원`, DAMAGE_COLORS.gold, time, true);
          this.fx.coin(Number(ev.x), Number(ev.y), time, () => this.hud.gainGold(reward));
          break;
        }
        case 'miss':
          if (recent) this.fx.missPuff(Number(ev.x), Number(ev.y));
          break;
        case 'abilityGold': {
          // 특색 돈 (광부·상인·연금술사): 타워 위 '+n원' + 동전이 HUD로
          if (!recent) break;
          const amount = Number(ev.amount);
          const px = unitsToPx(this.layout, Number(ev.x), Number(ev.y));
          this.floatingText.spawn(px.x, px.y - this.layout.tile * 0.55, `+${amount}원`, DAMAGE_COLORS.gold, time, true);
          this.fx.coin(Number(ev.x), Number(ev.y), time, () => this.hud.gainGold(amount));
          this.noteFx('gold');
          break;
        }
        case 'dice':
          if (!recent) break;
          this.fx.dicePop(Number(ev.x), Number(ev.y), Number(ev.value));
          this.noteFx('dice');
          break;
        case 'execute': {
          if (!recent) break;
          const px = unitsToPx(this.layout, Number(ev.x), Number(ev.y));
          this.floatingText.spawn(px.x, px.y - this.layout.tile * 0.6, EXECUTE_LABEL, DAMAGE_COLORS.execute, time, true);
          this.noteFx('execute');
          break;
        }
        case 'puddle':
          if (!eventFxVisible('action', ev.tick, now, frameStart)) break;
          this.fx.splash(Number(ev.x), Number(ev.y), Number(ev.r));
          this.noteFx('puddle');
          break;
        case 'meteor':
          if (!eventFxVisible('action', ev.tick, now, frameStart)) break;
          meteorKeys.add(`${ev.tower}:${ev.tick}`);
          this.noteFx('meteor');
          break;
        case 'timeStop':
          if (!eventFxVisible('action', ev.tick, now, frameStart)) break;
          this.fx.timeStop(Number(ev.x), Number(ev.y));
          this.noteFx('timeStop');
          break;
        // ---- M4 ----
        case 'hire':
          if (ev.player === LOCAL_PLAYER) this.noteFx('hire');
          break;
        case 'hireFail': {
          if (ev.player !== LOCAL_PLAYER || !eventFxVisible('action', ev.tick, now, frameStart)) break;
          const text = hireFailText(String(ev.reason), this.match.rules.workerCost, this.match.state.gold, this.match.rules.workerMax);
          if (text) this.ctx.ui.toast(text);
          break;
        }
        case 'workerIncome':
          // 일꾼 수입은 5초마다 돈 글자 옆에 작게 (UI.md 4.2)
          if (eventFxVisible('action', ev.tick, now, frameStart)) this.hud.gainGold(Number(ev.amount));
          this.noteFx('workerIncome');
          break;
        case 'bossSpawn': {
          if (!eventFxVisible('rare', ev.tick, now, frameStart)) break;
          const b = this.match.rules.bosses.get(String(ev.boss));
          if (b) {
            const { mode, theme } = this.match.state;
            const label = formatStage({ mode, theme, stage: Number(ev.stage ?? this.match.state.stage) });
            this.ctx.ui.banner(bossArrivalText(label, bossTag(this.legionNames[b.legion] ?? b.legion, b.rank), b.name), null, 2600, 'boss');
            bossArrived = true;
          }
          this.cameras.main.shake(220, 0.004);
          this.noteFx('bossSpawn');
          break;
        }
        case 'bossKill': {
          if (!eventFxVisible('rare', ev.tick, now, frameStart)) break;
          const b = this.match.rules.bosses.get(String(ev.boss));
          const reward = Number(ev.reward);
          this.ctx.ui.banner(bossKillText(b?.name ?? String(ev.boss), reward), null, 2200, 'gold');
          this.fx.coin(Number(ev.x), Number(ev.y), time, () => this.hud.gainGold(reward));
          this.noteFx('bossKill');
          break;
        }
        case 'bossStun':
          if (eventFxVisible('action', ev.tick, now, frameStart)) this.cameras.main.shake(160, 0.003);
          this.noteFx('bossStun');
          break;
        case 'bossSplit':
        case 'split':
          if (recent && ev.type === 'split') this.fx.missPuff(Number(ev.x), Number(ev.y));
          this.noteFx(ev.type);
          break;
        case 'bossFly':
        case 'bossGuard':
        case 'bossEnrage':
        case 'bossSummon':
          this.noteFx(ev.type);
          break;
        case 'formationPreview': {
          if (!eventFxVisible('rare', ev.tick, now, frameStart)) break;
          const f = formationById(this.match.rules, String(ev.id));
          if (f) this.ctx.ui.banner(formationBanner(f.name, f.banner), `💡 ${f.hint}`, 4200, 'warn');
          this.noteFx('formationPreview');
          break;
        }
        case 'invisibleWarn':
          if (eventFxVisible('rare', ev.tick, now, frameStart)) this.ctx.ui.banner(INVISIBLE_WARN, invisibleTip(this.detectNames()), 3600, 'shadow');
          this.noteFx('invisibleWarn');
          break;
        case 'cardPick': {
          if (ev.player !== LOCAL_PLAYER) break;
          const c = this.match.rules.cardById.get(String(ev.card));
          if (c) this.ctx.ui.toast(cardPickedText(c.name));
          this.noteFx('cardPick');
          break;
        }
        case 'quake':
          if (eventFxVisible('action', ev.tick, now, frameStart)) this.cameras.main.shake(420, 0.01);
          break;
        case 'heal': {
          if (!recent || heals >= MAX_DAMAGE_TEXTS_PER_FRAME) break;
          heals++;
          const px = unitsToPx(this.layout, Number(ev.x), Number(ev.y));
          this.floatingText.spawn(px.x, px.y - this.layout.tile * 0.42, `+${ev.amount}`, DAMAGE_COLORS.heal, time);
          this.noteFx('heal');
          break;
        }
        case 'evade': {
          if (!recent) break;
          const px = unitsToPx(this.layout, Number(ev.x), Number(ev.y));
          this.floatingText.spawn(px.x, px.y - this.layout.tile * 0.42, EVADE_LABEL, DAMAGE_COLORS.evade, time);
          this.noteFx('evade');
          break;
        }
      }
    }
    if (lastStage && !(lastStage.boss && bossArrived)) {
      const { mode, theme } = this.match.state;
      this.ctx.ui.toast(stageToastText({ mode, theme, stage: lastStage.stage, bossStage: lastStage.boss }));
    }
    this.checkMergeReady();
    if (defeated) this.showGameOver();
  }

  /**
   * 승급 가능한 묶음 수를 세고, 새로 승급할 수 있게 된 종류는 알림 (판당 처음 3번, UI.md 8장).
   * 한 프레임에 여러 종류가 한꺼번에 승급 가능해지면 알림 하나로 합친다 (알림이 쌓여 맵 위쪽 줄을 가리지 않게).
   */
  private checkMergeReady(): void {
    const groups = mergeableGroups(this.match.ctx, this.match.world, LOCAL_PLAYER);
    this.mergeReadyCount = groups.length;
    const now = new Set(groups.map((g) => g.tower));
    const fresh = groups.filter((g) => !this.mergeReadyKinds.has(g.tower));
    this.mergeReadyKinds = now;
    if (fresh.length === 0 || this.mergeReadyToasts >= MERGE_READY_TOASTS_PER_MATCH) return;
    this.mergeReadyToasts++;
    this.ctx.ui.toast(mergeReadyToast(fresh.map((g) => this.towerNames.get(g.tower) ?? g.tower)));
  }

  /** 광역 폭발 색: 쏜 타워의 피해 종류 (물리 주황 · 마법 하늘 · 고정 노랑). 타워가 없으면 주황. */
  private areaColor(towerEntityId: number): number {
    const t = this.match.world.entities.get(towerEntityId);
    const type = t && t.kind === 'tower' ? this.match.rules.towers.get(String(t.tower))?.damageType : undefined;
    return type === 'magic' || type === 'hybrid' ? 0x8fd3ff : type === 'true' ? 0xffe066 : 0xffa94d;
  }

  private showGameOver(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.cancelPress(this.time.now);
    this.closePanel();
    this.closeChoice();
    // 알림 층은 패배 화면보다 위라, 남아 있는 배너·알림이 '패배' 제목을 가렸다 (검토 반영)
    this.ctx.ui.clearToasts();
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
    this.cancelPress(this.time.now);
    this.resumeSpeed = this.clock.speed;
    this.clock.speed = 0;
    this.ctx.ui.clearToasts();
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

  /** 일꾼 고용 버튼: 미리 검사해 안 되면 바로 알림, 되면 명령 (sim이 실행 틱에 다시 검사). */
  private hire(): void {
    if (this.paused || this.gameOver) return;
    const fail = hireCheck(this.match.ctx);
    if (fail) {
      const text = hireFailText(fail, this.match.rules.workerCost, this.match.state.gold, this.match.rules.workerMax);
      if (text) this.ctx.ui.toast(text);
      return;
    }
    this.match.world.enqueue({ type: 'hireWorker' });
  }

  /**
   * 고르기 창 맞추기 (매 프레임): 내 보스 카드 묶음이 있으면 카드 창, 없으면 승급의 축복 선택 창, 둘 다 없으면 닫는다.
   * 같은 선택이면 그대로 둔다 (고른 뒤 명령이 실행될 때까지 잠긴 채).
   */
  private syncChoice(): void {
    if (this.gameOver) return;
    const offer = currentOffer(this.match.ctx, LOCAL_PLAYER);
    let model = offer ? cardChoiceModel(this.match.rules, offer) : null;
    let onPick: ((i: number) => void) | null = offer ? (i) => this.match.world.enqueue({ type: 'pickCard', i }) : null;
    if (!model) {
      const pick = this.match.state.mergePicks.find((m) => m.player === LOCAL_PLAYER);
      const t = pick ? this.match.world.entities.get(pick.id) : undefined;
      if (pick && t && t.kind === 'tower') {
        model = mergeChoiceModel(this.match.rules, pick, String(t.tower));
        onPick = (i) => this.match.world.enqueue({ type: 'pickMerge', id: pick.id, pick: i });
      }
    }
    if (!model || !onPick) {
      this.closeChoice();
      return;
    }
    if (this.choice?.key === model.key) return;
    this.closeChoice();
    // 바텀 시트는 하나만: 고르기 창을 열 때 타워 정보 패널을 닫는다 (승급의 축복을 패널 [승급]으로 쓰면 두 시트가 겹치고
    // 창 아래로 패널의 승급 버튼이 눌리던 것, 검토 반영). 알약으로 다시 펼칠 때도 닫는다
    this.closePanel();
    this.choice = createChoicePanel(model, onPick, { pillHost: this.hud.choiceSlot, onExpand: () => this.closePanel() });
    this.ctx.ui.show('modal', this.choice);
  }

  /** 로컬 플레이어 덱의 감지 타워 이름 (투명 몹 경고 둘째 줄). */
  private detectNames(): string[] {
    const deck = this.match.ctx.decks[LOCAL_PLAYER] ?? this.match.rules.baseDeck;
    return deckDetectNames(deck, this.ctx.data.towers.towers);
  }

  private closeChoice(): void {
    if (!this.choice) return;
    this.choice = null;
    this.ctx.ui.clear('modal');
  }

  /** E2E: 지금 고르기 창 종류 ('card' · 'merge' · null) */
  get choiceKind(): string | null {
    return this.choice ? this.choice.key.split(':')[0] ?? null : null;
  }

  /** E2E: 드러난 투명 몹 보라 외곽선 수 · 기절 표시 타워 수 */
  get revealedOutlineCount(): number {
    return this.mobLayer.revealedOutlineCount;
  }

  get stunnedTowerCount(): number {
    return this.towerLayer.stunnedCount;
  }

  /** E2E: 고르기 창이 알약으로 접혀 있는가 (창이 없으면 null) · 타워 정보 패널이 열려 있는가 */
  get choiceCollapsed(): boolean | null {
    return this.choice ? this.choice.collapsed : null;
  }

  get panelOpen(): boolean {
    return this.panel !== null;
  }

  /** E2E: 그 타워 엔티티를 지금 어떤 타워 종류 그림으로 그리고 있나 (sim 타워 종류와 비교) */
  drawnTowerType(id: number): string | null {
    return this.towerLayer.towerTypeOf(id);
  }

  /** E2E: 그 몹 그림의 크기 배율 (statusModel.mobScaleMul과 비교) */
  drawnMobScale(id: number): number | null {
    return this.mobLayer.scaleMulOf(id);
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
          towerCount: towerCount(this.match.world),
          buildableCount: this.match.map.buildable.length,
          summonCost: summonCost(this.match.ctx),
          mergeReady: this.mergeReadyCount,
          workerMax: this.match.rules.workerMax,
          workerCost: this.match.rules.workerCost,
          boss: bossHudInput(this.match.rules, this.legionNames, this.match.state, this.match.mobs(), this.match.tick),
        },
        this.ctx.data.game.hud,
      ),
    );
  }
}
