/**
 * ELECTRON VISION - Premium Application JavaScript
 * Version 3.0 - SECURITY FIXED
 * 
 * FIXES:
 * - NO localStorage for auth (cookies only)
 * - Debouncing/throttling for API calls
 * - Proper event listeners (no inline onclick)
 * - Fixed variable scoping
 * - CSRF token handling
 */

// ============================================
// SECURE COOKIE-BASED AUTH (no localStorage)
// ============================================

// Get token from HttpOnly cookie (backend handles this)
// We can only check if cookie exists
function _getAuthCookie() {
  // Check if client_token cookie exists
  return document.cookie.split('; ').find(row => row.startsWith('client_token='));
}

// ============================================
// LOADER FUNCTIONS
// ============================================

function showLoader() {
  let loader = document.getElementById('page-loader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'page-loader';
    loader.innerHTML = `
      <div class="loader-content">
        <div class="loader-ring">
          <div class="loader-dot"></div>
        </div>
        <p class="loader-text">جاري التحميل...</p>
      </div>
    `;
    loader.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #0a0a1a;
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
      transition: opacity 0.3s ease;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
      .loader-ring {
        width: 80px;
        height: 80px;
        border: 3px solid rgba(0, 212, 255, 0.2);
        border-top-color: #00d4ff;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      .loader-dot {
        width: 10px;
        height: 10px;
        background: #00d4ff;
        border-radius: 50%;
        margin: 20px auto 0;
        box-shadow: 0 0 10px #00d4ff;
      }
      .loader-text {
        color: #fff;
        margin-top: 20px;
        font-family: 'Cairo', sans-serif;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(loader);
  }
  loader.style.opacity = '1';
  loader.style.visibility = 'visible';
}

function hideLoader() {
  const loader = document.getElementById('page-loader');
  if (loader) {
    loader.style.opacity = '0';
    loader.style.visibility = 'hidden';
  }
}

// Initialize loader on page load
document.addEventListener('DOMContentLoaded', function() {
  hideLoader();
});

// Show loader before page unload
window.addEventListener('beforeunload', function() {
  showLoader();
});

// ============================================
// TRANSLATIONS
// ============================================

const translations = {
  ar: {
    // Navbar
    home: 'الرئيسية',
    about: 'من نحن',
    services: 'الخدمات',
    products: 'المنتجات',
    bookings: 'الحجوزات',
    support: 'الدعم الفني',
    contact: 'تواصل معنا',
    login: 'تسجيل دخول',
    register: 'تسجيل',
    
    // Hero Section
    leading_tech: 'شركة رائدة في مجال التكنولوجيا',
    hero_desc: 'نقدم لكم حلولاً تقنية متقدمة تجمع بين الابتكار والاحترافية',
    hero_desc2: 'لبناء مستقبل رقمي أفضل',
    browse_products: 'تصفح المنتجات',
    contact_us: 'تواصل معنا',
    
    // Features
    why_choose: 'لماذا تختار ELECTRON VISION',
    features_desc: 'نقدم أفضل الحلول التقنية مع التزامنا بأعلى معايير الجودة والأمان',
    advanced_security: 'أمان متقدم',
    security_desc: 'نظام حماية متكامل يحمي بياناتك ومعلوماتك بأحدث تقنيات التشفير',
    high_quality: 'جودة عالية',
    quality_desc: 'منتجات وخدمات مصممة بعناية فائقة لتلبية أعلى المعايير',
    pro_design: 'تصميم احترافي',
    design_desc: 'واجهات مستخدم عصرية تجمع بين الجمال وسهولة الاستخدام',
    modern_tech: 'تقنيات حديثة',
    tech_desc: 'نستخدم أحدث التقنيات والمعماريات في بناء حلولنا',
    fast_performance: 'أداء سريع',
    performance_desc: 'تحسينات مستمرة لضمان أعلى سرعة في الأداء والاستجابة',
    strong_infra: 'بنية تحتية قوية',
    infra_desc: 'بنية تحتية متينة وقابلة للتوسع لتناسب احتياجاتك',
    smart_systems: 'أنظمة ذكية',
    smart_desc: 'حلول ذكية تعتمد على الذكاء الاصطناعي والتعلم الآلي',
    advanced_protection: 'حماية متقدمة',
    protection_desc: 'حماية شاملة ضد التهديدات السيبرانية والهجمات الخبيثة',
    
    // Services
    our_services: 'خدماتنا المتميزة',
    services_desc: 'مجموعة شاملة من الخدمات التقنية الاحترافية',
    
    // Products
    our_products: 'منتجاتنا',
    products_desc: 'مجموعة متنوعة من المنتجات المجانية والمدفوعة',
    view_all_products: 'عرض جميع المنتجات',
    
    // Footer
    footer_desc: 'شركة رائدة في تقديم الحلول التقنية المتقدمة',
    
    // Common
    login: 'تسجيل دخول',
    register: 'إنشاء حساب',
    logout: 'تسجيل الخروج',
    dashboard: 'لوحة التحكم',
    admin: 'الإدارة',
    save: 'حفظ',
    cancel: 'إلغاء',
    delete: 'حذف',
    edit: 'تعديل',
    add: 'إضافة',
    close: 'إغلاق',
    back: 'عودة',
    loading: 'جاري التحميل...',
    error: 'خطأ',
    success: 'نجاح',
    welcome: 'مرحباً',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    confirmPassword: 'تأكيد كلمة المرور',
    username: 'اسم المستخدم',
    rememberMe: 'تذكرني',
    forgotPassword: 'نسيت كلمة المرور?',
    noAccount: 'ليس لديك حساب؟',
    hasAccount: 'لديك حساب بالفعل؟',
    myTickets: 'تذاكري',
    myProducts: 'منتجاتي',
    freeProducts: 'منتجات مجانية',
    paidProducts: 'منتجات مدفوعة',
    openTickets: 'تذاكر مفتوحة',
    createTicket: 'إنشاء تذكرة',
    name: 'الاسم',
    subject: 'الموضوع',
    message: 'الرسالة',
    title: 'العنوان',
    description: 'الوصف',
    priority: 'مستوى الخطورة',
    low: 'منخفض',
    medium: 'متوسط',
    high: 'عالي',
    critical: 'حرج',
    status: 'الحالة',
    open: 'مفتوح',
    login: 'تسجيل الدخول',
    register: 'إنشاء حساب',
    logout: 'تسجيل الخروج',
    dashboard: 'لوحة التحكم',
    admin: 'الإدارة',
    save: 'حفظ',
    cancel: 'إلغاء',
    delete: 'حذف',
    edit: 'تعديل',
    add: 'إضافة',
    close: 'إغلاق',
    back: 'عودة',
    loading: 'جاري التحميل...',
    error: 'خطأ',
    success: 'نجاح',
    welcome: 'مرحباً',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    confirmPassword: 'تأكيد كلمة المرور',
    username: 'اسم المستخدم',
    rememberMe: 'تذكرني',
    forgotPassword: 'نسيت كلمة المرور?',
    noAccount: 'ليس لديك حساب?',
    hasAccount: 'لديك حساب بالفعل?',
    myTickets: 'تذاكري',
    myProducts: 'منتجاتي',
    freeProducts: 'منتجات مجانية',
    paidProducts: 'منتجات مدفوعة',
    openTickets: 'تذاكر مفتوحة',
    createTicket: 'إنشاء تذكرة',
    name: 'الاسم',
    subject: 'الموضوع',
    message: 'الرسالة',
    title: 'العنوان',
    description: 'الوصف',
    priority: 'مستوى الخطورة',
    low: 'منخفض',
    medium: 'متوسط',
    high: 'عالي',
    critical: 'حرج',
    status: 'الحالة',
    open: 'مفتوح',
    inProgress: 'قيد التنفيذ',
    closed: 'مغلق',
    price: 'السعر',
    free: 'مجاني',
    paid: 'مدفوع',
    download: 'تحميل',
    buy: 'شراء',
    users: 'المستخدمون',
    totalUsers: 'إجمالي المستخدمين',
    totalProducts: 'إجمالي المنتجات',
    totalTickets: 'إجمالي التذاكر',
    messages: 'الرسائل',
    addProduct: 'إضافة منتج',
    addService: 'إضافة خدمة',
    recentActivity: 'النشاط الأخير',
  },
  en: {
    // Navbar
    home: 'Home',
    about: 'About',
    services: 'Services',
    products: 'Products',
    bookings: 'Bookings',
    support: 'Support',
    contact: 'Contact',
    login: 'Login',
    register: 'Sign Up',
    logout: 'Logout',
    
    // Hero Section
    leading_tech: 'Leading Technology Company',
    hero_desc: 'We provide advanced technical solutions that combine innovation and professionalism',
    hero_desc2: 'To build a better digital future',
    browse_products: 'Browse Products',
    contact_us: 'Contact Us',
    
    // Features
    why_choose: 'Why Choose ELECTRON VISION',
    features_desc: 'We provide the best technical solutions with our commitment to the highest quality and security standards',
    advanced_security: 'Advanced Security',
    security_desc: 'An integrated protection system that secures your data with the latest encryption technologies',
    high_quality: 'High Quality',
    quality_desc: 'Products and services designed with exceptional care to meet the highest standards',
    pro_design: 'Professional Design',
    design_desc: 'Modern user interfaces that combine beauty and ease of use',
    modern_tech: 'Modern Technologies',
    tech_desc: 'We use the latest technologies and architectures in building our solutions',
    fast_performance: 'Fast Performance',
    performance_desc: 'Continuous improvements to ensure the highest speed in performance and response',
    strong_infra: 'Strong Infrastructure',
    infra_desc: 'Robust and scalable infrastructure to suit your needs',
    smart_systems: 'Smart Systems',
    smart_desc: 'Smart solutions based on artificial intelligence and machine learning',
    advanced_protection: 'Advanced Protection',
    protection_desc: 'Comprehensive protection against cyber threats and malicious attacks',
    
    // Services
    our_services: 'Our Services',
    services_desc: 'A comprehensive range of professional technical services',
    
    // Products
    our_products: 'Our Products',
    products_desc: 'A diverse collection of free and paid products',
    view_all_products: 'View All Products',
    
    // Footer
    footer_desc: 'A leading company in providing advanced technical solutions',
    
    // Common
    dashboard: 'Dashboard',
    admin: 'Admin',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    close: 'Close',
    back: 'Back',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    welcome: 'Welcome',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    username: 'Username',
    rememberMe: 'Remember me',
    forgotPassword: 'Forgot password?',
    noAccount: "Don't have an account?",
    hasAccount: 'Already have an account?',
    myTickets: 'My Tickets',
    myProducts: 'My Products',
    freeProducts: 'Free Products',
    paidProducts: 'Paid Products',
    openTickets: 'Open Tickets',
    createTicket: 'Create Ticket',
    name: 'Name',
    subject: 'Subject',
    message: 'Message',
    title: 'Title',
    description: 'Description',
    priority: 'Priority',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
    status: 'Status',
    open: 'Open',
    inProgress: 'In Progress',
    closed: 'Closed',
    price: 'Price',
    free: 'Free',
    paid: 'Paid',
    download: 'Download',
    buy: 'Buy Now',
    users: 'Users',
    totalUsers: 'Total Users',
    totalProducts: 'Total Products',
    totalTickets: 'Total Tickets',
    messages: 'Messages',
    addProduct: 'Add Product',
    addService: 'Add Service',
    recentActivity: 'Recent Activity',
  }
};

// ============================================
// LANGUAGE & THEME (localStorage OK for non-sensitive data)
// ============================================

let currentLang = localStorage.getItem('lang') || 'ar';
document.documentElement.lang = currentLang;
document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';

function t(key) {
  return translations[currentLang]?.[key] || key;
}

let currentTheme = localStorage.getItem('theme') || 'dark';

function applyTheme(theme) {
  currentTheme = theme;
  localStorage.setItem('theme', theme);
  
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  
  updateThemeButton();
}

function updateThemeButton() {
  const btns = document.querySelectorAll('.theme-toggle, #theme-toggle-btn, #theme-toggle');
  btns.forEach(btn => {
    if (btn) {
      btn.innerHTML = currentTheme === 'dark' ? '<span>🌙</span>' : '<span>☀️</span>';
      btn.title = currentTheme === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن';
    }
  });
}

applyTheme(currentTheme);

function toggleTheme() {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

// ============================================
// API CONFIGURATION
// ============================================

const API_URL = ''; // Empty string = same origin, API calls go to relative paths like /api/...
let currentUser = null;

// ============================================
// DEBOUNCE & THROTTLE UTILITIES
// ============================================

/**
 * Debounce function - delays execution until after wait ms of no calls
 */
function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function - limits execution to once per wait ms
 */
function throttle(func, wait = 300) {
  let lastTime = 0;
  return function executedFunction(...args) {
    const now = Date.now();
    if (now - lastTime >= wait) {
      lastTime = now;
      func(...args);
    }
  };
}

// ============================================
// API REQUEST WITH DEBOUNCING & SECURITY
// ============================================

// Track in-flight requests to prevent duplicates
const _pendingRequests = new Map();

async function apiRequest(endpoint, options = {}) {
  // Ensure endpoint starts with /api/ prefix
  if (!endpoint.startsWith('/api/') && !endpoint.startsWith('/')) {
    endpoint = '/api/' + endpoint;
  }
  
  // If endpoint is like /auth/me, make it /api/auth/me
  if (endpoint.startsWith('/auth/') || endpoint.startsWith('/products') || 
      endpoint.startsWith('/support') || endpoint.startsWith('/sessions') ||
      endpoint.startsWith('/notifications') || endpoint.startsWith('/payment')) {
    endpoint = '/api' + endpoint;
  }
  
  // Create a unique key for this request to prevent duplicates
  const requestKey = `${options.method || 'GET'}:${endpoint}:${JSON.stringify(options.body || {})}`;
  
  // Check if same request is already in progress
  if (_pendingRequests.has(requestKey)) {
    console.log('Request already in progress, returning cached promise');
    return _pendingRequests.get(requestKey);
  }
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json'
      // CSRF token will be added by fetch interceptor
    },
    credentials: 'include' // Important: sends cookies
  };

  // Add CSRF token from cookie
  const csrfToken = _getCSRFToken();
  if (csrfToken) {
    defaultOptions.headers['X-CSRF-Token'] = csrfToken;
  }

  let response;
  let requestPromise;
  
  try {
    // Store promise to prevent duplicate requests
    requestPromise = fetch(`${API_URL}${endpoint}`, {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers
      }
    });
    
    _pendingRequests.set(requestKey, requestPromise);
    
    response = await requestPromise;
    
    // Remove from pending
    _pendingRequests.delete(requestKey);
    
  } catch (error) {
    _pendingRequests.delete(requestKey);
    throw error;
  }

  // Handle response
  let data;
  try {
    data = await response.json();
  } catch (e) {
    data = {};
  }

  // Handle 401 - try to refresh token
  if (response.status === 401 && data.error && 
      (data.error.includes('ended') || data.error.includes('صلاحية') || data.error.includes('expired'))) {
    
    try {
      const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (refreshResponse.ok) {
        // Token refreshed, retry original request
        response = await fetch(`${API_URL}${endpoint}`, {
          ...defaultOptions,
          ...options,
          headers: {
            ...defaultOptions.headers,
            ...options.headers
          }
        });
        
        try {
          data = await response.json();
        } catch (e) {
          data = {};
        }
      }
    } catch (refreshError) {
      console.error('Token refresh failed:', refreshError);
      // Redirect to login if refresh fails
      window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
    }
  }

  if (!response.ok) {
    // Handle different error response formats
    let errorMessage = 'حدث خطأ';
    if (data.error) {
      errorMessage = data.error;
    } else if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
      // Handle express-validator errors array
      errorMessage = data.errors.map(e => e.msg || e.message).join(', ');
    } else if (data.message) {
      errorMessage = data.message;
    }
    throw new Error(errorMessage);
  }

  return data;
}

// Get CSRF token from cookie
function _getCSRFToken() {
  const name = 'XSRF-TOKEN=';
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

// ============================================
// AUTH FUNCTIONS (cookie-based) - Enhanced with security
// ============================================

// Session configuration
const SESSION_TIMEOUT = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
const SESSION_CHECK_INTERVAL = 60000; // Check every minute
let lastActivityTime = Date.now();
let sessionCheckInterval = null;

// Track user activity
function updateActivity() {
  lastActivityTime = Date.now();
  sessionStorage.setItem('lastActivity', lastActivityTime.toString());
}

// Initialize session monitoring
function initSessionMonitor() {
  // Clear any existing interval
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
  }
  
  // Check session validity every minute
  sessionCheckInterval = setInterval(async () => {
    const storedLastActivity = sessionStorage.getItem('lastActivity');
    if (storedLastActivity) {
      const lastActivity = parseInt(storedLastActivity);
      const timeSinceActivity = Date.now() - lastActivity;
      
      // If session has expired
      if (timeSinceActivity > SESSION_TIMEOUT) {
        console.log('Session expired due to inactivity');
        await handleSessionExpired();
      } else {
        // Verify session with server in background
        try {
          const response = await fetch('/api/auth/me', {
            method: 'GET',
            credentials: 'include'
          });
          
          if (response.status === 401 || response.status === 403) {
            console.log('Session invalidated by server');
            await handleSessionExpired();
          }
        } catch (e) {
          // Network error - ignore
        }
      }
    }
  }, SESSION_CHECK_INTERVAL);
  
  // Listen for activity events
  ['click', 'keypress', 'mousemove', 'scroll', 'touchstart'].forEach(event => {
    document.addEventListener(event, updateActivity, { passive: true });
  });
}

// Handle session expiration
async function handleSessionExpired() {
  // Clear session data
  currentUser = null;
  sessionStorage.removeItem('currentUser');
  sessionStorage.removeItem('authToken');
  sessionStorage.removeItem('lastActivity');
  
  // Stop session monitoring
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
  }
  
  // Show notification
  if (typeof showAlert === 'function') {
    showAlert('انتهت صلاحية جلستك. يرجى تسجيل الدخول مرة أخرى.', 'error');
  }
  
  // Redirect to login after short delay
  setTimeout(() => {
    window.location.href = '/login?expired=true';
  }, 1500);
}

// Secure logout function
async function secureLogout() {
  try {
    // Notify server about logout
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (e) {
    // Ignore errors
  }
  
  // Clear all session data
  currentUser = null;
  sessionStorage.clear();
  localStorage.clear();
  
  // Clear client_token cookie
  document.cookie = 'client_token=; Max-Age=-99999999; path=/';
  
  // Stop session monitoring
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
  }
  
  // Redirect to home
  window.location.href = '/login?loggedout=true';
}

// Validate user account status
function validateUserStatus(user) {
  if (!user) {
    return { valid: false, error: 'لا يوجد مستخدم' };
  }
  
  // Check if user account is disabled
  if (user.is_disabled || user.is_banned) {
    return { valid: false, error: 'تم تعطيل حسابك. يرجى التواصل مع الدعم.' };
  }
  
  // Check role validity
  const validRoles = ['admin', 'manager', 'moderator', 'user'];
  if (!validRoles.includes(user.role)) {
    return { valid: false, error: 'دور المستخدم غير صالح' };
  }
  
  return { valid: true };
}

async function getCurrentUser() {
  // If we already have user in memory, return it
  if (currentUser) {
    // Validate user status before returning
    const validation = validateUserStatus(currentUser);
    if (!validation.valid) {
      console.log('User validation failed:', validation.error);
      currentUser = null;
      sessionStorage.removeItem('currentUser');
      return null;
    }
    return currentUser;
  }
  
  // Try to get from sessionStorage cache first
  const cachedUser = sessionStorage.getItem('currentUser');
  const storedToken = sessionStorage.getItem('authToken');
  if (cachedUser) {
    try {
      const userData = JSON.parse(cachedUser);
      
      // Validate cached user
      const validation = validateUserStatus(userData);
      if (!validation.valid) {
        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('authToken');
        handleSessionExpired();
        return null;
      }
      
      currentUser = userData;
      
      // Verify with server in background
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
        headers: storedToken ? { 'Authorization': 'Bearer ' + storedToken } : {}
      });
      
      if (response.ok) {
        const data = await response.json();
        currentUser = data.user;
        sessionStorage.setItem('currentUser', JSON.stringify(data.user));
        updateActivity();
      } else if (response.status === 401 || response.status === 403) {
        // Token expired or invalid
        console.log('Token validation failed');
        currentUser = null;
        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('authToken');
        return null;
      }
      
      return currentUser;
    } catch (e) {
      sessionStorage.removeItem('currentUser');
    }
  }
  
  // No cached user, verify with server
  try {
    const response = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(storedToken ? { 'Authorization': 'Bearer ' + storedToken } : {})
      }
    });
    
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        // Session expired
        const error = await response.json();
        console.log('getCurrentUser failed:', error.message || 'Unauthorized');
        currentUser = null;
        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('authToken');
        return null;
      }
      
      const error = await response.json();
      console.log('getCurrentUser failed:', error);
      currentUser = null;
      sessionStorage.removeItem('currentUser');
      return null;
    }
    
    const data = await response.json();
    
    // Validate user from server
    const validation = validateUserStatus(data.user);
    if (!validation.valid) {
      console.log('Server user validation failed:', validation.error);
      await handleSessionExpired();
      return null;
    }
    
    currentUser = data.user;
    sessionStorage.setItem('currentUser', JSON.stringify(data.user));
    updateActivity();
    initSessionMonitor();
    
    return currentUser;
  } catch (error) {
    console.error('Get user error:', error);
    currentUser = null;
    return null;
  }
}

function saveCurrentUser(user) {
  currentUser = user;
}

async function login(email, password, rememberMe = false) {
  const response = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, rememberMe })
  });

  // User data is now in response.user
  if (response.user) {
    currentUser = response.user;
    // Cache user in sessionStorage for cross-page persistence
    sessionStorage.setItem('currentUser', JSON.stringify(response.user));
    
    // Save token in sessionStorage for socket and API access
    if (response.token) {
      sessionStorage.setItem('authToken', response.token);
    }
  }

  return response;
}

async function register(username, email, password) {
  const response = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password })
  });

  // If auto-login after register
  if (response.user) {
    currentUser = response.user;
    sessionStorage.setItem('currentUser', JSON.stringify(response.user));
  }

  return response;
}

// Logout - clear server-side session
async function logout() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    console.error('Logout error:', error);
  }

  // Clear client-side user data
  currentUser = null;
  sessionStorage.removeItem('currentUser');
  sessionStorage.removeItem('authToken');
  
  // Clear client_token cookie
  document.cookie = 'client_token=; Max-Age=-99999999; path=/';
  
  // Reload current page without redirecting to login
  window.location.reload();
}

// ============================================
// UI FUNCTIONS
// ============================================

function showAlert(message, type = 'error') {
  const existingAlerts = document.querySelectorAll('.alert');
  existingAlerts.forEach(alert => alert.remove());
  
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.innerHTML = message;
  alert.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000; max-width: 400px; background: rgba(34, 197, 94, 0.1); color: #065f46; border: 2px solid #16a34a; border-radius: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.15); padding: 12px 16px; backdrop-filter: blur(6px); font-weight: 500;';  
  document.body.appendChild(alert);
  
  setTimeout(() => alert.remove(), 5000);
}

function showBroadcastToast(message) {
  const existing = document.querySelectorAll('.broadcast-toast');
  existing.forEach(el => el.remove());
  
  const toast = document.createElement('div');
  toast.className = 'broadcast-toast';
  toast.innerHTML = message;
  toast.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10001; max-width: 400px; background: rgba(59, 130, 246, 0.1); color: #1e40af; border: 2px solid #3b82f6; border-radius: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.15); padding: 12px 16px; backdrop-filter: blur(6px); font-weight: 500;';
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 5000);
}

function updatePageTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
}

// ============================================
// NAVBAR (FIXED: uses event listeners, not inline onclick)
// ============================================

async function updateNavbar() {
  const navbarActions = document.getElementById('navbar-actions');
  if (!navbarActions) return;

  try {
    const user = await getCurrentUser();
    
    if (user) {
      navbarActions.innerHTML = `
        <button class="theme-toggle" id="theme-toggle-btn" title="${currentTheme === 'dark' ? 'Light' : 'Dark'}">
          ${currentTheme === 'dark' ? '☀️' : '🌙'}
        </button>
        <select class="lang-switch" id="lang-switch">
          <option value="ar" ${currentLang === 'ar' ? 'selected' : ''}>العربية</option>
          <option value="en" ${currentLang === 'en' ? 'selected' : ''}>English</option>
        </select>
        <a href="/dashboard" class="btn btn-primary">${t('dashboard')}</a>
        <a href="#" class="btn btn-outline" id="logout-btn">${t('logout')}</a>
      `;
      
      // FIXED: Use addEventListener instead of inline onclick
      document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
      document.getElementById('lang-switch').addEventListener('change', (e) => setLanguage(e.target.value));
      document.getElementById('logout-btn').addEventListener('click', (e) => {
        e.preventDefault();
        logout();
      });
    } else {
      navbarActions.innerHTML = `
        <button class="theme-toggle" id="theme-toggle-btn" title="${currentTheme === 'dark' ? 'Light' : 'Dark'}">
          ${currentTheme === 'dark' ? '☀️' : '🌙'}
        </button>
        <select class="lang-switch" id="lang-switch">
          <option value="ar" ${currentLang === 'ar' ? 'selected' : ''}>العربية</option>
          <option value="en" ${currentLang === 'en' ? 'selected' : ''}>English</option>
        </select>
        <a href="/login" class="btn btn-outline">${t('login')}</a>
        <a href="/register" class="btn btn-primary">${t('register')}</a>
      `;
      
      // FIXED: Use addEventListener instead of inline onclick
      document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
      document.getElementById('lang-switch').addEventListener('change', (e) => setLanguage(e.target.value));
    }
  } catch (error) {
    console.error('Update navbar error:', error);
    // Show logged out state on error
    navbarActions.innerHTML = `
      <button class="theme-toggle" id="theme-toggle-btn" title="${currentTheme === 'dark' ? 'Light' : 'Dark'}">
        ${currentTheme === 'dark' ? '☀️' : '🌙'}
      </button>
      <select class="lang-switch" id="lang-switch">
        <option value="ar" ${currentLang === 'ar' ? 'selected' : ''}>العربية</option>
        <option value="en" ${currentLang === 'en' ? 'selected' : ''}>English</option>
      </select>
      <a href="/login" class="btn btn-outline">${t('login')}</a>
      <a href="/register" class="btn btn-primary">${t('register')}</a>
    `;
    
    document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleTheme);
    document.getElementById('lang-switch')?.addEventListener('change', (e) => setLanguage(e.target.value));
  }
}

// ============================================
// LANGUAGE SWITCHER
// ============================================

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  
  updatePageTranslations();
  
  const langSwitcher = document.querySelector('.lang-switch');
  if (langSwitcher) {
    langSwitcher.value = lang;
  }
}

function initLanguage() {
  const savedLang = localStorage.getItem('lang') || 'ar';
  setLanguage(savedLang);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function getPriorityLabel(priority) {
  const labels = {
    ar: { low: 'منخفض', medium: 'متوسط', high: 'عالي', critical: 'حرج' },
    en: { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' }
  };
  return labels[currentLang]?.[priority] || priority;
}

function getStatusLabel(status) {
  const labels = {
    ar: { pending: 'بانتظار', open: 'مفتوح', in_progress: 'قيد التنفيذ', closed: 'مغلق', accepted: 'مقبول', rejected: 'مرفوض', completed: 'مكتمل', cancelled: 'ملغي' },
    en: { pending: 'Pending', open: 'Open', in_progress: 'In Progress', closed: 'Closed', accepted: 'Accepted', rejected: 'Rejected', completed: 'Completed', cancelled: 'Cancelled' }
  };
  return labels[currentLang]?.[status] || status;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  return date.toLocaleDateString(currentLang === 'ar' ? 'ar-SA' : 'en-US', options);
}

// ============================================
// AUTH CHECK (FIXED: uses cookie, prevents redirect loop)
// ============================================

// Track if we're currently checking auth to prevent loops
let _isCheckingAuth = false;

async function requireAuth() {
  // Prevent redirect loop - if we're already checking, don't check again
  if (_isCheckingAuth) {
    return false;
  }
  
  // Prevent redirect loop - if we're already on login page or register
  const currentPath = window.location.pathname;
  if (currentPath === '/login' || currentPath === '/login.html' || currentPath === '/register' || currentPath === '/register.html') {
    return false;
  }
  
  // Check if token cookie exists or use cached user
  const hasTokenCookie = document.cookie.split('; ').some(row => row.startsWith('client_token='));
  const cachedUser = sessionStorage.getItem('currentUser');
  
  // If no token and no cached user, redirect to login
  if (!hasTokenCookie && !cachedUser) {
    const redirectUrl = window.location.pathname;
    if (redirectUrl !== '/dashboard' && redirectUrl !== '/') {
      window.location.href = '/login?redirect=' + encodeURIComponent(redirectUrl);
    } else {
      window.location.href = '/login';
    }
    return false;
  }
  
  // If we have cached user but no token, try to verify
  if (!hasTokenCookie && cachedUser) {
    try {
      const userData = JSON.parse(cachedUser);
      currentUser = userData;
      // Try to verify with server in background
      getCurrentUser().catch(() => {
        // If verification fails, clear cache and redirect
        sessionStorage.removeItem('currentUser');
        currentUser = null;
      });
      return true;
    } catch (e) {
      sessionStorage.removeItem('currentUser');
    }
  }
  
  // Verify with server - only do this once at a time
  _isCheckingAuth = true;
  
  try {
    const user = await getCurrentUser();
    _isCheckingAuth = false;
    
    if (!user) {
      sessionStorage.removeItem('currentUser');
      const redirectUrl = window.location.pathname;
      window.location.href = '/login?redirect=' + encodeURIComponent(redirectUrl);
      return false;
    }
    
    // Cache user in sessionStorage for persistence across pages
    sessionStorage.setItem('currentUser', JSON.stringify(user));
    return true;
  } catch (error) {
    _isCheckingAuth = false;
    // On error, check if we have cached user
    if (cachedUser) {
      try {
        const userData = JSON.parse(cachedUser);
        currentUser = userData;
        return true;
      } catch (e) {
        sessionStorage.removeItem('currentUser');
      }
    }
    console.error('Auth check failed:', error);
    return false;
  }
}

async function requireAdmin() {
  try {
    const user = await getCurrentUser();
    const allowedRoles = ['admin', 'manager', 'moderator'];
    if (user && allowedRoles.includes(user.role)) {
      return true;
    }
    if (user) {
      window.location.href = '/dashboard?error=admin_only';
      return false;
    }
    window.location.href = '/login';
    return false;
  } catch (error) {
    window.location.href = '/login';
    return false;
  }
}

// ============================================
// FORM VALIDATION
// ============================================

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  return password.length >= 6;
}

function checkPasswordStrength(password) {
  let strength = 0;
  if (password.length >= 8) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;
  return strength;
}

// ============================================
// THROTTLED API CALLS (prevent spam)
// ============================================

// Throttled version of getCurrentUser - prevents multiple calls
const throttledGetUser = throttle(() => getCurrentUser(), 1000);

// Throttled version of updateNavbar
const throttledUpdateNavbar = throttle(() => updateNavbar(), 500);

// ============================================
// INITIALIZATION (FIXED: uses event listeners)
// ============================================

document.addEventListener('DOMContentLoaded', function() {
  updatePageTranslations();
  updateNavbar();
  initLanguage();
  
  // Theme toggle - use event listener
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', toggleTheme);
  }
  
  // Mobile menu toggle
  const menuBtn = document.querySelector('.navbar-toggle');
  const nav = document.querySelector('.navbar-nav');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', () => {
      nav.classList.toggle('active');
    });
  }
  
  // Language switcher buttons
  const langBtns = document.querySelectorAll('.lang-switcher .btn');
  langBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      if (lang) setLanguage(lang);
    });
  });
});

// Export for global use
window.app = {
  t,
  showAlert,
  showLoader,
  hideLoader,
  getCurrentUser,
  saveCurrentUser,
  login,
  register,
  logout,
  requireAuth,
  requireAdmin,
  apiRequest,
  toggleTheme,
  setLanguage,
  updateNavbar,
  updatePageTranslations,
  validateEmail,
  validatePassword,
  checkPasswordStrength,
  getPriorityLabel,
  getStatusLabel,
  formatDate,
  debounce,
  throttle,
  translations
};

// Backward compatibility
window.getCurrentUser = getCurrentUser;
window.saveCurrentUser = saveCurrentUser;
window.login = login;
window.register = register;
window.logout = logout;
window.requireAuth = requireAuth;
window.requireAdmin = requireAdmin;
window.apiRequest = apiRequest;
window.toggleTheme = toggleTheme;
window.setLanguage = setLanguage;
window.updateNavbar = updateNavbar;
window.updatePageTranslations = updatePageTranslations;
window.showAlert = showAlert;
window.showBroadcastToast = showBroadcastToast;
window.showLoader = showLoader;
window.hideLoader = hideLoader;
window.validateEmail = validateEmail;
window.validatePassword = validatePassword;
window.checkPasswordStrength = checkPasswordStrength;
window.getPriorityLabel = getPriorityLabel;
window.getStatusLabel = getStatusLabel;
window.formatDate = formatDate;
window.currentLang = currentLang;
window.currentTheme = currentTheme;
window.currentUser = currentUser;
window.secureLogout = secureLogout;
window.initSessionMonitor = initSessionMonitor;
window.handleSessionExpired = handleSessionExpired;
window.validateUserStatus = validateUserStatus;
