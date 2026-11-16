/**
 * 보스 효과 카드 (DEV_PLAN M4-7, GDD 3.1, src/data/cards.json).
 *
 * - 보스(모든 조각)를 처치하면 플레이어마다 카드 3장 묶음을 받는다 (state.cardOffers, 먼저 받은 것부터 고른다).
 *   카드 1장마다 15% 확률로 희귀 카드, 한 묶음 안의 카드는 서로 다르다 (고를 등급이 다 떨어지면 다른 등급에서).
 *   난수는 **플레이어별 카드 흐름**(`p{n}.cards`)만 쓴다 → 카드 제시가 몹 등장·소환 순서를 바꾸지 않는다.
 * - `pickCard {i}` 명령: 그 플레이어의 가장 먼저 받은 묶음에서 i번째 카드를 고르고 효과를 바로 적용한다. 고를 때까지 시간은 흐른다
 *   (GDD 2.2 '팝업을 열어도 시간은 흐름'). 같은 판에서 같은 카드를 다시 고를 수 있다 (효과는 겹친다).
 *   잘못된 번호·받은 묶음 없음 → 'cardFail' { reason }.
 * - 효과 (cards.json effect.type):
 *   atkPct 그 플레이어 모든 타워 공격력 +20% (PlayerMods.atkPctBp) · goldPerBoss 즉시 500원 × 보스 번호 ·
 *   rareSummons 다음 소환 5회 레어 · workerMul 일꾼 수입 배율 +1 · quake 맵 위 몹(보스 제외, 드러난 몹) 지금 체력 −30% (내림, 죽지 않음) ·
 *   summonDiscount 소환 비용 −20원 (최소 50원) · mobSlow 몹(보스 제외) 이동속도 −15% (합 최대 −45%) · freeWorkers 일꾼 +2 (최대 무시) ·
 *   mergeChoice 다음 승급 3회는 결과 2개 중 선택 · twinSummon 30초 동안 소환하면 같은 타워 하나 더 · godMul 신 타워 확률 ×3 (다시 고르면 +2배) ·
 *   goldPct 모든 돈 획득 +25%.
 * - '몹'은 보스가 아닌 몹으로 읽었다 (ENEMIES.md가 하수인 = 몹, 대장 = 보스로 나눠 쓰고, 그래야 대지진 카드를 다음 보스용으로 아껴 두는 꼼수가 없다).
 */
import type { World } from '../World';
import { streamCards } from '../World';
import { BP_ONE, mulBp } from '../Fixed';
import { isMob, isRevealedAt } from '../entities/Mob';
import type { CardStats } from '../rules';
import type { MatchContext } from '../state';
import { rollChanceBp } from './Damage';
import { earnGold } from './Economy';
import { chanceValue } from '../chances';

/** 카드 고르기 실패 이유: 판이 끝남 / 받은 묶음 없음 / 없는 번호 */
export type CardFail = 'phase' | 'none' | 'index';

/** 카드 묶음 하나 뽑기 (카드 id 목록). 플레이어별 카드 흐름. */
export function rollOffer(ctx: MatchContext, world: World, player: number): string[] {
  const { rules } = ctx;
  const rng = world.rng(streamCards(player));
  const out: string[] = [];
  for (let k = 0; k < rules.cardOfferSize; k++) {
    // 희귀 확률: 데이터 값 (개발자 확률 조정 'cardRare'가 있으면 그 값, T-2)
    const rare = rollChanceBp(rng, chanceValue(rules, ctx.state, 'cardRare'));
    let pool = rules.cards.filter((c) => c.rare === rare && !out.includes(c.id));
    if (pool.length === 0) pool = rules.cards.filter((c) => !out.includes(c.id));
    if (pool.length === 0) break;
    out.push(rng.pick(pool).id);
  }
  return out;
}

/** 보스 처치: 플레이어마다 카드 묶음 하나씩 ('cardOffer' 사건). */
export function offerCards(ctx: MatchContext, world: World, bossNum: number): void {
  for (let p = 0; p < world.players; p++) {
    const cards = rollOffer(ctx, world, p);
    if (cards.length === 0) continue;
    ctx.state.cardOffers.push({ player: p, boss: bossNum, cards });
    world.emit('cardOffer', { player: p, boss: bossNum, cards: cards.join(',') });
  }
}

/** 그 플레이어가 지금 고를 카드 묶음 (없으면 undefined). */
export function currentOffer(ctx: MatchContext, player: number): MatchContext['state']['cardOffers'][number] | undefined {
  return ctx.state.cardOffers.find((o) => o.player === player);
}

/** 카드 효과 적용. */
export function applyCard(ctx: MatchContext, world: World, player: number, card: CardStats, bossNum: number): void {
  const { state } = ctx;
  const perks = state.perks[player];
  switch (card.type) {
    case 'atkPct': {
      const mods = state.mods[player];
      if (mods) mods.atkPctBp += card.value;
      break;
    }
    case 'goldPerBoss': {
      const got = earnGold(state, card.value * (bossNum > 0 ? bossNum : 1));
      world.emit('cardGold', { player, amount: got });
      break;
    }
    case 'rareSummons':
      if (perks) perks.rareSummons += card.value;
      break;
    case 'workerMul':
      state.workerMul += card.value;
      break;
    case 'quake': {
      let n = 0;
      for (const e of world.entities.list()) {
        if (!isMob(e) || e.boss || !isRevealedAt(e, world.tick)) continue;
        const cut = mulBp(e.hp, card.value);
        if (cut <= 0) continue;
        e.hp -= cut;
        n++;
      }
      world.emit('quake', { player, count: n });
      break;
    }
    case 'summonDiscount':
      state.summonDiscount += card.value;
      break;
    case 'mobSlow': {
      const v = state.mobSlowBp + card.value;
      state.mobSlowBp = v > card.limit ? card.limit : v;
      break;
    }
    case 'freeWorkers':
      state.workers += card.value;
      break;
    case 'mergeChoice':
      if (perks) perks.mergeChoices += card.value;
      break;
    case 'twinSummon':
      if (perks) {
        const until = world.tick + card.ticks;
        if (until > perks.twinUntil) perks.twinUntil = until;
      }
      break;
    case 'godMul':
      // 처음 ×value, 다시 고를 때마다 (value − 1)배씩 더한다 (×3 → ×5 → ×7)
      if (perks) perks.godMulBp += (card.value - 1) * BP_ONE;
      break;
    case 'goldPct':
      state.goldPctBp += card.value;
      break;
  }
}

/** pickCard 명령: 가장 먼저 받은 묶음의 i번째 카드. 성공하면 카드, 실패하면 null ('cardFail' 사건). */
export function pickCard(ctx: MatchContext, world: World, player: number, i: number): CardStats | null {
  const { state, rules } = ctx;
  const fail = (reason: CardFail): null => {
    world.emit('cardFail', { player, reason });
    return null;
  };
  if (state.phase !== 'playing') return fail('phase');
  const idx = state.cardOffers.findIndex((o) => o.player === player);
  if (idx < 0) return fail('none');
  const offer = state.cardOffers[idx] as (typeof state.cardOffers)[number];
  const id = offer.cards[i];
  const card = id === undefined ? undefined : rules.cardById.get(id);
  if (!card) return fail('index');
  state.cardOffers.splice(idx, 1);
  state.cardsPicked.push(card.id);
  applyCard(ctx, world, player, card, offer.boss);
  world.emit('cardPick', { player, card: card.id, boss: offer.boss });
  return card;
}
