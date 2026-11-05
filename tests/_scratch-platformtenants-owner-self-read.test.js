'use strict';
// Scratch rules-scenario test for the platformTenants owner-self read branch.
// Run via: firebase emulators:exec --only firestore --project demo-rules-test \
//   "node tests/_scratch-platformtenants-owner-self-read.test.js"
// Not part of the permanent tests/*.test.js suite (no emulator in CI here) --
// this is a one-off verification artifact for this change, run by hand.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');

const PROJECT_ID = 'demo-rules-test';

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  try {
    // Seed a provisioning tenant owned by 'owner-1'.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('platformTenants/acme').set({
        businessName: 'Acme Pickleball',
        status: 'active',
        lifecycle: 'provisioning',
        source: 'self-serve',
        ownerUid: 'owner-1',
        ownerEmail: 'owner1@example.com',
        creditBalance: 42,
      });
    });

    let passed = 0;
    const check = async (label, fn) => {
      await fn();
      passed++;
      console.log('PASS:', label);
    };

    // 1. Owner CAN get their own provisioning tenant doc.
    await check('owner can GET own tenant doc', async () => {
      const owner = testEnv.authenticatedContext('owner-1');
      await assertSucceeds(owner.firestore().doc('platformTenants/acme').get());
    });

    // 2. Owner CAN list (query) their own tenant doc via the exact
    //    picker.html query shape (where ownerUid ==, where lifecycle ==).
    await check('owner can LIST own tenant doc via picker.html query shape', async () => {
      const owner = testEnv.authenticatedContext('owner-1');
      const snap = await assertSucceeds(
        owner.firestore().collection('platformTenants')
          .where('ownerUid', '==', 'owner-1')
          .where('lifecycle', '==', 'provisioning')
          .limit(1)
          .get()
      );
      assert.strictEqual(snap.empty, false, 'expected the query to return the seeded doc');
      assert.strictEqual(snap.docs[0].id, 'acme');
    });

    // 3. A DIFFERENT signed-in user CANNOT get that doc.
    await check('a different signed-in user is DENIED get', async () => {
      const other = testEnv.authenticatedContext('owner-2');
      await assertFails(other.firestore().doc('platformTenants/acme').get());
    });

    // 3b. A different signed-in user's list query (matching their own uid,
    //     not the owner's) returns empty rather than erroring -- Firestore
    //     evaluates list rules per-query-shape, so a query that can never
    //     match this document is simply denied/empty, never a leak.
    await check('a different signed-in user is DENIED list for the owner\'s uid', async () => {
      const other = testEnv.authenticatedContext('owner-2');
      await assertFails(
        other.firestore().collection('platformTenants')
          .where('ownerUid', '==', 'owner-1')
          .where('lifecycle', '==', 'provisioning')
          .limit(1)
          .get()
      );
    });

    // 4. An anonymous/unauthenticated caller is DENIED get and list.
    await check('unauthenticated caller is DENIED get', async () => {
      const anon = testEnv.unauthenticatedContext();
      await assertFails(anon.firestore().doc('platformTenants/acme').get());
    });
    await check('unauthenticated caller is DENIED list', async () => {
      const anon = testEnv.unauthenticatedContext();
      await assertFails(
        anon.firestore().collection('platformTenants')
          .where('ownerUid', '==', 'owner-1')
          .where('lifecycle', '==', 'provisioning')
          .limit(1)
          .get()
      );
    });

    // 5. Platform-staff access (canReadTenantData()) is unaffected.
    await check('platform staff (manage_organizations) can GET any tenant doc', async () => {
      const staff = testEnv.authenticatedContext('staff-1', { platformPerms: ['manage_organizations'] });
      await assertSucceeds(staff.firestore().doc('platformTenants/acme').get());
    });
    await check('platform staff without a qualifying permission is still DENIED', async () => {
      const staff = testEnv.authenticatedContext('staff-2', { platformPerms: ['manage_support'] });
      await assertFails(staff.firestore().doc('platformTenants/acme').get());
    });

    // 6. The owner still CANNOT write billing/subscription fields via this path.
    await check('owner is DENIED update of creditBalance on their own doc', async () => {
      const owner = testEnv.authenticatedContext('owner-1');
      await assertFails(
        owner.firestore().doc('platformTenants/acme').update({ creditBalance: 999999 })
      );
    });

    console.log(`\n${passed}/${passed} scenarios passed.`);
  } finally {
    await testEnv.cleanup();
  }
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
