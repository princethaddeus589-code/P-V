// Frontend: npm i firebase  → use in your React/Vite app
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';

const app = initializeApp({ /* paste your Firebase web config here */ });
export const auth = getAuth(app);
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export async function signUp(name, email, password) {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(user, { displayName: name });
  await api('/api/profile', { method: 'POST', body: JSON.stringify({ name }) });
}
export const signIn = (email, password) => signInWithEmailAndPassword(auth, email, password);

export async function api(path, opts = {}) {
  const token = await auth.currentUser.getIdToken();
  const isForm = opts.body instanceof FormData;
  const res = await fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(isForm ? {} : { 'Content-Type': 'application/json' }) } });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}
// Upload: const f = new FormData(); files.forEach(x => f.append('files', x)); f.append('title','…'); api('/api/memories',{method:'POST',body:f})
