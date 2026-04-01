import { GameState, HeroClass, HeroId, MissionId } from './types';

const getAssignedHeroIdsForMission = (state: GameState, missionId: MissionId): HeroId[] => {
  return state.assignment.assignedHeroIdsByMission[missionId] ?? [];
};

const getHeroClass = (state: GameState, heroId: HeroId): HeroClass | null => {
  const hero = state.heroes.find((entry) => entry.id === heroId);
  return hero?.heroClass ?? null;
};

export const getFailureCasualtyCandidates = (state: GameState, missionId: MissionId): HeroId[] => {
  const assignedHeroIds = getAssignedHeroIdsForMission(state, missionId);
  const priorityOrder: HeroClass[] = [HeroClass.Warrior, HeroClass.Ranger, HeroClass.Mage, HeroClass.Priest];

  for (const heroClass of priorityOrder) {
    const candidates = assignedHeroIds.filter((heroId) => getHeroClass(state, heroId) === heroClass);
    if (candidates.length > 0) return candidates;
  }

  return [];
};

export const selectFailureCasualtyHero = (
  state: GameState,
  missionId: MissionId,
  chosenHeroId?: HeroId,
): HeroId | null => {
  const candidates = getFailureCasualtyCandidates(state, missionId);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  if (!chosenHeroId) return null;
  return candidates.includes(chosenHeroId) ? chosenHeroId : null;
};
