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
  level: 1 | 2 | 3;
  minWage: number;
  currency: WageCurrency;
}

export const HIRING_ROW_ORDER: HiringRowKey[] = [
  'Warrior-3',
  'Warrior-2',
  'Warrior-1',
  'Ranger-2',
  'Ranger-1',
  'Mage-3',
  'Mage-2',
  'Mage-1',
  'Priest-2',
  'Priest-1',
];

export const HIRING_ROW_DEFS: HiringRowDefinition[] = [
  { key: 'Warrior-1', heroClass: HeroClass.Warrior, level: 1, minWage: 1, currency: 'silver' },
  { key: 'Warrior-2', heroClass: HeroClass.Warrior, level: 2, minWage: 2, currency: 'silver' },
  { key: 'Warrior-3', heroClass: HeroClass.Warrior, level: 3, minWage: 3, currency: 'silver' },
  { key: 'Mage-1', heroClass: HeroClass.Mage, level: 1, minWage: 1, currency: 'gems' },
  { key: 'Mage-2', heroClass: HeroClass.Mage, level: 2, minWage: 2, currency: 'gems' },
  { key: 'Mage-3', heroClass: HeroClass.Mage, level: 3, minWage: 3, currency: 'gems' },
  { key: 'Ranger-1', heroClass: HeroClass.Ranger, level: 1, minWage: 1, currency: 'silver' },
  { key: 'Ranger-2', heroClass: HeroClass.Ranger, level: 2, minWage: 2, currency: 'silver' },
  { key: 'Priest-1', heroClass: HeroClass.Priest, level: 1, minWage: 1, currency: 'silver' },
  { key: 'Priest-2', heroClass: HeroClass.Priest, level: 2, minWage: 2, currency: 'silver' },
];

export const getHiringRowDefinition = (rowKey: HiringRowKey): HiringRowDefinition => {
  const found = HIRING_ROW_DEFS.find((row) => row.key === rowKey);
  if (!found) throw new Error(`Missing hiring row definition for ${rowKey}`);
  return found;
};

export const createEmptyHiringBoardExtraPay = (): Record<HiringRowKey, number> => ({
  'Warrior-1': 0,
  'Warrior-2': 0,
  'Warrior-3': 0,
  'Mage-1': 0,
  'Mage-2': 0,
  'Mage-3': 0,
  'Ranger-1': 0,
  'Ranger-2': 0,
  'Priest-1': 0,
  'Priest-2': 0,
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

const getOfferForPlayerRow = (player: PlayerState, rowKey: HiringRowKey): number => {
  const row = getHiringRowDefinition(rowKey);
  return row.minWage + player.hiringBoardExtraPay[rowKey];
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
  const row = HIRING_ROW_DEFS.find((entry) => entry.heroClass === hero.heroClass && entry.level === hero.level);
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
    const rowHeroIds = (heroesByRow.get(rowKey) ?? []).sort();

    rowHeroIds.forEach((heroId) => {
      const hero = getHeroById(state, heroId);
      const eligiblePlayers = state.players.filter((player) => {
        if (!rowKey.startsWith('Priest-')) return true;
        return player.reputation >= 0;
      });

      const ranked = [...eligiblePlayers]
        .sort((a, b) => {
          const offerA = getOfferForPlayerRow(a, rowKey);
          const offerB = getOfferForPlayerRow(b, rowKey);
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
  return rowKey.startsWith('Priest-') && player.reputation <= -1;
};

export const canPlayerAffordRowOffer = (player: PlayerState, rowKey: HiringRowKey): boolean => {
  const row = getHiringRowDefinition(rowKey);
  const offer = getOfferForPlayerRow(player, rowKey);
  return row.currency === 'silver' ? player.silver >= offer : player.gems >= offer;
};

export const applyHireCost = (player: PlayerState, rowKey: HiringRowKey): PlayerState => {
  const row = getHiringRowDefinition(rowKey);
  const offer = getOfferForPlayerRow(player, rowKey);

  if (row.currency === 'silver') {
    return { ...player, silver: player.silver - offer };
  }

  return { ...player, gems: player.gems - offer };
};

export const getActualOffer = (player: PlayerState, rowKey: HiringRowKey): number => {
  return getOfferForPlayerRow(player, rowKey);
};

export const getMissionTitleById = (state: GameState, missionId: MissionId): string => {
  const mission = state.missions.find((entry) => entry.id === missionId);
  return mission?.title ?? missionId;
};
