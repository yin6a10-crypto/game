import { seedState } from './seedData';
import { GameState, HeroId, HiringRowKey, MissionId, PlayerId, PlayerState, Reputation } from './types';
import {
  applyHireCost,
  buildHiringResolutionOrder,
  canPlayerAffordRowOffer,
  getCurrentResolutionItem,
  isPriestUnavailableForPlayer,
} from './hiring';

export const createInitialState = (): GameState => {
  return structuredClone(seedState);
};

const PREPARATION_SLOT_COUNT = 5;
const MIN_REPUTATION: Reputation = -2;
const MAX_REPUTATION: Reputation = 2;

const clampReputation = (value: number): Reputation => {
  if (value < MIN_REPUTATION) return MIN_REPUTATION;
  if (value > MAX_REPUTATION) return MAX_REPUTATION;
  return value as Reputation;
};

const compressPreparationSlots = (slots: PlayerState['preparationSlots']): MissionId[] => {
  return slots.filter((missionId): missionId is MissionId => missionId !== null);
};

export const insertMissionIntoPreparationArea = (player: PlayerState, missionId: MissionId): PlayerState => {
  const compact = compressPreparationSlots(player.preparationSlots);
  const next: Array<MissionId | null> = [missionId, ...compact];
  const overflowed = next.length > PREPARATION_SLOT_COUNT;
  const nextSlots = next.slice(0, PREPARATION_SLOT_COUNT);

  while (nextSlots.length < PREPARATION_SLOT_COUNT) {
    nextSlots.push(null);
  }

  return {
    ...player,
    reputation: overflowed ? clampReputation(player.reputation - 1) : player.reputation,
    preparationSlots: nextSlots as PlayerState['preparationSlots'],
  };
};

export const shiftPreparationAreaAtRoundEnd = (player: PlayerState): PlayerState => {
  const shifted = [null, ...player.preparationSlots];
  const overflowed = shifted.length > PREPARATION_SLOT_COUNT;
  const nextSlots = shifted.slice(0, PREPARATION_SLOT_COUNT);

  return {
    ...player,
    reputation: overflowed ? clampReputation(player.reputation - 1) : player.reputation,
    preparationSlots: nextSlots as PlayerState['preparationSlots'],
  };
};

export const updateHiringExtraPay = (
  state: GameState,
  playerId: PlayerId,
  rowKey: HiringRowKey,
  delta: 1 | -1,
): GameState => {
  if (state.hiring.offersLocked) return state;

  return {
    ...state,
    players: state.players.map((player) => {
      if (player.id !== playerId) return player;
      const current = player.hiringBoardExtraPay[rowKey];
      const next = Math.max(0, current + delta);
      return {
        ...player,
        hiringBoardExtraPay: { ...player.hiringBoardExtraPay, [rowKey]: next },
      };
    }),
  };
};

export const lockOffersAndStartHiring = (state: GameState): GameState => {
  if (state.hiring.offersLocked) return state;

  const resolutionOrder = buildHiringResolutionOrder(state);
  return {
    ...state,
    hiring: {
      offersLocked: true,
      resolutionOrder,
    },
  };
};

const removeHeroFromPublicLocations = (player: PlayerState, heroId: HeroId): PlayerState => {
  return {
    ...player,
    restZoneHeroIds: player.restZoneHeroIds.filter((id) => id !== heroId),
  };
};

const markCurrentResolutionAdvanced = (state: GameState): GameState => {
  const currentItem = getCurrentResolutionItem(state);
  if (!currentItem) return state;

  return {
    ...state,
    hiring: {
      ...state.hiring,
      resolutionOrder: state.hiring.resolutionOrder.map((item) => {
        if (item.heroId !== currentItem.heroId || item.resolved) return item;

        const nextIndex = item.currentPriorityIndex + 1;
        if (nextIndex >= item.priorityPlayerIds.length) {
          return { ...item, currentPriorityIndex: nextIndex, resolved: true };
        }

        return { ...item, currentPriorityIndex: nextIndex };
      }),
    },
  };
};

export const passOnCurrentHire = (state: GameState, playerId: PlayerId): GameState => {
  const currentItem = getCurrentResolutionItem(state);
  if (!currentItem) return state;

  const activePlayerId = currentItem.priorityPlayerIds[currentItem.currentPriorityIndex];
  if (activePlayerId !== playerId) return state;

  return markCurrentResolutionAdvanced(state);
};

export const hireCurrentHero = (state: GameState, playerId: PlayerId): GameState => {
  const currentItem = getCurrentResolutionItem(state);
  if (!currentItem) return state;

  const activePlayerId = currentItem.priorityPlayerIds[currentItem.currentPriorityIndex];
  if (activePlayerId !== playerId) return state;

  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) return state;
  if (isPriestUnavailableForPlayer(player, currentItem.rowKey)) return state;
  if (!canPlayerAffordRowOffer(player, currentItem.rowKey)) return state;

  return {
    ...state,
    players: state.players.map((entry) => {
      if (entry.id === playerId) {
        const paid = applyHireCost(entry, currentItem.rowKey);
        return {
          ...paid,
          hiredPoolHeroIds: [...paid.hiredPoolHeroIds, currentItem.heroId],
        };
      }

      return removeHeroFromPublicLocations(entry, currentItem.heroId);
    }),
    heroVillageHeroIds: state.heroVillageHeroIds.filter((id) => id !== currentItem.heroId),
    hiring: {
      ...state.hiring,
      resolutionOrder: state.hiring.resolutionOrder.map((item) =>
        item.heroId === currentItem.heroId ? { ...item, resolved: true } : item,
      ),
    },
  };
};
