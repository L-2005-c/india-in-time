import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDdFpaAOXT2DcniMoh2jJGlReMYLZy8DDM',
  authDomain: 'india-in-time.firebaseapp.com',
  projectId: 'india-in-time',
  storageBucket: 'india-in-time.firebasestorage.app',
  messagingSenderId: '954365212663',
  appId: '1:954365212663:web:f2ad8db463026fad5920f2',
};

const app = initializeApp(firebaseConfig, 'india-in-time-admin');
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const ADMIN_EMAILS = [
  'chilukurilokesh231@gmail.com',
];

export function watchAdminAuth({ onSignedIn, onSignedOut }) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { onSignedOut?.(); return; }
    const tokenResult = await user.getIdTokenResult();
    const email = (user.email || '').toLowerCase().trim();
    const isAdmin = tokenResult.claims?.admin === true || ADMIN_EMAILS.includes(email);
    if (!isAdmin) {
      await auth.signOut();
      onSignedOut?.('Your account does not have the admin role.');
      return;
    }
    onSignedIn?.(user);
  });
}

export async function signInAdmin() {
  await signInWithPopup(auth, provider);
  return auth.currentUser;
}

export async function signOutAdmin() {
  await auth.signOut();
}

export async function adminFetch(input, init = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in as an administrator');
  const token = await user.getIdToken();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
