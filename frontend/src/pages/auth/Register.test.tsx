import { describe, it, expect, vi, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '@/context/AuthContext';
import Register from './Register';

vi.mock('@react-oauth/google', () => ({ GoogleLogin: () => null }));
vi.mock('@/components/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/components/PixelGasBackground', () => ({ PixelGasBackground: () => null }));

// Walks the form up to the email step.
const renderAtEmailStep = (register: Mock = vi.fn()) => {
  render(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <AuthContext.Provider value={{ register, loginWithGoogle: vi.fn() } as any}>
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  const continueButton = () => screen.getByRole('button', { name: 'Continue' });

  fireEvent.click(screen.getByRole('button', { name: /sign up with email/i }));
  fireEvent.change(screen.getByPlaceholderText('First name'), { target: { value: 'Ada' } });
  fireEvent.click(continueButton());
  fireEvent.change(screen.getByPlaceholderText('mm'), { target: { value: '01' } });
  fireEvent.change(screen.getByPlaceholderText('dd'), { target: { value: '15' } });
  fireEvent.change(screen.getByPlaceholderText('yyyy'), { target: { value: '1990' } });
  fireEvent.click(continueButton());

  const submitEmail = (value: string) => {
    fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value } });
    fireEvent.click(continueButton());
  };
  return { submitEmail, continueButton };
};

const breachedError = () =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 400,
    data: { error: 'This password has appeared in a known data breach', code: 'PASSWORD_BREACHED' },
  } as AxiosResponse);

// Walks the form to the password step and fills it in with terms accepted.
const renderAtPasswordStep = (register: Mock) => {
  const { submitEmail } = renderAtEmailStep(register);
  submitEmail('ada@gmail.com');
  const setPassword = (value: string) =>
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value } });
  setPassword('Password1!');
  fireEvent.change(screen.getByPlaceholderText('Confirm Password'), { target: { value: 'Password1!' } });
  fireEvent.click(screen.getByRole('checkbox'));
  return { setPassword };
};

describe('Register breached password', () => {
  it('warns, then lets the user keep the password by pressing Create Account again', async () => {
    const register = vi.fn().mockRejectedValueOnce(breachedError()).mockResolvedValueOnce(undefined);
    renderAtPasswordStep(register);

    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(await screen.findByText(/known data breach/i)).toBeInTheDocument();
    expect(register.mock.calls[0][5]).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Create Account Anyway' }));
    await waitFor(() => expect(register).toHaveBeenCalledTimes(2));
    expect(register.mock.calls[1][5]).toBe(true);
  });

  it('keeps the warning after the password is edited, but no longer overrides the check', async () => {
    const register = vi.fn().mockRejectedValueOnce(breachedError());
    const { setPassword } = renderAtPasswordStep(register);

    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    await screen.findByText(/known data breach/i);

    setPassword('Password1!x');
    expect(screen.getByText(/known data breach/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
  });
});
