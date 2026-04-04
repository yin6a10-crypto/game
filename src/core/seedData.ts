import {
  GameState,
  Hero,
  HeroClass,
  MissionCard,
  MissionKind,
  MissionStage,
  PlayerState,
  WorldMapZoneView,
  WorldZone,
} from './types';
import { createEmptyHiringBoardExtraPay } from './hiring';

const heroes: Hero[] = [
  {
    id: 'h-warrior-1',
    name: 'Brakka',
    heroClass: HeroClass.Warrior,
    level: 1,
    currentRestZonePlayerId: 'p1',
  },
  {
    id: 'h-mage-2',
    name: 'Ilyra',
    heroClass: HeroClass.Mage,
    level: 2,
    currentRestZonePlayerId: 'p2',
  },
  {
    id: 'h-ranger-1',
    name: 'Thorn',
    heroClass: HeroClass.Ranger,
    level: 1,
    currentRestZonePlayerId: 'p1',
  },
  {
    id: 'h-priest-1',
    name: 'Sister Vale',
    heroClass: HeroClass.Priest,
    level: 1,
    currentRestZonePlayerId: 'p2',
  },
  {
    id: 'h-warrior-3',
    name: 'Durgan',
    heroClass: HeroClass.Warrior,
    level: 3,
    currentRestZonePlayerId: null,
  },
  {
    id: 'h-mage-1b',
    name: 'Lumen',
    heroClass: HeroClass.Mage,
    level: 1,
    currentRestZonePlayerId: null,
  },
  {
    id: 'h-ranger-1b',
    name: 'Pine',
    heroClass: HeroClass.Ranger,
    level: 1,
    currentRestZonePlayerId: null,
  },
  {
    id: 'h-priest-1b',
    name: 'Dawn',
    heroClass: HeroClass.Priest,
    level: 1,
    currentRestZonePlayerId: null,
  },
];

const missions: MissionCard[] = [
  {
    id: 'm-crypt-echo',
    title: 'Crypt Echo Sweep',
    stage: MissionStage.Stage1,
    kind: MissionKind.Battle,
    dangerous: true,
    zone: WorldZone.ZoneA,
    laneLength: 2,
    requirements: {
      requiredExact: [
        { heroClass: HeroClass.Warrior, level: 1 },
        { heroClass: HeroClass.Mage, level: 2 },
      ],
      optionalPriestLevels: [1, 2],
    },
    reward: { silver: 4, gems: 1 },
  },
  {
    id: 'm-forest-trail',
    title: 'Forest Trail Escort',
    stage: MissionStage.Stage1,
    kind: MissionKind.NonBattle,
    dangerous: false,
    zone: WorldZone.ZoneB,
    laneLength: 1,
    requirements: {
      requiredExact: [
        { heroClass: HeroClass.Ranger, level: 1 },
        { heroClass: HeroClass.Warrior, level: 1 },
      ],
      optionalPriestLevels: [1],
    },
    reward: { silver: 3, gems: 0, reputation: 1 },
  },
  {
    id: 'm-cursed-bell',
    title: 'Cursed Bell Investigation',
    stage: MissionStage.Stage1,
    kind: MissionKind.Battle,
    dangerous: false,
    zone: WorldZone.ZoneC,
    laneLength: 3,
    requirements: {
      requiredExact: [
        { heroClass: HeroClass.Mage, level: 1 },
        { heroClass: HeroClass.Warrior, level: 2 },
      ],
      optionalPriestLevels: [1, 2],
    },
    reward: { silver: 2, gems: 1 },
  },
  {
    id: 'm-marsh-lights',
    title: 'Marsh Lights Survey',
    stage: MissionStage.Stage1,
    kind: MissionKind.NonBattle,
    dangerous: false,
    zone: WorldZone.ZoneD,
    laneLength: 2,
    requirements: {
      requiredExact: [{ heroClass: HeroClass.Ranger, level: 1 }],
      optionalPriestLevels: [1],
    },
    reward: { silver: 2, gems: 0 },
  },
  {
    id: 'm-fallen-gate',
    title: 'Fallen Gate Defense',
    stage: MissionStage.Stage1,
    kind: MissionKind.Battle,
    dangerous: true,
    zone: WorldZone.ZoneA,
    laneLength: 1,
    requirements: {
      requiredExact: [
        { heroClass: HeroClass.Warrior, level: 3 },
        { heroClass: HeroClass.Mage, level: 2 },
      ],
      optionalPriestLevels: [1, 2],
    },
    reward: { silver: 5, gems: 1 },
  },
  {
    id: 'm-ruin-watch',
    title: 'Ruin Watch Patrol',
    stage: MissionStage.Stage1,
    kind: MissionKind.NonBattle,
    dangerous: false,
    zone: WorldZone.ZoneB,
    laneLength: 1,
    requirements: {
      requiredExact: [{ heroClass: HeroClass.Warrior, level: 1 }],
      optionalPriestLevels: [1],
    },
    reward: { silver: 2, gems: 0 },
  },
  {
    id: 'm-moon-archive',
    title: 'Moon Archive Survey',
    stage: MissionStage.Stage1,
    kind: MissionKind.NonBattle,
    dangerous: false,
    zone: WorldZone.ZoneC,
    laneLength: 2,
    requirements: {
      requiredExact: [{ heroClass: HeroClass.Mage, level: 1 }],
      optionalPriestLevels: [1],
    },
    reward: { silver: 2, gems: 1 },
  },
  {
    id: 'm-river-ambush',
    title: 'River Ambush',
    stage: MissionStage.Stage1,
    kind: MissionKind.Battle,
    dangerous: true,
    zone: WorldZone.ZoneD,
    laneLength: 2,
    requirements: {
      requiredExact: [
        { heroClass: HeroClass.Ranger, level: 1 },
        { heroClass: HeroClass.Warrior, level: 1 },
      ],
      optionalPriestLevels: [1],
    },
    reward: { silver: 3, gems: 0 },
  },
];

const players: PlayerState[] = [
  {
    id: 'p1',
    name: 'Player 1',
    reputation: 2,
    silver: 8,
    gold: 1,
    gems: 3,
    preparationSlots: ['m-marsh-lights', null, null, null, null],
    restZoneHeroIds: [],
    hiredPoolHeroIds: ['h-warrior-1', 'h-ranger-1'],
    backlogMissionIds: [],
    hiringBoardExtraPay: createEmptyHiringBoardExtraPay(),
  },
  {
    id: 'p2',
    name: 'Player 2',
    reputation: -1,
    silver: 9,
    gold: 0,
    gems: 2,
    preparationSlots: ['m-fallen-gate', null, null, null, null],
    restZoneHeroIds: [],
    hiredPoolHeroIds: ['h-mage-2', 'h-priest-1'],
    backlogMissionIds: [],
    hiringBoardExtraPay: createEmptyHiringBoardExtraPay(),
  },
];

const worldMap: WorldMapZoneView[] = [
  { zone: WorldZone.ZoneA, lanes: { oneTurn: [], twoTurn: [], threeTurn: [] } },
  { zone: WorldZone.ZoneB, lanes: { oneTurn: [], twoTurn: [], threeTurn: [] } },
  { zone: WorldZone.ZoneC, lanes: { oneTurn: [], twoTurn: [], threeTurn: [] } },
  { zone: WorldZone.ZoneD, lanes: { oneTurn: [], twoTurn: [], threeTurn: [] } },
];

export const seedState: GameState = {
  stage: MissionStage.Stage1,
  round: 1,
  environment: {
    demonKingAppliesThisRound: false,
    overflowTriggeredThisRound: false,
  },
  heroVillageHeroIds: ['h-warrior-3'],
  heroes,
  missions,
  missionBoard: [
    { index: 0, missionId: 'm-forest-trail' },
    { index: 1, missionId: 'm-cursed-bell' },
    { index: 2, missionId: 'm-crypt-echo' },
    { index: 3, missionId: null },
    { index: 4, missionId: null },
  ],
  worldMap,
  players,
  playerOrder: ['p1', 'p2'],
  hiring: {
    offersLocked: false,
    resolutionOrder: [],
  },
  assignment: {
    assignedHeroIdsByMission: {},
  },
  poaching: {
    pending: null,
  },
  worldMapStep: 0,
};
