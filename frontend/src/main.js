import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const E = import.meta.env;
const fb = initializeApp({
  apiKey: E.VITE_FIREBASE_API_KEY, authDomain: E.VITE_FIREBASE_AUTH_DOMAIN, projectId: E.VITE_FIREBASE_PROJECT_ID,
  storageBucket: E.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: E.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: E.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(fb), db = getFirestore(fb), store = getStorage(fb);

// Our first memories (built in)
const base = [
  ['/img/1.jpg', 'Golden hour', 'Together'], ['/img/0.jpg', 'That smile', 'Together'], ['/img/2.jpg', 'Hand in hand', 'Always'],
  ['/img/3.jpg', 'Brick wall bliss', 'Our favourite spot'], ['/img/4.jpg', 'Classic and cool', 'Together'],
  ['/img/5.jpg', 'Sunshine selfie', 'Together'], ['/img/6.jpg', 'Walk with me', 'Together'],
].map(([s, n, d], i) => ({ id: 'b' + i, t: 'photo', s, n, d, note: '', fav: i < 2, builtin: true }));

let cloud = [], filt = 'all', mode = 'in', unsub = null;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const show = id => { $$('.view').forEach(v => v.classList.toggle('on', v.id === id)); scrollTo(0, 0); };
const say = (el, t) => $(el).textContent = t;
const nice = e => ({
  'auth/invalid-credential': 'Email or password is incorrect.', 'auth/email-already-in-use': 'That email already has an account. Try signing in.',
  'auth/weak-password': 'Password needs at least 6 characters.', 'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
  'permission-denied': 'This space is private to Prince & Victory.', 'storage/unauthorized': 'This space is private to Prince & Victory.',
}[e.code] || 'Something went wrong. Check your connection and try again.');

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
$('#out').onclick = () => signOut(auth);

onAuthStateChanged(auth, u => {
  unsub?.(); unsub = null;
  if (!u) { cloud = []; show('land'); return; }
  show('app'); render();
  unsub = onSnapshot(query(collection(db, 'memories'), orderBy('createdAt', 'desc')),
    s => { cloud = s.docs.map(d => { const v = d.data(); return { id: d.id, t: v.type, s: v.url, n: v.title, d: v.date || 'Together', note: v.note, fav: !!v.favorite, path: v.path }; }); render(); },
    () => { cloud = []; render(); });
});

$('#ch').onclick = e => { if (!e.target.dataset.f) return; filt = e.target.dataset.f; $$('#ch button').forEach(x => x.classList.toggle('on', x === e.target)); render(); };

function render() {
  const l = [...cloud, ...base].filter(m => filt === 'all' || (filt === 'fav' ? m.fav : m.t === filt));
  say('#ct', l.length + ' memories');
  $('#gr').innerHTML = l.length ? '' : '<div class="empty">Nothing here yet. Tap “Add memory” to save your first one.</div>';
  l.forEach(m => {
    const d = document.createElement('div'); d.className = 'm';
    d.innerHTML = (m.t === 'video' ? `<video src="${m.s}" muted playsinline preload="metadata"></video>` : `<img src="${m.s}" alt="" loading="lazy">`) +
      `<button class="fav${m.fav ? ' on' : ''}" aria-label="Favourite">♥</button><div class="cap"><b></b><span></span></div>`;
    d.querySelector('b').textContent = m.n; d.querySelector('span').textContent = m.d;
    d.querySelector('.fav').onclick = async e => {
      e.stopPropagation(); m.fav = !m.fav;
      if (m.builtin) render(); else try { await updateDoc(doc(db, 'memories', m.id), { favorite: m.fav }); } catch {}
    };
    d.onclick = () => {
      $('#lb').innerHTML = (m.t === 'video' ? `<video src="${m.s}" controls autoplay playsinline></video>` : `<img src="${m.s}" alt="">`) +
        '<h2 class="serif" style="margin-top:12px"></h2><p></p><button class="btn ghost" style="color:#fff;margin:8px 4px 0" id="x">Close</button>' +
        (m.builtin ? '' : '<button class="btn ghost" style="color:#fff;margin:8px 4px 0" id="dl">Delete</button>');
      $('#lb h2').textContent = m.n; $('#lb p').textContent = m.note || m.d; $('#lbm').classList.add('on');
      const close = () => { $('#lbm').classList.remove('on'); $('#lb').innerHTML = ''; };
      $('#x').onclick = close;
      if (!m.builtin) $('#dl').onclick = async () => {
        if (!confirm('Delete this memory for both of you?')) return;
        try { await deleteDoc(doc(db, 'memories', m.id)); if (m.path) await deleteObject(ref(store, m.path)).catch(() => {}); } catch (x) { alert(nice(x)); }
        close();
      };
    };
    $('#gr').append(d);
  });
}

$('#add').onclick = () => { say('#me', ''); $('#md').classList.add('on'); };
$('#cl').onclick = () => $('#md').classList.remove('on');
$('#sv').onclick = async () => {
  const f = [...$('#fi').files]; if (!f.length) return say('#me', 'Choose at least one photo or video.');
  $('#sv').disabled = true; $('#sv').textContent = 'Saving…'; say('#me', '');
  try {
    for (const x of f) {
      const path = `memories/${auth.currentUser.uid}/${Date.now()}-${x.name.replace(/[^\w.-]/g, '_')}`;
      await uploadBytes(ref(store, path), x, { contentType: x.type });
      await addDoc(collection(db, 'memories'), {
        url: await getDownloadURL(ref(store, path)), path, type: x.type.startsWith('video') ? 'video' : 'photo',
        title: $('#ti').value.trim() || 'New memory', date: $('#da').value || '', note: $('#no').value.trim(),
        favorite: false, by: auth.currentUser.uid, createdAt: serverTimestamp(),
      });
    }
    ['#fi', '#ti', '#da', '#no'].forEach(s => $(s).value = ''); $('#md').classList.remove('on'); filt = 'all';
  } catch (x) { say('#me', nice(x)); }
  $('#sv').disabled = false; $('#sv').textContent = 'Save memory';
};
