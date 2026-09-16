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

export function watchAdminAuth({ onSignedIn, onSignedOut }) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { onSignedOut?.(); return; }
    try {
      const tokenResult = await user.getIdTokenResult();
      let isAdmin = tokenResult.claims?.admin === true;
      let adminRole = tokenResult.claims?.role || (isAdmin ? 'owner' : null);

      if (!isAdmin) {
        // Fall back to server-side verification (e.g. ADMIN_EMAILS whitelist configured on server)
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.ok) {
            isAdmin = true;
            adminRole = data.role || 'analytics';
          }
        }
      }

      if (!isAdmin) {
        const userEmail = user.email || 'This account';
        await auth.signOut();
        onSignedOut?.(`${userEmail} does not have the admin role. Please add this email to ADMIN_EMAILS in Render environment variables or grant the Firebase admin custom claim.`);
        return;
      }

      user.adminRole = adminRole;
      onSignedIn?.(user);
    } catch (err) {
      await auth.signOut();
      onSignedOut?.('Authentication error: ' + (err.message || String(err)));
    }
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
