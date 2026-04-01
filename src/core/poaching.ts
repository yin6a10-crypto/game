import { GameState, HeroClass, HeroId, MissionId, PendingPoach, PlayerId } from './types';
import { canMissionAcceptHeroAssignment, getMissionOwnerPlayerId } from './assignment';

export const GOLD_TO_SILVER = 5;

interface EligiblePoachRanger {
  rangerHeroId: HeroId;
  fromPlayerId: PlayerId;
  fromMissionId: MissionId;
}

const missionRequiresRanger = (state: GameState, missionId: MissionId): boolean => {
  const mission = state.missions.find((item) => item.id === missionId);
  if (!mission) return false;
  return mission.requirements.requiredExact.some((req) => req.heroClass === HeroClass.Ranger);
};

export const getValidRangerTargetMissions = (state: GameState, playerId: PlayerId): MissionId[] => {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) return [];

  return player.preparationSlots
    .filter((missionId): missionId is MissionId => missionId !== null)
    .filter((missionId) => missionRequiresRanger(state, missionId));
};

export const getEligibleAssignedRangersForPoaching = (state: GameState, toPlayerId: PlayerId): EligiblePoachRanger[] => {
  const targetMissions = getValidRangerTargetMissions(state, toPlayerId);
  if (targetMissions.length === 0) return [];

  const results: EligiblePoachRanger[] = [];
  for (const [missionId, heroIds] of Object.entries(state.assignment.assignedHeroIdsByMission)) {
    for (const heroId of heroIds) {
      const hero = state.heroes.find((item) => item.id === heroId);
      if (!hero || hero.heroClass !== HeroClass.Ranger) continue;

      const fromPlayerId = getMissionOwnerPlayerId(state, missionId);
      if (!fromPlayerId || fromPlayerId === toPlayerId) continue;

      results.push({
        rangerHeroId: heroId,
        fromPlayerId,
        fromMissionId: missionId,
      });
    }
  }

  return results;
};

const isRangerAssignedOnMission = (state: GameState, rangerHeroId: HeroId, missionId: MissionId): boolean => {
  const assigned = state.assignment.assignedHeroIdsByMission[missionId] ?? [];
  if (!assigned.includes(rangerHeroId)) return false;

  const ranger = state.heroes.find((hero) => hero.id === rangerHeroId);
  return ranger?.heroClass === HeroClass.Ranger;
};

export const canStartPoachAttempt = (
  state: GameState,
  toPlayerId: PlayerId,
  rangerHeroId: HeroId,
  fromMissionId: MissionId,
  targetMissionId: MissionId,
  priceSilver: number,
): boolean => {
  if (state.poaching.pending) return false;
  if (priceSilver <= 0) return false;

  const toPlayer = state.players.find((entry) => entry.id === toPlayerId);
  if (!toPlayer || toPlayer.silver + toPlayer.gold * GOLD_TO_SILVER < priceSilver) return false;

  const fromPlayerId = getMissionOwnerPlayerId(state, fromMissionId);
  if (!fromPlayerId || fromPlayerId === toPlayerId) return false;

  if (!isRangerAssignedOnMission(state, rangerHeroId, fromMissionId)) return false;

  const validTargets = getValidRangerTargetMissions(state, toPlayerId);
  if (!validTargets.includes(targetMissionId)) return false;

  return canMissionAcceptHeroAssignment(state, toPlayerId, rangerHeroId, targetMissionId);
};

export const isPoachStillResolvable = (state: GameState, pending: PendingPoach): boolean => {
  const fromOwner = getMissionOwnerPlayerId(state, pending.fromMissionId);
  if (fromOwner !== pending.fromPlayerId) return false;
  if (!isRangerAssignedOnMission(state, pending.rangerHeroId, pending.fromMissionId)) return false;
  return canMissionAcceptHeroAssignment(state, pending.toPlayerId, pending.rangerHeroId, pending.targetMissionId);
};

export const canPayExactPoachValue = (silver: number, gold: number, priceSilver: number): boolean => {
  if (priceSilver < 0) return false;
  const maxGoldUse = Math.min(gold, Math.floor(priceSilver / GOLD_TO_SILVER));
  for (let goldUse = maxGoldUse; goldUse >= 0; goldUse -= 1) {
    const silverNeed = priceSilver - goldUse * GOLD_TO_SILVER;
    if (silverNeed <= silver) return true;
  }
  return false;
};

export const payExactPoachValue = (
  silver: number,
  gold: number,
  priceSilver: number,
): { silver: number; gold: number } | null => {
  const maxGoldUse = Math.min(gold, Math.floor(priceSilver / GOLD_TO_SILVER));
  for (let goldUse = maxGoldUse; goldUse >= 0; goldUse -= 1) {
    const silverNeed = priceSilver - goldUse * GOLD_TO_SILVER;
    if (silverNeed <= silver) {
      return {
        silver: silver - silverNeed,
        gold: gold - goldUse,
      };
    }
  }
  return null;
};

export const createPoachAttempt = (
  state: GameState,
  toPlayerId: PlayerId,
  rangerHeroId: HeroId,
  fromMissionId: MissionId,
  targetMissionId: MissionId,
  priceSilver: number,
): PendingPoach | null => {
  if (!canStartPoachAttempt(state, toPlayerId, rangerHeroId, fromMissionId, targetMissionId, priceSilver)) {
    return null;
  }

  const fromPlayerId = getMissionOwnerPlayerId(state, fromMissionId);
  if (!fromPlayerId) return null;

  return {
    rangerHeroId,
    fromPlayerId,
    toPlayerId,
    fromMissionId,
    targetMissionId,
    priceSilver,
  };
};
