#!/usr/bin/env node
/**
 * seed-tenant-directory.js
 * ────────────────────────
 * Seeds the Firestore `tenantDirectory` collection with public tenant info.
 * This is the public-readable mirror that the picker page queries.
 * (platformTenants holds billing/credit data and is locked to superadmin only.)
 *
 * Usage:
 *   1. Run: gcloud auth application-default login
 *   2. Run: node seed-tenant-directory.js
 *
 * If you don't have gcloud CLI, add tenants manually in Firebase Console:
 *   Firestore Database → + Start collection → tenantDirectory
 *   Document ID: your-tenant-slug
 *   Fields: businessName (string), status (string 'active'), logoUrl (string), sub (string), location (string)
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
    slug: 'demo',
    businessName: 'Demo Facility',
    sub: 'Pickleball • Single Court',
    location: 'Sample City',
    logoUrl: '/icons/tenant-demo.png',
    status: 'active',
  },
  {
    slug: 'smash-court',
    businessName: 'Smash Court Pickleball',
    sub: 'Pickleball • 4 Courts',
    location: 'Cagayan de Oro, PH',
    logoUrl: '/icons/tenant-smash.png',
    status: 'active',
  },
  {
    slug: 'the-kitchen',
    businessName: 'The Kitchen Pickleball',
    sub: 'Pickleball + Dining • 3 Courts',
    location: 'Manila, PH',
    logoUrl: '/icons/tenant-kitchen.png',
    status: 'active',
  },
  {
    slug: 'ace-pickle',
    businessName: 'Ace Pickle Club',
    sub: 'Pickleball • 2 Courts',
    location: 'Cebu, PH',
    logoUrl: '/icons/tenant-ace.png',
    status: 'active',
  },
];

async function seed() {
  console.log(`🌱 Seeding ${tenants.length} tenant(s) into platformTenants + tenantDirectory...\n`);

  const batch = db.batch();

  for (const tenant of tenants) {
    const { slug, ...data } = tenant;
    
    // Write to platformTenants (private, superadmin-only)
    const platformRef = db.collection('platformTenants').doc(slug);
    batch.set(platformRef, {
      ...data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Mirror to tenantDirectory (public, readable by picker)
    const directoryRef = db.collection('tenantDirectory').doc(slug);
    batch.set(directoryRef, {
      ...data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`  ${tenant.status === 'active' ? '✅' : '⬜'} ${tenant.slug.padEnd(20)} → ${tenant.businessName}`);
  }

  await batch.commit();

  console.log(`\n✅ Done! ${tenants.length} tenant(s) written to platformTenants + tenantDirectory.\n`);
}

seed().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
