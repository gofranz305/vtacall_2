const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { DATA_DIR, DB_FILE, BACKUPS_DIR, IS_PROD } = require('./config');
const AUDIT_ARCHIVE_DIR = path.join(DATA_DIR, 'audit-archives');
const {
  encryptField,
  decryptField,
  transformSensitiveFields,
  generateHmac,
  generateId
} = require('./crypto');
const logger = require('./logger');
const { syncDatabaseToFirestore } = require('./firebase');

function getDefaultDoctorSignatureDataUrl() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="90" viewBox="0 0 320 90"><path d="M22 62 C45 20, 65 25, 72 58 C78 38, 95 30, 112 54 C128 32, 152 24, 168 55 C185 45, 215 35, 255 48 C275 53, 290 42, 302 36" fill="none" stroke="#101E38" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><text x="35" y="80" font-family="Georgia, serif" font-size="13" font-style="italic" fill="#1E3A8A">Dr. Roberto Santos, MD (PRC #0054321)</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function getDefaultPermissions(role) {
  if (role === 'admin') {
    return {
      canSubmitRequests: false,
      canViewCertificates: true,
      canUpdateProfile: true,
      canTriageRequests: false,
      canAssignNurses: false,
      canRecordVitalsAndNotes: false,
      canDiagnoseAndPrescribe: false,
      canValidateCheckups: false,
      canSignCertificates: false,
      canIssueCertificates: false,
      canRevokeCertificates: true,
      canManageUsers: true,
      canViewReports: true,
      canManageSettings: true,
      canManageSecurity: true,
      canManageData: true
    };
  }
  if (role === 'doctor') {
    return {
      canSubmitRequests: false,
      canViewCertificates: true,
      canUpdateProfile: true,
      canTriageRequests: true,
      canAssignNurses: true,
      canRecordVitalsAndNotes: true,
      canDiagnoseAndPrescribe: true,
      canValidateCheckups: true,
      canSignCertificates: true,
      canIssueCertificates: true,
      canRevokeCertificates: false,
      canManageUsers: false,
      canViewReports: true,
      canManageSettings: false,
      canManageSecurity: false,
      canManageData: false
    };
  }
  if (role === 'personnel') {
    return {
      canSubmitRequests: false,
      canViewCertificates: true,
      canUpdateProfile: true,
      canTriageRequests: false,
      canAssignNurses: false,
      canRecordVitalsAndNotes: true,
      canDiagnoseAndPrescribe: false,
      canValidateCheckups: false,
      canSignCertificates: false,
      canIssueCertificates: false,
      canRevokeCertificates: false,
      canManageUsers: false,
      canViewReports: true,
      canManageSettings: false,
      canManageSecurity: false,
      canManageData: false
    };
  }
  return {
    canSubmitRequests: true,
    canViewCertificates: true,
    canUpdateProfile: true,
    canTriageRequests: false,
    canAssignNurses: false,
    canRecordVitalsAndNotes: false,
    canDiagnoseAndPrescribe: false,
    canValidateCheckups: false,
    canSignCertificates: false,
    canIssueCertificates: false,
    canRevokeCertificates: false,
    canManageUsers: false,
    canViewReports: false,
    canManageSettings: false,
    canManageSecurity: false,
    canManageData: false
  };
}

function getDefaultUserSettings(role) {
  if (role === 'admin') {
    return {
      emailDigests: true,
      securityAlertToast: true,
      compactTables: false,
      defaultReportPeriod: 'monthly',
      autoBackupBeforeRestore: true,
      auditLogPageSize: 15,
      soundAlerts: true,
      showAnnouncements: true
    };
  }
  if (role === 'doctor') {
    return {
      dutyStatus: 'on_duty',
      autoApplySignature: true,
      defaultExcusedDays: 3,
      defaultCertValidityDays: 7,
      urgentSoundAlert: true,
      showLicenseOnCert: true,
      showAnnouncements: true,
      defaultFollowUpNote: 'Follow up at the USTP Campus Health & Wellness Center if symptoms persist after completing prescribed medication.'
    };
  }
  if (role === 'personnel') {
    return {
      dutyStatus: 'on_duty',
      responseZone: 'All Villanueva Sectors (Purok 1-6)',
      autoRefreshSec: 5,
      defaultQueueFilter: 'all',
      urgentSoundAlert: true,
      defaultExcusedDays: 3,
      showLicenseOnCert: true,
      showAnnouncements: true,
      defaultFollowUpNote: 'Advised boarding house landlord to monitor student; contact clinic if fever persists beyond 48 hours.'
    };
  }
  return {
    emailAlerts: true,
    smsAlerts: true,
    soundAlerts: true,
    showAnnouncements: true,
    shareLocationWithResponder: true,
    autoShareEmergencyOnSevere: true,
    compactView: false,
    highContrastBadges: false
  };
}

function getDefaultSystemSettings() {
  return {
    systemName: 'VitaCall',
    systemSubtitle: 'Mobile Health Request & Monitoring',
    institutionName: 'University of Science and Technology of Southern Philippines (USTP)',
    campusName: 'Villanueva Campus',
    clinicName: 'Health and Wellness Center - Off-Site Health Response Unit',
    logoUrl: 'assets/ustp-logo.svg',
    clinicHotline: '0920-111-8899',
    emergencyHotline: '0917-882-8911',
    operatingHours: 'Monday - Saturday, 7:00 AM - 7:00 PM',
    allowRegistration: true,
    requireAccountApproval: false,
    enforceUstpEmail: false,
    maxFailedLoginAttempts: 5,
    lockoutDurationMinutes: 15,
    sessionTimeoutMinutes: 30,
    maintenanceMode: false,
    maintenanceMessage: 'VitaCall is currently undergoing scheduled maintenance. Only Administrators can perform system updates at this time. For urgent medical assistance, call the Clinic Hotline at 0920-111-8899.',
    enableAnnouncementsBanner: true,
    autoNotifyPersonnelOnSevere: true,
    enableSoundAlerts: true,
    defaultCertValidityDays: 7,
    firebaseSyncEnabled: true,
    firebaseProjectId: 'vitacall-ustp-villanueva',
    updatedAt: new Date().toISOString(),
    updatedBy: 'Mr. Franz Cruz'
  };
}

let db = {
  users: [],
  requests: [],
  clinicalRecords: [],
  certificates: [],
  auditLogs: [],
  notifications: [],
  announcements: [],
  securityEvents: [],
  backups: [],
  revokedTokens: [],
  activeSessions: {},
  systemSettings: getDefaultSystemSettings()
};

function buildEncryptedDiskCopy() {
  return {
    ...db,
    users: transformSensitiveFields(db.users, encryptField),
    requests: transformSensitiveFields(db.requests, encryptField),
    clinicalRecords: transformSensitiveFields(db.clinicalRecords, encryptField),
    certificates: transformSensitiveFields(db.certificates, encryptField)
  };
}

// Atomic file write with temp file + rename to prevent partial writes + async Firestore sync
function saveDb() {
  try {
    const diskCopy = buildEncryptedDiskCopy();
    const tmpFile = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(diskCopy, null, 2), 'utf8');
    try {
      fs.renameSync(tmpFile, DB_FILE);
    } catch (renameErr) {
      if (renameErr.code === 'EPERM' || renameErr.code === 'EBUSY') {
        fs.copyFileSync(tmpFile, DB_FILE);
        try { fs.unlinkSync(tmpFile); } catch (_) { }
      } else {
        throw renameErr;
      }
    }
    syncDatabaseToFirestore(diskCopy);
  } catch (err) {
    logger.error('DB_WRITE_FAILED', { error: err.message });
  }
}

function decryptInMemoryDb() {
  if (Array.isArray(db.users)) db.users = transformSensitiveFields(db.users, decryptField);
  if (Array.isArray(db.requests)) db.requests = transformSensitiveFields(db.requests, decryptField);
  if (Array.isArray(db.clinicalRecords)) db.clinicalRecords = transformSensitiveFields(db.clinicalRecords, decryptField);
  if (Array.isArray(db.certificates)) db.certificates = transformSensitiveFields(db.certificates, decryptField);
}

function createGenesisAuditLog() {
  const payload = {
    id: 'AUD-GENESIS-001',
    timestamp: new Date().toISOString(),
    userId: 'system',
    userName: 'VitaCall System',
    userRole: 'system',
    action: 'AUDIT_CHAIN_GENESIS',
    targetEntity: 'auditLogs',
    targetId: 'GENESIS',
    details: 'Audit trail HMAC hash chain initialized from a fresh genesis entry.',
    ipAddress: '127.0.0.1',
    userAgent: 'VitaCall Security Kernel',
    prevHash: '0000000000000000000000000000000000000000000000000000000000000000'
  };
  return {
    ...payload,
    integrityHash: generateHmac(payload)
  };
}

function logAudit(req, { userId, userName, userRole, action, targetEntity, targetId, details }) {
  const prevHash = (Array.isArray(db.auditLogs) && db.auditLogs.length > 0 && db.auditLogs[0].integrityHash)
    ? db.auditLogs[0].integrityHash
    : '0000000000000000000000000000000000000000000000000000000000000000';

  const corePayload = {
    id: generateId('AUD'),
    timestamp: new Date().toISOString(),
    userId: userId || 'anonymous',
    userName: userName || 'Guest / System',
    userRole: userRole || 'system',
    action,
    targetEntity,
    targetId: targetId || 'N/A',
    details: details || '',
    ipAddress: (req && (req.ip || (req.headers && req.headers['x-forwarded-for']))) || '127.0.0.1',
    userAgent: (req && req.headers && req.headers['user-agent']) || 'VitaCall Client',
    prevHash
  };

  const logEntry = {
    ...corePayload,
    integrityHash: generateHmac(corePayload)
  };

  db.auditLogs.unshift(logEntry);
  if (db.auditLogs.length > 1000) {
    const overflow = db.auditLogs.splice(1000);
    archiveAuditEntries(overflow);
  }
  saveDb();
  logger.info('AUDIT_RECORDED', { action, targetEntity, targetId: logEntry.targetId, userId: logEntry.userId });
  return logEntry;
}

function archiveAuditEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return;
  try {
    if (!fs.existsSync(AUDIT_ARCHIVE_DIR)) {
      fs.mkdirSync(AUDIT_ARCHIVE_DIR, { recursive: true });
    }
    const dayKey = new Date().toISOString().split('T')[0];
    const archivePath = path.join(AUDIT_ARCHIVE_DIR, `audit-archive-${dayKey}.json`);
    let existing = [];
    if (fs.existsSync(archivePath)) {
      try { existing = JSON.parse(fs.readFileSync(archivePath, 'utf8')) || []; } catch (_) { }
    }
    const combined = [...entries, ...existing];
    fs.writeFileSync(archivePath, JSON.stringify(combined, null, 2), 'utf8');
  } catch (err) {
    logger.error('AUDIT_ARCHIVE_FAILED', { error: err.message });
  }
}

// Verify the entire audit trail from oldest (genesis) to newest
function verifyAuditChain() {
  const logs = Array.isArray(db.auditLogs) ? db.auditLogs : [];
  if (logs.length === 0) {
    return { valid: false, totalChecked: 0, brokenLinks: 0, tamperedEntries: [], message: 'Audit log is empty.' };
  }

  // auditLogs is newest-first; walk oldest -> newest
  const chronological = [...logs].reverse();
  const tamperedEntries = [];
  let brokenLinks = 0;

  for (let i = 0; i < chronological.length; i++) {
    const entry = chronological[i];
    const { integrityHash, ...corePayload } = entry;
    const expectedHmac = generateHmac(corePayload);

    if (integrityHash !== expectedHmac) {
      tamperedEntries.push({ id: entry.id, reason: 'HMAC_MISMATCH' });
    }

    if (i > 0) {
      const prev = chronological[i - 1];
      if (entry.prevHash !== prev.integrityHash) {
        brokenLinks++;
        tamperedEntries.push({ id: entry.id, reason: 'BROKEN_PREV_HASH_LINK' });
      }
    }
  }

  return {
    valid: tamperedEntries.length === 0 && brokenLinks === 0,
    totalChecked: chronological.length,
    brokenLinks,
    tamperedEntries,
    verifiedAt: new Date().toISOString()
  };
}

function logSecurityEvent(req, { type, severity = 'low', email = '', userId = 'anonymous', userName = 'Anonymous', userRole = 'anonymous', details = '', resolved = true }) {
  if (!Array.isArray(db.securityEvents)) db.securityEvents = [];
  const evt = {
    id: generateId('SEC'),
    timestamp: new Date().toISOString(),
    type,
    severity,
    email,
    userId,
    userName,
    userRole,
    ipAddress: (req && (req.ip || (req.headers && req.headers['x-forwarded-for']))) || '127.0.0.1',
    userAgent: (req && req.headers && req.headers['user-agent']) || 'VitaCall Client',
    details,
    resolved
  };
  db.securityEvents.unshift(evt);
  if (db.securityEvents.length > 500) {
    db.securityEvents.pop();
  }

  logger.security(type, { severity, email, userId, details });

  // Automatic security alert when unresolved high/critical events pile up (>= 3)
  const unresolvedCritical = db.securityEvents.filter(
    e => !e.resolved && ['high', 'critical'].includes(e.severity)
  );
  if (!resolved && ['high', 'critical'].includes(severity) && unresolvedCritical.length >= 3) {
    (db.users || []).filter(u => u.role === 'admin').forEach(adm => {
      createNotification(
        adm.id,
        'Security Alert: Elevated Threat Activity',
        `${unresolvedCritical.length} unresolved high/critical security events require Administrator review.`,
        'urgent',
        evt.id,
        'admin'
      );
    });
  }

  saveDb();
  return evt;
}

function createNotification(userId, title, message, type = 'info', relatedRequestId = null, targetRoute = 'dashboard') {
  if (!Array.isArray(db.notifications)) db.notifications = [];
  const notif = {
    id: generateId('NOTIF'),
    userId,
    title,
    message,
    type,
    relatedRequestId,
    targetRoute,
    isRead: false,
    createdAt: new Date().toISOString()
  };
  db.notifications.unshift(notif);
  saveDb();
  return notif;
}

function revokeToken(jti, expMs) {
  if (!jti) return;
  if (!Array.isArray(db.revokedTokens)) db.revokedTokens = [];
  const now = Date.now();
  // Prune already-expired tokens to keep list bounded
  db.revokedTokens = db.revokedTokens.filter(t => !t.expiresAt || t.expiresAt > now);
  if (!db.revokedTokens.some(t => t.jti === jti)) {
    db.revokedTokens.push({ jti, expiresAt: expMs || (now + 2 * 60 * 60 * 1000) });
  }
  if (db.activeSessions && db.activeSessions[jti]) {
    delete db.activeSessions[jti];
  }
  saveDb();
}

function isTokenRevoked(jti) {
  if (!jti || !Array.isArray(db.revokedTokens)) return false;
  return db.revokedTokens.some(t => t.jti === jti);
}

function touchSessionActivity(jti) {
  if (!jti) return;
  if (!db.activeSessions || typeof db.activeSessions !== 'object') db.activeSessions = {};
  db.activeSessions[jti] = Date.now();
}

function isSessionTimedOut(jti) {
  if (!jti || !db.activeSessions || !db.activeSessions[jti]) return false;
  const timeoutMins = (db.systemSettings && Number(db.systemSettings.sessionTimeoutMinutes)) || 30;
  return (Date.now() - db.activeSessions[jti]) > (timeoutMins * 60 * 1000);
}

function createScheduledDiskBackup() {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    const fileName = `vitacall-auto-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filePath = path.join(BACKUPS_DIR, fileName);
    const diskCopy = {
      ...db,
      users: transformSensitiveFields(db.users, encryptField),
      requests: transformSensitiveFields(db.requests, encryptField),
      clinicalRecords: transformSensitiveFields(db.clinicalRecords, encryptField),
      certificates: transformSensitiveFields(db.certificates, encryptField)
    };
    fs.writeFileSync(filePath, JSON.stringify(diskCopy, null, 2), 'utf8');

    // Keep only the 10 most recent automatic backups
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('vitacall-auto-backup-'))
      .sort()
      .reverse();
    for (let i = 10; i < files.length; i++) {
      fs.unlinkSync(path.join(BACKUPS_DIR, files[i]));
    }
    logger.info('SCHEDULED_BACKUP_CREATED', { fileName });
  } catch (err) {
    logger.error('SCHEDULED_BACKUP_FAILED', { error: err.message });
  }
}

function ensureDbSchema() {
  let changed = false;

  if (!Array.isArray(db.users)) { db.users = []; changed = true; }
  if (!Array.isArray(db.requests)) { db.requests = []; changed = true; }
  if (!Array.isArray(db.clinicalRecords)) { db.clinicalRecords = []; changed = true; }
  if (!Array.isArray(db.certificates)) { db.certificates = []; changed = true; }
  if (!Array.isArray(db.auditLogs)) { db.auditLogs = []; changed = true; }
  if (!Array.isArray(db.notifications)) { db.notifications = []; changed = true; }
  if (!Array.isArray(db.securityEvents)) { db.securityEvents = []; changed = true; }
  if (!Array.isArray(db.backups)) { db.backups = []; changed = true; }
  if (!Array.isArray(db.revokedTokens)) { db.revokedTokens = []; changed = true; }
  if (!db.activeSessions || typeof db.activeSessions !== 'object') { db.activeSessions = {}; changed = true; }

  db.users.forEach(u => {
    if ((u.id === 'usr_doc1' || (u.email && u.email.toLowerCase() === 'dr.santos@ustp.edu.ph')) && u.role !== 'doctor') {
      u.role = 'doctor';
      u.permissions = getDefaultPermissions('doctor');
      u.settings = getDefaultUserSettings('doctor');
      changed = true;
    }
    if (u.role === 'doctor' && !u.doctorSignature) {
      u.doctorSignature = getDefaultDoctorSignatureDataUrl();
      changed = true;
    }
    if (u.role === 'personnel') {
      u.permissions = {
        ...getDefaultPermissions('personnel'),
        ...(u.permissions || {}),
        canTriageRequests: false,
        canAssignNurses: false,
        canDiagnoseAndPrescribe: false,
        canSignCertificates: false,
        canIssueCertificates: false
      };
    }
    if (u.role === 'admin') {
      if (u.id === 'usr_admin1' && u.name !== 'Mr. Franz Cruz') {
        u.name = 'Mr. Franz Cruz';
        changed = true;
      }
      u.permissions = {
        ...getDefaultPermissions('admin'),
        ...(u.permissions || {}),
        canSignCertificates: false,
        canRevokeCertificates: true
      };
    }
    if (!u.status) { u.status = 'active'; changed = true; }
    if (u.mustChangePassword === undefined) { u.mustChangePassword = false; changed = true; }
    if (!u.permissions || typeof u.permissions !== 'object') {
      u.permissions = getDefaultPermissions(u.role);
      changed = true;
    } else {
      const defPerm = getDefaultPermissions(u.role);
      Object.keys(defPerm).forEach(k => {
        if (u.permissions[k] === undefined) {
          u.permissions[k] = defPerm[k];
          changed = true;
        }
      });
    }
    if (!u.settings || typeof u.settings !== 'object') {
      u.settings = getDefaultUserSettings(u.role);
      changed = true;
    } else {
      const defSet = getDefaultUserSettings(u.role);
      Object.keys(defSet).forEach(k => {
        if (u.settings[k] === undefined) {
          u.settings[k] = defSet[k];
          changed = true;
        }
      });
    }
    if (u.failedLoginAttempts === undefined) { u.failedLoginAttempts = 0; changed = true; }
    if (u.lockedUntil === undefined) { u.lockedUntil = null; changed = true; }
    if (u.lastLoginAt === undefined) {
      u.lastLoginAt = u.createdAt;
      changed = true;
    }
  });

  if (!db.systemSettings || typeof db.systemSettings !== 'object') {
    db.systemSettings = getDefaultSystemSettings();
    changed = true;
  } else {
    const defSys = getDefaultSystemSettings();
    Object.keys(defSys).forEach(k => {
      if (db.systemSettings[k] === undefined) {
        db.systemSettings[k] = defSys[k];
        changed = true;
      }
    });
  }

  if (!Array.isArray(db.announcements) || db.announcements.length === 0) {
    db.announcements = [
      {
        id: 'ANN-2026-001',
        title: 'Seasonal Flu & Dengue Surveillance Advisory for Boarding Houses',
        message: 'All boarding students in Looc, Poblacion, and Katipunan are advised to report febrile episodes (>37.8°C) immediately via VitaCall for free on-site checkups and early hydration care.',
        targetRole: 'all',
        priority: 'info',
        isPinned: true,
        authorId: 'usr_admin1',
        authorName: 'Mr. Franz Cruz',
        createdAt: '2026-11-10T08:00:00.000Z',
        updatedAt: '2026-11-10T08:00:00.000Z',
        scheduledAt: null,
        expiresAt: null
      },
      {
        id: 'ANN-2026-002',
        title: 'Mobile Medical Response Kit Restocked for Afternoon Dispatch',
        message: 'Health Personnel on duty: Mobile response kits #1 and #2 have been stocked with ORS packets, digital pulse oximeters, and antipyretics.',
        targetRole: 'personnel',
        priority: 'warning',
        isPinned: false,
        authorId: 'usr_admin1',
        authorName: 'Mr. Franz Cruz',
        createdAt: '2026-11-11T09:30:00.000Z',
        updatedAt: '2026-11-11T09:30:00.000Z',
        scheduledAt: null,
        expiresAt: null
      }
    ];
    changed = true;
  }

  if (db.auditLogs.length === 0) {
    db.auditLogs = [createGenesisAuditLog()];
    changed = true;
  }

  if (changed) {
    saveDb();
  }
}

function seedDatabase() {
  const salt = bcrypt.genSaltSync(10);
  const defaultHash = bcrypt.hashSync('password123', salt);

  db.users = [
    {
      id: 'usr_student1',
      name: 'Harvey Lloyd Pagtalunan',
      email: 'harvey.pagtalunan@ustp.edu.ph',
      passwordHash: defaultHash,
      role: 'requester',
      status: 'active',
      mustChangePassword: true,
      studentId: '2023-30192',
      courseAndYear: 'BS Information Technology - 3rd Year',
      boardingHouse: 'Villa Rosa Boarding House (Rm 4)',
      address: 'Purok 2, Looc, Villanueva, Misamis Oriental',
      landmark: 'Behind Villa Rosa Bakery, near 7-Eleven Villanueva',
      phone: '+63 917 555 0192',
      emergencyContact: { name: 'Maria Pagtalunan (Mother)', phone: '+63 918 222 3344' },
      permissions: getDefaultPermissions('requester'),
      settings: getDefaultUserSettings('requester'),
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: '2026-10-20T08:00:00.000Z'
    },
    {
      id: 'usr_student2',
      name: 'Franz Clyde Rian Go',
      email: 'franz.go@ustp.edu.ph',
      passwordHash: defaultHash,
      role: 'requester',
      status: 'active',
      mustChangePassword: true,
      studentId: '2023-30145',
      courseAndYear: 'BS Information Technology - 3rd Year',
      boardingHouse: 'Sunrise Student Dormitory (Rm 2B)',
      address: 'Purok 4, Poblacion, Villanueva, Misamis Oriental',
      landmark: 'Across Villanueva Central School, green gate',
      phone: '+63 917 555 0145',
      emergencyContact: { name: 'Ronaldo Go (Father)', phone: '+63 919 333 5566' },
      permissions: getDefaultPermissions('requester'),
      settings: getDefaultUserSettings('requester'),
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: '2026-10-22T09:30:00.000Z'
    },
    {
      id: 'usr_student3',
      name: 'Jelly Quen Maniscan',
      email: 'jelly.maniscan@ustp.edu.ph',
      passwordHash: defaultHash,
      role: 'requester',
      status: 'active',
      mustChangePassword: true,
      studentId: '2023-30208',
      courseAndYear: 'BS Information Technology - 3rd Year',
      boardingHouse: 'St. Jude Boarding House (Rm 7)',
      address: 'Purok 1, Katipunan, Villanueva, Misamis Oriental',
      landmark: 'Behind USTP Villanueva gymnasium fence',
      phone: '+63 917 555 0208',
      emergencyContact: { name: 'Lourdes Maniscan (Guardian)', phone: '+63 920 444 6677' },
      permissions: getDefaultPermissions('requester'),
      settings: getDefaultUserSettings('requester'),
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: '2026-10-24T10:15:00.000Z'
    },
    {
      id: 'usr_nurse1',
      name: 'Nurse Sarah Alcantara, RN',
      email: 'nurse.sarah@ustp.edu.ph',
      passwordHash: defaultHash,
      role: 'personnel',
      status: 'active',
      mustChangePassword: true,
      title: 'Campus Health Nurse - Off-Site Response Team',
      licenseNumber: 'PRC RN-0982341',
      phone: '+63 920 111 8899',
      permissions: getDefaultPermissions('personnel'),
      settings: getDefaultUserSettings('personnel'),
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: '2026-10-01T08:00:00.000Z'
    },
    {
      id: 'usr_doc1',
      name: 'Dr. Roberto Santos, MD',
      email: 'dr.santos@ustp.edu.ph',
      passwordHash: defaultHash,
      role: 'doctor',
      status: 'active',
      mustChangePassword: true,
      title: 'USTP Campus Physician / Medical Officer',
      licenseNumber: 'PRC MD-0054321',
      phone: '+63 922 444 7788',
      doctorSignature: getDefaultDoctorSignatureDataUrl(),
      permissions: getDefaultPermissions('doctor'),
      settings: getDefaultUserSettings('doctor'),
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: '2026-10-01T08:00:00.000Z'
    },
    {
      id: 'usr_admin1',
      name: 'Mr. Franz Cruz',
      email: 'admin.clinic@ustp.edu.ph',
      passwordHash: defaultHash,
      role: 'admin',
      status: 'active',
      mustChangePassword: true,
      title: 'Director of Student Health & Wellness Center',
      licenseNumber: 'USTP-ADMIN-001',
      phone: '+63 917 888 9900',
      permissions: getDefaultPermissions('admin'),
      settings: getDefaultUserSettings('admin'),
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: '2026-10-01T08:00:00.000Z'
    }
  ];

  db.requests = [];
  db.clinicalRecords = [];
  db.certificates = [];
  db.notifications = [];
  db.securityEvents = [];
  db.backups = [];
  db.revokedTokens = [];
  db.activeSessions = {};
  db.auditLogs = [createGenesisAuditLog()];

  ensureDbSchema();
  saveDb();
}

function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(raw);
      decryptInMemoryDb();
      ensureDbSchema();
      saveDb();
    } catch (e) {
      logger.error('DB_LOAD_ERROR', { error: e.message });
      if (!IS_PROD) {
        seedDatabase();
      } else {
        db.auditLogs = [createGenesisAuditLog()];
        ensureDbSchema();
        saveDb();
      }
    }
  } else if (!IS_PROD) {
    seedDatabase();
  } else {
    // Production: do NOT seed password123 demo accounts
    db.users = [];
    db.requests = [];
    db.clinicalRecords = [];
    db.certificates = [];
    db.notifications = [];
    db.securityEvents = [];
    db.backups = [];
    db.revokedTokens = [];
    db.activeSessions = {};
    db.auditLogs = [createGenesisAuditLog()];
    ensureDbSchema();
    saveDb();
  }
}

loadDb();

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

module.exports = {
  getDb: () => db,
  setDb: (nextDb) => { db = nextDb; },
  saveDb,
  loadDb,
  seedDatabase,
  ensureDbSchema,
  sanitizeUser,
  getDefaultPermissions,
  getDefaultUserSettings,
  getDefaultSystemSettings,
  getDefaultDoctorSignatureDataUrl,
  createGenesisAuditLog,
  logAudit,
  verifyAuditChain,
  logSecurityEvent,
  createNotification,
  revokeToken,
  isTokenRevoked,
  touchSessionActivity,
  isSessionTimedOut,
  createScheduledDiskBackup,
  syncNowToFirestore: () => syncDatabaseToFirestore(buildEncryptedDiskCopy())
};
