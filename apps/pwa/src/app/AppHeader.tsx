import { type ReactNode } from 'react';
import { Anchor, Group, Image, Title, type MantineSpacing } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import wordmark from '../assets/phoopers.png';
import { LanguageSwitcher } from '../i18n/LanguageSwitcher';

export interface AppHeaderProps {
  /**
   * Controls that sit ahead of the wordmark, for a page whose own menu is the first thing a
   * coach reaches for — the editor's system menu.
   */
  leading?: ReactNode;
  /** Controls between the wordmark and the title, such as the editor's branch menu. */
  controls?: ReactNode;
  /**
   * What this page is looking at, when that is not the app itself — a system's name. Hidden below
   * `sm`, where the header has no room for it beside the controls: a page that passes one is
   * responsible for putting it somewhere a phone can still reach, as the editor does in its menu.
   */
  title?: string;
  /** The editor's own layout already pads the column the header sits in, so it passes 0. */
  p?: MantineSpacing;
  /**
   * How wide the block of `leading` plus the wordmark should be, for a page that has a column of
   * its own below the header to line up with — the editor's timeline gutter, which holds the row
   * names and the transport's buttons. Left out, the block is as wide as what is in it.
   */
  leadingWidth?: string | number;
}

/**
 * The one header every page wears: the wordmark, whatever the page puts beside it, and the
 * language.
 *
 * The account used to sit at the right-hand end, as a sign-in button or a name with a dropdown.
 * It moved into the menu the burger opens, where signing in, the coach's own information and
 * signing out are three entries in one group rather than a second place to look.
 */
export function AppHeader({ leading, controls, title, p = 'md', leadingWidth }: AppHeaderProps) {
  const { t } = useTranslation();

  return (
    <Group component="header" justify="space-between" align="center" gap="sm" p={p} style={{ flex: '0 0 auto' }}>
      {/* No gap at this level, so whatever follows the block below begins exactly at its edge:
          on the editor that edge is the timeline's gutter, and the first control after it then
          starts where the scrubber and the keyframe tracks do. What follows carries its own
          spacing, so only this one seam is closed. */}
      <Group gap={0} wrap="nowrap" style={{ minWidth: 0 }}>
        {/* A block of its own so a page can give it a width: the editor sets the timeline's
            gutter, and the menu and the wordmark then occupy exactly the column the row names
            and the transport sit in below. Without a width it is as wide as its contents, which
            is every other page. */}
        <Group gap="sm" wrap="nowrap" w={leadingWidth} style={{ flex: '0 0 auto' }}>
          {leading}
          <Anchor component={Link} to="/" underline="never" c="inherit" style={{ flex: '0 0 auto' }}>
            {/* The wordmark is the heading on every page, including the ones that pass a title:
              that title is hidden on a phone, and an `h1` that disappears with it would leave
              those pages with no heading at all. The alt text is the app's name, so the heading
              reads the same to a screen reader as it did when it was text. `lh={0}` stops the
              heading's line box adding space under an image that has none of its own. */}
            <Title order={1} size="h2" lh={0}>
              <Image src={wordmark} alt={t('app.name', 'phoopers')} h={34} w="auto" />
            </Title>
          </Anchor>
        </Group>
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          {controls}
          {title !== undefined && (
            <Title
              order={2}
              // Smaller than an `h2` would be on its own: this one sits on a header line beside
              // the wordmark and the page's controls, not at the top of a page of prose, and at
              // the token's size it was the loudest thing in the bar. The level stays 2 — it is
              // what this heading IS, and shrinking it is a matter of the line it lives on.
              fz={20}
              visibleFrom="sm"
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {title}
            </Title>
          )}
        </Group>
      </Group>
      <Group gap="md" wrap="nowrap">
        <LanguageSwitcher />
      </Group>
    </Group>
  );
}
