import type { TFunction } from 'i18next';

/** The parts of an entity that decide what to call it. `Player` satisfies it, as does a row. */
export interface NameableEntity {
  team: 'offense' | 'defense' | 'ball';
  number: string;
  label?: string;
}

/**
 * What to call an entity on screen: the coach's own name for it, or the side and the number
 * when they have not given one.
 *
 * One function for every surface that names a player — the timeline's gutter, the court's drag
 * targets, the selection bar, the reordering announcements — so a player renamed in one place
 * is renamed everywhere, and the fallback cannot drift between them.
 *
 * A name of nothing but spaces counts as no name: trusted, it would leave a row visibly blank
 * with nothing to read and nothing to say out loud.
 *
 * The side is in the fallback because both teams number 1..5 on their own, so a bare "2" named
 * two different players.
 */
export function entityName(entity: NameableEntity, t: TFunction): string {
  const given = entity.label?.trim() ?? '';
  if (given !== '') return given;

  if (entity.team === 'ball') return t('play.editor.ballRow', 'Ball');

  return entity.team === 'offense'
    ? t('play.editor.offenseRow', 'Offense {{number}}', { number: entity.number })
    : t('play.editor.defenseRow', 'Defense {{number}}', { number: entity.number });
}
