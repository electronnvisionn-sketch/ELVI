/**
 * ELECTRON VISION - Input Validation Middleware
 */

const xss = require('xss');
const sanitizeHtml = require('sanitize-html');

// Sanitize input to prevent XSS
function sanitizeInput(req, res, next) {
  const sanitize = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = xss(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitize(obj[key]);
      }
    }
  };
  
  if (req.body) sanitize(req.body);
  if (req.query) sanitize(req.query);
  if (req.params) sanitize(req.params);
  
  next();
}

// Validate registration input
function validateRegistration(req, res, next) {
  const { username, email, password } = req.body;
  
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
  }
  
  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'اسم المستخدم يجب أن يكون بين 3 و 30 حرف' });
  }
  
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'اسم المستخدم يمكن أن يحتوي على أحرف وأرقام وشرطات سفلية فقط' });
  }
  
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'بريد إلكتروني غير صالح' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
  }
  
  next();
}

// Validate login input
function validateLogin(req, res, next) {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
  }
  
  next();
}

// Validate product input
function validateProduct(req, res, next) {
  const { name, name_ar, price } = req.body;
  
  if (!name || !name_ar) {
    return res.status(400).json({ error: 'اسم المنتج مطلوب' });
  }
  
  if (price !== undefined && isNaN(parseFloat(price))) {
    return res.status(400).json({ error: 'السعر يجب أن يكون رقماً' });
  }
  
  next();
}

// Validate ticket input
function validateTicket(req, res, next) {
  const { title, description, priority } = req.body;
  
  if (!title || !description) {
    return res.status(400).json({ error: 'عنوان المشكلة والوصف مطلوبان' });
  }
  
  if (title.length < 5 || title.length > 200) {
    return res.status(400).json({ error: 'عنوان المشكلة يجب أن يكون بين 5 و 200 حرف' });
  }
  
  if (description.length < 10) {
    return res.status(400).json({ error: 'الوصف يجب أن يكون 10 أحرف على الأقل' });
  }
  
  const validPriorities = ['low', 'medium', 'high', 'critical'];
  if (priority && !validPriorities.includes(priority)) {
    return res.status(400).json({ error: 'مستوى خطورة غير صالح' });
  }
  
  next();
}

// Validate contact message input
function validateContact(req, res, next) {
  const { name, email, message } = req.body;
  
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
  }
  
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'بريد إلكتروني غير صالح' });
  }
  
  if (message.length < 10) {
    return res.status(400).json({ error: 'الرسالة يجب أن تكون 10 أحرف على الأقل' });
  }
  
  next();
}

// Validate service input
function validateService(req, res, next) {
  const { name, name_ar } = req.body;
  
  if (!name || !name_ar) {
    return res.status(400).json({ error: 'اسم الخدمة مطلوب' });
  }
  
  next();
}

module.exports = {
  sanitizeInput,
  validateRegistration,
  validateLogin,
  validateProduct,
  validateTicket,
  validateContact,
  validateService
};
