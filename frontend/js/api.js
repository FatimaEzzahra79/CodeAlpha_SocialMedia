/**
 * api.js - shared HTTP client + UI helpers for every page.
 * Wraps fetch() with the JWT header, JSON handling and central errors.
 */
(function () {
  'use strict';

  // Backend base URL - change here if the API runs elsewhere
  const API_BASE = 'http://localhost:5001/api';

  // -------------------------------------------------------------------------
  // Session helpers
  // -------------------------------------------------------------------------
  function getToken() {
    return localStorage.getItem('token');
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }

  function saveSession(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  // -------------------------------------------------------------------------
  // Core request
  // -------------------------------------------------------------------------
  /**
   * @param {string} endpoint - path after /api, e.g. "/posts/feed"
   * @param {object} options  - { method, body, auth }
   * @returns {Promise<any>} parsed JSON
   */
  async function request(endpoint, options = {}) {
    const { method = 'GET', body, auth = true } = options;

    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    let res;
    try {
      res = await fetch(`${API_BASE}${endpoint}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error('Cannot reach the server. Is the backend running on port 5001?');
    }

    let data = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }

    if (!res.ok) {
      if (res.status === 401 && auth) {
        clearSession();
        if (!location.pathname.endsWith('login.html')) {
          location.href = 'login.html';
          throw new Error('Session expired, please log in again');
        }
      }
      const err = new Error((data && data.message) || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }

    return data;
  }

  const api = {
    get: (endpoint, auth = true) => request(endpoint, { method: 'GET', auth }),
    post: (endpoint, body, auth = true) => request(endpoint, { method: 'POST', body, auth }),
    put: (endpoint, body, auth = true) => request(endpoint, { method: 'PUT', body, auth }),
    delete: (endpoint, auth = true) => request(endpoint, { method: 'DELETE', auth }),
  };

  // -------------------------------------------------------------------------
  // Formatting helpers
  // -------------------------------------------------------------------------
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Short relative time such as "just now", "5m", "3h", "2d". */
  function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /** Full date/time, used on comments. */
  function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /** Avatar URL with a generated fallback based on the user's name. */
  function avatarFor(user) {
    if (!user) return 'https://ui-avatars.com/api/?background=7c3aed&color=fff&name=User';
    if (user.avatar) return user.avatar;
    return `https://ui-avatars.com/api/?background=7c3aed&color=fff&name=${encodeURIComponent(
      user.name || 'User'
    )}`;
  }

  // -------------------------------------------------------------------------
  // Inline SVG icons (kept here so every page renders them consistently)
  // -------------------------------------------------------------------------
  const ICON_HEART =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.7-9.5-9.1A5.3 5.3 0 0 1 12 6a5.3 5.3 0 0 1 9.5 5.9C19.5 16.3 12 21 12 21z"/></svg>';
  const ICON_COMMENT =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.9 8.9 0 0 1-4-.9L3 21l1.9-5.5a8.4 8.4 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/></svg>';
  const ICON_TRASH =
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';

  /**
   * Build the HTML for one post card.
   * Expects post.author to be populated ({_id, name, avatar}).
   */
  function postCardHTML(post) {
    const author = typeof post.author === 'object' ? post.author : { _id: post.author, name: 'User' };
    const authorId = author._id;
    const liked = post.likedByMe ? 'liked' : '';
    const deleteBtn = post.isAuthor
      ? `<button class="icon-btn" data-action="delete-post" data-id="${post._id}" title="Delete post">${ICON_TRASH}</button>`
      : '';

    const image = post.image
      ? `<a class="post-image" href="post.html?id=${post._id}"><img src="${escapeHtml(
          post.image
        )}" alt="Post image" loading="lazy" onerror="this.parentElement.style.display='none'"></a>`
      : '';

    return `
      <article class="card post-card" data-id="${post._id}">
        <header class="post-head">
          <a href="profile.html?id=${authorId}" class="avatar-link">
            <img class="avatar" src="${escapeHtml(avatarFor(author))}" alt="${escapeHtml(
      author.name || 'User'
    )}" onerror="this.src='https://ui-avatars.com/api/?background=7c3aed&color=fff&name=U'">
          </a>
          <div class="post-meta">
            <a class="post-author" href="profile.html?id=${authorId}">${escapeHtml(author.name || 'User')}</a>
            <span class="post-time">${formatTimeAgo(post.createdAt)}</span>
          </div>
          ${deleteBtn}
        </header>
        <p class="post-content">${escapeHtml(post.content)}</p>
        ${image}
        <footer class="post-actions">
          <button class="action-btn like-btn ${liked}" data-action="like" data-id="${post._id}">
            ${ICON_HEART}<span class="like-count">${post.likesCount || 0}</span>
          </button>
          <a class="action-btn" href="post.html?id=${post._id}">
            ${ICON_COMMENT}<span>${post.commentsCount || 0}</span>
          </a>
        </footer>
      </article>`;
  }

  window.API = {
    api,
    getToken,
    getUser,
    saveSession,
    clearSession,
    escapeHtml,
    formatTimeAgo,
    formatDate,
    avatarFor,
  };
  window.UI = { postCardHTML, icons: { heart: ICON_HEART, comment: ICON_COMMENT, trash: ICON_TRASH } };
})();
