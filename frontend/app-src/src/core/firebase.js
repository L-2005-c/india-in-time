import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut as fbSignOut }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { initializeFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDdFpaAOXT2DcniMoh2jJGlReMYLZy8DDM',
  authDomain: 'india-in-time.firebaseapp.com',
  projectId: 'india-in-time',
  storageBucket: 'india-in-time.firebasestorage.app',
  messagingSenderId: '954365212663',
  appId: '1:954365212663:web:f2ad8db463026fad5920f2',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
const provider = new GoogleAuthProvider();

export {
  app, auth, db, provider,
  signInWithPopup, onAuthStateChanged, fbSignOut,
  doc, setDoc, getDoc, collection, getDocs, deleteDoc, serverTimestamp,
};
