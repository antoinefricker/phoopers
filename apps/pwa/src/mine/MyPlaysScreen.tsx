import { useState } from 'react';
import { Alert, Button, Container, Group, Menu, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { useAuthContext } from '../auth/useAuthContext';
import { ConfirmDelete } from '../editor/ConfirmDelete';
import type { PlayId } from '../engine';
import { fetchPlay } from '../plays/playsApi';
import { useDeletePlay, useMyPlays, useRenamePlay, useSavePlay, useSetVisibility } from '../plays/usePlays';
import type { PlaySummary } from '../types/PlaySummary';
import { PlayCard } from '../plays/PlayCard';
import { RenamePlayDialog } from './RenamePlayDialog';

const SEARCH_DELAY_MS = 300;

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <Container size="lg" py="xl">
      <Stack gap="sm">
        <Text>{children}</Text>
      </Stack>
    </Container>
  );
}

export function MyPlaysScreen() {
  const { status, configured } = useAuthContext();
  const { t } = useTranslation();

  if (!configured) {
    return (
      <Centered>
        {t('app.notConfigured', 'This app is not configured with a Supabase project, so this screen is unavailable.')}
      </Centered>
    );
  }
  if (status === 'loading') return null;
  if (status === 'signedOut') {
    return (
      <Container size="lg" py="xl">
        <Stack gap="sm" align="flex-start">
          <Text>{t('mine.signedOut', 'Sign in to see the systems you have saved.')}</Text>
          <Button component={Link} to={`/signin?next=${encodeURIComponent('/mine')}`}>
            {t('app.signIn', 'Sign in')}
          </Button>
        </Stack>
      </Container>
    );
  }
  return <SignedInScreen />;
}

function SignedInScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userId } = useAuthContext();
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search.trim(), SEARCH_DELAY_MS);
  const plays = useMyPlays(debounced);
  const rename = useRenamePlay();
  const setVisibility = useSetVisibility();
  const remove = useDeletePlay();
  const save = useSavePlay();
  const [duplicateFailed, setDuplicateFailed] = useState(false);
  // Both dialogs stay mounted; each `key` changes on every open so their state starts fresh.
  const [renaming, setRenaming] = useState<{ opened: boolean; count: number; target: PlaySummary | null }>({
    opened: false,
    count: 0,
    target: null,
  });
  const [deleting, setDeleting] = useState<{ opened: boolean; count: number; target: PlaySummary | null }>({
    opened: false,
    count: 0,
    target: null,
  });

  /**
   * A copy is always private, whatever the original was, with a new id.
   * It goes straight to the server: the editor is not opened.
   */
  const duplicate = async (summary: PlaySummary) => {
    setDuplicateFailed(false);
    try {
      const stored = await fetchPlay(summary.id);
      if (stored === null || userId === null) throw new Error('duplicate-unavailable');
      await save.mutateAsync({
        play: {
          ...stored.play,
          id: crypto.randomUUID() as PlayId,
          name: t('mine.copyName', '{{name}} (copy)', { name: stored.play.name }),
        },
        insert: { ownerId: userId, isPublic: false },
      });
    } catch {
      setDuplicateFailed(true);
    }
  };

  const failed = rename.isError || setVisibility.isError || remove.isError || duplicateFailed;
  const list = plays.data ?? [];

  return (
    <Container size="lg" py="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>{t('home.mine.title', 'My systems')}</Title>
          <Button component={Link} to="/">
            {t('mine.new', 'New')}
          </Button>
        </Group>
        <TextInput
          aria-label={t('mine.search', 'Search my systems')}
          placeholder={t('mine.search', 'Search my systems')}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        {(plays.isError || failed) && (
          <Alert color="red">{t('mine.error', 'Something went wrong. Please try again.')}</Alert>
        )}
        {plays.isSuccess && list.length === 0 && (
          <Text c="dimmed">
            {debounced === ''
              ? t('mine.empty', 'You have not saved any system yet.')
              : t('mine.noMatch', 'No system matches this search.')}
          </Text>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          {list.map((summary) => (
            <PlayCard
              key={summary.id}
              summary={summary}
              showVisibility
              onOpen={() => void navigate(`/play/${summary.id}`)}
              actions={
                <Menu position="bottom-end">
                  <Menu.Target>
                    <Button
                      variant="subtle"
                      aria-label={t('mine.moreActions', 'More actions for {{name}}', { name: summary.name })}
                    >
                      …
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      onClick={() => setRenaming((r) => ({ opened: true, count: r.count + 1, target: summary }))}
                    >
                      {t('mine.actions.rename', 'Rename')}
                    </Menu.Item>
                    <Menu.Item onClick={() => setVisibility.mutate({ id: summary.id, isPublic: !summary.isPublic })}>
                      {summary.isPublic
                        ? t('mine.actions.makePrivate', 'Make private')
                        : t('mine.actions.makePublic', 'Make public')}
                    </Menu.Item>
                    <Menu.Item onClick={() => void duplicate(summary)}>
                      {t('mine.actions.duplicate', 'Duplicate')}
                    </Menu.Item>
                    <Menu.Item
                      color="red"
                      onClick={() => setDeleting((d) => ({ opened: true, count: d.count + 1, target: summary }))}
                    >
                      {t('mine.actions.delete', 'Delete')}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              }
            />
          ))}
        </SimpleGrid>
      </Stack>
      <RenamePlayDialog
        key={`rename-${renaming.count}`}
        opened={renaming.opened}
        initialName={renaming.target?.name ?? ''}
        onSubmit={(name) => {
          if (renaming.target) rename.mutate({ id: renaming.target.id, name });
          setRenaming((r) => ({ ...r, opened: false }));
        }}
        onClose={() => setRenaming((r) => ({ ...r, opened: false }))}
      />
      <ConfirmDelete
        key={`delete-${deleting.count}`}
        opened={deleting.opened}
        title={t('mine.delete.title', 'Delete system')}
        body={t('mine.delete.body', 'Delete {{name}}? This cannot be undone.', { name: deleting.target?.name ?? '' })}
        confirmLabel={t('mine.delete.confirm', 'Delete')}
        onConfirm={() => {
          if (deleting.target) remove.mutate(deleting.target.id);
          setDeleting((d) => ({ ...d, opened: false }));
        }}
        onClose={() => setDeleting((d) => ({ ...d, opened: false }))}
      />
    </Container>
  );
}
