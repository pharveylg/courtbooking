#!/usr/bin/env node
/**
 * seed-tenant-directory.js
 * ────────────────────────
 * Seeds the Firestore `tenantDirectory` collection with public tenant info.
 * This is the list that appears in the tenant picker on first launch.
 *
 * Usage:
 *   node seed-tenant-directory.js
 *
 * Prerequisites:
 *   - Firebase Admin SDK credentials (set GOOGLE_APPLICATION_CREDENTIALS)
 *   - Or run from a machine with firebase-tools logged in
 *
 * Each tenant entry needs:
 *   - clientId (the slug used in ?client=xxx)
 *   - name (display name)
 *   - sub (subtitle, optional)
 *   - location (optional)
 *   - logoUrl (optional, URL to logo image)
 *   - active (boolean, set to true to show in picker)
 */

const admin = require('firebase-admin');

// Initialize Admin SDK
// If running locally with firebase-tools, use the emulator or default credentials
try {
  admin.initializeApp();
} catch (e) {
  // Already initialized
}

const db = admin.firestore();

// ── Tenant Directory Entries ──────────────────────────────
// Add your tenants here. The clientId must match the tenant ID
// used in the clients/{clientId}/... Firestore paths.
const tenants = [
  {
    clientId: 'demo',
    name: 'Demo Facility',
    sub: 'Pickleball • Single Court',
    location: 'Sample City',
    logoUrl: '',
    active: true,
  },
  // Add more tenants below:
  // {
  //   clientId: 'white-kitchen',
  //   name: 'White Kitchen Pickleball',
  //   sub: 'Pickleball • 4 Courts',
  //   location: 'Manila, PH',
  //   logoUrl: 'https://example.com/logo.png',
  //   active: true,
  // },
  // {
  //   clientId: 'ace-pickle',
  //   name: 'Ace Pickle Club',
  //   sub: 'Pickleball • 2 Courts',
  //   location: 'Cebu, PH',
  //   logoUrl: '',
  //   active: true,
  // },
];

async function seed() {
  console.log(`\n🌱 Seeding ${tenants.length} tenant(s) into tenantDirectory...\n`);

  const batch = db.batch();

  for (const tenant of tenants) {
    const ref = db.collection('tenantDirectory').doc(tenant.clientId);
    batch.set(ref, {
      ...tenant,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`  ${tenant.active ? '✅' : '⬜'} ${tenant.clientId.padEnd(20)} → ${tenant.name}`);
  }

  await batch.commit();

  console.log(`\n✅ Done! ${tenants.length} tenant(s) written to tenantDirectory.\n`);
  console.log('The tenant picker will now show these facilities on first launch.');
  console.log('Set active: false to hide a facility without deleting it.\n');
}

seed().catch(err => {
  console.error('❌ Failed to seed tenant directory:', err.message);
  process.exit(1);
});
