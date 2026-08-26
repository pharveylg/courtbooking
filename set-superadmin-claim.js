/**
 * Grants (or revokes) the "superadmin" custom claim on a Firebase Auth
 * account, which is what firestore.rules and superadmin.html check to
 * allow access to the platformTenants registry and the superadmin console.
 *
 * Prerequisites:
 *   1. Enable Email/Password sign-in in Firebase Console -> Authentication
 *      -> Sign-in method.
 *   2. Create the account you want to use as superadmin in Firebase Console
 *      -> Authentication -> Users -> Add user (or sign up once through
 *      superadmin.html itself, if you add a sign-up flow later).
 *   3. Make sure serviceAccountKey.json is present in this directory
 *      (Firebase Console -> Project Settings -> Service Accounts).
 *
 * Usage:
 *   node set-superadmin-claim.js you@example.com
 *   node set-superadmin-claim.js you@example.com --revoke
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function main() {
  const email = process.argv[2];
  const revoke = process.argv.includes('--revoke');

  if (!email) {
    console.error('Usage: node set-superadmin-claim.js <email> [--revoke]');
    process.exit(1);
  }

  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, revoke ? {} : { superadmin: true });

  console.log(`${revoke ? 'Revoked' : 'Granted'} superadmin claim for ${email} (uid: ${user.uid}).`);
  console.log('The account must sign out and back in (or refresh its ID token) for this to take effect.');
  process.exit(0);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
