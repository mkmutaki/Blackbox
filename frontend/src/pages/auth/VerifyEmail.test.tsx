import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { post } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import VerifyEmail from './VerifyEmail';

vi.mock('@/services/api', () => ({ post: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/components/PixelGasBackground', () => ({ PixelGasBackground: () => null }));

const expiredLink = () =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 400,
    data: { error: 'Invalid or expired verification link' },
  } as AxiosResponse);

const signedIn = (emailVerified: boolean) =>
  vi.mocked(useAuth).mockReturnValue({ user: { emailVerified } } as ReturnType<typeof useAuth>);

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/verify-email?token=old']}>
      <VerifyEmail />
    </MemoryRouter>,
  );

describe('VerifyEmail with an expired link', () => {
  beforeEach(() => {
    vi.mocked(post).mockReset().mockRejectedValueOnce(expiredLink());
  });

  it('lets a signed-in, unverified user send themselves a new link', async () => {
    signedIn(false);
    vi.mocked(post).mockResolvedValueOnce({ message: 'A new verification link is on its way.' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Send a new link' }));

    expect(await screen.findByText('A new verification link is on its way.')).toBeInTheDocument();
    expect(vi.mocked(post)).toHaveBeenLastCalledWith('/auth/resend-verification');
    expect(screen.queryByRole('button', { name: 'Send a new link' })).not.toBeInTheDocument();
  });

  it('shows the error if the new link could not be sent, and allows another try', async () => {
    signedIn(false);
    vi.mocked(post).mockRejectedValueOnce(
      new AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, undefined, {
        status: 503,
        data: { error: "We couldn't send a new link right now. Please try again in a few minutes." },
      } as AxiosResponse),
    );
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Send a new link' }));

    expect(await screen.findByText(/couldn't send a new link right now/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send a new link' })).toBeEnabled();
  });

  it('offers no new link when signed out', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as ReturnType<typeof useAuth>);
    renderPage();

    expect(await screen.findByText('Invalid or expired verification link')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send a new link' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toBeInTheDocument();
  });

  it('offers no new link to an already-verified account', async () => {
    signedIn(true);
    renderPage();

    expect(await screen.findByText('Invalid or expired verification link')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send a new link' })).not.toBeInTheDocument();
  });
});
