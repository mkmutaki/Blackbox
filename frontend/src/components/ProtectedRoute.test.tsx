import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AuthContext } from '@/context/AuthContext';

// Canvas animation and Google's script aren't what's under test here.
vi.mock('@/components/PixelGasBackground', () => ({ PixelGasBackground: () => null }));
vi.mock('@react-oauth/google', () => ({ GoogleLogin: () => null }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderWithAuth = (authValue: any) =>
  render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );

describe('ProtectedRoute', () => {
  it('redirects to /login when the user is not authenticated', () => {
    renderWithAuth({ isLoggedIn: false, isLoading: false, user: null });

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders the protected content when authenticated with a complete profile', () => {
    renderWithAuth({
      isLoggedIn: true,
      isLoading: false,
      user: { profile: { isProfileComplete: true } },
    });

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });

  it('shows a loading state instead of redirecting while auth status is resolving', () => {
    const { container } = renderWithAuth({ isLoggedIn: false, isLoading: true, user: null });

    expect(container.querySelector('.animate-spin')).toBeTruthy();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('shows the terms prompt instead of the app until the account accepts', () => {
    renderWithAuth({
      isLoggedIn: true,
      isLoading: false,
      user: { termsAcceptanceRequired: true, profile: { isProfileComplete: true } },
    });

    expect(screen.getByText('Before you continue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agree and continue' })).toBeDisabled();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});
