import { QueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // api.ts already retries idempotent GETs on network/5xx; here only
      // give one more shot for those and never for a definitive 4xx.
      retry: (failureCount, error) =>
        failureCount < 1 && !(isAxiosError(error) && error.response && error.response.status < 500),
      staleTime: 30 * 1000,
    },
  },
});
