import { AxiosError } from 'axios';

// Every form's catch block does the same unsafe `error.response?.data?.error`
// reach-in on a caught value typed `any`. One helper, typed properly, so
// the repeated access pattern doesn't need an explicit `any` everywhere.
export const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof AxiosError) {
    const data = error.response?.data as { error?: string } | undefined;
    if (typeof data?.error === 'string') return data.error;
  }
  return fallback;
};
