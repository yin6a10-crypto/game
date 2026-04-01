import { seedState } from './seedData';
import { GameState, MissionId, PlayerState, Reputation } from './types';

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
  const next = [missionId, ...compact];
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
