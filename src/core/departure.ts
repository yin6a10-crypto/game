import { GameState, MissionId, PlayerId } from './types';
import { isMissionFullyStaffed } from './assignment';

const getMission = (state: GameState, missionId: MissionId) => state.missions.find((mission) => mission.id === missionId);

export const canDepartMission = (state: GameState, playerId: PlayerId, missionId: MissionId): boolean => {
  const player = state.players.find((p) => p.id === playerId);
  const mission = getMission(state, missionId);
  if (!player || !mission) return false;
  if (!player.preparationSlots.includes(missionId)) return false;
  return isMissionFullyStaffed(state, missionId);
};

export const departMissionToWorldMap = (state: GameState, playerId: PlayerId, missionId: MissionId): GameState => {
  if (!canDepartMission(state, playerId, missionId)) return state;

  const mission = getMission(state, missionId);
  if (!mission) return state;

  const assignedHeroIds = state.assignment.assignedHeroIdsByMission[missionId] ?? [];

  return {
    ...state,
    players: state.players.map((player) =>
      player.id !== playerId
        ? player
        : {
            ...player,
            preparationSlots: player.preparationSlots.map((slotMissionId) =>
              slotMissionId === missionId ? null : slotMissionId,
            ) as typeof player.preparationSlots,
          },
    ),
    worldMap: state.worldMap.map((zoneView) => {
      if (zoneView.zone !== mission.zone) return zoneView;

      if (mission.laneLength === 1) {
        return {
          ...zoneView,
          lanes: {
            ...zoneView.lanes,
            oneTurn: [...zoneView.lanes.oneTurn, { missionId, position: 0, assignedHeroIds, enteredStep: state.worldMapStep }],
          },
        };
      }

      if (mission.laneLength === 2) {
        return {
          ...zoneView,
          lanes: {
            ...zoneView.lanes,
            twoTurn: [...zoneView.lanes.twoTurn, { missionId, position: 0, assignedHeroIds, enteredStep: state.worldMapStep }],
          },
        };
      }

      return {
        ...zoneView,
        lanes: {
          ...zoneView.lanes,
          threeTurn: [...zoneView.lanes.threeTurn, { missionId, position: 0, assignedHeroIds, enteredStep: state.worldMapStep }],
        },
      };
    }),
  };
};
