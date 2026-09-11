/**
 * Platform access management for courtbooking's superadmin console.
 *
 * Two account shapes (B5 permission model):
 *   1. OWNER   -- `superadmin: true` claim. Everything, forever. This is
 *                 the historical shape and remains fully supported.
 *   2. STAFF   -- `platformPerms: [...]` array claim. Each entry is one
 *                 permission from the registry below; firestore.rules and
 *                 superadmin.html enforce the same registry per collection
 *                 and per tab.
 *
 * Prerequisites:
 *   1. Enable Email/Password sign-in (Firebase Console -> Authentication).
 *   2. Create the account in Firebase Console -> Authentication -> Users.
 *   3. serviceAccountKey.json in this directory (never committed).
 *
 * Usage:
 *   node set-superadmin-claim.js you@example.com                      # owner (full access)
 *   node set-superadmin-claim.js you@example.com --revoke             # remove all platform access
 *   node set-superadmin-claim.js staff@example.com --perms manage_entitlements,verify_platform_payment
 *   node set-superadmin-claim.js staff@example.com --list-perms       # print the registry
 *
 * Any shape change requires the account to sign out and back in (custom
 * claims ride the ID token).
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

/* Mirrors PLATFORM_PERMISSIONS in superadmin.html -- keep the two in sync. */
const PERMISSIONS = {
  manage_organizations:          'Provision tenants, set lifecycle, rename/re-brand, reset PINs, retention, watermarks',
  manage_entitlements:           'Grant / trial / pause / suspend / revoke per-tenant product entitlements',
  manage_plans:                  'Create and edit plans + pricing versions, assign plans, edit billing formulas',
  view_platform_billing:         'See invoices, suggested charges, and prepaid balances (read-only billing)',
  verify_platform_payment:       'Generate/issue invoices, record/verify/reject payments, review payer submissions',
  issue_platform_credit:         'Top up prepaid balances and apply credit to invoices',
  view_platform_usage:           'See usage reports and the usage events ledger',
  view_platform_audit:           'Read the platform audit log',
  manage_platform_configuration: 'Platform payment instructions and lifecycle policies',
  manage_support:                'Feature Ideas / support scoping notes',
  diagnose_access:               'Access diagnostics and runtime mirror re-sync',
};

async function main() {
  const email = process.argv[2];
  const revoke = process.argv.includes('--revoke');
  const permsIdx = process.argv.indexOf('--perms');
  const listPerms = process.argv.includes('--list-perms');

  if (listPerms) {
    console.log('Available permissions (registry also lives in superadmin.html):\n');
    Object.entries(PERMISSIONS).forEach(([k, v]) => console.log(`  ${k.padEnd(32)} ${v}`));
    process.exit(0);
  }

  if (!email) {
    console.error('Usage: node set-superadmin-claim.js <email> [--revoke | --perms perm1,perm2] | --list-perms');
    process.exit(1);
  }

  const user = await admin.auth().getUserByEmail(email);

  if (revoke) {
    await admin.auth().setCustomUserClaims(user.uid, {});
    console.log(`Revoked ALL platform access for ${email} (uid: ${user.uid}).`);
  } else if (permsIdx >= 0) {
    const requested = (process.argv[permsIdx + 1] || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    if (requested.length === 0) {
      console.error('--perms needs a comma-separated list. Use --list-perms to see the registry.');
      process.exit(1);
    }
    const invalid = requested.filter(p => !(p in PERMISSIONS));
    if (invalid.length) {
      console.error('Unknown permission(s): ' + invalid.join(', '));
      console.error('Use --list-perms to see the registry.');
      process.exit(1);
    }
    await admin.auth().setCustomUserClaims(user.uid, { platformPerms: requested });
    console.log(`Granted ${requested.length} permission(s) to ${email} (uid: ${user.uid}):`);
    requested.forEach(p => console.log(`  + ${p} — ${PERMISSIONS[p]}`));
    console.log('Note: this REPLACES the account\'s previous platformPerms set (re-run with the full desired list).');
    console.log('If the account previously had `superadmin: true`, that claim was removed by this call.');
  } else {
    await admin.auth().setCustomUserClaims(user.uid, { superadmin: true });
    console.log(`Granted OWNER (superadmin) claim for ${email} (uid: ${user.uid}).`);
  }
  console.log('The account must sign out and back in for the change to take effect.');
  process.exit(0);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
