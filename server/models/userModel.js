const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters']
  },
  email: {
    type: String,
    unique: true,
    trim: true,
    lowercase: true,
    required: [true, 'Email is required'],
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    minlength: [6, 'Password must be at least 6 characters'],
    // Only required if not using Google auth
    required: function () {
      return !this.googleId;
    },
    select: false
  },
  refreshTokens: [{
    token: {
      type: String,
      required: true
    },
    device: {
      type: String,
      default: null
    },
    ip: {
      type: String,
      default: null
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  lastLoginAt: {
    type: Date,
    default: null
  },
  lastLoginProvider: {
    type: String,
    enum: ['email', 'google'],
    default: 'email'
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
    default: null,
    index: true
  },
  googleRefreshToken: {
    type: String,
    default: null,
    select: false
  },
  authProvider: {
    type: String,
    enum: ['email', 'google'],
    default: 'email'
  },
  authMethods: {
    type: [String],
    enum: ['email', 'google'],
    default: ['email']
  },
  preferences: {
    currency: {
      type: String,
      enum: ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'],
      default: 'INR'
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'light'
    },
    mfaEnabled: {
      type: Boolean,
      default: false
    }
  }
});

// Hash password before saving (only if password is set)
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method (robust for Google users)
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Update user preferences method
userSchema.methods.updatePreferences = async function (newPreferences) {
  try {
    // Only update provided preference fields
    if (newPreferences.currency !== undefined) {
      this.preferences.currency = newPreferences.currency;
    }
    if (newPreferences.theme !== undefined) {
      this.preferences.theme = newPreferences.theme;
    }
    if (newPreferences.mfaEnabled !== undefined) {
      this.preferences.mfaEnabled = newPreferences.mfaEnabled;
    }

    return await this.save();
  } catch (error) {
    throw error;
  }
};

// Remove sensitive fields from JSON output
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.refreshTokens;
  delete userObject.googleRefreshToken;
  delete userObject.__v;
  return userObject;
};
// Static method to upsert (find or create) a Google user
userSchema.statics.upsertGoogleUser = async function(googleProfile, tokens) {
  if (!googleProfile.email) throw new Error('Google profile missing email');
  const email = googleProfile.email.toLowerCase();

  // Prevent duplicate Google account linking
  const existingGoogleUser = await this.findOne({
    googleId: googleProfile.id,
    email: { $ne: email }
  });
  if (existingGoogleUser) {
    throw new Error('This Google account is already linked to another user');
  }

  let user = await this.findOne({ email });
  if (user) {
    // Use findByIdAndUpdate instead of save() for better performance
    // This avoids triggering pre-save hooks unnecessarily
    user = await this.findByIdAndUpdate(
      user._id,
      {
        $set: {
          googleId: googleProfile.id,
          googleRefreshToken: tokens.refresh_token || user.googleRefreshToken,
          authProvider: 'google',
          lastLoginProvider: 'google',
          lastLoginAt: new Date()
        },
        $addToSet: { authMethods: 'google' }
      },
      { new: true }
    );
    return user;
  } else {
    // Generate a unique username if needed
    let baseUsername = googleProfile.name?.replace(/\s+/g, '').toLowerCase() || email.split('@')[0];
    let username = baseUsername;
    let count = 0;
    while (await this.exists({ username })) {
      count++;
      username = `${baseUsername}${count}`;
    }
    user = await this.create({
      username,
      email,
      googleId: googleProfile.id,
      googleRefreshToken: tokens.refresh_token,
      authMethods: ['google'],
      isActive: true,
      authProvider: 'google',
      lastLoginProvider: 'google',
      lastLoginAt: new Date()
    });
    return user;
  }
};

// Static method to find user by email or username
userSchema.statics.findByEmailOrUsername = function(identifier) {
  return this.findOne({
    $or: [
      { email: identifier },
      { username: identifier }
    ]
  });
};

module.exports = mongoose.model('User', userSchema);