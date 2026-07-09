const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Public PWA URL (GitHub Pages). Used as the notification click target.
const APP_URL = process.env.FAMILYLOG_APP_URL || 'https://marcuswongjw.github.io/familylog/';

// Trigger when a new chat message is created
exports.sendChatNotification = functions.firestore
  .document('chat/{messageId}')
  .onCreate(async (snap, context) => {
    const message = snap.data();
    const senderName = message.user || 'Someone';
    // Prefer explicit senderEmail — must compare email-to-email
    // (users collection is keyed by email).
    const senderEmail = String(message.senderEmail || '').toLowerCase().trim();
    const text = message.message || '📷 Image';
    const imageUrl = message.imageUrl || '';
    const title = `💬 New message from ${senderName}`;
    const body = text.length > 120 ? text.slice(0, 117) + '…' : text;
    const chatLink = APP_URL.replace(/\/?$/, '/') + '#chat';

    // 1. Get all FCM tokens of other family members
    const usersSnapshot = await admin.firestore().collection('users').get();
    const tokens = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      const memberEmail = String(userData.email || doc.id || '').toLowerCase().trim();
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

    // 2. Build web-friendly payload
    // - data.screen is read by the service worker notificationclick handler
    // - webpush.fcmOptions.link helps browsers that open the default FCM UI
    // All data values must be strings for FCM.
    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: uniqueTokens,
        notification: {
          title,
          body,
          ...(imageUrl ? { imageUrl } : {}),
        },
        data: {
          screen: 'chat',
          url: chatLink,
          title,
          body,
        },
        webpush: {
          fcmOptions: {
            link: chatLink,
          },
          notification: {
            icon: APP_URL.replace(/\/?$/, '/') + 'favicon.png',
            badge: APP_URL.replace(/\/?$/, '/') + 'favicon.png',
            tag: 'familylog-chat',
          },
        },
      });
      console.log(
        'Successfully sent messages:',
        response.successCount,
        'ok /',
        response.failureCount,
        'failed'
      );
      return response;
    } catch (error) {
      console.error('Error sending notifications:', error);
      return null;
    }
  });
