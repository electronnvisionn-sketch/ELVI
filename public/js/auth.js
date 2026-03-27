/**
 * ELECTRON VISION - Global Auth System
 * Centralized authentication state management for all pages
 */

(function() {
  'use strict';

  const AUTH_API = '/api/auth/me';
  const LOGOUT_API = '/api/auth/logout';

  let authState = {
    isAuthenticated: false,
    user: null,
    loading: true
  };

  const listeners = [];

  function createEvent(type, detail) {
    return new CustomEvent(type, { detail, bubbles: true });
  }

  function generateAvatarGradient(email) {
    const hash = email.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    
    const gradients = [
      { gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', text: '#ffffff' },
      { gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', text: '#ffffff' },
      { gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', text: '#ffffff' },
      { gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', text: '#ffffff' },
      { gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', text: '#ffffff' },
      { gradient: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)', text: '#ffffff' },
      { gradient: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', text: '#ffffff' },
      { gradient: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)', text: '#333333' },
      { gradient: 'linear-gradient(135deg, #ff8a00 0%, #da1b60 100%)', text: '#ffffff' },
      { gradient: 'linear-gradient(135deg, #8360c3 0%, #2ebf91 100%)', text: '#ffffff' },
      { gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', text: '#ffffff' },
      { gradient: 'linear-gradient(135deg, #0f3460 0%, #e94560 100%)', text: '#ffffff' }
    ];
    
    const index = Math.abs(hash) % gradients.length;
    return gradients[index];
  }

  function notifyListeners() {
    const event = createEvent('auth:change', authState);
    document.dispatchEvent(event);
    listeners.forEach(fn => fn(authState));
  }

  async function fetchAuth() {
    try {
      const response = await fetch(AUTH_API, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        authState = {
          isAuthenticated: true,
          user: data.user || data,
          loading: false
        };
      } else {
        authState = {
          isAuthenticated: false,
          user: null,
          loading: false
        };
      }
    } catch (error) {
      console.error('[Auth] Fetch error:', error);
      authState = {
        isAuthenticated: false,
        user: null,
        loading: false
      };
    }

    notifyListeners();
    updateUIElements();
    return authState;
  }

  function updateUIElements() {
    const loginBtns = document.querySelectorAll('.login-btn, #loginBtn, .nav-login-btn');
    const registerBtns = document.querySelectorAll('.register-btn, #registerBtn, .nav-register-btn');
    const userMenus = document.querySelectorAll('.user-menu, #userMenu, .nav-user-menu');
    const guestElements = document.querySelectorAll('.guest-only, .guest-element');
    const authElements = document.querySelectorAll('.auth-only, .auth-element, .logged-in-only');
    const logoutBtns = document.querySelectorAll('.logout-btn, #logoutBtn, .nav-logout-btn');
    const dashboardBtns = document.querySelectorAll('.dashboard-btn, #dashboardBtn, .nav-dashboard-btn');

    if (authState.loading) {
      loginBtns.forEach(el => el.style.display = '');
      registerBtns.forEach(el => el.style.display = '');
      userMenus.forEach(el => el.style.display = '');
      return;
    }

    if (authState.isAuthenticated) {
      loginBtns.forEach(el => el && (el.style.display = 'none'));
      registerBtns.forEach(el => el && (el.style.display = 'none'));
      guestElements.forEach(el => el && (el.style.display = 'none'));
      authElements.forEach(el => el && (el.style.display = ''));

      logoutBtns.forEach(el => el && (el.style.display = 'inline-block'));
      dashboardBtns.forEach(el => el && (el.style.display = 'inline-block'));

      userMenus.forEach(el => {
        if (el) {
          el.style.display = '';
          const usernameEl = el.querySelector('.username, .user-name, .user-username');
          if (usernameEl && authState.user) {
            usernameEl.textContent = authState.user.username || authState.user.email || 'مستخدم';
          }
          const userInitialEl = el.querySelector('.user-initial, .user-avatar');
          if (userInitialEl && authState.user) {
            const email = authState.user.email || authState.user.username || '';
            const initial = email[0].toUpperCase();
            userInitialEl.textContent = initial;
            
            // Generate gradient based on email
            const colors = generateAvatarGradient(email);
            userInitialEl.style.background = colors.gradient;
            userInitialEl.style.color = colors.text;
          }
        }
      });

      const userNameDisplays = document.querySelectorAll('[data-user-name]');
      userNameDisplays.forEach(el => {
        if (authState.user) {
          el.textContent = authState.user.username || authState.user.email || '';
          el.style.display = '';
        } else {
          el.style.display = 'none';
        }
      });

      const logoutLinks = document.querySelectorAll('.logout-link, .nav-logout, [data-logout]');
      logoutLinks.forEach(el => {
        if (el.tagName === 'A') {
          el.href = '#';
          el.addEventListener('click', function(e) {
            e.preventDefault();
            logout();
          });
        }
      });

      const logoutButtons = document.querySelectorAll('.logout-btn, #logoutBtn, .nav-logout-btn');
      logoutButtons.forEach(el => {
        el.style.display = '';
        el.onclick = function(e) {
          e.preventDefault();
          logout();
        };
      });

    } else {
      loginBtns.forEach(el => el && (el.style.display = ''));
      registerBtns.forEach(el => el && (el.style.display = ''));
      userMenus.forEach(el => el && (el.style.display = 'none'));
      authElements.forEach(el => el && (el.style.display = 'none'));
      guestElements.forEach(el => el && (el.style.display = ''));
      
      // Hide logout buttons
      const logoutBtns = document.querySelectorAll('.logout-btn, #logoutBtn, .nav-logout-btn');
      logoutBtns.forEach(el => el && (el.style.display = 'none'));
      
      // Hide dashboard buttons
      const dashboardBtns = document.querySelectorAll('.dashboard-btn, #dashboardBtn, .nav-dashboard-btn');
      dashboardBtns.forEach(el => el && (el.style.display = 'none'));
    }
  }

  async function logout() {
    try {
      await fetch(LOGOUT_API, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });
    } catch (e) {
      console.error('[Auth] Logout error:', e);
    }

    authState = {
      isAuthenticated: false,
      user: null,
      loading: false
    };

    notifyListeners();
    updateUIElements();

    const currentPath = window.location.pathname;
    if (currentPath !== '/login' && currentPath !== '/') {
      window.location.href = '/login?redirect=' + encodeURIComponent(currentPath);
    } else if (currentPath === '/') {
      window.location.reload();
    }
  }

  function onAuthChange(callback) {
    listeners.push(callback);
    if (authState.loading === false) {
      callback(authState);
    }
  }

  function getAuthState() {
    return authState;
  }

  function requireAuth(callback, redirectTo = '/login') {
    if (authState.loading) {
      const checkAuth = () => {
        if (!authState.loading) {
          document.removeEventListener('auth:change', checkAuth);
          if (authState.isAuthenticated) {
            callback(authState);
          } else {
            window.location.href = redirectTo + '?redirect=' + encodeURIComponent(window.location.pathname);
          }
        }
      };
      document.addEventListener('auth:change', checkAuth);
    } else if (authState.isAuthenticated) {
      callback(authState);
    } else {
      window.location.href = redirectTo + '?redirect=' + encodeURIComponent(window.location.pathname);
    }
  }

  function requireAdmin(callback, redirectTo = '/login') {
    const allowedRoles = ['admin', 'manager', 'moderator'];
    requireAuth((state) => {
      if (state.user && allowedRoles.includes(state.user.role)) {
        callback(state);
      } else {
        window.location.href = redirectTo + '?error=admin_only';
      }
    }, redirectTo);
  }

  async function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => fetchAuth());
    } else {
      await fetchAuth();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.ElectronAuth = {
    getState: getAuthState,
    onChange: onAuthChange,
    requireAuth: requireAuth,
    requireAdmin: requireAdmin,
    logout: logout,
    refresh: fetchAuth
  };

})();
