/**
 * Boot 장면: DOM 타이틀을 띄우고 선택한 모드의 Game 장면을 시작한다.
 * [시작] → Game 장면 (무한 모드, 순환의 정원). ?debug=1 이면 [캠페인 1] → 테마 1 사거리 미로.
 */
import Phaser from 'phaser';
import minerArt from '../../art/portraits/miner.webp';
import goblinArt from '../../art/portraits/goblin.webp';
import archerArt from '../../art/portraits/archer.webp';
import apprenticeArt from '../../art/portraits/apprentice.webp';
import warriorArt from '../../art/portraits/warrior.webp';
import batQueenArt from '../../art/portraits/batqueen.webp';
import { createTitleScreen } from '../../ui/screens/TitleScreen';
import { SCENE_BOOT, SCENE_GAME } from '../config';
import type { GameContext } from '../context';
import type { MatchMode } from '../../sim/state';
import { formatStage } from '../../ui/hud/hudModel';
import { randomSeed, type GameSceneData } from './Game';

export class BootScene extends Phaser.Scene {
  constructor(private readonly ctx: GameContext) {
    super({ key: SCENE_BOOT });
  }

  preload(): void {
    // 재시작하거나 타이틀로 돌아올 때 이미 읽은 그림은 다시 올리지 않는다.
    const illustrations = {
      'art-tower-miner': minerArt,
      'art-tower-goblin': goblinArt,
      'art-tower-archer': archerArt,
      'art-tower-apprentice': apprenticeArt,
      'art-tower-warrior': warriorArt,
      'mob-batqueen': batQueenArt,
    };
    for (const [key, url] of Object.entries(illustrations)) {
      if (!this.textures.exists(key)) this.load.image(key, url);
    }
  }

  create(): void {
    const saved = this.ctx.debug ? null : this.ctx.saves.read();
    const record = this.ctx.debug ? null : this.ctx.records.read();
    const { bosses, challenges } = this.ctx.data.enemies;
    const bossNames = new Map(bosses.map(({ id, name }) => [id, name]));
    const clearedChallenges = (best: number) => challenges.filter(({ level }) => level <= best);
    this.ctx.ui.clear('hud');
    this.ctx.ui.show(
      'screen',
      createTitleScreen({
        version: `v${this.ctx.version}`,
        onStart: () => this.startGame('infinite'),
        saved: saved ? {
          stage: formatStage(saved.match.state),
          onResume: () => this.scene.start(SCENE_GAME, {
            seed: saved.match.world.seed,
            mode: saved.match.state.mode,
            theme: saved.match.state.theme,
            saved,
          } satisfies GameSceneData),
        } : undefined,
        records: record ? {
          bestStage: record.bestStage,
          bosses: bosses
            .filter(({ id }) => Object.hasOwn(record.bossClears, id))
            .map(({ id, name }) => ({ name, stage: record.bossClears[id]! }))
            .sort((a, b) => a.stage - b.stage),
          challenges: clearedChallenges(record.bestChallenge)
            .map(({ level, name }) => ({ name, stage: level })),
          recent: record.recent.map((run) => ({
            stage: run.stage,
            durationSeconds: run.durationSeconds,
            bosses: run.bossIds.map((id) => bossNames.get(id) ?? id),
            challenges: clearedChallenges(run.bestChallenge).map(({ name }) => name),
          })),
        } : undefined,
        onCampaign: this.ctx.debug ? () => this.startGame('campaign') : undefined,
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.ctx.ui.clear('screen'));
    this.game.events.emit('rtd:title-ready');
  }

  private startGame(mode: MatchMode): void {
    const data: GameSceneData = { seed: this.ctx.seed ?? randomSeed(), mode, theme: 1 };
    this.scene.start(SCENE_GAME, data);
  }
}
