const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR, NODE_ENV } = require('./config');
const logger = require('./logger');

let firestoreInstance = null;
let mockFirestoreInstance = null;
let forceEnableForTest = false;
let initialized = false;
let syncInProgress = false;
let queuedSnapshot = null;
let onSecurityEventCallback = null;

// Only allowlisted collections may sync (NO auditLogs, securityEvents, backups, notifications, revokedTokens, activeSessions)
const SYNC_COLLECTIONS = [
  'users',
  'requests',
  'clinicalRecords',
  'certificates',
  'announcements'
];

const COLLECTION_FIELD_ALLOWLIST = {
  users: ['id', 'role', 'status', 'createdAt', 'deletedAt'],
  requests: [
    'id', 'userId', 'studentName', 'studentId', 'courseAndYear', 'phone',
    'boardingHouse', 'address', 'landmark', 'urgency', 'symptoms', 'symptomDetails',
    'temperature', 'canWalk', 'hasCompanion', 'preferredTime', 'status',
    'createdAt', 'completedAt', 'certificateId', 'needsReassignment', 'deletedAt'
  ],
  clinicalRecords: [
    'id', 'requestId', 'patientId', 'patientName', 'studentId', 'examinerId',
    'dateExamined', 'vitals', 'symptomsObserved', 'nurseNotes', 'diagnosis',
    'prescribedMedication', 'prescriptionAndCare', 'excusedDuration', 'remarks',
    'status', 'deletedAt'
  ],
  certificates: [
    'id', 'verificationCode', 'requestId', 'clinicalRecordId', 'studentName',
    'studentId', 'courseAndYear', 'boardingHouse', 'diagnosis', 'prescribedMedication',
    'vitalSignsSummary', 'symptomsObserved', 'nurseNotes', 'recommendations',
    'careRecommendations', 'excusedDates', 'validUntil', 'remarks', 'issuedAt',
    'signedAt', 'status', 'isDraft', 'isSigned', 'integrityHash', 'institution',
    'clinicName', 'deletedAt'
  ],
  announcements: [
    'id', 'title', 'message', 'targetRole', 'priority', 'isPinned',
    'authorId', 'createdAt', 'updatedAt', 'scheduledAt', 'expiresAt', 'deletedAt'
  ]
};

const lastSyncedDocHashes = new Map();
const lastSyncedIdsByCol = new Map();
let lastSyncedTotalCount = 0;

const syncStatus = {
  enabled: false,
  lastSuccessAt: null,
  documentsWritten: 0,
  lastError: null
};

function isSyncEnabled() {
  if (forceEnableForTest) return true;
  return String(process.env.FIREBASE_SYNC_ENABLED || 'false').toLowerCase() === 'true';
}

function isTestRun() {
  if (forceEnableForTest) return false;
  return NODE_ENV === 'test' || process.argv.some(a => a.includes('test'));
}

function setSecurityEventHook(fn) {
  onSecurityEventCallback = fn;
}

function setFirestoreMock(mockClient, { enabled = true, resetState = true } = {}) {
  mockFirestoreInstance = mockClient;
  forceEnableForTest = Boolean(enabled && mockClient);
  syncStatus.enabled = forceEnableForTest;
  if (resetState) {
    lastSyncedDocHashes.clear();
    lastSyncedIdsByCol.clear();
    lastSyncedTotalCount = 0;
    syncStatus.lastSuccessAt = null;
    syncStatus.documentsWritten = 0;
    syncStatus.lastError = null;
  }
}

function sanitizeDocForCloud(colName, rawDoc) {
  const allowed = COLLECTION_FIELD_ALLOWLIST[colName] || ['id'];
  const clean = {};
  for (const key of allowed) {
    if (rawDoc[key] !== undefined) {
      clean[key] = rawDoc[key];
    }
  }
  return clean;
}

function computeDocSha256(doc) {
  return crypto.createHash('sha256').update(JSON.stringify(doc)).digest('hex');
}

function resolveServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (err) {
      logger.error('FIREBASE_ENV_JSON_INVALID', { error: err.message });
    }
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    return JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  }
  const defaultPath = path.join(DATA_DIR, 'firebase-service-account.json');
  if (fs.existsSync(defaultPath)) {
    return JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
  }
  try {
    const files = fs.readdirSync(DATA_DIR);
    const match = files.find(f => f.endsWith('.json') && f.includes('firebase-adminsdk'));
    if (match) {
      return JSON.parse(fs.readFileSync(path.join(DATA_DIR, match), 'utf8'));
    }
  } catch (_) { }
  return null;
}

function getFirestore() {
  if (mockFirestoreInstance && forceEnableForTest) {
    syncStatus.enabled = true;
    return mockFirestoreInstance;
  }
  if (!isSyncEnabled()) {
    syncStatus.enabled = false;
    if (!initialized) {
      initialized = true;
      logger.info('FIREBASE_SYNC_DISABLED', { reason: 'FIREBASE_SYNC_ENABLED is not set to true' });
    }
    return null;
  }
  if (isTestRun()) return null;
  if (initialized) return firestoreInstance;
  initialized = true;

  try {
    const serviceAccount = resolveServiceAccount();
    if (!serviceAccount) {
      syncStatus.enabled = false;
      logger.info('FIREBASE_SYNC_DISABLED', { reason: 'No service account JSON found' });
      return null;
    }

    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getFirestore: getAdminFirestore } = require('firebase-admin/firestore');
    const app = getApps().length ? getApps()[0] : initializeApp({
      credential: cert(serviceAccount)
    });
    firestoreInstance = getAdminFirestore(app);
    firestoreInstance.settings({ ignoreUndefinedProperties: true });
    syncStatus.enabled = true;
    logger.info('FIREBASE_ADMIN_INITIALIZED', { projectId: serviceAccount.project_id });
    return firestoreInstance;
  } catch (err) {
    syncStatus.enabled = false;
    syncStatus.lastError = err.message;
    logger.error('FIREBASE_INIT_FAILED', { error: err.message });
    return null;
  }
}

async function flushSnapshotToFirestore(snapshot) {
  const firestore = getFirestore();
  if (!firestore || !snapshot) return 0;

  let currentTotal = 0;
  for (const colName of SYNC_COLLECTIONS) {
    const arr = Array.isArray(snapshot[colName]) ? snapshot[colName] : [];
    currentTotal += arr.length;
  }

  // Safety guard: block sync if local document count dropped by >20% or to zero
  if (lastSyncedTotalCount > 0 && (currentTotal === 0 || currentTotal < Math.ceil(lastSyncedTotalCount * 0.8))) {
    const msg = `Blocked Firestore sync: local document count dropped from ${lastSyncedTotalCount} to ${currentTotal} (>20% drop).`;
    syncStatus.lastError = msg;
    logger.warn('FIREBASE_SYNC_BLOCKED', { previousCount: lastSyncedTotalCount, currentCount: currentTotal });
    if (typeof onSecurityEventCallback === 'function') {
      onSecurityEventCallback({
        type: 'FIREBASE_SYNC_BLOCKED',
        severity: 'high',
        details: msg,
        resolved: false
      });
    }
    return 0;
  }

  let totalWritten = 0;
  const nowIso = new Date().toISOString();

  for (const colName of SYNC_COLLECTIONS) {
    const items = Array.isArray(snapshot[colName]) ? snapshot[colName] : [];
    const colRef = firestore.collection(colName);
    const prevIds = lastSyncedIdsByCol.get(colName) || new Set();
    const currentIds = new Set();

    let batch = firestore.batch();
    let opCount = 0;

    for (const item of items) {
      if (!item || !item.id) continue;
      const docId = String(item.id);
      currentIds.add(docId);
      const sanitized = sanitizeDocForCloud(colName, item);
      const hashKey = `${colName}:${docId}`;
      const nextHash = computeDocSha256(sanitized);

      if (lastSyncedDocHashes.get(hashKey) === nextHash) {
        continue;
      }

      batch.set(colRef.doc(docId), sanitized, { merge: true });
      lastSyncedDocHashes.set(hashKey, nextHash);
      opCount++;
      totalWritten++;
      if (opCount >= 400) {
        await batch.commit();
        batch = firestore.batch();
        opCount = 0;
      }
    }

    // Soft-delete documents missing from local snapshot instead of deleting cloud data
    for (const oldId of prevIds) {
      if (!currentIds.has(oldId)) {
        const softPatch = { id: oldId, deletedAt: nowIso };
        const hashKey = `${colName}:${oldId}`;
        const nextHash = computeDocSha256(softPatch);
        if (lastSyncedDocHashes.get(hashKey) !== nextHash) {
          batch.set(colRef.doc(oldId), { deletedAt: nowIso }, { merge: true });
          lastSyncedDocHashes.set(hashKey, nextHash);
          opCount++;
          totalWritten++;
          if (opCount >= 400) {
            await batch.commit();
            batch = firestore.batch();
            opCount = 0;
          }
        }
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }
    lastSyncedIdsByCol.set(colName, currentIds);
  }

  lastSyncedTotalCount = currentTotal;
  syncStatus.lastSuccessAt = nowIso;
  syncStatus.documentsWritten += totalWritten;
  syncStatus.lastError = null;
  return totalWritten;
}

async function runWithBackoff(fn, maxAttempts = 3) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxAttempts) throw err;
      await new Promise(r => setTimeout(r, attempt * 150));
    }
  }
}

function syncDatabaseToFirestore(diskCopy) {
  if (!isSyncEnabled() || isTestRun()) return Promise.resolve(false);
  const firestore = getFirestore();
  if (!firestore) return Promise.resolve(false);

  queuedSnapshot = diskCopy;
  if (syncInProgress) return Promise.resolve(true);

  syncInProgress = true;
  return (async () => {
    try {
      while (queuedSnapshot) {
        const next = queuedSnapshot;
        queuedSnapshot = null;
        await runWithBackoff(() => flushSnapshotToFirestore(next));
      }
      return true;
    } catch (err) {
      syncStatus.lastError = err.message;
      logger.error('FIREBASE_SYNC_FAILED', { error: err.message });
      return false;
    } finally {
      syncInProgress = false;
    }
  })();
}

async function pruneSoftDeletedFromFirestore({ dryRun = true } = {}) {
  const firestore = getFirestore();
  if (!firestore) {
    return { enabled: false, dryRun, candidates: [], deletedCount: 0 };
  }
  const candidates = [];
  for (const colName of SYNC_COLLECTIONS) {
    const colRef = firestore.collection(colName);
    const snap = await colRef.get();
    for (const doc of (snap.docs || [])) {
      const data = typeof doc.data === 'function' ? doc.data() : doc.data;
      if (data && data.deletedAt) {
        candidates.push({ collection: colName, id: doc.id, deletedAt: data.deletedAt, ref: doc.ref });
      }
    }
  }
  if (!dryRun && candidates.length > 0) {
    let batch = firestore.batch();
    let count = 0;
    for (const item of candidates) {
      batch.delete(item.ref);
      lastSyncedDocHashes.delete(`${item.collection}:${item.id}`);
      count++;
      if (count >= 400) {
        await batch.commit();
        batch = firestore.batch();
        count = 0;
      }
    }
    if (count > 0) await batch.commit();
  }
  return {
    enabled: true,
    dryRun: Boolean(dryRun),
    candidates: candidates.map(c => ({ collection: c.collection, id: c.id, deletedAt: c.deletedAt })),
    deletedCount: dryRun ? 0 : candidates.length
  };
}

function getFirebaseSyncStatus() {
  return {
    ...syncStatus,
    enabled: isSyncEnabled() && Boolean(mockFirestoreInstance || resolveServiceAccount())
  };
}

module.exports = {
  getFirestore,
  syncDatabaseToFirestore,
  pruneSoftDeletedFromFirestore,
  getFirebaseSyncStatus,
  setFirestoreMock,
  setSecurityEventHook,
  sanitizeDocForCloud,
  SYNC_COLLECTIONS,
  COLLECTION_FIELD_ALLOWLIST
};
