import { ActionIcon, Box, Popover, Text, UnstyledButton } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UnsavedIndicator } from '../app/UnsavedIndicator';
import { usePlaybackContext } from '../play2d/usePlaybackContext';
import { useEditorContext } from './useEditorContext';

/**
 * Lists what `validatePlay` found, in a menu under a button that says how many.
 *
 * Reports, never blocks: a play under construction is invalid by nature, so nothing here gates
 * editing, playback or saving. A system with nothing to report has nothing to list, so the button
 * is disabled rather than opening an empty menu. It sits on the row of the zoom buttons, where it
 * costs no height: the accordion it replaced took a full-width row of the page.
 */
export function IssuesButton() {
  const { t } = useTranslation();
  const { issues, play, select } = useEditorContext();
  const { selectBranch, seek } = usePlaybackContext();
  const [opened, setOpened] = useState(false);
  // Derived, so a menu left open by the last problem being fixed closes with it rather than
  // reopening empty when the next one arrives.
  const shown = opened && issues.length > 0;
  const close = () => setOpened(false);

  return (
    // The mark the save status wears, and for the same reason: something to look at, in the colour
    // and the pulse the header already uses for it, with the number written on it. Shown only
    // while there is something to count, like the dot it is shared with.
    <UnsavedIndicator dirty={issues.length > 0} label={<span data-testid="issue-count">{issues.length}</span>}>
      <Popover opened={shown} onChange={setOpened} position="bottom-end" shadow="md" withArrow>
        <Popover.Target>
          {/* Gray and light like the zoom buttons beside it: this reports on the play, it does not
              act on it, so it does not take the primary colour. */}
          <ActionIcon
            variant="light"
            color="gray"
            aria-label={t('play.editor.problems', 'Problems ({{total}})', { total: issues.length })}
            disabled={issues.length === 0}
            aria-expanded={shown}
            onClick={() => setOpened((current) => !current)}
            // Mantine closes a popover on Escape only from inside its dropdown, and focus stays on
            // this button, which opened it: the menu holds nothing to focus when no row names a
            // player or a branch.
            onKeyDown={(event) => {
              if (event.key === 'Escape') close();
            }}
          >
            <IconAlertTriangle size={18} stroke={1.5} />
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown maw={420}>
          <Box component="ul" m={0} p={0} style={{ listStyle: 'none' }}>
            {issues.map((issue, index) => {
              const entityId = issue.entityId;
              const player = play.players.find((p) => p.id === entityId);
              // Most issues carry a branch id: jump there. Screen ids are left alone, since a
              // selection has no screen kind.
              const branch = play.branches.find((b) => b.id === entityId);

              return (
                <li key={`${issue.code}-${entityId ?? ''}-${index}`}>
                  {player !== undefined ? (
                    <UnstyledButton
                      fz="sm"
                      onClick={() => {
                        select({ kind: 'entity', entityId: player.id });
                        close();
                      }}
                    >
                      {issue.message}
                    </UnstyledButton>
                  ) : branch !== undefined ? (
                    <UnstyledButton
                      fz="sm"
                      onClick={() => {
                        selectBranch(branch.id);
                        seek(0);
                        close();
                      }}
                    >
                      {issue.message}
                    </UnstyledButton>
                  ) : (
                    <Text size="sm">{issue.message}</Text>
                  )}
                </li>
              );
            })}
          </Box>
        </Popover.Dropdown>
      </Popover>
    </UnsavedIndicator>
  );
}
