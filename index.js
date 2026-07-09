const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Public PWA URL (GitHub Pages). Used as the notification click target.
const APP_URL = process.env.FAMILYLOG_APP_URL || 'https://marcuswongjw.github.io/familylog/';

function chatDeepLink() {
  // Query + hash: iOS PWAs sometimes drop hash on open; Android handles both.
  const base = APP_URL.replace(/\/?$/, '/');
  return base + '?open=chat#chat';
}

// Trigger when a new chat message is created
exports.sendChatNotification = functions.firestore
  .document('chat/{messageId}')
  .onCreate(async (snap, context) => {
    const message = snap.data();
    const senderName = message.user || 'Someone';
    const senderEmail = String(message.senderEmail || '').toLowerCase().trim();
    const text = message.message || '📷 Image';
    const imageUrl = message.imageUrl || '';
    const title = `💬 New message from ${senderName}`;
    const body = text.length > 120 ? text.slice(0, 117) + '…' : text;
    const chatLink = chatDeepLink();

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

    const uniqueTokens = [...new Set(tokens.filter(Boolean))];

    if (uniqueTokens.length === 0) {
      console.log('No tokens to send to.');
      return null;
    }

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
          open: 'chat',
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
          headers: {
            Urgency: 'high',
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
      // Drop dead tokens so lists stay healthy
      if (response.responses) {
        const toRemove = [];
        response.responses.forEach((r, i) => {
          if (!r.success && r.error) {
            const code = r.error.code || '';
            if (
              code.includes('registration-token-not-registered')
              || code.includes('invalid-registration-token')
              || code.includes('invalid-argument')
            ) {
              toRemove.push(uniqueTokens[i]);
            }
          }
        });
        if (toRemove.length) {
          console.log('Pruning invalid FCM tokens:', toRemove.length);
          const batch = admin.firestore().batch();
          usersSnapshot.forEach(doc => {
            const toks = (doc.data().fcmTokens || []).filter(t => !toRemove.includes(t));
            if (toks.length !== (doc.data().fcmTokens || []).length) {
              batch.update(doc.ref, { fcmTokens: toks });
            }
          });
          await batch.commit().catch(e => console.warn('Token prune failed', e));
        }
      }
      return response;
    } catch (error) {
      console.error('Error sending notifications:', error);
      return null;
    }
  });
