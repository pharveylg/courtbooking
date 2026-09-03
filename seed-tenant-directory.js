#!/usr/bin/env node
/**
 * seed-tenant-directory.js
 * ────────────────────────
 * Seeds the Firestore `tenantDirectory` collection with public tenant info.
 *
 * Usage:
 *   1. Run: gcloud auth application-default login
 *   2. Run: node seed-tenant-directory.js
 *
 * If you don't have gcloud CLI, add tenants manually in Firebase Console:
 *   Firestore Database → + Start collection → tenantDirectory
 *   Document ID: your-tenant-slug
 *   Fields: clientId (string), name (string), sub (string), active (boolean true)
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Read project ID from .firebaserc
let projectId;
try {
  const rc = JSON.parse(fs.readFileSync(path.join(__dirname, '.firebaserc'), 'utf8'));
  projectId = rc.projects.default;
} catch (e) {
  console.error('❌ Could not read .firebaserc. Make sure you are in the project root.');
  process.exit(1);
}

console.log(`\n📋 Project: ${projectId}\n`);

// Initialize Admin SDK with Application Default Credentials
try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: projectId,
  });
} catch (e) {
  console.error('❌ Failed to initialize Firebase Admin SDK:', e.message);
  console.error('\nTo fix this, run:');
  console.error('  gcloud auth application-default login');
  console.error('\nOr add tenants manually in Firebase Console:');
  console.error('  Firestore → + Start collection → tenantDirectory');
  process.exit(1);
}

const db = admin.firestore();

// ── Tenant Directory Entries ──────────────────────────────
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
  //   logoUrl: '',
  //   active: true,
  // },
];

async function seed() {
  console.log(`🌱 Seeding ${tenants.length} tenant(s) into tenantDirectory...\n`);

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
}

seed().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
