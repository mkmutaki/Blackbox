const crypto = require('node:crypto');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const ActionToken = require('../models/ActionToken');
const googleAuthService = require('../services/googleAuth');
const { signAccessToken, verifyAccessToken } = require('../services/jwt');
const { generateRawToken, hashToken } = require('../services/tokens');
const { validatePassword } = require('../services/passwordPolicy');
const { meetsMinimumAge, MIN_AGE_YEARS } = require('../services/agePolicy');
const { deleteUserAccount } = require('../services/accountDeletion');
const {
  CURRENT_TERMS_VERSION,
  TERMS_ACCEPTANCE_REQUIRED,
  SIGNUP_DETAILS_REQUIRED,
  recordTermsAcceptance,
} = require('../services/legal');
const { logSecurityEvent } = require('../services/securityLog');
// Not destructured — tests spy on this module's own methods (vi.spyOn), the
// same reason services/googleAuth.js is referenced this way: a destructured
// reference is bound before a spy can ever intercept it.
const emailService = require('../services/email');
const { toSafeUser } = require('../services/userView');
const {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE_MS,
  readCookie,
  setAccessTokenCookie,
  setRefreshTokenCookie,
  clearAuthCookies,
} = require('../services/cookies');

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

const publicUser = toSafeUser;

// Error name and driver code only. Mongo/Mongoose error messages echo the
// offending values — a duplicate-key error on register carries the full
// email address — and those don't belong in the host's logs (SEC-38).
const logError = (label, error) => {
  console.error(`${label}: ${error?.name || 'Error'}${error?.code ? ` code=${error.code}` : ''}`);
};

const DUPLICATE_KEY = 11000;
const REGISTRATION_FAILED = 'Unable to complete registration. If you already have an account, try signing in instead.';

// Sent when the version a client agreed to isn't the current one — almost
// always a tab opened before the terms changed.
const TERMS_OUTDATED = {
  error: 'The Terms of Service or Privacy Policy changed since this page loaded. Reload to review and accept the current version.',
  code: TERMS_ACCEPTANCE_REQUIRED,
};

// Shared by email and Google sign-up: the parsed date, or the error to send.
const parseDateOfBirth = (dateOfBirth) => {
  const birthDate = new Date(dateOfBirth);
  if (isNaN(birthDate.getTime())) {
    return { error: 'Invalid date of birth' };
  }
  if (birthDate > new Date()) {
    return { error: 'Date of birth cannot be in the future' };
  }
  if (!meetsMinimumAge(birthDate)) {
    return { error: `You must be at least ${MIN_AGE_YEARS} years old to use Blackbox` };
  }
  return { birthDate };
};

// The AuditLog entry is the durable proof of acceptance: append-only, and
// it outlives the user document.
const logTermsAccepted = (user, req, via) =>
  logSecurityEvent('terms_accepted', {
    actor: user._id,
    targetType: 'user',
    targetId: user._id,
    ip: req.ip,
    meta: { version: user.termsAcceptance.version, via },
  });

const issueRefreshToken = async (user, familyId) => {
  const rawToken = generateRawToken();
  await RefreshToken.create({
    tokenHash: hashToken(rawToken),
    userId: user._id,
    familyId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS),
  });
  return rawToken;
};

// Starts a brand-new session (new refresh-token family) and sets both
// cookies. Used by register/login/google — each is a fresh login event,
// never a continuation of an existing family (that's what /refresh is for).
const issueNewSession = async (res, user) => {
  const familyId = crypto.randomUUID();
  const refreshToken = await issueRefreshToken(user, familyId);
  setAccessTokenCookie(res, signAccessToken(user, familyId));
  setRefreshTokenCookie(res, refreshToken);
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
const register = async (req, res) => {
  try {
    // Presence, type and length are already enforced by the registerSchema
    // validate() middleware in authRoutes.js — only date-of-birth semantics
    // and password composition need checking here.
    const { email, password, fullName, dateOfBirth, acceptedTermsVersion } = req.body;

    if (acceptedTermsVersion !== CURRENT_TERMS_VERSION) {
      return res.status(400).json(TERMS_OUTDATED);
    }

    const { birthDate, error: birthDateError } = parseDateOfBirth(dateOfBirth);
    if (birthDateError) {
      return res.status(400).json({ error: birthDateError });
    }

    const passwordError = await validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      // Generic on purpose (SEC-10) — doesn't confirm this email is already
      // registered.
      return res.status(400).json({ error: REGISTRATION_FAILED });
    }

    // Create new user (password is hashed in the pre-save hook)
    const user = new User({
      email,
      password,
      profile: {
        fullName: fullName.trim(),
        username: fullName.trim(),
        dateOfBirth: birthDate,
        isProfileComplete: true,
        onboardingComplete: false
      }
    });
    recordTermsAcceptance(user);
    await user.save();
    await logTermsAccepted(user, req, 'register');

    const rawVerifyToken = generateRawToken();
    await ActionToken.create({
      tokenHash: hashToken(rawVerifyToken),
      userId: user._id,
      purpose: 'email_verify',
      expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
    });
    await emailService.sendVerificationEmail(user, rawVerifyToken);

    await issueNewSession(res, user);

    res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    // Two concurrent registrations for one email both pass the findOne
    // check above; the unique index rejects the second. Same generic
    // answer as the ordinary duplicate case, not a 500.
    if (error?.code === DUPLICATE_KEY) {
      return res.status(400).json({ error: REGISTRATION_FAILED });
    }
    logError('Register error', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
const login = async (req, res) => {
  try {
    // loginSchema's validate() middleware already pinned email/password to
    // strings, which is the actual SEC-06 fix — an operator payload like
    // {"$ne": null} never reaches this query.
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      // Burn the same bcrypt work a real account would, so response time
      // doesn't reveal whether the email is registered (SEC-35).
      await User.compareAgainstDummyHash(password);
      await logSecurityEvent('login_failure', { ip: req.ip, meta: { email, reason: 'unknown_email' } });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await logSecurityEvent('login_failure', { targetType: 'user', targetId: user._id, ip: req.ip, meta: { email, reason: 'wrong_password' } });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await issueNewSession(res, user);
    await logSecurityEvent('login_success', { actor: user._id, targetType: 'user', targetId: user._id, ip: req.ip, meta: { email } });

    res.json({ user: publicUser(user) });
  } catch (error) {
    logError('Login error', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// @route   POST /api/auth/google
// @desc    Authenticate (or register) a user via a Google ID token
// @access  Public
const googleAuth = async (req, res) => {
  try {
    const { credential, dateOfBirth, acceptedTermsVersion } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Missing Google credential' });
    }

    let payload;
    try {
      payload = await googleAuthService.verifyGoogleToken(credential);
    } catch (verifyError) {
      // Fixed text only. google-auth-library builds its error messages
      // from the submitted token and its decoded payload (email, name),
      // so logging the error would let anyone write arbitrary text —
      // including fake log lines — into the host's logs (SEC-36).
      console.error('Google token verification failed');
      return res.status(401).json({ error: 'Invalid Google credential' });
    }

    const { sub: googleId, email, email_verified, name } = payload;

    if (!email || !email_verified) {
      return res.status(401).json({ error: 'Google account email is not verified' });
    }

    // Find by googleId first, then fall back to an existing local account with the same email
    let user = await User.findOne({ googleId });

    if (!user) {
      const existingLocal = await User.findOne({ email });

      if (existingLocal) {
        // SEC-01: only link when the existing local account's email is
        // already independently verified. Otherwise this is exactly the
        // account-takeover shape — someone could have pre-registered this
        // email with a password of their own choosing, and silently
        // linking here would hand them the account the real owner is
        // trying to sign into right now. Make them prove ownership the
        // normal way (password sign-in, or reset it) instead.
        if (!existingLocal.emailVerified) {
          await logSecurityEvent('google_link_blocked_unverified', {
            targetType: 'user',
            targetId: existingLocal._id,
            ip: req.ip,
            meta: { email },
          });
          return res.status(409).json({
            error: 'An account with this email already exists. Sign in with your password (or reset it) to link Google.',
          });
        }

        existingLocal.googleId = googleId;
        await existingLocal.save();
        user = existingLocal;
        await logSecurityEvent('google_link_success', { actor: user._id, targetType: 'user', targetId: user._id, ip: req.ip, meta: { email } });
      } else {
        // Nothing is stored for a new Google identity until it has the two
        // things email registration requires up front: a date of birth that
        // meets the minimum age, and agreement to the current terms. The
        // frontend answers this code with that form, then resends the same
        // credential (Google ID tokens stay valid for about an hour).
        if (!dateOfBirth || !acceptedTermsVersion) {
          return res.status(403).json({
            error: 'Confirm your date of birth and accept the Terms to finish creating your account.',
            code: SIGNUP_DETAILS_REQUIRED,
          });
        }
        if (acceptedTermsVersion !== CURRENT_TERMS_VERSION) {
          return res.status(400).json(TERMS_OUTDATED);
        }
        const { birthDate, error: birthDateError } = parseDateOfBirth(dateOfBirth);
        if (birthDateError) {
          return res.status(400).json({ error: birthDateError });
        }

        const googleName = name || email.split('@')[0];
        user = new User({
          email,
          googleId,
          authProvider: 'google',
          emailVerified: true, // Google already verified this on their end
          profile: {
            fullName: googleName,
            username: googleName,
            dateOfBirth: birthDate,
            isProfileComplete: true,
            onboardingComplete: false
          }
        });
        recordTermsAcceptance(user);
        await user.save();
        await logTermsAccepted(user, req, 'google_signup');
      }
    }

    await issueNewSession(res, user);

    res.json({ user: publicUser(user) });
  } catch (error) {
    logError('Google auth error', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// @route   POST /api/auth/logout
// @desc    Revoke the current session's refresh-token family and clear cookies
// @access  Public (a missing/invalid token is a no-op, not an error)
const logout = async (req, res) => {
  try {
    const rawRefreshToken = readCookie(req, REFRESH_TOKEN_COOKIE);
    const revokeFamily = (filter) => RefreshToken.updateMany(filter, { $set: { revokedAt: new Date() } });

    if (rawRefreshToken) {
      const existing = await RefreshToken.findOne({ tokenHash: hashToken(rawRefreshToken) });
      if (existing) {
        await revokeFamily({ familyId: existing.familyId });
      }
    } else {
      // No refresh cookie (cleared, or blocked by the browser) — fall back
      // to the access token's session id so logout still ends the session
      // server-side instead of only clearing local state.
      const rawAccessToken = readCookie(req, ACCESS_TOKEN_COOKIE);
      if (rawAccessToken) {
        try {
          const decoded = verifyAccessToken(rawAccessToken);
          if (typeof decoded.sid === 'string') {
            await revokeFamily({ userId: decoded.userId, familyId: decoded.sid });
          }
        } catch {
          // invalid or expired access token — nothing to revoke
        }
      }
    }
  } catch (error) {
    logError('Logout error', error);
    // fall through — clearing cookies client-side still ends the session
    // from the browser's point of view even if the DB update above failed.
  }

  clearAuthCookies(res);
  res.json({ message: 'Logged out' });
};

// @route   POST /api/auth/refresh
// @desc    Rotate the refresh token and issue a new access token
// @access  Public (requires the refresh-token cookie)
const refresh = async (req, res) => {
  try {
    const rawRefreshToken = readCookie(req, REFRESH_TOKEN_COOKIE);
    if (!rawRefreshToken) {
      return res.status(401).json({ error: 'No refresh token' });
    }

    const tokenHash = hashToken(rawRefreshToken);
    const existing = await RefreshToken.findOne({ tokenHash });

    if (!existing) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    if (existing.revokedAt || existing.replacedByHash) {
      // This exact token was already rotated away (or revoked) once — the
      // legitimate client would always be holding the newest token in the
      // chain, so presenting an old one again means it was copied/stolen.
      // Burn the whole family and bump tokenVersion so even a currently
      // live access token from this chain stops working immediately.
      await RefreshToken.updateMany({ familyId: existing.familyId }, { $set: { revokedAt: new Date() } });
      await User.findByIdAndUpdate(existing.userId, { $inc: { tokenVersion: 1 } });
      await logSecurityEvent('refresh_token_reuse', { targetType: 'user', targetId: existing.userId, ip: req.ip, meta: { familyId: existing.familyId } });
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Session invalid — please sign in again' });
    }

    if (existing.expiresAt < new Date()) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    const user = await User.findById(existing.userId);
    if (!user) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const newRawToken = await issueRefreshToken(user, existing.familyId);
    existing.replacedByHash = hashToken(newRawToken);
    await existing.save();

    setAccessTokenCookie(res, signAccessToken(user, existing.familyId));
    setRefreshTokenCookie(res, newRawToken);

    res.json({ user: publicUser(user) });
  } catch (error) {
    logError('Refresh error', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// @route   POST /api/auth/verify-email
// @desc    Consume an emailed verification token
// @access  Public
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Missing token' });
    }

    const actionToken = await ActionToken.findOne({ tokenHash: hashToken(token), purpose: 'email_verify' });

    if (!actionToken || actionToken.usedAt || actionToken.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired verification link' });
    }

    await User.findByIdAndUpdate(actionToken.userId, { emailVerified: true });
    actionToken.usedAt = new Date();
    await actionToken.save();

    res.json({ message: 'Email verified' });
  } catch (error) {
    logError('Verify email error', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// @route   POST /api/auth/request-password-reset
// @desc    Email a password-reset link if the address has an account
// @access  Public
const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    // Identical response whether or not the account exists (SEC-10).
    const genericResponse = { message: 'If an account with that email exists, a reset link has been sent.' };

    if (!email || typeof email !== 'string') {
      return res.json(genericResponse);
    }

    const user = await User.findOne({ email });
    if (user) {
      const rawToken = generateRawToken();
      await ActionToken.create({
        tokenHash: hashToken(rawToken),
        userId: user._id,
        purpose: 'password_reset',
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      });
      await emailService.sendPasswordResetEmail(user, rawToken);
    }

    res.json(genericResponse);
  } catch (error) {
    logError('Request password reset error', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// @route   POST /api/auth/reset-password
// @desc    Consume an emailed reset token and set a new password
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    const actionToken = await ActionToken.findOne({ tokenHash: hashToken(token), purpose: 'password_reset' });

    if (!actionToken || actionToken.usedAt || actionToken.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    const passwordError = await validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const user = await User.findById(actionToken.userId);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    user.password = password; // re-hashed by the pre-save hook
    // Completing a reset is equally strong proof of inbox control as
    // clicking the verification link — and closes the SEC-01 loop: an
    // attacker who pre-registered this email never controls the inbox, so
    // they can never complete this step.
    user.emailVerified = true;
    user.tokenVersion += 1;
    await user.save();

    actionToken.usedAt = new Date();
    await actionToken.save();

    // A password reset is often a response to a suspected compromise —
    // don't leave any other device's session alive.
    await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });

    await logSecurityEvent('password_change', { actor: user._id, targetType: 'user', targetId: user._id, ip: req.ip, meta: { email: user.email } });

    res.json({ message: 'Password reset successfully. Please sign in again.' });
  } catch (error) {
    logError('Reset password error', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(toSafeUser(user));
  } catch (error) {
    logError('Get current user error', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// @route   POST /api/auth/accept-terms
// @desc    Record the signed-in user's agreement to the current terms
// @access  Private
const acceptTerms = async (req, res) => {
  try {
    if (req.body.acceptedTermsVersion !== CURRENT_TERMS_VERSION) {
      return res.status(400).json(TERMS_OUTDATED);
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Accounts created while the minimum age was lower can't take on terms
    // that require 13+. They stay blocked from recording (requireCurrentTerms)
    // rather than being deleted automatically — removing someone's data is
    // the operator's call, not a side effect of a button.
    const birthDate = user.profile?.dateOfBirth;
    if (birthDate && !meetsMinimumAge(birthDate)) {
      return res.status(403).json({ error: `Blackbox is only available to people ${MIN_AGE_YEARS} and older.` });
    }

    recordTermsAcceptance(user);
    await user.save();
    await logTermsAccepted(user, req, 'prompt');

    res.json({ user: toSafeUser(user) });
  } catch (error) {
    logError('Accept terms error', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// @route   DELETE /api/auth/account
// @desc    Permanently delete the caller's own account: videos, S3
//          objects, tokens and profile. Requires re-proving control of the
//          account right now — the current short-lived access token alone
//          isn't enough for a destructive, irreversible action like this.
// @access  Private
const deleteAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.authProvider === 'google') {
      const { credential } = req.body;
      if (!credential) {
        return res.status(400).json({ error: 'Please sign in with Google again to confirm.' });
      }

      let payload;
      try {
        payload = await googleAuthService.verifyGoogleToken(credential);
      } catch (verifyError) {
        return res.status(401).json({ error: 'Invalid Google credential' });
      }

      if (payload.sub !== user.googleId) {
        return res.status(401).json({ error: 'That Google account does not match this account' });
      }
    } else {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ error: 'Password is required to delete your account' });
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Incorrect password' });
      }
    }

    const result = await deleteUserAccount(user._id);

    clearAuthCookies(res);
    // failedS3Keys lands in the audit log so an orphaned object stays
    // traceable for cleanup after its Video record is gone.
    await logSecurityEvent('account_deleted', {
      actor: user._id,
      targetType: 'user',
      targetId: user._id,
      ip: req.ip,
      meta: {
        email: user.email,
        deletedVideoCount: result.deletedVideoCount,
        failedS3Keys: result.failedS3Keys,
      },
    });

    res.json({ message: 'Account deleted' });
  } catch (error) {
    logError('Delete account error', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  register,
  login,
  googleAuth,
  logout,
  refresh,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  getCurrentUser,
  deleteAccount,
  acceptTerms,
};
