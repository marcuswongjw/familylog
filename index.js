const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Trigger when a new chat message is created
exports.sendChatNotification = functions.firestore
  .document('chat/{messageId}')
  .onCreate(async (snap, context) => {
    const message = snap.data();
    const senderName = message.user || 'Someone';
    // Prefer explicit senderEmail; fall back to doc id pattern is not used —
    // must compare email-to-email (users collection is keyed by email).
    const senderEmail = String(message.senderEmail || '').toLowerCase().trim();
    const text = message.message || '📷 Image';
    const imageUrl = message.imageUrl || '';

    // 1. Get all FCM tokens of other family members
    const usersSnapshot = await admin.firestore().collection('users').get();
    const tokens = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      const memberEmail = String(userData.email || doc.id || '').toLowerCase().trim();
      // Skip the sender (email match). If senderEmail is missing, still notify
      // everyone except when name matches stored name (legacy messages).
      const isSender = senderEmail
        ? memberEmail === senderEmail
        : (userData.name && userData.name === senderName);
      if (!isSender && userData.fcmTokens && userData.fcmTokens.length) {
        tokens.push(...userData.fcmTokens);
      }
    });

    // Deduplicate tokens
    const uniqueTokens = [...new Set(tokens.filter(Boolean))];

    if (uniqueTokens.length === 0) {
      console.log('No tokens to send to.');
      return null;
    }

    // 2. Build the notification payload
    const payload = {
      notification: {
        title: `💬 New message from ${senderName}`,
        body: text.length > 120 ? text.slice(0, 117) + '…' : text,
        ...(imageUrl ? { image: imageUrl } : {}),
      },
      data: {
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        screen: 'chat',
      },
    };

    // 3. Send to all tokens
    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: uniqueTokens,
        ...payload,
      });
      console.log('Successfully sent messages:', response.successCount, 'ok /', response.failureCount, 'failed');
      return response;
    } catch (error) {
      console.error('Error sending notifications:', error);
      return null;
    }
  });
