import type { CourtExtent, Play, PlayId } from '../engine';

/** What a list of systems shows about each one, read from the row's columns and never its document. */
export interface PlaySummary {
  id: PlayId;
  name: string;
  court: Play['court'];
  extent: CourtExtent;
  isPublic: boolean;
  updatedAt: string;
  ownerId: string;
  authorName?: string;
}
