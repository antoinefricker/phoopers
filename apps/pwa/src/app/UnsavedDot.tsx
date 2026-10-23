import { Box } from '@mantine/core';
import { useTranslation } from 'react-i18next';

/**
 * There is something to save.
 *
 * Shared by the menu's Save entry and the burger that opens it, so the mark a coach sees in the
 * header and the one they find inside are visibly the same mark rather than two conventions.
 * A span, not Group's default div: both of its callers put it inside a label.
 */
export function UnsavedDot({ decorative = false }: { decorative?: boolean } = {}) {
  const { t } = useTranslation();

  return (
    <Box
      component="span"
      // Decorative where something beside it already says the same thing in words — the burger,
      // whose own label changes when there is something to save. An `aria-label` on that button
      // replaces its contents' name outright, so a dot announcing itself in there is never read.
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : t('play.save.unsaved', 'Unsaved changes')}
      w={8}
      h={8}
      bg="orange"
      style={{ borderRadius: '50%', flex: '0 0 auto' }}
    />
  );
}
