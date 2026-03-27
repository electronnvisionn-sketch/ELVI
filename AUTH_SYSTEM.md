# نظام التحقق من تسجيل الدخول - ELECTRON VISION

## نظرة عامة

نظام التحقق من تسجيل الدخول هو نظام شامل يوفر أماناً عالياً للمستخدمين. النظام يتضمن ميزات متعددة للتحقق والحماية.

---

## المكونات الرئيسية

### 1. الواجهة الأمامية (Frontend)

#### ملف: `public/js/auth.js`
- **الوظيفة**: إدارة حالة المصادقة المركزية لجميع الصفحات
- **الخصائص الرئيسية**:
  - `fetchAuth()` - التحقق من حالة المصادقة مع السيرفر
  - `updateUIElements()` - تحديث واجهة المستخدم بناءً على حالة المصادقة
  - `logout()` - تسجيل الخروج
  - `onAuthChange(callback)` - الاستماع لتغييرات المصادقة
  - `requireAuth(callback)` - التحقق من تسجيل الدخول
  - `requireAdmin(callback)` - التحقق من صلاحيات الأدمن

#### ملف: `public/js/app.js`
- **الوظيفة**: دوال تسجيل الخروج والتعامل مع الجلسات
- **الخصائص الرئيسية**:
  - `logout()` - تسجيل الخروج وإعادة تحميل الصفحة
  - `secureLogout()` - تسجيل خروج آمن مع مسح جميع البيانات

### 2. الواجهة الخلفية (Backend)

#### ملف: `controllers/authController.js`
- **الوظائف الرئيسية**:
  1. **register(req, res)** - تسجيل مستخدم جديد
     - التحقق من rate limit
     - التحقق من عدم وجود مستخدم مماثل
     - تشفير كلمة المرور (bcrypt with 14 rounds)
     - إنشاء OTP للتحقق من البريد الإلكتروني
     - إرسال رمز التحقق عبر البريد الإلكتروني

  2. **verifyEmail(req, res)** - التحقق من البريد الإلكتروني
     - التحقق من OTP
     - تحديث حالة التحقق في قاعدة البيانات
     - إنشاء وإعداد ملفات تعريف الارتباط (cookies)

  3. **login(req, res)** - تسجيل الدخول
     - التحقق من عنوان IP المحظور
     - التحقق من rate limit
     - التحقق من账户 مؤقتاً
     - التحقق من كلمة المرور
     - التحقق من OTP (إذا كان مطلوباً)
     - تسجيل محاولات登录 الفاشلة

  4. **getCurrentUser(req, res)** - الحصول على معلومات المستخدم الحالي
  5. **updateProfile(req, res)** - تحديث الملف الشخصي
  6. **changePassword(req, res)** - تغيير كلمة المرور

#### ملف: `middleware/security.js`
- **الوظائف الرئيسية**:
  - `generateTokens(user)` - إنشاء access و refresh tokens
  - `verifyAccessToken(token)` - التحقق من access token
  - `verifyRefreshToken(token)` - التحقق من refresh token
  - `checkRateLimit(ip, action)` - التحقق من rate limit
  - `recordFailedLogin(email, ip)` - تسجيل محاولات الدخول الفاشلة
  - `isAccountLocked(email)` - التحقق من账户 مغلق
  - `authenticate(req, res, next)` - middleware للتحقق من تسجيل الدخول
  - `requireAdmin(req, res, next)` - middleware للتحقق من صلاحيات الأدمن

#### ملف: `routes/auth.js`
- **المسارات**:
  - `POST /api/auth/register` - تسجيل مستخدم جديد
  - `POST /api/auth/login` - تسجيل الدخول
  - `POST /api/auth/verify` - التحقق من البريد الإلكتروني
  - `POST /api/auth/resend-otp` - إعادة إرسال OTP
  - `GET /api/auth/me` - الحصول على المستخدم الحالي
  - `PUT /api/auth/profile` - تحديث الملف الشخصي
  - `PUT /api/auth/password` - تغيير كلمة المرور
  - `POST /api/auth/logout` - تسجيل الخروج
  - `POST /api/auth/refresh` - تجديد access token

---

## قاعدة البيانات

### الجداول الرئيسية:

#### 1. `users`
```sql
- id: INTEGER PRIMARY KEY
- username: TEXT UNIQUE
- email: TEXT UNIQUE
- phone: TEXT
- password: TEXT (hashed)
- role: TEXT (super_admin, admin, user_manager, moderator, user)
- permissions: TEXT (JSON array)
- is_verified: INTEGER (0 or 1)
- verification_token: TEXT
- created_at: DATETIME
- updated_at: DATETIME
```

#### 2. `email_otp`
```sql
- id: INTEGER PRIMARY KEY
- email: TEXT
- otp: TEXT (hashed)
- expires_at: DATETIME
- created_at: DATETIME
```

#### 3. `login_history`
```sql
- id: INTEGER PRIMARY KEY
- user_id: INTEGER (FK to users)
- email: TEXT
- ip_address: TEXT
- user_agent: TEXT
- success: INTEGER (0 or 1)
- created_at: DATETIME
```

#### 4. `blocked_ips`
```sql
- id: INTEGER PRIMARY KEY
- ip_address: TEXT UNIQUE
- reason: TEXT
- blocked_until: DATETIME
- created_at: DATETIME
```

---

## آليات الحماية

### 1. تشفير كلمات المرور
- استخدام bcrypt مع 14 rounds
- تشفير كلمات المرور عند التسجيل والتغيير

### 2. Rate Limiting
- تحديد عدد المحاولات لكل إجراء
- حظر عنوان IP بعد تجاوز الحد

### 3. Account Lockout
- حساب محاولات تسجيل الدخول الفاشلة
-账户 مؤقتاً بعد 5 محاولات فاشلة

### 4. JWT Tokens
- access token صالح لمدة 24 ساعة
- refresh token صالح لمدة 30 يوم
- تخزين في HTTP-only cookies

### 5. CSRF Protection
- توليد CSRF token لكل جلسة
- التحقق من token مع كل طلب يتطلب مصادقة

---

## العمليات المطلوبة

### تسجيل الدخول (Login):
1. المستخدم يدخل البريد الإلكتروني وكلمة المرور
2. السيرفر يتحقق من rate limit
3. التحقق من كلمة المرور
4. إنشاء JWT tokens
5. تخزين tokens في cookies
6. إرجاع بيانات المستخدم

### تسجيل الخروج (Logout):
1. مسح cookies (token, refreshToken)
2. تسجيل logout في history
3. إعادة تحميل الصفحة

### التحقق من البريد الإلكتروني:
1. المستخدم يسجل
2. السيرفر يرسل OTP للبريد الإلكتروني
3. المستخدم يدخل OTP
4. السيرفر يتحقق من OTP
5. تحديث is_verified = 1

### التحقق من الجلسة:
1. طلب GET /api/auth/me
2. middleware authenticate يتحقق من token
3. إرجاع بيانات المستخدم

---

## إرشادات الاستخدام

### في الواجهة الأمامية:

```javascript
// التحقق من حالة المصادقة
window.ElectronAuth.getState();

// الاستماع للتغييرات
window.ElectronAuth.onChange((state) => {
  console.log('User:', state.user);
  console.log('Authenticated:', state.isAuthenticated);
});

// التحقق من تسجيل الدخول المطلوب
window.ElectronAuth.requireAuth((state) => {
  // المستخدم مسجل الدخول
});

// التحقق من صلاحيات الأدمن
window.ElectronAuth.requireAdmin((state) => {
  // المستخدم هو أدمن
});

// تسجيل الخروج
window.ElectronAuth.logout();
```

### في الواجهة الخلفية:

```javascript
// التحقق من تسجيل الدخول
const { authenticate } = require('./middleware/auth');
router.get('/protected', authenticate, (req, res) => {
  // req.user يحتوي على بيانات المستخدم
});

// التحقق من صلاحيات الأدمن
const { requireAdmin } = require('./middleware/auth');
router.get('/admin', authenticate, requireAdmin, (req, res) => {
  // المستخدم هو أدمن
});
```

---

## ملاحظات أمنية

1. **لا تخزن tokens في localStorage** - استخدم cookies فقط
2. **يجب ضبط JWT_SECRET في بيئة الإنتاج**
3. **استخدم HTTPS في الإنتاج**
4. **راقب محاولات تسجيل الدخول الفاشلة**
5. **نفذ سياسة كلمات مرور قوية**