/**
 * auth.js - shared across every page.
 * 1. Renders navbar state (logged in vs logged out).
 * 2. Provides guard helpers used by page scripts.
 * 3. Wires login / register forms and logout.
 */
(function () {
  'use strict';

  const { api, getToken, getUser, saveSession, clearSession, avatarFor, escapeHtml } = window.API;
  const $ = (id) => document.getElementById(id);

  // -------------------------------------------------------------------------
  // Navbar
  // -------------------------------------------------------------------------
  function renderNavbar() {
    const loggedIn = !!getToken();
    const user = getUser();
    const show = (el, visible) => el && el.classList.toggle('hidden', !visible);

    show($('navLogin'), !loggedIn);
    show($('navRegister'), !loggedIn);
    show($('navUserWrap'), loggedIn);

    if (loggedIn && user) {
      const avatar = $('navAvatar');
      const name = $('navUserName');
      if (avatar) {
        avatar.src = avatarFor(user);
        avatar.alt = user.name || 'User';
      }
      if (name) name.textContent = user.name || 'User';
    }
  }

  // -------------------------------------------------------------------------
  // Guard helpers
  // -------------------------------------------------------------------------
  /** True when a token exists. */
  const isLoggedIn = () => !!getToken();

  /** Redirect to login, optionally returning to the current page after login. */
  function requireLogin(returnTo) {
    if (isLoggedIn()) return true;
    const target = returnTo || location.pathname.split('/').pop() + location.search;
    location.href = `login.html?redirect=${encodeURIComponent(target)}`;
    return false;
  }

  // -------------------------------------------------------------------------
  // Logout + mobile nav
  // -------------------------------------------------------------------------
  function bindLogout() {
    const btn = $('navLogout');
    if (!btn) return;
    btn.addEventListener('click', () => {
      clearSession();
      location.href = 'index.html';
    });
  }

  function bindNavToggle() {
    const toggle = $('navToggle');
    const links = $('navLinks');
    if (toggle && links) toggle.addEventListener('click', () => links.classList.toggle('open'));
  }

  // -------------------------------------------------------------------------
  // Login form
  // -------------------------------------------------------------------------
  function bindLoginForm() {
    const form = $('loginForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = $('loginError');
      const btn = $('loginBtn');
      errorEl.classList.add('hidden');

      const email = $('email').value.trim();
      const password = $('password').value;
      if (!email || !password) return showError(errorEl, 'Please fill in both fields');

      btn.disabled = true;
      btn.textContent = 'Logging in...';
      try {
        const data = await api.post('/auth/login', { email, password }, false);
        saveSession(data.token, data.user);
        // Honour a ?redirect= target only when it points at one of our own pages
        const params = new URLSearchParams(location.search);
        const redirect = params.get('redirect');
        const safeRedirect =
          redirect && /^(index|post|profile)\.html(\?.*)?$/.test(redirect) ? redirect : 'index.html';
        location.href = safeRedirect;
      } catch (err) {
        showError(errorEl, err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Log In';
      }
    });
  }

  // -------------------------------------------------------------------------
  // Register form
  // -------------------------------------------------------------------------
  function bindRegisterForm() {
    const form = $('registerForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = $('registerError');
      const btn = $('registerBtn');
      errorEl.classList.add('hidden');

      const name = $('name').value.trim();
      const email = $('email').value.trim();
      const password = $('password').value;
      const confirm = $('confirmPassword').value;

      if (name.length < 2) return showError(errorEl, 'Name must be at least 2 characters');
      if (!/^\S+@\S+\.\S+$/.test(email)) return showError(errorEl, 'Please enter a valid email');
      if (password.length < 6) return showError(errorEl, 'Password must be at least 6 characters');
      if (password !== confirm) return showError(errorEl, 'Passwords do not match');

      btn.disabled = true;
      btn.textContent = 'Creating account...';
      try {
        const data = await api.post('/auth/register', { name, email, password }, false);
        saveSession(data.token, data.user);
        location.href = 'index.html';
      } catch (err) {
        showError(errorEl, err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create Account';
      }
    });
  }

  function showError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    bindNavToggle();
    bindLogout();
    bindLoginForm();
    bindRegisterForm();
    renderNavbar();
  });

  window.AuthUI = { renderNavbar, requireLogin, isLoggedIn, showError };
})();
