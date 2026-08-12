/**
 * Auth domain helpers — pure session/shape utilities.
 * Firebase SDK calls remain in core (needs window.firebase); this owns shapes + storage keys.
 */
export const AUTH_STORAGE_KEYS = {
  user: 'iit_user',
  guestId: 'iit_guest_id',
};

export function normalizeUser(firebaseUser) {
  if (!firebaseUser) return null;
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email || null,
    displayName: firebaseUser.displayName || null,
    photoURL: firebaseUser.photoURL || null,
  };
}

export function isSignedIn(user) {
  return !!(user && user.uid);
}

export function publicUserLabel(user) {
  if (!user) return 'Guest';
  return user.displayName || user.email || 'Traveller';
}
