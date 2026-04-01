import './styles/app.css';
import {
  createInitialState,
  declinePendingPoach,
  departPreparationMission,
  advanceWorldMap,
  assignHiredHeroToPreparationMission,
  hireCurrentHero,
  lockOffersAndStartHiring,
  matchPendingPoach,
  passOnCurrentHire,
  startRangerPoachAttempt,
  updateHiringExtraPay,
} from './core/state';
import { isMissionFullyStaffed } from './core/assignment';
import { canDepartMission } from './core/departure';
import { getCurrentResolutionItem } from './core/hiring';
import { renderGame } from './ui/renderGame';
import { isEntryReadyToResolve } from './core/worldMap';
import { GameState } from './core/types';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Root container #app was not found.');
}

const state = createInitialState();
let gameState = state;
let popupQueue: string[] = [];

const enqueuePopup = (message: string): void => {
  if (popupQueue.includes(message)) return;
  popupQueue.push(message);
};

const collectGuidanceMessages = (previous: GameState, next: GameState): string[] => {
  const messages: string[] = [];

  const missionIds = next.missions.map((mission) => mission.id);
  missionIds.forEach((missionId) => {
    if (!isMissionFullyStaffed(previous, missionId) && isMissionFullyStaffed(next, missionId)) {
      messages.push(`"${next.missions.find((mission) => mission.id === missionId)?.title ?? missionId}" is now fully staffed.`);
    }
  });

  if (previous.hiring.offersLocked && getCurrentResolutionItem(previous) && !getCurrentResolutionItem(next)) {
    messages.push('Hiring resolution is finished.');
  }

  next.players.forEach((player) => {
    player.preparationSlots.forEach((missionId) => {
      if (!missionId) return;
      if (!canDepartMission(previous, player.id, missionId) && canDepartMission(next, player.id, missionId)) {
        messages.push(`"${next.missions.find((mission) => mission.id === missionId)?.title ?? missionId}" is ready to depart.`);
      }
    });
  });

  const wasReady = previous.worldMap.some((zone) =>
    zone.lanes.oneTurn.some((entry) => isEntryReadyToResolve(entry, 1)) ||
    zone.lanes.twoTurn.some((entry) => isEntryReadyToResolve(entry, 2)) ||
    zone.lanes.threeTurn.some((entry) => isEntryReadyToResolve(entry, 3)),
  );
  const isReady = next.worldMap.some((zone) =>
    zone.lanes.oneTurn.some((entry) => isEntryReadyToResolve(entry, 1)) ||
    zone.lanes.twoTurn.some((entry) => isEntryReadyToResolve(entry, 2)) ||
    zone.lanes.threeTurn.some((entry) => isEntryReadyToResolve(entry, 3)),
  );
  if (!wasReady && isReady) {
    messages.push('A mission is ready to resolve on the World Map.');
  }

  if (!previous.poaching.pending && next.poaching.pending) {
    messages.push('A poach is pending and must be resolved first.');
  }

  return messages;
};

const derivePhaseGuidance = (state: GameState): { phase: string; instruction: string } => {
  if (state.poaching.pending) {
    return { phase: 'Ranger Poach', instruction: 'Resolve any ranger poach or continue.' };
  }

  const currentHire = getCurrentResolutionItem(state);
  if (state.hiring.offersLocked && currentHire) {
    return { phase: 'Hire Resolution', instruction: 'Resolve the current hero: Hire or Pass.' };
  }

  if (!state.hiring.offersLocked) {
    return { phase: 'Guild Hiring', instruction: 'Set pay on your hiring board, then lock offers.' };
  }

  const hasHiredPool = state.players.some((player) => player.hiredPoolHeroIds.length > 0);
  if (hasHiredPool) {
    return { phase: 'Assignment', instruction: 'Assign hired heroes to your missions.' };
  }

  const hasReadyDeparture = state.players.some((player) =>
    player.preparationSlots.some((missionId) => missionId !== null && canDepartMission(state, player.id, missionId)),
  );
  if (hasReadyDeparture) {
    return { phase: 'Departure', instruction: 'Send fully staffed missions to the world map.' };
  }

  const hasMapEntries = state.worldMap.some(
    (zone) => zone.lanes.oneTurn.length > 0 || zone.lanes.twoTurn.length > 0 || zone.lanes.threeTurn.length > 0,
  );
  const hasReadyResolution = state.worldMap.some((zone) =>
    zone.lanes.oneTurn.some((entry) => isEntryReadyToResolve(entry, 1)) ||
    zone.lanes.twoTurn.some((entry) => isEntryReadyToResolve(entry, 2)) ||
    zone.lanes.threeTurn.some((entry) => isEntryReadyToResolve(entry, 3)),
  );

  if (hasReadyResolution) {
    return { phase: 'Mission Resolution', instruction: 'Resolve missions that are ready.' };
  }

  if (hasMapEntries) {
    return { phase: 'World Map Advance', instruction: 'Advance missions already on the map.' };
  }

  const hasBoardMissions = state.missionBoard.some((slot) => slot.missionId !== null);
  if (hasBoardMissions) {
    return { phase: 'Accept Missions', instruction: 'Take 1 mission or pass.' };
  }

  return { phase: 'End Round', instruction: 'Apply end-of-round shift and start next round.' };
};

const render = (): void => {
  const popupMessage = popupQueue.length > 0 ? popupQueue[0] : null;
  const phaseGuidance = derivePhaseGuidance(gameState);

  renderGame(root, gameState, {
    onAdjustExtraPay: (playerId, rowKey, delta) => {
      const prev = gameState;
      gameState = updateHiringExtraPay(gameState, playerId, rowKey, delta);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onLockOffers: () => {
      const prev = gameState;
      gameState = lockOffersAndStartHiring(gameState);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onHire: (playerId) => {
      const prev = gameState;
      gameState = hireCurrentHero(gameState, playerId);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onPass: (playerId) => {
      const prev = gameState;
      gameState = passOnCurrentHire(gameState, playerId);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onAssignHero: (playerId, heroId, missionId) => {
      const prev = gameState;
      gameState = assignHiredHeroToPreparationMission(gameState, playerId, heroId, missionId);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onStartPoach: (toPlayerId, rangerHeroId, fromMissionId, targetMissionId, priceSilver) => {
      const prev = gameState;
      gameState = startRangerPoachAttempt(
        gameState,
        toPlayerId,
        rangerHeroId,
        fromMissionId,
        targetMissionId,
        priceSilver,
      );
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onMatchPoach: (playerId) => {
      const prev = gameState;
      gameState = matchPendingPoach(gameState, playerId);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onDeclinePoach: (playerId) => {
      const prev = gameState;
      gameState = declinePendingPoach(gameState, playerId);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onDepartMission: (playerId, missionId) => {
      const prev = gameState;
      gameState = departPreparationMission(gameState, playerId, missionId);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onAdvanceWorldMap: () => {
      const prev = gameState;
      gameState = advanceWorldMap(gameState);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onDismissPopup: () => {
      popupQueue = popupQueue.slice(1);
      render();
    },
  }, popupMessage, phaseGuidance.phase, phaseGuidance.instruction);
};

render();
