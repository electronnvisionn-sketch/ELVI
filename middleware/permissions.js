/**
 * ELECTRON VISION - Permissions & Roles
 * user | moderator | manager | admin
 */

const ROLES = {
  // مدير الكل - كل الصلاحيات
  admin: {
    name: 'مدير',
    nameEn: 'Admin',
    level: 100,
    permissions: ['*']
  },

  // مدير المستخدمين - المستخدمين + الإشعارات + البث
  manager: {
    name: 'مدير مستخدمين',
    nameEn: 'Manager',
    level: 80,
    permissions: [
      'users.view',
      'users.create',
      'users.edit',
      'users.delete',
      'users.manage_roles',
      'notifications.view',
      'notifications.send',
      'broadcasts.create',
      'broadcasts.view',
      'broadcasts.delete',
      'products.view',
      'services.view',
      'orders.view',
      'dashboard.view',
    ]
  },

  // مشرف - الحجوزات + الرسائل + التذاكر فقط
  moderator: {
    name: 'مشرف',
    nameEn: 'Moderator',
    level: 50,
    permissions: [
      'bookings.view',
      'bookings.edit',
      'bookings.confirm',
      'bookings.reject',
      'messages.view',
      'messages.edit',
      'messages.delete',
      'tickets.view',
      'tickets.edit',
      'tickets.delete',
      'tickets.reply',
      'dashboard.view',
    ]
  },

  // مستخدم عادي
  user: {
    name: 'مستخدم',
    nameEn: 'User',
    level: 10,
    permissions: [
      'profile.view',
      'profile.edit',
      'products.view',
      'orders.view_own',
      'tickets.create',
      'tickets.view_own',
      'bookings.create',
      'bookings.view_own',
    ]
  }
};

function hasPermission(user, permission) {
  if (!user || !user.role) return false;
  const roleData = ROLES[user.role];
  if (!roleData) return false;
  if (roleData.permissions.includes('*')) return true;
  return roleData.permissions.includes(permission);
}

function hasAnyPermission(user, permissions) {
  return permissions.some(p => hasPermission(user, p));
}

function hasAllPermissions(user, permissions) {
  return permissions.every(p => hasPermission(user, p));
}

function hasRoleLevel(user, minLevel) {
  if (!user || !user.role) return false;
  const roleData = ROLES[user.role];
  if (!roleData) return false;
  return roleData.level >= minLevel;
}

function getRoleInfo(role) {
  return ROLES[role] || null;
}

function getAllRoles() {
  return Object.entries(ROLES).map(([key, value]) => ({
    key,
    name: value.name,
    nameEn: value.nameEn,
    level: value.level,
    permissions: value.permissions
  }));
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'غير مصادق' });
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ error: 'ليس لديك صلاحية', required: permission });
    }
    next();
  };
}

function requireAnyPermission(permissions) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'غير مصادق' });
    if (!hasAnyPermission(req.user, permissions)) {
      return res.status(403).json({ error: 'ليس لديك صلاحية' });
    }
    next();
  };
}

function requireMinLevel(minLevel) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'غير مصادق' });
    if (!hasRoleLevel(req.user, minLevel)) {
      return res.status(403).json({ error: 'ليس لديك صلاحية كافية' });
    }
    next();
  };
}

module.exports = {
  ROLES,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasRoleLevel,
  getRoleInfo,
  getAllRoles,
  requirePermission,
  requireAnyPermission,
  requireMinLevel,
};
