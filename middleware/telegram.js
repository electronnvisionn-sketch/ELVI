/**
 * ELECTRON VISION - Telegram Notification Module
 * Simple notification system for sending alerts to admin Telegram
 */

const TelegramBot = require('node-telegram-bot-api');

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;

let bot = null;
if (telegramToken) {
  try {
    bot = new TelegramBot(telegramToken, { polling: false });
    console.log('[TELEGRAM] Bot initialized for notifications');
  } catch (e) {
    console.log('[TELEGRAM] Initialization failed:', e.message);
  }
}

const lastBotMessageId = new Map();

async function sendMessageWithDelete(chatId, text, options = {}) {
  if (!bot) {
    console.error('[TELEGRAM] Bot not initialized');
    return null;
  }
  
  const prevMsgId = lastBotMessageId.get(chatId);
  if (prevMsgId) {
    try {
      await bot.deleteMessage(chatId, prevMsgId);
    } catch (e) {}
  }
  
  const sentMsg = await bot.sendMessage(chatId, text, options);
  lastBotMessageId.set(chatId, sentMsg.message_id);
  return sentMsg;
}

async function sendToAdmin(message, parseMode = 'HTML') {
  if (bot && adminChatId) {
    try {
      await sendMessageWithDelete(adminChatId, message, { parse_mode: parseMode });
    } catch (e) {
      console.error('[TELEGRAM] Send to admin failed:', e.message);
    }
  }
}

async function sendToGroup(message, parseMode = 'HTML') {
  if (bot && groupChatId) {
    try {
      await sendMessageWithDelete(groupChatId, message, { parse_mode: parseMode });
    } catch (e) {
      console.error('[TELEGRAM] Send to group failed:', e.message);
    }
  }
}

async function notifyNewTicket(ticket, username) {
  if (!bot) return;
  
  let message = '🎫 <b>تذكرة دعم جديدة</b>\n\n';
  message += '🆔 #' + ticket.id + '\n';
  message += '📋 <b>العنوان:</b> ' + ticket.title + '\n';
  message += '👤 <b>المستخدم:</b> ' + username + '\n';
  const priorityMap = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية', critical: 'حرجة' };
  message += '🎯 <b>الأولوية:</b> ' + (priorityMap[ticket.priority] || ticket.priority) + '\n';
  message += '📝 <b>الوصف:</b>\n' + (ticket.description || '-').substring(0, 200) + '\n';
  message += '📊 <b>الحالة:</b> بانتظار الموافقة';
  
  await sendToAdmin(message);
}

async function notifyTicketApproved(ticket, username, adminName) {
  if (!bot) return;
  
  let message = '✅ <b>تمت الموافقة على التذكرة</b>\n\n';
  message += '🆔 #' + ticket.id + '\n';
  message += '📋 <b>العنوان:</b> ' + ticket.title + '\n';
  message += '👤 <b>المستخدم:</b> ' + username + '\n';
  message += '👮 <b>الموافق:</b> ' + adminName + '\n';
  message += '🕐 <b>الوقت:</b> ' + new Date().toLocaleString('ar-SA');
  
  await sendToAdmin(message);
}

async function notifyTicketRejected(ticket, username, adminName, reason) {
  if (!bot) return;
  
  let message = '❌ <b>تم رفض التذكرة</b>\n\n';
  message += '🆔 #' + ticket.id + '\n';
  message += '📋 <b>العنوان:</b> ' + ticket.title + '\n';
  message += '👤 <b>المستخدم:</b> ' + username + '\n';
  message += '👮 <b>المرفوض من:</b> ' + adminName + '\n';
  message += '📝 <b>السبب:</b> ' + (reason || 'بدون سبب') + '\n';
  message += '🕐 <b>الوقت:</b> ' + new Date().toLocaleString('ar-SA');
  
  await sendToAdmin(message);
}

async function notifyTicketStatusChange(ticket, newStatus) {
  if (!bot) return;
  
  let message = '🔄 <b>تحديث حالة التذكرة</b>\n\n';
  message += '🆔 #' + ticket.id + '\n';
  message += '📋 <b>العنوان:</b> ' + ticket.title + '\n';
  message += '📊 <b>الحالة الجديدة:</b> ' + newStatus + '\n';
  message += '🕐 <b>الوقت:</b> ' + new Date().toLocaleString('ar-SA');
  
  await sendToAdmin(message);
}

async function notifyNewPayment(data) {
  if (!bot) return;
  
  let message = '💳 <b>طلب دفع جديد</b>\n\n';
  message += '🆔 <b>الجلسة:</b> ' + data.sessionId + '\n';
  message += '📦 <b>المنتج:</b> ' + data.productName + '\n';
  message += '💵 <b>المبلغ:</b> ' + data.amount + '$\n';
  message += '📧 <b>البريد:</b> ' + data.userEmail + '\n';
  message += '🕐 <b>الوقت:</b> ' + new Date().toLocaleString('ar-SA');
  
  await sendToAdmin(message);
}

async function notifyPaymentSuccess(session) {
  if (!bot) return;
  
  let message = '✅ <b>تم الدفع بنجاح</b>\n\n';
  message += '🆔 <b>الجلسة:</b> ' + session.id + '\n';
  message += '💵 <b>المبلغ:</b> ' + (session.amount_total / 100) + '$\n';
  message += '📧 <b>البريد:</b> ' + (session.customer_email || '-') + '\n';
  message += '🕐 <b>الوقت:</b> ' + new Date().toLocaleString('ar-SA');
  
  await sendToAdmin(message);
  
  if (groupChatId) {
    await sendToGroup(message);
  }
}

async function notifyPaymentFailed(session) {
  if (!bot) return;
  
  let message = '❌ <b>فشل الدفع</b>\n\n';
  message += '🆔 <b>الجلسة:</b> ' + session.id + '\n';
  message += '💵 <b>المبلغ:</b> ' + (session.amount_total / 100) + '$\n';
  message += '📧 <b>البريد:</b> ' + (session.customer_email || '-') + '\n';
  message += '🕐 <b>الوقت:</b> ' + new Date().toLocaleString('ar-SA');
  
  await sendToAdmin(message);
}

async function notifyNewMessage(data) {
  if (!bot) return;
  
  let message = '💬 <b>رسالة جديدة</b>\n\n';
  
  if (data.type === 'ticket') {
    message += '🎫 <b>تذكرة:</b> #' + data.ticketId + '\n';
    message += '👤 <b>من:</b> ' + data.userName + '\n';
    message += '📝 <b>الرسالة:</b>\n' + (data.message || '').substring(0, 200) + '\n';
  }
  
  await sendToAdmin(message);
}

async function notifyNewBooking(booking) {
  if (!bot) return;
  
  let message = '📅 <b>حجز جديد</b>\n\n';
  message += '🆔 #' + booking.id + '\n';
  message += '👤 <b>العميل:</b> ' + (booking.customer_name || '-') + '\n';
  message += '📞 <b>الهاتف:</b> ' + (booking.customer_phone || '-') + '\n';
  message += '🛠 <b>الخدمة:</b> ' + (booking.service_name || '-') + '\n';
  message += '📅 <b>التاريخ:</b> ' + (booking.booking_date || '-') + '\n';
  message += '🕐 <b>الوقت:</b> ' + (booking.booking_time || '-') + '\n';
  message += '📊 <b>الحالة:</b> بانتظار التأكيد';
  
  await sendToAdmin(message);
}

async function notifyBookingConfirmed(booking) {
  if (!bot) return;
  
  let message = '✅ <b>تأكيد الحجز</b>\n\n';
  message += '🆔 #' + booking.id + '\n';
  message += '👤 <b>العميل:</b> ' + (booking.customer_name || '-') + '\n';
  message += '🛠 <b>الخدمة:</b> ' + (booking.service_name || '-') + '\n';
  message += '📅 <b>التاريخ:</b> ' + (booking.booking_date || '-') + '\n';
  message += '🕐 <b>الوقت:</b> ' + (booking.booking_time || '-') + '\n';
  
  await sendToAdmin(message);
}

async function notifyBookingCancelled(booking) {
  if (!bot) return;
  
  let message = '❌ <b>إلغاء الحجز</b>\n\n';
  message += '🆔 #' + booking.id + '\n';
  message += '👤 <b>العميل:</b> ' + (booking.customer_name || '-') + '\n';
  message += '🛠 <b>الخدمة:</b> ' + (booking.service_name || '-') + '\n';
  message += '📅 <b>التاريخ:</b> ' + (booking.booking_date || '-') + '\n';
  
  await sendToAdmin(message);
}

module.exports = {
  bot,
  sendToAdmin,
  sendToGroup,
  notifyNewTicket,
  notifyTicketApproved,
  notifyTicketRejected,
  notifyTicketStatusChange,
  notifyNewPayment,
  notifyPaymentSuccess,
  notifyPaymentFailed,
  notifyNewMessage,
  notifyNewBooking,
  notifyBookingConfirmed,
  notifyBookingCancelled
};
