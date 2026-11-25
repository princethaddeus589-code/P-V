import './icons.js';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { initializeFirestore, collection, addDoc, onSnapshot, query, orderBy, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

const E = import.meta.env;
const fb = initializeApp({
  apiKey: E.VITE_FIREBASE_API_KEY, authDomain: E.VITE_FIREBASE_AUTH_DOMAIN, projectId: E.VITE_FIREBASE_PROJECT_ID,
  storageBucket: E.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: E.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: E.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(fb), db = initializeFirestore(fb, { experimentalForceLongPolling: true });
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('Could not reach the database. In Firebase, check that Firestore Database is created and the rules are published.')), ms))]);
const SB = (E.VITE_SUPABASE_URL || '').replace(/\/$/, ''), KEY = E.VITE_SUPABASE_ANON_KEY, BUCKET = 'memories';
const sbHeaders = { apikey: KEY, ...(KEY?.startsWith('eyJ') ? { Authorization: 'Bearer ' + KEY } : {}) };

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

/* ---------- bottom bar like WhatsApp (injected, no index.html change needed) ---------- */
const st = document.createElement('style');
st.textContent = `
.top .wrap{justify-content:center!important}
.top .wrap>div{display:none!important}
.banner{padding:20px!important;gap:14px!important}
.banner img{width:64px!important;height:64px!important;flex:none}
.banner>div{min-width:0}
.banner .big{font-size:clamp(34px,10vw,48px)!important;white-space:nowrap}
.grid{padding-bottom:130px!important}
.dock{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:99px;padding:8px 14px;box-shadow:0 14px 40px -10px #000a;z-index:6}
.dock .it{background:none;border:0;display:grid;justify-items:center;gap:2px;font-size:11px;color:var(--mut);padding:6px 16px;cursor:pointer;border-radius:99px}
.dock .it svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.dock .plus{width:64px;height:64px;margin:-30px 6px 0;border-radius:50%;border:0;background:linear-gradient(135deg,var(--rose),var(--wine));color:#fff;font-size:38px;line-height:1;cursor:pointer;box-shadow:0 12px 30px -6px var(--wine)}
.dock .plus:active{scale:.94}
.m .del{position:absolute;top:8px;left:8px;background:#0007;color:#fff;border:0;border-radius:50%;width:34px;height:34px;cursor:pointer;font-size:15px}`;
document.head.append(st);
if (!$('.dock')) {
  const nav = document.createElement('nav'); nav.className = 'dock';
  nav.innerHTML = `<button class="it" data-act="top"><svg viewBox="0 0 24 24"><path d="M12 21s-8-5.5-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.5-8 11-8 11z"/></svg>Memories</button>
<button class="plus" data-act="add" aria-label="Add memory">+</button>
<button class="it" data-act="out"><svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>Sign out</button>`;
  $('#app').append(nav);
}
$('#add')?.setAttribute('data-act', 'add'); $('#out')?.setAttribute('data-act', 'out');

/* ---------- data ---------- */
let hiddenIds = []; // starter photos deleted by either of you (shared through Firestore)

const base = [
  ['/1.jpg', 'Golden hour', 'Together'], ['/0.jpg', 'That smile', 'Together'], ['/2.jpg', 'Hand in hand', 'Always'],
  ['/3.jpg', 'Brick wall bliss', 'Our favourite spot'], ['/4.jpg', 'Classic and cool', 'Together'],
  ['/5.jpg', 'Sunshine selfie', 'Together'], ['/6.jpg', 'Walk with me', 'Together'],
].map(([s, n, d], i) => ({ id: 'b' + i, t: 'photo', s, n, d, note: '', fav: i < 2, builtin: true }));

let cloud = [], filt = 'all', mode = 'in', unsub = null, loadErr = '', pending = false;
const show = id => { $$('.view').forEach(v => v.classList.toggle('on', v.id === id)); scrollTo(0, 0); };
const say = (el, t) => $(el).textContent = t;
const nice = e => ({
  'auth/invalid-credential': 'Email or password is incorrect.', 'auth/email-already-in-use': 'That email already has an account. Try signing in.',
  'auth/weak-password': 'Password needs at least 6 characters.', 'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
  'permission-denied': 'Blocked by Firestore rules. Check your email is in firestore.rules and the rules are published.',
}[e.code] || e.message || `Could not save (${e.code || 'unknown'}).`);

$$('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
[['#fl', 16], ['#fl2', 12]].forEach(([s, n]) => { for (let i = 0; i < n; i++) { const e = document.createElement('i'); e.textContent = '♥'; e.style.cssText = `left:${Math.random() * 100}%;font-size:${12 + Math.random() * 22}px;animation-duration:${9 + Math.random() * 10}s;animation-delay:${-Math.random() * 12}s`; $(s).append(e); } });

$$('.tabs button').forEach(b => b.onclick = () => {
  mode = b.dataset.t; $$('.tabs button').forEach(x => x.classList.toggle('on', x === b)); const up = mode === 'up';
  $('#nm').style.display = up ? 'block' : 'none'; $('#sub').textContent = up ? 'Create account' : 'Sign in';
  $('#at').textContent = up ? 'Start our keepsake' : 'Welcome back, love'; say('#er', '');
});
$('#sub').onclick = async () => {
  const e = $('#em').value.trim(), p = $('#pw').value, n = $('#nm').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(e)) return say('#er', 'Enter a valid email address.');
  if (p.length < 6) return say('#er', 'Password needs at least 6 characters.');
  if (mode === 'up' && !n) return say('#er', 'Add your name to continue.');
  $('#sub').disabled = true; say('#er', '');
  try {
    if (mode === 'up') { const { user } = await createUserWithEmailAndPassword(auth, e, p); await updateProfile(user, { displayName: n }); }
    else await signInWithEmailAndPassword(auth, e, p);
  } catch (x) { say('#er', nice(x)); }
  $('#sub').disabled = false;
};
$$('[data-act="out"]').forEach(b => b.onclick = () => { if (confirm('Sign out of P&V?')) signOut(auth); });
$$('[data-act="top"]').forEach(b => b.onclick = () => scrollTo({ top: 0, behavior: 'smooth' }));
$$('[data-act="add"]').forEach(b => b.onclick = () => { say('#me', ''); $('#md').classList.add('on'); });
$('#cl').onclick = () => $('#md').classList.remove('on');

onAuthStateChanged(auth, u => {
  unsub?.(); unsub = null; loadErr = '';
  if (!u) { cloud = []; show('land'); return; }
  show('app'); render();
  unsub = onSnapshot(query(collection(db, 'memories'), orderBy('createdAt', 'desc')), { includeMetadataChanges: true },
    s => { loadErr = ''; pending = s.metadata.hasPendingWrites || s.metadata.fromCache; hiddenIds = s.docs.map(d => d.data().hide).filter(Boolean); cloud = s.docs.filter(d => !d.data().hide).map(d => { const v = d.data(); return { id: d.id, t: v.type, s: v.url, n: v.title, d: v.date || 'Together', note: v.note, fav: !!v.favorite, path: v.path }; }); render(); },
    e => { cloud = []; loadErr = 'cannot load (' + (e.code || 'error') + ')'; render(); });
});

$('#ch').onclick = e => { if (!e.target.dataset.f) return; filt = e.target.dataset.f; $$('#ch button').forEach(x => x.classList.toggle('on', x === e.target)); render(); };

async function remove(m) {
  if (!confirm('Delete this memory? This removes it for both of you.')) return false;
  if (m.builtin) { try { await addDoc(collection(db, 'memories'), { hide: m.id, createdAt: serverTimestamp(), by: auth.currentUser.uid }); return true; } catch (x) { alert(nice(x)); return false; } }
  try {
    await deleteDoc(doc(db, 'memories', m.id));
    if (m.path) fetch(`${SB}/storage/v1/object/${BUCKET}/${m.path}`, { method: 'DELETE', headers: sbHeaders }).catch(() => {});
    return true;
  } catch (x) { alert(nice(x)); return false; }
}

function render() {
  const l = [...cloud, ...base.filter(b => !hiddenIds.includes(b.id))].filter(m => filt === 'all' || (filt === 'fav' ? m.fav : m.t === filt));
  say('#ct', l.length + ' memories' + (loadErr ? ' · ' + loadErr : pending ? ' · syncing…' : ''));
  $('#gr').innerHTML = l.length ? '' : '<div class="empty">Nothing here yet. Tap + to add your first memory.</div>';
  l.forEach(m => {
    const d = document.createElement('div'); d.className = 'm';
    d.innerHTML = (m.t === 'video' ? `<video src="${m.s}#t=0.1" muted playsinline preload="metadata"></video>` : `<img src="${m.s}" alt="" loading="lazy">`) +
      `<button class="del" aria-label="Delete">🗑</button><button class="fav${m.fav ? ' on' : ''}" aria-label="Favourite">♥</button><div class="cap"><b></b><span></span></div>`;
    d.querySelector('b').textContent = m.n; d.querySelector('span').textContent = m.d;
    d.querySelector('.del').onclick = e => { e.stopPropagation(); remove(m); };
    d.querySelector('.fav').onclick = async e => {
      e.stopPropagation(); m.fav = !m.fav;
      if (m.builtin) render(); else try { await updateDoc(doc(db, 'memories', m.id), { favorite: m.fav }); } catch {}
    };
    d.onclick = () => {
      $('#lb').innerHTML = (m.t === 'video' ? `<video src="${m.s}" controls autoplay playsinline></video>` : `<img src="${m.s}" alt="">`) +
        '<h2 class="serif" style="margin-top:12px"></h2><p></p><button class="btn ghost" style="color:#fff;margin:8px 4px 0" id="x">Close</button><button class="btn ghost" style="color:#fff;margin:8px 4px 0" id="dl">Delete</button>';
      $('#lb h2').textContent = m.n; $('#lb p').textContent = m.note || m.d; $('#lbm').classList.add('on');
      const close = () => { $('#lbm').classList.remove('on'); $('#lb').innerHTML = ''; };
      $('#x').onclick = close;
      $('#dl').onclick = async () => { if (await remove(m)) close(); };
    };
    $('#gr').append(d);
  });
}

/* ---------- upload to Supabase Storage ---------- */
const isVideo = f => f.type.startsWith('video') || /\.(mp4|mov|m4v|webm|3gp)$/i.test(f.name);
function upload(file, label) {
  return new Promise((resolve, reject) => {
    const path = `${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
    const x = new XMLHttpRequest();
    x.open('POST', `${SB}/storage/v1/object/${BUCKET}/${path}`);
    x.setRequestHeader('apikey', KEY); if (KEY.startsWith('eyJ')) x.setRequestHeader('Authorization', 'Bearer ' + KEY);
    x.setRequestHeader('Content-Type', file.type || (isVideo(file) ? 'video/mp4' : 'image/jpeg'));
    x.upload.onprogress = e => e.lengthComputable && say('#me', `Uploading ${label}: ${Math.round(e.loaded / e.total * 100)}%`);
    x.onload = () => {
      if (x.status < 300) return resolve({ path, url: `${SB}/storage/v1/object/public/${BUCKET}/${path}` });
      let m = ''; try { m = JSON.parse(x.responseText).message; } catch {}
      reject(new Error('Upload failed: ' + (m || x.status)));
    };
    x.onerror = () => reject(new Error('Network error. Check your connection.'));
    x.send(file);
  });
}

$('#sv').onclick = async () => {
  const f = [...$('#fi').files]; if (!f.length) return say('#me', 'Choose at least one photo or video.');
  if (!SB || !KEY) return say('#me', 'Supabase is not set up: add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel, then redeploy.');
  if (!auth.currentUser) return say('#me', 'Please sign in again.');
  $('#sv').disabled = true; $('#sv').textContent = 'Saving…'; say('#me', '');
  try {
    for (let i = 0; i < f.length; i++) {
      const r = await upload(f[i], `${i + 1} of ${f.length}`);
      await withTimeout(addDoc(collection(db, 'memories'), {
        url: r.url, path: r.path, type: isVideo(f[i]) ? 'video' : 'photo',
        title: $('#ti').value.trim() || 'New memory', date: $('#da').value || '', note: $('#no').value.trim(),
        favorite: false, by: auth.currentUser.uid, createdAt: serverTimestamp(),
      }), 20000);
    }
    ['#fi', '#ti', '#da', '#no'].forEach(s => $(s).value = ''); say('#me', ''); $('#md').classList.remove('on'); filt = 'all';
  } catch (x) { console.error(x); say('#me', nice(x)); }
  $('#sv').disabled = false; $('#sv').textContent = 'Save memory';
};
