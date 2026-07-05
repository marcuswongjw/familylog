const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Trigger when a new chat message is created
exports.sendChatNotification = functions.firestore
  .document('chat/{messageId}')
  .onCreate(async (snap, context) => {
    const message = snap.data();
    const sender = message.user; // e.g., "Marcus"
    const text = message.message || '📷 Image';
    const imageUrl = message.imageUrl || '';

    // 1. Get all FCM tokens of other family members
    const usersSnapshot = await admin.firestore().collection('users').get();
    const tokens = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.email !== sender && userData.fcmTokens) {
        tokens.push(...userData.fcmTokens);
      }
    });

    if (tokens.length === 0) {
      console.log('No tokens to send to.');
      return;
    }

    // 2. Build the notification payload
    const payload = {
      notification: {
        title: `💬 New message from ${sender}`,
        body: text,
        image: imageUrl || undefined,
      },
      data: {
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        screen: 'chat',
      },
    };

    // 3. Send to all tokens
    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: tokens,
        ...payload,
      });
      console.log('Successfully sent messages:', response);
    } catch (error) {
      console.error('Error sending notifications:', error);
    }
  });