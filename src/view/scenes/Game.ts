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
 *   승급 직후 0.3초는 입력을 받지 않는다 (UI.md 9장). 승급 버튼은 맵 오른쪽 위 [⏫ 모두 승급] 하나 (피드백 #65, 꾹 누르면 계속).
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
 * - M5: 하단 메뉴 [⚔ 도전] [⬆ 강화] [📋 미션] → 바텀 시트(sheet 층, 55% / 끌어서 85%, 게임은 계속 진행, 맵을 누르면 닫힘).
 *   도전 [시작] → startChallenge, 강화 [비용] → upgrade (길게 누르면 연속), 도박 테이블 → gamble (슬롯 1초 연출 뒤 결과),
 *   미션 [받기]·[모두 받기] → claimMission·claimAllMissions. 메뉴 배지 '1 가능'·'Lv 5'·'2 받기', 도전 보스 막대(보스 막대 자리),
 *   (예전 [⬆ 승급 가능 n]·패널 [다음 묶음 ▶]·금색 강조 고리는 피드백 #65에서 없앴다 — 승급은 [⏫ 모두 승급])
 *   바텀 시트는 하나만: 시트를 열면 정보 패널을 닫고 고르기 창을 접는다, 타워 패널·고르기 창을 펼치면 시트를 닫는다.
 *   히든 미션을 달성하면 계정 저장소에 영구 기록한다 (다음 판부터 이름이 보임).
 * - HF-2: 전투 배경 그림(테마 × 하늘 밴드, BattleBackground — 없으면 절차 풀밭), 단계 보스 등장 컷인(DOM cutin 층, 연출 끄기면 건너뜀),
 *   정보 패널 [ℹ] → 캐릭터 카드(DOM card 층), 캐릭터별 화면 크기(looks scale — TowerSprite·MobSprite).
 * - 무한 모드: 순환의 정원 / 캠페인(debug): 테마 1 사거리 미로.
 * - T-2: 승급할 수 있는 타워를 누르면 바로 승급(설정 '눌러서 바로 승급', 일시정지 메뉴), 빈 땅·[🎲 소환]을 꾹 누르면 자동 칸에 연속 소환,
 *   도박 테이블별 동시·꾹 눌러 연속, 패널 [↔ 이동]·[💰 판매]·[🛠 변환(개발자)], 하단 메뉴 [🛠 개발](연출 끄기·확률 조정·히든 조합·히든 미션).
 *   연출 끄기(src/view/effects.ts)면 피해 숫자·동전·입자·흔들림·반짝임·특색 효과·대기 동작·몹 흔들림을 그리지 않는다.
 * - ⏸ 또는 앱이 백그라운드로 가면 일시정지 메뉴(UI.md 4.6). 열려 있는 동안 TickClock 배속 0 = 게임 시간 정지.
 * - 패배하면 시간을 멈추고 패배 화면 ([다시 하기] / [타이틀로]).
 * - 맵 배치: DOM HUD(2줄 + 보스 막대 자리)의 실제 높이를 재서 그 아래에 맵을 놓는다 → HUD가 맵 칸을 가리지 않는다.
 *   버튼 최소 44px 때문에 좁은·가로 화면일수록 HUD가 기준 px로 커지므로, 화면 크기가 바뀌면(ResizeObserver) 다시 배치한다.
 */
import Phaser from 'phaser';
import { GRADE_COLORS, hexToInt } from '../../art/palette';
import type { Grade } from '../../data/load';
import { TICK_HZ, TickClock, type SimEvent } from '../../sim/World';
import { bossForStage } from '../../sim/systems/BossSchedule';
import { TickCostMeter, capTicks, simBudgetMs } from '../tickBudget';
import type { Projectile } from '../../sim/entities/Projectile';
import { towerAt, towersAt, type Tower } from '../../sim/entities/Tower';
import { canMergeGrade, mergeOutcomes } from '../../sim/Deck';
import { createMatch, type Match } from '../../sim/match';
import type { SavedMatch } from '../../save/MatchSaves';
import { NATIVE_PAUSE_EVENT, setBackHandler } from '../../ui/nativeBack';
import { isBuildable } from '../../sim/map';
import type { MatchMode } from '../../sim/state';
import { NO_MODS, effectiveStats, towerRange } from '../../sim/stats';
import { autoMergeStacks, fullStacks, mergeableStackGroups, sameKindTowers, stackMergeCheck, type MergeGroup } from '../../sim/systems/Merge';
import { hasRoom, summonStackCheck } from '../../sim/systems/Board';
import { isPaused, moveCheck } from '../../sim/systems/Move';
import { auraCovers, auraRadiusOf, auraSpecOf, computeAuras, towerBonus } from '../../sim/systems/Aura';
import { towerLevel } from '../../sim/abilities';
import { METEOR_FX } from '../../sim/abilities/archmage';
import { rankSummonTiles, summonCheck, summonCost } from '../../sim/systems/Summon';
import { autoSellTiles, convertTargets, isAutoSellSummon, sellCheck, sellPriceFor } from '../../sim/systems/Sell';
import { AUTO_MERGE_KEYS, autoMergeChoice, autoMergeRank, autoSellGrade, autoSellMinRank, resetMatchSettings, type AutoMergeGrade } from '../../meta/settings';
import { gradeRank } from '../../sim/rules';
import { effectsOff, onEffectsChange, setEffectsOff } from '../effects';
import { autoSummonInterval } from '../../ui/hold';
import { createDevSheet, type DevSheetView } from '../../ui/sheets/DevSheet';
import { devChanceModel, hiddenRecipeRows, nextChanceBp, type DevTab } from '../../ui/sheets/devModels';
import { createConvertPicker } from '../../ui/panels/ConvertPicker';
import { GRADE_NAMES, sellNeedsConfirm, shortFactionName } from '../../ui/panels/towerPanelModel';
import {
  GUIDE_FIRST_MERGE,
  mergeGuideText,
  mergePreview,
  mergeResultText,
  newRunLog,
  pairBadges,
  readyButtonState,
  recordRunEvent,
  runLogRows,
  showRecommended,
  type MergeGuideStep,
  type ReadyState,
  type RunLog,
  guideCardSide,
} from '../../ui/guide/guideModel';
import { createGuideCard, type GuideCardView } from '../../ui/guide/GuideCard';
import { pastRuns, pushPastRun } from '../../ui/guide/runHistory';
import { GuideLayer } from '../render/GuideLayer';
import { goldWithBonus, hireCheck } from '../../sim/systems/Economy';
import { formationById } from '../../sim/systems/Formation';
import { currentOffer } from '../../sim/systems/Cards';
import { upgradeCheck, upgradeCost, upgradeLevel } from '../../sim/systems/Upgrade';
import { gambleCheck } from '../../sim/systems/Gamble';
import { challengeCheck } from '../../sim/systems/Challenge';
import { claimCheck, missionsClaimable } from '../../sim/systems/Mission';
import { ensureMobTexture } from '../../art/mobs';
import { enemyCharacterTexture } from '../../art/characters/phaserArt';
import { createChallengeSheet, type ChallengeSheetView } from '../../ui/sheets/ChallengeSheet';
import { createGambleSheet, createUpgradeSheet, type GambleFire, type GambleSheetView, type GambleSlotView, type GambleTab, type UpgradeSheetView } from '../../ui/sheets/UpgradeSheet';
import { createSummonSheet, type SummonSheetView } from '../../ui/sheets/SummonSheet';
import { createMythicSheet, type MythicSheetView } from '../../ui/sheets/MythicSheet';
import { codexSheetModel, newlyDiscovered, summonSheetModel, GACHA_GRADE_NAMES, type CodexSheetModel, type SummonSheetModel } from '../../ui/sheets/g1Models';
import { gachaCheck } from '../../sim/systems/Gacha';
import { craftPlan, ownedCounts } from '../../sim/systems/Craft';
import { readyUlts, ultCheck, ultKindOf } from '../../sim/systems/Ultimate';
import { pityLeft, unitCap, unitCount } from '../../sim/systems/Board';
import { createMissionSheet, type MissionSheetView } from '../../ui/sheets/MissionSheet';
import {
  challengeHudInput,
  challengeSheetModel,
  gambleSheetModel,
  menuBadges,
  missionSheetModel,
  missionTabLabels,
  mulText,
  upgradeSheetModel,
  type MissionTab,
  type SheetKind,
  type UpgradeTab,
} from '../../ui/sheets/sheetModels';
import { SLOT_SPIN_MS, slotFrame, type SlotState } from '../../ui/sheets/slot';
import {
  BOARD_FULL,
  EVADE_LABEL,
  EXECUTE_LABEL,
  FORTUNA_DOUBLE,
  FORTUNA_RARE,
  INVISIBLE_WARN,
  LUCKY_SUMMON,
  bossArrivalText,
  bossCounterTip,
  bossKillText,
  bossPreviewText,
  bossTag,
  cardPickedText,
  formationBanner,
  godDescends,
  hireFailText,
  stageInterestText,
  invisibleTip,
  mergeFailText,
  mergeReadyToast,
  challengeClearText,
  challengeFailText,
  challengeReadyText,
  challengeStartFailText,
  challengeStartText,
  gambleFailText,
  gambleJackpotText,
  gambleResultText,
  hiddenMissionText,
  missionClaimText,
  missionDoneText,
  upgradeFailText,
  MOVE_CANCELED,
  MOVE_PICK_HINT,
  convertText,
  needGoldForSummon,
  sellText,
  chainMergeText,
  mergeAllButton,
  mergeAllText,
  craftFailText,
  craftReadyText,
  craftText,
  gachaFailText,
  gachaResultText,
  ultText,
  SUMMON_NO_FIT,
  UNIT_CAP_FULL,
  MERGE_PICK_FULL,
} from '../../ui/messages';
import { createChoicePanel, type ChoicePanelView } from '../../ui/panels/ChoicePanel';
import { cardChoiceModel, mergeChoiceModel } from '../../ui/panels/choiceModel';
import { createTowerPanel, type TowerPanelView } from '../../ui/panels/TowerPanel';
import { buildTowerPanelModel, type TowerPanelModel } from '../../ui/panels/towerPanelModel';
import { createTowerQuick, type TowerQuickView } from '../../ui/panels/TowerQuick';
import { quickModel, quickPlacement } from '../../ui/panels/towerQuickModel';
import { createCharacterCard } from '../../ui/panels/CharacterCard';
import { characterCardModel } from '../../ui/panels/characterCardModel';
import { createHud, type HudView } from '../../ui/hud/Hud';
import { bossHudInput, buildHudModel, deckDetectNames, gameEndText, formatStage, legionNameMap, stageToastText, type DefeatBossInfo } from '../../ui/hud/hudModel';
import { availableSpeeds, nextSpeed } from '../../ui/hud/speed';
import { createGameOverScreen } from '../../ui/screens/GameOverScreen';
import { matchResultOf } from '../../meta/matchResult';
import { settlementView } from '../../ui/lobby/lobbyModel';
import { createPauseMenu } from '../../ui/screens/PauseMenu';
import { createGradeGuideDialog } from '../../ui/screens/GradeGuideDialog';
import { gradeGuideModel } from '../../ui/screens/gradeGuideModel';
import { createSceneFeedback, matchFeedbackSnapshot } from '../feedbackInfo';
import { SCENE_BOOT, SCENE_GAME } from '../config';
import type { GameContext } from '../context';
import {
  LONG_PRESS_MS,
  MERGE_INPUT_LOCK_MS,
  PRESS_SLOP_TILES,
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
import { DAMAGE_COLORS, damageColor, eventFxVisible, fxBudget, prioritizeDamage } from '../render/fxModel';
import { FOOT_OFFSET_TILES, towerFigureSpanTiles } from '../render/towerGeom';
import { PuddleLayer, SoldierLayer } from '../render/AbilitySprites';
import { BattleBackground } from '../render/BattleBackground';
import { BossCutinPlayer, bossCutinId, cutinPath } from '../../ui/cutin/BossCutin';
import { setSideBackground } from '../../ui/stage';
import { assetUrl } from '../../assets';
import { backgroundBand, upcomingBand } from '../artBand';
import { passiveAuraGlows, type AuraGlow } from '../render/abilityModel';
import { buildHintAlpha } from '../render/buildHint';
import { mobLookView, mobScaleMul, mobStatusView } from '../render/statusModel';
/** HUD 띠 아래 끝과 알림 사이 간격 (무대 너비 비율, 2cqw) */
const TOAST_GAP_OF_WIDTH = 0.02;
/** 한 프레임에 띄우는 회복 숫자 최대 수 (피해 숫자·불꽃·광역 연출·동전 한도는 배속별 fxBudget) */
const MAX_HEAL_TEXTS_PER_FRAME = 16;
/** 운석 한 번에 떨어뜨리는 불덩이 최대 수 */
const MAX_METEOR_FX = 8;
/** '{타워} 승급 가능!' 알림은 판당 처음 몇 번만 (UI.md 8장) */
const MERGE_READY_TOASTS_PER_MATCH = 3;
/** 보스 예고 배너 (F10-2) 보이는 시간 — 대응 한 줄을 읽을 만큼 (편대 예고 4.2초보다 조금 길게) */
const BOSS_PREVIEW_MS = 5200;
/** 끌어 놓은 뒤 이동 명령이 실행될 때까지 그 자리에 붙잡아 두는 최대 시간 (ms) */
const DROP_HOLD_MS = 400;
/** 로컬 플레이어 (2인 판은 M13) */
const LOCAL_PLAYER = 0;
/** 연출 끄기 때 도박 꾹 누르기 간격 (ms) — 릴 없이 결과만 (T-2) */
const GAMBLE_FAST_MS = 150;
/** 이동 모드 안내 알림 시간 (ms) */
const MOVE_HINT_MS = 3000;
/** '빛나는 칸을 눌러 소환해요' 안내의 최대 시간 (ms). 보통은 첫 소환·1단계 시작·장면 종료에 먼저 지운다 */
const START_HINT_MAX_MS = 90_000;

/** 빈 땅을 누르고 있는 중 (T-2: 0.3초 지나면 자동 칸에 연속 소환). */
interface GroundPress {
  pointer: Phaser.Input.Pointer;
  downMs: number;
  downX: number;
  downY: number;
  /** 연속 소환이 시작됐는가 (그 뒤로는 손가락이 움직여도 계속) */
  auto: boolean;
  /** 마지막으로 소환을 시도한 시각 */
  lastMs: number;
  /** 배치 칸이 아닌 곳(길·빈 땅)을 눌렀는가 — 짧게 떼면 배치 칸을 잠깐 보여준다 (T-3) */
  hint: boolean;
}

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
  /** 이어 하기 (A-1): 되살린 판 (있으면 seed·mode·theme 대신 이 판) */
  saved?: SavedMatch;
}

/** 자동 저장 간격 (틱, 게임 시간 5초) · 명령이 있었을 때 최소 간격 (1초) — A-1 */
const AUTOSAVE_TICKS = 5 * TICK_HZ;
const AUTOSAVE_AFTER_COMMAND_TICKS = TICK_HZ;
/** 주기·명령 저장 사이 최소 실제 시간 (ms, A-1b 검토: ×16에서도 저장이 초당 여러 번 돌지 않게). 단계 바뀜·일시정지·페이지 숨김·장면 종료는 바로 저장 */
const AUTOSAVE_MIN_REAL_MS = 2500;

/** 자동 저장이 기기 저장소에 안 써질 때 알림 (A-1b, 판마다 한 번) */
const SAVE_FAILED = '저장 실패 — 저장 공간을 확인해 주세요';

/** 판 식별자 (전투 기록용, 화면에서만 만든다) */
function newRunId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') return Array.from(c.getRandomValues(new Uint32Array(3)), (n) => n.toString(36)).join('-');
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** 무작위 시드 (화면 쪽에서만 만든다. sim 안에서는 Math.random 금지). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296);
}

export class GameScene extends Phaser.Scene {
  /** 지금 판 (E2E·디버그가 읽을 수 있게 공개, 화면은 읽기만) */
  match!: Match;
  private clock!: TickClock;
  /** 틱 하나의 평균 비용 → 한 프레임 틱 상한 (T-1: ×16에서 느린 기기가 멈추지 않게, 화면 전용) */
  private readonly tickMeter = new TickCostMeter();
  private hud!: HudView;
  private layout!: MapLayout;
  private mapArea!: Rect;
  private mapRenderer: MapRenderer | null = null;
  /** 전투 배경 그림 (HF-2, 테마 × 하늘 밴드). 그림이 없으면 맵 렌더러의 절차 풀밭 */
  private background: BattleBackground | null = null;
  /** 보스 컷인 (HF-2, DOM cutin 층) */
  private cutin: BossCutinPlayer | null = null;
  /** 컷인 그림 미리 받기 (브라우저 캐시에 올려 둔다) */
  private cutinPreload: HTMLImageElement[] = [];
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
  private sceneData: Required<Omit<GameSceneData, 'saved'>> = { seed: 0, mode: 'infinite', theme: 1 };
  /** 판 식별자 · 마지막 저장 토큰 · 마지막 저장 시점 (A-1 자동 저장) */
  private runId = '';
  private saveToken: string | null = null;
  private lastSave = { tick: -1, stage: -1, commands: -1, ms: -Infinity };
  /** 저장 실패 알림을 이 판에서 이미 띄웠다 (A-1b) */
  private saveFailToast = false;
  /** 이 판이 이어 하기로 시작했다 (E2E) */
  private resumed = false;
  private selectionLayer!: SelectionLayer;
  /** 고른 타워 (정보 패널) 엔티티 id */
  private selectedId: number | null = null;
  private panel: TowerPanelView | null = null;
  /** 피드백 #47: 고른 영웅 칸 왼쪽 위 작은 [⬆ 승급] (패널과 함께 열리고 닫힌다 — 판매는 패널 머리 줄 하나뿐) */
  private quick: TowerQuickView | null = null;
  /** 마지막으로 그린 정보 패널 글자 (캐릭터 카드가 같은 값을 쓴다, HF-2) */
  private panelModel: TowerPanelModel | null = null;
  private press: PressState | null = null;
  /** 끌어 놓고 이동 명령을 기다리는 타워 (그 자리에 붙잡아 둔다) */
  private pendingDrop: { id: number; untilMs: number } | null = null;
  /** 승급 직후 맵 입력 잠금 (UI.md 9장) */
  private inputLockUntil: number | null = null;
  /** 승급 가능 알림을 띄운 종류와 횟수 (판당 3번) */
  private mergeReadyKinds = new Set<string>();
  private mergeReadyToasts = 0;
  private mergeReadyCount = 0;
  /** 보스 예고를 띄운 보스 단계 (F10-2, 같은 단계는 한 번) */
  private bossPreviewStage = 0;
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
  // ---- M5 ----
  /** 열린 바텀 시트 (하나만) */
  private sheet: ChallengeSheetView | UpgradeSheetView | MissionSheetView | DevSheetView | GambleSheetView | SummonSheetView | MythicSheetView | null = null;
  /** G-1 [🎰 도박] 시트 탭 */
  private gambleTab: GambleTab = 'money';
  /** G-1 종족 소환에서 고른 종족 번호 (판 동안 기억) */
  private gachaFaction = 0;
  /** G-1 마지막 소환 도박 결과 글자 (소환 시트 맨 아래) */
  private gachaResult = '';
  /** G-1 앞 소환 도박 명령을 넣은 틱 (꾹 누르기가 한 틱에 두 번 넣지 않게) */
  private gachaQueuedTick = -1;
  /** G-1 필살기 자동: 마지막으로 보낸 틱 (같은 타워에 두 번 보내지 않게) */
  private ultSent = new Map<number, number>();
  private sheetKind: SheetKind | null = null;
  /** 시트마다 마지막으로 고른 탭 (다시 열면 그 탭) */
  private upgradeTab: UpgradeTab = 'grade';
  private missionTab: MissionTab = 'normal';
  /** 도박 슬롯 연출 (화면 전용, T-2: 테이블마다 따로) */
  private slots = new Map<number, SlotState>();
  // ---- T-2 ----
  /** 빈 땅 꾹 누르기 (자동 연속 소환) */
  private groundPress: GroundPress | null = null;
  /** 자동 소환 명령을 넣은 틱 (그 명령이 실행되기 전에는 다음을 넣지 않는다 — 같은 칸을 두 번 고르지 않게) */
  private autoSummonTick = -1;
  /** 일꾼 고용 명령을 넣은 틱 (꾹 누르기 중 실행 전 명령을 두 번 넣지 않게, 피드백 #66) */
  private hireQueuedTick = -1;
  /** 자동 승급(피드백 #63) mergeStack 명령을 넣은 틱 (실행되기 전에는 다음을 넣지 않는다 — 같은 무더기를 두 번 보내 승급 실패 알림이 뜨지 않게) */
  private autoMergeQueuedTick = -1;
  /** 패널 [↔ 이동] 모드: 옮길 타워 */
  private moveMode: { id: number; tx: number; ty: number } | null = null;
  /** 판매 확인 (히어로 이상: 이 시각까지 한 번 더 누르면 판매) */
  private sellConfirm: { id: number; untilMs: number } | null = null;
  /** 개발자 변환 고르기 창이 열려 있는가 */
  private convertOpen = false;
  /** 개발자 도구 시트 마지막 탭 · 확률 명령을 넣은 틱 (꾹 누르기가 앞 명령보다 먼저 다음 값을 보내지 않게) */
  private devTab: DevTab = 'fx';
  private chanceQueuedTick = -1;
  /** 마지막 강화 명령을 넣은 틱 (그 명령이 실행되기 전에는 다음을 넣지 않는다 — 길게 누르기가 돈보다 많이 넣지 않게) */
  private upgradeQueuedTick = -1;
  /** 배치 칸을 잠깐 보이기 시작한 때 (T-3 타일 숨김: 판 시작·배치할 수 없는 곳을 누름). 없으면 null */
  private buildHintAt: number | null = null;
  // ---- F10 첫 10단계 개선 ----
  private guideLayer!: GuideLayer;
  /** 첫 승급 안내 (계정마다 한 번): 안내하는 타워 종류·결과 칸 타워·단계 (없으면 null) */
  private guide: { kind: string; anchorId: number; step: MergeGuideStep } | null = null;
  private guideCard: GuideCardView | null = null;
  /** 이 판에서 첫 승급 안내를 끝냈다 (닫거나 승급함) */
  private guideDone = false;
  /** [▶ 준비 완료]를 눌러 readyNow 명령을 보냈다 (실행되면 1단계 → 버튼이 사라짐) */
  private readySent = false;
  /** 개발자 도구 '이번 판 기록' */
  private runLog: RunLog = newRunLog();
  /** 이번 판 기록을 '지난 판'에 남겼는가 (개발자 모드: 패배 때 또는 판을 떠날 때 한 번) */
  private runLogSaved = false;
  /** 정보 패널이 붙은 쪽 (첫 승급 안내 카드는 반대쪽에 — 패널 층이 안내 층보다 위라 카드 버튼을 덮지 않게) */
  private panelSide: 'top' | 'bottom' = 'bottom';
  /** 이 프레임 수가 지나면 '빛나는 칸을 눌러…' 안내 (판 시작 첫 프레임들은 텍스처 굽기로 느려 알림이 보이기 전에 사라졌다) */
  private startHintFrames = 0;
  /** 그 안내 알림 (소환하거나 단계가 바뀌면 바로 지운다 — 다른 알림 아래로 쌓여 알림 자리를 넘지 않게) */
  private startHintEl: HTMLElement | null = null;
  /** 이번 판에 띄운 승급 결과 알림 수 (game.json guide.resultToasts) */
  private resultToastsShown = 0;
  /** 이번 프레임 안내 그림에 쓴 값 (E2E) */
  private guideFrame: { recommended: (readonly [number, number])[]; preview: ReturnType<typeof mergePreview>; badges: number; ready: ReadyState } = {
    recommended: [],
    preview: null,
    badges: 0,
    ready: 'hidden',
  };
  /** 도전 보스 그림 (몹 id → 이미지 주소) · 단계 → 특수 능력 글자 */
  private challengePics = new Map<string, string | null>();
  private challengeAbilities = new Map<number, string>();

  constructor(private readonly ctx: GameContext) {
    super({ key: SCENE_GAME });
  }

  create(data: GameSceneData): void {
    const { game: config } = this.ctx.data;
    const saved = data?.saved ?? null;
    this.sceneData = saved
      ? { seed: saved.match.world.seed, mode: saved.match.state.mode, theme: saved.match.state.theme || 1 }
      : { seed: data?.seed ?? 0, mode: data?.mode ?? 'infinite', theme: data?.theme ?? 1 };
    this.match =
      saved?.match ??
      createMatch(this.ctx.data, {
        seed: this.sceneData.seed,
        mode: this.sceneData.mode,
        theme: this.sceneData.theme,
        maxPlayers: config.maxPlayers,
        debug: this.ctx.debug,
        accountLevels: [this.ctx.accountLevel],
        // G-3 판 밖 성장: 영웅 레벨(→ levels)·잠긴 히든(→ lockedHidden). 판 입력이라 리플레이·저장에 기록된다
        ...this.ctx.progress?.matchOptions(this.ctx.debug),
      });
    this.tickMeter.reset();
    this.speeds = availableSpeeds(config.speeds, this.ctx.accountLevel, this.ctx.debug, config.devSpeeds);
    // 이어 하기면 저장한 배속 (지금 쓸 수 있는 배속이 아니면 ×1)
    const startSpeed = saved && this.speeds.includes(saved.speed) ? saved.speed : 1;
    this.clock = new TickClock({ speed: startSpeed, maxFrameMs: config.maxFrameMs });
    this.resumeSpeed = startSpeed;
    this.runId = saved?.runId ?? newRunId();
    this.saveToken = saved?.token ?? null;
    this.lastSave = { tick: -1, stage: -1, commands: -1, ms: -Infinity };
    this.saveFailToast = false;
    this.resumed = saved !== null;
    if (saved) this.releaseSavedHolds();
    // 피드백 #62: 새 판이면 지난 판의 자동 판매·필살기 자동을 끈다 (이어 하기는 그대로)
    else resetMatchSettings(this.ctx.settings);
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
    this.bossPreviewStage = 0;
    this.mergeReadyCount = 0;
    this.panelPlaceKey = '';
    this.choice = null;
    this.legionNames = legionNameMap(this.ctx.data.enemies.hierarchy);
    this.sheet = null;
    this.sheetKind = null;
    this.slots = new Map();
    // 검토 L8: 다시 하기(scene.restart)는 같은 장면 객체를 쓴다 — 지난 판의 '이 틱에 궁극기 보냄' 기록이 새 판(틱 0부터)에 남지 않게
    this.ultSent = new Map();
    this.upgradeQueuedTick = -1;
    this.groundPress = null;
    this.autoSummonTick = -1;
    this.hireQueuedTick = -1;
    this.autoMergeQueuedTick = -1;
    this.moveMode = null;
    this.sellConfirm = null;
    this.convertOpen = false;
    this.chanceQueuedTick = -1;
    this.buildHintAt = this.time.now;
    this.guide = null;
    this.guideCard = null;
    this.guideDone = false;
    this.readySent = false;
    this.runLog = newRunLog();
    this.runLogSaved = false;
    this.resultToastsShown = 0;
    this.challengeAbilities = new Map(this.ctx.data.enemies.challenges.map((c) => [c.level, c.ability]));
    this.towerNames = new Map(this.ctx.data.towers.towers.map((t) => [t.id, t.name]));

    // HUD를 먼저 띄워 높이를 잰 뒤 그 아래에 맵을 놓는다
    this.hud = createHud({
      onSpeed: () => {
        if (this.paused || this.gameOver) return;
        this.clock.speed = nextSpeed(this.clock.speed, this.speeds);
        this.saveMatch();
        this.refreshHud();
      },
      onPause: () => this.pause(),
      onSkipStage: this.ctx.debug ? () => this.match.world.enqueue({ type: 'debugSkipStage' }) : undefined,
      onAddGold: this.ctx.debug ? () => this.match.world.enqueue({ type: 'debugAddGold', amount: config.debug.addGold }) : undefined,
      onHire: () => this.hire(),
      onMenu: (kind) => this.toggleSheet(kind),
      devMenu: this.ctx.debug,
      onSummon: () => this.autoSummonOnce() !== 'stop',
      summonInterval: () => autoSummonInterval(effectsOff()),
      onReady: () => this.sendReady(),
      onUlt: (id) => this.castUltOf(id),
      onUltAll: () => {
        for (const t of readyUlts(this.match.ctx, this.match.world, LOCAL_PLAYER)) this.castUltOf(t.id);
      },
      onMergeAll: () => this.sendMergeAll(),
    });
    this.ctx.ui.clear('screen');
    this.ctx.ui.show('hud', this.hud);
    this.refreshHud();

    this.mapRenderer = null;
    this.background = new BattleBackground(this, {
      crossfadeMs: config.art.crossfadeMs,
      onCover: (covered) => this.mapRenderer?.setBackdropVisible(!covered),
      onImage: (url) => setSideBackground(url),
    });
    this.updateBackground();
    this.cutin = new BossCutinPlayer(this.ctx.ui);
    // 무한 모드 기본 보스 컷인 그림은 미리 받아 둔다 (처음 나올 때 빈 그림으로 미끄러지지 않게)
    this.cutinPreload = this.ctx.data.enemies.bosses
      .map((b) => bossCutinId(b.id, config.art.cutins))
      .filter((id): id is string => id !== null)
      .map((id) => {
        const img = new Image();
        img.src = assetUrl(cutinPath(id));
        return img;
      });
    const offEffects = onEffectsChange((off) => {
      if (off) this.cutin?.stop();
    });
    this.applyLayout(this.measureMapArea());
    this.layoutDirty = false;
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.layoutDirty = true;
      });
      this.resizeObserver.observe(this.hud.band);
      this.resizeObserver.observe(this.hud.bottomBand);
      this.resizeObserver.observe(this.hud.menuBar);
      this.resizeObserver.observe(this.ctx.ui.el);
      // 알림 한 줄 높이가 바뀌면 (스타일·글꼴이 늦게 적용됨 등) 알림 자리·위쪽 패널 위치를 다시 잰다 (T-3 병합, m3a 알림 겹침)
      this.resizeObserver.observe(this.ctx.ui.toastProbe);
    }
    // 화면 크기·방향이 바뀌어 논리 높이가 달라지면 (T-3): 배경을 새 크기로 덮고 맵을 다시 배치
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);

    // 맵 탭 → 소환 (M2-7), 타워 탭 → 정보 패널 (M3-11), 타워 길게 눌러 끌기 → 이동·교환 (M3-10)
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    // 캔버스 위의 DOM(HUD 버튼 등)에서 손을 떼면 Phaser는 'pointerupoutside'를 낸다 → 끌기가 붙잡힌 채 남지 않게 같이 받는다
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    // 이동 모드는 Esc로 그만둔다 (T-2)
    window.addEventListener('keydown', this.onKeyDown);

    // 앱이 백그라운드로 가면 자동 일시정지 (UI.md 7장: 돌아오면 일시정지 메뉴) + 자동 저장 (A-1: 일시정지가 저장한다)
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.pause, this);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener(NATIVE_PAUSE_EVENT, this.onNativePause);
    setBackHandler(() => this.goBack());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.emit('rtd:scene-loading');
      // 타이틀로 나가거나 다시 하기: 진행 중이면 마지막 상태를 남긴다 (패배한 판은 이미 지움)
      if (!this.gameOver) this.saveMatch();
      window.removeEventListener('pagehide', this.onPageHide);
      window.removeEventListener(NATIVE_PAUSE_EVENT, this.onNativePause);
      setBackHandler(null);
      this.savePastRun('나감');
      this.startHintEl?.remove();
      this.startHintEl = null;
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.pause, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
      this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
      this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
      window.removeEventListener('keydown', this.onKeyDown);
      this.groundPress = null;
      this.moveMode = null;
      this.closePanel();
      this.closeChoice();
      this.closeSheet();
      this.ctx.ui.setDockMetrics(null, null);
      this.press = null;
      this.pendingDrop = null;
      this.destroyLayers();
      this.mapRenderer = null;
      this.background?.destroy();
      this.background = null;
      offEffects();
      this.cutin?.stop();
      this.cutin = null;
      this.cutinPreload = [];
      this.ctx.ui.clear('card');
      this.ctx.ui.clear('guide');
      this.guide = null;
      this.guideCard = null;
      this.ctx.ui.clear('hud');
      this.ctx.ui.setToastTop(null);
      this.ctx.ui.setToastSingle(false);
      if (this.paused || this.gameOver) this.ctx.ui.clear('screen');
      this.paused = false;
      this.gameOver = false;
    });
    // 첫 소환 전: 추천 칸이 빛난다 (F10) — 처음 몇 프레임(텍스처 굽기로 느림)이 지난 뒤 짧은 안내 한 번 (좁은 화면에서도 한 줄)
    this.startHintFrames = 3;
    this.startHintEl = null;
    // 새 판·이어 한 판 모두 바로 한 번 저장 (타이틀에 [이어 하기]가 생긴다)
    this.saveMatch();
    this.cameras.main.fadeIn(200, 13, 18, 32);
    this.game.events.emit('rtd:game-ready', { seed: this.match.world.seed, mode: this.sceneData.mode });
  }

  /** 논리 크기가 바뀜 (T-3, Scale RESIZE): 배경은 바로 새 크기로, 맵은 다음 update에서 HUD를 다시 재고 배치 */
  private onResize(): void {
    this.background?.resize();
    this.layoutDirty = true;
  }

  override update(time: number, deltaMs: number): void {
    if (this.layoutDirty) {
      this.layoutDirty = false;
      const area = this.measureMapArea();
      // 글자 반올림 같은 작은 흔들림으로 맵을 다시 굽지 않게 (기준 px 2 이상 바뀔 때만)
      if (Math.abs(area.y - this.mapArea.y) >= 2 || Math.abs(area.h - this.mapArea.h) >= 2 || this.mapArea.w !== area.w) this.applyLayout(area);
      this.updateToastTop();
    }
    this.frameStartTick = this.match.tick;
    if (!this.gameOver) {
      // ×16에서도 한 프레임 sim 시간을 예산 안으로 (덜 돌린 틱은 버림 → 게임이 조금 느려질 뿐, ×1 몫은 그대로)
      const requested = this.clock.advance(deltaMs);
      const n = capTicks(requested, this.clock.speed, this.tickMeter.avgMs, simBudgetMs(deltaMs));
      this.tickMeter.dropped += requested - n;
      const t0 = performance.now();
      this.runTicks(n);
      this.tickMeter.record(n, performance.now() - t0);
    }
    this.handleEvents(time);
    this.autoSave();
    this.updateBackground();
    this.updatePress(this.time.now);
    this.updateGroundPress(this.time.now);
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
    this.updateGuide(time);
    this.projectileLayer.sync(this.match.projectiles(), this.prevProjectiles, (p) => this.projectileOrigin(p), alpha);
    this.floatingText.update(time);
    this.fx.update(time, () => this.goldAnchorPx());
    this.refreshHud();
    this.syncG1();
    this.refreshSheet(this.time.now);
  }

  /**
   * 자동 저장 (A-1): 단계가 바뀌면 바로, 명령이 실행됐으면 1초(게임 시간) 뒤, 그 밖에는 5초마다. 일시정지·패배 화면에서는 쉰다
   * (일시정지는 열 때 저장한다). 저장은 틱 경계(프레임 사이)에서만 한다.
   */
  private autoSave(): void {
    if (this.gameOver || this.paused) return;
    const m = this.match;
    if (m.state.stage !== this.lastSave.stage) {
      this.saveMatch();
      return;
    }
    if (performance.now() - this.lastSave.ms < AUTOSAVE_MIN_REAL_MS) return;
    const since = m.tick - this.lastSave.tick;
    if (since >= AUTOSAVE_TICKS || (m.world.executed.length !== this.lastSave.commands && since >= AUTOSAVE_AFTER_COMMAND_TICKS)) this.saveMatch();
  }

  /** 지금 판 저장. 썼으면 true (패배한 판·다른 창이 새 판을 시작한 슬롯이면 false). */
  private saveMatch(): boolean {
    if (!this.match || this.gameOver) return false;
    const m = this.match;
    this.lastSave = { tick: m.tick, stage: m.state.stage, commands: m.world.executed.length, ms: performance.now() };
    const speed = this.paused ? this.resumeSpeed : this.clock.speed;
    const token = this.ctx.saves.write(m, speed > 0 ? speed : 1, this.saveToken, this.runId);
    // 기기 저장소에 못 씀 (용량 초과·막힘): 판마다 한 번 알림 — 이번 실행 동안은 메모리 사본으로 이어 간다
    if (this.ctx.saves.persistFailed && !this.saveFailToast) {
      this.saveFailToast = true;
      this.ctx.ui.toast(SAVE_FAILED, 3200);
    }
    if (token === null) return false;
    this.saveToken = token;
    return true;
  }

  /** 이어 하기: 저장 전 손가락이 들고 있던 타워(hold)를 내려놓는다 — 새 화면에는 그 손가락이 없다. */
  private releaseSavedHolds(): void {
    const w = this.match.world;
    const releasing = new Set(w.queue.pending().filter((c) => c.type === 'hold' && c.on === 0).map((c) => (c.type === 'hold' ? `${c.x},${c.y}` : '')));
    for (const t of this.match.towers()) {
      if (t.owner === LOCAL_PLAYER && t.held && !releasing.has(`${t.tx},${t.ty}`)) w.enqueue({ type: 'hold', x: t.tx, y: t.ty, on: 0 });
    }
  }

  private readonly onPageHide = (): void => {
    this.saveMatch();
  };

  private readonly onNativePause = (): void => {
    this.pause();
    this.saveMatch();
  };

  /**
   * 안드로이드 뒤로 가기 (A-1): 열린 창부터 닫는다 — 변환 고르기 → 캐릭터 카드 → 첫 승급 안내 카드(✕와 같게 '봤음') → 바텀 시트 → 이동 모드 → 타워 패널 → 펼친 고르기 창.
   * 닫을 것이 없으면 일시정지 ↔ 계속, 패배 화면이면 타이틀로. 늘 처리한다 (전투 중에 앱이 닫히지 않게).
   */
  private goBack(): boolean {
    if (this.gameOver) {
      this.scene.start(SCENE_BOOT);
      return true;
    }
    if (this.paused) {
      this.resume();
      return true;
    }
    if (this.convertOpen) this.closeConvertPicker();
    else if (this.ctx.ui.has('card')) this.ctx.ui.clear('card');
    else if (this.guide) this.endGuide(true);
    else if (this.sheet) this.closeSheet();
    else if (this.moveMode) {
      this.moveMode = null;
      this.ctx.ui.toast(MOVE_CANCELED);
    } else if (this.panel) this.closePanel();
    else if (this.choice && !this.choice.collapsed) this.choice.collapse();
    else this.pause();
    return true;
  }

  /** E2E: 자동 저장 상태 */
  get saveState(): { runId: string; saved: boolean; resumed: boolean; lastTick: number } {
    return { runId: this.runId, saved: this.saveToken !== null, resumed: this.resumed, lastTick: this.lastSave.tick };
  }

  /** E2E (G-2): 소환·승급 캐릭터 연출 — 초상 카드(지금 떠 있는 수 · 지금까지 · 동시 최대) + 소환문·실루엣·등급 별 수 */
  get summonFxStats(): { active: number; shown: number; peak: number; portals: number; silhouettes: number; stars: number } {
    const f = this.fx;
    return { active: f?.cardActive ?? 0, shown: f?.cardShown ?? 0, peak: f?.cardPeak ?? 0, portals: f?.portalShown ?? 0, silhouettes: f?.silhouetteShown ?? 0, stars: f?.starShown ?? 0 };
  }

  /** @deprecated G-2에서 주사위 연출이 초상 카드로 바뀜 — 예전 E2E 이름 호환 (summonFxStats의 카드 수) */
  get diceStats(): { active: number; shown: number; peak: number } {
    const f = this.summonFxStats;
    return { active: f.active, shown: f.shown, peak: f.peak };
  }

  /** 전투 배경: 지금 단계의 테마·밴드 그림 + 밴드 끝 무렵 다음 그림 미리 받기 (HF-2, game.json art) */
  private updateBackground(): void {
    if (!this.background) return;
    const art = this.ctx.data.game.art;
    const { mode, stage, theme } = this.match.state;
    this.background.update(backgroundBand(art, mode, stage, theme), upcomingBand(art, mode, stage, theme));
  }

  /** 띄운 보스 컷인 수·지금 떠 있는가·미리 받은 컷인 그림 수 (E2E, HF-2) */
  get cutinStats(): { played: number; showing: boolean; preloaded: number } {
    return { played: this.cutin?.played ?? 0, showing: this.cutin?.showing ?? false, preloaded: this.cutinPreload.length };
  }

  /** 배치 칸 진하기 0~1 (T-3: 끄는 중 1, 판 시작·배치할 수 없는 곳을 누른 뒤 잠깐, 평소 0) — E2E */
  get buildHint(): number {
    const showing = this.press?.dragging === true || this.moveMode !== null;
    return buildHintAlpha(showing, this.time.now, this.buildHintAt, effectsOff());
  }

  /** 지금 보이는 전투 배경 텍스처 키 (E2E, HF-2). 그림이 아직 없으면 null */
  get backgroundKey(): string | null {
    return this.background?.currentKey ?? null;
  }

  /** 틱 n번 실행. 마지막 틱 직전의 진행도를 기억해 보간에 쓴다. 판이 끝나면(패배·캠페인 클리어) 그 자리에서 멈춘다. */
  private runTicks(n: number): void {
    for (let i = 0; i < n; i++) {
      if (this.match.ended) break;
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
    while (done < ticks && !this.match.ended) {
      this.match.step();
      done++;
    }
    this.prevProgress.clear();
    this.prevProjectiles.clear();
    this.prevSoldiers.clear();
    return done;
  }

  /** 틱 비용·버린 틱 수 (E2E·성능 측정용, T-1). */
  get simStats(): { avgTickMs: number; droppedTicks: number; speed: number } {
    return { avgTickMs: this.tickMeter.avgMs, droppedTicks: this.tickMeter.dropped, speed: this.clock.speed };
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
    return mapAreaBelowHud(cssToGamePx(band + toastLane, w), cssToGamePx(this.hud.bottomTop(), w), this.scale.height);
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
    // 맵 영역이 그대로여도 HUD 띠가 커지면 캐릭터 머리·주사위 한계를 새로 (B-1 검토 반영)
    const hudBottom = cssToGamePx(bottom, w);
    this.towerLayer?.setTopLimit(hudBottom);
    this.fx?.setTopLimit(hudBottom);
    this.panelTopCss = bottom + gap + this.ctx.ui.measureToastHeight() + gap / 2;
    // 첫 승급 안내 카드를 위에 띄울 때의 위쪽 끝 (F10) = 위쪽 패널과 같은 자리 (알림 한 줄 아래)
    this.ctx.ui.el.style.setProperty('--guide-top', `${Math.round(this.panelTopCss)}px`);
    this.panelPlaceKey = '';
    // 바텀 시트 아래 끝 = 하단 메뉴 위, 고르기 창 아래 끝 = 아래 띠 위 (M5)
    const H = this.ctx.ui.el.clientHeight;
    const menuTop = this.hud.menuTop();
    const dockTop = this.hud.bottomTop();
    this.ctx.ui.setDockMetrics(H > 0 && menuTop > 0 ? H - menuTop : null, H > 0 && dockTop > 0 ? H - dockTop : null);
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
    this.guideLayer?.destroy();
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
    // 바텀 시트가 열려 있으면 맵 터치는 시트만 닫는다 (UI.md 4.5 '맵 위를 터치하면 닫힘')
    if (this.sheet) {
      this.closeSheet();
      return;
    }
    // 아래 칸 타워의 머리(위 칸으로 삐져나온 부분)를 누르면 그 타워 칸 (위 칸 소환 아님)
    const world = this.match.world;
    const { tx, ty } = tapTile(
      this.layout,
      pointer.worldX,
      pointer.worldY,
      (x, y) => towerAt(world, x, y) !== undefined,
      (x, y) => {
        const t = towerAt(world, x, y);
        return t ? (this.towerLayer.artScaleOf(t.id) ?? 1) : 1;
      },
      (x, y) => isBuildable(this.match.map, x, y),
    );
    // 패널 [↔ 이동] 모드 (T-2): 빈 배치 칸 = 이동, 내 다른 타워 = 교환, 같은 타워·맵 밖·못 놓는 칸 = 취소
    if (this.moveMode) {
      this.finishMoveMode(tx, ty);
      return;
    }
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
    let fail = summonCheck(this.match.ctx, this.match.world, tx, ty, LOCAL_PLAYER);
    // G-1 인원 한도: 빈 칸이어도 내 타워가 한도만큼이면 소환하지 않는다
    if (fail === null && summonStackCheck(this.match.ctx, this.match.world, LOCAL_PLAYER) === 'cap') fail = 'cap';
    // 빈 땅 (T-2): 누르고 있으면 0.3초 뒤부터 자동 칸에 연속 소환 (맵 안이면 배치 칸이 아니어도)
    const inMap = tx >= 0 && ty >= 0 && tx < this.match.map.width && ty < this.match.map.height;
    const hint = fail === 'notBuildable';
    if (inMap) this.groundPress = { pointer, downMs: now, downX: pointer.worldX, downY: pointer.worldY, auto: false, lastMs: now, hint };
    // 길·빈 땅을 짧게 누르면 배치 칸을 잠깐 보여준다 (T-3: 평소에는 칸을 숨김). 맵 안은 뗄 때(꾹 눌러 연속 소환이면 안 보임), 맵 밖은 바로
    else if (hint) this.buildHintAt = now;
    const action = decideTap(fail, tx, ty, summonCost(this.match.ctx, LOCAL_PLAYER));
    if (action.kind === 'summon') {
      if (!tapAllowed(this.lastTapMs, now)) return;
      this.lastTapMs = now;
      // G-1 칸 무더기: 같은 타워의 덜 찬 칸이 있으면 그 칸에, 없으면 누른 칸에 (summonPad)
      if (this.match.world.enqueue({ type: 'summonPad', x: action.x, y: action.y }).ok) this.autoSummonTick = this.match.tick;
    } else if (action.kind === 'toast') {
      // 돈 부족·빈 칸 없음이면 꾹 눌러도 연속 소환하지 않는다
      this.groundPress = null;
      this.ctx.ui.toast(action.text);
      if (action.shake) this.fx.shakeTile(action.x, action.y, this.shakeOn());
    }
  }

  /**
   * 자동 칸에 한 번 소환 (T-2: 빈 땅 꾹 누르기·[🎲 소환] 버튼). 칸은 sim의 순수 함수 autoSummonTile (경로가 가장 많이 보이는 빈 칸),
   * 명령은 평소 summon {x, y} (리플레이 그대로). 앞 자동 소환 명령이 아직 실행 전이면 'wait' (같은 칸을 두 번 고르지 않게).
   * 돈 부족·빈 칸 없음이면 알림 후 'stop'.
   */
  private autoSummonOnce(): 'ok' | 'wait' | 'stop' {
    if (this.paused || this.gameOver) return 'stop';
    if (this.autoSummonTick === this.match.tick) return 'wait';
    const ctx = this.match.ctx;
    // G-1 칸 무더기: 같은 타워의 덜 찬 칸 → 자동 빈 칸 (summonAuto, sim이 굴린 뒤 칸을 정한다)
    const fail = summonStackCheck(ctx, this.match.world, LOCAL_PLAYER);
    if (fail === 'full') {
      this.ctx.ui.toast(BOARD_FULL);
      return 'stop';
    }
    if (fail === 'gold') {
      this.ctx.ui.toast(needGoldForSummon(summonCost(ctx, LOCAL_PLAYER)));
      return 'stop';
    }
    if (fail === 'cap') {
      this.ctx.ui.toast(UNIT_CAP_FULL);
      return 'stop';
    }
    if (fail) return 'stop';
    if (!this.match.world.enqueue({ type: 'summonAuto' }).ok) return 'stop';
    this.autoSummonTick = this.match.tick;
    return 'ok';
  }

  /** 빈 땅 꾹 누르기 (매 프레임): 0.3초 동안 거의 안 움직이면 연속 소환 시작, 그 뒤 간격마다 한 번 (연출 끄기면 더 빠르게). */
  private updateGroundPress(now: number): void {
    const g = this.groundPress;
    if (!g) return;
    if (this.paused || this.gameOver || this.sheet || this.panel || this.moveMode || !g.pointer.isDown) {
      this.groundPress = null;
      return;
    }
    if (!g.auto) {
      const moved = Math.hypot(g.pointer.worldX - g.downX, g.pointer.worldY - g.downY);
      if (moved > this.layout.tile * PRESS_SLOP_TILES) {
        this.groundPress = null;
        return;
      }
      if (now - g.downMs < LONG_PRESS_MS) return;
      g.auto = true;
      g.lastMs = now - autoSummonInterval(effectsOff());
    }
    if (now - g.lastMs < autoSummonInterval(effectsOff())) return;
    const r = this.autoSummonOnce();
    if (r === 'stop') this.groundPress = null;
    else if (r === 'ok') g.lastMs = now;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const p = this.press;
    if (!p || p.pointer !== pointer) return;
    p.x = pointer.worldX;
    p.y = pointer.worldY;
    this.updatePress(this.time.now);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    const g = this.groundPress;
    if (g?.pointer === pointer) {
      // 짧게 누른 길·빈 땅 (꾹 눌러 연속 소환이 시작되지 않음) → 배치 칸 잠깐 보이기
      if (g.hint && !g.auto) this.buildHintAt = this.time.now;
      this.groundPress = null;
    }
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

  /**
   * 타워 탭: 정보 패널 (같은 타워를 다시 누르면 닫기). 칸이 가득 찼으면 M2 안내도 같이.
   * T-2 '눌러서 바로 승급' (설정, 기본 꺼짐 — 피드백 #17): 지금 승급할 수 있는 타워(같은 종류 3개)면 패널 없이 그 칸에 merge 명령 → 결과가 누른 칸에 생긴다.
   */
  private tapTower(p: PressState): void {
    // 첫 승급 안내 중 (F10, 눌러서 바로 승급): 안내하는 묶음의 다른 타워를 누르면 그 칸이 새 결과 칸 (재료도 다시 계산) — 바로 승급하지 않는다.
    // 금색 결과 칸을 누르면 평소처럼 승급 → 표시한 재료 두 칸이 실제로 사라진다
    // 두 묶음이 함께 준비됐으면 (F10-4 검토): 안내 중에 다른 승급 가능 묶음의 타워를 누르면 바로 승급하지 않고 안내가 그 묶음으로 옮겨 간다
    // (그 타워 = 결과 칸, 재료 두 칸 다시 표시) — 어떤 종류를 어느 칸에서 합칠지 늘 화면에 보인 뒤에 승급한다
    const g = this.guide;
    if (g && this.ctx.settings.get().tapMerge) {
      const t = this.match.world.entities.get(p.id) as Tower | undefined;
      if (t && t.kind === 'tower' && t.owner === LOCAL_PLAYER && t.id !== g.anchorId) {
        // G-1 칸 무더기: 가득 찬 무더기를 누르면 그 칸이 안내 칸 (결과·재료가 같은 칸)
        const st = stackMergeCheck(this.match.ctx, this.match.world, LOCAL_PLAYER, t.tx, t.ty);
        if (st.ok && st.stack[0]!.id !== g.anchorId) {
          g.kind = t.tower;
          g.anchorId = st.stack[0]!.id;
          g.step = 2;
          this.closePanel();
          this.updateGuideCard();
          return;
        }
      }
    }
    if (this.ctx.settings.get().tapMerge && !(this.selectedId === p.id && this.panel)) {
      // G-1: 가득 찬 무더기(같은 타워 3개)를 누르면 연쇄 승급 (mergeStack)
      const mc = stackMergeCheck(this.match.ctx, this.match.world, LOCAL_PLAYER, p.tx, p.ty);
      const now = this.time.now;
      if (mc.ok && !inputLocked(this.inputLockUntil, now)) {
        if (this.match.world.enqueue({ type: 'mergeStack', x: p.tx, y: p.ty }).ok) {
          this.inputLockUntil = now + MERGE_INPUT_LOCK_MS;
          this.closePanel();
          return;
        }
      }
    }
    if (this.selectedId === p.id && this.panel) this.closePanel();
    else this.selectTower(p.id);
    // 더 소환할 수 없는 판이면 알려 준다: 칸이 꽉 참 → '빈 칸이 없어요', 칸은 있지만 인원 한도 → '인원이 가득 찼어요' (G-1)
    if (!hasRoom(this.match.ctx, this.match.world, LOCAL_PLAYER)) this.ctx.ui.toast(BOARD_FULL);
    else if (unitCount(this.match.world, LOCAL_PLAYER) >= unitCap(this.match.ctx, LOCAL_PLAYER)) this.ctx.ui.toast(UNIT_CAP_FULL);
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
      // G-1: 무더기를 통째로 (빈 칸 이동·교환·같은 타워면 합치기)
      const r = this.match.world.enqueue({ type: 'moveStack', fx: p.tx, fy: p.ty, tx: drop.tx, ty: drop.ty });
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
    // 바텀 시트는 하나만: 펼친 고르기 창은 알약으로 접는다 (창 뒤에 패널이 열려 ✕가 가려지던 것, 검토 반영). 메뉴 시트는 닫는다
    if (this.choice && !this.choice.collapsed) this.choice.collapse();
    this.closeSheet();
    if (!this.panel) {
      this.panel = createTowerPanel({
        onMerge: () => this.sendMerge('merge'),
        onMergeAll: () => this.sendMerge('mergeAll'),
        onClose: () => this.closePanel(),
        onInfo: () => this.openCharacterCard(),
        onMove: () => this.startMoveMode(),
        onSell: () => this.sendSell(),
        onConvert: this.ctx.debug ? () => this.openConvertPicker() : undefined,
      });
      this.ctx.ui.show('panel', this.panel);
      this.quick = createTowerQuick({ onMerge: () => this.sendMerge('merge') });
      this.ctx.ui.show('quick', this.quick);
    }
    this.refreshPanel();
  }

  // ---------------------------------------------------------------- T-2 판매·이동·변환

  /** [💰 판매]: 히어로 이상은 첫 누름에 '한 번 더 누르면 판매'(2초), 두 번째 누름에 sellTower 명령. */
  private sendSell(): void {
    if (this.paused || this.gameOver) return;
    const t = this.selectedTower();
    if (!t) return;
    // 확인 창(2초)은 실제 시간으로 잰다: this.time.now는 프레임 시작 시각이라 프레임이 느리면(바쁜 기기·×16) 한 프레임만큼 낡아 창이 짧아진다
    const now = performance.now();
    const grade = this.match.rules.towers.get(t.tower)?.grade;
    const cfg = this.ctx.data.game.sell;
    const confirming = this.sellConfirm !== null && this.sellConfirm.id === t.id && now < this.sellConfirm.untilMs;
    if (grade && sellNeedsConfirm(grade, cfg.confirmGrades) && !confirming) {
      this.sellConfirm = { id: t.id, untilMs: now + cfg.confirmSeconds * 1000 };
      this.refreshPanel();
      return;
    }
    this.sellConfirm = null;
    if (!sellCheck(this.match.ctx, this.match.world, LOCAL_PLAYER, t.tx, t.ty).ok) return;
    this.match.world.enqueue({ type: 'sellTower', x: t.tx, y: t.ty });
  }

  /** [↔ 이동]: 패널을 닫고 옮길 칸 고르기 (놓을 수 있는 칸 강조 + 안내). */
  private startMoveMode(): void {
    const t = this.selectedTower();
    if (!t || this.paused || this.gameOver) return;
    this.closePanel();
    this.moveMode = { id: t.id, tx: t.tx, ty: t.ty };
    this.ctx.ui.toast(MOVE_PICK_HINT, MOVE_HINT_MS);
  }

  /** 이동 모드에서 칸을 눌렀다: 놓을 수 있으면 move 명령 (빈 칸 이동·내 타워 교환), 아니면 취소. */
  private finishMoveMode(tx: number, ty: number): void {
    const m = this.moveMode;
    this.moveMode = null;
    if (!m || !this.match.world.entities.has(m.id)) return;
    const check = moveCheck(this.match.ctx, this.match.world, LOCAL_PLAYER, m.tx, m.ty, tx, ty);
    if (!check.ok) {
      this.ctx.ui.toast(MOVE_CANCELED);
      return;
    }
    this.match.world.enqueue({ type: 'moveStack', fx: m.tx, fy: m.ty, tx, ty });
  }

  /** 이동 모드 강조: 옮길 수 있는 칸 모두 (빈 배치 칸 = 이동, 내 다른 타워 = 교환). */
  private moveModeView(): { from: { tx: number; ty: number }; targets: { tx: number; ty: number; kind: 'move' | 'swap' }[] } | null {
    const m = this.moveMode;
    if (!m) return null;
    const t = this.match.world.entities.get(m.id) as Tower | undefined;
    if (!t || t.kind !== 'tower' || t.tx !== m.tx || t.ty !== m.ty) {
      this.moveMode = null;
      return null;
    }
    const targets: { tx: number; ty: number; kind: 'move' | 'swap' }[] = [];
    for (const [x, y] of this.match.map.buildable) {
      const c = moveCheck(this.match.ctx, this.match.world, LOCAL_PLAYER, m.tx, m.ty, x, y);
      if (c.ok) targets.push({ tx: x, ty: y, kind: c.other ? 'swap' : 'move' });
    }
    return { from: { tx: m.tx, ty: m.ty }, targets };
  }

  private readonly onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape' && this.moveMode) {
      this.moveMode = null;
      this.ctx.ui.toast(MOVE_CANCELED);
    }
  };

  /** [🛠 변환] (개발자): 같은 등급의 다른 타워 고르기 창 (sheet 층 — 바텀 시트는 하나만). */
  private openConvertPicker(): void {
    const t = this.selectedTower();
    if (!t || !this.ctx.debug || this.paused || this.gameOver) return;
    const { rules } = this.match;
    const at = { tx: t.tx, ty: t.ty, id: t.id };
    const items = convertTargets(rules, t.tower).map((id) => ({ id, name: this.towerNames.get(id) ?? id, portrait: this.portraitOf(id) }));
    this.closeSheet();
    this.ctx.ui.show(
      'sheet',
      createConvertPicker({
        title: `🛠 변환 · ${this.towerNames.get(t.tower) ?? t.tower} →`,
        items,
        onPick: (id) => {
          this.closeConvertPicker();
          const cur = this.match.world.entities.get(at.id) as Tower | undefined;
          if (!cur || cur.tx !== at.tx || cur.ty !== at.ty) return;
          this.match.world.enqueue({ type: 'debugConvertTower', x: at.tx, y: at.ty, t: rules.towerOrder.indexOf(id) });
        },
        onClose: () => this.closeConvertPicker(),
      }),
    );
    this.convertOpen = true;
  }

  private closeConvertPicker(): void {
    if (!this.convertOpen) return;
    this.convertOpen = false;
    this.ctx.ui.clear('sheet');
  }

  private closePanel(): void {
    this.sellConfirm = null;
    if (this.panel) this.ctx.ui.clear('panel');
    this.panel = null;
    if (this.quick) this.ctx.ui.clear('quick');
    this.quick = null;
    this.panelModel = null;
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
    // G-1: [승급]·[모두 승급] 모두 그 칸 무더기 연쇄 승급 (예전 merge·mergeAll 명령은 리플레이용으로만 남긴다)
    void type;
    const r = this.match.world.enqueue({ type: 'mergeStack', x: t.tx, y: t.ty });
    if (r.ok) this.inputLockUntil = now + MERGE_INPUT_LOCK_MS;
  }

  /**
   * 맵 오른쪽 위 [⏫ 모두 승급] (피드백 #26) → mergeAllStacks 명령. 승급 직후 0.3초는 다시 받지 않는다.
   * 피드백 #65: 꾹 누르기가 이 함수를 되풀이해 부른다 — 승급할 무더기가 있을 때만 보내고(없으면 기다림), 일시정지·판 끝이면 false (멈춤).
   */
  private sendMergeAll(): boolean {
    if (this.paused || this.gameOver) return false;
    const now = this.time.now;
    if (inputLocked(this.inputLockUntil, now)) return true;
    if (this.mergeReadyCount > 0 && this.match.world.enqueue({ type: 'mergeAllStacks' }).ok) this.inputLockUntil = now + MERGE_INPUT_LOCK_MS;
    return true;
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

  /** 종족 이름 (towers.json factions, 연합·고대신은 따로) */
  private factionNameOf(faction: string): string {
    return this.ctx.data.towers.factions[faction]?.name ?? (faction === 'alliance' ? '연합' : faction === 'ancient' ? '고대신' : faction);
  }

  /**
   * 캐릭터 카드 (HF-2): 정보 패널의 [ℹ]·초상 → 큰 초상(힉스필드 그림이 있으면 그것)·설명·능력치·특색·각성.
   * 패널이 마지막으로 그린 글자를 그대로 쓴다 (카드를 연 동안은 고정). ✕·바깥·Esc로 닫는다.
   */
  private openCharacterCard(): void {
    const t = this.selectedTower();
    const panel = this.panelModel;
    if (!t || !panel || panel.towerId !== t.tower) return;
    const data = this.ctx.data.towers.towers.find((x) => x.id === t.tower);
    if (!data) return;
    const elementName = data.element ? (this.ctx.data.towers.elements[data.element]?.name ?? null) : null;
    const model = characterCardModel({ data, panel, factionName: this.factionNameOf(data.faction), elementName, awakened: false });
    this.ctx.ui.show('card', createCharacterCard({ model, portrait: this.portraitOf(t.tower), onClose: () => this.ctx.ui.clear('card') }));
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
    const factionName = this.factionNameOf(data.faction);
    const model = buildTowerPanelModel({
      data,
      stats,
      // 오라·타워 레벨·자기 특색까지 반영한 지금 값 (버프로 오른 값은 초록, M3-7)
      eff: effectiveStats(rules, stats, state.mods[t.owner] ?? NO_MODS, towerBonus(this.match.ctx, t, computeAuras(this.match.ctx, this.match.world))),
      level: towerLevel(this.match.ctx, t.owner, t.tower),
      factionName,
      // G-1: 승급은 칸 무더기 단위 — 그 칸 타워 수 (가득 차면 승급)
      owned: towersAt(this.match.world, t.tx, t.ty).length,
      stack: towersAt(this.match.world, t.tx, t.ty).length,
      mergeCount: rules.mergeCount,
      mergeableGrade: canMergeGrade(stats.grade),
      outcomes: mergeOutcomes(deck, stats.grade).map((id) => names.get(id) ?? id),
      // '이동 중' = 놓은 뒤 0.5초 정지만 (끄는 동안에는 패널이 닫혀 있다. 느린 탭으로 다시 열 때 hold 해제 전 한 틱 깜빡이지 않게)
      paused: isPaused({ pauseUntil: t.pauseUntil, held: false }, this.match.tick),
      stunned: this.match.tick < t.stunUntil,
      penMaxBp: rules.penMaxBp,
      sell: {
        price: sellPriceFor(this.match.ctx, t.tower, t.owner),
        confirming: this.sellConfirm !== null && this.sellConfirm.id === t.id && performance.now() < this.sellConfirm.untilMs,
      },
    });
    this.panelModel = model;
    const changed = this.panel.update(model, this.portraitOf(t.tower));
    if (this.quick) {
      const ui0 = this.ctx.ui.el;
      const w0 = ui0.clientWidth;
      const c0 = tileCenterPx(this.layout, t.tx, t.ty);
      this.quick.update(quickModel(model));
      this.quick.place(quickPlacement(gameToCssPx(c0.x, w0), gameToCssPx(c0.y, w0), gameToCssPx(this.layout.tile, w0), w0, ui0.clientHeight));
    }
    // 패널이 고른 타워 그림을 가리지 않게: 실제 패널 높이와 그림 위치를 재서 쪽·접기 단계를 정한다 (바뀔 때만)
    const ui = this.ctx.ui.el;
    const figureScale = this.towerLayer.artScaleOf(t.id) ?? 1;
    const key = `${t.id}|${t.tx},${t.ty}|${this.layout.tile}|${this.layout.originY}|${ui.clientWidth}x${ui.clientHeight}|${figureScale.toFixed(3)}`;
    if (!changed && key === this.panelPlaceKey) return;
    this.panelPlaceKey = key;
    const L = this.layout;
    const c = tileCenterPx(L, t.tx, t.ty);
    const span = towerFigureSpanTiles(figureScale);
    const w = ui.clientWidth;
    const figure = { top: gameToCssPx(c.y + L.tile * span.top, w), bottom: gameToCssPx(c.y + L.tile * span.bottom, w) };
    const placement = this.panel.place(figure, this.panelTopCss);
    this.panelSide = placement.side === 'top' ? 'top' : 'bottom';
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
                // 사거리 강화가 붙은 실제 사거리 (sim 대상 고르기와 같은 값, M5 검토 반영)
                range: towerRange(this.match.state, t.owner, stats.range),
                detectRange: stats.detect === 'aura' ? stats.detectRange : 0,
                auraRadius: aura ? auraRadiusOf(rules, aura.area) : 0,
              }
            : null,
        buffed,
        sameKind: t && !p ? sameKindTowers(this.match.world, t.tower, t.owner).map((x) => ({ tx: x.tx, ty: x.ty })) : [],
        drop: p && p.drop && stats && t ? { ...p.drop, range: towerRange(this.match.state, t.owner, stats.range) } : null,
        moveMode: this.moveModeView(),
        buildable: { tiles: this.match.map.buildable, alpha: this.buildHint },
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
    renderer.setBackdropVisible(!(this.background?.covered ?? false));
    renderer.draw();
    this.mapRenderer = renderer;

    const legions = (enemies.hierarchy as { legions?: Record<string, { color?: string }> }).legions ?? {};
    const sizes = new Map<string, string>(enemies.mobs.map((m) => [m.id, m.size]));
    for (const b of enemies.bosses) sizes.set(b.id, '보스');
    // 도전 보스 (M5-2): 대형 (쌍둥이 박쥐는 두 마리라 중형)
    for (const c of enemies.challenges) sizes.set(c.id, (c.twin ?? 1) > 1 ? '중형' : '대형');
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
    const hudBottom = cssToGamePx(this.hud.bandBottom(), this.ctx.ui.el.clientWidth);
    this.towerLayer = new TowerLayer(this, this.layout, hudBottom, {
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
    // B-1: 소환·승급 주사위는 커진 캐릭터의 머리 위에서 멈춘다 (예전 높이면 2배 그림의 얼굴을 가림)
    this.fx = new FxLayer(
      this,
      this.layout,
      undefined,
      (x, y) => {
        const t = towerAt(this.match.world, x, y);
        return t ? this.towerLayer.expectedScale(t, this.match.towers()) : 1;
      },
      // G-2 소환·승급 실루엣·초상 카드: 정보 패널과 같은 캐릭터 한 장 그림
      (towerId) => {
        try {
          return this.towerLayer.textureKey(towerId);
        } catch {
          return null;
        }
      },
    );
    this.selectionLayer = new SelectionLayer(this, this.layout);
    this.guideLayer = new GuideLayer(this, this.layout);
    this.updateToastTop();
  }

  private handleEvents(time: number): void {
    // 한 프레임에 단계가 여러 번 바뀌면(빨리 감기·높은 배속) 마지막 단계 알림 하나만
    let lastStage: { stage: number; boss: boolean } | null = null;
    /** 이번 프레임에 보스 등장 배너를 띄웠다 → 'N단계 보스 단계!' 알림은 생략 (배너가 단계까지 보여 준다) */
    let bossArrived = false;
    /** 판이 끝남 (패배 또는 캠페인 클리어 — V2 L5) */
    let ended = false;
    const now = this.match.tick;
    const frameStart = this.frameStartTick;
    const cost = summonCost(this.match.ctx, LOCAL_PLAYER);
    let texts = 0;
    let heals = 0;
    let sparks = 0;
    let areaFx = 0;
    let meteors = 0;
    let coins = 0;
    // 배속별 연출 한도 (×4부터 줄임, 치명타 우선)
    const budget = fxBudget(this.clock.speed);
    this.floatingText.setMaxActive(budget.activeTexts);
    /** 높은 배속: 이번 프레임 피해 숫자 후보 (치명타 우선으로 budget.damageTexts개만 띄운다) */
    const hitTexts: SimEvent[] = [];
    const spawnDamageText = (ev: SimEvent): boolean => {
      const crit = ev.crit === true;
      const color = crit ? DAMAGE_COLORS.critical : damageColor(Number(ev.p), Number(ev.m), Number(ev.t));
      const px = unitsToPx(this.layout, Number(ev.x), Number(ev.y));
      const jitter = (Math.random() - 0.5) * this.layout.tile * 0.3;
      // 같은 자리에 몰리면 위로 쌓고, 쌓을 자리가 없으면 띄우지 않는다 (겹쳐서 다른 숫자처럼 읽히지 않게). 치명타는 크게 + '!'
      const label = crit ? `${ev.damage}!` : String(ev.damage);
      return this.floatingText.spawn(px.x + jitter, px.y - this.layout.tile * 0.42, label, color, time, crit, crit);
    };
    /** 돈 연출 (동전 + '+n원'): 한도 안이면 날리고, 넘으면 HUD 돈에 바로 */
    const goldFx = (x: number, y: number, amount: number, riseTiles: number): void => {
      if (coins >= budget.coins) {
        this.hud.gainGold(amount);
        return;
      }
      coins++;
      const px = unitsToPx(this.layout, x, y);
      this.floatingText.spawn(px.x, px.y - this.layout.tile * riseTiles, `+${amount}원`, DAMAGE_COLORS.gold, time, true);
      this.fx.coin(x, y, time, () => this.hud.gainGold(amount));
    };
    /** 이번 프레임에 운석을 떨어뜨린 '타워:틱' (그 틱의 그 타워 피해 자리마다 불덩이) */
    const meteorKeys = new Set<string>();
    /** 이번 프레임에 받은 미션 보상 (모두 받기는 알림 하나로) */
    const claimed = { total: 0, count: 0 };
    /** 이번 프레임에 달성한 일반 미션 (알림 하나로) */
    const done = { names: [] as string[], total: 0 };
    /** 이번 프레임에 승급 결과 알림을 띄웠다 (모두 승급은 하나만, F10) */
    let resultShown = false;
    const stageNow = this.match.state.stage;
    /** 이번 프레임에 내가 소환한 타워 id (자동 판매, 피드백 #46 — 개발자가 놓은 타워는 빼고) */
    const summonedIds: number[] = [];
    for (const ev of this.match.world.drainEvents()) {
      const recent = eventFxVisible('bulk', ev.tick, now, frameStart);
      switch (ev.type) {
        case 'stageStart':
          lastStage = { stage: Number(ev.stage), boss: ev.boss === true };
          break;
        case 'victory':
          ended = true;
          break;
        case 'defeat':
          ended = true;
          if (ev.reason === 'bossTime') {
            // 이번 판 기록 (개발자 도구): 시간 초과 때 남은 보스 체력
            const b = bossHudInput(this.match.rules, this.legionNames, this.match.state, this.match.mobs(), this.match.tick);
            recordRunEvent(this.runLog, { type: 'bossTimeout', tick: ev.tick, stage: Number(ev.stage), hp: b?.hp ?? 0, maxHp: b?.maxHp ?? this.match.state.bossMaxHp });
          }
          break;
        case 'readyNow':
          if (ev.player === LOCAL_PLAYER) recordRunEvent(this.runLog, { type: 'readyNow', tick: ev.tick, left: Number(ev.left) });
          break;
        case 'summon':
          if (isAutoSellSummon(ev, LOCAL_PLAYER)) summonedIds.push(Number(ev.id));
          if (ev.player === LOCAL_PLAYER) recordRunEvent(this.runLog, { type: 'summon', tick: ev.tick, stage: stageNow });
          if (ev.god === true && eventFxVisible('rare', ev.tick, now, frameStart)) {
            this.ctx.ui.toast(godDescends(this.ctx.data.towers.towers.find((t) => t.id === ev.tower)?.name ?? String(ev.tower)), 2400);
          }
          if (!eventFxVisible('action', ev.tick, now, frameStart)) break;
          this.towerLayer.noteSummoned(Number(ev.id));
          {
            const grade = ((ev.grade as Grade) || 'normal') as Grade;
            this.fx.summonFx({ tx: Number(ev.x), ty: Number(ev.y), color: hexToInt(GRADE_COLORS[grade] ?? GRADE_COLORS.normal), grade, towerId: String(ev.tower) });
          }
          this.summonFxCount++;
          if (ev.player === LOCAL_PLAYER) this.ctx.audio.play('summon');
          if (ev.rare === true && ev.player === LOCAL_PLAYER) {
            this.ctx.ui.toast(FORTUNA_RARE);
            this.noteFx('fortuna');
          }
          if (ev.lucky === true && ev.player === LOCAL_PLAYER) this.ctx.ui.toast(LUCKY_SUMMON);
          if (ev.twin === true) this.noteFx('twin');
          break;
        case 'summonFail': {
          if (!eventFxVisible('action', ev.tick, now, frameStart) || ev.player !== 0) break;
          // G-1: 굴린 타워가 들어갈 칸이 없어 취소 (돈은 그대로)
          const text = ev.rolled === true ? SUMMON_NO_FIT : summonFailText(String(ev.reason), cost);
          if (text) this.ctx.ui.toast(text);
          if (ev.reason === 'gold' && Number(ev.x) >= 0) this.fx.shakeTile(Number(ev.x), Number(ev.y), this.shakeOn());
          break;
        }
        // ---- G-1 ----
        case 'mergeChain':
          if (ev.player !== LOCAL_PLAYER) break;
          this.noteFx('mergeChain');
          if (eventFxVisible('action', ev.tick, now, frameStart)) this.ctx.ui.toast(chainMergeText(Number(ev.steps)));
          break;
        case 'mergeAllStacks':
          if (ev.player !== LOCAL_PLAYER) break;
          this.noteFx('mergeAllStacks');
          if (eventFxVisible('action', ev.tick, now, frameStart)) this.ctx.ui.toast(mergeAllText(Number(ev.steps)));
          break;
        case 'gacha': {
          if (ev.player !== LOCAL_PLAYER) break;
          this.noteFx('gacha');
          const kind = this.match.rules.gachaKinds[Number(ev.k)];
          const g = String(ev.grade) as keyof typeof GACHA_GRADE_NAMES;
          const name = ev.tower ? (this.towerNames.get(String(ev.tower)) ?? String(ev.tower)) : '';
          this.gachaResult = gachaResultText(kind?.name ?? '', GACHA_GRADE_NAMES[g] ?? '', name, ev.pity === true);
          if (!eventFxVisible('action', ev.tick, now, frameStart)) break;
          if (g === 'legend' || g === 'god') {
            this.ctx.ui.banner(this.gachaResult, null, 2400, 'gold');
            this.shake(260, 0.006);
          } else this.ctx.ui.toast(this.gachaResult);
          break;
        }
        case 'gachaFail': {
          if (ev.player !== LOCAL_PLAYER || !eventFxVisible('action', ev.tick, now, frameStart)) break;
          const kind = this.match.rules.gachaKinds[Number(ev.k)];
          const text = gachaFailText(String(ev.reason), (kind?.cost ?? 0) - this.match.state.gold);
          if (text) this.ctx.ui.toast(text);
          break;
        }
        case 'craft': {
          if (ev.player !== LOCAL_PLAYER) break;
          this.noteFx('craft');
          const id = String(ev.tower);
          const first = !this.match.state.debug && !this.match.state.debugUsed && this.ctx.account.recordCodex(id);
          if (!eventFxVisible('action', ev.tick, now, frameStart)) break;
          this.towerLayer.noteSummoned(Number(ev.id));
          const from = String(ev.removed)
            .split(';')
            .filter((x) => x !== '')
            .map((xy) => {
              const [a, b] = xy.split(',');
              return { tx: Number(a), ty: Number(b) };
            });
          // G-2 연출 + G-1 리미티드 조합: 리미티드(히든) 초상 카드, 빛은 금빛이 잘 보이게 레전드 색
          this.fx.mergeSuck(from, { tx: Number(ev.x), ty: Number(ev.y), color: hexToInt(GRADE_COLORS.legend), grade: 'hidden', towerId: id });
          this.ctx.audio.play('merge');
          this.shake(260, 0.006);
          this.ctx.ui.banner(craftText(this.towerNames.get(id) ?? id, first), null, 2600, 'gold');
          break;
        }
        case 'craftFail': {
          if (ev.player !== LOCAL_PLAYER || !eventFxVisible('action', ev.tick, now, frameStart)) break;
          const text = craftFailText(String(ev.reason));
          if (text) this.ctx.ui.toast(text);
          break;
        }
        case 'ult': {
          this.noteFx('ult');
          if (!eventFxVisible('action', ev.tick, now, frameStart)) break;
          const k = String(ev.kind) as 'nuke' | 'stun' | 'rally';
          const def = this.ctx.data.game.ultimate.kinds[k];
          if (k === 'nuke') {
            this.fx.blastRing(Number(ev.x), Number(ev.y), Number(ev.r), 0xffb02e);
            this.fx.blastRing(Number(ev.x), Number(ev.y), Math.floor(Number(ev.r) * 0.6), 0xff5a2a);
            this.shake(240, 0.006);
          } else if (k === 'stun') {
            this.fx.timeStop(Number(ev.x), Number(ev.y));
            this.fx.blastRing(Number(ev.x), Number(ev.y), Number(ev.r), 0x9fd8ff);
          }
          if (ev.player === LOCAL_PLAYER && def) {
            const name = this.towerNames.get(String(ev.tower)) ?? String(ev.tower);
            this.ctx.ui.toast(`${def.icon} ${ultText(name, def.name, k === 'rally' ? 0 : Number(ev.count))}`);
          }
          break;
        }
        case 'attack':
          if (recent) this.towerLayer.attack(Number(ev.tower), Number(ev.x), Number(ev.y), time);
          break;
        case 'merge': {
          if (ev.player !== LOCAL_PLAYER) break;
          recordRunEvent(this.runLog, { type: 'merge', tick: ev.tick, stage: stageNow });
          // 승급 결과 이름·역할 (F10): 첫 승급 안내 중이면 늘, 아니면 판마다 처음 몇 번 (game.json guide.resultToasts)
          const guiding = this.guide !== null;
          if (guiding) this.endGuide(true);
          if (!resultShown && (guiding || this.resultToastsShown < this.ctx.data.game.guide.resultToasts)) {
            const d = this.ctx.data.towers.towers.find((t) => t.id === ev.tower);
            if (d) {
              resultShown = true;
              this.resultToastsShown++;
              const r = mergeResultText(d.name, GRADE_NAMES[d.grade], d.role ?? '');
              this.ctx.ui.banner(r.title, r.sub || null, Math.round(this.ctx.data.game.guide.resultToastSeconds * 1000), 'merge');
            }
          }
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
          {
            const grade = ((ev.grade as Grade) || 'normal') as Grade;
            this.fx.mergeSuck(from, { tx: Number(ev.x), ty: Number(ev.y), color: hexToInt(GRADE_COLORS[grade] ?? GRADE_COLORS.normal), grade, towerId: String(ev.tower) });
          }
          this.mergeFxCount++;
          this.ctx.audio.play('merge');
          if (ev.grade === 'legend' || ev.grade === 'god') this.shake(260, 0.006);
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
          if (!recent || areaFx >= budget.areaFx) break;
          areaFx++;
          this.fx.blastRing(Number(ev.x), Number(ev.y), Number(ev.r), this.areaColor(Number(ev.tower)));
          break;
        case 'chain':
          if (!recent || areaFx >= budget.areaFx) break;
          areaFx++;
          this.fx.chainBolt(Number(ev.x1), Number(ev.y1), Number(ev.x2), Number(ev.y2));
          break;
        case 'hit': {
          // 고배속 프레임 초반에 난 치명타도 숫자는 놓치지 않는다 (렌더 개수는 아래 한도). 불꽃·깜빡임·운석은 최근 사건만 —
          // 지난 치명타가 옛 자리에서 불꽃 한도를 먼저 쓰지 않게 (B-2 통합 검토)
          if (!recent) {
            if (ev.crit === true && eventFxVisible('action', ev.tick, now, frameStart)) hitTexts.push(ev);
            break;
          }
          // 운석 피해에만 불덩이 (같은 틱에 착탄한 그 대마법사의 일반 투사체 피해에는 붙이지 않는다 — fx 표시로 고름)
          if (ev.fx === METEOR_FX && meteors < MAX_METEOR_FX && meteorKeys.has(`${ev.source}:${ev.tick}`)) {
            meteors++;
            this.fx.meteor(Number(ev.x), Number(ev.y));
          }
          // 지속 피해(화상·독·출혈)는 깜빡이지 않고 숫자만 (0.5초마다라 몹이 늘 하얗게 보이지 않게)
          if (ev.dot !== true) this.mobLayer.flash(Number(ev.target), time);
          hitTexts.push(ev);
          if (sparks < budget.sparks) {
            sparks++;
            this.fx.hitSpark(Number(ev.x), Number(ev.y), hexToInt(damageColor(Number(ev.p), Number(ev.m), Number(ev.t))));
          }
          break;
        }
        case 'kill': {
          this.mobLayer.markKilled(Number(ev.id));
          if (!recent) break;
          const reward = Number(ev.reward);
          // 보상 없는 조각(작은 슬라임)·보스 조각은 '+0원'을 띄우지 않는다 (보스 보상은 bossKill 사건)
          if (!(reward > 0)) break;
          goldFx(Number(ev.x), Number(ev.y), reward, 0.15);
          break;
        }
        case 'miss':
          if (recent) this.fx.missPuff(Number(ev.x), Number(ev.y));
          break;
        case 'abilityGold': {
          // 특색 돈 (광부·상인·연금술사): 타워 위 '+n원' + 동전이 HUD로. 몇 초에 한 번인 드문 사건이라 이번 프레임에 난 것은 모두
          // (느린 프레임에서 '최근 몇 틱' 밖으로 밀려 연출이 빠지던 것 — m3b E2E 흔들림 원인, B-2 통합)
          if (!eventFxVisible('action', ev.tick, now, frameStart)) break;
          goldFx(Number(ev.x), Number(ev.y), Number(ev.amount), 0.55);
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
          this.floatingText.spawn(px.x, px.y - this.layout.tile * 0.6, EXECUTE_LABEL, DAMAGE_COLORS.execute, time, true, false, 'huge');
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
        case 'stageInterest':
          // 단계 이자 (피드백 #10): 돈 글자 옆 +n원 + 알림
          if (eventFxVisible('action', ev.tick, now, frameStart)) {
            this.hud.gainGold(Number(ev.amount));
            this.ctx.ui.toast(
              stageInterestText(Number(ev.amount), this.match.rules.interestPer, this.match.rules.interestAmount, this.match.rules.interestMax),
            );
          }
          this.noteFx('stageInterest');
          break;
        case 'bossSpawn': {
          {
            const bb = this.match.rules.bosses.get(String(ev.boss));
            recordRunEvent(this.runLog, { type: 'bossSpawn', tick: ev.tick, stage: Number(ev.stage), name: bb?.name ?? String(ev.boss) });
          }
          if (!eventFxVisible('rare', ev.tick, now, frameStart)) break;
          const b = this.match.rules.bosses.get(String(ev.boss));
          if (b) {
            const { mode, theme } = this.match.state;
            const label = formatStage({ mode, theme, stage: Number(ev.stage ?? this.match.state.stage) });
            this.ctx.ui.banner(bossArrivalText(label, bossTag(this.legionNames[b.legion] ?? b.legion, b.rank), b.name), null, 2600, 'boss');
            bossArrived = true;
            // 보스 컷인 (HF-2): 그림이 있는 보스만, 연출 끄기면 건너뜀. 실제 시간 art.cutinMs (배속과 무관)
            const cutId = bossCutinId(b.id, this.ctx.data.game.art.cutins);
            if (cutId && !effectsOff()) this.cutin?.play({ src: assetUrl(cutinPath(cutId)), name: b.name, ms: this.ctx.data.game.art.cutinMs });
          }
          this.shake(220, 0.004);
          this.noteFx('bossSpawn');
          break;
        }
        case 'bossKill': {
          recordRunEvent(this.runLog, { type: 'bossKill', tick: ev.tick, stage: Number(ev.stage) });
          if (!eventFxVisible('rare', ev.tick, now, frameStart)) break;
          const b = this.match.rules.bosses.get(String(ev.boss));
          const reward = Number(ev.reward);
          this.ctx.ui.banner(bossKillText(b?.name ?? String(ev.boss), reward), null, 2200, 'gold');
          this.fx.coin(Number(ev.x), Number(ev.y), time, () => this.hud.gainGold(reward));
          this.noteFx('bossKill');
          break;
        }
        case 'bossStun':
          if (eventFxVisible('action', ev.tick, now, frameStart)) this.shake(160, 0.003);
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
          if (eventFxVisible('action', ev.tick, now, frameStart)) this.shake(420, 0.01);
          break;
        case 'heal': {
          if (!recent || heals >= MAX_HEAL_TEXTS_PER_FRAME) break;
          heals++;
          const px = unitsToPx(this.layout, Number(ev.x), Number(ev.y));
          this.floatingText.spawn(px.x, px.y - this.layout.tile * 0.42, `+${ev.amount}`, DAMAGE_COLORS.heal, time, false, false, 'small');
          this.noteFx('heal');
          break;
        }
        case 'evade': {
          if (!recent) break;
          const px = unitsToPx(this.layout, Number(ev.x), Number(ev.y));
          this.floatingText.spawn(px.x, px.y - this.layout.tile * 0.42, EVADE_LABEL, DAMAGE_COLORS.evade, time, false, false, 'small');
          this.noteFx('evade');
          break;
        }
        // ---- M5 ----
        case 'upgrade':
          if (ev.player === LOCAL_PLAYER) this.noteFx('upgrade');
          break;
        case 'upgradeFail': {
          if (ev.player !== LOCAL_PLAYER || !eventFxVisible('action', ev.tick, now, frameStart)) break;
          this.toastUpgradeFail(String(ev.reason), Number(ev.k));
          break;
        }
        case 'gamble':
          if (ev.player !== LOCAL_PLAYER) break;
          this.noteFx('gamble');
          {
            const result = { mul: mulText(Number(ev.mul)), mulBp: Number(ev.mul), win: Number(ev.win), jackpot: ev.jackpot === true, cost: Number(ev.cost) };
            // 그 테이블 릴을 돌리는 중이면 결과를 넣고, 아니면(빨리 감기 등) 바로 보여 준다 (T-2: 테이블마다 따로)
            const t = Number(ev.t);
            const slot = this.slots.get(t);
            if (slot && !slot.result) slot.result = result;
            else this.slots.set(t, { startMs: this.time.now - SLOT_SPIN_MS, result, revealedMs: null });
          }
          break;
        case 'mergePickFail':
          // V2 H1: 무더기 안 결과를 바꾸려는데 옮길 칸이 없음 → 바꾸지 않고 축복 1회를 돌려받음 (창은 선택이 사라져 닫힌다)
          if (ev.player === LOCAL_PLAYER && ev.reason === 'full') this.ctx.ui.toast(MERGE_PICK_FULL);
          break;
        case 'gambleFail': {
          if (ev.player !== LOCAL_PLAYER) break;
          {
            const slot = this.slots.get(Number(ev.t));
            if (slot && !slot.result) this.slots.delete(Number(ev.t));
          }
          if (!eventFxVisible('action', ev.tick, now, frameStart)) break;
          const t = this.match.rules.gambleTables[Number(ev.t)];
          const text = gambleFailText(String(ev.reason), (t?.cost ?? 0) - this.match.state.gold, t?.unlockLevel ?? 0);
          if (text) this.ctx.ui.toast(text);
          break;
        }
        case 'challengeStart': {
          this.noteFx('challengeStart');
          if (!eventFxVisible('action', ev.tick, now, frameStart)) break;
          const c = this.match.rules.challenges[Number(ev.lv) - 1];
          if (c) this.ctx.ui.banner(challengeStartText(c.level, c.name, Math.round(this.match.rules.challengeTimeTicks / TICK_HZ)), null, 2200, 'challenge');
          break;
        }
        case 'challengeStartFail': {
          if (ev.player !== LOCAL_PLAYER || !eventFxVisible('action', ev.tick, now, frameStart)) break;
          const text = challengeStartFailText(String(ev.reason));
          if (text) this.ctx.ui.toast(text);
          break;
        }
        case 'challengeClear': {
          this.noteFx('challengeClear');
          if (!eventFxVisible('action', ev.tick, now, frameStart)) break;
          const reward = Number(ev.reward);
          const lv = Number(ev.lv);
          const opened = ev.first === true && Number(ev.open) > lv ? Number(ev.open) : null;
          this.ctx.ui.banner(challengeClearText(lv, reward, opened), null, 2400, 'gold');
          if (reward > 0) this.fx.coin(Number(ev.x), Number(ev.y), time, () => this.hud.gainGold(reward));
          break;
        }
        case 'challengeFail':
          this.noteFx('challengeFail');
          if (eventFxVisible('action', ev.tick, now, frameStart)) {
            this.ctx.ui.banner(challengeFailText(Number(ev.lv), String(ev.reason), Math.round(this.match.rules.challengeCooldownTicks / (TICK_HZ * 60))), null, 2400, 'challenge');
          }
          break;
        case 'challengeReady':
          if (eventFxVisible('action', ev.tick, now, frameStart)) this.ctx.ui.toast(challengeReadyText(Number(ev.lv)));
          this.noteFx('challengeReady');
          break;
        case 'challengeFreeze':
          if (eventFxVisible('action', ev.tick, now, frameStart)) this.shake(140, 0.003);
          this.noteFx('challengeFreeze');
          break;
        case 'challengeTeleport':
        case 'challengeGuard':
        case 'challengeInvisible':
          this.noteFx(ev.type);
          break;
        case 'missionDone': {
          this.noteFx('missionDone');
          const m = this.match.rules.missions[Number(ev.i)];
          if (!m) break;
          // 히든 미션은 판 밖에 영구 기록 (다음 판부터 미션 시트에 이름이 보인다).
          // 개발용 치트를 쓸 수 있는 판(?debug=1)은 계정에 남기지 않는다 (CLAUDE.md 4장 '테스트·확인용', M5 검토 반영)
          if (m.hidden && !this.match.state.debug && !this.match.state.debugUsed) this.ctx.account.recordHidden(m.id);
          // 빨리 감기로 프레임 밖에서 달성한 것은 알리지 않는다 (메뉴 배지·시트에는 남는다)
          if (!eventFxVisible('action', ev.tick, now, frameStart)) break;
          // 보상 글자는 받을 때 실제로 들어오는 돈 (카드 '황금 손' 반영 — M5 검토 반영)
          const reward = goldWithBonus(this.match.state, m.reward);
          if (m.hidden) this.ctx.ui.banner(hiddenMissionText(m.name, reward), null, 2800, 'gold');
          else {
            done.names.push(m.name);
            done.total += reward;
          }
          break;
        }
        case 'missionClaim':
          claimed.total += Number(ev.reward);
          claimed.count++;
          break;
        // ---- T-2 ----
        case 'sell':
          if (ev.player !== LOCAL_PLAYER) break;
          this.noteFx('sell');
          this.hud.gainGold(Number(ev.gold));
          this.ctx.ui.toast(sellText(Number(ev.gold)));
          break;
        case 'convert':
          if (ev.player !== LOCAL_PLAYER) break;
          this.noteFx('convert');
          this.ctx.ui.toast(convertText(this.towerNames.get(String(ev.from)) ?? String(ev.from), this.towerNames.get(String(ev.tower)) ?? String(ev.tower)));
          break;
        case 'chanceSet':
          this.noteFx('chanceSet');
          break;
      }
    }
    // 피드백 #46 자동 판매: 방금 소환된 기준 등급 이하 타워를 평소 판매 명령으로 (리플레이에 남는다)
    // 피드백 #63: 자동 승급이 맡는 등급(그 이하)은 팔지 않는다 — 판매보다 승급이 먼저 (autoSellMinRank)
    const sellGrade = autoSellGrade(this.ctx.settings.get());
    if (sellGrade && summonedIds.length > 0 && !this.gameOver) {
      const minRank = autoSellMinRank(this.ctx.settings.get());
      const ids = minRank > 1 ? summonedIds.filter((id) => this.towerGradeRank(id) >= minRank) : summonedIds;
      for (const [x, y] of autoSellTiles(this.match.ctx, this.match.world, LOCAL_PLAYER, ids, sellGrade)) this.match.world.enqueue({ type: 'sellTower', x, y });
    }
    // 치명타를 먼저, 같은 종류는 큰 피해부터 프레임 한도만큼.
    if (hitTexts.length > 0) {
      // 자리가 없어 못 띄운 숫자가 있으면 다음 후보로 넘어간다 (자르지 않고 정렬만 — B-2 통합 검토)
      for (const ev of prioritizeDamage(hitTexts)) {
        if (texts >= budget.damageTexts) break;
        if (spawnDamageText(ev)) {
          texts++;
          if (ev.crit === true) {
            this.fx.criticalImpact(Number(ev.x), Number(ev.y));
            this.noteFx('critical');
          }
        }
      }
    }
    // 같은 프레임에 달성한 일반 미션은 한 줄 배너 하나로 (알림이 쌓여 맵 위쪽 줄을 가리지 않게)
    if (done.names.length > 0) this.ctx.ui.banner(missionDoneText(done.names, done.total), null, 2200, 'mission');
    if (claimed.count > 0) {
      this.hud.gainGold(claimed.total);
      this.ctx.ui.toast(missionClaimText(claimed.total, claimed.count));
      this.noteFx('missionClaim');
    }
    if (this.startHintEl && (lastStage || this.match.state.summons > 0)) {
      this.startHintEl.remove();
      this.startHintEl = null;
    }
    if (lastStage && !(lastStage.boss && bossArrived)) {
      const { mode, theme } = this.match.state;
      this.ctx.ui.toast(stageToastText({ mode, theme, stage: lastStage.stage, bossStage: lastStage.boss }));
    }
    if (lastStage) this.previewBoss(lastStage.stage);
    this.checkMergeReady();
    if (ended) this.showGameOver();
  }

  /**
   * 승급 가능한 묶음 수를 세고, 새로 승급할 수 있게 된 종류는 알림 (판당 처음 3번, UI.md 8장).
   * 한 프레임에 여러 종류가 한꺼번에 승급 가능해지면 알림 하나로 합친다 (알림이 쌓여 맵 위쪽 줄을 가리지 않게).
   */
  private checkMergeReady(): void {
    // 피드백 #63: 자동 승급이 맡는 무더기는 곧 승급되므로 [⏫ 모두 승급] 수·'승급 가능!' 알림·첫 승급 안내에서 뺀다 (버튼이 한 프레임씩 깜빡이지 않게)
    const groups = this.manualMergeGroups();
    this.mergeReadyCount = groups.length;
    this.sendAutoMerge();
    const now = new Set(groups.map((g) => g.tower));
    const fresh = groups.filter((g) => !this.mergeReadyKinds.has(g.tower));
    this.mergeReadyKinds = now;
    if (fresh.length === 0 || this.mergeReadyToasts >= MERGE_READY_TOASTS_PER_MATCH) return;
    // 첫 승급 안내가 뜰 때는 안내 카드가 같은 말을 한다 (F10)
    if (this.guide !== null || this.guideWillOpen()) return;
    this.mergeReadyToasts++;
    this.ctx.ui.toast(mergeReadyToast(fresh.map((g) => this.towerNames.get(g.tower) ?? g.tower)));
  }

  /** 타워 엔티티의 등급 번호 (rules.gradeRank, 없으면 0). */
  private towerGradeRank(id: number): number {
    const e = this.match.world.entities.get(id);
    const g = e && e.kind === 'tower' ? this.match.rules.towers.get(String(e.tower))?.grade : undefined;
    return g ? gradeRank(g) : 0;
  }

  /** 손으로 승급할 무더기 묶음: 승급 가능한 묶음 중 자동 승급(피드백 #63)이 맡지 않는 것 (자동 승급이 꺼져 있으면 전부). */
  private manualMergeGroups(): MergeGroup[] {
    const groups = mergeableStackGroups(this.match.ctx, this.match.world, LOCAL_PLAYER);
    const rank = autoMergeRank(this.ctx.settings.get());
    if (rank <= 0) return groups;
    return groups.filter((g) => this.towerGradeRank(g.first.id) > rank);
  }

  /**
   * 자동 승급 (피드백 #63, 일시정지 메뉴 '자동 승급'): 기준 등급 이하의 가득 찬 무더기(바닥 ID 순 첫째)에 평소 mergeStack 명령 —
   * sim 규칙·명령 종류는 그대로라 리플레이에 그대로 남고 연쇄도 손으로 누른 승급과 같다. 앞 명령이 실행된 다음 틱에 다음 무더기.
   * 일시정지·판 끝·타워를 끄는 중·이동 모드에서는 보내지 않는다 (손가락 아래 타워가 사라지지 않게).
   */
  private sendAutoMerge(): void {
    const rank = autoMergeRank(this.ctx.settings.get());
    if (rank <= 0 || this.paused || this.gameOver || this.press?.dragging || this.moveMode) return;
    if (this.autoMergeQueuedTick === this.match.tick) return;
    const st = autoMergeStacks(this.match.ctx, this.match.world, LOCAL_PLAYER, rank)[0];
    const bottom = st?.[0];
    if (!bottom) return;
    if (this.match.world.enqueue({ type: 'mergeStack', x: bottom.tx, y: bottom.ty }).ok) this.autoMergeQueuedTick = this.match.tick;
  }

  /** 화면 흔들림을 써도 되는가: 연출 끄기(T-2)가 아니고 일시정지 메뉴 '화면 흔들림'이 켜짐(A-1, 기본 = 동작 줄이기가 아니면 켜짐). */
  private shakeOn(): boolean {
    return !effectsOff() && this.ctx.screenShake.enabled;
  }

  /** 화면 흔들림 — 연출 끄기(T-2)·화면 흔들림 끔(A-1)이면 흔들지 않는다. */
  private shake(ms: number, intensity: number): void {
    if (this.shakeOn()) this.cameras.main.shake(ms, intensity);
  }

  /** 광역 폭발 색: 쏜 타워의 피해 종류 (물리 주황 · 마법 하늘 · 고정 노랑). 타워가 없으면 주황. */
  private areaColor(towerEntityId: number): number {
    const t = this.match.world.entities.get(towerEntityId);
    const type = t && t.kind === 'tower' ? this.match.rules.towers.get(String(t.tower))?.damageType : undefined;
    return type === 'magic' || type === 'hybrid' ? 0x8fd3ff : type === 'true' ? 0xffe066 : 0xffa94d;
  }

  /**
   * 보스 예고 (F10-2): 다음 단계가 보스 단계면 그 단계가 시작될 때 '⚠ 다음 단계 보스: 박쥐 여왕' + 대응 한 줄 배너.
   * 글자 알림이라 연출 끄기여도 띄운다 (배너 등장 애니메이션만 .fx-off가 끈다). 판마다 단계당 한 번.
   */
  private previewBoss(stage: number): void {
    const { mode, theme } = this.match.state;
    const next = bossForStage(this.match.rules, mode, theme, stage + 1);
    if (!next || this.bossPreviewStage === stage + 1) return;
    this.bossPreviewStage = stage + 1;
    this.ctx.ui.banner(bossPreviewText(next.name), bossCounterTip(next.counter), BOSS_PREVIEW_MS, 'boss');
  }

  /** 보스 제한 시간 패배 때 패배 화면에 쓸 보스 정보 (이름·남은 체력·제한 초·대응). 보스가 없으면 null. */
  private defeatBossInfo(): DefeatBossInfo | null {
    const m = this.match;
    const live = bossHudInput(m.rules, this.legionNames, m.state, m.mobs(), m.tick);
    const b = m.rules.bosses.get(m.state.bossId);
    if (!live || !b) return null;
    return { name: b.name, hp: live.hp, maxHp: live.maxHp, seconds: Math.round(m.rules.bossTimeTicks / TICK_HZ), counter: b.counter };
  }

  private showGameOver(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.cancelPress(this.time.now);
    this.groundPress = null;
    this.moveMode = null;
    this.closeConvertPicker();
    this.closePanel();
    this.closeChoice();
    this.closeSheet();
    // 알림 층은 패배 화면보다 위라, 남아 있는 배너·알림이 '패배' 제목을 가렸다 (검토 반영)
    this.ctx.ui.clearToasts();
    if (this.paused) this.paused = false;
    this.clock.speed = 0;
    // 패배 또는 캠페인 클리어 (V2 L5) — 화면·정산은 같고 제목·사유만 다르다
    const text = gameEndText(this.match.state, this.match.victory ? null : this.defeatBossInfo());
    // 전투 기록 (A-1, 일반 무한 판만) + 끝난 판의 자동 저장 지우기
    const best = this.ctx.records.complete(this.match, this.runId);
    // G-3 판 정산 (경험치·골드·영웅 카드·리미티드 조각·최고 웨이브) — 같은 판은 한 번만
    const settled = this.ctx.progress?.settle(matchResultOf(this.match, this.runId)) ?? null;
    if (this.saveToken !== null) this.ctx.saves.clear(this.saveToken);
    this.saveToken = null;
    // 개발자 모드: 이번 판 기록을 패배 화면에도 보이고 '지난 판'에 남긴다 (F10-4 검토, 결정 6 — 패배 화면이 🛠를 덮음)
    const log = this.ctx.debug ? this.runLogRows : undefined;
    this.savePastRun(text.victory ? '클리어' : '패배');
    this.ctx.ui.show(
      'screen',
      createGameOverScreen({
        ...text,
        record: best?.newBest ? `${text.record} · 🏆 새 최고 기록` : text.record,
        log,
        rewards: settled && this.ctx.progress ? settlementView(settled, this.ctx.data, this.ctx.progress.state, this.ctx.progress.pd) : undefined,
        onRetry: () => this.scene.restart({ ...this.sceneData, seed: this.ctx.seed ?? randomSeed() }),
        onExit: () => this.scene.start(SCENE_BOOT),
      }),
    );
    this.game.events.emit('rtd:game-over', { stage: this.match.state.stage, reason: this.match.state.defeatReason, victory: text.victory });
  }

  /** 일시정지 메뉴 열기: 게임 시간을 멈춘다 (배속 0). */
  private pause(): void {
    if (this.paused || this.gameOver) return;
    this.paused = true;
    this.cancelPress(this.time.now);
    this.resumeSpeed = this.clock.speed;
    this.clock.speed = 0;
    this.ctx.ui.clearToasts();
    const saved = this.saveMatch();
    this.ctx.ui.show(
      'screen',
      createPauseMenu({
        onResume: () => this.resume(),
        onExit: () => this.scene.start(SCENE_BOOT),
        saved,
        effectVolume: this.ctx.audio.volume,
        onEffectVolume: (v) => {
          this.ctx.audio.volume = v;
        },
        onPreviewAudio: () => {
          this.ctx.audio.unlock();
          this.ctx.audio.play('merge');
        },
        screenShake: this.ctx.screenShake.enabled,
        onScreenShake: (on) => {
          this.ctx.screenShake.enabled = on;
          if (!on) this.cameras.main.shakeEffect.reset();
        },
        tapMerge: this.ctx.settings.get().tapMerge,
        onTapMerge: (on) => this.ctx.settings.set('tapMerge', on),
        ultAuto: this.ctx.settings.get().ultAuto,
        onUltAuto: (on) => this.ctx.settings.set('ultAuto', on),
        autoSellNormal: this.ctx.settings.get().autoSellNormal,
        onAutoSellNormal: (on) => this.ctx.settings.set('autoSellNormal', on),
        autoSellRare: this.ctx.settings.get().autoSellRare,
        onAutoSellRare: (on) => this.ctx.settings.set('autoSellRare', on),
        autoMerge: (['normal', 'rare', 'unique'] as const)[autoMergeRank(this.ctx.settings.get()) - 1] ?? null,
        onAutoMerge: (grade: AutoMergeGrade | null) => {
          const c = autoMergeChoice(grade);
          for (const k of AUTO_MERGE_KEYS) this.ctx.settings.set(k, c[k]);
        },
        // 도움말 다시 보기 (F10): 계정 기록을 지우고 이 판에서도 다시 띄울 수 있게
        onHelpAgain: () => {
          this.ctx.account.resetGuides();
          this.guideDone = false;
        },
        // FB-1: 💬 피드백 보내기 — 일시정지 중이라 틱이 멈춰 있다 (판 기록 = 지금 틱까지, 첨부 기본 켜짐)
        feedback: createSceneFeedback(this.ctx, () => matchFeedbackSnapshot(this.ctx, this.match, this.resumeSpeed > 0 ? this.resumeSpeed : 1, this.resumed), true),
        // 피드백 #24: 📘 등급·조합 설명 (조합식은 [리미티드] 도감과 같은 공개 규칙)
        gradeGuide: createGradeGuideDialog(() =>
          gradeGuideModel({ baseDps: this.ctx.data.towers.baseDps, mergeCount: this.match.rules.mergeCount, godChanceBp: this.match.rules.godChanceBp, codex: this.codexModel() }),
        ),
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

  /**
   * 일꾼 고용 버튼: 미리 검사해 안 되면 바로 알림, 되면 명령 (sim이 실행 틱에 다시 검사).
   * 피드백 #66: 꾹 누르기가 되풀이해 부른다 — 명령을 보냈거나 앞 명령을 기다리면 true, 안 되면(돈·최대·일시정지) false = 멈춤.
   */
  private hire(): boolean {
    if (this.paused || this.gameOver) return false;
    // 피드백 #66 꾹 누르기: 앞 고용 명령이 아직 실행 전(같은 틱)이면 이번은 건너뛰고 계속 — 돈·인원 검사가 앞 고용을 빼고 하지 않게
    if (this.hireQueuedTick === this.match.tick) return true;
    const fail = hireCheck(this.match.ctx);
    if (fail) {
      const text = hireFailText(fail, this.match.rules.workerCost, this.match.state.gold, this.match.rules.workerMax);
      if (text) this.ctx.ui.toast(text);
      return false;
    }
    if (!this.match.world.enqueue({ type: 'hireWorker' }).ok) return false;
    this.hireQueuedTick = this.match.tick;
    return true;
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
    this.choice = createChoicePanel(model, onPick, {
      pillHost: this.hud.choiceSlot,
      onExpand: () => {
        this.closePanel();
        this.closeSheet();
      },
    });
    this.ctx.ui.show('modal', this.choice);
    // 메뉴 시트를 쓰는 중이면 (길게 눌러 강화 등) 창은 알약으로 접어 둔다 — 시트를 닫으면 아래 띠에 알약이 보인다
    if (this.sheet) this.choice.collapse();
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

  // ---------------------------------------------------------------- F10 첫 10단계 개선

  /** [▶ 준비 완료]: 준비 단계에서만 readyNow 명령 (sim이 실행 틱에 다시 검사 — 연타해도 1단계는 한 번). */
  private sendReady(): void {
    if (this.paused || this.gameOver || this.readySent) return;
    const st = this.match.state;
    if (st.phase !== 'playing' || st.stage !== 0) return;
    if (this.match.world.enqueue({ type: 'readyNow' }).ok) this.readySent = true;
  }

  /** 이번 프레임 안내: [▶ 준비 완료] 상태, 첫 승급 안내, 추천 칸·승급 미리 보기·보유 2/3 배지 그리기. */
  private updateGuide(timeMs: number): void {
    const { state } = this.match;
    const mine = this.match.towers().filter((t) => t.owner === LOCAL_PLAYER);
    if (state.stage !== 0) this.readySent = false;
    if (this.startHintFrames > 0 && --this.startHintFrames === 0 && showRecommended(state.phase, state.summons, mine.length)) {
      // 첫 소환 또는 1단계 시작까지 남긴다 (F10-4 검토: 2.6초는 판 시작의 느린 프레임 동안 지나가 버려 휴대폰에서 못 볼 수 있었다).
      // 지우기는 사건 처리(소환·단계 시작)와 장면 종료가 한다 — 시간은 안전 상한일 뿐 (준비 60초 + 여유)
      this.startHintEl = this.ctx.ui.toast('빛나는 칸을 눌러 소환해요', START_HINT_MAX_MS);
    }
    // 추천 칸이 꺼지면(첫 타워가 생김 — 소환이든 개발자 배치든) 안내 글자도 지운다
    if (this.startHintEl && !showRecommended(state.phase, state.summons, mine.length)) {
      this.startHintEl.remove();
      this.startHintEl = null;
    }
    const ready = this.gameOver || this.paused ? 'hidden' : readyButtonState(state.phase, state.stage, mine.length, this.readySent);
    this.hud.setReady(ready);
    this.syncMergeGuide();
    const preview = this.mergePreviewView();
    const recommended = showRecommended(state.phase, state.summons, mine.length)
      ? rankSummonTiles(this.match.ctx, this.match.world, this.ctx.data.game.guide.recommendCount)
      : [];
    const rules = this.match.rules;
    const badges = pairBadges(mine, LOCAL_PLAYER, rules.mergeCount, (id) => {
      const g = rules.towers.get(id)?.grade;
      return g !== undefined && canMergeGrade(g);
    });
    this.guideFrame = { recommended, preview, badges: badges.length, ready };
    this.guideLayer.draw({ recommended, preview, badges, still: effectsOff() }, timeMs);
  }

  /** 승급 미리 보기 칸: 승급할 수 있는 타워의 패널이 열려 있으면 그 타워가 결과 칸, 아니면 첫 승급 안내의 결과 칸. */
  private mergePreviewView(): ReturnType<typeof mergePreview> {
    if (this.press?.dragging || this.moveMode) return null;
    const world = this.match.world;
    let anchor: Tower | null = null;
    const sel = this.panel ? this.selectedTower() : null;
    if (sel && sel.owner === LOCAL_PLAYER && stackMergeCheck(this.match.ctx, world, LOCAL_PLAYER, sel.tx, sel.ty).ok) anchor = sel;
    if (!anchor && this.guide) {
      const e = world.entities.get(this.guide.anchorId);
      anchor = e && e.kind === 'tower' ? (e as Tower) : null;
    }
    if (!anchor) return null;
    // G-1 칸 무더기: 결과·재료 = 그 칸 무더기 (바닥 = 결과 자리, 나머지 둘 = 재료)
    const stack = towersAt(world, anchor.tx, anchor.ty);
    if (stack.length < this.match.rules.mergeCount) return null;
    return mergePreview(stack, stack[0] as Tower, this.match.rules.mergeCount);
  }

  /** 첫 승급 안내를 지금 띄울 차례인가 (계정에서 아직 안 봤고, 이 판에서 끝내지 않았고, 승급 가능한 묶음이 있음). */
  private guideWillOpen(): boolean {
    if (this.guide || this.guideDone || this.gameOver || this.ctx.account.guideSeen(GUIDE_FIRST_MERGE)) return false;
    // 피드백 #63: 자동 승급이 맡는 무더기는 곧 승급되므로 안내하지 않는다 (안내는 기록 없이 다음 기회로)
    return this.manualMergeGroups().length > 0;
  }

  /**
   * 첫 승급 안내 (계정마다 한 번): 처음 승급할 수 있게 되면 가장 먼저 소환된 타워가 있는 묶음을 골라 결과 칸(그 타워)·재료 두 칸·
   * 맵 오른쪽 위 [⏫ 모두 승급] 버튼(피드백 #65)을 강조하고 카드를 띄운다. 묶음이 사라지면(판매 등) 기록 없이 닫고, 승급하거나 ✕를 누르면 기록하고 닫는다.
   */
  private syncMergeGuide(): void {
    if (this.gameOver) {
      if (this.guide) this.endGuide(false);
      return;
    }
    const g = this.guide;
    const world = this.match.world;
    if (g) {
      // G-1 칸 무더기: 안내하는 종류의 가득 찬 무더기가 없어지면 닫는다. 안내 칸 = 무더기 바닥 타워
      const stacks = fullStacks(this.match.ctx, world, LOCAL_PLAYER, g.kind);
      if (stacks.length === 0) {
        this.endGuide(false);
        return;
      }
      if (!stacks.some((st) => st[0]!.id === g.anchorId)) g.anchorId = stacks[0]![0]!.id;
      // 패널로 다른 가득 찬 무더기를 고르면 안내가 그 무더기로 (F10-4 검토)
      const sel = this.panel ? this.selectedTower() : null;
      if (sel && sel.owner === LOCAL_PLAYER) {
        const st = stackMergeCheck(this.match.ctx, world, LOCAL_PLAYER, sel.tx, sel.ty);
        if (st.ok && st.stack[0]!.id !== g.anchorId) {
          g.kind = sel.tower;
          g.anchorId = st.stack[0]!.id;
        }
      }
      this.updateGuideCard();
      return;
    }
    if (!this.guideWillOpen()) return;
    const first = this.manualMergeGroups()[0];
    if (!first) return;
    this.guide = { kind: first.tower, anchorId: first.first.id, step: 1 };
    this.guideCard = createGuideCard({
      onNext: () => {
        if (this.guide) this.guide.step = 2;
        this.updateGuideCard();
      },
      onClose: () => this.endGuide(true),
    });
    this.ctx.ui.show('guide', this.guideCard);
    this.hud.setMergeGuide(true);
    this.updateGuideCard();
  }

  private updateGuideCard(): void {
    const g = this.guide;
    if (!g || !this.guideCard) return;
    const name = this.towerNames.get(g.kind) ?? g.kind;
    const text = mergeGuideText(g.step, name, this.ctx.settings.get().tapMerge);
    // 강조한 칸이 맵 아래쪽이면 카드는 위에 (칸을 가리지 않게)
    const p = this.mergePreviewView();
    const rows = p ? [p.result.ty, ...p.materials.map((m) => m.ty)] : [];
    const avg = rows.length > 0 ? rows.reduce((a, b) => a + b, 0) / rows.length : 0;
    let side: 'top' | 'bottom' = avg >= this.match.map.height / 2 ? 'top' : 'bottom';
    // 실제 화면 위치로 다시: 카드가 강조 칸(결과·재료, 머리 포함)을 덜 덮는 쪽 (F10-4 검토)
    const w = this.ctx.ui.el.clientWidth;
    const cardH = this.guideCard.el.offsetHeight;
    const dockTop = this.hud.bottomTop();
    if (p && w > 0 && cardH > 0 && dockTop > 0) {
      const L = this.layout;
      const cells = [p.result, ...p.materials].map((c) => {
        const y = tileCenterPx(L, c.tx, c.ty).y;
        return { top: gameToCssPx(y - L.tile * 1.1, w), bottom: gameToCssPx(y + L.tile * 0.5, w) };
      });
      const gap = w * 0.02;
      side = guideCardSide(cells, { top: this.panelTopCss, bottom: this.panelTopCss + cardH }, { top: dockTop - gap - cardH, bottom: dockTop - gap }, side);
    }
    if (this.panel) side = this.panelSide === 'top' ? 'bottom' : 'top';
    this.guideCard.update({ ...text, step: g.step, steps: 2, side });
  }

  /** 첫 승급 안내 닫기. seen = 계정에 '봤음' 기록 (승급했거나 ✕) — 다음 판부터 안 뜬다 ([도움말 다시 보기]로 다시). */
  private endGuide(seen: boolean): void {
    this.guide = null;
    this.guideCard = null;
    this.ctx.ui.clear('guide');
    this.hud?.setMergeGuide(false);
    if (seen) {
      this.ctx.account.markGuide(GUIDE_FIRST_MERGE);
      this.guideDone = true;
    }
  }

  /** E2E (F10): 추천 칸 · 승급 미리 보기(결과·재료 칸) · 보유 2/3 배지 수 · [준비 완료] 상태 · 첫 승급 안내 */
  get guideState(): {
    recommended: (readonly [number, number])[];
    preview: ReturnType<typeof mergePreview>;
    badges: number;
    ready: ReadyState;
    guide: { kind: string; anchorId: number; step: number } | null;
    resultToasts: number;
  } {
    return { ...this.guideFrame, guide: this.guide ? { ...this.guide } : null, resultToasts: this.resultToastsShown };
  }

  /** E2E·개발자 도구: 이번 판 기록 */
  get runLogRows(): { label: string; value: string }[] {
    return runLogRows(this.runLog, this.match.tick, this.match.state.stage);
  }

  /** 개발자 모드: 이번 판 기록을 '지난 판'(최근 3판, 세션)에 한 번 남긴다 — 소환을 한 판만 (그냥 들어왔다 나간 판은 빼고). */
  private savePastRun(how: '패배' | '나감' | '클리어'): void {
    if (!this.ctx.debug || this.runLogSaved || !this.match || this.runLog.firstSummonTick === null) return;
    this.runLogSaved = true;
    const st = this.match.state;
    const where = st.stage <= 0 ? '준비 단계' : `${st.stage}단계`;
    const why = how === '패배' && st.defeatReason === 'bossTime' ? ' · 보스 시간 초과' : '';
    pushPastRun({ title: `${where} ${how}${why} · 시드 ${this.match.world.seed}`, rows: this.runLogRows });
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
          // G-1 사용자 결정: 🗼 = 내 타워 인원 / 인원 한도 (game.json board.unitCap + 카드)
          towerCount: unitCount(this.match.world, LOCAL_PLAYER),
          buildableCount: unitCap(this.match.ctx, LOCAL_PLAYER),
          summonCost: summonCost(this.match.ctx, LOCAL_PLAYER),
          mergeReady: this.mergeReadyCount,
          workerMax: this.match.rules.workerMax,
          workerCost: this.match.rules.workerCost,
          boss: bossHudInput(this.match.rules, this.legionNames, this.match.state, this.match.mobs(), this.match.tick),
          challenge: challengeHudInput(this.match.ctx, this.match.mobs(), this.match.tick),
          menu: menuBadges(this.match.ctx, this.match.tick, LOCAL_PLAYER),
        },
        this.ctx.data.game.hud,
      ),
    );
  }

  // ---------------------------------------------------------------- M5 바텀 시트

  /** 하단 메뉴: 같은 메뉴면 닫고, 다른 메뉴면 그 시트로 바꾼다. */
  private toggleSheet(kind: SheetKind): void {
    if (this.paused || this.gameOver) return;
    if (this.sheetKind === kind) this.closeSheet();
    else this.openSheet(kind);
  }

  private openSheet(kind: SheetKind): void {
    this.closeSheet();
    this.closeConvertPicker();
    this.moveMode = null;
    // 바텀 시트는 하나만: 정보 패널은 닫고 펼친 고르기 창은 알약으로
    this.closePanel();
    if (this.choice && !this.choice.collapsed) this.choice.collapse();
    const ctx = this.match.ctx;
    const close = (): void => this.closeSheet();
    let view: ChallengeSheetView | UpgradeSheetView | MissionSheetView | DevSheetView | GambleSheetView | SummonSheetView | MythicSheetView;
    if (kind === 'gamble') {
      // G-1 사용자 결정: [🎰 도박] 시트 = 돈 도박 + 소환 도박 4종(천장) 두 탭
      view = createGambleSheet(
        {
          onGamble: (t) => this.playGamble(t),
          onClose: close,
          tab: this.gambleTab,
          onTab: (t) => {
            this.gambleTab = t;
          },
          summon: {
            opts: {
              onSummon: () => this.autoSummonOnce() !== 'stop',
              onGacha: (k) => this.playGacha(k),
              onFaction: (f) => {
                this.gachaFaction = f;
              },
            },
            first: this.summonModel(),
          },
        },
        gambleSheetModel(ctx, this.match.world, LOCAL_PLAYER),
      );
    } else if (kind === 'summon') {
      view = createSummonSheet(
        {
          onSummon: () => this.autoSummonOnce() !== 'stop',
          onGacha: (k) => this.playGacha(k),
          onFaction: (f) => {
            this.gachaFaction = f;
          },
          onClose: close,
        },
        this.summonModel(),
      );
    } else if (kind === 'mythic') {
      view = createMythicSheet({ onCraft: (r) => this.sendCraft(r), onClose: close, portrait: (id) => this.portraitOf(id) }, this.codexModel());
    } else if (kind === 'dev') {
      const settings = this.ctx.settings;
      view = createDevSheet(
        {
          onClose: close,
          onTab: (t) => {
            this.devTab = t;
          },
          tab: this.devTab,
          effectsOff: effectsOff(),
          revealHidden: settings.get().revealHidden,
          onEffects: (off) => {
            setEffectsOff(off);
            settings.set('effectsOff', off);
          },
          onRevealHidden: (on) => settings.set('revealHidden', on),
          onChance: (key, dir) => this.stepChance(key, dir),
          onResetChances: () => {
            if (this.match.state.chanceOv) this.match.world.enqueue({ type: 'debugSetChance', key: 'all', bp: -1 });
          },
          portrait: (id) => this.portraitOf(id),
        },
        devChanceModel(ctx, this.ctx.data.game.devChances.list),
        this.recipeRows(),
      );
    } else if (kind === 'challenge') {
      view = createChallengeSheet(
        { onStart: (lv) => this.startChallenge(lv), onClose: close, portrait: (id) => this.challengePortrait(id) },
        challengeSheetModel(ctx, this.match.tick, this.challengeAbilities),
      );
    } else if (kind === 'upgrade') {
      view = createUpgradeSheet(
        {
          onUpgrade: (k) => this.buyUpgrade(k),
          onClose: close,
          onTab: (t) => {
            this.upgradeTab = t;
          },
          tab: this.upgradeTab,
          gradeOf: (k) => this.match.rules.upgrades[k]?.grades[0] ?? null,
        },
        upgradeSheetModel(ctx, LOCAL_PLAYER),
      );
    } else {
      view = createMissionSheet(
        {
          onClaim: (i) => this.claimMission(i),
          onClaimAll: () => this.claimAllMissions(),
          onClose: close,
          onTab: (t) => {
            this.missionTab = t;
          },
          tab: this.missionTab,
          tabLabels: missionTabLabels(this.match.rules),
        },
        missionSheetModel(ctx, this.match.world, this.ctx.account.hiddenFound(), this.revealHidden()),
      );
    }
    this.sheet = view;
    this.sheetKind = kind;
    this.ctx.ui.show('sheet', view);
    this.hud.setMenuActive(kind);
    this.refreshSheet(this.time.now);
  }

  private closeSheet(): void {
    if (!this.sheet) return;
    this.sheet = null;
    this.sheetKind = null;
    this.ctx.ui.clear('sheet');
    this.hud?.setMenuActive(null);
    this.ctx.ui.setToastLow(false);
  }

  /** 개발자 도구 '히든 미션 조건 보기' (개발자 모드에서만 효과) */
  private revealHidden(): boolean {
    return this.ctx.debug && this.ctx.settings.get().revealHidden;
  }

  /** 히든 조합 12종 (판 위 내 타워·지금 덱 표시) — 개발자 도구. */
  private recipeRows(): ReturnType<typeof hiddenRecipeRows> {
    const owned = new Set(this.match.towers().filter((t) => t.owner === LOCAL_PLAYER).map((t) => t.tower));
    return hiddenRecipeRows(this.ctx.data.towers.towers, owned, this.match.ctx.decks[LOCAL_PLAYER] ?? this.match.rules.baseDeck);
  }

  /** 확률 조정 ± 한 번 (개발자): 앞 명령이 아직 실행 전이면 기다림(true), 끝에 닿으면 false (꾹 누르기 멈춤). */
  private stepChance(key: string, dir: 1 | -1): boolean {
    if (this.paused || this.gameOver || !this.ctx.debug) return false;
    if (this.chanceQueuedTick === this.match.tick) return true;
    const next = nextChanceBp(this.match.ctx, key, dir);
    if (next === null) return false;
    if (!this.match.world.enqueue({ type: 'debugSetChance', key, bp: next }).ok) return false;
    this.chanceQueuedTick = this.match.tick;
    return true;
  }

  /** 열린 시트 글자 갱신 (매 프레임, 바뀐 것만 DOM에 쓴다) + 도박 슬롯 연출. */
  private refreshSheet(nowMs: number): void {
    const slotView = this.advanceSlots(nowMs);
    const view = this.sheet;
    // 시트를 85%로 펼친 동안 알림은 시트 아래쪽으로 (머리줄·탭을 덮지 않게, M5 검토 반영)
    this.ctx.ui.setToastLow(view !== null && view.size === 'full');
    if (!view) return;
    const ctx = this.match.ctx;
    if (this.sheetKind === 'challenge') (view as ChallengeSheetView).update(challengeSheetModel(ctx, this.match.tick, this.challengeAbilities));
    else if (this.sheetKind === 'upgrade') (view as UpgradeSheetView).update(upgradeSheetModel(ctx, LOCAL_PLAYER));
    else if (this.sheetKind === 'gamble') (view as GambleSheetView).update(gambleSheetModel(ctx, this.match.world, LOCAL_PLAYER), slotView, this.summonModel(), this.gachaResult);
    else if (this.sheetKind === 'summon') (view as SummonSheetView).update(this.summonModel(), this.gachaResult);
    else if (this.sheetKind === 'mythic') (view as MythicSheetView).update(this.codexModel());
    else if (this.sheetKind === 'mission') {
      (view as MissionSheetView).update(missionSheetModel(ctx, this.match.world, this.ctx.account.hiddenFound(), this.revealHidden()));
    } else if (this.sheetKind === 'dev') (view as DevSheetView).update(devChanceModel(ctx, this.ctx.data.game.devChances.list), this.recipeRows(), this.runLogRows, pastRuns());
  }

  /** 도박 슬롯 (테이블마다): 1초 돌고 결과에서 멈춤 (연출 끄기면 바로). 처음 멈춘 프레임에 '+n원'·대박 알림. */
  private advanceSlots(nowMs: number): Map<number, GambleSlotView> {
    const out = new Map<number, GambleSlotView>();
    if (this.slots.size === 0) return out;
    const symbols = this.match.rules.gambleOutcomes.map((o) => mulText(o.mulBp));
    for (const [t, s] of this.slots) {
      if (effectsOff()) s.spinMs = 0;
      const frame = slotFrame(s, nowMs, symbols);
      const r = s.result;
      if (frame.justRevealed && r) {
        s.revealedMs = nowMs;
        if (r.win > 0) this.hud.gainGold(r.win);
        if (r.mulBp >= this.match.rules.gambleBigMulBp) {
          this.ctx.ui.banner(gambleJackpotText(r.mul, r.win), null, 2200, 'gold');
          this.shake(260, 0.006);
          this.noteFx('gambleJackpot');
        }
      }
      out.set(t, { ...frame, result: r ? gambleResultText(r.mul, r.win, r.cost) : '' });
    }
    return out;
  }

  /** 강화 버튼 (길게 누르면 연속): 미리 검사해 안 되면 알림 후 멈춤, 되면 명령. 앞 명령이 아직 실행 전이면 이번은 건너뛴다. */
  private buyUpgrade(k: number): boolean {
    if (this.paused || this.gameOver) return false;
    if (this.upgradeQueuedTick === this.match.tick) return true;
    const fail = upgradeCheck(this.match.ctx, LOCAL_PLAYER, k);
    if (fail) {
      this.toastUpgradeFail(fail, k);
      return false;
    }
    if (!this.match.world.enqueue({ type: 'upgrade', k }).ok) return false;
    this.upgradeQueuedTick = this.match.tick;
    return true;
  }

  private toastUpgradeFail(reason: string, k: number): void {
    const u = this.match.rules.upgrades[k];
    const cost = u ? (upgradeCost(this.match.rules, u, upgradeLevel(this.match.state, LOCAL_PLAYER, k)) ?? 0) : 0;
    const text = upgradeFailText(reason, cost - this.match.state.gold);
    if (text) this.ctx.ui.toast(text);
  }

  /**
   * 도박 테이블 (T-2: 테이블마다 따로 — 다른 테이블이 돌아도 된다). 그 테이블 릴이 아직 돌면 'wait'
   * (꾹 누르기는 릴이 멈출 때까지 기다렸다 다음 판, 연출 끄기면 GAMBLE_FAST_MS마다). 안 되면 알림 + 'stop', 되면 명령 + 릴 시작.
   */
  private playGamble(t: number): GambleFire {
    if (this.paused || this.gameOver) return 'stop';
    const now = this.time.now;
    const off = effectsOff();
    const prev = this.slots.get(t);
    if (prev) {
      if (!prev.result) return 'wait';
      if (now - prev.startMs < (off ? GAMBLE_FAST_MS : (prev.spinMs ?? SLOT_SPIN_MS))) return 'wait';
    }
    const fail = gambleCheck(this.match.ctx, LOCAL_PLAYER, t);
    if (fail) {
      const tb = this.match.rules.gambleTables[t];
      const text = gambleFailText(fail, (tb?.cost ?? 0) - this.match.state.gold, tb?.unlockLevel ?? 0);
      if (text) this.ctx.ui.toast(text);
      return 'stop';
    }
    if (!this.match.world.enqueue({ type: 'gamble', t }).ok) return 'stop';
    this.slots.set(t, { startMs: now, result: null, revealedMs: null, spinMs: off ? 0 : SLOT_SPIN_MS });
    return 'spun';
  }

  // ---------------------------------------------------------------- G-1 소환 도박 · 리미티드 · 필살기

  /** [소환] 시트 모델 */
  private summonModel(): SummonSheetModel {
    const t = this.ctx.data.towers;
    const factions = this.match.rules.factionOrder.map((id) => ({ id, name: shortFactionName(t.factions[id]?.name ?? id), color: t.factions[id]?.color ?? '#888888' }));
    return summonSheetModel(this.match.ctx, this.match.world, LOCAL_PLAYER, factions, this.gachaFaction, this.ctx.data.game.summonGamble.kinds);
  }

  /** [리미티드] 도감 모델 */
  private codexModel(): CodexSheetModel {
    // G-3 계정 조각 수 → 잠긴 리미티드 줄 '🔒 해방 필요 (조각 n/20)'
    const progress = this.ctx.progress;
    const fragments = progress ? (id: string) => progress.fragmentsOf(id) : undefined;
    return codexSheetModel(this.match.ctx, this.match.world, LOCAL_PLAYER, this.ctx.data.towers.towers, this.ctx.account.codexFound(), fragments);
  }

  /** 소환 도박 버튼 (꾹 누르면 연속): 미리 검사해 안 되면 알림 후 멈춤, 되면 gacha 명령. */
  private playGacha(k: number): boolean {
    if (this.paused || this.gameOver) return false;
    if (this.gachaQueuedTick === this.match.tick) return true;
    const kind = this.match.rules.gachaKinds[k];
    if (!kind) return false;
    const f = kind.faction ? this.gachaFaction : 0;
    const fail = gachaCheck(this.match.ctx, this.match.world, LOCAL_PLAYER, k, f);
    if (fail) {
      const text = gachaFailText(fail, kind.cost - this.match.state.gold);
      if (text) this.ctx.ui.toast(text);
      return false;
    }
    if (!this.match.world.enqueue({ type: 'gacha', k, f }).ok) return false;
    this.gachaQueuedTick = this.match.tick;
    return true;
  }

  /** [제작]: 리미티드 조합 명령 */
  private sendCraft(r: number): void {
    if (this.paused || this.gameOver) return;
    const plan = craftPlan(this.match.ctx, this.match.world, LOCAL_PLAYER, r);
    if (!plan.ok) {
      const text = craftFailText(plan.reason);
      if (text) this.ctx.ui.toast(text);
      return;
    }
    this.match.world.enqueue({ type: 'craft', r });
  }

  /** 필살기 발동 (HUD 목록·패널·자동). 같은 틱에 같은 타워는 한 번만. */
  private castUltOf(id: number): void {
    if (this.paused || this.gameOver) return;
    if (this.ultSent.get(id) === this.match.tick) return;
    if (ultCheck(this.match.ctx, this.match.world, LOCAL_PLAYER, id) !== null) return;
    if (this.match.world.enqueue({ type: 'ult', id }).ok) this.ultSent.set(id, this.match.tick);
  }

  /** 매 프레임: HUD 필살기 칩·목록, '필살기 자동'이면 찬 것을 바로 보낸다, 메뉴 배지, 리미티드 발견 기록. */
  private syncG1(): void {
    const ctx = this.match.ctx;
    const world = this.match.world;
    const ready = readyUlts(ctx, world, LOCAL_PLAYER);
    if (!this.paused && !this.gameOver && this.ctx.settings.get().ultAuto) for (const t of ready) this.castUltOf(t.id);
    this.hud.setMergeAll(mergeAllButton(this.mergeReadyCount));
    const kinds = this.ctx.data.game.ultimate.kinds;
    this.hud.setUlts(
      ready.map((t) => {
        const k = ultKindOf(ctx, t.tower) ?? 'nuke';
        return { id: t.id, name: this.towerNames.get(t.tower) ?? t.tower, icon: kinds[k].icon, ultName: kinds[k].name };
      }),
    );
    // 리미티드 발견 (사용자 규칙: 재료를 한꺼번에 가졌을 때). 치트를 쓸 수 있는 판은 계정에 남기지 않는다 (히든 미션과 같은 규칙)
    if (!this.match.state.debug && !this.match.state.debugUsed && this.match.tick % 10 === 0) {
      for (const id of newlyDiscovered(this.match.rules, ownedCounts(world, LOCAL_PLAYER), this.ctx.account.codexFound())) {
        if (this.ctx.account.recordCodex(id)) this.ctx.ui.toast(craftReadyText(this.towerNames.get(id) ?? id), 2600);
      }
    }
    if (this.match.tick % 5 === 0 || this.sheetKind === null) {
      const codex = this.codexModel();
      const pity = pityLeft(ctx, LOCAL_PLAYER, 0, this.match.rules.summonPityN);
      const g = this.match.state.gamble[LOCAL_PLAYER];
      this.hud.setG1Badges({
        mythic: codex.ready > 0 ? `${codex.ready} 제작` : codex.summary.replace('발견 ', ''),
        mythicAlert: codex.ready > 0,
        summon: pity <= 0 ? '레어 확정!' : `천장 ${pity}`,
        summonAlert: pity <= 0,
        gamble: `잭팟 ${Math.min(g?.gauge ?? 0, this.match.rules.jackpotGauge)}/${this.match.rules.jackpotGauge}`,
      });
    }
  }

  /** 도전 [시작]: 미리 검사해 안 되면 알림, 되면 명령. 시작해도 시트는 열어 둔다 (피드백 #10 '도전 눌러도 계속 도전창 뜨게') — 줄은 '진행 중'으로 바뀐다. */
  private startChallenge(lv: number): void {
    if (this.paused || this.gameOver) return;
    const fail = challengeCheck(this.match.ctx, lv, this.match.tick);
    if (fail) {
      const text = challengeStartFailText(fail);
      if (text) this.ctx.ui.toast(text);
      return;
    }
    this.match.world.enqueue({ type: 'startChallenge', lv });
  }

  private claimMission(i: number): void {
    if (this.paused || this.gameOver) return;
    if (claimCheck(this.match.ctx, i) !== null) return;
    this.match.world.enqueue({ type: 'claimMission', i });
  }

  private claimAllMissions(): void {
    if (this.paused || this.gameOver) return;
    if (missionsClaimable(this.match.state) === 0) return;
    this.match.world.enqueue({ type: 'claimAllMissions' });
  }

  /**
   * 도전 보스 그림 (몹 텍스처 → 이미지 주소, 종류마다 한 번). 게임 화면(MobSprite)과 같은 순서: 외형 데이터가 있으면 새 캐릭터 그림
   * (도전 9단계 '망령 기사' = 그림자 군단 대장과 같은 적), 없으면 예전 그림 — 시트 그림과 싸우는 적이 같아 보이게 (검토 반영).
   */
  private challengePortrait(mobId: string): string | null {
    if (!this.challengePics.has(mobId)) {
      let url: string | null = null;
      try {
        const c = this.ctx.data.enemies.challenges.find((x) => x.id === mobId);
        const legions = (this.ctx.data.enemies.hierarchy as { legions?: Record<string, { color?: string }> }).legions ?? {};
        const legion = hexToInt(legions[c?.legion ?? '']?.color ?? '#9B4DFF');
        const key = enemyCharacterTexture(this, mobId, legion)?.key ?? ensureMobTexture(this, mobId, legion);
        const b64 = this.textures.getBase64(key);
        url = typeof b64 === 'string' && b64.startsWith('data:') ? b64 : null;
      } catch {
        url = null;
      }
      this.challengePics.set(mobId, url);
    }
    return this.challengePics.get(mobId) ?? null;
  }

  /** E2E: 열린 바텀 시트 종류 (없으면 null)와 크기 */
  get sheetOpen(): SheetKind | null {
    return this.sheetKind;
  }

  get sheetSize(): string | null {
    return this.sheet ? this.sheet.size : null;
  }

  /** E2E (T-2): 이동 모드인가 · 빈 땅 꾹 눌러 연속 소환 중인가 · 변환 고르기 창이 열려 있는가 */
  get moveModeOn(): boolean {
    return this.moveMode !== null;
  }

  get groundAutoSummon(): boolean {
    return this.groundPress?.auto === true;
  }

  get convertPickerOpen(): boolean {
    return this.convertOpen;
  }
}
