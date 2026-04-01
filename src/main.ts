import './styles/app.css';
import {
  acceptMissionFromBoard,
  createInitialState,
  declinePendingPoach,
  departPreparationMission,
  advanceWorldMap,
  assignHiredHeroToPreparationMission,
  hireCurrentHero,
  lockOffersAndStartHiring,
  matchPendingPoach,
  passOnCurrentHire,
  resolveReadyMissionDemo,
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
const demoPhases = [
  'Accept Missions',
  'Guild Hiring',
  'Hire Resolution',
  'Assignment',
  'Ranger Poach',
  'Departure',
  'World Map Advance',
  'Mission Resolution',
  'End Round',
] as const;
type DemoPhase = (typeof demoPhases)[number];
let currentDemoPhaseIndex = 0;

const phaseInstruction: Record<DemoPhase, string> = {
  'Accept Missions': 'Take 1 mission or pass.',
  'Guild Hiring': 'Set pay on your hiring board, then lock offers.',
  'Hire Resolution': 'Resolve the current hero: Hire or Pass.',
  Assignment: 'Assign hired heroes to your missions.',
  'Ranger Poach': 'Resolve any ranger poach or continue.',
  Departure: 'Send fully staffed missions to the world map.',
  'World Map Advance': 'Advance missions already on the map.',
  'Mission Resolution': 'Resolve missions that are ready.',
  'End Round': 'Apply end-of-round shift and start next round.',
};

const getCurrentDemoPhase = (): DemoPhase => demoPhases[currentDemoPhaseIndex];

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

const render = (): void => {
  const popupMessage = popupQueue.length > 0 ? popupQueue[0] : null;
  const phase = getCurrentDemoPhase();
  const currentHire = getCurrentResolutionItem(gameState);
  const pendingPoach = gameState.poaching.pending;
  const actingPlayer =
    phase === 'Hire Resolution' && currentHire
      ? gameState.players.find((player) => player.id === currentHire.priorityPlayerIds[currentHire.currentPriorityIndex])?.name ?? '-'
      : phase === 'Ranger Poach' && pendingPoach
        ? gameState.players.find((player) => player.id === pendingPoach.fromPlayerId)?.name ?? '-'
        : 'Both Players';
  const canContinue = popupQueue.length === 0;

  renderGame(root, gameState, {
    onAdjustExtraPay: (playerId, rowKey, delta) => {
      if (phase !== 'Guild Hiring') return;
      const prev = gameState;
      gameState = updateHiringExtraPay(gameState, playerId, rowKey, delta);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onLockOffers: () => {
      if (phase !== 'Guild Hiring') return;
      const prev = gameState;
      gameState = lockOffersAndStartHiring(gameState);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onHire: (playerId) => {
      if (phase !== 'Hire Resolution') return;
      const prev = gameState;
      gameState = hireCurrentHero(gameState, playerId);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onPass: (playerId) => {
      if (phase !== 'Hire Resolution') return;
      const prev = gameState;
      gameState = passOnCurrentHire(gameState, playerId);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onAssignHero: (playerId, heroId, missionId) => {
      if (phase !== 'Assignment') return;
      const prev = gameState;
      gameState = assignHiredHeroToPreparationMission(gameState, playerId, heroId, missionId);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onStartPoach: (toPlayerId, rangerHeroId, fromMissionId, targetMissionId, priceSilver) => {
      if (phase !== 'Ranger Poach') return;
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
      if (phase !== 'Ranger Poach') return;
      const prev = gameState;
      gameState = matchPendingPoach(gameState, playerId);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onDeclinePoach: (playerId) => {
      if (phase !== 'Ranger Poach') return;
      const prev = gameState;
      gameState = declinePendingPoach(gameState, playerId);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onDepartMission: (playerId, missionId) => {
      if (phase !== 'Departure') return;
      const prev = gameState;
      gameState = departPreparationMission(gameState, playerId, missionId);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onAdvanceWorldMap: () => {
      if (phase !== 'World Map Advance') return;
      const prev = gameState;
      gameState = advanceWorldMap(gameState);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onAcceptMission: (playerId, missionId) => {
      if (phase !== 'Accept Missions') return;
      const prev = gameState;
      gameState = acceptMissionFromBoard(gameState, playerId, missionId);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onResolveMission: (missionId) => {
      if (phase !== 'Mission Resolution') return;
      const prev = gameState;
      gameState = resolveReadyMissionDemo(gameState, missionId);
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onContinuePhase: () => {
      if (!canContinue) return;
      currentDemoPhaseIndex = Math.min(currentDemoPhaseIndex + 1, demoPhases.length - 1);
      render();
    },
    onDismissPopup: () => {
      popupQueue = popupQueue.slice(1);
      render();
    },
  }, popupMessage, phase, actingPlayer, phaseInstruction[phase], canContinue);
};

render();
