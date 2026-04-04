import {
  GameState,
  Hero,
  HeroClass,
  HeroId,
  HiringResolutionItem,
  HiringRowKey,
  MissionId,
  PlayerId,
  PlayerState,
} from './types';

export type WageCurrency = 'silver' | 'gems';

export interface HiringRowDefinition {
  key: HiringRowKey;
  heroClass: HeroClass;
  baseWage: number;
  currency: WageCurrency;
}

export const HIRING_ROW_ORDER: HiringRowKey[] = [
  'Warrior',
  'Ranger',
  'Mage',
  'Priest',
];

export const HIRING_ROW_DEFS: HiringRowDefinition[] = [
  { key: 'Warrior', heroClass: HeroClass.Warrior, baseWage: 0, currency: 'silver' },
  { key: 'Mage', heroClass: HeroClass.Mage, baseWage: 0, currency: 'gems' },
  { key: 'Ranger', heroClass: HeroClass.Ranger, baseWage: 0, currency: 'silver' },
  { key: 'Priest', heroClass: HeroClass.Priest, baseWage: 0, currency: 'silver' },
];

export const getHiringRowDefinition = (rowKey: HiringRowKey): HiringRowDefinition => {
  const found = HIRING_ROW_DEFS.find((row) => row.key === rowKey);
  if (!found) throw new Error(`Missing hiring row definition for ${rowKey}`);
  return found;
};

export const createEmptyHiringBoardExtraPay = (): Record<HiringRowKey, number> => ({
  Warrior: 0,
  Mage: 0,
  Ranger: 0,
  Priest: 0,
});

const getPlayerById = (state: GameState, playerId: PlayerId): PlayerState => {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) throw new Error(`Missing player ${playerId}`);
  return player;
};

const getHeroById = (state: GameState, heroId: HeroId): Hero => {
  const hero = state.heroes.find((entry) => entry.id === heroId);
  if (!hero) throw new Error(`Missing hero ${heroId}`);
  return hero;
};

const getOfferForPlayerRow = (player: PlayerState, rowKey: HiringRowKey, heroLevel: 1 | 2 | 3): number => {
  const row = getHiringRowDefinition(rowKey);
  return row.baseWage + player.hiringBoardExtraPay[rowKey] + (heroLevel - 1);
};

const comparePriority = (
  hero: Hero,
  playerA: PlayerState,
  playerB: PlayerState,
  offerA: number,
  offerB: number,
  playerOrder: PlayerId[],
): number => {
  if (offerA !== offerB) return offerB - offerA;

  if (hero.currentRestZonePlayerId !== null) {
    const aRest = playerA.id === hero.currentRestZonePlayerId ? 1 : 0;
    const bRest = playerB.id === hero.currentRestZonePlayerId ? 1 : 0;
    if (aRest !== bRest) return bRest - aRest;
  }

  if (playerA.reputation !== playerB.reputation) return playerB.reputation - playerA.reputation;

  return playerOrder.indexOf(playerA.id) - playerOrder.indexOf(playerB.id);
};

const getHeroSourceIds = (state: GameState): HeroId[] => {
  const restZoneHeroIds = state.players.flatMap((player) => player.restZoneHeroIds);
  const hiredPoolIds = new Set(state.players.flatMap((player) => player.hiredPoolHeroIds));

  return [...new Set([...state.heroVillageHeroIds, ...restZoneHeroIds])].filter((heroId) => !hiredPoolIds.has(heroId));
};

const findRowForHero = (hero: Hero): HiringRowKey | null => {
  const row = HIRING_ROW_DEFS.find((entry) => entry.heroClass === hero.heroClass);
  return row?.key ?? null;
};

export const buildHiringResolutionOrder = (state: GameState): HiringResolutionItem[] => {
  const heroIds = getHeroSourceIds(state);
  const heroesByRow = new Map<HiringRowKey, HeroId[]>();

  heroIds.forEach((heroId) => {
    const hero = getHeroById(state, heroId);
    const rowKey = findRowForHero(hero);
    if (!rowKey) return;

    const bucket = heroesByRow.get(rowKey) ?? [];
    bucket.push(heroId);
    heroesByRow.set(rowKey, bucket);
  });

  const results: HiringResolutionItem[] = [];

  HIRING_ROW_ORDER.forEach((rowKey) => {
    const rowHeroIds = (heroesByRow.get(rowKey) ?? []).sort((a, b) => {
      const heroA = getHeroById(state, a);
      const heroB = getHeroById(state, b);
      if (heroA.level !== heroB.level) return heroB.level - heroA.level;
      return a.localeCompare(b);
    });

    rowHeroIds.forEach((heroId) => {
      const hero = getHeroById(state, heroId);
      const eligiblePlayers = state.players.filter((player) => {
        if (rowKey !== 'Priest') return true;
        return player.reputation >= 0;
      });

      const ranked = [...eligiblePlayers]
        .sort((a, b) => {
          const offerB = getOfferForPlayerRow(b, rowKey, hero.level);
          const offerA = getOfferForPlayerRow(a, rowKey, hero.level);
          return comparePriority(hero, a, b, offerA, offerB, state.playerOrder);
        })
        .map((player) => player.id);

      results.push({
        heroId,
        rowKey,
        priorityPlayerIds: ranked,
        currentPriorityIndex: 0,
        resolved: false,
      });
    });
  });

  return results;
};

export const getCurrentResolutionItem = (state: GameState): HiringResolutionItem | null => {
  return state.hiring.resolutionOrder.find((item) => !item.resolved) ?? null;
};

export const isPriestUnavailableForPlayer = (player: PlayerState, rowKey: HiringRowKey): boolean => {
  return rowKey === 'Priest' && player.reputation <= -1;
};

export const canPlayerAffordRowOffer = (player: PlayerState, rowKey: HiringRowKey, heroLevel: 1 | 2 | 3): boolean => {
  const row = getHiringRowDefinition(rowKey);
  const offer = getOfferForPlayerRow(player, rowKey, heroLevel);
  return row.currency === 'silver' ? player.silver >= offer : player.gems >= offer;
};

export const applyHireCost = (player: PlayerState, rowKey: HiringRowKey, heroLevel: 1 | 2 | 3): PlayerState => {
  const row = getHiringRowDefinition(rowKey);
  const offer = getOfferForPlayerRow(player, rowKey, heroLevel);

  if (row.currency === 'silver') {
    return { ...player, silver: player.silver - offer };
  }

  return { ...player, gems: player.gems - offer };
};

export const getActualOffer = (player: PlayerState, rowKey: HiringRowKey, heroLevel: 1 | 2 | 3): number => {
  return getOfferForPlayerRow(player, rowKey, heroLevel);
};

export const getMissionTitleById = (state: GameState, missionId: MissionId): string => {
  const mission = state.missions.find((entry) => entry.id === missionId);
  return mission?.title ?? missionId;
};
