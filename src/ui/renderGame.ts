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
  onLockOffersPlayer: (playerId: string) => void;
  onHire: (playerId: string) => void;
  onPass: (playerId: string) => void;
  onAssignHero: (playerId: string, heroId: string, missionId: string) => void;
  onFinishAssignment: (playerId: string) => void;
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
  onAcceptMission: (playerId: string, missionId: string) => void;
  onAcceptPass: () => void;
  onResolveMission: (missionId: string) => void;
  onContinuePhase: () => void;
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

const renderHeroTokens = (state: GameState, heroIds: HeroId[]): string => {
  if (heroIds.length === 0) return '<span>-</span>';
  return heroIds.map((id) => `<span class="hero-token" title="${getHeroName(state, id)}">${getHeroName(state, id)}</span>`).join('');
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

  root.querySelectorAll<HTMLElement>('[data-action="lock-offers-player"]').forEach((button) => {
    button.addEventListener('click', () => {
      const playerId = button.dataset.playerId;
      if (!playerId) return;
      actions.onLockOffersPlayer(playerId);
    });
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

  root.querySelectorAll<HTMLElement>('[data-action="finish-assignment"]').forEach((button) => {
    button.addEventListener('click', () => {
      const playerId = button.dataset.playerId;
      if (!playerId) return;
      actions.onFinishAssignment(playerId);
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

  root.querySelectorAll<HTMLElement>('[data-action="accept-mission"]').forEach((button) => {
    button.addEventListener('click', () => {
      const playerId = button.dataset.playerId;
      const missionId = button.dataset.missionId;
      if (!playerId || !missionId) return;
      actions.onAcceptMission(playerId, missionId);
    });
  });

  root.querySelectorAll<HTMLElement>('[data-action="resolve-mission"]').forEach((button) => {
    button.addEventListener('click', () => {
      const missionId = button.dataset.missionId;
      if (!missionId) return;
      actions.onResolveMission(missionId);
    });
  });

  root.querySelectorAll<HTMLElement>('[data-action="continue-phase"]').forEach((button) => {
    button.addEventListener('click', () => actions.onContinuePhase());
  });

  root.querySelectorAll<HTMLElement>('[data-action="accept-pass"]').forEach((button) => {
    button.addEventListener('click', () => actions.onAcceptPass());
  });
};

const renderPreparationSlots = (state: GameState, player: PlayerState, phaseLabel: string): string => {
  return `
    <div class="prep-slots">
      ${player.preparationSlots
        .map((missionId, index) => {
          const marker = index === 0 ? 'Newest' : index === player.preparationSlots.length - 1 ? 'Oldest' : `Slot ${index + 1}`;
          const assignedIds = missionId ? state.assignment.assignedHeroIdsByMission[missionId] ?? [] : [];
          const staffed = missionId ? isMissionFullyStaffedByAssignment(state, missionId) : false;
          const assignControls =
            missionId === null
              ? ''
              : `<div class="assign-controls">${player.hiredPoolHeroIds
                  .map((heroId) => {
                    const enabled = canAssignByRules(state, player.id, heroId, missionId);
                    return `<button data-action="assign-hero" data-player-id="${player.id}" data-hero-id="${heroId}" data-mission-id="${missionId}" ${enabled && !state.poaching.pending && phaseLabel === 'Assignment' ? '' : 'disabled'}>Assign ${getHeroName(state, heroId)}</button>`;
                  })
                  .join('')}</div>`;

          return `
            <div class="prep-slot">
              <small>${marker}</small>
              ${missionId ? renderMissionCard(state, missionId, staffed ? 'Fully Staffed' : 'Needs Roles', assignedIds) : '<span>Empty</span>'}
              ${
                missionId && canDepartMission(state, player.id, missionId)
                  ? `<button data-action="depart-mission" data-player-id="${player.id}" data-mission-id="${missionId}" ${state.poaching.pending || phaseLabel !== 'Departure' ? 'disabled' : ''}>Depart</button>`
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

const renderHiringRows = (player: PlayerState, offersLocked: boolean, isPoachPending: boolean, phaseLabel: string): string => {
  return `
    <div class="hiring-rows">
      ${HIRING_ROW_DEFS.map((row) => {
        const extraPay = player.hiringBoardExtraPay[row.key];
        const actualOffer = getActualOffer(player, row.key);
        const priestBlocked = isPriestUnavailableForPlayer(player, row.key);
        const controlsDisabled = offersLocked || priestBlocked || phaseLabel !== 'Guild Hiring';
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

const renderHiredPool = (state: GameState, player: PlayerState): string => `<div><h3>Hired Pool</h3><div class="hero-token-row">${renderHeroTokens(state, player.hiredPoolHeroIds)}</div></div>`;

const renderPoachingPanel = (state: GameState, player: PlayerState, phaseLabel: string): string => {
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
                    <button data-action="start-poach" data-to-player-id="${player.id}" data-ranger-hero-id="${candidate.rangerHeroId}" data-from-mission-id="${candidate.fromMissionId}" data-target-select-id="${selectId}" data-price-input-id="${priceId}" ${state.poaching.pending || phaseLabel !== 'Ranger Poach' ? 'disabled' : ''}>Start Poach</button>
                  </div>
                `;
              })
              .join('')
      }
    </section>
  `;
};

const renderPendingPoachPanel = (state: GameState, phaseLabel: string): string => {
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
        <button data-action="match-poach" data-player-id="${pending.fromPlayerId}" ${canMatch && phaseLabel === 'Ranger Poach' ? '' : 'disabled'}>Match</button>
        <button data-action="decline-poach" data-player-id="${pending.fromPlayerId}" ${phaseLabel === 'Ranger Poach' ? '' : 'disabled'}>Decline</button>
      </div>
      ${canMatch ? '' : '<p class="warning">Original owner cannot afford match.</p>'}
    </div>
  `;
};

const renderHiringResolutionPanel = (state: GameState, phaseLabel: string): string => {
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
        <button data-action="hire" data-player-id="${activePlayerId}" ${hireDisabled || state.poaching.pending || phaseLabel !== 'Hire Resolution' ? 'disabled' : ''}>Hire</button>
        <button data-action="pass" data-player-id="${activePlayerId}" ${state.poaching.pending || phaseLabel !== 'Hire Resolution' ? 'disabled' : ''}>Pass</button>
      </div>
    </div>
  `;
};

const renderMissionCard = (
  state: GameState,
  missionId: MissionId,
  status: string,
  assignedHeroIds: HeroId[] = [],
): string => {
  const mission = state.missions.find((entry) => entry.id === missionId);
  if (!mission) return `<div class="mission-card">Unknown mission</div>`;
  const requiredRoles = mission.requirements.requiredExact.map((req) => `${req.heroClass} Lv.${req.level}`).join(', ') || '-';
  const optionalPriest = (mission.requirements.optionalPriestLevels ?? []).length
    ? (mission.requirements.optionalPriestLevels ?? []).map((lvl) => `Priest Lv.${lvl}`).join(' / ')
    : 'None';
  return `<article class="mission-card">
    <strong>${mission.title}</strong>
    <small>${mission.kind} · ${mission.dangerous ? 'Dangerous' : 'Safe'}</small>
    <small>${mission.zone} · ${mission.laneLength}-turn</small>
    <small>Reward ${mission.reward.silver}s ${mission.reward.gems}g${mission.reward.reputation ? ` ${mission.reward.reputation}rep` : ''}</small>
    <small>Needs ${requiredRoles}</small>
    <small>Priest ${optionalPriest}</small>
    <small>Assigned ${assignedHeroIds.length ? toHeroNameList(state, assignedHeroIds) : '-'}</small>
    <small>${status}</small>
  </article>`;
};

const renderMissionBoard = (state: GameState, phaseLabel: string, activeAcceptPlayerId: string | null): string => {
  const bonus = (i: number): string => (i === 4 ? '+1 Gem' : i === 3 ? '+1 Silver' : '-');

  return `
    <section class="panel mission-board">
      <h2>Public Mission Board</h2>
      <div class="mission-slots">${state.missionBoard
        .map((slot, i) => `<article class="slot-card"><header><span>Slot ${i + 1}</span></header>${
          slot.missionId ? renderMissionCard(state, slot.missionId, 'Needs Roles') : '<div class="slot-mission">Empty</div>'
        }<div class="slot-bonus">${bonus(i)}</div>${
          slot.missionId
            ? `<div class="resolution-actions"><button data-action="accept-mission" data-player-id="p1" data-mission-id="${slot.missionId}" ${phaseLabel === 'Accept Missions' && activeAcceptPlayerId === 'p1' ? '' : 'disabled'}>Accept P1</button><button data-action="accept-mission" data-player-id="p2" data-mission-id="${slot.missionId}" ${phaseLabel === 'Accept Missions' && activeAcceptPlayerId === 'p2' ? '' : 'disabled'}>Accept P2</button></div>`
            : ''
        }</article>`)
        .join('')}</div>
      ${phaseLabel === 'Accept Missions' ? '<button data-action="accept-pass">Pass</button>' : ''}
    </section>
  `;
};

const renderLane = (
  state: GameState,
  entries: WorldMapLaneEntry[],
  laneLength: number,
  phaseLabel: string,
): string => {
  if (entries.length === 0) return '-';
  return entries
    .map(
      (entry) =>
        `${renderMissionCard(state, entry.missionId, isEntryReadyToResolve(entry, laneLength) ? 'Ready to Resolve' : 'Departed', entry.assignedHeroIds)}${
          isEntryReadyToResolve(entry, laneLength)
            ? `<button data-action="resolve-mission" data-mission-id="${entry.missionId}" ${phaseLabel === 'Mission Resolution' ? '' : 'disabled'}>Resolve</button>`
            : ''
        }`,
    )
    .join('');
};

const renderZone = (state: GameState, zone: WorldMapZoneView, phaseLabel: string): string =>
  `<article class="zone-card"><h3>${zone.zone}</h3><ul><li><strong>1-turn lane:</strong> ${renderLane(state, zone.lanes.oneTurn, 1, phaseLabel)}</li><li><strong>2-turn lane:</strong> ${renderLane(state, zone.lanes.twoTurn, 2, phaseLabel)}</li><li><strong>3-turn lane:</strong> ${renderLane(state, zone.lanes.threeTurn, 3, phaseLabel)}</li></ul></article>`;

const renderPlayerMat = (
  state: GameState,
  playerId: string,
  phaseLabel: string,
  lockedHiringPlayers: Set<string>,
  finishedAssignmentPlayers: Set<string>,
): string => {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return '';

  return `
    <section class="panel player-mat">
      <h2>${player.name} Mat</h2>
      <div class="stats-row"><span>Reputation: <strong>${player.reputation}</strong></span><span>Silver: <strong>${player.silver}</strong></span><span>Gold: <strong>${player.gold}</strong></span><span>Gems: <strong>${player.gems}</strong></span></div>
      <div class="mat-grid">
        <div class="rest-zone"><h3>Rest Zone</h3><div class="hero-token-row">${renderHeroTokens(state, player.restZoneHeroIds)}</div></div>
        <div class="prep-area"><h3>Preparation Area</h3>${renderPreparationSlots(state, player, phaseLabel)}</div>
        <div class="hired-pool">${renderHiredPool(state, player)}</div>
      </div>
      <section class="subpanel"><h3>Guild Hiring Board</h3>${renderHiringRows(player, state.hiring.offersLocked, Boolean(state.poaching.pending), phaseLabel)}</section>
      <button data-action="lock-offers-player" data-player-id="${player.id}" ${phaseLabel === 'Guild Hiring' && !lockedHiringPlayers.has(player.id) ? '' : 'disabled'}>${lockedHiringPlayers.has(player.id) ? `Locked (${player.name})` : `Lock Offer (${player.name})`}</button>
      <button data-action="finish-assignment" data-player-id="${player.id}" ${phaseLabel === 'Assignment' && !finishedAssignmentPlayers.has(player.id) ? '' : 'disabled'}>${finishedAssignmentPlayers.has(player.id) ? `Done (${player.name})` : `Finish Assignment (${player.name})`}</button>
      ${renderPoachingPanel(state, player, phaseLabel)}
    </section>
  `;
};

export const renderGame = (
  root: HTMLElement,
  state: GameState,
  actions: RenderActions,
  popupMessage: string | null,
  phaseLabel: string,
  actingPlayer: string,
  phaseInstruction: string,
  canContinue: boolean,
  deckCounts: { stage1: number; stage2: number; stage3: number },
  setupPhase: boolean,
  activeAcceptPlayerId: string | null,
  lockedHiringPlayers: Set<string>,
  finishedAssignmentPlayers: Set<string>,
): void => {
  root.innerHTML = `
    <main class="app-shell">
      <h1>Fantasy Adventurers Guild — Prototype Scaffold</h1>
      <section class="panel stage-round"><h2>Current Phase: ${phaseLabel}</h2><p><strong>Acting:</strong> ${actingPlayer}</p><p class="hint">${phaseInstruction}</p><div class="stats-row"><span>Stage: <strong>${state.stage}</strong></span><span>Round: <strong>${state.round}</strong></span><span>Stage 1 Remaining: <strong>${deckCounts.stage1}</strong></span><span>Stage 2 Remaining: <strong>${deckCounts.stage2}</strong></span><span>Stage 3 Remaining: <strong>${deckCounts.stage3}</strong></span></div><button data-action="continue-phase" ${canContinue ? '' : 'disabled'}>${setupPhase ? 'Start Game Setup' : 'Next Step / Continue'}</button></section>
      <section class="panel"><h2>Hire Resolution</h2>${renderHiringResolutionPanel(state, phaseLabel)}</section>
      <section class="panel"><h2>Ranger Poaching</h2>${renderPendingPoachPanel(state, phaseLabel)}</section>
      <section class="panel hero-village"><h2>Hero Village (Public Pool)</h2><div class="hero-token-row">${renderHeroTokens(state, state.heroVillageHeroIds)}</div></section>
      ${renderMissionBoard(state, phaseLabel, activeAcceptPlayerId)}
      <section class="panel world-map"><h2>World Map</h2><button data-action="advance-world-map" ${state.poaching.pending || phaseLabel !== 'World Map Advance' ? 'disabled' : ''}>Advance World Map</button><div class="zones-grid">${state.worldMap.map((zone) => renderZone(state, zone, phaseLabel)).join('')}</div></section>
      <section class="players-grid">${renderPlayerMat(state, 'p1', phaseLabel, lockedHiringPlayers, finishedAssignmentPlayers)}${renderPlayerMat(state, 'p2', phaseLabel, lockedHiringPlayers, finishedAssignmentPlayers)}</section>
      ${
        popupMessage
          ? `<section class="modal-backdrop"><div class="modal-card"><p>${popupMessage}</p><button data-action="dismiss-popup">OK</button></div></section>`
          : ''
      }
    </main>
  `;

  attachActionButtons(root, actions);
};
