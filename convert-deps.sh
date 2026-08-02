#!/bin/bash
# Replaces Firebase with Supabase in index.html

cat index.html | sed \
  -e 's|<!-- Firebase SDK (config injected by firebase-config.js; blank = local demo mode) -->|<!-- Supabase SDK (config injected by backend-config.js; blank = local demo mode) -->|g' \
  -e 's|<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>|<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>|g' \
  -e 's|<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>||g' \
  -e 's|<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js"></script>||g' \
  -e 's|<script src="firebase-config.js"></script>|<script src="backend-config.js"></script>|g' \
  > index.html.tmp && mv index.html.tmp index.html

cat index.html | sed \
  -e 's/FIREBASE INIT + FIRESTORE DATA LAYER/SUPABASE INIT + DATA LAYER/g' \
  -e 's/firebase-config.js (window.FIREBASE_CONFIG)/backend-config.js (window.SUPABASE_CONFIG)/g' \
  -e 's/const FIREBASE_CFG = (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey && !String(window.FIREBASE_CONFIG.apiKey).startsWith('"'"'PASTE'"'"')) ? window.FIREBASE_CONFIG : null;/const SUPABASE_CFG = (window.SUPABASE_CONFIG \&\& window.SUPABASE_CONFIG.url \&\& !String(window.SUPABASE_CONFIG.url).startsWith('"'"'PASTE'"'"')) ? window.SUPABASE_CONFIG : null;/g' \
  -e 's/const FB_ENABLED = !!FIREBASE_CFG;/const SB_ENABLED = !!SUPABASE_CFG;/g' \
  -e 's/let db = null;/let supabaseClient = null;/g' \
  -e 's/let fbStorage = null;//g' \
  -e 's/if (FB_ENABLED) {/if (SB_ENABLED) {/g' \
  -e 's/firebase.initializeApp(FIREBASE_CFG);/supabaseClient = supabase.createClient(SUPABASE_CFG.url, SUPABASE_CFG.anonKey);/g' \
  -e 's/db = firebase.firestore();//g' \
  -e 's/try { fbStorage = firebase.storage(); } catch(e) { console.warn('"'"'Firebase Storage unavailable:'"'"', e.message); }//g' \
  -e 's/const HAS_STORAGE = FB_ENABLED && !!fbStorage;/const HAS_STORAGE = SB_ENABLED;/g' \
  > index.html.tmp && mv index.html.tmp index.html
