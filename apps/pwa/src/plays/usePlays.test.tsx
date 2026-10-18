import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../app/queryClient';
import type { Play, PlayId } from '../engine';
import type { StoredPlay } from '../types/StoredPlay';
import type { PlaySummary } from '../types/PlaySummary';
import * as api from './playsApi';
import { playKeys, useDeletePlay, useMyPlays, useRenamePlay, useSavePlay, useSetVisibility } from './usePlays';

vi.mock('./playsApi');

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const summary: PlaySummary = {
  id: 'p1' as PlayId,
  name: 'Horns',
  court: 'nba',
  extent: 'half',
  isPublic: false,
  updatedAt: '2026-01-01T00:00:00Z',
  ownerId: 'u1',
};

beforeEach(() => {
  vi.resetAllMocks();
  client = createQueryClient();
});

describe('useMyPlays', () => {
  it('returns what the API returned', async () => {
    vi.mocked(api.listMyPlays).mockResolvedValue([summary]);
    const { result } = renderHook(() => useMyPlays('ho'), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([summary]));
    expect(api.listMyPlays).toHaveBeenCalledWith('ho');
  });
});

describe('mutations', () => {
  it('rename invalidates mine and public', async () => {
    vi.mocked(api.renamePlay).mockResolvedValue();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useRenamePlay(), { wrapper });
    await act(() => result.current.mutateAsync({ id: 'p1' as PlayId, name: 'New' }));
    const keys = spy.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toContainEqual(playKeys.mine());
    expect(keys).toContainEqual(playKeys.public());
  });

  it('save invalidates mine, public and the saved system', async () => {
    const stored = { id: 'p1' as PlayId } as StoredPlay;
    vi.mocked(api.updatePlay).mockResolvedValue(stored);
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSavePlay(), { wrapper });
    await act(() => result.current.mutateAsync({ play: {} as Play }));
    const keys = spy.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toContainEqual(playKeys.mine());
    expect(keys).toContainEqual(playKeys.public());
    expect(keys).toContainEqual(playKeys.one(stored.id));
  });

  it('save inserts when given an owner and updates otherwise', async () => {
    vi.mocked(api.insertPlay).mockResolvedValue({ id: 'p1' as PlayId } as StoredPlay);
    const { result } = renderHook(() => useSavePlay(), { wrapper });
    const play = {} as Play;
    await act(() => result.current.mutateAsync({ play, insert: { ownerId: 'u1', isPublic: false } }));
    expect(api.insertPlay).toHaveBeenCalledWith(play, { ownerId: 'u1', isPublic: false });
    expect(api.updatePlay).not.toHaveBeenCalled();
  });

  it('a failed rename surfaces as isError and invalidates nothing', async () => {
    vi.mocked(api.renamePlay).mockRejectedValue(new Error('nope'));
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useRenamePlay(), { wrapper });
    act(() => result.current.mutate({ id: 'p1' as PlayId, name: 'New' }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(spy).not.toHaveBeenCalled();
  });

  it('a visibility change invalidates mine and public', async () => {
    vi.mocked(api.setPlayVisibility).mockResolvedValue();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSetVisibility(), { wrapper });
    await act(() => result.current.mutateAsync({ id: 'p1' as PlayId, isPublic: true }));
    const keys = spy.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toContainEqual(playKeys.mine());
    expect(keys).toContainEqual(playKeys.public());
  });

  it('a failure surfaces as isError and does not throw', async () => {
    vi.mocked(api.deletePlay).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useDeletePlay(), { wrapper });
    act(() => result.current.mutate('p1' as PlayId));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('boom');
  });
});
