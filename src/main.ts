import './styles/app.css';
import {
  createInitialState,
  hireCurrentHero,
  lockOffersAndStartHiring,
  passOnCurrentHire,
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
  });
};

render();
