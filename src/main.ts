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
let isSetupComplete = false;
let stage1Deck: string[] = [];
const stage2Deck: string[] = [];
const stage3Deck: string[] = [];
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
let activeAcceptPlayerIndex = 0;
let passedAcceptPlayers = new Set<string>();

const STARTING_RESOURCES = {
  reputation: 0,
  silver: 6,
  gold: 1,
  gems: 2,
} as const;

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

const getDeckCounts = (state: GameState): { stage1: number; stage2: number; stage3: number } => {
  return { stage1: stage1Deck.length, stage2: stage2Deck.length, stage3: stage3Deck.length };
};

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
  const generated = availableIds.slice(0, count);
  gameState = {
    ...gameState,
    heroVillageHeroIds: [...gameState.heroVillageHeroIds, ...generated],
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

const initializeDemoSetup = (): void => {
  const stage1Missions = gameState.missions.filter((mission) => mission.stage === 1).map((mission) => mission.id);
  stage1Deck = [...stage1Missions];
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
  generatePublicMissions(2);
  enqueuePopup('Public Missions generated: 2 cards.');
  generateHeroVillageTokens(2);
  enqueuePopup('Hero Village generated: 2 Level 1 heroes.');
};

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
      if (phase !== 'Accept Missions' || setupPhase) return;
      const activePlayerId = gameState.players[activeAcceptPlayerIndex]?.id;
      if (playerId !== activePlayerId || passedAcceptPlayers.has(playerId)) return;
      const prev = gameState;
      gameState = acceptMissionFromBoard(gameState, playerId, missionId);
      activeAcceptPlayerIndex = getNextAcceptPlayerIndex();
      collectGuidanceMessages(prev, gameState).forEach(enqueuePopup);
      render();
    },
    onAcceptPass: () => {
      if (phase !== 'Accept Missions' || setupPhase) return;
      const activePlayerId = gameState.players[activeAcceptPlayerIndex]?.id;
      if (!activePlayerId) return;
      passedAcceptPlayers.add(activePlayerId);
      activeAcceptPlayerIndex = getNextAcceptPlayerIndex();
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
      if (setupPhase) {
        initializeDemoSetup();
        enqueuePopup(`Phase: ${getCurrentDemoPhase()} — Acting: ${gameState.players[0]?.name ?? 'Player 1'} — ${phaseInstruction[getCurrentDemoPhase()]}`);
        render();
        return;
      }
      if (phase === 'Accept Missions' && passedAcceptPlayers.size < gameState.players.length) return;
      if (phase === 'End Round') {
        currentDemoPhaseIndex = 0;
        passedAcceptPlayers = new Set();
        activeAcceptPlayerIndex = 0;
        generatePublicMissions(2);
        enqueuePopup('Public Missions generated: 2 cards.');
        generateHeroVillageTokens(2);
        enqueuePopup('Hero Village generated: 2 Level 1 heroes.');
        const nextPhase = getCurrentDemoPhase();
        enqueuePopup(`Phase: ${nextPhase} — Acting: ${gameState.players[0]?.name ?? 'Player 1'} — ${phaseInstruction[nextPhase]}`);
        render();
        return;
      }

      currentDemoPhaseIndex = Math.min(currentDemoPhaseIndex + 1, demoPhases.length - 1);
      if (phase === 'Accept Missions') {
        passedAcceptPlayers = new Set();
        activeAcceptPlayerIndex = 0;
      }
      const nextPhase = getCurrentDemoPhase();
      enqueuePopup(`Phase: ${nextPhase} — Acting: ${nextPhase === 'Accept Missions' ? gameState.players[0]?.name ?? 'Player 1' : 'Both Players'} — ${phaseInstruction[nextPhase]}`);
      render();
    },
    onDismissPopup: () => {
      popupQueue = popupQueue.slice(1);
      render();
    },
  }, popupMessage, setupPhase ? 'Game Setup' : phase, actingPlayer, setupPhase ? 'Initialize heroes, missions, and starting resources.' : phaseInstruction[phase], canContinue, getDeckCounts(gameState), setupPhase, gameState.players[activeAcceptPlayerIndex]?.id ?? null);
};

render();
