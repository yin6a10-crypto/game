import { seedState } from './seedData';
import { GameState, HeroId, HiringRowKey, MissionId, PlayerId, PlayerState, Reputation } from './types';
import {
  applyHireCost,
  buildHiringResolutionOrder,
  canPlayerAffordRowOffer,
  getCurrentResolutionItem,
  isPriestUnavailableForPlayer,
} from './hiring';
import { assignHeroToMission } from './assignment';
import { canPayExactPoachValue, createPoachAttempt, isPoachStillResolvable, payExactPoachValue } from './poaching';
import { departMissionToWorldMap } from './departure';
import { advanceWorldMapStep, isEntryReadyToResolve } from './worldMap';

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
  if (state.poaching.pending) return state;
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
  if (state.poaching.pending) return state;
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
  if (state.poaching.pending) return state;
  const currentItem = getCurrentResolutionItem(state);
  if (!currentItem) return state;

  const activePlayerId = currentItem.priorityPlayerIds[currentItem.currentPriorityIndex];
  if (activePlayerId !== playerId) return state;

  return markCurrentResolutionAdvanced(state);
};

export const hireCurrentHero = (state: GameState, playerId: PlayerId): GameState => {
  if (state.poaching.pending) return state;
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

export const assignHiredHeroToPreparationMission = (
  state: GameState,
  playerId: PlayerId,
  heroId: HeroId,
  missionId: MissionId,
): GameState => {
  if (state.poaching.pending) return state;
  return assignHeroToMission(state, playerId, heroId, missionId);
};

export const acceptMissionFromBoard = (state: GameState, playerId: PlayerId, missionId: MissionId): GameState => {
  if (state.poaching.pending) return state;
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) return state;
  if (!state.missionBoard.some((slot) => slot.missionId === missionId)) return state;

  return {
    ...state,
    missionBoard: state.missionBoard.map((slot) => (slot.missionId === missionId ? { ...slot, missionId: null } : slot)),
    players: state.players.map((entry) =>
      entry.id === playerId ? insertMissionIntoPreparationArea(entry, missionId) : entry,
    ),
  };
};

export const startRangerPoachAttempt = (
  state: GameState,
  toPlayerId: PlayerId,
  rangerHeroId: HeroId,
  fromMissionId: MissionId,
  targetMissionId: MissionId,
  priceSilver: number,
): GameState => {
  if (state.poaching.pending) return state;
  const pending = createPoachAttempt(state, toPlayerId, rangerHeroId, fromMissionId, targetMissionId, priceSilver);
  if (!pending) return state;

  return {
    ...state,
    poaching: { pending },
  };
};

export const matchPendingPoach = (state: GameState, playerId: PlayerId): GameState => {
  const pending = state.poaching.pending;
  if (!pending) return state;
  if (pending.fromPlayerId !== playerId) return state;
  if (!isPoachStillResolvable(state, pending)) return { ...state, poaching: { pending: null } };

  const owner = state.players.find((player) => player.id === pending.fromPlayerId);
  if (!owner) return state;
  if (!canPayExactPoachValue(owner.silver, owner.gold, pending.priceSilver)) return state;
  const paid = payExactPoachValue(owner.silver, owner.gold, pending.priceSilver);
  if (!paid) return state;

  return {
    ...state,
    players: state.players.map((player) =>
      player.id === owner.id ? { ...player, silver: paid.silver, gold: paid.gold } : player,
    ),
    poaching: { pending: null },
  };
};

export const declinePendingPoach = (state: GameState, playerId: PlayerId): GameState => {
  const pending = state.poaching.pending;
  if (!pending) return state;
  if (pending.fromPlayerId !== playerId) return state;
  if (!isPoachStillResolvable(state, pending)) return { ...state, poaching: { pending: null } };

  const poacher = state.players.find((player) => player.id === pending.toPlayerId);
  if (!poacher) return state;
  if (!canPayExactPoachValue(poacher.silver, poacher.gold, pending.priceSilver)) return state;
  const paid = payExactPoachValue(poacher.silver, poacher.gold, pending.priceSilver);
  if (!paid) return state;

  return {
    ...state,
    players: state.players.map((player) =>
      player.id === poacher.id ? { ...player, silver: paid.silver, gold: paid.gold } : player,
    ),
    assignment: {
      ...state.assignment,
      assignedHeroIdsByMission: {
        ...state.assignment.assignedHeroIdsByMission,
        [pending.fromMissionId]: (state.assignment.assignedHeroIdsByMission[pending.fromMissionId] ?? []).filter(
          (heroId) => heroId !== pending.rangerHeroId,
        ),
        [pending.targetMissionId]: [
          ...(state.assignment.assignedHeroIdsByMission[pending.targetMissionId] ?? []),
          pending.rangerHeroId,
        ],
      },
    },
    poaching: { pending: null },
  };
};

export const departPreparationMission = (state: GameState, playerId: PlayerId, missionId: MissionId): GameState => {
  if (state.poaching.pending) return state;
  return departMissionToWorldMap(state, playerId, missionId);
};

export const advanceWorldMap = (state: GameState): GameState => {
  if (state.poaching.pending) return state;
  return advanceWorldMapStep(state);
};

export const resolveReadyMissionDemo = (state: GameState, missionId: MissionId): GameState => {
  if (state.poaching.pending) return state;

  let laneLength: 1 | 2 | 3 | null = null;
  let ownerPlayerId: PlayerId | null = null;
  let assignedHeroIds: HeroId[] = [];

  for (const zone of state.worldMap) {
    const laneDefs: Array<{ entries: typeof zone.lanes.oneTurn; len: 1 | 2 | 3 }> = [
      { entries: zone.lanes.oneTurn, len: 1 },
      { entries: zone.lanes.twoTurn, len: 2 },
      { entries: zone.lanes.threeTurn, len: 3 },
    ];
    for (const lane of laneDefs) {
      const found = lane.entries.find((entry) => entry.missionId === missionId);
      if (found) {
        laneLength = lane.len;
        ownerPlayerId = (found as typeof found & { ownerPlayerId?: PlayerId }).ownerPlayerId ?? null;
        assignedHeroIds = found.assignedHeroIds;
      }
    }
  }

  if (!laneLength || !ownerPlayerId) return state;
  const entry = state.worldMap
    .flatMap((zone) => [...zone.lanes.oneTurn, ...zone.lanes.twoTurn, ...zone.lanes.threeTurn])
    .find((item) => item.missionId === missionId);
  if (!entry || !isEntryReadyToResolve(entry, laneLength)) return state;

  return {
    ...state,
    worldMap: state.worldMap.map((zone) => ({
      ...zone,
      lanes: {
        oneTurn: zone.lanes.oneTurn.filter((item) => item.missionId !== missionId),
        twoTurn: zone.lanes.twoTurn.filter((item) => item.missionId !== missionId),
        threeTurn: zone.lanes.threeTurn.filter((item) => item.missionId !== missionId),
      },
    })),
    assignment: {
      ...state.assignment,
      assignedHeroIdsByMission: {
        ...state.assignment.assignedHeroIdsByMission,
        [missionId]: [],
      },
    },
    players: state.players.map((player) =>
      player.id !== ownerPlayerId
        ? player
        : {
            ...player,
            restZoneHeroIds: [...player.restZoneHeroIds, ...assignedHeroIds.filter((id) => !player.restZoneHeroIds.includes(id))],
          },
    ),
  };
};
