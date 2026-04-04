import { GameState, Hero, HeroClass, HeroId, MissionCard, MissionId, PlayerId, PlayerState } from './types';

const getPlayer = (state: GameState, playerId: PlayerId): PlayerState | undefined => {
  return state.players.find((player) => player.id === playerId);
};

const getHero = (state: GameState, heroId: HeroId): Hero | undefined => {
  return state.heroes.find((hero) => hero.id === heroId);
};

const getMission = (state: GameState, missionId: MissionId): MissionCard | undefined => {
  return state.missions.find((mission) => mission.id === missionId);
};

export const getMissionOwnerPlayerId = (state: GameState, missionId: MissionId): PlayerId | null => {
  const owner = state.players.find((player) => player.preparationSlots.includes(missionId));
  return owner?.id ?? null;
};

const heroMatchesRequirement = (hero: Hero, req: MissionCard['requirements']['requiredExact'][number]): boolean => {
  return hero.heroClass === req.heroClass && hero.level >= req.level;
};

const getMaxMatchedRequiredRoles = (heroes: Hero[], mission: MissionCard): number => {
  const required = mission.requirements.requiredExact;
  const assignedHeroIndexByReq = new Array(required.length).fill(-1);

  const tryMatch = (heroIndex: number, visitedReq: boolean[]): boolean => {
    for (let reqIndex = 0; reqIndex < required.length; reqIndex += 1) {
      if (visitedReq[reqIndex]) continue;
      if (!heroMatchesRequirement(heroes[heroIndex], required[reqIndex])) continue;

      visitedReq[reqIndex] = true;
      if (
        assignedHeroIndexByReq[reqIndex] === -1 ||
        tryMatch(assignedHeroIndexByReq[reqIndex], visitedReq)
      ) {
        assignedHeroIndexByReq[reqIndex] = heroIndex;
        return true;
      }
    }
    return false;
  };

  let matchedCount = 0;
  for (let heroIndex = 0; heroIndex < heroes.length; heroIndex += 1) {
    if (tryMatch(heroIndex, new Array(required.length).fill(false))) {
      matchedCount += 1;
    }
  }

  return matchedCount;
};

const getAssignedHeroesForMission = (state: GameState, missionId: MissionId): Hero[] => {
  const heroIds = state.assignment.assignedHeroIdsByMission[missionId] ?? [];
  return heroIds
    .map((heroId) => getHero(state, heroId))
    .filter((hero): hero is Hero => Boolean(hero));
};

const isMissionInPlayerPreparation = (player: PlayerState, missionId: MissionId): boolean => {
  return player.preparationSlots.includes(missionId);
};

const getRequiredPriestSlots = (mission: MissionCard): number => {
  return mission.requirements.requiredExact.filter((req) => req.heroClass === HeroClass.Priest).length;
};

const hasInvalidPriestConfiguration = (mission: MissionCard): boolean => {
  const requiredPriestSlots = getRequiredPriestSlots(mission);
  const hasOptionalPriest = (mission.requirements.optionalPriestLevels ?? []).length > 0;

  // Rules:
  // 1) at most one priest total
  // 2) mission cannot have both required priest and optional priest
  return requiredPriestSlots > 1 || (requiredPriestSlots > 0 && hasOptionalPriest);
};

export const isMissionFullyStaffed = (state: GameState, missionId: MissionId): boolean => {
  const mission = getMission(state, missionId);
  if (!mission) return false;

  const assignedHeroes = getAssignedHeroesForMission(state, missionId);
  return getMaxMatchedRequiredRoles(assignedHeroes, mission) === mission.requirements.requiredExact.length;
};

const canAssignAsOptionalPriest = (hero: Hero, mission: MissionCard, assignedHeroes: Hero[]): boolean => {
  if (hero.heroClass !== HeroClass.Priest) return false;
  if (getRequiredPriestSlots(mission) > 0) return false;

  const optionalLevels = mission.requirements.optionalPriestLevels ?? [];
  if (!optionalLevels.includes(hero.level)) return false;

  const currentlyAssignedPriests = assignedHeroes.filter((assigned) => assigned.heroClass === HeroClass.Priest).length;
  return currentlyAssignedPriests < 1;
};

export const canAssignHeroToMission = (
  state: GameState,
  playerId: PlayerId,
  heroId: HeroId,
  missionId: MissionId,
): boolean => {
  const player = getPlayer(state, playerId);
  const hero = getHero(state, heroId);
  const mission = getMission(state, missionId);
  if (!player || !hero || !mission) return false;
  if (hasInvalidPriestConfiguration(mission)) return false;

  if (!isMissionInPlayerPreparation(player, missionId)) return false;
  if (!player.hiredPoolHeroIds.includes(heroId)) return false;

  const assignedHeroes = getAssignedHeroesForMission(state, missionId);
  const currentMatchedRequired = getMaxMatchedRequiredRoles(assignedHeroes, mission);
  const nextMatchedRequired = getMaxMatchedRequiredRoles([...assignedHeroes, hero], mission);
  const helpsRequiredRoles = nextMatchedRequired > currentMatchedRequired;
  const canFillOptionalPriest = canAssignAsOptionalPriest(hero, mission, assignedHeroes);

  return helpsRequiredRoles || canFillOptionalPriest;
};

export const canMissionAcceptHeroAssignment = (
  state: GameState,
  playerId: PlayerId,
  heroId: HeroId,
  missionId: MissionId,
): boolean => {
  const player = getPlayer(state, playerId);
  const hero = getHero(state, heroId);
  const mission = getMission(state, missionId);
  if (!player || !hero || !mission) return false;
  if (hasInvalidPriestConfiguration(mission)) return false;
  if (!isMissionInPlayerPreparation(player, missionId)) return false;

  const assignedHeroes = getAssignedHeroesForMission(state, missionId);
  const currentMatchedRequired = getMaxMatchedRequiredRoles(assignedHeroes, mission);
  const nextMatchedRequired = getMaxMatchedRequiredRoles([...assignedHeroes, hero], mission);
  const helpsRequiredRoles = nextMatchedRequired > currentMatchedRequired;
  const canFillOptionalPriest = canAssignAsOptionalPriest(hero, mission, assignedHeroes);

  return helpsRequiredRoles || canFillOptionalPriest;
};

export const assignHeroToMission = (
  state: GameState,
  playerId: PlayerId,
  heroId: HeroId,
  missionId: MissionId,
): GameState => {
  if (!canAssignHeroToMission(state, playerId, heroId, missionId)) return state;

  return {
    ...state,
    assignment: {
      ...state.assignment,
      assignedHeroIdsByMission: {
        ...state.assignment.assignedHeroIdsByMission,
        [missionId]: [...(state.assignment.assignedHeroIdsByMission[missionId] ?? []), heroId],
      },
    },
    players: state.players.map((player) =>
      player.id !== playerId
        ? player
        : {
            ...player,
            hiredPoolHeroIds: player.hiredPoolHeroIds.filter((id) => id !== heroId),
          },
    ),
  };
};
