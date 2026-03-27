/**
 * ELECTRON VISION - Admin Dashboard
 * Restaurant & Food Delivery Platform
 * Interactive Features & Animations
 */

document.addEventListener('DOMContentLoaded', function() {
  // Initialize all dashboard features
  initSidebar();
  initAnimations();
  initCharts();
  initCounters();
  initNotifications();
  initModals();
  initTooltips();
  initDropdowns();
  initTableActions();
  initFormValidation();
  initKeyboardShortcuts();
});

/* ===== SIDEBAR FUNCTIONALITY ===== */
function initSidebar() {
  const menuToggle = document.querySelector('.menu-toggle');
  const sidebar = document.querySelector('.admin-sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('active');
    });
    
    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
      });
    }
  }
  
  // Submenu toggle
  const hasSubmenu = document.querySelectorAll('.nav-item.has-submenu');
  hasSubmenu.forEach(item => {
    const header = item.querySelector('.admin-menu-header');
    if (header) {
      header.addEventListener('click', () => {
        item.classList.toggle('open');
      });
    }
  });
  
  // Active nav link
  const navLinks = document.querySelectorAll('.nav-link, .submenu-link');
  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      navLinks.forEach(l => l.classList.remove('active'));
      this.classList.add('active');
    });
  });
}

/* ===== ANIMATIONS ===== */
function initAnimations() {
  // Staggered fade-in for cards
  const cards = document.querySelectorAll('.stat-card, .chart-card, .table-card, .dashboard-card');
  
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
      if (entry.isIntersecting) {
        entry.target.style.animationDelay = `${index * 0.1}s`;
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);
  
  cards.forEach(card => {
    observer.observe(card);
  });
  
  // Hover glow effect
  const glowElements = document.querySelectorAll('.stat-card, .chart-card');
  glowElements.forEach(el => {
    el.addEventListener('mousemove', handleGlow);
    el.addEventListener('mouseleave', removeGlow);
  });
}

function handleGlow(e) {
  const rect = this.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  this.style.setProperty('--glow-x', `${x}px`);
  this.style.setProperty('--glow-y', `${y}px`);
}

function removeGlow() {
  this.style.removeProperty('--glow-x');
  this.style.removeProperty('--glow-y');
}

/* ===== CHARTS & STATS ===== */
function initCharts() {
  // Revenue Chart (Bar Chart)
  const revenueChart = document.getElementById('revenue-chart');
  if (revenueChart) {
    animateBarChart(revenueChart);
  }
  
  // Orders Donut Chart
  const ordersChart = document.getElementById('orders-chart');
  if (ordersChart) {
    animateDonutChart(ordersChart);
  }
  
  // Line Chart (Orders over time)
  const lineChart = document.getElementById('orders-line-chart');
  if (lineChart) {
    animateLineChart(lineChart);
  }
  
  // Chart period buttons
  const chartBtns = document.querySelectorAll('.chart-btn');
  chartBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      chartBtns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      // Simulate data change
      updateChartData(this.dataset.period);
    });
  });
}

function animateBarChart(container) {
  const bars = container.querySelectorAll('.chart-bar');
  const values = container.dataset.values ? container.dataset.values.split(',') : ['65', '80', '45', '90', '70', '85', '55'];
  
  bars.forEach((bar, index) => {
    const height = values[index] || 50;
    bar.style.setProperty('--bar-height', `${height}%`);
    bar.style.height = '0%';
    bar.dataset.value = height;
    
    setTimeout(() => {
      bar.style.height = `${height}%`;
    }, index * 100 + 200);
  });
}

function animateDonutChart(container) {
  const segments = container.querySelectorAll('.donut-segment');
  const data = container.dataset.values ? container.dataset.values.split(',') : ['35', '25', '20', '20'];
  const total = data.reduce((a, b) => parseInt(a) + parseInt(b), 0);
  
  let cumulative = 0;
  segments.forEach((segment, index) => {
    const value = parseInt(data[index]);
    const percentage = (value / total) * 100;
    const dashArray = (percentage / 100) * 157;
    const dashOffset = 157 - (cumulative / total) * 157;
    
    segment.style.strokeDasharray = `${dashArray} 157`;
    segment.style.strokeDashoffset = `-${cumulative}`;
    
    cumulative += value;
  });
}

function animateLineChart(container) {
  const path = container.querySelector('.line-path');
  if (path) {
    const length = path.getTotalLength();
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;
    
    setTimeout(() => {
      path.style.transition = 'stroke-dashoffset 1.5s ease';
      path.style.strokeDashoffset = '0';
    }, 500);
  }
}

function updateChartData(period) {
  // Simulate data update with random values
  const chartBars = document.querySelectorAll('#revenue-chart .chart-bar');
  const newValues = {
    'week': [65, 80, 45, 90, 70, 85, 55],
    'month': [75, 60, 85, 70, 95, 80, 65, 90, 55, 70, 85, 60],
    'year': [65, 75, 60, 80, 70, 85, 90, 75, 65, 80, 70, 85]
  };
  
  const values = newValues[period] || newValues.week;
  
  chartBars.forEach((bar, index) => {
    const newValue = values[index] || 50;
    bar.style.transition = 'height 0.5s ease';
    bar.style.height = `${newValue}%`;
    bar.dataset.value = newValue;
  });
}

/* ===== COUNTER ANIMATION ===== */
function initCounters() {
  const counters = document.querySelectorAll('.stat-value[data-count]');
  
  const observerOptions = {
    threshold: 0.5
  };
  
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);
  
  counters.forEach(counter => {
    counterObserver.observe(counter);
  });
}

function animateCounter(element) {
  const target = parseInt(element.dataset.count);
  const duration = 2000;
  const start = 0;
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing function (ease-out-expo)
    const easeOutExpo = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    
    const current = Math.floor(start + (target - start) * easeOutExpo);
    element.textContent = current.toLocaleString();
    
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  
  requestAnimationFrame(update);
}

/* ===== NOTIFICATIONS & TOASTS ===== */
function initNotifications() {
  // Auto-dismiss alerts
  const alerts = document.querySelectorAll('.alert.auto-dismiss');
  alerts.forEach(alert => {
    setTimeout(() => {
      alert.style.animation = 'slideInRight 0.3s ease reverse';
      setTimeout(() => alert.remove(), 300);
    }, 5000);
  });
  
  // Alert close buttons
  document.querySelectorAll('.alert-close').forEach(btn => {
    btn.addEventListener('click', function() {
      const alert = this.closest('.alert');
      alert.style.animation = 'slideInRight 0.3s ease reverse';
      setTimeout(() => alert.remove(), 300);
    });
  });
}

// Global toast function
window.showToast = function(type, title, message) {
  let container = document.querySelector('.toast-container');
  
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  
  const icons = {
    success: '✓',
    warning: '⚠',
    error: '✕',
    info: 'ℹ'
  };
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;
  
  container.appendChild(toast);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    toast.style.animation = 'slideInRight 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
};

/* ===== MODALS ===== */
function initModals() {
  const modals = document.querySelectorAll('.modal-overlay');
  
  modals.forEach(modal => {
    const closeBtn = modal.querySelector('.modal-close');
    const overlay = modal;
    
    if (closeBtn) {
      closeBtn.addEventListener('click', () => closeModal(modal));
    }
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(modal);
      }
    });
  });
  
  // Modal trigger buttons
  document.querySelectorAll('[data-modal]').forEach(btn => {
    btn.addEventListener('click', function() {
      const modalId = this.dataset.modal;
      const modal = document.getElementById(modalId);
      if (modal) openModal(modal);
    });
  });
}

function openModal(modal) {
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

window.openModal = openModal;
window.closeModal = closeModal;

/* ===== TOOLTIPS ===== */
function initTooltips() {
  const tooltipElements = document.querySelectorAll('[data-tooltip]');
  
  tooltipElements.forEach(el => {
    el.addEventListener('mouseenter', showTooltip);
    el.addEventListener('mouseleave', hideTooltip);
  });
}

function showTooltip(e) {
  const text = e.target.dataset.tooltip;
  if (!text) return;
  
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.textContent = text;
  tooltip.id = 'active-tooltip';
  
  document.body.appendChild(tooltip);
  
  const rect = e.target.getBoundingClientRect();
  tooltip.style.top = `${rect.top - tooltip.offsetHeight - 8}px`;
  tooltip.style.left = `${rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2)}px`;
}

function hideTooltip() {
  const tooltip = document.getElementById('active-tooltip');
  if (tooltip) tooltip.remove();
}

/* ===== DROPDOWNS ===== */
function initDropdowns() {
  const dropdowns = document.querySelectorAll('.dropdown');
  
  dropdowns.forEach(dropdown => {
    const trigger = dropdown.querySelector('.dropdown-trigger');
    const menu = dropdown.querySelector('.dropdown-menu');
    
    if (trigger && menu) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllDropdowns();
        dropdown.classList.toggle('open');
      });
    }
  });
  
  document.addEventListener('click', () => closeAllDropdowns());
}

function closeAllDropdowns() {
  document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
}

/* ===== TABLE ACTIONS ===== */
function initTableActions() {
  // Row hover effects
  const tableRows = document.querySelectorAll('.data-table tbody tr');
  tableRows.forEach(row => {
    row.addEventListener('mouseenter', () => {
      row.style.background = 'rgba(212, 165, 116, 0.05)';
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = '';
    });
  });
  
  // Action button confirmation
  document.querySelectorAll('.table-action-btn[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const confirmed = confirm('هل أنت متأكد من حذف هذا العنصر؟');
      if (confirmed) {
        showToast('success', 'تم الحذف', 'تم حذف العنصر بنجاح');
      }
    });
  });
}

/* ===== FORM VALIDATION ===== */
function initFormValidation() {
  const forms = document.querySelectorAll('.needs-validation');
  
  forms.forEach(form => {
    form.addEventListener('submit', (e) => {
      if (!form.checkValidity()) {
        e.preventDefault();
        showInvalidFields(form);
      }
    });
    
    // Real-time validation
    const inputs = form.querySelectorAll('.form-input, .form-select');
    inputs.forEach(input => {
      input.addEventListener('blur', () => validateField(input));
      input.addEventListener('input', () => {
        if (input.classList.contains('is-invalid')) {
          validateField(input);
        }
      });
    });
  });
}

function validateField(input) {
  const value = input.value.trim();
  let isValid = true;
  let message = '';
  
  // Required check
  if (input.hasAttribute('required') && !value) {
    isValid = false;
    message = 'هذا الحقل مطلوب';
  }
  
  // Email validation
  if (input.type === 'email' && value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      isValid = false;
      message = 'البريد الإلكتروني غير صحيح';
    }
  }
  
  // Number validation
  if (input.type === 'number' && value) {
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    const num = parseFloat(value);
    
    if (min && num < min) {
      isValid = false;
      message = `الحد الأدنى هو ${min}`;
    }
    if (max && num > max) {
      isValid = false;
      message = `الحد الأقصى هو ${max}`;
    }
  }
  
  // Update UI
  input.classList.remove('is-invalid', 'is-valid');
  if (!isValid) {
    input.classList.add('is-invalid');
    showFieldError(input, message);
  } else if (value) {
    input.classList.add('is-valid');
  }
  
  return isValid;
}

function showInvalidFields(form) {
  const inputs = form.querySelectorAll('.form-input, .form-select');
  inputs.forEach(input => validateField(input));
}

function showFieldError(input, message) {
  let errorEl = input.parentElement.querySelector('.error-message');
  if (!errorEl) {
    errorEl = document.createElement('div');
    errorEl.className = 'error-message';
    errorEl.style.cssText = 'color: var(--error); font-size: 0.75rem; margin-top: 0.25rem;';
    input.parentElement.appendChild(errorEl);
  }
  errorEl.textContent = message;
}

/* ===== KEYBOARD SHORTCUTS ===== */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Escape to close modals
    if (e.key === 'Escape') {
      const activeModal = document.querySelector('.modal-overlay.active');
      if (activeModal) closeModal(activeModal);
      
      const openDropdown = document.querySelector('.dropdown.open');
      if (openDropdown) openDropdown.classList.remove('open');
    }
    
    // Ctrl/Cmd + K for search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.querySelector('.search-input');
      if (searchInput) searchInput.focus();
    }
  });
}

/* ===== UTILITY FUNCTIONS ===== */

// Format currency
window.formatCurrency = function(amount, currency = 'د.إ') {
  return new Intl.NumberFormat('ar-AE', {
    style: 'currency',
    currency: currency
  }).format(amount);
};

// Format date
window.formatDate = function(date, locale = 'ar-AE') {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(date));
};

// Relative time
window.timeAgo = function(date) {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now - past;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSecs < 60) return 'منذ لحظات';
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays < 7) return `منذ ${diffDays} يوم`;
  return formatDate(date);
};

// API helper
window.apiRequest = async function(endpoint, options = {}) {
  const defaultOptions = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  try {
    const response = await fetch(endpoint, { ...defaultOptions, ...options });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'حدث خطأ');
    }
    
    return data;
  } catch (error) {
    showToast('error', 'خطأ', error.message);
    throw error;
  }
};

// Refresh page data
window.refreshDashboard = async function() {
  try {
    const data = await apiRequest('/api/admin/stats');
    updateDashboardStats(data);
    showToast('success', 'تم التحديث', 'تم تحديث البيانات بنجاح');
  } catch (error) {
    // Silent fail
  }
};

function updateDashboardStats(data) {
  if (data.users) {
    const el = document.getElementById('stat-users');
    if (el) {
      el.dataset.count = data.users;
      animateCounter(el);
    }
  }
  
  if (data.orders) {
    const el = document.getElementById('stat-orders');
    if (el) {
      el.dataset.count = data.orders;
      animateCounter(el);
    }
  }
  
  if (data.revenue) {
    const el = document.getElementById('stat-revenue');
    if (el) {
      el.dataset.count = data.revenue;
      animateCounter(el);
    }
  }
  
  if (data.products) {
    const el = document.getElementById('stat-products');
    if (el) {
      el.dataset.count = data.products;
      animateCounter(el);
    }
  }
}

/* ===== EXPORT FOR GLOBAL USE ===== */
window.AdminDashboard = {
  showToast,
  openModal,
  closeModal,
  formatCurrency,
  formatDate,
  timeAgo,
  apiRequest,
  refreshDashboard
};
