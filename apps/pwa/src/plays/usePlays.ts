import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Play, PlayId } from '../engine';
import {
  deletePlay,
  fetchPlay,
  insertPlay,
  listMyPlays,
  listPublicPlays,
  renamePlay,
  setPlayVisibility,
  updatePlay,
} from './playsApi';

/** `mine()` and `public()` with no search are prefixes: invalidating them reaches every search. */
export const playKeys = {
  mine: (search?: string) => (search ? (['plays', 'mine', search] as const) : (['plays', 'mine'] as const)),
  public: (search?: string) => (search ? (['plays', 'public', search] as const) : (['plays', 'public'] as const)),
  one: (id: PlayId | undefined) => ['plays', 'one', id] as const,
};

export const useMyPlays = (search?: string) =>
  useQuery({ queryKey: playKeys.mine(search), queryFn: () => listMyPlays(search) });

export const usePublicPlays = (search?: string) =>
  useQuery({ queryKey: playKeys.public(search), queryFn: () => listPublicPlays(search) });

export const useStoredPlay = (id: PlayId | undefined) =>
  useQuery({ queryKey: playKeys.one(id), queryFn: () => fetchPlay(id as PlayId), enabled: id !== undefined });

export interface SavePlayInput {
  play: Play;
  /** Present for a system's first save, absent when it already has a row. */
  insert?: { ownerId: string; isPublic: boolean };
}

/**
 * Every write invalidates `mine` and `public`: a system that is already public must not sit in the
 * library under its old name or content, and a coach cannot fix that list by reloading their own page.
 */
export function useSavePlay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ play, insert }: SavePlayInput) => (insert ? insertPlay(play, insert) : updatePlay(play)),
    onSuccess: async (stored) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: playKeys.mine() }),
        queryClient.invalidateQueries({ queryKey: playKeys.public() }),
        queryClient.invalidateQueries({ queryKey: playKeys.one(stored.id) }),
      ]);
    },
  });
}

export function useRenamePlay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: PlayId; name: string }) => renamePlay(id, name),
    onSuccess: async (_data, { id }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: playKeys.mine() }),
        queryClient.invalidateQueries({ queryKey: playKeys.public() }),
        queryClient.invalidateQueries({ queryKey: playKeys.one(id) }),
      ]);
    },
  });
}

export function useSetVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isPublic }: { id: PlayId; isPublic: boolean }) => setPlayVisibility(id, isPublic),
    onSuccess: async (_data, { id }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: playKeys.mine() }),
        queryClient.invalidateQueries({ queryKey: playKeys.public() }),
        queryClient.invalidateQueries({ queryKey: playKeys.one(id) }),
      ]);
    },
  });
}

export function useDeletePlay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: PlayId) => deletePlay(id),
    onSuccess: async (_data, id) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: playKeys.mine() }),
        queryClient.invalidateQueries({ queryKey: playKeys.public() }),
        queryClient.removeQueries({ queryKey: playKeys.one(id) }),
      ]);
    },
  });
}
