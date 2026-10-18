import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProfile, saveDisplayName } from './profileApi';
import { useAuthContext } from './useAuthContext';

export const profileKey = (userId: string | null) => ['profile', userId] as const;

/** The signed-in coach's profile; idle while signed out or while the session is still loading. */
export function useProfile() {
  const { status, userId } = useAuthContext();
  return useQuery({
    queryKey: profileKey(userId),
    queryFn: () => fetchProfile(userId as string),
    enabled: status === 'signedIn' && userId !== null,
  });
}

export function useSaveDisplayName() {
  const queryClient = useQueryClient();
  const { userId } = useAuthContext();
  return useMutation({
    mutationFn: (displayName: string) => saveDisplayName(userId as string, displayName),
    onSuccess: async () => {
      // A coach's name appears beside their shared systems as well as on their own list.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: profileKey(userId) }),
        queryClient.invalidateQueries({ queryKey: ['plays'] }),
      ]);
    },
  });
}
