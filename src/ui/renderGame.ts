import { GameState, HeroId, HiringRowKey, MissionId, PlayerState, WorldMapZoneView } from '../core/types';
import {
  canPlayerAffordRowOffer,
  getActualOffer,
  getCurrentResolutionItem,
  getHiringRowDefinition,
  HIRING_ROW_DEFS,
  isPriestUnavailableForPlayer,
} from '../core/hiring';

interface RenderActions {
  onAdjustExtraPay: (playerId: string, rowKey: HiringRowKey, delta: 1 | -1) => void;
  onLockOffers: () => void;
  onHire: (playerId: string) => void;
  onPass: (playerId: string) => void;
}

const getMissionTitle = (state: GameState, missionId: MissionId | null): string => {
  if (!missionId) return 'Empty';
  const mission = state.missions.find((item) => item.id === missionId);
  return mission ? mission.title : missionId;
};

const getHeroName = (state: GameState, heroId: HeroId): string => {
  const hero = state.heroes.find((item) => item.id === heroId);
  if (!hero) return heroId;
  return `${hero.name} (${hero.heroClass} Lv.${hero.level})`;
};

const toMissionTitleList = (state: GameState, missionIds: MissionId[]): string => {
  return missionIds.length ? missionIds.map((id) => getMissionTitle(state, id)).join(', ') : '-';
};

const toHeroNameList = (state: GameState, heroIds: HeroId[]): string => {
  return heroIds.length ? heroIds.map((id) => getHeroName(state, id)).join(', ') : '-';
};

const attachActionButtons = (
  root: HTMLElement,
  actions: RenderActions,
): void => {
  root.querySelectorAll<HTMLElement>('[data-action=\"adjust-extra-pay\"]').forEach((button) => {
    button.addEventListener('click', () => {
      const playerId = button.dataset.playerId;
      const rowKey = button.dataset.rowKey as HiringRowKey | undefined;
      const delta = button.dataset.delta === '-1' ? -1 : 1;
      if (!playerId || !rowKey) return;
      actions.onAdjustExtraPay(playerId, rowKey, delta);
    });
  });

  root.querySelectorAll<HTMLElement>('[data-action=\"lock-offers\"]').forEach((button) => {
    button.addEventListener('click', () => {
      actions.onLockOffers();
    });
  });

  root.querySelectorAll<HTMLElement>('[data-action=\"hire\"]').forEach((button) => {
    button.addEventListener('click', () => {
      const playerId = button.dataset.playerId;
      if (!playerId) return;
      actions.onHire(playerId);
    });
  });

  root.querySelectorAll<HTMLElement>('[data-action=\"pass\"]').forEach((button) => {
    button.addEventListener('click', () => {
      const playerId = button.dataset.playerId;
      if (!playerId) return;
      actions.onPass(playerId);
    });
  });

};

const renderPreparationSlots = (state: GameState, missionSlots: Array<MissionId | null>): string => {
  return `
    <div class="prep-slots">
      ${missionSlots
        .map((missionId, index) => {
          const isLeft = index === 0;
          const isRight = index === missionSlots.length - 1;
          const marker = isLeft ? 'Newest' : isRight ? 'Oldest' : `Slot ${index + 1}`;
          return `
            <div class="prep-slot">
              <small>${marker}</small>
              <span>${getMissionTitle(state, missionId)}</span>
            </div>
          `;
        })
        .join('')}
    </div>
  `;
};

const renderHiringRows = (player: PlayerState, offersLocked: boolean): string => {
  return `
    <div class=\"hiring-rows\">
      ${HIRING_ROW_DEFS.map((row) => {
        const extraPay = player.hiringBoardExtraPay[row.key];
        const actualOffer = getActualOffer(player, row.key);
        const priestBlocked = isPriestUnavailableForPlayer(player, row.key);
        const controlsDisabled = offersLocked || priestBlocked;
        const rowClass = priestBlocked ? 'hiring-row disabled-row' : 'hiring-row';
        const currency = row.currency === 'silver' ? 'silver' : 'gem';

        return `
          <div class=\"${rowClass}\">
            <div class=\"hiring-row-name\">${row.heroClass} Lv.${row.level}</div>
            <div>Min: ${row.minWage} ${currency}</div>
            <div>Extra: ${extraPay}</div>
            <div>Offer: ${actualOffer} ${currency}</div>
            <div class=\"hiring-row-controls\">
              <button data-action=\"adjust-extra-pay\" data-player-id=\"${player.id}\" data-row-key=\"${row.key}\" data-delta=\"-1\" ${controlsDisabled || extraPay === 0 ? 'disabled' : ''}>-</button>
              <button data-action=\"adjust-extra-pay\" data-player-id=\"${player.id}\" data-row-key=\"${row.key}\" data-delta=\"1\" ${controlsDisabled ? 'disabled' : ''}>+</button>
            </div>
            ${priestBlocked ? '<small>Unavailable: negative reputation</small>' : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
};

const renderHiredPool = (state: GameState, player: PlayerState): string => {
  return `
    <div>
      <h3>Hired Pool</h3>
      <p>${toHeroNameList(state, player.hiredPoolHeroIds)}</p>
    </div>
  `;
};

const renderHiringResolutionPanel = (state: GameState): string => {
  const current = getCurrentResolutionItem(state);
  if (!state.hiring.offersLocked) {
    return '<p>Offers not locked yet.</p>';
  }

  if (!current) {
    return '<p>Hiring resolution complete.</p>';
  }

  const hero = state.heroes.find((item) => item.id === current.heroId);
  const activePlayerId = current.priorityPlayerIds[current.currentPriorityIndex];
  const activePlayer = state.players.find((player) => player.id === activePlayerId);
  const row = getHiringRowDefinition(current.rowKey);
  const canAfford = activePlayer ? canPlayerAffordRowOffer(activePlayer, current.rowKey) : false;
  const priestBlocked = activePlayer ? isPriestUnavailableForPlayer(activePlayer, current.rowKey) : false;
  const hireDisabled = !canAfford || priestBlocked;
  const disabledReason = priestBlocked
    ? 'Priest unavailable due to negative reputation.'
    : !canAfford
      ? 'Cannot afford this offer.'
      : '';

  return `
    <div class=\"resolution-panel\">
      <p><strong>Resolving Hero:</strong> ${hero ? `${hero.name} (${hero.heroClass} Lv.${hero.level})` : current.heroId}</p>
      <p><strong>Row:</strong> ${row.heroClass} Lv.${row.level}</p>
      <p><strong>Current Priority:</strong> ${activePlayer ? activePlayer.name : activePlayerId}</p>
      ${disabledReason ? `<p class=\"warning\">${disabledReason}</p>` : ''}
      <div class=\"resolution-actions\">
        <button data-action=\"hire\" data-player-id=\"${activePlayerId}\" ${hireDisabled ? 'disabled' : ''}>Hire</button>
        <button data-action=\"pass\" data-player-id=\"${activePlayerId}\">Pass</button>
      </div>
    </div>
  `;
};

const getMissionBoardPositionLabel = (slotIndex: number, totalSlots: number): string => {
  if (slotIndex === 0) return 'Newest';
  if (slotIndex === totalSlots - 1) return 'Oldest';
  if (slotIndex === totalSlots - 2) return 'Second Oldest';
  return 'Middle';
};

const getMissionBoardBonusLabel = (slotIndex: number, totalSlots: number): string => {
  if (slotIndex === totalSlots - 1) return '+1 Gem';
  if (slotIndex === totalSlots - 2) return '+1 Silver';
  return '-';
};

const renderStageRoundPanel = (state: GameState): string => {
  return `
    <section class="panel stage-round">
      <h2>Stage / Round</h2>
      <div class="stats-row">
        <span>Stage: <strong>${state.stage}</strong></span>
        <span>Round: <strong>${state.round}</strong></span>
      </div>
      <div class="stats-row">
        <span>Demon King: <strong>${state.environment.demonKingAppliesThisRound ? 'ON' : 'OFF'}</strong></span>
        <span>Overflow: <strong>${state.environment.overflowTriggeredThisRound ? 'YES' : 'NO'}</strong></span>
      </div>
    </section>
  `;
};

const renderHeroVillage = (state: GameState): string => {
  return `
    <section class="panel hero-village">
      <h2>Hero Village (Public Pool)</h2>
      <ul class="hero-list">
        ${state.heroVillageHeroIds
          .map((heroId) => {
            const hero = state.heroes.find((entry) => entry.id === heroId);
            if (!hero) {
              return `<li><strong>${heroId}</strong><span>Unknown Hero</span></li>`;
            }

            return `
              <li>
                <strong>${hero.name}</strong>
                <span>${hero.heroClass} Lv.${hero.level}</span>
              </li>
            `;
          })
          .join('')}
      </ul>
    </section>
  `;
};

const renderMissionBoard = (state: GameState): string => {
  const totalSlots = state.missionBoard.length;

  return `
    <section class="panel mission-board">
      <h2>Public Mission Board</h2>
      <p class="hint">Left = newest, Right = oldest</p>
      <div class="mission-slots">
        ${state.missionBoard
          .map((slot, position) => {
            const missionTitle = getMissionTitle(state, slot.missionId);
            const positionLabel = getMissionBoardPositionLabel(position, totalSlots);
            const bonusLabel = getMissionBoardBonusLabel(position, totalSlots);

            return `
              <article class="slot-card">
                <header>
                  <span>Slot ${position + 1}</span>
                  <small>${positionLabel}</small>
                </header>
                <div class="slot-mission">${missionTitle}</div>
                <div class="slot-bonus">${bonusLabel}</div>
              </article>
            `;
          })
          .join('')}
      </div>
    </section>
  `;
};

const renderZone = (state: GameState, zone: WorldMapZoneView): string => {
  return `
    <article class="zone-card">
      <h3>${zone.zone}</h3>
      <ul>
        <li><strong>1-turn lane:</strong> ${toMissionTitleList(state, zone.lanes.oneTurn)}</li>
        <li><strong>2-turn lane:</strong> ${toMissionTitleList(state, zone.lanes.twoTurn)}</li>
        <li><strong>3-turn lane:</strong> ${toMissionTitleList(state, zone.lanes.threeTurn)}</li>
      </ul>
    </article>
  `;
};

const renderWorldMap = (state: GameState): string => {
  return `
    <section class="panel world-map">
      <h2>World Map</h2>
      <div class="zones-grid">
        ${state.worldMap.map((zone) => renderZone(state, zone)).join('')}
      </div>
    </section>
  `;
};

const renderPlayerMat = (state: GameState, playerId: string): string => {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return '';

  return `
    <section class="panel player-mat">
      <h2>${player.name} Mat</h2>
      <div class="stats-row">
        <span>Reputation: <strong>${player.reputation}</strong></span>
        <span>Silver: <strong>${player.silver}</strong></span>
        <span>Gems: <strong>${player.gems}</strong></span>
      </div>
      <div class="mat-grid">
        <div>
          <h3>Preparation Area</h3>
          ${renderPreparationSlots(state, player.preparationSlots)}
        </div>
        <div>
          <h3>Rest Zone</h3>
          <p>${toHeroNameList(state, player.restZoneHeroIds)}</p>
        </div>
        <div>
          <h3>Backlog Area</h3>
          <p>${toMissionTitleList(state, player.backlogMissionIds)}</p>
        </div>
        ${renderHiredPool(state, player)}
      </div>
      <section class=\"subpanel\">
        <h3>Guild Hiring Board</h3>
        ${renderHiringRows(player, state.hiring.offersLocked)}
      </section>
    </section>
  `;
};

export const renderGame = (root: HTMLElement, state: GameState, actions: RenderActions): void => {
  root.innerHTML = `
    <main class="app-shell">
      <h1>Fantasy Adventurers Guild — Prototype Scaffold</h1>
      ${renderStageRoundPanel(state)}
      <section class="panel">
        <h2>Hire Resolution</h2>
        <button data-action="lock-offers" ${state.hiring.offersLocked ? 'disabled' : ''}>Lock Offers / Start Hiring</button>
        ${renderHiringResolutionPanel(state)}
      </section>
      ${renderHeroVillage(state)}
      ${renderMissionBoard(state)}
      ${renderWorldMap(state)}
      <section class="players-grid">
        ${renderPlayerMat(state, 'p1')}
        ${renderPlayerMat(state, 'p2')}
      </section>
    </main>
  `;

  attachActionButtons(root, actions);
};
