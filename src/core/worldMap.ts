import { GameState, WorldMapLaneEntry } from './types';

const advanceLaneEntries = (entries: WorldMapLaneEntry[], laneLength: number, currentStep: number): WorldMapLaneEntry[] => {
  const maxPosition = laneLength - 1;
  return entries.map((entry) => {
    if (entry.enteredStep >= currentStep) return entry;
    return {
      ...entry,
      position: Math.min(maxPosition, entry.position + 1),
    };
  });
};

export const advanceWorldMapStep = (state: GameState): GameState => {
  return {
    ...state,
    worldMap: state.worldMap.map((zone) => ({
      ...zone,
      lanes: {
        oneTurn: advanceLaneEntries(zone.lanes.oneTurn, 1, state.worldMapStep),
        twoTurn: advanceLaneEntries(zone.lanes.twoTurn, 2, state.worldMapStep),
        threeTurn: advanceLaneEntries(zone.lanes.threeTurn, 3, state.worldMapStep),
      },
    })),
    worldMapStep: state.worldMapStep + 1,
  };
};

export const isEntryReadyToResolve = (entry: WorldMapLaneEntry, laneLength: number): boolean => {
  return entry.position >= laneLength - 1;
};
