export type PlayerId = string;
export type HeroId = string;
export type MissionId = string;
export type PreparationSlot = MissionId | null;
export type HiringRowKey =
  | 'Warrior-1'
  | 'Warrior-2'
  | 'Warrior-3'
  | 'Mage-1'
  | 'Mage-2'
  | 'Mage-3'
  | 'Ranger-1'
  | 'Ranger-2'
  | 'Priest-1'
  | 'Priest-2';

export enum HeroClass {
  Warrior = 'Warrior',
  Mage = 'Mage',
  Ranger = 'Ranger',
  Priest = 'Priest',
}

// Note: Ranger and Priest max level is 2 in game rules and will be validated by rules logic later.
export type HeroLevel = 1 | 2 | 3;

export type Reputation = -2 | -1 | 0 | 1 | 2;

export enum MissionStage {
  Stage1 = 1,
  Stage2 = 2,
  Stage3 = 3,
}

export enum MissionKind {
  Battle = 'Battle',
  NonBattle = 'NonBattle',
}

export enum WorldZone {
  ZoneA = 'ZoneA',
  ZoneB = 'ZoneB',
  ZoneC = 'ZoneC',
  ZoneD = 'ZoneD',
}

export type LaneLength = 1 | 2 | 3;

export interface Reward {
  silver: number;
  gems: number;
  reputation?: number;
}

export interface Hero {
  id: HeroId;
  name: string;
  heroClass: HeroClass;
  level: HeroLevel;
  currentRestZonePlayerId: PlayerId | null;
}

export interface ClassLevelRequirement {
  heroClass: HeroClass;
  level: HeroLevel;
}

export interface MissionRequirement {
  requiredExact: ClassLevelRequirement[];
  optionalPriestLevels?: HeroLevel[];
}

export interface MissionCard {
  id: MissionId;
  title: string;
  stage: MissionStage;
  kind: MissionKind;
  dangerous: boolean;
  zone: WorldZone;
  laneLength: LaneLength;
  requirements: MissionRequirement;
  reward: Reward;
}

export interface BoardSlot {
  index: number;
  missionId: MissionId | null;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  reputation: Reputation;
  silver: number;
  gold: number;
  gems: number;
  // Fixed 5-slot track, left=Newest (index 0), right=Oldest (index 4)
  preparationSlots: [PreparationSlot, PreparationSlot, PreparationSlot, PreparationSlot, PreparationSlot];
  restZoneHeroIds: HeroId[];
  hiredPoolHeroIds: HeroId[];
  backlogMissionIds: MissionId[];
  hiringBoardExtraPay: Record<HiringRowKey, number>;
}

export interface WorldMapZoneView {
  zone: WorldZone;
  lanes: {
    oneTurn: WorldMapLaneEntry[];
    twoTurn: WorldMapLaneEntry[];
    threeTurn: WorldMapLaneEntry[];
  };
}

export interface WorldMapLaneEntry {
  missionId: MissionId;
  position: number;
  assignedHeroIds: HeroId[];
  enteredStep: number;
}

export interface EnvironmentFlags {
  demonKingAppliesThisRound: boolean;
  overflowTriggeredThisRound: boolean;
}

export interface HiringResolutionItem {
  heroId: HeroId;
  rowKey: HiringRowKey;
  priorityPlayerIds: PlayerId[];
  currentPriorityIndex: number;
  resolved: boolean;
}

export interface HiringPhaseState {
  offersLocked: boolean;
  resolutionOrder: HiringResolutionItem[];
}

export interface MissionAssignmentState {
  assignedHeroIdsByMission: Record<MissionId, HeroId[]>;
}

export interface PendingPoach {
  rangerHeroId: HeroId;
  fromPlayerId: PlayerId;
  toPlayerId: PlayerId;
  fromMissionId: MissionId;
  targetMissionId: MissionId;
  priceSilver: number;
}

export interface PoachingState {
  pending: PendingPoach | null;
}

export interface GameState {
  stage: MissionStage;
  round: number;
  environment: EnvironmentFlags;
  heroVillageHeroIds: HeroId[];
  heroes: Hero[];
  missions: MissionCard[];
  missionBoard: BoardSlot[];
  worldMap: WorldMapZoneView[];
  players: PlayerState[];
  playerOrder: PlayerId[];
  hiring: HiringPhaseState;
  assignment: MissionAssignmentState;
  poaching: PoachingState;
  worldMapStep: number;
}
