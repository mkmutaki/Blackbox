import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError, AxiosHeaders } from 'axios';
import { AuthContext } from '@/context/AuthContext';
import { GoogleAuthButton } from './GoogleAuthButton';
import { CURRENT_TERMS_VERSION } from '@/lib/legal';

// Stand-in for Google's button: clicking it "signs in" with a fixed credential.
vi.mock('@react-oauth/google', () => ({
  GoogleLogin: ({ onSuccess }: { onSuccess: (r: { credential: string }) => void }) => (
    <button type="button" onClick={() => onSuccess({ credential: 'google-cred' })}>Google</button>
  ),
}));
vi.mock('@/components/ui/use-toast', () => ({ toast: vi.fn() }));

const apiError = (status: number, data: object) =>
  new AxiosError('request failed', String(status), undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  });

const yearsAgo = (years: number) => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
};

const renderButton = (loginWithGoogle: ReturnType<typeof vi.fn>) => {
  const onError = vi.fn();
  render(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <AuthContext.Provider value={{ loginWithGoogle } as any}>
      <MemoryRouter>
        <GoogleAuthButton onError={onError} />
      </MemoryRouter>
    </AuthContext.Provider>
  );
  return { onError };
};

describe('GoogleAuthButton', () => {
  let loginWithGoogle: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    loginWithGoogle = vi.fn();
  });

  it('signs an existing account straight in', async () => {
    loginWithGoogle.mockResolvedValue(undefined);
    renderButton(loginWithGoogle);

    fireEvent.click(screen.getByText('Google'));

    await waitFor(() => expect(loginWithGoogle).toHaveBeenCalledWith('google-cred', undefined));
    expect(screen.queryByText('Finish creating your account')).not.toBeInTheDocument();
  });

  it('asks a new Google identity for a date of birth and agreement, then resends the same credential', async () => {
    loginWithGoogle
      .mockRejectedValueOnce(apiError(403, { code: 'SIGNUP_DETAILS_REQUIRED', error: 'details needed' }))
      .mockResolvedValueOnce(undefined);
    const { onError } = renderButton(loginWithGoogle);

    fireEvent.click(screen.getByText('Google'));
    await screen.findByText('Finish creating your account');
    expect(onError).not.toHaveBeenCalled();

    const submit = screen.getByRole('button', { name: 'Create account' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Date of Birth'), { target: { value: '1990-01-01' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(submit);

    await waitFor(() => expect(loginWithGoogle).toHaveBeenLastCalledWith('google-cred', {
      dateOfBirth: '1990-01-01',
      acceptedTermsVersion: CURRENT_TERMS_VERSION,
    }));
  });

  it('refuses an under-13 date of birth without contacting the server again', async () => {
    loginWithGoogle.mockRejectedValueOnce(apiError(403, { code: 'SIGNUP_DETAILS_REQUIRED', error: 'details needed' }));
    renderButton(loginWithGoogle);

    fireEvent.click(screen.getByText('Google'));
    await screen.findByText('Finish creating your account');

    fireEvent.change(screen.getByLabelText('Date of Birth'), { target: { value: yearsAgo(12) } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(/at least 13 years old/)).toBeInTheDocument();
    expect(loginWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('passes any other failure to the page as an error', async () => {
    loginWithGoogle.mockRejectedValueOnce(apiError(401, { error: 'Invalid Google credential' }));
    const { onError } = renderButton(loginWithGoogle);

    fireEvent.click(screen.getByText('Google'));

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Invalid Google credential'));
  });
});
