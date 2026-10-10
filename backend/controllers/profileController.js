const User = require('../models/User');
const { toSafeUser } = require('../services/userView');

// @route   PUT /api/profile/update
// @desc    Update user profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    // Presence/type/length already enforced by updateProfileSchema's
    // validate() middleware in profileRoutes.js — only date-of-birth
    // semantics need checking here.
    const { username, dateOfBirth } = req.body;

    const birthDate = new Date(dateOfBirth);
    if (isNaN(birthDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date of birth' });
    }

    if (birthDate > new Date()) {
      return res.status(400).json({ error: 'Date of birth cannot be in the future' });
    }

    // username is only overwritten if explicitly provided (e.g. Google
    // sign-ups already have it set from their Google account).
    const update = {
      'profile.dateOfBirth': birthDate,
      'profile.isProfileComplete': true
    };
    if (username !== undefined) {
      update['profile.username'] = username;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.userId,
      update,
      { new: true, select: '-password' }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user: toSafeUser(updatedUser)
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// @route   GET /api/profile
// @desc    Get user profile
// @access  Private
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(toSafeUser(user));
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// @route   POST /api/profile/onboarding
// @desc    Persist onboarding answers and mark the flow as finished
// @access  Private
const completeOnboarding = async (req, res) => {
  try {
    // Presence/type/length/enum already enforced by onboardingSchema's
    // validate() middleware in profileRoutes.js.
    const { username, autoLockMinutes } = req.body;

    const update = { 'profile.onboardingComplete': true };

    if (username !== undefined) {
      update['profile.username'] = username;
    }

    if (autoLockMinutes !== undefined) {
      update['profile.autoLockMinutes'] = autoLockMinutes;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.userId,
      update,
      { new: true, select: '-password' }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'Onboarding complete',
      user: toSafeUser(updatedUser)
    });
  } catch (error) {
    console.error('Complete onboarding error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { updateProfile, getProfile, completeOnboarding };
