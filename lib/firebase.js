const fs = require('fs');
const path = require('path');
const { DATA_DIR, NODE_ENV } = require('./config');
const logger = require('./logger');

let firestoreInstance = null;
let initialized = false;
let syncInProgress = false;
let queuedSnapshot = null;

const SYNC_COLLECTIONS = [
  'users',
  'requests',
  'clinicalRecords',
  'certificates',
  'auditLogs',
  'notifications',
  'announcements',
  'securityEvents',
  'backups'
];

function isTestRun() {
  return NODE_ENV === 'test' || process.argv.some(a => a.includes('test'));
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
  } catch (_) {}

  return null;
}

function getFirestore() {
  if (isTestRun()) return null;
  if (initialized) return firestoreInstance;
  initialized = true;

  try {
    const serviceAccount = resolveServiceAccount();
    if (!serviceAccount) {
      logger.info('FIREBASE_SKIPPED', { reason: 'No service account JSON found in data/ or env' });
      return null;
    }

    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getFirestore: getAdminFirestore } = require('firebase-admin/firestore');
    const app = getApps().length ? getApps()[0] : initializeApp({
      credential: cert(serviceAccount)
    });
    firestoreInstance = getAdminFirestore(app);
    firestoreInstance.settings({ ignoreUndefinedProperties: true });
    logger.info('FIREBASE_ADMIN_INITIALIZED', { projectId: serviceAccount.project_id });
    return firestoreInstance;
  } catch (err) {
    logger.error('FIREBASE_INIT_FAILED', { error: err.message });
    return null;
  }
}

async function flushSnapshotToFirestore(snapshot) {
  const firestore = getFirestore();
  if (!firestore || !snapshot) return;

  for (const colName of SYNC_COLLECTIONS) {
    const items = Array.isArray(snapshot[colName]) ? snapshot[colName] : [];
    const colRef = firestore.collection(colName);
    const existingSnap = await colRef.select().get();
    const keepIds = new Set();

    let batch = firestore.batch();
    let opCount = 0;

    for (const item of items) {
      if (!item || !item.id) continue;
      const docId = String(item.id);
      keepIds.add(docId);
      batch.set(colRef.doc(docId), item);
      opCount++;
      if (opCount >= 400) {
        await batch.commit();
        batch = firestore.batch();
        opCount = 0;
      }
    }

    for (const doc of existingSnap.docs) {
      if (!keepIds.has(doc.id)) {
        batch.delete(doc.ref);
        opCount++;
        if (opCount >= 400) {
          await batch.commit();
          batch = firestore.batch();
          opCount = 0;
        }
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }
  }

  if (snapshot.systemSettings && typeof snapshot.systemSettings === 'object') {
    await firestore.collection('systemSettings').doc('default').set(snapshot.systemSettings);
  }
}

function syncDatabaseToFirestore(diskCopy) {
  if (isTestRun()) return Promise.resolve(false);
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
        await flushSnapshotToFirestore(next);
      }
      return true;
    } catch (err) {
      logger.error('FIREBASE_SYNC_FAILED', { error: err.message });
      return false;
    } finally {
      syncInProgress = false;
    }
  })();
}

module.exports = {
  getFirestore,
  syncDatabaseToFirestore,
  SYNC_COLLECTIONS
};
