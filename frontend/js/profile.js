/**
 * profile.js - profile page (profile.html)
 * Loads a user's info + posts, handles follow/unfollow and profile editing.
 */
(function () {
  'use strict';

  const { api, getToken, getUser, saveSession, avatarFor, escapeHtml, formatDate } = window.API;
  const { postCardHTML } = window.UI;
  const $ = (id) => document.getElementById(id);

  let profile = null;
  let posts = [];
  let profileId = new URLSearchParams(location.search).get('id');

  // -------------------------------------------------------------------------
  // Profile header
  // -------------------------------------------------------------------------
  function renderHeader() {
    const root = $('profileHeader');
    const me = getUser();
    const joined = profile.createdAt
      ? new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : '';

    // Own profile -> Edit button. Someone else -> Follow/Unfollow button.
    let actionBtn = '';
    if (profile.isSelf) {
      actionBtn = '<button class="btn btn-outline" id="editProfileBtn">Edit Profile</button>';
    } else {
      const following = profile.isFollowing;
      actionBtn = `<button class="btn ${following ? 'btn-outline' : ''}" id="followBtn">${
        following ? 'Unfollow' : 'Follow'
      }</button>`;
    }

    root.innerHTML = `
      <div class="profile-top">
        <img class="avatar avatar-xl" src="${escapeHtml(avatarFor(profile))}" alt="${escapeHtml(
      profile.name
    )}" onerror="this.src='https://ui-avatars.com/api/?background=7c3aed&color=fff&name=U'">
        <div class="profile-info">
          <h1>${escapeHtml(profile.name)}</h1>
          ${profile.bio ? `<p class="profile-bio">${escapeHtml(profile.bio)}</p>` : '<p class="profile-bio muted">No bio yet.</p>'}
          <div class="profile-stats">
            <span><strong>${profile.postsCount}</strong> posts</span>
            <span><strong id="followersCount">${profile.followersCount}</strong> followers</span>
            <span><strong>${profile.followingCount}</strong> following</span>
          </div>
          ${joined ? `<p class="profile-joined muted">Joined ${joined}</p>` : ''}
          <div class="profile-actions">${actionBtn}</div>
        </div>
      </div>`;

    // Bind follow / edit buttons after rendering
    const followBtn = $('followBtn');
    if (followBtn) followBtn.addEventListener('click', toggleFollow);

    const editBtn = $('editProfileBtn');
    if (editBtn) editBtn.addEventListener('click', openEditModal);
  }

  async function toggleFollow() {
    if (!getToken()) return window.AuthUI.requireLogin(`profile.html?id=${profileId}`);

    const btn = $('followBtn');
    btn.disabled = true;
    try {
      const result = await api.post(`/users/${profileId}/follow`);
      profile.isFollowing = result.following;
      profile.followersCount = result.followersCount;
      renderHeader();
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
    }
  }

  // -------------------------------------------------------------------------
  // Posts grid
  // -------------------------------------------------------------------------
  function renderPosts() {
    const root = $('profilePosts');
    if (posts.length === 0) {
      root.innerHTML = '<div class="card empty-state"><p>No posts yet.</p></div>';
      return;
    }
    root.innerHTML = posts.map(postCardHTML).join('');
  }

  async function loadPosts() {
    try {
      posts = await api.get(`/users/${profileId}/posts`);
      renderPosts();
    } catch (err) {
      $('profilePosts').innerHTML = `<p class="form-error">${escapeHtml(err.message)}</p>`;
    }
  }

  function bindPostActions() {
    $('profilePosts').addEventListener('click', async (e) => {
      const likeBtn = e.target.closest('[data-action="like"]');
      const deleteBtn = e.target.closest('[data-action="delete-post"]');

      if (likeBtn) {
        if (!getToken()) return window.AuthUI.requireLogin(`profile.html?id=${profileId}`);
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

      if (deleteBtn) {
        if (!confirm('Delete this post? This cannot be undone.')) return;
        const id = deleteBtn.dataset.id;
        try {
          await api.delete(`/posts/${id}`);
          posts = posts.filter((p) => p._id !== id);
          profile.postsCount = Math.max(0, profile.postsCount - 1);
          renderHeader();
          renderPosts();
        } catch (err) {
          alert(err.message);
        }
      }
    });
  }

  // -------------------------------------------------------------------------
  // Edit profile modal
  // -------------------------------------------------------------------------
  function openEditModal() {
    const modal = $('editModal');
    $('editName').value = profile.name || '';
    $('editBio').value = profile.bio || '';
    $('editAvatar').value = profile.avatar || '';
    $('editError').classList.add('hidden');
    modal.classList.remove('hidden');
  }

  function bindEditModal() {
    const modal = $('editModal');
    const close = () => modal.classList.add('hidden');

    $('editClose').addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    $('editForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = $('editError');
      errorEl.classList.add('hidden');

      const name = $('editName').value.trim();
      const bio = $('editBio').value.trim();
      const avatar = $('editAvatar').value.trim();

      if (name.length < 2) {
        errorEl.textContent = 'Name must be at least 2 characters';
        errorEl.classList.remove('hidden');
        return;
      }
      if (bio.length > 160) {
        errorEl.textContent = 'Bio cannot exceed 160 characters';
        errorEl.classList.remove('hidden');
        return;
      }

      const btn = $('editSaveBtn');
      btn.disabled = true;
      btn.textContent = 'Saving...';
      try {
        const result = await api.put('/users/profile', { name, bio, avatar });
        // Update local profile + cached session so the navbar reflects changes
        profile.name = result.user.name;
        profile.bio = result.user.bio;
        profile.avatar = result.user.avatar;

        const sessionUser = getUser() || {};
        Object.assign(sessionUser, {
          name: result.user.name,
          bio: result.user.bio,
          avatar: result.user.avatar,
        });
        saveSession(getToken(), sessionUser);

        close();
        renderHeader();
        if (window.AuthUI) window.AuthUI.renderNavbar();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save Changes';
      }
    });
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', async () => {
    // No ?id= -> own profile. If logged out, there is nothing to show.
    if (!profileId) {
      const me = getUser();
      if (!me) return window.AuthUI.requireLogin('profile.html');
      profileId = me.id;
    }

    bindEditModal();
    bindPostActions();

    try {
      profile = await api.get(`/users/${profileId}`);
      renderHeader();
      await loadPosts();
    } catch (err) {
      $('profileHeader').innerHTML = `<p class="form-error">${escapeHtml(err.message)}</p>`;
      $('profilePosts').innerHTML = '';
    }
  });
})();
