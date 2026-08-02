const { execSync } = require('child_process');
const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

// 1. Swap SDK scripts
html = html.replace(
  '<!-- Firebase SDK (config injected by firebase-config.js; blank = local demo mode) -->',
  '<!-- Supabase SDK (config injected by backend-config.js; blank = local demo mode) -->'
);
html = html.replace('<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>\n<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>\n<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js"></script>\n<script src="firebase-config.js"></script>',
'<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n<script src="backend-config.js"></script>'
);

// 2. Init Block
html = html.replace(/FIREBASE INIT \+ FIRESTORE DATA LAYER/, 'SUPABASE INIT + POSTGRES DATA LAYER');
html = html.replace(/firebase-config\.js \(window\.FIREBASE_CONFIG\)/, 'backend-config.js (window.SUPABASE_CONFIG)');

html = html.replace(
  "const FIREBASE_CFG = (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey && !String(window.FIREBASE_CONFIG.apiKey).startsWith('PASTE')) ? window.FIREBASE_CONFIG : null;\nconst FB_ENABLED = !!FIREBASE_CFG;\nlet db = null;\nlet fbStorage = null;\nif (FB_ENABLED) {\n  firebase.initializeApp(FIREBASE_CFG);\n  db = firebase.firestore();\n  try { fbStorage = firebase.storage(); } catch(e) { console.warn('Firebase Storage unavailable:', e.message); }\n}\nconst HAS_STORAGE = FB_ENABLED && !!fbStorage;",
  "const SUPABASE_CFG = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && !String(window.SUPABASE_CONFIG.url).startsWith('PASTE')) ? window.SUPABASE_CONFIG : null;\nconst SB_ENABLED = !!SUPABASE_CFG;\nlet supabaseClient = null;\nif (SB_ENABLED) {\n  supabaseClient = supabase.createClient(SUPABASE_CFG.url, SUPABASE_CFG.anonKey);\n}\nconst HAS_STORAGE = SB_ENABLED;"
);

// 3. Document paths -> No-op for Supabase since we just use string keys for the KV table
html = html.replace(
  "/* ---------- Firestore document paths (null in demo mode) ---------- */\nconst DOCS = db ? {\n  bookings: db.collection('app').doc('bookings'),\n  openPlay: db.collection('app').doc('openPlay'),\n  morning:  db.collection('app').doc('morning'),\n  staffReserve: db.collection('app').doc('staffReserve'),\n  settings: db.collection('app').doc('settings'),    // pin + payMethods\n  queues:   db.collection('app').doc('queues')\n} : {};\n\n// Payment proofs: one Firestore document per proof, one Storage file each\nconst proofsCol = db ? db.collection('proofs') : null;",
  ""
);

// 4. fbSave -> sbSave
html = html.replace(
  "/* ---------- Firestore helper: save + cache (no-op cloud write in demo mode) ---------- */\nasync function fbSave(docRef, lsKey, data) {\n  localStorage.setItem(lsKey, JSON.stringify(data));\n  if (!db || !docRef) return;\n  try { await docRef.set({ data: JSON.stringify(data) }, { merge: true }); } catch(e) { console.warn('Firestore write failed, cached locally:', e.message); }\n}",
  "/* ---------- Supabase helper: save + cache (no-op cloud write in demo mode) ---------- */\nasync function sbSave(key, lsKey, data) {\n  localStorage.setItem(lsKey, JSON.stringify(data));\n  if (!supabaseClient) return;\n  try { await supabaseClient.from('kv_store').upsert({ key: key, value: data }); } catch(e) { console.warn('Supabase write failed, cached locally:', e.message); }\n}"
);

// 5. Replace references to fbSave
html = html.replace(/fbSave\(DOCS\.bookings, LS\.bookings, arr\)/g, "sbSave('bookings', LS.bookings, arr)");
html = html.replace(/fbSave\(DOCS\.morning, LS\.morning, obj\)/g, "sbSave('morning', LS.morning, obj)");
html = html.replace(/fbSave\(DOCS\.openPlay, LS\.openPlay, arr\)/g, "sbSave('openPlay', LS.openPlay, arr)");
html = html.replace(/fbSave\(DOCS\.staffReserve, LS\.staffReserve, obj\)/g, "sbSave('staffReserve', LS.staffReserve, obj)");
html = html.replace(/fbSave\(DOCS\.queues, LS\.queues, arr\)/g, "sbSave('queues', LS.queues, arr)");
html = html.replace(/DOCS\.queues\.set\(\{ data: JSON\.stringify\(arr\) \}\)\.catch\(\(\)=>\{\}\);/g, "sbSave('queues', LS.queues, arr);");

// 6. Settings updates
html = html.replace(
  "  if (db && DOCS.settings) DOCS.settings.update({ payMethods: JSON.stringify(methods) }).catch(()=>{});",
  "  if (supabaseClient) supabaseClient.from('kv_store').upsert({ key: 'payMethods', value: methods }).catch(()=>{});"
);
html = html.replace(
  "function savePin(pin){ localStorage.setItem(LS.pin, pin); if (db && DOCS.settings) DOCS.settings.update({ pin: pin }).catch(()=>{}); }",
  "function savePin(pin){ localStorage.setItem(LS.pin, pin); if (supabaseClient) supabaseClient.from('kv_store').upsert({ key: 'pin', value: pin }).catch(()=>{}); }"
);

// 7. Seed if Empty
let seedBlock = `/* ---------- Seed data (only if cloud is empty) ---------- */
async function seedIfEmpty() {
  if (!supabaseClient) { seedLocalIfEmpty(); return; }
  try {
    const { data: bData } = await supabaseClient.from('kv_store').select('value').eq('key', 'bookings').single();
    if (!bData) {
      const t = todayISO();
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
      const tom = tomorrow.toISOString().slice(0,10);
      const seedData = [
        {id:'b_seed_res', name:'Alex Rivera', email:'alex.rivera@example.com', date:t, start:13, end:14, status:'Reserved', group:'4 players', createdAt:Date.now()-7200000},
        {id:'b_seed_pen', name:'Mika Tan', email:'mika.tan@example.com', date:t, start:14, end:15, status:'Pending', group:'2 players', createdAt:Date.now()-3600000},
        {id:'op_seed_today', name:'Open Play', email:'', date:t, start:15, end:17, status:'OpenPlay', group:'Community open play', createdAt:Date.now()-3000000},
        {id:'b_seed_tom', name:'JC Dela Cruz', email:'jc@example.com', date:tom, start:13, end:14, status:'Pending', group:'3 players', createdAt:Date.now()-1800000},
      ];
      await supabaseClient.from('kv_store').upsert({ key: 'bookings', value: seedData });
      bookings = seedData;
    } else {
      bookings = bData.value;
    }
    localStorage.setItem(LS.bookings, JSON.stringify(bookings));

    const { data: oData } = await supabaseClient.from('kv_store').select('value').eq('key', 'openPlay').single();
    if (!oData) {
      const t = todayISO();
      const seedOp = [{id:'op_seed_today', date:t, start:15, end:17}];
      await supabaseClient.from('kv_store').upsert({ key: 'openPlay', value: seedOp });
      openPlays = seedOp;
    } else {
      openPlays = oData.value;
    }
    localStorage.setItem(LS.openPlay, JSON.stringify(openPlays));

    const { data: mData } = await supabaseClient.from('kv_store').select('value').eq('key', 'morning').single();
    if (!mData) {
      const def = {"7":false,"8":false,"9":false,"10":false,"11":false};
      await supabaseClient.from('kv_store').upsert({ key: 'morning', value: def });
      morningEnabled = def;
    } else {
      morningEnabled = mData.value;
    }
    localStorage.setItem(LS.morning, JSON.stringify(morningEnabled));

    const { data: srData } = await supabaseClient.from('kv_store').select('value').eq('key', 'staffReserve').single();
    if (!srData) {
      const def = { weekId: getCurrentWeekId(), days: {...STAFF_RESERVE_DEFAULTS} };
      await supabaseClient.from('kv_store').upsert({ key: 'staffReserve', value: def });
      staffReserveEnabled = def;
    } else {
      const parsed = srData.value;
      if(!parsed.weekId || parsed.weekId !== getCurrentWeekId()){
        staffReserveEnabled = { weekId: getCurrentWeekId(), days: {...STAFF_RESERVE_DEFAULTS} };
        await supabaseClient.from('kv_store').upsert({ key: 'staffReserve', value: staffReserveEnabled });
      } else {
        staffReserveEnabled = parsed;
      }
    }
    localStorage.setItem(LS.staffReserve, JSON.stringify(staffReserveEnabled));

    const { data: pinData } = await supabaseClient.from('kv_store').select('value').eq('key', 'pin').single();
    if (!pinData) await supabaseClient.from('kv_store').upsert({ key: 'pin', value: '1234' });

    const { data: pmData } = await supabaseClient.from('kv_store').select('value').eq('key', 'payMethods').single();
    if (!pmData) await supabaseClient.from('kv_store').upsert({ key: 'payMethods', value: {} });

  } catch(e) {
    console.warn('Supabase seed/fetch failed, using local cache:', e.message);
  }
  renderSchedule(); renderBookingsList();
  if (typeof populateTimeOptions === 'function') populateTimeOptions();
  if (typeof renderDateSlotPreview === 'function') renderDateSlotPreview();
}`;
html = html.replace(/\/\* ---------- Seed data \(only if Firestore doc is empty\) ---------- \*\/[\s\S]*?renderDateSlotPreview\(\);\n\}/, seedBlock);

// 8. Start Realtime Listeners
let listenerBlock = `/* ---------- Supabase real-time listeners (skipped in demo mode) ---------- */
function startRealtimeListeners() {
  if (!supabaseClient) return;

  supabaseClient.channel('custom-all-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kv_store' }, payload => {
      const { key, value } = payload.new;
      try {
        if (key === 'bookings') {
          bookings = value;
          localStorage.setItem(LS.bookings, JSON.stringify(value));
          renderSchedule(); renderBookingsList();
          if (typeof renderAdminBookings === 'function') renderAdminBookings();
          if (typeof renderDateSlotPreview === 'function') renderDateSlotPreview();
        } else if (key === 'openPlay') {
          openPlays = value;
          localStorage.setItem(LS.openPlay, JSON.stringify(value));
          renderSchedule();
          if (typeof renderOpenPlayList === 'function') renderOpenPlayList();
          if (typeof renderDateSlotPreview === 'function') renderDateSlotPreview();
        } else if (key === 'morning') {
          morningEnabled = value;
          localStorage.setItem(LS.morning, JSON.stringify(value));
          renderSchedule();
          if (typeof populateTimeOptions === 'function') populateTimeOptions();
          if (typeof renderMorningToggles === 'function') renderMorningToggles();
        } else if (key === 'staffReserve') {
          let parsed = value;
          if(!parsed.weekId || parsed.weekId !== getCurrentWeekId()){
            staffReserveEnabled = { weekId: getCurrentWeekId(), days: {...STAFF_RESERVE_DEFAULTS} };
            supabaseClient.from('kv_store').upsert({ key: 'staffReserve', value: staffReserveEnabled }).catch(()=>{});
          } else {
            staffReserveEnabled = parsed;
          }
          localStorage.setItem(LS.staffReserve, JSON.stringify(staffReserveEnabled));
          renderSchedule();
          if (typeof renderStaffReserveToggles === 'function') renderStaffReserveToggles();
        } else if (key === 'pin') {
          localStorage.setItem(LS.pin, value);
        } else if (key === 'payMethods') {
          payMethods = value;
          localStorage.setItem(LS.payMethods, JSON.stringify(value));
          if (typeof renderPublicPayTab === 'function') renderPublicPayTab();
          if (typeof renderAdminQrManager === 'function') renderAdminQrManager();
        } else if (key === 'queues') {
          localStorage.setItem(LS.queues, JSON.stringify(value));
          if (typeof renderQueueModule === 'function') renderQueueModule();
        }
      } catch(e){}
    })
    .subscribe();
}`;
html = html.replace(/\/\* ---------- Firestore real-time listeners \(skipped in demo mode\) ---------- \*\/[\s\S]*?_firebaseReady = true;\n\}/, listenerBlock);

// 9. Proofs Storage Logic
let proofsBlock = `/* Cloud upload: pushes file to Storage + writes TTL metadata doc. */
async function uploadProofCloud(bookingId, nameOnBooking, proof) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const now = Date.now();
      const path = \`\${bookingId}/\${now}_\${proof.fileName}\`;
      
      // Upload to Supabase Storage bucket 'proofs'
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('proofs')
        .upload(path, dataURLtoFile(proof.dataUrl, proof.fileName), { contentType: proof.mime });
        
      if (uploadError) throw uploadError;

      const { data: urlData } = supabaseClient.storage.from('proofs').getPublicUrl(path);
      const url = urlData.publicUrl;

      // Write to 'proofs' table
      const { error: dbError } = await supabaseClient.from('proofs').insert({
        booking_id: bookingId,
        name: nameOnBooking,
        file_name: proof.fileName,
        path: path,
        url: url,
        mime: proof.mime,
        expires_at: new Date(now + 7 * 24 * 3600 * 1000).toISOString()
      });
      
      if (dbError) throw dbError;
      return { ok: true, url };
    } catch (err) {
      console.warn(\`Proof upload attempt \${attempt + 1} failed:\`, err.message);
      if (attempt === 1) return { ok: false, error: err.message };
      await new Promise(r => setTimeout(r, 1400));
    }
  }
}

// Helper to convert dataUrl to File for Supabase
function dataURLtoFile(dataurl, filename) {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while(n--){
      u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, {type:mime});
}`;
html = html.replace(/\/\* Cloud upload: pushes file to Storage \+ writes TTL metadata doc\. \*\/[\s\S]*?\}\n\}/, proofsBlock);

let sweepBlock = `/* Sweep proofs past their 1-week retention. */
async function sweepExpiredProofs() {
  if (!HAS_STORAGE) return;
  try {
    const { data: expired } = await supabaseClient.from('proofs').select('id, path').lt('expires_at', new Date().toISOString());
    if (expired && expired.length > 0) {
      const ids = expired.map(p => p.id);
      const paths = expired.map(p => p.path);
      await supabaseClient.from('proofs').delete().in('id', ids);
      await supabaseClient.storage.from('proofs').remove(paths);
      console.log(\`Housekeeping: removed \${expired.length} expired proof(s).\`);
    }
  } catch (e) { }
}`;
html = html.replace(/\/\* Sweep proofs past their 1-week retention — docs off Firestore, files off Storage\. \*\/[\s\S]*?\}\n\}/, sweepBlock);

let watchBlock = `/* Supabase live feed of proofs for the Admin review queue. */
function watchProofs() {
  if (!HAS_STORAGE) return;
  supabaseClient.channel('proofs-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'proofs' }, () => {
      if (adminUnlocked) renderPaymentProofsQueue();
    })
    .subscribe();
}`;
html = html.replace(/\/\* Firestore live feed of proofs for the Admin review queue\. \*\/[\s\S]*?\}\n\}/, watchBlock);

html = html.replace(/Synced to Firebase Firestore/g, 'Synced to Supabase');
html = html.replace(/!FB_ENABLED/g, '!SB_ENABLED');

fs.writeFileSync('index.html', html);
