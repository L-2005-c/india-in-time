#!/usr/bin/env node
'use strict';

/**
 * scripts/set-admin-claim.js — Manage Firebase Admin custom claims.
 *
 * Usage:
 *   node scripts/set-admin-claim.js <email-or-uid> [role]
 *   node scripts/set-admin-claim.js <email-or-uid> --remove
 *   node scripts/set-admin-claim.js <email-or-uid> --inspect
 *
 * Roles: 'owner' | 'admin' | 'analytics' (default: 'owner')
 *
 * Prerequisites:
 *   FIREBASE_SERVICE_ACCOUNT environment variable must be set (or a local serviceAccountKey.json present).
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function initFirebase() {
  if (admin.apps.length > 0) return;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  let serviceAccount = null;

  if (raw) {
    const looksLikeJson = raw.trim().startsWith('{');
    const jsonStr = looksLikeJson ? raw : Buffer.from(raw, 'base64').toString('utf8');
    serviceAccount = JSON.parse(jsonStr);
  } else {
    // Check common local filenames
    const candidates = [
      path.join(process.cwd(), 'serviceAccountKey.json'),
      path.join(process.cwd(), 'firebase-service-account.json'),
      path.join(__dirname, '..', 'serviceAccountKey.json'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        console.log(`Using local service account file: ${p}`);
        serviceAccount = JSON.parse(fs.readFileSync(p, 'utf8'));
        break;
      }
    }
  }

  if (!serviceAccount) {
    console.error('Error: FIREBASE_SERVICE_ACCOUNT environment variable is not set and no local serviceAccountKey.json found.');
    console.error('Please set FIREBASE_SERVICE_ACCOUNT or place your serviceAccountKey.json in the project root.');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

async function findUser(target) {
  const auth = admin.auth();
  if (target.includes('@')) {
    return auth.getUserByEmail(target);
  }
  return auth.getUser(target);
}

async function main() {
  const args = process.argv.slice(2);
  if (!args[0] || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage:
  node scripts/set-admin-claim.js <email-or-uid> [role]
  node scripts/set-admin-claim.js <email-or-uid> --inspect
  node scripts/set-admin-claim.js <email-or-uid> --remove

Arguments:
  <email-or-uid>   Target user's Google email or Firebase UID
  [role]           'owner' | 'admin' | 'analytics' (default: 'owner')

Flags:
  --inspect        Display the user's current custom claims
  --remove         Remove admin claims from the user
`);
    process.exit(0);
  }

  const target = args[0];
  const flagOrRole = args[1] || 'owner';

  initFirebase();

  try {
    const user = await findUser(target);
    console.log(`Found user: ${user.email} (UID: ${user.uid})`);

    if (flagOrRole === '--inspect' || flagOrRole === '-i') {
      console.log('Current custom claims:', JSON.stringify(user.customClaims || {}, null, 2));
      return;
    }

    if (flagOrRole === '--remove') {
      await admin.auth().setCustomUserClaims(user.uid, { admin: false, role: null });
      console.log(`✓ Successfully removed admin claims from ${user.email}.`);
      return;
    }

    const role = ['owner', 'admin', 'analytics'].includes(flagOrRole) ? flagOrRole : 'owner';
    await admin.auth().setCustomUserClaims(user.uid, { admin: true, role });

    console.log(`✓ Successfully granted admin claims to ${user.email}:`);
    console.log(JSON.stringify({ admin: true, role }, null, 2));
    console.log('\nNote: The user will need to re-authenticate or refresh their token for the claims to take effect.');
  } catch (err) {
    console.error(`Operation failed: ${err.message}`);
    process.exit(1);
  }
}

main();
