import { QueryClient } from '@tanstack/react-query';

/** One configuration for the app and for tests, which each need a fresh client. Failures are not retried. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}
