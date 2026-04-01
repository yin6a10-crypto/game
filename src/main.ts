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
import { renderGame } from './ui/renderGame';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Root container #app was not found.');
}

const state = createInitialState();
let gameState = state;

const render = (): void => {
  renderGame(root, gameState, {
    onAdjustExtraPay: (playerId, rowKey, delta) => {
      gameState = updateHiringExtraPay(gameState, playerId, rowKey, delta);
      render();
    },
    onLockOffers: () => {
      gameState = lockOffersAndStartHiring(gameState);
      render();
    },
    onHire: (playerId) => {
      gameState = hireCurrentHero(gameState, playerId);
      render();
    },
    onPass: (playerId) => {
      gameState = passOnCurrentHire(gameState, playerId);
      render();
    },
    onAssignHero: (playerId, heroId, missionId) => {
      gameState = assignHiredHeroToPreparationMission(gameState, playerId, heroId, missionId);
      render();
    },
    onStartPoach: (toPlayerId, rangerHeroId, fromMissionId, targetMissionId, priceSilver) => {
      gameState = startRangerPoachAttempt(
        gameState,
        toPlayerId,
        rangerHeroId,
        fromMissionId,
        targetMissionId,
        priceSilver,
      );
      render();
    },
    onMatchPoach: (playerId) => {
      gameState = matchPendingPoach(gameState, playerId);
      render();
    },
    onDeclinePoach: (playerId) => {
      gameState = declinePendingPoach(gameState, playerId);
      render();
    },
    onDepartMission: (playerId, missionId) => {
      gameState = departPreparationMission(gameState, playerId, missionId);
      render();
    },
    onAdvanceWorldMap: () => {
      gameState = advanceWorldMap(gameState);
      render();
    },
  });
};

render();
