/**
 * Authentication middleware.
 * Verifies the JWT from the Authorization header and attaches
 * the corresponding user document to req.user.
 */
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Require a valid "Authorization: Bearer <token>" header.
 * Returns 401 for missing, malformed or expired tokens.
 */
const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authorized: no token provided' });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'Not authorized: user no longer exists' });
    }

    req.user = user;
    next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Session expired, please log in again'
        : 'Not authorized: invalid token';
    return res.status(401).json({ message });
  }
};

/**
 * Optional authentication: attaches req.user when a valid token is present
 * but does NOT block the request. Used by public endpoints that enrich
 * their response for logged-in visitors (e.g. "did I like this post?").
 */
const optionalAuth = async (req, _res, next) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return next();
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
  } catch {
    // Ignore invalid tokens on public endpoints
  }
  next();
};

module.exports = { protect, optionalAuth };
