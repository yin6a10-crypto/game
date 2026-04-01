import './styles/app.css';
import { createInitialState } from './core/state';
import { renderGame } from './ui/renderGame';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Root container #app was not found.');
}

const state = createInitialState();
renderGame(root, state);
