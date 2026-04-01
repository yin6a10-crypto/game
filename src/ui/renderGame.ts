import { GameState, HeroId, HiringRowKey, MissionId, PlayerState, WorldMapLaneEntry, WorldMapZoneView } from '../core/types';
import {
  canPlayerAffordRowOffer,
  getActualOffer,
  getCurrentResolutionItem,
  getHiringRowDefinition,
  HIRING_ROW_DEFS,
  isPriestUnavailableForPlayer,
} from '../core/hiring';
import {
  canAssignHeroToMission as canAssignByRules,
  isMissionFullyStaffed as isMissionFullyStaffedByAssignment,
} from '../core/assignment';
import { canDepartMission } from '../core/departure';
import { getEligibleAssignedRangersForPoaching, getValidRangerTargetMissions } from '../core/poaching';
import { isEntryReadyToResolve } from '../core/worldMap';

interface RenderActions {
  onAdjustExtraPay: (playerId: string, rowKey: HiringRowKey, delta: 1 | -1) => void;
  onLockOffers: () => void;
  onHire: (playerId: string) => void;
  onPass: (playerId: string) => void;
  onAssignHero: (playerId: string, heroId: string, missionId: string) => void;
  onStartPoach: (
    toPlayerId: string,
    rangerHeroId: string,
    fromMissionId: string,
    targetMissionId: string,
    priceSilver: number,
  ) => void;
  onMatchPoach: (playerId: string) => void;
  onDeclinePoach: (playerId: string) => void;
  onDepartMission: (playerId: string, missionId: string) => void;
  onAdvanceWorldMap: () => void;
  onDismissPopup: () => void;
}

const getMissionTitle = (state: GameState, missionId: MissionId | null): string => {
  if (!missionId) return 'Empty';
  const mission = state.missions.find((item) => item.id === missionId);
  return mission ? mission.title : missionId;
};

const getHeroName = (state: GameState, heroId: HeroId): string => {
  const hero = state.heroes.find((item) => item.id === heroId);
  if (!hero) return heroId;
  return `${hero.heroClass} Lv.${hero.level}`;
};

const toMissionTitleList = (state: GameState, missionIds: MissionId[]): string => {
  return missionIds.length ? missionIds.map((id) => getMissionTitle(state, id)).join(', ') : '-';
};

const toHeroNameList = (state: GameState, heroIds: HeroId[]): string => {
  return heroIds.length ? heroIds.map((id) => getHeroName(state, id)).join(', ') : '-';
};

const attachActionButtons = (root: HTMLElement, actions: RenderActions): void => {
  root.querySelectorAll<HTMLElement>('[data-action="adjust-extra-pay"]').forEach((button) => {
    button.addEventListener('click', () => {
      const playerId = button.dataset.playerId;
      const rowKey = button.dataset.rowKey as HiringRowKey | undefined;
      const delta = button.dataset.delta === '-1' ? -1 : 1;
      if (!playerId || !rowKey) return;
      actions.onAdjustExtraPay(playerId, rowKey, delta);
    });
  });

  root.querySelectorAll<HTMLElement>('[data-action="lock-offers"]').forEach((button) => {
    button.addEventListener('click', () => actions.onLockOffers());
  });

  root.querySelectorAll<HTMLElement>('[data-action="hire"]').forEach((button) => {
    button.addEventListener('click', () => {
      const playerId = button.dataset.playerId;
      if (!playerId) return;
      actions.onHire(playerId);
    });
  });

  root.querySelectorAll<HTMLElement>('[data-action="pass"]').forEach((button) => {
    button.addEventListener('click', () => {
      const playerId = button.dataset.playerId;
      if (!playerId) return;
      actions.onPass(playerId);
    });
  });

  root.querySelectorAll<HTMLElement>('[data-action="assign-hero"]').forEach((button) => {
    button.addEventListener('click', () => {
      const playerId = button.dataset.playerId;
      const heroId = button.dataset.heroId;
      const missionId = button.dataset.missionId;
      if (!playerId || !heroId || !missionId) return;
      actions.onAssignHero(playerId, heroId, missionId);
    });
  });

  root.querySelectorAll<HTMLElement>('[data-action="start-poach"]').forEach((button) => {
    button.addEventListener('click', () => {
      const toPlayerId = button.dataset.toPlayerId;
      const rangerHeroId = button.dataset.rangerHeroId;
      const fromMissionId = button.dataset.fromMissionId;
      const targetSelectId = button.dataset.targetSelectId;
      const priceInputId = button.dataset.priceInputId;
      if (!toPlayerId || !rangerHeroId || !fromMissionId || !targetSelectId || !priceInputId) return;

      const targetSelect = root.querySelector<HTMLSelectElement>(`#${targetSelectId}`);
      const priceInput = root.querySelector<HTMLInputElement>(`#${priceInputId}`);
      if (!targetSelect || !priceInput) return;

      actions.onStartPoach(toPlayerId, rangerHeroId, fromMissionId, targetSelect.value, Number(priceInput.value));
    });
  });

  root.querySelectorAll<HTMLElement>('[data-action="match-poach"]').forEach((button) => {
    button.addEventListener('click', () => {
      const playerId = button.dataset.playerId;
      if (!playerId) return;
      actions.onMatchPoach(playerId);
    });
  });

  root.querySelectorAll<HTMLElement>('[data-action="decline-poach"]').forEach((button) => {
    button.addEventListener('click', () => {
      const playerId = button.dataset.playerId;
      if (!playerId) return;
      actions.onDeclinePoach(playerId);
    });
  });

  root.querySelectorAll<HTMLElement>('[data-action="depart-mission"]').forEach((button) => {
    button.addEventListener('click', () => {
      const playerId = button.dataset.playerId;
      const missionId = button.dataset.missionId;
      if (!playerId || !missionId) return;
      actions.onDepartMission(playerId, missionId);
    });
  });

  root.querySelectorAll<HTMLElement>('[data-action="advance-world-map"]').forEach((button) => {
    button.addEventListener('click', () => {
      actions.onAdvanceWorldMap();
    });
  });

  root.querySelectorAll<HTMLElement>('[data-action="dismiss-popup"]').forEach((button) => {
    button.addEventListener('click', () => {
      actions.onDismissPopup();
    });
  });
};

const renderPreparationSlots = (state: GameState, player: PlayerState): string => {
  return `
    <div class="prep-slots">
      ${player.preparationSlots
        .map((missionId, index) => {
          const marker = index === 0 ? 'Newest' : index === player.preparationSlots.length - 1 ? 'Oldest' : `Slot ${index + 1}`;
          const assignedIds = missionId ? state.assignment.assignedHeroIdsByMission[missionId] ?? [] : [];
          const assignedNames = assignedIds.length ? assignedIds.map((id) => getHeroName(state, id)).join(', ') : '-';
          const staffed = missionId ? isMissionFullyStaffedByAssignment(state, missionId) : false;
          const assignControls =
            missionId === null
              ? ''
              : `<div class="assign-controls">${player.hiredPoolHeroIds
                  .map((heroId) => {
                    const enabled = canAssignByRules(state, player.id, heroId, missionId);
                    return `<button data-action="assign-hero" data-player-id="${player.id}" data-hero-id="${heroId}" data-mission-id="${missionId}" ${enabled && !state.poaching.pending ? '' : 'disabled'}>Assign ${getHeroName(state, heroId)}</button>`;
                  })
                  .join('')}</div>`;

          return `
            <div class="prep-slot">
              <small>${marker}</small>
              <span>${getMissionTitle(state, missionId)}</span>
              ${missionId ? `<small>Assigned: ${assignedNames}</small>` : ''}
              ${missionId ? `<small>Status: ${staffed ? 'Fully Staffed' : 'Needs Roles'}</small>` : ''}
              ${
                missionId && canDepartMission(state, player.id, missionId)
                  ? `<button data-action="depart-mission" data-player-id="${player.id}" data-mission-id="${missionId}" ${state.poaching.pending ? 'disabled' : ''}>Depart</button>`
                  : ''
              }
              ${assignControls}
            </div>
          `;
        })
        .join('')}
    </div>
  `;
};

const renderHiringRows = (player: PlayerState, offersLocked: boolean, isPoachPending: boolean): string => {
  return `
    <div class="hiring-rows">
      ${HIRING_ROW_DEFS.map((row) => {
        const extraPay = player.hiringBoardExtraPay[row.key];
        const actualOffer = getActualOffer(player, row.key);
        const priestBlocked = isPriestUnavailableForPlayer(player, row.key);
        const controlsDisabled = offersLocked || priestBlocked;
        const rowClass = priestBlocked ? 'hiring-box disabled-row' : 'hiring-box';
        const currency = row.currency === 'silver' ? 'silver' : 'gem';
        return `
          <div class="${rowClass}">
            <div class="hiring-row-name">${row.heroClass} Lv.${row.level}</div>
            <div class="hiring-pay">Pay: ${actualOffer} ${currency}</div>
            <div class="hiring-row-controls">
              <button data-action="adjust-extra-pay" data-player-id="${player.id}" data-row-key="${row.key}" data-delta="-1" ${controlsDisabled || extraPay === 0 || isPoachPending ? 'disabled' : ''}>-</button>
              <button data-action="adjust-extra-pay" data-player-id="${player.id}" data-row-key="${row.key}" data-delta="1" ${controlsDisabled || isPoachPending ? 'disabled' : ''}>+</button>
            </div>
            ${priestBlocked ? '<small>Unavailable: negative reputation</small>' : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
};

const renderHiredPool = (state: GameState, player: PlayerState): string => `<div><h3>Hired Pool</h3><p>${toHeroNameList(state, player.hiredPoolHeroIds)}</p></div>`;

const renderPoachingPanel = (state: GameState, player: PlayerState): string => {
  const candidates = getEligibleAssignedRangersForPoaching(state, player.id);
  const targets = getValidRangerTargetMissions(state, player.id);

  return `
    <section class="subpanel">
      <h3>Ranger Poaching</h3>
      ${
        candidates.length === 0
          ? '<p>No eligible opposing assigned Rangers to poach.</p>'
          : candidates
              .map((candidate, idx) => {
                const selectId = `poach-target-${player.id}-${idx}`;
                const priceId = `poach-price-${player.id}-${idx}`;
                return `
                  <div class="poach-row">
                    <p><strong>${getHeroName(state, candidate.rangerHeroId)}</strong> on ${getMissionTitle(state, candidate.fromMissionId)}</p>
                    <label>Target mission</label>
                    <select id="${selectId}">${targets
                      .map((missionId) => `<option value="${missionId}">${getMissionTitle(state, missionId)}</option>`)
                      .join('')}</select>
                    <label>Poach price (silver)</label>
                    <input id="${priceId}" type="number" min="1" value="1" />
                    <button data-action="start-poach" data-to-player-id="${player.id}" data-ranger-hero-id="${candidate.rangerHeroId}" data-from-mission-id="${candidate.fromMissionId}" data-target-select-id="${selectId}" data-price-input-id="${priceId}" ${state.poaching.pending ? 'disabled' : ''}>Start Poach</button>
                  </div>
                `;
              })
              .join('')
      }
    </section>
  `;
};

const renderPendingPoachPanel = (state: GameState): string => {
  const pending = state.poaching.pending;
  if (!pending) return '<p>No pending poach.</p>';

  const owner = state.players.find((player) => player.id === pending.fromPlayerId);
  const canMatch = owner ? owner.silver >= pending.priceSilver : false;

  return `
    <div class="resolution-panel">
      <p><strong>Pending Poach:</strong> ${getHeroName(state, pending.rangerHeroId)}</p>
      <p>From: ${getMissionTitle(state, pending.fromMissionId)} → Target: ${getMissionTitle(state, pending.targetMissionId)}</p>
      <p>Price: ${pending.priceSilver} silver</p>
      <p>Original owner: ${owner?.name ?? pending.fromPlayerId}</p>
      <div class="resolution-actions">
        <button data-action="match-poach" data-player-id="${pending.fromPlayerId}" ${canMatch ? '' : 'disabled'}>Match</button>
        <button data-action="decline-poach" data-player-id="${pending.fromPlayerId}">Decline</button>
      </div>
      ${canMatch ? '' : '<p class="warning">Original owner cannot afford match.</p>'}
    </div>
  `;
};

const renderHiringResolutionPanel = (state: GameState): string => {
  const current = getCurrentResolutionItem(state);
  if (!state.hiring.offersLocked) return '<p>Offers not locked yet.</p>';
  if (!current) return '<p>Hiring resolution complete.</p>';

  const hero = state.heroes.find((item) => item.id === current.heroId);
  const activePlayerId = current.priorityPlayerIds[current.currentPriorityIndex];
  const activePlayer = state.players.find((player) => player.id === activePlayerId);
  const row = getHiringRowDefinition(current.rowKey);
  const canAfford = activePlayer ? canPlayerAffordRowOffer(activePlayer, current.rowKey) : false;
  const priestBlocked = activePlayer ? isPriestUnavailableForPlayer(activePlayer, current.rowKey) : false;
  const hireDisabled = !canAfford || priestBlocked;

  return `
    <div class="resolution-panel">
      <p><strong>Resolving Hero:</strong> ${hero ? `${hero.heroClass} Lv.${hero.level}` : current.heroId}</p>
      <p><strong>Row:</strong> ${row.heroClass} Lv.${row.level}</p>
      <p><strong>Current Priority:</strong> ${activePlayer ? activePlayer.name : activePlayerId}</p>
      <div class="resolution-actions">
        <button data-action="hire" data-player-id="${activePlayerId}" ${hireDisabled || state.poaching.pending ? 'disabled' : ''}>Hire</button>
        <button data-action="pass" data-player-id="${activePlayerId}" ${state.poaching.pending ? 'disabled' : ''}>Pass</button>
      </div>
    </div>
  `;
};

const renderMissionBoard = (state: GameState): string => {
  const bonus = (i: number): string => (i === 4 ? '+1 Gem' : i === 3 ? '+1 Silver' : '-');

  return `
    <section class="panel mission-board">
      <h2>Public Mission Board</h2>
      <div class="mission-slots">${state.missionBoard
        .map((slot, i) => `<article class="slot-card"><header><span>Slot ${i + 1}</span></header><div class="slot-mission">${getMissionTitle(state, slot.missionId)}</div><div class="slot-bonus">${bonus(i)}</div></article>`)
        .join('')}</div>
    </section>
  `;
};

const renderLane = (
  state: GameState,
  entries: WorldMapLaneEntry[],
  laneLength: number,
): string => {
  if (entries.length === 0) return '-';
  return entries
    .map(
      (entry) =>
        `${getMissionTitle(state, entry.missionId)} (pos ${entry.position}) [${toHeroNameList(state, entry.assignedHeroIds)}] — ${isEntryReadyToResolve(entry, laneLength) ? 'Ready to Resolve' : 'Traveling'}`,
    )
    .join(' | ');
};

const renderZone = (state: GameState, zone: WorldMapZoneView): string =>
  `<article class="zone-card"><h3>${zone.zone}</h3><ul><li><strong>1-turn lane:</strong> ${renderLane(state, zone.lanes.oneTurn, 1)}</li><li><strong>2-turn lane:</strong> ${renderLane(state, zone.lanes.twoTurn, 2)}</li><li><strong>3-turn lane:</strong> ${renderLane(state, zone.lanes.threeTurn, 3)}</li></ul></article>`;

const renderPlayerMat = (state: GameState, playerId: string): string => {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return '';

  return `
    <section class="panel player-mat">
      <h2>${player.name} Mat</h2>
      <div class="stats-row"><span>Reputation: <strong>${player.reputation}</strong></span><span>Silver: <strong>${player.silver}</strong></span><span>Gold: <strong>${player.gold}</strong></span><span>Gems: <strong>${player.gems}</strong></span></div>
      <div class="mat-grid">
        <div><h3>Preparation Area</h3>${renderPreparationSlots(state, player)}</div>
        <div><h3>Rest Zone</h3><p>${toHeroNameList(state, player.restZoneHeroIds)}</p></div>
        <div><h3>Backlog Area</h3><p>${toMissionTitleList(state, player.backlogMissionIds)}</p></div>
        ${renderHiredPool(state, player)}
      </div>
      <section class="subpanel"><h3>Guild Hiring Board</h3>${renderHiringRows(player, state.hiring.offersLocked, Boolean(state.poaching.pending))}</section>
      ${renderPoachingPanel(state, player)}
    </section>
  `;
};

export const renderGame = (
  root: HTMLElement,
  state: GameState,
  actions: RenderActions,
  popupMessage: string | null,
  phaseLabel: string,
  phaseInstruction: string,
): void => {
  root.innerHTML = `
    <main class="app-shell">
      <h1>Fantasy Adventurers Guild — Prototype Scaffold</h1>
      <section class="panel stage-round"><h2>Current Phase: ${phaseLabel}</h2><p class="hint">${phaseInstruction}</p><div class="stats-row"><span>Stage: <strong>${state.stage}</strong></span><span>Round: <strong>${state.round}</strong></span></div></section>
      <section class="panel"><h2>Hire Resolution</h2><button data-action="lock-offers" ${state.hiring.offersLocked || state.poaching.pending ? 'disabled' : ''}>Lock Offers / Start Hiring</button>${renderHiringResolutionPanel(state)}</section>
      <section class="panel"><h2>Ranger Poaching</h2>${renderPendingPoachPanel(state)}</section>
      <section class="panel hero-village"><h2>Hero Village (Public Pool)</h2><ul class="hero-list">${state.heroVillageHeroIds.map((heroId) => `<li><strong>${getHeroName(state, heroId)}</strong></li>`).join('')}</ul></section>
      ${renderMissionBoard(state)}
      <section class="panel world-map"><h2>World Map</h2><button data-action="advance-world-map" ${state.poaching.pending ? 'disabled' : ''}>Advance World Map</button><div class="zones-grid">${state.worldMap.map((zone) => renderZone(state, zone)).join('')}</div></section>
      <section class="players-grid">${renderPlayerMat(state, 'p1')}${renderPlayerMat(state, 'p2')}</section>
      ${
        popupMessage
          ? `<section class="modal-backdrop"><div class="modal-card"><p>${popupMessage}</p><button data-action="dismiss-popup">OK</button></div></section>`
          : ''
      }
    </main>
  `;

  attachActionButtons(root, actions);
};
