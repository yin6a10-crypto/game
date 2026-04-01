import { GameState, HeroId, MissionId, WorldMapZoneView } from '../core/types';

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
          .map((slot) => {
            const missionTitle = getMissionTitle(state, slot.missionId);
            const positionLabel = getMissionBoardPositionLabel(slot.index, totalSlots);
            const bonusLabel = getMissionBoardBonusLabel(slot.index, totalSlots);

            return `
              <article class="slot-card">
                <header>
                  <span>Slot ${slot.index + 1}</span>
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
      </div>
    </section>
  `;
};

export const renderGame = (root: HTMLElement, state: GameState): void => {
  root.innerHTML = `
    <main class="app-shell">
      <h1>Fantasy Adventurers Guild — Prototype Scaffold</h1>
      ${renderStageRoundPanel(state)}
      ${renderHeroVillage(state)}
      ${renderMissionBoard(state)}
      ${renderWorldMap(state)}
      <section class="players-grid">
        ${renderPlayerMat(state, 'p1')}
        ${renderPlayerMat(state, 'p2')}
      </section>
    </main>
  `;
};
