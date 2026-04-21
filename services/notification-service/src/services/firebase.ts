import admin from 'firebase-admin';
import config from '../config/index';

let initialized = false;

export function initFirebase(): void {
  if (initialized) return;
  if (!config.FIREBASE_PROJECT_ID || !config.FIREBASE_CLIENT_EMAIL || !config.FIREBASE_PRIVATE_KEY) {
    console.warn('[FCM] Firebase credentials not set — push notifications disabled');
    return;
  }
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.FIREBASE_PROJECT_ID,
      clientEmail: config.FIREBASE_CLIENT_EMAIL,
      privateKey: config.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
  initialized = true;
  console.info('[FCM] Firebase initialized');
}

export async function sendPush(params: {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void> {
  if (!initialized) return;
  try {
    await admin.messaging().send({
      token: params.token,
      notification: { title: params.title, body: params.body },
      data: params.data ?? {},
      android: { priority: 'high' },
      apns: { headers: { 'apns-priority': '10' } },
    });
  } catch (err) {
    // Invalid/expired token — don't throw, just log
    console.error('[FCM] sendPush error:', err instanceof Error ? err.message : err);
  }
}
