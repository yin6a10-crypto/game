import './styles/app.css';
import {
  acceptMissionFromBoard,
  advanceWorldMap,
  assignHiredHeroToPreparationMission,
  createInitialState,
  declinePendingPoach,
  departPreparationMission,
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
import { getEligibleAssignedRangersForPoaching, getValidRangerTargetMissions } from './core/poaching';
import { GameState } from './core/types';
import { renderGame } from './ui/renderGame';
import { isEntryReadyToResolve } from './core/worldMap';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Root container #app was not found.');

type DemoPhase =
  | 'Accept Missions'
  | 'Guild Hiring'
  | 'Hire Resolution'
  | 'Assignment'
  | 'Ranger Poach'
  | 'Departure'
  | 'World Map Advance'
  | 'Mission Resolution'
  | 'End Round';

type QueuedDeparture = { playerId: string; missionId: string };

const demoPhases: DemoPhase[] = [
  'Accept Missions',
  'Guild Hiring',
  'Hire Resolution',
  'Assignment',
  'Ranger Poach',
  'Departure',
  'World Map Advance',
  'Mission Resolution',
  'End Round',
];

const STARTING_RESOURCES = { reputation: 0, silver: 6, gold: 1, gems: 2 } as const;

let gameState = createInitialState();
let popupQueue: string[] = [];
let isSetupComplete = false;
let stage1Deck: string[] = [];
const stage2Deck: string[] = [];
const stage3Deck: string[] = [];
let currentDemoPhaseIndex = 0;
let activeAcceptPlayerIndex = 0;
let passedAcceptPlayers = new Set<string>();
let lockedHiringPlayers = new Set<string>();
let finishedAssignmentPlayers = new Set<string>();
let queuedDepartures: QueuedDeparture[] = [];

const phaseInstruction: Record<DemoPhase, string> = {
  'Accept Missions': 'Choose 1 mission or pass.',
  'Guild Hiring': 'Set class base pay, then lock offers.',
  'Hire Resolution': 'Hire or pass on the current hero.',
  Assignment: 'Assign heroes, then finish assignment.',
  'Ranger Poach': 'Resolve poach window.',
  Departure: 'Select missions to depart.',
  'World Map Advance': 'Advance all world map missions.',
  'Mission Resolution': 'Resolve ready missions.',
  'End Round': 'Start the next round.',
};

const enqueuePopup = (message: string): void => {
  if (popupQueue.includes(message)) return;
  popupQueue.push(message);
};

const getCurrentDemoPhase = (): DemoPhase => demoPhases[currentDemoPhaseIndex];

const getDeckCounts = (): { stage1: number; stage2: number; stage3: number } => ({
  stage1: stage1Deck.length,
  stage2: stage2Deck.length,
  stage3: stage3Deck.length,
});

const generatePublicMissions = (count: number): void => {
  let remaining = count;
  gameState = {
    ...gameState,
    missionBoard: gameState.missionBoard.map((slot) => {
      if (remaining <= 0 || slot.missionId !== null) return slot;
      const nextMissionId = stage1Deck.shift() ?? null;
      if (!nextMissionId) return slot;
      remaining -= 1;
      return { ...slot, missionId: nextMissionId };
    }),
  };
};

const generateHeroVillageTokens = (count: number): void => {
  const availableIds = gameState.heroes
    .filter((hero) => hero.level === 1)
    .map((hero) => hero.id)
    .filter((id) => !gameState.heroVillageHeroIds.includes(id));
  gameState = {
    ...gameState,
    heroVillageHeroIds: [...gameState.heroVillageHeroIds, ...availableIds.slice(0, count)],
  };
};

const getNextAcceptPlayerIndex = (): number => {
  for (let offset = 1; offset <= gameState.players.length; offset += 1) {
    const idx = (activeAcceptPlayerIndex + offset) % gameState.players.length;
    const id = gameState.players[idx]?.id;
    if (id && !passedAcceptPlayers.has(id)) return idx;
  }
  return activeAcceptPlayerIndex;
};

const announcePhase = (phase: DemoPhase): void => {
  if (phase === 'Accept Missions') {
    enqueuePopup(`${gameState.players[activeAcceptPlayerIndex]?.name ?? 'Player'}: choose 1 mission or pass.`);
    return;
  }
  if (phase === 'Guild Hiring') return enqueuePopup('Set base pay and lock offers.');
  if (phase === 'Hire Resolution') return enqueuePopup('Resolve hiring order.');
  if (phase === 'Assignment') return enqueuePopup('Assign heroes, then finish.');
  if (phase === 'Ranger Poach') return enqueuePopup('Ranger poach window is open.');
  if (phase === 'Departure') return enqueuePopup('Select missions to depart.');
  if (phase === 'World Map Advance') return enqueuePopup('Departures finalized. Advance map.');
  if (phase === 'Mission Resolution') return enqueuePopup('Resolve ready missions.');
  enqueuePopup('Round ended.');
};

const initializeDemoSetup = (): void => {
  stage1Deck = gameState.missions.filter((m) => m.stage === 1).map((m) => m.id);
  gameState = {
    ...gameState,
    missionBoard: gameState.missionBoard.map((slot) => ({ ...slot, missionId: null })),
    heroVillageHeroIds: [],
    players: gameState.players.map((player) => ({
      ...player,
      reputation: STARTING_RESOURCES.reputation,
      silver: STARTING_RESOURCES.silver,
      gold: STARTING_RESOURCES.gold,
      gems: STARTING_RESOURCES.gems,
      preparationSlots: [null, null, null, null, null],
      restZoneHeroIds: [],
      hiredPoolHeroIds: [],
    })),
    assignment: { ...gameState.assignment, assignedHeroIdsByMission: {} },
  };
  isSetupComplete = true;
  currentDemoPhaseIndex = 0;
  activeAcceptPlayerIndex = 0;
  passedAcceptPlayers = new Set();
  lockedHiringPlayers = new Set();
  finishedAssignmentPlayers = new Set();
  queuedDepartures = [];
  generatePublicMissions(2);
  enqueuePopup('2 Public Missions appeared.');
  generateHeroVillageTokens(2);
  enqueuePopup('2 Level 1 heroes entered Hero Village.');
  announcePhase(getCurrentDemoPhase());
};

const hasAnyPoachAvailable = (): boolean =>
  gameState.players.some(
    (player) =>
      getValidRangerTargetMissions(gameState, player.id).length > 0 &&
      getEligibleAssignedRangersForPoaching(gameState, player.id).length > 0,
  );

const hasAnyDepartable = (): boolean =>
  gameState.players.some((player) =>
    player.preparationSlots.some((missionId) => missionId !== null && canDepartMission(gameState, player.id, missionId)),
  );

const hasRemainingDepartableNotQueued = (): boolean =>
  gameState.players.some((player) =>
    player.preparationSlots.some((missionId) => {
      if (!missionId || !canDepartMission(gameState, player.id, missionId)) return false;
      return !queuedDepartures.some((entry) => entry.playerId === player.id && entry.missionId === missionId);
    }),
  );

const finalizeQueuedDepartures = (): void => {
  queuedDepartures.forEach((entry) => {
    gameState = departPreparationMission(gameState, entry.playerId, entry.missionId);
  });
  queuedDepartures = [];
};

const hasReadyResolve = (): boolean =>
  gameState.worldMap.some(
    (zone) =>
      zone.lanes.oneTurn.some((entry) => isEntryReadyToResolve(entry, 1)) ||
      zone.lanes.twoTurn.some((entry) => isEntryReadyToResolve(entry, 2)) ||
      zone.lanes.threeTurn.some((entry) => isEntryReadyToResolve(entry, 3)),
  );

const autoAdvanceIfComplete = (): void => {
  const phase = getCurrentDemoPhase();
  if (phase === 'Accept Missions' && passedAcceptPlayers.size === gameState.players.length) {
    enqueuePopup('Both players passed. Moving to hiring.');
    currentDemoPhaseIndex = 1;
    announcePhase(getCurrentDemoPhase());
  } else if (phase === 'Guild Hiring' && lockedHiringPlayers.size === gameState.players.length) {
    gameState = lockOffersAndStartHiring(gameState);
    enqueuePopup('Both offers locked. Hiring begins.');
    currentDemoPhaseIndex = 2;
  } else if (phase === 'Hire Resolution' && !getCurrentResolutionItem(gameState)) {
    enqueuePopup('Hiring finished. Now assign heroes.');
    currentDemoPhaseIndex = 3;
  } else if (phase === 'Assignment' && finishedAssignmentPlayers.size === gameState.players.length) {
    currentDemoPhaseIndex = 4;
    if (!hasAnyPoachAvailable()) {
      enqueuePopup('No poach available. Move to departures.');
      currentDemoPhaseIndex = 5;
    }
  } else if (phase === 'Ranger Poach' && !gameState.poaching.pending && !hasAnyPoachAvailable()) {
    if (queuedDepartures.length > 0) {
      finalizeQueuedDepartures();
      currentDemoPhaseIndex = 6;
      announcePhase(getCurrentDemoPhase());
    } else {
      currentDemoPhaseIndex = 5;
      announcePhase(getCurrentDemoPhase());
    }
  } else if (phase === 'Departure' && !hasAnyDepartable() && queuedDepartures.length === 0) {
    enqueuePopup('No missions can depart. Moving on.');
    currentDemoPhaseIndex = 6;
  } else if (phase === 'Departure' && queuedDepartures.length > 0 && !hasRemainingDepartableNotQueued()) {
    enqueuePopup('Departure selected. Final poach window.');
    currentDemoPhaseIndex = 4;
  } else if (phase === 'World Map Advance') {
    currentDemoPhaseIndex = 7;
    announcePhase(getCurrentDemoPhase());
    if (!hasReadyResolve()) {
      currentDemoPhaseIndex = 8;
      announcePhase(getCurrentDemoPhase());
    }
  } else if (phase === 'Mission Resolution' && !hasReadyResolve()) {
    currentDemoPhaseIndex = 8;
    announcePhase(getCurrentDemoPhase());
  }
};

const collectGuidanceMessages = (previous: GameState, next: GameState): string[] => {
  const messages: string[] = [];

  next.missions.forEach((mission) => {
    if (!isMissionFullyStaffed(previous, mission.id) && isMissionFullyStaffed(next, mission.id)) {
      messages.push('A mission is fully staffed.');
    }
  });

  if (previous.hiring.offersLocked && getCurrentResolutionItem(previous) && !getCurrentResolutionItem(next)) {
    messages.push('Hiring finished. Now assign heroes.');
  }

  const wasReady = previous.worldMap.some(
    (zone) =>
      zone.lanes.oneTurn.some((entry) => isEntryReadyToResolve(entry, 1)) ||
      zone.lanes.twoTurn.some((entry) => isEntryReadyToResolve(entry, 2)) ||
      zone.lanes.threeTurn.some((entry) => isEntryReadyToResolve(entry, 3)),
  );
  const isReady = next.worldMap.some(
    (zone) =>
      zone.lanes.oneTurn.some((entry) => isEntryReadyToResolve(entry, 1)) ||
      zone.lanes.twoTurn.some((entry) => isEntryReadyToResolve(entry, 2)) ||
      zone.lanes.threeTurn.some((entry) => isEntryReadyToResolve(entry, 3)),
  );
  if (!wasReady && isReady) messages.push('A mission is ready to resolve.');

  if (!previous.poaching.pending && next.poaching.pending) messages.push('A Ranger poach is available.');

  return messages;
};

const render = (): void => {
  const popupMessage = popupQueue[0] ?? null;
  const setupPhase = !isSetupComplete;
  const phase = getCurrentDemoPhase();
  const currentHire = getCurrentResolutionItem(gameState);
  const pendingPoach = gameState.poaching.pending;
  const actingPlayer =
    setupPhase
      ? 'System'
      : phase === 'Accept Missions'
        ? gameState.players[activeAcceptPlayerIndex]?.name ?? 'Player'
        : phase === 'Hire Resolution' && currentHire
          ? gameState.players.find((p) => p.id === currentHire.priorityPlayerIds[currentHire.currentPriorityIndex])
              ?.name ?? '-'
          : phase === 'Ranger Poach' && pendingPoach
            ? gameState.players.find((p) => p.id === pendingPoach.fromPlayerId)?.name ?? '-'
            : 'Both Players';

  renderGame(
    root,
    gameState,
    {
      onAdjustExtraPay: (playerId, rowKey, delta) => {
        if (phase !== 'Guild Hiring') return;
        const prev = gameState;
        gameState = updateHiringExtraPay(gameState, playerId, rowKey, delta);
        collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
        autoAdvanceIfComplete();
        render();
      },
      onLockOffers: () => undefined,
      onLockOffersPlayer: (playerId) => {
        if (phase !== 'Guild Hiring' || lockedHiringPlayers.has(playerId)) return;
        lockedHiringPlayers.add(playerId);
        autoAdvanceIfComplete();
        render();
      },
      onHire: (playerId) => {
        if (phase !== 'Hire Resolution') return;
        const prev = gameState;
        gameState = hireCurrentHero(gameState, playerId);
        collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
        autoAdvanceIfComplete();
        render();
      },
      onPass: (playerId) => {
        if (phase !== 'Hire Resolution') return;
        const prev = gameState;
        gameState = passOnCurrentHire(gameState, playerId);
        collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
        autoAdvanceIfComplete();
        render();
      },
      onAssignHero: (playerId, heroId, missionId) => {
        if (phase !== 'Assignment') return;
        const prev = gameState;
        gameState = assignHiredHeroToPreparationMission(gameState, playerId, heroId, missionId);
        collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
        autoAdvanceIfComplete();
        render();
      },
      onFinishAssignment: (playerId) => {
        if (phase !== 'Assignment') return;
        finishedAssignmentPlayers.add(playerId);
        autoAdvanceIfComplete();
        render();
      },
      onStartPoach: (toPlayerId, rangerHeroId, fromMissionId, targetMissionId, priceSilver) => {
        if (phase !== 'Ranger Poach') return;
        const prev = gameState;
        gameState = startRangerPoachAttempt(gameState, toPlayerId, rangerHeroId, fromMissionId, targetMissionId, priceSilver);
        collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
        autoAdvanceIfComplete();
        render();
      },
      onMatchPoach: (playerId) => {
        if (phase !== 'Ranger Poach') return;
        const prev = gameState;
        gameState = matchPendingPoach(gameState, playerId);
        collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
        autoAdvanceIfComplete();
        render();
      },
      onDeclinePoach: (playerId) => {
        if (phase !== 'Ranger Poach') return;
        const prev = gameState;
        gameState = declinePendingPoach(gameState, playerId);
        collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
        autoAdvanceIfComplete();
        render();
      },
      onDepartMission: (playerId, missionId) => {
        if (phase !== 'Departure') return;
        if (queuedDepartures.some((entry) => entry.playerId === playerId && entry.missionId === missionId)) return;
        queuedDepartures = [...queuedDepartures, { playerId, missionId }];
        enqueuePopup('Mission marked for departure.');
        autoAdvanceIfComplete();
        render();
      },
      onAdvanceWorldMap: () => {
        if (phase !== 'World Map Advance') return;
        const prev = gameState;
        gameState = advanceWorldMap(gameState);
        collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
        autoAdvanceIfComplete();
        render();
      },
      onAcceptMission: (playerId, missionId) => {
        if (phase !== 'Accept Missions' || setupPhase) return;
        const activePlayerId = gameState.players[activeAcceptPlayerIndex]?.id;
        if (playerId !== activePlayerId || passedAcceptPlayers.has(playerId)) return;
        const prev = gameState;
        gameState = acceptMissionFromBoard(gameState, playerId, missionId);
        activeAcceptPlayerIndex = getNextAcceptPlayerIndex();
        collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
        autoAdvanceIfComplete();
        render();
      },
      onAcceptPass: () => {
        if (phase !== 'Accept Missions' || setupPhase) return;
        const activePlayerId = gameState.players[activeAcceptPlayerIndex]?.id;
        if (!activePlayerId) return;
        passedAcceptPlayers.add(activePlayerId);
        activeAcceptPlayerIndex = getNextAcceptPlayerIndex();
        autoAdvanceIfComplete();
        render();
      },
      onResolveMission: (missionId) => {
        if (phase !== 'Mission Resolution') return;
        const prev = gameState;
        gameState = resolveReadyMissionDemo(gameState, missionId);
        collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
        autoAdvanceIfComplete();
        render();
      },
      onContinuePhase: () => {
        if (popupQueue.length > 0) return;
        if (setupPhase) {
          initializeDemoSetup();
          render();
          return;
        }
        if (phase === 'End Round') {
          currentDemoPhaseIndex = 0;
          passedAcceptPlayers = new Set();
          activeAcceptPlayerIndex = 0;
          lockedHiringPlayers = new Set();
          finishedAssignmentPlayers = new Set();
          queuedDepartures = [];
          generatePublicMissions(2);
          enqueuePopup('2 Public Missions appeared.');
          generateHeroVillageTokens(2);
          enqueuePopup('2 Level 1 heroes entered Hero Village.');
          announcePhase(getCurrentDemoPhase());
          render();
        }
      },
      onDismissPopup: () => {
        popupQueue = popupQueue.slice(1);
        render();
      },
    },
    popupMessage,
    setupPhase ? 'Game Setup' : phase,
    actingPlayer,
    setupPhase ? 'Initialize heroes, missions, and starting resources.' : phaseInstruction[phase],
    popupQueue.length === 0,
    getDeckCounts(),
    setupPhase,
    gameState.players[activeAcceptPlayerIndex]?.id ?? null,
    lockedHiringPlayers,
    finishedAssignmentPlayers,
    queuedDepartures,
  );
};

render();
