const User = require('../models/User');

// @route   PUT /api/profile/update
// @desc    Update user profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const { username, dateOfBirth, location } = req.body;

    // Validate inputs
    if (!username || !dateOfBirth || !location) {
      return res.status(400).json({ error: 'Username, date of birth, and location are required' });
    }

    // Validate date of birth
    const birthDate = new Date(dateOfBirth);
    if (isNaN(birthDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date of birth' });
    }

    // Check if birthdate is not in the future
    if (birthDate > new Date()) {
      return res.status(400).json({ error: 'Date of birth cannot be in the future' });
    }

    // Update user profile
    const updatedUser = await User.findByIdAndUpdate(
      req.user.userId,
      {
        'profile.username': username.trim(),
        'profile.dateOfBirth': birthDate,
        'profile.location': location.trim(),
        'profile.isProfileComplete': true
      },
      { new: true, select: '-password' }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
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
    const user = await User.findById(req.user.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { updateProfile, getProfile };
