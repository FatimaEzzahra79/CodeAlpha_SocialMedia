/**
 * post.js - single post page (post.html)
 * Shows one post with its comments and handles like / comment / delete actions.
 */
(function () {
  'use strict';

  const { api, getToken, getUser, avatarFor, escapeHtml, formatTimeAgo, formatDate } = window.API;
  const $ = (id) => document.getElementById(id);

  let post = null;
  const postId = new URLSearchParams(location.search).get('id');

  // -------------------------------------------------------------------------
  // Render the post itself
  // -------------------------------------------------------------------------
  function renderPost() {
    const root = $('postDetail');
    const author = typeof post.author === 'object' ? post.author : { _id: post.author, name: 'User' };
    const liked = post.likedByMe ? 'liked' : '';
    const deleteBtn = post.isAuthor
      ? `<button class="icon-btn" id="deletePostBtn" title="Delete post">${window.UI.icons.trash}</button>`
      : '';
    const image = post.image
      ? `<div class="post-image"><img src="${escapeHtml(post.image)}" alt="Post image"
           onerror="this.parentElement.style.display='none'"></div>`
      : '';

    root.innerHTML = `
      <article class="card post-detail" data-id="${post._id}">
        <header class="post-head">
          <a href="profile.html?id=${author._id}" class="avatar-link">
            <img class="avatar avatar-lg" src="${escapeHtml(avatarFor(author))}" alt="${escapeHtml(
      author.name || 'User'
    )}" onerror="this.src='https://ui-avatars.com/api/?background=7c3aed&color=fff&name=U'">
          </a>
          <div class="post-meta">
            <a class="post-author" href="profile.html?id=${author._id}">${escapeHtml(author.name || 'User')}</a>
            <span class="post-time">${formatTimeAgo(post.createdAt)}</span>
          </div>
          ${deleteBtn}
        </header>
        <p class="post-content post-content-lg">${escapeHtml(post.content)}</p>
        ${image}
        <footer class="post-actions">
          <button class="action-btn like-btn ${liked}" id="postLikeBtn">
            ${window.UI.icons.heart}<span class="like-count">${post.likesCount}</span>
          </button>
          <span class="action-btn static">
            ${window.UI.icons.comment}<span>${post.commentsCount}</span>
          </span>
        </footer>
      </article>`;

    // Like
    $('postLikeBtn').addEventListener('click', toggleLike);

    // Delete post
    const del = $('deletePostBtn');
    if (del) del.addEventListener('click', deletePost);
  }

  async function toggleLike() {
    if (!getToken()) return window.AuthUI.requireLogin(`post.html?id=${postId}`);
    const btn = $('postLikeBtn');
    btn.disabled = true;
    try {
      const result = await api.post(`/posts/${postId}/like`);
      post.likedByMe = result.liked;
      post.likesCount = result.likesCount;
      btn.classList.toggle('liked', result.liked);
      btn.querySelector('.like-count').textContent = result.likesCount;
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  async function deletePost() {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    try {
      await api.delete(`/posts/${postId}`);
      location.href = 'index.html';
    } catch (err) {
      alert(err.message);
    }
  }

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------
  function renderComments() {
    const list = $('commentsList');
    const section = $('commentsSection');
    const form = $('commentForm');
    const prompt = $('commentLoginPrompt');
    const countEl = $('commentsCount');

    section.classList.remove('hidden');
    countEl.textContent = post.commentsCount;

    // Logged-out visitors cannot comment
    const loggedIn = !!getToken();
    form.classList.toggle('hidden', !loggedIn);
    prompt.classList.toggle('hidden', loggedIn);

    if (!post.comments || post.comments.length === 0) {
      list.innerHTML = '<p class="muted empty-comments">No comments yet. Start the conversation.</p>';
      return;
    }

    const me = getUser();
    list.innerHTML = post.comments
      .map((c) => {
        const author = typeof c.author === 'object' ? c.author : { _id: c.author, name: 'User' };
        const mine = me && String(author._id) === String(me.id);
        return `
          <div class="comment" data-comment-id="${c._id}">
            <a href="profile.html?id=${author._id}" class="avatar-link">
              <img class="avatar avatar-sm" src="${escapeHtml(avatarFor(author))}" alt="${escapeHtml(
          author.name || 'User'
        )}" onerror="this.src='https://ui-avatars.com/api/?background=7c3aed&color=fff&name=U'">
            </a>
            <div class="comment-body">
              <div class="comment-top">
                <a class="comment-author" href="profile.html?id=${author._id}">${escapeHtml(
          author.name || 'User'
        )}</a>
                <span class="comment-time">${formatDate(c.createdAt)}</span>
                ${
                  mine
                    ? `<button class="link-danger" data-delete-comment="${c._id}">Delete</button>`
                    : ''
                }
              </div>
              <p class="comment-text">${escapeHtml(c.text)}</p>
            </div>
          </div>`;
      })
      .join('');
  }

  function bindCommentActions() {
    // Add a comment
    $('commentForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!getToken()) return window.AuthUI.requireLogin(`post.html?id=${postId}`);

      const input = $('commentText');
      const text = input.value.trim();
      if (!text) return;

      const btn = $('commentSubmit');
      btn.disabled = true;
      try {
        const result = await api.post(`/posts/${postId}/comment`, { text });
        post.comments.push(result.comment);
        post.commentsCount = result.commentsCount;
        input.value = '';
        renderComments();
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
      }
    });

    // Delete own comment
    $('commentsList').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-delete-comment]');
      if (!btn) return;
      if (!confirm('Delete this comment?')) return;
      const commentId = btn.dataset.deleteComment;
      try {
        const result = await api.delete(`/posts/${postId}/comment/${commentId}`);
        post.comments = post.comments.filter((c) => c._id !== commentId);
        post.commentsCount = result.commentsCount;
        renderComments();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', async () => {
    if (!postId) {
      $('postDetail').innerHTML =
        '<p class="form-error">No post specified. <a href="index.html">Back to feed</a></p>';
      return;
    }

    try {
      post = await api.get(`/posts/${postId}`);
      renderPost();
      renderComments();
      bindCommentActions();
    } catch (err) {
      $('postDetail').innerHTML = `<p class="form-error">${escapeHtml(err.message)} <a href="index.html">Back to feed</a></p>`;
    }
  });
})();
