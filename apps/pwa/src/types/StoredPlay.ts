import type { Play, PlayId } from '../engine';

/** A system as the database holds it: its document plus the ownership and visibility around it. */
export interface StoredPlay {
  id: PlayId;
  ownerId: string;
  isPublic: boolean;
  updatedAt: string;
  play: Play;
}
