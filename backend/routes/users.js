/**
 * User routes
 * GET  /api/users/:id          - public profile info
 * GET  /api/users/:id/posts    - public list of a user's posts
 * POST /api/users/:id/follow   - toggle follow (protected)
 * PUT  /api/users/profile      - update own profile (protected)
 */
const express = require('express');
const User = require('../models/User');
const Post = require('../models/Post');
const { protect, optionalAuth } = require('../middleware/auth');

const router = express.Router();

const isId = (v) => typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v);

/** True for absolute http(s) URLs (used for optional avatar images). */
const isHttpUrl = (v) => {
  try {
    const url = new URL(v);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

/** Shape a user document for public profile responses. */
function profilePayload(user, viewerId, postsCount) {
  return {
    _id: user._id,
    name: user.name,
    bio: user.bio,
    avatar: user.avatar,
    createdAt: user.createdAt,
    followers: user.followers,
    following: user.following,
    followersCount: user.followers.length,
    followingCount: user.following.length,
    postsCount: postsCount || 0,
    isSelf: viewerId ? String(user._id) === String(viewerId) : false,
    isFollowing: viewerId
      ? user.followers.some((f) => String(f) === String(viewerId))
      : false,
  };
}

// ---------------------------------------------------------------------------
// PUT /api/users/profile  (protected)  { name?, bio?, avatar? }
// Updates the authenticated user's own profile.
// Defined before "/:id" so "profile" is never treated as an id.
// ---------------------------------------------------------------------------
router.put('/profile', protect, async (req, res, next) => {
  try {
    const { name, bio, avatar } = req.body || {};
    const user = req.user;

    // --- validation (all fields optional, but must be valid when present) ---
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 60) {
        return res.status(400).json({ message: 'Name must be between 2 and 60 characters' });
      }
      user.name = name.trim();
    }

    if (bio !== undefined) {
      if (typeof bio !== 'string' || bio.length > 160) {
        return res.status(400).json({ message: 'Bio cannot exceed 160 characters' });
      }
      user.bio = bio.trim();
    }

    if (avatar !== undefined) {
      if (typeof avatar !== 'string' || avatar.length > 500) {
        return res.status(400).json({ message: 'Avatar must be a valid URL' });
      }
      if (avatar.trim() && !isHttpUrl(avatar.trim())) {
        return res.status(400).json({ message: 'Avatar must be a valid http(s) URL' });
      }
      user.avatar = avatar.trim();
    }

    await user.save();
    return res.json({
      message: 'Profile updated',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        bio: user.bio,
        avatar: user.avatar,
        followersCount: user.followers.length,
        followingCount: user.following.length,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/users/:id  (public) - profile info, with viewer-aware flags
// ---------------------------------------------------------------------------
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ message: 'Invalid user id' });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const postsCount = await Post.countDocuments({ author: id });
    const viewerId = req.user ? req.user._id : null;

    return res.json(profilePayload(user, viewerId, postsCount));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/users/:id/posts  (public) - the user's posts, newest first
// ---------------------------------------------------------------------------
router.get('/:id/posts', optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ message: 'Invalid user id' });

    const posts = await Post.find({ author: id })
      .sort({ createdAt: -1 })
      .populate('author', 'name avatar')
      .populate('comments.author', 'name avatar');

    const viewerId = req.user ? req.user._id : null;
    const data = posts.map((post) => {
      const obj = post.toObject();
      obj.likesCount = obj.likes.length;
      obj.commentsCount = obj.comments.length;
      obj.likedByMe = viewerId ? obj.likes.some((l) => String(l) === String(viewerId)) : false;
      obj.isAuthor = viewerId ? String(obj.author._id) === String(viewerId) : false;
      return obj;
    });

    return res.json(data);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/users/:id/follow  (protected) - toggle follow / unfollow
// Keeps both sides of the relationship in sync.
// ---------------------------------------------------------------------------
router.post('/:id/follow', protect, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ message: 'Invalid user id' });
    if (String(req.user._id) === id) {
      return res.status(400).json({ message: 'You cannot follow yourself' });
    }

    const target = await User.findById(id);
    if (!target) return res.status(404).json({ message: 'User not found' });

    const alreadyFollowing = req.user.following.some((u) => String(u) === id);

    if (alreadyFollowing) {
      // Unfollow: remove from both arrays
      req.user.following = req.user.following.filter((u) => String(u) !== id);
      target.followers = target.followers.filter((u) => String(u) !== String(req.user._id));
    } else {
      // Follow: add to both arrays (guard against duplicates)
      req.user.following.addToSet(target._id);
      target.followers.addToSet(req.user._id);
    }

    await req.user.save();
    await target.save();

    return res.json({
      following: !alreadyFollowing,
      followersCount: target.followers.length,
      followingCount: req.user.following.length,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
