import webpush from 'web-push';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const PROJECT = process.env.VITE_FIREBASE_PROJECT_ID;
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const { payload } = await jwtVerify(token, JWKS, { issuer: `https://securetoken.google.com/${PROJECT}`, audience: PROJECT });
    const allowed = (process.env.ALLOWED_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes((payload.email || '').toLowerCase())) return res.status(403).json({ error: 'Not allowed' });

    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', process.env.VITE_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const { subs = [], title = 'P&V', body = '' } = req.body || {};
    const dead = [];
    await Promise.all(subs.slice(0, 10).map(async s => {
      try { await webpush.sendNotification(s.sub, JSON.stringify({ title, body })); }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.id); }
    }));
    res.status(200).json({ ok: true, dead });
  } catch (e) { res.status(401).json({ error: e.message }); }
}
