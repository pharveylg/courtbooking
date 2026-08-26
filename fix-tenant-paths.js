const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const TENANTS = ['demo', 'acepickle', 'smash-club', 'rally-point'];

async function fixTenantPaths(tenantId) {
  console.log(`\n🔧 Fixing paths for ${tenantId}...`);
  
  try {
    // Read from wrong location (root document)
    const rootDoc = await db.doc(`clients/${tenantId}`).get();
    
    if (!rootDoc.exists) {
      console.log(`  ⚠️  No data at clients/${tenantId}, checking correct path...`);
      
      // Check if it's already in the right place
      const configDoc = await db.doc(`clients/${tenantId}/config/state`).get();
      if (configDoc.exists) {
        console.log(`  ✅ Data already in correct location`);
        return;
      }
      
      console.log(`  ❌ No data found anywhere for ${tenantId}`);
      return;
    }
    
    const rootData = rootDoc.data();
    console.log(`  📦 Found data at clients/${tenantId}`);
    
    // Extract the config from the data field
    const config = rootData.data || rootData;
    console.log(`  📋 Config structure:`, {
      hasBusinessName: !!config.businessName,
      hasTheme: !!config.theme,
      hasAdminPinHash: !!config.adminPinHash,
      hasCourts: !!config.courts
    });
    
    // Write to correct locations
    console.log(`  📝 Writing to clients/${tenantId}/config/state...`);
    await db.doc(`clients/${tenantId}/config/state`).set({
      data: config
    });
    
    // Extract courts if they exist in config
    if (config.courts && Array.isArray(config.courts)) {
      console.log(`  📝 Writing ${config.courts.length} courts to clients/${tenantId}/courts/state...`);
      await db.doc(`clients/${tenantId}/courts/state`).set({
        data: config.courts
      });
    }
    
    // Initialize other required documents
    console.log(`  📝 Initializing other state documents...`);
    await db.doc(`clients/${tenantId}/bookings/state`).set({ data: [] });
    await db.doc(`clients/${tenantId}/openPlay/state`).set({ data: [] });
    await db.doc(`clients/${tenantId}/morning/state`).set({ data: {} });
    await db.doc(`clients/${tenantId}/staffReserve/state`).set({ data: {} });
    await db.doc(`clients/${tenantId}/queues/state`).set({ data: [] });
    
    console.log(`  ✅ Fixed ${tenantId}`);
    
  } catch (error) {
    console.error(`  ❌ Error fixing ${tenantId}:`, error.message);
  }
}

async function main() {
  console.log('🚀 Fixing tenant data paths...\n');
  
  for (const tenantId of TENANTS) {
    await fixTenantPaths(tenantId);
  }
  
  console.log('\n✅ All tenants processed!');
  console.log('\n🧪 Test by visiting:');
  TENANTS.forEach(id => {
    console.log(`   https://picklecourtbooking.vercel.app/?client=${id}`);
  });
  
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});