/**
 * feed.js - feed page (index.html)
 * Loads all posts, handles the composer, likes and post deletion.
 */
(function () {
  'use strict';

  const { api, getToken, getUser, avatarFor, escapeHtml } = window.API;
  const { postCardHTML } = window.UI;
  const $ = (id) => document.getElementById(id);

  let posts = [];

  // -------------------------------------------------------------------------
  // Composer visibility
  // -------------------------------------------------------------------------
  function initComposer() {
    const composer = $('composerForm');
    const prompt = $('loginPrompt');
    const loggedIn = !!getToken();

    if (!loggedIn) {
      composer.classList.add('hidden');
      prompt.classList.remove('hidden');
      return;
    }

    // Show the logged-in user's avatar inside the composer
    const avatar = $('composerAvatar');
    const user = getUser();
    if (avatar && user) {
      avatar.src = avatarFor(user);
      avatar.alt = user.name || 'User';
    }

    const content = $('postContent');
    const charCount = $('charCount');
    content.addEventListener('input', () => {
      charCount.textContent = `${content.value.length}/500`;
    });

    composer.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = $('composerError');
      const btn = $('postBtn');
      errorEl.classList.add('hidden');

      const text = content.value.trim();
      const image = $('postImage').value.trim();

      if (!getToken()) return window.AuthUI.requireLogin('index.html');
      if (!text) return showComposerError('Write something before posting');
      if (text.length > 500) return showComposerError('Post cannot exceed 500 characters');

      btn.disabled = true;
      btn.textContent = 'Posting...';
      try {
        const post = await api.post('/posts', { content: text, image });
        posts.unshift(post);
        renderFeed();
        content.value = '';
        $('postImage').value = '';
        charCount.textContent = '0/500';
      } catch (err) {
        showComposerError(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Post';
      }
    });
  }

  function showComposerError(message) {
    const el = $('composerError');
    el.textContent = message;
    el.classList.remove('hidden');
  }

  // -------------------------------------------------------------------------
  // Feed rendering
  // -------------------------------------------------------------------------
  function renderFeed() {
    const container = $('feedPosts');
    if (posts.length === 0) {
      container.innerHTML = `
        <div class="card empty-state">
          <p>No posts yet. Be the first to share something!</p>
        </div>`;
      return;
    }
    container.innerHTML = posts.map(postCardHTML).join('');
  }

  async function loadFeed() {
    const container = $('feedPosts');
    try {
      posts = await api.get('/posts/feed');
      renderFeed();
    } catch (err) {
      container.innerHTML = `<p class="form-error">${escapeHtml(err.message)}</p>`;
    }
  }

  // -------------------------------------------------------------------------
  // Likes + deletes (event delegation so it works for dynamically added posts)
  // -------------------------------------------------------------------------
  function bindFeedActions() {
    $('feedPosts').addEventListener('click', async (e) => {
      const likeBtn = e.target.closest('[data-action="like"]');
      const deleteBtn = e.target.closest('[data-action="delete-post"]');

      // --- like toggle ---
      if (likeBtn) {
        if (!getToken()) return window.AuthUI.requireLogin('index.html');
        const id = likeBtn.dataset.id;
        likeBtn.disabled = true;
        try {
          const result = await api.post(`/posts/${id}/like`);
          const post = posts.find((p) => p._id === id);
          if (post) {
            post.likedByMe = result.liked;
            post.likesCount = result.likesCount;
          }
          likeBtn.classList.toggle('liked', result.liked);
          likeBtn.querySelector('.like-count').textContent = result.likesCount;
        } catch (err) {
          alert(err.message);
        } finally {
          likeBtn.disabled = false;
        }
      }

      // --- delete own post ---
      if (deleteBtn) {
        if (!confirm('Delete this post? This cannot be undone.')) return;
        const id = deleteBtn.dataset.id;
        try {
          await api.delete(`/posts/${id}`);
          posts = posts.filter((p) => p._id !== id);
          renderFeed();
        } catch (err) {
          alert(err.message);
        }
      }
    });
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    initComposer();
    bindFeedActions();
    loadFeed();
  });
})();
