import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { post } from '@/services/api';
import Unsubscribe from './Unsubscribe';

vi.mock('@/services/api', () => ({ post: vi.fn() }));
vi.mock('@/components/PixelGasBackground', () => ({ PixelGasBackground: () => null }));

const ID = 'a'.repeat(24);
const TOKEN = 'b'.repeat(64);

const renderPage = (search = `?id=${ID}&token=${TOKEN}`) =>
  render(
    <MemoryRouter initialEntries={[`/unsubscribe${search}`]}>
      <Unsubscribe />
    </MemoryRouter>,
  );

describe('Unsubscribe', () => {
  beforeEach(() => {
    vi.mocked(post).mockReset();
  });

  it('does nothing until the button is pressed', () => {
    renderPage();

    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeInTheDocument();
    expect(vi.mocked(post)).not.toHaveBeenCalled();
  });

  it('unsubscribes with the id and token from the link', async () => {
    vi.mocked(post).mockResolvedValueOnce({ ok: true });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }));

    expect(await screen.findByText(/You're unsubscribed/)).toBeInTheDocument();
    expect(vi.mocked(post)).toHaveBeenCalledWith('/waitlist/unsubscribe', { id: ID, token: TOKEN });
    expect(screen.queryByRole('button', { name: 'Unsubscribe' })).not.toBeInTheDocument();
  });

  it("shows the server's error and allows another try", async () => {
    vi.mocked(post).mockRejectedValueOnce(
      new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 400,
        data: { error: 'This unsubscribe link is invalid.' },
      } as AxiosResponse),
    );
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }));

    expect(await screen.findByText('This unsubscribe link is invalid.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeEnabled();
  });

  it('points to the contact address when the link is incomplete', () => {
    renderPage(`?id=${ID}`);

    expect(screen.getByText(/This unsubscribe link is incomplete/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unsubscribe' })).not.toBeInTheDocument();
  });
});
