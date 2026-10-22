import type { ReactNode } from 'react';
import { Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { PlaySummary } from '../types/PlaySummary';
import { printDate } from '../utils/renderer/dateRenderer';

interface Props {
  summary: PlaySummary;
  /** Whatever else the screen offers on this card, drawn beside Open: the owner's menu, or nothing. */
  actions?: ReactNode;
  onOpen: () => void;
  /** Draws the Public/Private badge. A list where every system is public has no use for it. */
  showVisibility?: boolean;
}

/** One system in a list: text only, with Open as its one action. Shared by every list of systems. */
export function PlayCard({ summary, actions, onOpen, showVisibility = false }: Props) {
  const { t } = useTranslation();
  const court = summary.court === 'nba' ? t('plays.card.court.nba', 'NBA') : t('plays.card.court.fiba', 'FIBA');
  const extent =
    summary.extent === 'half' ? t('plays.card.extent.half', 'half court') : t('plays.card.extent.full', 'full court');

  return (
    <Card withBorder padding="md" component="article" aria-label={summary.name}>
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Title order={3} size="h4">
            {summary.name}
          </Title>
          {showVisibility && (
            <Badge variant="light" color={summary.isPublic ? 'green' : 'gray'}>
              {summary.isPublic ? t('plays.card.badge.public', 'Public') : t('plays.card.badge.private', 'Private')}
            </Badge>
          )}
        </Group>
        <Text size="sm">{`${court} · ${extent}`}</Text>
        {summary.authorName !== undefined && (
          <Text size="sm" c="dimmed">
            {t('plays.card.by', 'By {{name}}', { name: summary.authorName })}
          </Text>
        )}
        <Text size="xs" c="dimmed">
          {t('plays.card.updated', 'Updated {{date}}', { date: printDate(summary.updatedAt) })}
        </Text>
        <Group justify="space-between" mt="xs">
          <Button
            variant="light"
            onClick={onOpen}
            aria-label={t('plays.card.open', 'Open {{name}}', { name: summary.name })}
          >
            {t('plays.card.openLabel', 'Open')}
          </Button>
          {actions}
        </Group>
      </Stack>
    </Card>
  );
}
