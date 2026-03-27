/**
 * ELECTRON VISION - Email Helper
 * Nodemailer configuration for sending OTP emails
 */

const nodemailer = require('nodemailer');
const path = require('path');

// Create transporter based on environment
let transporter;

function createTransporter() {
  // support both MAIL_USER/PASS and SMTP_USER/PASS as env names
  const mailUser = process.env.MAIL_USER || process.env.SMTP_USER;
  const mailPass = process.env.MAIL_PASS || process.env.SMTP_PASSWORD;
  
  // If credentials are available, try to build a transporter
  if (mailUser && mailPass) {
    // special-case Gmail when using the default host/port
    if ((process.env.SMTP_HOST || '').includes('gmail.com') || process.env.SERVICE === 'gmail') {
      return nodemailer.createTransport({
        service: 'gmail',
        auth: { user: mailUser, pass: mailPass }
      });
    }

    // generic SMTP configuration
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: mailUser, pass: mailPass }
    });
  }

  // no credentials available
  return null;
}

// Initialize transporter
try {
  transporter = createTransporter();
  console.log('✓ Email transporter configured');
} catch (error) {
  console.error('✗ Email transporter configuration failed:', error.message);
  transporter = null;
}

/**
 * Send OTP email
 * @param {string} email - Recipient email
 * @param {string} otp - OTP code
 * @param {string} type - Type of email (verification, login, reset)
 */
async function sendOTPEmail(email, otp, type = 'verification') {
  if (!transporter) {
    console.error('Email transporter not configured');
    return false;
  }
  
  const subject = type === 'login' 
    ? 'رمز التحقق لتسجيل الدخول - ELECTRON VISION'
    : 'رمز التحقق من البريد الإلكتروني - ELECTRON VISION';
  
  const message = type === 'login'
    ? `مرحباً بك في ELECTRON VISION!\n\nرمز التحقق لتسجيل الدخول الخاص بك هو: ${otp}\n\nملاحظة: هذا الرمز صالح لمدة 15 دقيقة فقط.`
    : `مرحباً بك في ELECTRON VISION!\n\nرمز التحقق من البريد الإلكتروني هو: ${otp}\n\nملاحظة: هذا الرمز صالح لمدة 15 دقيقة فقط.\n\nإذا لم تطلب هذا الرمز، يرجى تجاهله.`;
  
  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_USER || 'ELECTRON VISION',
      to: email,
      subject: subject,
      text: message,
      html: `
        <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; padding: 20px; background: #1a1a2e; color: #fff;">
          <div style="max-width: 600px; margin: 0 auto; background: #16213e; padding: 30px; border-radius: 10px;">
            <h2 style="color: #00d4ff;">ELECTRON VISION</h2>
            <p>مرحباً بك!</p>
            <p>${type === 'login' ? 'رمز التحقق لتسجيل الدخول' : 'رمز التحقق من البريد الإلكتروني'}:</p>
            <div style="background: #0f3460; padding: 15px; border-radius: 5px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
              ${otp}
            </div>
            <p style="color: #a1a1aa; font-size: 14px;">ملاحظة: هذا الرمز صالح لمدة 15 دقيقة فقط.</p>
            <p style="color: #a1a1aa; font-size: 14px;">إذا لم تطلب هذا الرمز، يرجى تجاهله.</p>
          </div>
        </div>
      `
    });
    
    console.log(`[Email] OTP sent to ${email}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send OTP:', error.message);
    return false;
  }
}

/**
 * Send welcome email
 */
async function sendWelcomeEmail(email, username) {
  if (!transporter) {
    return false;
  }
  
  try {
    await transporter.sendMail({
      from: process.env.MAIL_USER || 'ELECTRON VISION',
      to: email,
      subject: 'مرحباً بك في ELECTRON VISION!',
      text: `مرحباً ${username}!\n\nشكراً للتسجيل في ELECTRON VISION.\n\nنحن متحمسون لوجودك معنا!`,
      html: `
        <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; padding: 20px; background: #1a1a2e; color: #fff;">
          <div style="max-width: 600px; margin: 0 auto; background: #16213e; padding: 30px; border-radius: 10px;">
            <h2 style="color: #00d4ff;">ELECTRON VISION</h2>
            <p>مرحباً ${username}!</p>
            <p>شكراً للتسجيل في ELECTRON VISION.</p>
            <p>نحن متحمسون لوجودك معنا!</p>
          </div>
        </div>
      `
    });
    return true;
  } catch (error) {
    console.error('[Email] Failed to send welcome email:', error.message);
    return false;
  }
}

/**
 * Send password reset email
 */
async function sendResetPasswordEmail(email, resetToken) {
  if (!transporter) {
    console.error('Email transporter not configured');
    return false;
  }
  
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
  
  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_USER || 'ELECTRON VISION',
      to: email,
      subject: 'إعادة تعيين كلمة المرور - ELECTRON VISION',
      text: `مرحباً!\n\nلقد طلبت إعادة تعيين كلمة المرور الخاصة بك.\n\nانقر على الرابط التالي لإعادة تعيين كلمة المرور:\n${resetUrl}\n\nملاحظة: هذا الرابط صالح لمدة ساعة واحدة فقط.\n\nإذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذا البريد.`,
      html: `
        <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; padding: 20px; background: #1a1a2e; color: #fff;">
          <div style="max-width: 600px; margin: 0 auto; background: #16213e; padding: 30px; border-radius: 10px;">
            <h2 style="color: #00d4ff;">ELECTRON VISION</h2>
            <p>مرحباً!</p>
            <p>لقد طلبت إعادة تعيين كلمة المرور الخاصة بك.</p>
            <p>انقر على الزر التالي لإعادة تعيين كلمة المرور:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="display: inline-block; background: #6366f1; color: #fff; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: bold;">إعادة تعيين كلمة المرور</a>
            </div>
            <p style="color: #a1a1aa; font-size: 14px;">أو انسخ الرابط التالي في المتصفح:</p>
            <p style="color: #00d4ff; font-size: 12px; word-break: break-all;">${resetUrl}</p>
            <p style="color: #a1a1aa; font-size: 14px; margin-top: 20px;">ملاحظة: هذا الرابط صالح لمدة ساعة واحدة فقط.</p>
            <p style="color: #a1a1aa; font-size: 14px;">إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذا البريد.</p>
          </div>
        </div>
      `
    });
    
    console.log(`[Email] Reset password email sent to ${email}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send reset password email:', error.message);
    return false;
  }
}

/**
 * Send generic email
 */
async function sendEmail(to, subject, htmlContent) {
  if (!transporter) {
    console.error('Email transporter not configured');
    return false;
  }
  
  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_USER || 'ELECTRON VISION',
      to: to,
      subject: subject,
      html: htmlContent
    });
    
    console.log(`[Email] Email sent to ${to}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send email:', error.message);
    return false;
  }
}

module.exports = {
  sendOTPEmail,
  sendWelcomeEmail,
  sendEmail,
  sendResetPasswordEmail
};
