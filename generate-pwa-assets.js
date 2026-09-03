#!/usr/bin/env node
/**
 * generate-pwa-assets.js
 * ─────────────────────
 * Reads the current branch's client-config.js and generates:
 *   - manifest.json (with tenant-specific name, theme, colors)
 *
 * Usage:
 *   node generate-pwa-assets.js
 *
 * Run this before `firebase deploy --only hosting` on each tenant branch.
 */

const fs = require('fs');
const path = require('path');

// Load client config
let config;
try {
  // Mock window for Node.js (client-config.js sets window.CLIENT_CONFIG)
  global.window = {};
  delete require.cache[require.resolve('./client-config.js')];
  require('./client-config.js');
  config = global.window.CLIENT_CONFIG || {};
  delete global.window;
} catch (e) {
  console.error('❌ Could not load client-config.js:', e.message);
  process.exit(1);
}

const cfg = config;
const business = cfg.business || {};
const theme = cfg.theme || {};
const branding = cfg.branding || {};

// ── Generate manifest.json ────────────────────────────────
const appName = business.name
  ? `${business.name} — Court Booking`
  : 'Court Booking';

const shortName = business.name
  ? (business.name.length <= 12 ? business.name : business.name.substring(0, 12))
  : 'CourtBook';

const description = business.sub
  ? `Book courts, manage queues, and track stats — ${business.sub}`
  : 'Book courts, manage queues, and track match stats';

const themeColor = theme.dark || '#201C19';
const backgroundColor = theme.bg || '#FFFBF5';

// Determine icon paths — use custom logo if available, fallback to generic
const hasCustomLogo = branding.logoUrl && !branding.logoUrl.startsWith('http');
const iconBase = hasCustomLogo ? branding.logoUrl : '/icons/icon-192.png';
const icon512 = hasCustomLogo ? branding.logoUrl : '/icons/icon-512.png';
const iconMaskable = '/icons/icon-maskable.png';

const manifest = {
  name: appName,
  short_name: shortName,
  description: description,
  start_url: '/?source=pwa',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: backgroundColor,
  theme_color: themeColor,
  icons: [
    {
      src: iconBase,
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any'
    },
    {
      src: icon512,
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any'
    },
    {
      src: iconMaskable,
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable'
    }
  ],
  categories: ['sports', 'productivity'],
  shortcuts: [
    {
      name: 'Book Court',
      short_name: 'Book',
      description: 'Reserve a court',
      url: '/?tab=book&source=shortcut'
    },
    {
      name: 'Queue',
      short_name: 'Queue',
      description: 'Join the walk-in queue',
      url: '/?tab=queue&source=shortcut'
    },
    {
      name: 'Match Stats',
      short_name: 'Stats',
      description: 'View match statistics',
      url: '/?tab=stats&source=shortcut'
    }
  ]
};

fs.writeFileSync(
  path.join(__dirname, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n'
);

console.log(`✅ manifest.json generated for "${appName}"`);
console.log(`   short_name: ${shortName}`);
console.log(`   theme_color: ${themeColor}`);
console.log(`   background_color: ${backgroundColor}`);
if (hasCustomLogo) {
  console.log(`   icons: using custom logo (${branding.logoUrl})`);
} else {
  console.log(`   icons: using generic pickleball icons`);
}

// ── Update theme-color meta in index.html ─────────────────
const indexPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// Replace the theme-color meta tag
html = html.replace(
  /(<meta name="theme-color" content=")[^"]*(")/,
  `$1${themeColor}$2`
);

fs.writeFileSync(indexPath, html);
console.log(`✅ index.html theme-color updated to ${themeColor}`);

console.log('\n📱 Ready to deploy:');
console.log('   firebase deploy --only hosting\n');
