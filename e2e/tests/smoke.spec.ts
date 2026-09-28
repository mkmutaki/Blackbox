import { test, expect, type Page } from '@playwright/test';

const uniqueEmail = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

const PASSWORD = 'Sup3rSecret!Password';

const register = async (page: Page, email: string) => {
  await page.goto('/register');

  await page.getByRole('button', { name: /sign up with email/i }).click();

  await page.locator('#fullName').fill('E2E Test User');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.locator('#dobMonth').fill('01');
  await page.locator('#dobDay').fill('15');
  await page.locator('#dobYear').fill('1990');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.locator('#email').fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.locator('#password').fill(PASSWORD);
  await page.locator('#confirmPassword').fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page).toHaveURL(/\/home$/);
};

const onboardingHeading = (page: Page, text: string) => page.getByRole('heading', { name: text });

const completeOnboarding = async (page: Page) => {
  await expect(onboardingHeading(page, 'Welcome to Blackbox')).toBeVisible();
  await page.getByRole('button', { name: 'Get started' }).click();

  await expect(onboardingHeading(page, 'Choose your callsign')).toBeVisible();
  await page.locator('#callsign').fill('E2E Ghost');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(onboardingHeading(page, 'Your recordings are encrypted')).toBeVisible();
  await page.getByRole('button', { name: 'Never' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(onboardingHeading(page, 'Why SYNODIC?')).toBeVisible();
  await page.getByRole('button', { name: /begin your journey/i }).click();

  await expect(onboardingHeading(page, 'Why SYNODIC?')).not.toBeVisible();
};

const login = async (page: Page, email: string) => {
  await page.goto('/login');
  await page.getByPlaceholder('Email address').fill(email);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
};

test('register, record, upload, play, rename, delete, logout, log back in', async ({ page }) => {
  const email = uniqueEmail();

  await register(page, email);
  await completeOnboarding(page);

  // --- record ---
  await page.getByRole('button', { name: /click to start recording/i }).click();

  // The record button is clickable before getUserMedia resolves; clicking it
  // too early is a silent no-op (toast + early return), so wait for the live
  // camera stream to actually attach before driving the recorder.
  await page.waitForFunction(() => {
    const video = document.querySelector('video');
    return Boolean(video && (video as HTMLVideoElement).srcObject);
  }, { timeout: 15_000 });

  const recordToggle = page.getByTestId('record-toggle');
  await expect(recordToggle).toBeVisible();
  await recordToggle.click();
  await expect(recordToggle).toHaveClass(/bg-destructive/);

  // Let MediaRecorder capture at least a couple of chunks (it flushes every 1s).
  await page.waitForTimeout(2500);

  await recordToggle.click();
  await expect(recordToggle).not.toHaveClass(/bg-destructive/);

  // --- upload ---
  const titleInput = page.getByTestId('video-title-input');
  await expect(titleInput).toBeVisible();
  const videoTitle = 'E2E Mission Log';
  await titleInput.fill(videoTitle);

  await page.getByTestId('save-recording').click();

  // Saving returns to the Index screen once the upload resolves.
  await expect(page.getByRole('button', { name: /click to start recording/i })).toBeVisible({
    timeout: 20_000,
  });

  // --- list ---
  await expect(page.getByText(videoTitle)).toBeVisible();

  // --- play ---
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.locator('video[src^="blob:"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Failed to decrypt video')).not.toBeVisible();
  await page.keyboard.press('Escape');

  // --- rename ---
  await page.getByTestId('edit-video-title').click();
  const editInput = page.getByTestId('edit-title-input');
  await editInput.fill('Renamed E2E Log');
  await page.getByTestId('confirm-edit-title').click();
  await expect(page.getByText('Renamed E2E Log')).toBeVisible();
  await expect(page.getByText(videoTitle)).not.toBeVisible();

  // --- delete ---
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('delete-video').click();
  await expect(page.getByText('No entries recorded yet.')).toBeVisible({ timeout: 10_000 });

  // --- logout ---
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/$/);

  // --- log back in ---
  await login(page, email);
  await expect(onboardingHeading(page, 'Why SYNODIC?')).not.toBeVisible();
  await expect(page.getByText('No entries recorded yet.')).toBeVisible();
});
