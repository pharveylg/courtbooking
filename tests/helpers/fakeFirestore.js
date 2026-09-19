/* In-memory Firestore + Cloud Functions test doubles shared by the
   tournament tests. Deliberately strict where the real thing is: undefined
   field values throw, update() on a missing doc throws, and batches /
   transactions apply only on commit. */
const Module = require('module');

const store = new Map();
const DELETE = { __delete: true };
const TS = { __ts: true };
const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && v !== DELETE && v !== TS;

function resolveValue(v, where) {
  if (v === undefined) throw new Error(`Unsupported field value: undefined (${where})`);
  if (v === TS) return new Date();
  if (Array.isArray(v)) return v.map((x, i) => resolveValue(x, `${where}[${i}]`));
  if (isPlain(v)) {
    const out = {};
    for (const [k, x] of Object.entries(v)) { if (x !== DELETE) out[k] = resolveValue(x, `${where}.${k}`); }
    return out;
  }
  return v;
}
function applyWrite(existing, incoming, merge, where) {
  const out = merge && existing ? structuredClone(existing) : {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v === DELETE) delete out[k];
    else if (merge && isPlain(v) && isPlain(out[k])) out[k] = applyWrite(out[k], v, true, `${where}.${k}`);
    else out[k] = resolveValue(v, `${where}.${k}`);
  }
  return out;
}
const getPath = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

class DocRef {
  constructor(p) { this.path = p; this.id = p.split('/').pop(); }
  async get() { return new Snap(this, store.has(this.path) ? structuredClone(store.get(this.path)) : null); }
  async set(data, opts) { store.set(this.path, applyWrite(store.get(this.path), data, !!(opts && opts.merge), this.path)); }
  async update(data) {
    if (!store.has(this.path)) throw new Error(`NOT_FOUND: no document to update: ${this.path}`);
    const cur = structuredClone(store.get(this.path));
    for (const [k, v] of Object.entries(data)) {
      if (v === DELETE) delete cur[k];
      else cur[k] = resolveValue(v, `${this.path}.${k}`);
    }
    store.set(this.path, cur);
  }
  async delete() { store.delete(this.path); }
  collection(name) { return new Query(`${this.path}/${name}`); }
}
class Snap {
  constructor(ref, data) { this.ref = ref; this.id = ref.id; this.exists = data !== null; this._d = data; }
  data() { return this._d === null ? undefined : structuredClone(this._d); }
}
class Query {
  constructor(p, filters = [], lim = null) { this.path = p; this.filters = filters; this.lim = lim; }
  doc(id) { return new DocRef(`${this.path}/${id || 'auto_' + Math.random().toString(36).slice(2, 10)}`); }
  async add(data) { const r = this.doc(); await r.set(data); return r; }
  where(f, op, v) { return new Query(this.path, [...this.filters, { f, op, v }], this.lim); }
  limit(n) { return new Query(this.path, this.filters, n); }
  orderBy() { return this; }
  async get() {
    let docs = [];
    for (const [p, data] of store) {
      if (p.startsWith(this.path + '/') && !p.slice(this.path.length + 1).includes('/')) docs.push(new Snap(new DocRef(p), structuredClone(data)));
    }
    this.filters.forEach(({ f, op, v }) => {
      docs = docs.filter((d) => {
        const x = getPath(d._d, f);
        if (op === '==') return x === v;
        if (op === '>=') return x >= v;
        if (op === 'in') return Array.isArray(v) && v.includes(x);
        if (op === 'array-contains') return Array.isArray(x) && x.includes(v);
        throw new Error('unsupported op ' + op);
      });
    });
    if (this.lim != null) docs = docs.slice(0, this.lim);
    return { docs, empty: docs.length === 0, size: docs.length, forEach: (cb) => docs.forEach(cb) };
  }
}
const fakeDb = {
  doc: (p) => new DocRef(p),
  collection: (p) => new Query(p),
  batch() {
    const ops = [];
    return {
      set: (ref, data, opts) => ops.push(() => ref.set(data, opts)),
      update: (ref, data) => ops.push(() => ref.update(data)),
      delete: (ref) => ops.push(() => ref.delete()),
      commit: async () => { for (const op of ops) await op(); },
    };
  },
  async runTransaction(fn) {
    const writes = [];
    const tx = { get: (ref) => ref.get(), set: (ref, data, opts) => writes.push(() => ref.set(data, opts)), update: (ref, data) => writes.push(() => ref.update(data)), delete: (ref) => writes.push(() => ref.delete()) };
    const out = await fn(tx);
    for (const w of writes) await w();
    return out;
  },
};
class HttpsError extends Error { constructor(code, message, details) { super(message); this.code = code; this.details = details; } }
const fakeAdmin = { initializeApp() {}, firestore: Object.assign(() => fakeDb, { FieldValue: { serverTimestamp: () => TS, delete: () => DELETE } }) };

/* Records every push the code under test tries to send. */
const pushCalls = [];
const fakeWebPush = {
  setVapidDetails() {},
  async sendNotification(sub, payload, opts) {
    const gone = pushCalls.goneEndpoints && pushCalls.goneEndpoints.has(sub.endpoint);
    if (gone) throw Object.assign(new Error('gone'), { statusCode: 410 });
    pushCalls.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), opts });
    return { statusCode: 201 };
  },
};

/* Swap the real Firebase modules for the doubles above. Call before requiring functions/index.js. */
function installMocks() {
  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'firebase-admin') return fakeAdmin;
    if (request === 'firebase-functions/v2/https') return { onCall: (_opts, handler) => handler, HttpsError };
    if (request === 'firebase-functions/v2/scheduler') return { onSchedule: (_opts, handler) => handler };
    if (request === 'firebase-functions/params') return { defineSecret: () => ({ value: () => 'test-secret' }) };
    if (request === 'web-push') return fakeWebPush;
    return origLoad.call(this, request, ...rest);
  };
}

module.exports = { store, DELETE, TS, fakeDb, fakeAdmin, HttpsError, pushCalls, installMocks };
