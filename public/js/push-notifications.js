/**
 * ELECTRON VISION - Push Notification Client
 * Handles push notification subscription and management
 */

const PushNotificationClient = (function() {
  let VAPID_PUBLIC_KEY = '';
  let _isSubscribed = false;
  let _subscription = null;
  let _swRegistration = null;

  // Fetch VAPID public key from server
  async function _fetchVapidKey() {
    try {
      const response = await fetch('/api/vapid-public-key');
      if (response.ok) {
        const data = await response.json();
        VAPID_PUBLIC_KEY = data.publicKey;
        return true;
      }
    } catch (e) {
      console.log('[Push] Using default VAPID key');
    }
    // Fallback to default key
    VAPID_PUBLIC_KEY = 'BB7bJPJHg7aU6PdTLzjoH-Mu6kJixovKPR3Z8pUZNRgXjRo8RhjbuB16HiNcIbhw75QjI9eN_9_mRMnVF4HPeV8';
    return true;
  }

  // Get Service Worker registration
  async function _getSWRegistration() {
    if (_swRegistration) {
      return _swRegistration;
    }
    
    if ('serviceWorker' in navigator) {
      _swRegistration = await navigator.serviceWorker.ready;
      return _swRegistration;
    }
    
    return null;
  }

  // Convert VAPID key to Uint8Array
  function _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    
    return outputArray;
  }

  // Check if push is supported
  function isSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window;
  }

  // Check notification permission
  function getPermissionStatus() {
    if (!('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  }

  // Request notification permission
  async function requestPermission() {
    if (!isSupported()) {
      console.log('[Push] Push notifications not supported');
      return { success: false, error: 'not_supported' };
    }

    try {
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        console.log('[Push] Notification permission granted');
        return { success: true, permission: 'granted' };
      } else if (permission === 'denied') {
        console.log('[Push] Notification permission denied');
        return { success: false, error: 'denied' };
      } else {
        console.log('[Push] Notification permission dismissed');
        return { success: false, error: 'dismissed' };
      }
    } catch (error) {
      console.error('[Push] Error requesting permission:', error);
      return { success: false, error: error.message };
    }
  }

  // Subscribe to push notifications
  async function subscribe() {
    if (!isSupported()) {
      console.log('[Push] Push not supported');
      return null;
    }

    try {
      const sw = await _getSWRegistration();
      if (!sw) {
        console.log('[Push] Service Worker not ready');
        return null;
      }

      // Check if already subscribed
      const existingSubscription = await sw.pushManager.getSubscription();
      if (existingSubscription) {
        console.log('[Push] Already subscribed');
        _isSubscribed = true;
        _subscription = existingSubscription;
        return existingSubscription;
      }

      // Subscribe
      const subscription = await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      console.log('[Push] Subscribed successfully');
      _isSubscribed = true;
      _subscription = subscription;

      // Send subscription to server
      await _saveSubscription(subscription);

      return subscription;
    } catch (error) {
      console.error('[Push] Subscription error:', error);
      return null;
    }
  }

  // Unsubscribe from push notifications
  async function unsubscribe() {
    try {
      const sw = await _getSWRegistration();
      if (!sw) return false;

      const subscription = await sw.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        console.log('[Push] Unsubscribed successfully');
      }

      _isSubscribed = false;
      _subscription = null;

      // Notify server
      await _removeSubscription();

      return true;
    } catch (error) {
      console.error('[Push] Unsubscribe error:', error);
      return false;
    }
  }

  // Save subscription to server
  async function _saveSubscription(subscription) {
    try {
      const token = _getTokenFromCookie();
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(subscription)
      });

      if (response.ok) {
        console.log('[Push] Subscription saved to server');
        return true;
      } else {
        console.error('[Push] Failed to save subscription:', response.status);
        return false;
      }
    } catch (error) {
      console.error('[Push] Error saving subscription:', error);
      return false;
    }
  }

  // Remove subscription from server
  async function _removeSubscription() {
    try {
      const token = _getTokenFromCookie();
      await fetch('/api/notifications/unsubscribe', {
        method: 'DELETE',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
    } catch (error) {
      console.error('[Push] Error removing subscription:', error);
    }
  }

  // Get token from cookie
  function _getTokenFromCookie() {
    const name = 'client_token=';
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') {
        c = c.substring(1);
      }
      if (c.indexOf(name) === 0) {
        return c.substring(name.length, c.length);
      }
    }
    return null;
  }

  // Show local notification
  function showNotification(title, options = {}) {
    if (Notification.permission === 'granted') {
      const defaultOptions = {
        icon: '/icon-192.png',
        badge: '/badge.png',
        dir: 'rtl',
        lang: 'ar',
        tag: 'electron-vision',
        ...options
      };
      
      new Notification(title, defaultOptions);
    }
  }

  // Check subscription status
  async function getSubscriptionStatus() {
    try {
      const sw = await _getSWRegistration();
      if (!sw) return { subscribed: false, reason: 'no_sw' };

      const subscription = await sw.pushManager.getSubscription();
      return {
        subscribed: !!subscription,
        permission: Notification.permission
      };
    } catch (error) {
      console.error('[Push] Error checking status:', error);
      return { subscribed: false, error: error.message };
    }
  }

  // Initialize push notifications
  async function init() {
    if (!isSupported()) {
      console.log('[Push] Push notifications not supported in this browser');
      return false;
    }

    // Register Service Worker
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('[Push] Service Worker registered:', registration.scope);
        _swRegistration = registration;
      } catch (error) {
        console.error('[Push] Service Worker registration failed:', error);
      }
    }

    // Check existing subscription
    const status = await getSubscriptionStatus();
    return status.subscribed;
  }

  // Test notification
  async function testNotification() {
    const perm = await requestPermission();
    if (!perm.success) {
      console.log('[Push] Cannot test - permission not granted');
      return false;
    }

    showNotification('ELECTRON VISION', {
      body: 'تم تفعيل الإشعارات بنجاح! 🎉',
      vibrate: [100, 50, 100]
    });

    return true;
  }

  // Public API
  return {
    init,
    isSupported,
    getPermissionStatus,
    requestPermission,
    subscribe,
    unsubscribe,
    showNotification,
    getSubscriptionStatus,
    testNotification,
    get isSubscribed() {
      return _isSubscribed;
    }
  };
})();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    PushNotificationClient.init();
    autoSubscribePush();
  });
} else {
  PushNotificationClient.init();
  autoSubscribePush();
}

// Auto-subscribe to push notifications when user is authenticated
async function autoSubscribePush() {
  // Wait a bit for auth to initialize
  setTimeout(async () => {
    try {
      // Check if user is authenticated
      const cookies = document.cookie.split(';');
      let hasToken = false;
      for (let cookie of cookies) {
        if (cookie.trim().startsWith('client_token=')) {
          hasToken = true;
          break;
        }
      }
      
      if (!hasToken && !(window.ElectronAuth && window.ElectronAuth.isAuthenticated())) {
        console.log('[Push] User not authenticated, skipping auto-subscribe');
        return;
      }

      if (!PushNotificationClient.isSupported()) {
        console.log('[Push] Not supported');
        return;
      }

      const permission = Notification.permission;
      if (permission === 'denied') {
        console.log('[Push] Permission denied');
        return;
      }

      if (permission === 'granted') {
        // Already granted, subscribe automatically
        await PushNotificationClient.subscribe();
        console.log('[Push] Auto-subscribed successfully');
      }
      // Don't auto-request if 'default' - let the user decide via the popup
    } catch (e) {
      console.log('[Push] Auto-subscribe error:', e.message);
    }
  }, 2000);
}

// Export to global
window.PushNotification = PushNotificationClient;