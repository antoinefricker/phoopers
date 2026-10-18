import { useState } from 'react';
import { Alert, Container, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { useOpenSystem } from '../draft/useOpenSystem';
import { useAuthContext } from '../auth/useAuthContext';
import { PlayCard } from '../plays/PlayCard';
import { usePublicPlays } from '../plays/usePlays';

const SEARCH_DELAY_MS = 300;

/** The systems coaches have made public. Open to anyone: nothing here needs an account. */
export function LibraryScreen() {
  const { configured } = useAuthContext();
  const { t } = useTranslation();

  if (!configured) {
    return (
      <Container size="lg" py="xl">
        <Text>
          {t('app.notConfigured', 'This app is not configured with a Supabase project, so this screen is unavailable.')}
        </Text>
      </Container>
    );
  }
  return <Library />;
}

function Library() {
  const { t } = useTranslation();
  const { open, dialog: leaveDialog } = useOpenSystem();
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search.trim(), SEARCH_DELAY_MS);
  const plays = usePublicPlays(debounced);
  const list = plays.data ?? [];

  return (
    <Container size="lg" py="xl">
      <Stack gap="md">
        <Title order={2}>{t('home.public.title', 'Public systems')}</Title>
        <TextInput
          aria-label={t('library.search', 'Search public systems')}
          placeholder={t('library.search', 'Search public systems')}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        {plays.isError && <Alert color="red">{t('library.error', 'Something went wrong. Please try again.')}</Alert>}
        {plays.isSuccess && list.length === 0 && (
          <Text c="dimmed">
            {debounced === ''
              ? t('library.empty', 'No system has been made public yet.')
              : t('library.noMatch', 'No system matches this search.')}
          </Text>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          {list.map((summary) => (
            <PlayCard key={summary.id} summary={summary} onOpen={() => open(summary.id)} />
          ))}
        </SimpleGrid>
      </Stack>
      {leaveDialog}
    </Container>
  );
}
