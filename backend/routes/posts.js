/**
 * Post routes
 * GET    /api/posts/feed                    - public feed, newest first
 * POST   /api/posts                         - create a post (protected)
 * GET    /api/posts/:id                     - single post + comments (public)
 * DELETE /api/posts/:id                     - delete own post (protected)
 * POST   /api/posts/:id/like                - toggle like (protected)
 * POST   /api/posts/:id/comment             - add comment (protected)
 * DELETE /api/posts/:id/comment/:commentId  - delete own comment (protected)
 */
const express = require('express');
const Post = require('../models/Post');
const { protect, optionalAuth } = require('../middleware/auth');

const router = express.Router();

const isId = (v) => typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v);

/** True for absolute http(s) URLs (used for optional post images). */
const isHttpUrl = (v) => {
  try {
    const url = new URL(v);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

/** Populate author + comment authors on a query. */
const withPeople = (query) =>
  query.populate('author', 'name avatar').populate('comments.author', 'name avatar');

/**
 * Convert a post document into a plain object enriched with counts and
 * viewer-specific flags used by the frontend.
 */
function decorate(post, viewerId) {
  const obj = post.toObject();
  obj.likesCount = obj.likes.length;
  obj.commentsCount = obj.comments.length;
  obj.likedByMe = viewerId ? obj.likes.some((l) => String(l) === String(viewerId)) : false;
  obj.isAuthor = viewerId ? String(obj.author._id) === String(viewerId) : false;
  return obj;
}

// ---------------------------------------------------------------------------
// GET /api/posts/feed  (public)
// Returns every post, newest first. Defined before "/:id" so "feed"
// is never interpreted as a post id.
// ---------------------------------------------------------------------------
router.get('/feed', optionalAuth, async (req, res, next) => {
  try {
    const posts = await withPeople(Post.find().sort({ createdAt: -1 }));
    const viewerId = req.user ? req.user._id : null;
    res.json(posts.map((p) => decorate(p, viewerId)));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/posts  (protected)  { content, image? }
// ---------------------------------------------------------------------------
router.post('/', protect, async (req, res, next) => {
  try {
    const { content, image } = req.body || {};

    // --- validation ---
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ message: 'Post content is required' });
    }
    if (content.trim().length > 500) {
      return res.status(400).json({ message: 'Post cannot exceed 500 characters' });
    }
    if (image !== undefined && image !== null && typeof image !== 'string') {
      return res.status(400).json({ message: 'Image must be a URL string' });
    }
    if (typeof image === 'string' && image.trim() && !isHttpUrl(image.trim())) {
      return res.status(400).json({ message: 'Image must be a valid http(s) URL' });
    }

    let post = await Post.create({
      author: req.user._id,
      content: content.trim(),
      image: image ? image.trim() : '',
    });

    post = await withPeople(Post.findById(post._id));
    return res.status(201).json(decorate(post, req.user._id));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/posts/:id  (public) - full post with comments
// ---------------------------------------------------------------------------
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ message: 'Invalid post id' });

    const post = await withPeople(Post.findById(id));
    if (!post) return res.status(404).json({ message: 'Post not found' });

    return res.json(decorate(post, req.user ? req.user._id : null));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/posts/:id  (protected, only author)
// ---------------------------------------------------------------------------
router.delete('/:id', protect, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ message: 'Invalid post id' });

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (String(post.author) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only delete your own posts' });
    }

    await post.deleteOne();
    return res.json({ message: 'Post deleted' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/posts/:id/like  (protected) - toggle like
// ---------------------------------------------------------------------------
router.post('/:id/like', protect, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ message: 'Invalid post id' });

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const userId = String(req.user._id);
    const liked = post.likes.some((l) => String(l) === userId);

    if (liked) {
      post.likes = post.likes.filter((l) => String(l) !== userId);
    } else {
      post.likes.addToSet(req.user._id);
    }

    await post.save();
    return res.json({ liked: !liked, likesCount: post.likes.length });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/posts/:id/comment  (protected)  { text }
// ---------------------------------------------------------------------------
router.post('/:id/comment', protect, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { text } = req.body || {};
    if (!isId(id)) return res.status(400).json({ message: 'Invalid post id' });

    // --- validation ---
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ message: 'Comment text is required' });
    }
    if (text.trim().length > 300) {
      return res.status(400).json({ message: 'Comment cannot exceed 300 characters' });
    }

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    post.comments.push({ author: req.user._id, text: text.trim() });
    await post.save();

    // Reload with populated authors and return the newly added comment
    const populated = await withPeople(Post.findById(id));
    const created = populated.comments[populated.comments.length - 1];

    return res.status(201).json({
      comment: created,
      commentsCount: populated.comments.length,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/posts/:id/comment/:commentId  (protected, only comment author)
// ---------------------------------------------------------------------------
router.delete('/:id/comment/:commentId', protect, async (req, res, next) => {
  try {
    const { id, commentId } = req.params;
    if (!isId(id) || !isId(commentId)) {
      return res.status(400).json({ message: 'Invalid post or comment id' });
    }

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });
    if (String(comment.author) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only delete your own comments' });
    }

    comment.deleteOne();
    await post.save();

    return res.json({ message: 'Comment deleted', commentsCount: post.comments.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
