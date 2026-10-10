import { Accordion, Box, Text, UnstyledButton } from '@mantine/core';
import { Trans, useTranslation } from 'react-i18next';
import { useEditorContext } from './useEditorContext';

// Reports, never blocks: a play under construction is invalid by nature, so nothing here
// gates editing, playback or saving. Collapsed until the coach asks.
export function IssuePanel() {
  const { t } = useTranslation();
  const { issues, play, select } = useEditorContext();

  return (
    <Accordion variant="contained">
      <Accordion.Item value="issues">
        <Accordion.Control>
          <Text component="span" size="sm">
            <Trans
              i18nKey="play.editor.problems"
              defaults="Problems (<count>{{count}}</count>)"
              values={{ count: issues.length }}
              components={{ count: <span data-testid="issue-count" /> }}
            />
          </Text>
        </Accordion.Control>
        <Accordion.Panel>
          {issues.length === 0 ? (
            <Text size="sm" c="dimmed">
              {t('play.editor.noProblems', 'No problems')}
            </Text>
          ) : (
            <Box component="ul" m={0} p={0} style={{ listStyle: 'none' }}>
              {issues.map((issue, index) => {
                const entityId = issue.entityId;
                const player = play.players.find((p) => p.id === entityId);

                return (
                  <li key={`${issue.code}-${entityId ?? ''}-${index}`}>
                    {player !== undefined ? (
                      <UnstyledButton fz="sm" onClick={() => select({ kind: 'entity', entityId: player.id })}>
                        {issue.message}
                      </UnstyledButton>
                    ) : (
                      <Text size="sm">{issue.message}</Text>
                    )}
                  </li>
                );
              })}
            </Box>
          )}
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
