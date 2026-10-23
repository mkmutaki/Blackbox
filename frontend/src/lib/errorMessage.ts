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

// The machine-readable `code` some responses carry alongside `error`
// (e.g. SIGNUP_DETAILS_REQUIRED), for UI that branches on the kind of
// failure rather than showing its message.
export const getErrorCode = (error: unknown): string | undefined => {
  if (error instanceof AxiosError) {
    const data = error.response?.data as { code?: string } | undefined;
    if (typeof data?.code === 'string') return data.code;
  }
  return undefined;
};
