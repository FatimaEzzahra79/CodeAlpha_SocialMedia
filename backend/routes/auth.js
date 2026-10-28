/**
 * Auth routes
 * POST /api/auth/register - create an account
 * POST /api/auth/login    - exchange credentials for a JWT
 * GET  /api/auth/me       - current user profile (protected)
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

/** Sign a JWT carrying the user id (expiry from JWT_EXPIRES). */
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '7d' });

/** Shape the user object returned by login / register / me. */
const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  bio: user.bio,
  avatar: user.avatar,
  followersCount: user.followers ? user.followers.length : 0,
  followingCount: user.following ? user.following.length : 0,
  createdAt: user.createdAt,
});

// ---------------------------------------------------------------------------
// POST /api/auth/register  { name, email, password }
// ---------------------------------------------------------------------------
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};

    // --- input validation ---
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ message: 'Name must be at least 2 characters' });
    }
    if (name.trim().length > 60) {
      return res.status(400).json({ message: 'Name cannot exceed 60 characters' });
    }
    if (!email || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      return res.status(400).json({ message: 'A valid email is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    // Give new users a friendly default avatar based on their name
    const avatar = `https://ui-avatars.com/api/?background=7c3aed&color=fff&name=${encodeURIComponent(
      name.trim()
    )}`;

    const user = await User.create({ name: name.trim(), email: normalizedEmail, password, avatar });

    return res.status(201).json({ token: signToken(user._id), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login  { email, password }
// ---------------------------------------------------------------------------
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // password has select:false, so explicitly include it for comparison
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    return res.json({ token: signToken(user._id), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/me  (protected)
// ---------------------------------------------------------------------------
router.get('/me', protect, (req, res) => {
  res.json(publicUser(req.user));
});

module.exports = router;
