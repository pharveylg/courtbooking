/**
 * Setup Sample Tenants for Testing
 * 
 * This script creates multiple sample tenants with different branding,
 * courts, and sample data to test multi-tenancy and data isolation.
 * 
 * Usage:
 *   npm install firebase
 *   node setup-sample-tenants.js
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, collection } = require('firebase/firestore');

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAkf7GJ3mrEUtykHLQ3wizwfGpl5OugE2I",
  authDomain: "courtbooking-85175.firebaseapp.com",
  projectId: "courtbooking-85175",
  storageBucket: "courtbooking-85175.firebasestorage.app",
  messagingSenderId: "291819153596",
  appId: "1:291819153596:web:f31c27b24a5eaa718088b9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// SHA-256 hash of "1234" with salt
const DEFAULT_PIN_HASH = "e4870ad7eb252a74b90f4c2c80aaec31844a74bb156e1806aaa0db7c21a31286";

// Sample tenants configuration
const sampleTenants = [
  {
    id: 'demo',
    config: {
      businessName: "Demo Pickleball Club",
      tagline: "Book courts, play pickleball",
      contactEmail: "demo@example.com",
      contactPhone: "+639171234567",
      address: "123 Demo Street, Makati City",
      theme: {
        primaryColor: "#3B82F6",  // Blue
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
      faviconUrl: "",
      heroHeadline: "Welcome to Demo Pickleball",
      heroSubheadline: "Book your court in seconds"
    },
    courts: [
      { id: "court1", name: "Main Court", startHour: 8, endHour: 22, active: true },
      { id: "court2", name: "Court 2", startHour: 9, endHour: 21, active: true }
    ],
    bookings: [
      {
        id: "booking_demo_1",
        courtId: "court1",
        date: new Date().toISOString().split('T')[0],
        startTime: "14:00",
        endTime: "15:00",
        playerName: "Juan Dela Cruz",
        email: "juan@example.com",
        phone: "+639171234567",
        status: "confirmed",
        pin: "1234",
        createdAt: new Date().toISOString()
      }
    ]
  },
  {
    id: 'acepickle',
    config: {
      businessName: "Ace Pickleball Academy",
      tagline: "Train smarter, play better",
      contactEmail: "info@acepickle.com",
      contactPhone: "+639181234567",
      address: "456 Sports Complex, BGC Taguig",
      theme: {
        primaryColor: "#10B981",  // Green
        primaryHover: "#059669",
        dark: "#064E3B",
        bg: "#F0FDF4",
        border: "#D1FAE5"
      },
      social: {
        facebook: "https://facebook.com/acepickle",
        instagram: "https://instagram.com/acepickle"
      },
      logoUrl: "",
      faviconUrl: "",
      heroHeadline: "Ace Pickleball Academy",
      heroSubheadline: "Where champions are made"
    },
    courts: [
      { id: "court1", name: "Championship Court", startHour: 7, endHour: 22, active: true },
      { id: "court2", name: "Training Court A", startHour: 8, endHour: 20, active: true },
      { id: "court3", name: "Training Court B", startHour: 8, endHour: 20, active: true },
      { id: "court4", name: "Practice Court", startHour: 9, endHour: 18, active: true }
    ],
    bookings: [
      {
        id: "booking_ace_1",
        courtId: "court1",
        date: new Date().toISOString().split('T')[0],
        startTime: "10:00",
        endTime: "11:00",
        playerName: "Maria Santos",
        email: "maria@example.com",
        phone: "+639181234567",
        status: "confirmed",
        pin: "5678",
        createdAt: new Date().toISOString()
      },
      {
        id: "booking_ace_2",
        courtId: "court2",
        date: new Date().toISOString().split('T')[0],
        startTime: "16:00",
        endTime: "17:00",
        playerName: "Pedro Reyes",
        email: "pedro@example.com",
        phone: "+639191234567",
        status: "confirmed",
        pin: "9012",
        createdAt: new Date().toISOString()
      }
    ]
  },
  {
    id: 'smash-club',
    config: {
      businessName: "Smash Pickleball Club",
      tagline: "Smash your way to victory",
      contactEmail: "hello@smashclub.ph",
      contactPhone: "+639191234567",
      address: "789 Recreation Center, Quezon City",
      theme: {
        primaryColor: "#F59E0B",  // Orange/Amber
        primaryHover: "#D97706",
        dark: "#78350F",
        bg: "#FFFBEB",
        border: "#FDE68A"
      },
      social: {
        facebook: "https://facebook.com/smashclub",
        instagram: "https://instagram.com/smashclub"
      },
      logoUrl: "",
      faviconUrl: "",
      heroHeadline: "Smash Pickleball Club",
      heroSubheadline: "Join the community, play with passion"
    },
    courts: [
      { id: "court1", name: "Court Alpha", startHour: 6, endHour: 22, active: true },
      { id: "court2", name: "Court Beta", startHour: 6, endHour: 22, active: true },
      { id: "court3", name: "Court Gamma", startHour: 8, endHour: 20, active: true }
    ],
    bookings: [
      {
        id: "booking_smash_1",
        courtId: "court1",
        date: new Date().toISOString().split('T')[0],
        startTime: "18:00",
        endTime: "19:00",
        playerName: "Ana Garcia",
        email: "ana@example.com",
        phone: "+639201234567",
        status: "confirmed",
        pin: "3456",
        createdAt: new Date().toISOString()
      }
    ]
  },
  {
    id: 'rally-point',
    config: {
      businessName: "Rally Point Sports",
      tagline: "Your rally starts here",
      contactEmail: "book@rallypoint.ph",
      contactPhone: "+639201234567",
      address: "321 Athletic Village, Pasig City",
      theme: {
        primaryColor: "#8B5CF6",  // Purple
        primaryHover: "#7C3AED",
        dark: "#4C1D95",
        bg: "#F5F3FF",
        border: "#DDD6FE"
      },
      social: {
        facebook: "https://facebook.com/rallypoint",
        instagram: "https://instagram.com/rallypoint"
      },
      logoUrl: "",
      faviconUrl: "",
      heroHeadline: "Rally Point Sports",
      heroSubheadline: "Where every game matters"
    },
    courts: [
      { id: "court1", name: "Pro Court 1", startHour: 7, endHour: 23, active: true },
      { id: "court2", name: "Pro Court 2", startHour: 7, endHour: 23, active: true },
      { id: "court3", name: "Amateur Court", startHour: 9, endHour: 21, active: true },
      { id: "court4", name: "Junior Court", startHour: 10, endHour: 18, active: true }
    ],
    bookings: []
  }
];

async function setupSampleTenants() {
  console.log('\n🚀 Setting up sample tenants...\n');

  for (const tenant of sampleTenants) {
    console.log(`\n📦 Setting up tenant: ${tenant.id}`);
    
    try {
      // 1. Create tenant config
      console.log(`  ✓ Creating config...`);
      await setDoc(doc(db, 'clients', tenant.id, 'config', 'state'), {
        data: tenant.config
      });

      // 2. Create courts
      console.log(`  ✓ Creating ${tenant.courts.length} courts...`);
      await setDoc(doc(db, 'clients', tenant.id, 'courts', 'state'), {
        data: tenant.courts
      });

      // 3. Create settings with hashed PIN
      console.log(`  ✓ Creating settings (PIN: 1234)...`);
      await setDoc(doc(db, 'clients', tenant.id, 'settings', 'state'), {
        data: {
          pin: DEFAULT_PIN_HASH,
          payMethods: {}
        }
      });

      // 4. Create bookings
      if (tenant.bookings.length > 0) {
        console.log(`  ✓ Creating ${tenant.bookings.length} sample bookings...`);
        await setDoc(doc(db, 'clients', tenant.id, 'bookings', 'state'), {
          data: tenant.bookings
        });
      } else {
        console.log(`  ✓ Creating empty bookings...`);
        await setDoc(doc(db, 'clients', tenant.id, 'bookings', 'state'), {
          data: []
        });
      }

      // 5. Create empty collections
      console.log(`  ✓ Creating empty collections...`);
      await setDoc(doc(db, 'clients', tenant.id, 'openPlay', 'state'), { data: [] });
      await setDoc(doc(db, 'clients', tenant.id, 'morning', 'state'), { data: {} });
      await setDoc(doc(db, 'clients', tenant.id, 'staffReserve', 'state'), { data: {} });
      await setDoc(doc(db, 'clients', tenant.id, 'queues', 'state'), { data: [] });

      console.log(`  ✅ Tenant "${tenant.id}" created successfully`);
      console.log(`     URL: https://picklecourtbooking.vercel.app/?client=${tenant.id}`);

    } catch (error) {
      console.error(`  ❌ Error creating tenant ${tenant.id}:`, error.message);
    }
  }

  console.log('\n\n✅ All sample tenants created!\n');
  console.log('📋 Tenant Summary:');
  console.log('─'.repeat(60));
  
  sampleTenants.forEach(tenant => {
    console.log(`\n🏢 ${tenant.config.businessName} (${tenant.id})`);
    console.log(`   Theme: ${tenant.config.theme.primaryColor}`);
    console.log(`   Courts: ${tenant.courts.length}`);
    console.log(`   Sample Bookings: ${tenant.bookings.length}`);
    console.log(`   URL: https://picklecourtbooking.vercel.app/?client=${tenant.id}`);
  });

  console.log('\n\n🔐 Admin PIN for all tenants: 1234');
  console.log('\n📝 Next steps:');
  console.log('   1. Visit the URLs above to test each tenant');
  console.log('   2. Verify data isolation (each tenant sees only their data)');
  console.log('   3. Test admin access with PIN: 1234');
  console.log('   4. Check browser console for tenant ID');
  console.log('   5. Deploy Firestore security rules if not already done\n');
}

setupSampleTenants().catch(console.error);
