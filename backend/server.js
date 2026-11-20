require('dotenv').config();
const express = require('express'), cors = require('cors'), multer = require('multer'), admin = require('firebase-admin');
const { randomUUID } = require('crypto');

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});
const db = admin.firestore(), bucket = admin.storage().bucket();
const allowed = (process.env.ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || true }));
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// Verifies the Firebase ID token sent as "Authorization: Bearer <token>"
async function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const user = await admin.auth().verifyIdToken(token);
    if (allowed.length && !allowed.includes((user.email || '').toLowerCase()))
      return res.status(403).json({ error: 'This space is private to Prince & Victory.' });
    req.user = user; next();
  } catch { res.status(401).json({ error: 'Please sign in again.' }); }
}

const col = db.collection('memories');

app.get('/api/health', (_, res) => res.json({ ok: true, app: 'P&V' }));

// Save profile after sign-up
app.post('/api/profile', auth, async (req, res) => {
  await db.collection('users').doc(req.user.uid).set(
    { name: req.body.name || '', email: req.user.email, createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  res.json({ ok: true });
});

// List memories (shared by both of you)
app.get('/api/memories', auth, async (req, res) => {
  const snap = await col.orderBy('createdAt', 'desc').get();
  res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
});

// Upload photos/videos: multipart field "files" + title, date, note
app.post('/api/memories', auth, upload.array('files', 20), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'Choose at least one file.' });
  const out = [];
  for (const f of req.files) {
    const path = `memories/${randomUUID()}-${f.originalname.replace(/[^\w.-]/g, '_')}`;
    const file = bucket.file(path);
    await file.save(f.buffer, { contentType: f.mimetype });
    const [url] = await file.getSignedUrl({ action: 'read', expires: '01-01-2100' });
    const doc = {
      url, path, type: f.mimetype.startsWith('video') ? 'video' : 'photo',
      title: req.body.title || 'New memory', date: req.body.date || '', note: req.body.note || '',
      favorite: false, by: req.user.uid, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await col.add(doc); out.push({ id: ref.id, ...doc });
  }
  res.status(201).json(out);
});

// Edit title / note / favourite
app.patch('/api/memories/:id', auth, async (req, res) => {
  const { title, note, date, favorite } = req.body;
  const upd = Object.fromEntries(Object.entries({ title, note, date, favorite }).filter(([, v]) => v !== undefined));
  await col.doc(req.params.id).update(upd); res.json({ ok: true });
});

// Delete memory and its file
app.delete('/api/memories/:id', auth, async (req, res) => {
  const ref = col.doc(req.params.id), snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'Memory not found.' });
  await bucket.file(snap.data().path).delete({ ignoreNotFound: true });
  await ref.delete(); res.json({ ok: true });
});

app.listen(process.env.PORT || 5000, () => console.log('P&V backend running'));
