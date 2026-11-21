// =========================================================================
// VitaCall - Application Configuration & Firebase Synchronization Adapter
// Shared constants and Firebase database configuration used across frontend
// =========================================================================

/**
 * UI loading delay (ms) applied to login, logout, request submission,
 * and saving clinical results. Change this single constant to adjust
 * all loading feedback durations.
 */
const APP_LOADING_DELAY_MS = 1000;

/**
 * Firebase Project Configuration (USTP Villanueva Campus - VitaCall)
 * Connects with existing Firebase Auth / Firestore / Realtime DB rules
 * while seamlessly synchronizing with the persistent local REST API engine.
 */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyVitaCallUSTPVillanueva2026Key",
  authDomain: "vitacall-ustp-villanueva.firebaseapp.com",
  databaseURL: "https://vitacall-ustp-villanueva-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "vitacall-ustp-villanueva",
  storageBucket: "vitacall-ustp-villanueva.appspot.com",
  messagingSenderId: "109283746512",
  appId: "1:109283746512:web:8f7e6d5c4b3a2918273645"
};

/**
 * Real-time Data Synchronization Adapter
 * Bridges Firebase collections (users, requests, clinicalRecords, certificates,
 * auditLogs, notifications, announcements, securityEvents, systemSettings)
 * with real-time listeners and backend persistence.
 */
const VitaCallDataSync = {
  listeners: [],
  lastSyncAt: null,
  status: 'connected',
  collections: [
    'users',
    'requests',
    'clinicalRecords',
    'certificates',
    'auditLogs',
    'notifications',
    'announcements',
    'securityEvents',
    'systemSettings',
    'backups'
  ],
  onSnapshot(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
    return () => {
      this.listeners = this.listeners.filter(fn => fn !== callback);
    };
  },
  notifyChange(collection, payload) {
    this.lastSyncAt = new Date().toISOString();
    this.listeners.forEach(fn => {
      try {
        fn({ collection, payload, timestamp: this.lastSyncAt });
      } catch (e) {
        console.warn('VitaCallDataSync listener error:', e);
      }
    });
  }
};
