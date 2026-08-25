/**
 * Setup First Client Script
 * 
 * This script creates the first client in Firestore with all necessary subcollections.
 * Run this after deploying the multi-tenant version of the app.
 * 
 * Usage:
 *   npm install firebase
 *   node setup-first-client.js
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc } = require('firebase/firestore');

// ============================================================
// CONFIGURATION - Update these values for your first client
// ============================================================

// Your Firebase config (from firebase-config.js)
const firebaseConfig = {
  apiKey: "AIzaSyAkf7GJ3mrEUtykHLQ3wizwfGpl5OugE2I",
  authDomain: "courtbooking-85175.firebaseapp.com",
  projectId: "courtbooking-85175",
  storageBucket: "courtbooking-85175.firebasestorage.app",
  messagingSenderId: "291819153596",
  appId: "1:291819153596:web:f31c27b24a5eaa718088b9"
};

// Client configuration
const CLIENT_ID = 'demo'; // This will be the subdomain: demo.yourdomain.com

const clientConfig = {
  data: {
    businessName: "Demo Pickleball Club",
    tagline: "Book courts, play pickleball",
    contactEmail: "demo@example.com",
    contactPhone: "+1234567890",
    address: "123 Demo Street, Demo City",
    theme: {
      primaryColor: "#3B82F6",
      primaryHover: "#2563EB",
      dark: "#1F2937",
      bg: "#F9FAFB",
      border: "#E5E7EB"
    },
    social: {
      facebook: "https://facebook.com/demo",
      instagram: "https://instagram.com/demo"
    },
    logoUrl: "",
    faviconUrl: ""
  }
};

const courtsConfig = {
  data: [
    {
      id: "court1",
      name: "Main Court",
      startHour: 8,
      endHour: 22,
      active: true
    },
    {
      id: "court2",
      name: "Court 2",
      startHour: 9,
      endHour: 21,
      active: true
    }
  ]
};

const settingsConfig = {
  data: {
    pin: "1234",
    payMethods: {},
    rates: {
      hourly: 300,
      queuePerHead: 100
    },
    hours: {
      queueStart: 7,
      queueEnd: 12,
      bookingStart: 12,
      close: 22
    },
    staff: {
      days: [0, 2, 4, 6], // Sun, Tue, Thu, Sat
      startHour: 17,
      endHour: 22,
      label: "Staff"
    }
  }
};

// ============================================================
// SCRIPT - Do not modify below this line
// ============================================================

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function setupFirstClient() {
  console.log(`\n🚀 Setting up client: ${CLIENT_ID}\n`);

  try {
    // 1. Create client config
    console.log('📝 Creating client config...');
    await setDoc(doc(db, 'clients', CLIENT_ID, 'config', 'state'), clientConfig);
    console.log('   ✅ Client config created');

    // 2. Create courts
    console.log('🏟️  Creating courts...');
    await setDoc(doc(db, 'clients', CLIENT_ID, 'courts', 'state'), courtsConfig);
    console.log('   ✅ Courts created');

    // 3. Create settings
    console.log('⚙️  Creating settings...');
    await setDoc(doc(db, 'clients', CLIENT_ID, 'settings', 'state'), settingsConfig);
    console.log('   ✅ Settings created');

    // 4. Create empty collections
    console.log('📦 Creating empty collections...');
    await setDoc(doc(db, 'clients', CLIENT_ID, 'bookings', 'state'), { data: [] });
    await setDoc(doc(db, 'clients', CLIENT_ID, 'queues', 'state'), { data: [] });
    await setDoc(doc(db, 'clients', CLIENT_ID, 'openPlay', 'state'), { data: [] });
    await setDoc(doc(db, 'clients', CLIENT_ID, 'morning', 'state'), { data: {} });
    await setDoc(doc(db, 'clients', CLIENT_ID, 'staffReserve', 'state'), { 
      data: { weekId: '', days: {} } 
    });
    console.log('   ✅ Empty collections created');

    console.log('\n✅ Client setup complete!\n');
    console.log(`📍 Client ID: ${CLIENT_ID}`);
    console.log(`🌐 Access URL: https://${CLIENT_ID}.yourdomain.com`);
    console.log('\n📋 Next steps:');
    console.log('   1. Set up DNS CNAME record for the subdomain');
    console.log('   2. Add domain to Vercel dashboard');
    console.log('   3. Test the client by visiting the URL');
    console.log('   4. Customize the client config in Firebase Console\n');

  } catch (error) {
    console.error('\n❌ Error setting up client:', error);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

setupFirstClient();
