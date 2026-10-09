export type Vec2 = { x: number; y: number };

export type PlayId = string & { readonly __brand: 'PlayId' };
export type PlayerId = string & { readonly __brand: 'PlayerId' };
export type BranchId = string & { readonly __brand: 'BranchId' };
export type StepId = string & { readonly __brand: 'StepId' };
export type ScreenId = string & { readonly __brand: 'ScreenId' };

export type EntityId = PlayerId | 'ball';

export type EasingPreset = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
export type CubicBezierEasing = { x1: number; y1: number; x2: number; y2: number };
export type Easing = EasingPreset | CubicBezierEasing;

export interface Player {
  id: PlayerId;
  team: 'offense' | 'defense';
  label: string;
}

export interface Keyframe {
  t: number;
  position?: Vec2;
  attachedTo?: PlayerId;
  handleOut?: Vec2;
  handleIn?: Vec2;
  ease?: Easing;
}

export interface Step {
  id: StepId;
  t: number;
  name: string;
}

export interface ScreenEvent {
  id: ScreenId;
  t: number;
  duration: number;
  screenerId: PlayerId;
  beneficiaryId: PlayerId;
}

export interface Branch {
  id: BranchId;
  parentId: BranchId | null;
  forkStepId: StepId | null;
  name: string;
  tracks: Record<EntityId, Keyframe[]>;
  steps: Step[];
  screens: ScreenEvent[];
}

export interface Play {
  id: PlayId;
  name: string;
  court: 'fiba' | 'nba';
  players: Player[];
  branches: Branch[];
  rootBranchId: BranchId;
}

export interface PreparedSpan {
  fromT: number;
  toT: number;
  p0: Vec2;
  p1: Vec2;
  p2: Vec2;
  p3: Vec2;
  ease: CubicBezierEasing;
  lut: number[];
  length: number;
  attachedTo: PlayerId | null;
}

export interface ResolvedTimeline {
  branchId: BranchId;
  players: Player[];
  court: Play['court'];
  spans: Record<EntityId, PreparedSpan[]>;
  anchors: Record<EntityId, Keyframe[]>;
  steps: Step[];
  screens: ScreenEvent[];
  duration: number;
}

export type BallState = 'held' | 'inFlight';
export type SpanKind = 'idle' | 'move' | 'dribble';

export interface PlayState {
  t: number;
  players: Record<PlayerId, { position: Vec2; moving: boolean }>;
  ball: { position: Vec2; attachedTo: PlayerId | null };
  activeScreens: ScreenEvent[];
}

export const COURT_DIMENSIONS = {
  fiba: { length: 28, width: 15 },
  nba: { length: 28.65, width: 15.24 },
} as const;

export type IssueCode =
  | 'fork-step-not-in-ancestors'
  | 'keyframe-before-fork'
  | 'ball-keyframe-missing-position'
  | 'ball-keyframe-position-and-attachment'
  | 'player-keyframe-has-attachment'
  | 'keyframe-times-not-monotonic'
  | 'duplicate-id'
  | 'unknown-player-reference'
  | 'branch-cycle'
  | 'non-root-branch-without-fork'
  | 'root-branch-with-parent'
  | 'easing-out-of-range'
  | 'unknown-easing-preset'
  | 'non-finite-number'
  | 'root-branch-with-fork'
  | 'dangling-parent-branch'
  | 'unknown-root-branch'
  | 'malformed-play';

export interface Issue {
  code: IssueCode;
  message: string;
  entityId?: string;
}
