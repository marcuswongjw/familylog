const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'familylog-86db6.firebasestorage.app';
admin.initializeApp({
  storageBucket: STORAGE_BUCKET
});

// Parent-only extraction; no calendar/task side effects. Secrets never reach the PWA.
const { buildRequest, parseResponse } = require('./school-extraction');
const SCHOOL_PARENTS = ['marcuswongjw@gmail.com', 'eleanor.jiamin@gmail.com'];
exports.extractSchoolAnnouncement = functions.runWith({
  secrets: ['GEMINI_API_KEY'], timeoutSeconds: 60, memory: '512MB'
}).https.onCall(async (data, context) => {
  const email = String(context.auth?.token?.email || '').toLowerCase();
  if (!SCHOOL_PARENTS.includes(email)) throw new functions.https.HttpsError('permission-denied', 'Only parents can extract school messages.');
  const text = typeof data?.text === 'string' ? data.text.trim() : '';
  const path = typeof data?.imagePath === 'string' ? data.imagePath : '';
  if (text.length > 20000 || (!text && !path)) throw new functions.https.HttpsError('invalid-argument', 'Add a message or screenshot (up to 20,000 characters).');
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  if (!apiKey) throw new functions.https.HttpsError('failed-precondition', 'Gemini AI extraction is not configured. You can enter the plan manually.');
  if (!apiKey.startsWith('AIzaSy')) {
    console.error('Invalid GEMINI_API_KEY format. Google AI Studio keys start with AIzaSy.');
    throw new functions.https.HttpsError('failed-precondition', 'Invalid Gemini API key. Google AI Studio keys start with "AIzaSy". Generate one at https://aistudio.google.com/app/apikey and update the secret.');
  }
  if (path && !new RegExp('^school/' + email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/[a-f0-9]{64}$').test(path)) {
    throw new functions.https.HttpsError('permission-denied', 'Invalid screenshot owner.');
  }
  // Server-owned operational counter, not a second store for school records.
  const quota = admin.firestore().collection('schoolExtractionLimits').doc(context.auth.uid);
  await admin.firestore().runTransaction(async tx => {
    const old = (await tx.get(quota)).data() || {};
    const day = new Date().toISOString().slice(0, 10);
    const count = old.day === day ? old.count : 0;
    if (count >= 30) throw new functions.https.HttpsError('resource-exhausted', 'Daily extraction limit reached. You can still enter a plan manually.');
    tx.set(quota, { day, count: count + 1 });
  });
  try {
    let imageMime = '';
    let imageBase64 = '';
    if (path) {
      const file = admin.storage().bucket(STORAGE_BUCKET).file(path);
      const [metadata] = await file.getMetadata();
      if (Number(metadata.size) > 5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(metadata.contentType)) throw new Error('Use a PNG, JPEG or WebP under 5 MB.');
      const [bytes] = await file.download();
      if (require('crypto').createHash('sha256').update(bytes).digest('hex') !== path.split('/').pop()) throw new Error('Screenshot checksum mismatch.');
      imageMime = metadata.contentType;
      imageBase64 = bytes.toString('base64');
    }
    const model = process.env.SCHOOL_AI_MODEL || 'gemini-2.0-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(buildRequest(text, imageMime, imageBase64, model)),
      signal: AbortSignal.timeout(35000)
    });
    if (!response.ok) {
      const errSnippet = await response.text().catch(() => '');
      console.error('Gemini API HTTP error:', response.status, response.statusText, errSnippet.slice(0, 200));
      if (response.status === 401 || response.status === 403) {
        throw new functions.https.HttpsError('permission-denied', 'Gemini API authentication failed (' + response.status + '). Check your GEMINI_API_KEY.');
      }
      throw new functions.https.HttpsError('unavailable', 'Extraction service error (' + response.status + '). Try again or enter the plan manually.');
    }
    return parseResponse(await response.json());
  } catch (err) {
    if (err instanceof functions.https.HttpsError) throw err;
    console.error('extractSchoolAnnouncement failed:', err.name || 'Error', err.message || String(err));
    throw new functions.https.HttpsError('unavailable', 'Could not read this message. Try a clearer screenshot or enter the plan manually.');
  }
});

// Authenticated read avoids creating a public download-token URL for school images.
exports.getSchoolSourceImage = functions.runWith({ memory: '256MB' }).https.onCall(async (data, context) => {
  const email = String(context.auth?.token?.email || '').toLowerCase();
  if (!SCHOOL_PARENTS.includes(email)) throw new functions.https.HttpsError('permission-denied', 'Parents only.');
  const path = typeof data?.path === 'string' ? data.path : '';
  if (!/^school\/(marcuswongjw@gmail\.com|eleanor\.jiamin@gmail\.com)\/[a-f0-9]{64}$/.test(path)) throw new functions.https.HttpsError('invalid-argument', 'Invalid image path.');
  const file = admin.storage().bucket(STORAGE_BUCKET).file(path);
  const [meta] = await file.getMetadata();
  if (Number(meta.size) >= 5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(meta.contentType)) throw new functions.https.HttpsError('invalid-argument', 'Invalid image.');
  const [bytes] = await file.download();
  return { image: 'data:' + meta.contentType + ';base64,' + bytes.toString('base64') };
});
