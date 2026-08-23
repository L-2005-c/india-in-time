import { browserLogger } from '../utils/browser-logger.js';
/**
 * Firebase authentication + user persistence boundary.
 * UI/business modules interact through callbacks instead of closing over the
 * entire app core's mutable state.
 */
export function createAuthSession({
  auth,
  provider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  db,
  firestore,
  getUser,
  setUser,
  getStamps,
  setStamps,
  getExpenses,
  setExpenses,
  resetTripData,
  onAuthChecked,
  addMessage,
}) {
  let signingIn = false;

  async function saveUserData() {
    const user = getUser();
    if (!user) return;
    const uid = user.uid;
    try {
      await firestore.setDoc(firestore.doc(db, 'users', uid, 'data', 'stamps'), {
        stamps: [...getStamps()],
        updatedAt: firestore.serverTimestamp(),
      });
      await firestore.setDoc(firestore.doc(db, 'users', uid, 'data', 'expenses'), {
        expenses: getExpenses(),
        updatedAt: firestore.serverTimestamp(),
      });
    } catch (error) {
      browserLogger.warn('[fb save]', error.message);
    }
  }

  async function loadUserData() {
    const user = getUser();
    if (!user) return;
    const uid = user.uid;

    try {
      const snapshot = await firestore.getDoc(firestore.doc(db, 'users', uid, 'data', 'stamps'));
      if (snapshot.exists()) setStamps(new Set(snapshot.data().stamps || []));
    } catch (error) {
      browserLogger.warn('[fb load] stamps:', error.message);
    }

    try {
      const snapshot = await firestore.getDoc(firestore.doc(db, 'users', uid, 'data', 'expenses'));
      if (snapshot.exists()) setExpenses(snapshot.data().expenses || []);
    } catch (error) {
      browserLogger.warn('[fb load] expenses:', error.message);
    }

    try {
      const snapshot = await firestore.getDocs(firestore.collection(db, 'users', uid, 'plans'));
      if (!snapshot.empty) window._fbPlans = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    } catch (error) {
      browserLogger.warn('[fb load] plans:', error.message);
    }
  }

  function toggleUserMenu() {
    document.getElementById('user-menu')?.classList.toggle('open');
  }

  function checkInAppBrowser() {
    const ua = navigator.userAgent || navigator.vendor || window.opera || '';
    const isInApp = /Instagram|FB_IAB|FBAV|FBAN|Line|MicroMessenger|musical_ly|BytedanceWebview|Snapchat/i.test(ua);
    if (isInApp) {
      const warnEl = document.getElementById('inapp-browser-warning');
      if (warnEl) warnEl.style.display = 'block';
    }
    return isInApp;
  }
  checkInAppBrowser();

  function continueAsGuest() {
    document.getElementById('login-screen').style.display = 'none';
    if (typeof window.maybeShowOnboarding === 'function') window.maybeShowOnboarding();
    addMessage(`👋 Welcome to <strong>India In-Time</strong>! Pick a city and tap <strong>Generate Plan</strong> to start exploring!`);
  }

  async function signInWithGoogle(event) {
    if (signingIn) return;
    signingIn = true;

    const btn = event?.currentTarget || document.querySelector('.btn-google');
    const loadingEl = document.getElementById('login-loading');
    if (btn) btn.disabled = true;
    if (loadingEl) loadingEl.style.display = 'block';

    const isInApp = checkInAppBrowser();
    if (isInApp) {
      browserLogger.warn('[signInWithGoogle] In-app browser detected — Google OAuth may be restricted by platform');
    }

    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      const expected = error?.code === 'auth/cancelled-popup-request' || error?.code === 'auth/popup-closed-by-user';
      if (!expected) {
        browserLogger.error('[signInWithGoogle] Auth error:', error);
        const isStorageOrPopup = error?.code === 'auth/popup-blocked' ||
                                 error?.code === 'auth/web-storage-unsupported' ||
                                 (error?.message && error.message.includes('missing initial state'));
        if (isStorageOrPopup || isInApp) {
          alert('Google Sign-In is blocked inside Instagram and social in-app browsers.\n\nPlease tap "Continue as Guest" to use the app immediately, or tap "•••" at the top right to open in Chrome or Safari.');
          const warnEl = document.getElementById('inapp-browser-warning');
          if (warnEl) warnEl.style.display = 'block';
        } else {
          alert('Sign-in failed: ' + error.message);
        }
      } else {
        browserLogger.warn('[signInWithGoogle] Expected popup race, ignored:', error.code);
      }
    } finally {
      signingIn = false;
      if (btn) btn.disabled = false;
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  async function doSignOut() {
    await saveUserData();
    await signOut(auth);
    document.getElementById('user-menu')?.classList.remove('open');
    resetTripData();
    addMessage(null, { resetUi: true });
  }

  onAuthStateChanged(auth, async user => {
    onAuthChecked();
    if (user) {
      setUser(user);
      window.currentUser = user;
      document.getElementById('login-screen').style.display = 'none';
      if (typeof window.maybeShowOnboarding === 'function') window.maybeShowOnboarding();
      const avatar = document.getElementById('user-avatar');
      if (user.photoURL) {
        avatar.src = user.photoURL;
        avatar.style.display = 'block';
      }
      document.getElementById('um-name').textContent = user.displayName || 'Traveller';
      document.getElementById('um-email').textContent = user.email || '';
      loadUserData().catch(() => {});
      const firstName = user.displayName?.split(' ')[0] || 'Traveller';
      addMessage(`👋 Welcome, <strong>${firstName}</strong>! Your data is synced ☁️ — pick a city and tap Generate to start!`);
    } else {
      setUser(null);
      window.currentUser = null;
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('user-avatar').style.display = 'none';
    }
  });

  return { saveUserData, loadUserData, signInWithGoogle, doSignOut, toggleUserMenu, continueAsGuest };
}
