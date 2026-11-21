const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'vitacall-ustp-secure-secret-2026';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(JWT_SECRET + '-at-rest-aes256').digest();
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'vitacall-db.json');
const SERVER_START_TIME = Date.now();

// AES-256-GCM Encryption at Rest for Sensitive Medical Fields
// (diagnosis, prescribedMedication, prescriptionAndCare, nurseNotes, symptomsObserved, doctorSignature)
function encryptField(plaintext) {
  if (plaintext === undefined || plaintext === null || plaintext === '') return plaintext;
  const str = String(plaintext);
  if (str.startsWith('ENC:v1:')) return str;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(str, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `ENC:v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptField(ciphertext) {
  if (ciphertext === undefined || ciphertext === null || ciphertext === '') return ciphertext;
  const str = String(ciphertext);
  if (!str.startsWith('ENC:v1:')) return str;
  try {
    const parts = str.split(':');
    if (parts.length < 5) return str;
    const iv = Buffer.from(parts[2], 'hex');
    const authTag = Buffer.from(parts[3], 'hex');
    const encryptedHex = parts.slice(4).join(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.warn('Decryption fallback warning:', err.message);
    return str;
  }
}

const SENSITIVE_MEDICAL_FIELDS = [
  'diagnosis',
  'prescribedMedication',
  'prescriptionAndCare',
  'nurseNotes',
  'symptomsObserved',
  'doctorSignature'
];

function transformSensitiveFields(obj, fn) {
  if (!obj || typeof obj !== 'object') return obj;
  const copy = Array.isArray(obj) ? [...obj] : { ...obj };
  if (Array.isArray(copy)) {
    return copy.map(item => transformSensitiveFields(item, fn));
  }
  for (const key of Object.keys(copy)) {
    if (SENSITIVE_MEDICAL_FIELDS.includes(key) && typeof copy[key] === 'string' && copy[key].length > 0) {
      copy[key] = fn(copy[key]);
    }
  }
  return copy;
}

function getDefaultDoctorSignatureDataUrl() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="90" viewBox="0 0 320 90"><path d="M22 62 C45 20, 65 25, 72 58 C78 38, 95 30, 112 54 C128 32, 152 24, 168 55 C185 45, 215 35, 255 48 C275 53, 290 42, 302 36" fill="none" stroke="#101E38" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><text x="35" y="80" font-family="Georgia, serif" font-size="13" font-style="italic" fill="#1E3A8A">Dr. Roberto Santos, MD (PRC #0054321)</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Default granular permissions by role
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
  // Default: requester / student
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

// Default dashboard settings by role
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
  // Default: requester / student
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

// In-Memory Database with JSON disk persistence
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
  systemSettings: getDefaultSystemSettings()
};

function saveDb() {
  try {
    const diskCopy = {
      ...db,
      users: transformSensitiveFields(db.users, encryptField),
      clinicalRecords: transformSensitiveFields(db.clinicalRecords, encryptField),
      certificates: transformSensitiveFields(db.certificates, encryptField)
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(diskCopy, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing to DB file:', err);
  }
}

function decryptInMemoryDb() {
  if (Array.isArray(db.users)) {
    db.users = transformSensitiveFields(db.users, decryptField);
  }
  if (Array.isArray(db.clinicalRecords)) {
    db.clinicalRecords = transformSensitiveFields(db.clinicalRecords, decryptField);
  }
  if (Array.isArray(db.certificates)) {
    db.certificates = transformSensitiveFields(db.certificates, decryptField);
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

  // Migrate Dr. Roberto Santos, MD to dedicated 'doctor' role & ensure default digital signature
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
      // Enforce updated nurse permissions
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
      // Admin cannot sign or send certificates on a doctor's behalf
      u.permissions = {
        ...getDefaultPermissions('admin'),
        ...(u.permissions || {}),
        canSignCertificates: false,
        canRevokeCertificates: true
      };
    }
  });

  if (Array.isArray(db.announcements)) {
    db.announcements.forEach(a => {
      if (a.authorId === 'usr_admin1' && a.authorName !== 'Mr. Franz Cruz') {
        a.authorName = 'Mr. Franz Cruz';
        changed = true;
      }
    });
  }

  // Ensure a second Campus Nurse exists so Doctor can choose among multiple nurses
  if (!db.users.some(u => u.id === 'usr_nurse2' || (u.email && u.email.toLowerCase() === 'nurse.mark@ustp.edu.ph'))) {
    const salt = bcrypt.genSaltSync(10);
    db.users.push({
      id: 'usr_nurse2',
      name: 'Nurse Mark Villanueva, RN',
      email: 'nurse.mark@ustp.edu.ph',
      passwordHash: bcrypt.hashSync('password123', salt),
      role: 'personnel',
      status: 'active',
      title: 'Campus Health Nurse - Field Response Unit',
      licenseNumber: 'PRC RN-0994120',
      phone: '+63 921 333 4455',
      permissions: getDefaultPermissions('personnel'),
      settings: getDefaultUserSettings('personnel'),
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: '2026-10-02T08:00:00.000Z'
    });
    changed = true;
  }

  // Enrich users with status, permissions, settings, login security metadata
  db.users.forEach(u => {
    if (!u.status) {
      u.status = 'active';
      changed = true;
    }
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
      // Derive from auditLogs if available
      const lastLoginLog = (db.auditLogs || []).find(l => l.userId === u.id && l.action === 'USER_LOGIN');
      u.lastLoginAt = lastLoginLog ? lastLoginLog.timestamp : u.createdAt;
      changed = true;
    }
  });

  // Ensure systemSettings
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

  // Ensure announcements
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

  // Ensure securityEvents
  if (!Array.isArray(db.securityEvents) || db.securityEvents.length === 0) {
    const derivedEvents = (db.auditLogs || [])
      .filter(l => ['USER_LOGIN', 'USER_LOGOUT', 'CERTIFICATE_VERIFY_FAILED', 'PROFILE_UPDATED'].includes(l.action))
      .slice(0, 15)
      .map((l, idx) => ({
        id: `SEC-2026-${100 + idx}`,
        timestamp: l.timestamp,
        type: l.action === 'USER_LOGIN' ? 'LOGIN_SUCCESS' : (l.action === 'CERTIFICATE_VERIFY_FAILED' ? 'SUSPICIOUS_ACTIVITY' : l.action),
        severity: l.action === 'CERTIFICATE_VERIFY_FAILED' ? 'medium' : 'low',
        email: (db.users.find(u => u.id === l.userId) || {}).email || 'system@ustp.edu.ph',
        userId: l.userId,
        userName: l.userName,
        userRole: l.userRole,
        ipAddress: l.ipAddress || '127.0.0.1',
        userAgent: l.userAgent || 'VitaCall Client',
        details: l.details,
        resolved: true
      }));

    // Add a realistic sample failed login event for monitoring visibility
    derivedEvents.unshift({
      id: 'SEC-2026-099',
      timestamp: '2026-11-12T03:15:00.000Z',
      type: 'LOGIN_FAILED',
      severity: 'medium',
      email: 'unknown.visitor@ustp.edu.ph',
      userId: 'anonymous',
      userName: 'Unrecognized Account Attempt',
      userRole: 'anonymous',
      ipAddress: '192.168.1.104',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      details: 'Failed login attempt: invalid credentials submitted for unknown.visitor@ustp.edu.ph.',
      resolved: false
    });

    db.securityEvents = derivedEvents;
    changed = true;
  }

  // Ensure backups array
  if (!Array.isArray(db.backups)) {
    db.backups = [];
    changed = true;
  }

  if (changed) {
    saveDb();
  }
}

function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(raw);
      decryptInMemoryDb();
      ensureDbSchema();
      saveDb();
      console.log('Database loaded from disk, decrypted into memory, and schema verified.');
    } catch (e) {
      console.error('Failed reading DB file, re-initializing seed:', e);
      seedDatabase();
    }
  } else {
    seedDatabase();
  }
}

// SHA256 helper for integrity
function generateHash(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

// Audit logger helper
function logAudit(req, { userId, userName, userRole, action, targetEntity, targetId, details }) {
  const logEntry = {
    id: 'AUD-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    timestamp: new Date().toISOString(),
    userId: userId || 'anonymous',
    userName: userName || 'Guest / System',
    userRole: userRole || 'system',
    action,
    targetEntity,
    targetId: targetId || 'N/A',
    details: details || '',
    ipAddress: (req && (req.ip || (req.headers && req.headers['x-forwarded-for']))) || '127.0.0.1',
    userAgent: (req && req.headers && req.headers['user-agent']) || 'VitaCall Client'
  };
  logEntry.integrityHash = generateHash(logEntry);
  db.auditLogs.unshift(logEntry);

  // Keep audit logs to reasonable size in memory
  if (db.auditLogs.length > 1000) {
    db.auditLogs.pop();
  }
  saveDb();
  return logEntry;
}

// Security event logger helper
function logSecurityEvent(req, { type, severity = 'low', email = '', userId = 'anonymous', userName = 'Anonymous', userRole = 'anonymous', details = '', resolved = true }) {
  if (!Array.isArray(db.securityEvents)) db.securityEvents = [];
  const evt = {
    id: 'SEC-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
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
  saveDb();
  return evt;
}

// Create in-app notification
function createNotification(userId, title, message, type = 'info', relatedRequestId = null, targetRoute = 'dashboard') {
  const notif = {
    id: 'NOTIF-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
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

// Seed realistic USTP Villanueva campus data
function seedDatabase() {
  const salt = bcrypt.genSaltSync(10);
  const defaultHash = bcrypt.hashSync('password123', salt);

  db.users = [
    // Students / Requesters
    {
      id: 'usr_student1',
      name: 'Harvey Lloyd Pagtalunan',
      email: 'harvey.pagtalunan@ustp.edu.ph',
      passwordHash: defaultHash,
      role: 'requester',
      status: 'active',
      studentId: '2023-30192',
      courseAndYear: 'BS Information Technology - 3rd Year',
      boardingHouse: 'Villa Rosa Boarding House (Rm 4)',
      address: 'Purok 2, Looc, Villanueva, Misamis Oriental',
      landmark: 'Behind Villa Rosa Bakery, near 7-Eleven Villanueva',
      phone: '+63 917 555 0192',
      emergencyContact: {
        name: 'Maria Pagtalunan (Mother)',
        phone: '+63 918 222 3344'
      },
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
      studentId: '2023-30145',
      courseAndYear: 'BS Information Technology - 3rd Year',
      boardingHouse: 'Sunrise Student Dormitory (Rm 2B)',
      address: 'Purok 4, Poblacion, Villanueva, Misamis Oriental',
      landmark: 'Across Villanueva Central School, green gate',
      phone: '+63 917 555 0145',
      emergencyContact: {
        name: 'Ronaldo Go (Father)',
        phone: '+63 919 333 5566'
      },
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
      studentId: '2023-30208',
      courseAndYear: 'BS Information Technology - 3rd Year',
      boardingHouse: 'St. Jude Boarding House (Rm 7)',
      address: 'Purok 1, Katipunan, Villanueva, Misamis Oriental',
      landmark: 'Behind USTP Villanueva gymnasium fence',
      phone: '+63 917 555 0208',
      emergencyContact: {
        name: 'Lourdes Maniscan (Guardian)',
        phone: '+63 920 444 6677'
      },
      permissions: getDefaultPermissions('requester'),
      settings: getDefaultUserSettings('requester'),
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: '2026-10-24T10:15:00.000Z'
    },
    // Health Personnel
    {
      id: 'usr_nurse1',
      name: 'Nurse Sarah Alcantara, RN',
      email: 'nurse.sarah@ustp.edu.ph',
      passwordHash: defaultHash,
      role: 'personnel',
      status: 'active',
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
    // Health Center Administrator
    {
      id: 'usr_admin1',
      name: 'Mr. Franz Cruz',
      email: 'admin.clinic@ustp.edu.ph',
      passwordHash: defaultHash,
      role: 'admin',
      status: 'active',
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

  // Requests
  db.requests = [
    {
      id: 'REQ-2026-1001',
      userId: 'usr_student1',
      studentName: 'Harvey Lloyd Pagtalunan',
      studentId: '2023-30192',
      courseAndYear: 'BS Information Technology - 3rd Year',
      phone: '+63 917 555 0192',
      boardingHouse: 'Villa Rosa Boarding House (Rm 4)',
      address: 'Purok 2, Looc, Villanueva, Misamis Oriental',
      landmark: 'Behind Villa Rosa Bakery, near 7-Eleven Villanueva',
      urgency: 'moderate',
      symptoms: ['High Fever (38.8°C)', 'Severe Chills', 'Body Aches', 'Dizziness'],
      symptomDetails: 'Started yesterday evening after rain. High fever not breaking with OTC paracetamol. Unable to walk to campus clinic, no companion in boarding house today.',
      temperature: '38.8',
      canWalk: false,
      hasCompanion: false,
      preferredTime: 'Morning (Urgent)',
      status: 'completed',
      assignedTo: {
        id: 'usr_nurse1',
        name: 'Nurse Sarah Alcantara, RN',
        phone: '+63 920 111 8899'
      },
      timeline: [
        { status: 'pending', timestamp: '2026-10-28T07:30:00.000Z', notes: 'Request submitted by student.' },
        { status: 'assigned', timestamp: '2026-10-28T07:45:00.000Z', notes: 'Accepted by Nurse Sarah Alcantara.' },
        { status: 'en_route', timestamp: '2026-10-28T08:05:00.000Z', notes: 'Nurse en route to Villa Rosa Boarding House with mobile kit.' },
        { status: 'in_progress', timestamp: '2026-10-28T08:20:00.000Z', notes: 'Arrived on-site. Physical checkup and vitals measurement in progress.' },
        { status: 'completed', timestamp: '2026-10-28T08:50:00.000Z', notes: 'Clinical checkup recorded and Medical Certificate issued.' }
      ],
      createdAt: '2026-10-28T07:30:00.000Z',
      completedAt: '2026-10-28T08:50:00.000Z',
      certificateId: 'CERT-USTP-2026-001'
    },
    {
      id: 'REQ-2026-1002',
      userId: 'usr_student2',
      studentName: 'Franz Clyde Rian Go',
      studentId: '2023-30145',
      courseAndYear: 'BS Information Technology - 3rd Year',
      phone: '+63 917 555 0145',
      boardingHouse: 'Sunrise Student Dormitory (Rm 2B)',
      address: 'Purok 4, Poblacion, Villanueva, Misamis Oriental',
      landmark: 'Across Villanueva Central School, green gate',
      urgency: 'severe',
      symptoms: ['Acute Gastroenteritis / Diarrhea', 'Vomiting', 'Abdominal Cramps', 'Severe Weakness'],
      symptomDetails: 'Frequent watery stools and vomiting since 3 AM. Feeling very dehydrated, faint when standing up. Roommate attending class and left rehydration salts.',
      temperature: '37.8',
      canWalk: false,
      hasCompanion: false,
      preferredTime: 'As soon as possible',
      status: 'in_progress',
      assignedTo: {
        id: 'usr_nurse1',
        name: 'Nurse Sarah Alcantara, RN',
        phone: '+63 920 111 8899'
      },
      timeline: [
        { status: 'pending', timestamp: '2026-10-29T06:15:00.000Z', notes: 'Request submitted.' },
        { status: 'assigned', timestamp: '2026-10-29T06:30:00.000Z', notes: 'Triage reviewed, marked High Urgency. Assigned to Nurse Sarah.' },
        { status: 'en_route', timestamp: '2026-10-29T06:50:00.000Z', notes: 'Personnel traveling to Sunrise Student Dormitory.' },
        { status: 'in_progress', timestamp: '2026-10-29T07:10:00.000Z', notes: 'Currently conducting checkup and administering ORS solution.' }
      ],
      createdAt: '2026-10-29T06:15:00.000Z',
      completedAt: null,
      certificateId: null
    },
    {
      id: 'REQ-2026-1003',
      userId: 'usr_student3',
      studentName: 'Jelly Quen Maniscan',
      studentId: '2023-30208',
      courseAndYear: 'BS Information Technology - 3rd Year',
      phone: '+63 917 555 0208',
      boardingHouse: 'St. Jude Boarding House (Rm 7)',
      address: 'Purok 1, Katipunan, Villanueva, Misamis Oriental',
      landmark: 'Behind USTP Villanueva gymnasium fence',
      urgency: 'moderate',
      symptoms: ['Persistent Dry Cough', 'Sore Throat', 'Mild Headache', 'Fatigue'],
      symptomDetails: 'Started 2 days ago. Cough worsens at night. Throat is painful to swallow. Need checkup and excuse slip for missed Laboratory classes.',
      temperature: '37.6',
      canWalk: true,
      hasCompanion: false,
      preferredTime: '10:00 AM - 12:00 PM',
      status: 'pending',
      assignedTo: null,
      timeline: [
        { status: 'pending', timestamp: '2026-10-29T07:45:00.000Z', notes: 'Request submitted, waiting for health personnel assignment.' }
      ],
      createdAt: '2026-10-29T07:45:00.000Z',
      completedAt: null,
      certificateId: null
    }
  ];

  // Clinical Record for Completed Request 1
  db.clinicalRecords = [
    {
      id: 'CR-2026-1001',
      requestId: 'REQ-2026-1001',
      patientId: 'usr_student1',
      patientName: 'Harvey Lloyd Pagtalunan',
      studentId: '2023-30192',
      examinerId: 'usr_nurse1',
      examinerName: 'Nurse Sarah Alcantara, RN',
      examinerTitle: 'Campus Health Nurse - Off-Site Response Team',
      examinerLicense: 'PRC RN-0982341',
      dateExamined: '2026-10-28T08:35:00.000Z',
      vitals: {
        bp: '118/76 mmHg',
        temp: '38.6 °C',
        pulse: '86 bpm',
        respRate: '19 cpm',
        spo2: '98 %'
      },
      symptomsObserved: 'Flushed face, warm to touch, mild conjunctival injection, non-exudative pharyngeal erythema, clear lungs bilaterally.',
      diagnosis: 'Acute Upper Respiratory Tract Infection (URTI) with High Febrile Episode',
      prescriptionAndCare: '1. Paracetamol 500mg tab: 1 tab PO every 4-6 hours for fever > 37.8°C.\n2. Oral Rehydration Solution: 1 packet in 1 Liter clean water; drink frequently.\n3. Cetirizine 10mg: 1 tab once daily at bedtime for 3 days.\n4. Strict bed rest in well-ventilated boarding room; isolate temporarily from dorm mates.',
      excusedDuration: {
        isExcused: true,
        startDate: '2026-10-28',
        endDate: '2026-10-30',
        daysCount: 3,
        reason: 'Student is medically unfit for academic activities and physical attendance due to acute febrile viral illness.'
      },
      remarks: 'Student evaluated on-site in boarding room. Vital signs stabilized after initial physical cooling and hydration. Dorm landlord notified to assist if fever spikes.'
    }
  ];

  // Certificates
  const sampleCert = {
    id: 'CERT-USTP-2026-001',
    verificationCode: 'USTP-VC-98421',
    integrityHash: '8b7f29c4e019b8417f7634f19b2a7590d0b0f796417d7b4a282f18ef446d7b88',
    requestId: 'REQ-2026-1001',
    clinicalRecordId: 'CR-2026-1001',
    studentName: 'Harvey Lloyd Pagtalunan',
    studentId: '2023-30192',
    courseAndYear: 'BS Information Technology - 3rd Year',
    boardingHouse: 'Villa Rosa Boarding House (Rm 4), Purok 2, Looc, Villanueva',
    issuedAt: '2026-10-28T08:50:00.000Z',
    validUntil: '2026-11-04T23:59:59.000Z',
    issuerName: 'Nurse Sarah Alcantara, RN',
    issuerLicense: 'PRC RN-0982341',
    approverName: 'Dr. Roberto Santos, MD',
    approverLicense: 'PRC MD-0054321 - Campus Physician',
    diagnosis: 'Acute Upper Respiratory Tract Infection (URTI) with High Febrile Episode',
    vitalSignsSummary: 'BP: 118/76 mmHg | Temp: 38.6 °C | Pulse: 86 bpm | SpO2: 98%',
    recommendations: 'Strict bed rest and home isolation for 3 days. Prescribed symptomatic antipyretics and oral hydration.',
    excusedDates: 'October 28, 2026 to October 30, 2026 (3 Days)',
    status: 'valid',
    institution: 'University of Science and Technology of Southern Philippines (USTP) - Villanueva Campus',
    clinicName: 'Health and Wellness Center - Off-Site Health Response Unit'
  };

  db.certificates = [sampleCert];

  // Initial Audit Logs
  db.auditLogs = [
    {
      id: 'AUD-001',
      timestamp: '2026-10-28T07:30:00.000Z',
      userId: 'usr_student1',
      userName: 'Harvey Lloyd Pagtalunan',
      userRole: 'requester',
      action: 'REQUEST_CREATED',
      targetEntity: 'request',
      targetId: 'REQ-2026-1001',
      details: 'Off-site health checkup request submitted for Villa Rosa Boarding House.',
      ipAddress: '192.168.1.45',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)',
      integrityHash: 'c4ca4238a0b923820dcc509a6f75849b'
    },
    {
      id: 'AUD-002',
      timestamp: '2026-10-28T07:45:00.000Z',
      userId: 'usr_nurse1',
      userName: 'Nurse Sarah Alcantara, RN',
      userRole: 'personnel',
      action: 'REQUEST_ASSIGNED',
      targetEntity: 'request',
      targetId: 'REQ-2026-1001',
      details: 'Personnel accepted boarding house checkup assignment.',
      ipAddress: '192.168.1.12',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      integrityHash: 'c81e728d9d4c2f636f067f89cc14862c'
    },
    {
      id: 'AUD-003',
      timestamp: '2026-10-28T08:45:00.000Z',
      userId: 'usr_nurse1',
      userName: 'Nurse Sarah Alcantara, RN',
      userRole: 'personnel',
      action: 'CLINICAL_RECORD_RECORDED',
      targetEntity: 'clinicalRecord',
      targetId: 'CR-2026-1001',
      details: 'Vitals and diagnosis recorded: Acute URTI with Febrile Episode.',
      ipAddress: '192.168.1.12',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      integrityHash: 'eccbc87e4b5ce2fe28308fd9f2a7baf3'
    },
    {
      id: 'AUD-004',
      timestamp: '2026-10-28T08:50:00.000Z',
      userId: 'usr_nurse1',
      userName: 'Nurse Sarah Alcantara, RN',
      userRole: 'personnel',
      action: 'CERTIFICATE_ISSUED',
      targetEntity: 'certificate',
      targetId: 'CERT-USTP-2026-001',
      details: 'Tamper-resistant Medical Certificate generated with Code USTP-VC-98421.',
      ipAddress: '192.168.1.12',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      integrityHash: 'a87ff679a2f3e71d9181a67b7542122c'
    }
  ];

  // Notifications
  db.notifications = [
    {
      id: 'NOTIF-01',
      userId: 'usr_student1',
      title: 'Medical Certificate Ready',
      message: 'Your official USTP Medical Certificate (USTP-VC-98421) has been issued. You can view or download it now.',
      type: 'success',
      relatedRequestId: 'REQ-2026-1001',
      targetRoute: 'dashboard',
      isRead: true,
      createdAt: '2026-10-28T08:50:00.000Z'
    },
    {
      id: 'NOTIF-02',
      userId: 'usr_student2',
      title: 'Health Personnel En Route',
      message: 'Nurse Sarah Alcantara is en route to Sunrise Student Dormitory.',
      type: 'info',
      relatedRequestId: 'REQ-2026-1002',
      targetRoute: 'dashboard',
      isRead: false,
      createdAt: '2026-10-29T06:50:00.000Z'
    }
  ];

  ensureDbSchema();
  saveDb();
  console.log('Database seeded with USTP Villanueva sample data.');
}

loadDb();

// JWT Middleware (supports Bearer header or ?token= query param for downloads)
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired session token' });
    const user = db.users.find(u => u.id === decodedUser.id);
    if (!user) return res.status(403).json({ error: 'User no longer exists' });
    if (user.status === 'inactive') {
      return res.status(403).json({ error: 'Account has been deactivated by an administrator' });
    }
    req.user = user;
    next();
  });
}

// Role Authorization Middleware
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      logSecurityEvent(req, {
        type: 'UNAUTHORIZED_ACCESS',
        severity: 'high',
        email: req.user ? req.user.email : 'anonymous',
        userId: req.user ? req.user.id : 'anonymous',
        userName: req.user ? req.user.name : 'Anonymous',
        userRole: req.user ? req.user.role : 'anonymous',
        details: `Unauthorized access attempt to restricted endpoint ${req.method} ${req.originalUrl}. Required role: ${roles.join(', ')}`,
        resolved: false
      });
      return res.status(403).json({ error: 'Access denied: insufficient privileges' });
    }
    next();
  };
}

// Helper to strip passwordHash from user object
function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

// ======================= PUBLIC & LANDING API ROUTES =======================

// Public Landing Page & System Metadata
app.get('/api/public/landing-info', (req, res) => {
  const settings = db.systemSettings || getDefaultSystemSettings();
  const activeAnnouncements = (db.announcements || []).filter(a => a.targetRole === 'all');
  const uniqueDorms = new Set(db.requests.map(r => (r.boardingHouse || '').split('(')[0].trim()).filter(Boolean));

  res.json({
    systemSettings: settings,
    announcements: activeAnnouncements,
    metrics: {
      totalUsers: db.users.length,
      totalStudents: db.users.filter(u => u.role === 'requester').length,
      totalPersonnel: db.users.filter(u => u.role === 'personnel').length,
      totalRequests: db.requests.length,
      completedCheckups: db.requests.filter(r => r.status === 'completed').length,
      certificatesIssued: db.certificates.length,
      boardingHousesCovered: Math.max(uniqueDorms.size, 5)
    },
    firebase: {
      projectId: settings.firebaseProjectId || 'vitacall-ustp-villanueva',
      syncEnabled: Boolean(settings.firebaseSyncEnabled),
      rulesEnforced: true
    }
  });
});

// Active Announcements for Current User or Public
app.get('/api/announcements', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  let userRole = 'public';
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const found = db.users.find(u => u.id === decoded.id);
      if (found) userRole = found.role;
    } catch (_) {}
  }

  let list = [...(db.announcements || [])];
  if (userRole !== 'admin') {
    list = list.filter(a => a.targetRole === 'all' || a.targetRole === userRole);
  }
  list.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  res.json(list);
});

// ======================= AUTHENTICATION ROUTES =======================

// 1. Auth: Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const user = db.users.find(u => u.email.toLowerCase() === cleanEmail);
  if (!user) {
    logAudit(req, {
      userId: 'anonymous',
      userName: cleanEmail,
      userRole: 'anonymous',
      action: 'LOGIN_FAILED',
      targetEntity: 'user',
      targetId: cleanEmail,
      details: `Failed login attempt: account with email ${cleanEmail} does not exist.`
    });
    logSecurityEvent(req, {
      type: 'LOGIN_FAILED',
      severity: 'medium',
      email: cleanEmail,
      details: `Failed login attempt for unregistered email ${cleanEmail}.`,
      resolved: false
    });
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Check account lockout
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    const minsLeft = Math.ceil((new Date(user.lockedUntil) - new Date()) / 60000);
    logSecurityEvent(req, {
      type: 'ACCOUNT_LOCKED',
      severity: 'high',
      email: user.email,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      details: `Login blocked for locked account ${user.email} (${minsLeft} min remaining).`,
      resolved: false
    });
    return res.status(403).json({
      error: `Account is temporarily locked due to multiple failed login attempts. Try again in ${minsLeft} minute(s) or contact an Administrator.`
    });
  }

  // Check account status
  if (user.status === 'inactive') {
    logAudit(req, {
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'LOGIN_FAILED',
      targetEntity: 'user',
      targetId: user.id,
      details: `Blocked login attempt on deactivated account (${user.email}).`
    });
    logSecurityEvent(req, {
      type: 'SUSPICIOUS_ACTIVITY',
      severity: 'medium',
      email: user.email,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      details: `Attempted login on deactivated account ${user.email}.`,
      resolved: false
    });
    return res.status(403).json({ error: 'Your account is currently deactivated. Please contact the Health Center Administrator.' });
  }

  if (user.status === 'pending') {
    return res.status(403).json({ error: 'Your account is pending administrator approval. Please wait for activation.' });
  }

  // Check maintenance mode for non-admins
  if (db.systemSettings && db.systemSettings.maintenanceMode && user.role !== 'admin') {
    return res.status(503).json({
      error: db.systemSettings.maintenanceMessage || 'System is currently under maintenance. Only Administrators can sign in right now.'
    });
  }

  const validPassword = bcrypt.compareSync(password, user.passwordHash);
  if (!validPassword) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    const maxAttempts = (db.systemSettings && db.systemSettings.maxFailedLoginAttempts) || 5;
    const lockoutMins = (db.systemSettings && db.systemSettings.lockoutDurationMinutes) || 15;

    let lockMsg = '';
    if (user.failedLoginAttempts >= maxAttempts) {
      user.lockedUntil = new Date(Date.now() + lockoutMins * 60 * 1000).toISOString();
      lockMsg = ` Account locked for ${lockoutMins} minutes after ${user.failedLoginAttempts} failed attempts.`;
      logSecurityEvent(req, {
        type: 'ACCOUNT_LOCKED',
        severity: 'critical',
        email: user.email,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        details: `Account ${user.email} automatically locked after ${user.failedLoginAttempts} consecutive failed password attempts.`,
        resolved: false
      });
    } else {
      logSecurityEvent(req, {
        type: 'LOGIN_FAILED',
        severity: user.failedLoginAttempts >= 3 ? 'high' : 'medium',
        email: user.email,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        details: `Failed password attempt (${user.failedLoginAttempts}/${maxAttempts}) for ${user.email}.`,
        resolved: false
      });
    }

    saveDb();
    logAudit(req, {
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'LOGIN_FAILED',
      targetEntity: 'user',
      targetId: user.id,
      details: `Invalid password entered (${user.failedLoginAttempts}/${maxAttempts}).${lockMsg}`
    });

    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Successful login: reset lock/failed counters
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date().toISOString();
  user.lastLoginIp = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  saveDb();

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  logAudit(req, {
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: 'USER_LOGIN',
    targetEntity: 'user',
    targetId: user.id,
    details: `User logged in successfully via web interface.`
  });

  logSecurityEvent(req, {
    type: 'LOGIN_SUCCESS',
    severity: 'low',
    email: user.email,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    details: `Authenticated session started for ${user.name} (${user.role}).`,
    resolved: true
  });

  const { passwordHash, ...safeUser } = user;
  res.json({ token, user: safeUser, systemSettings: db.systemSettings });
});

// Auth: Register (Students / Citizens)
app.post('/api/auth/register', (req, res) => {
  if (db.systemSettings && db.systemSettings.allowRegistration === false) {
    return res.status(403).json({ error: 'Public student self-registration is currently disabled by the Administrator.' });
  }

  const { name, email, password, studentId, courseAndYear, boardingHouse, address, landmark, phone, emergencyContact } = req.body;

  if (!name || !email || !password || !boardingHouse || !address || !phone) {
    return res.status(400).json({ error: 'Please fill in all required fields' });
  }

  const cleanEmail = email.trim().toLowerCase();
  if (db.systemSettings && db.systemSettings.enforceUstpEmail && !cleanEmail.endsWith('@ustp.edu.ph')) {
    return res.status(400).json({ error: 'Registration requires an official @ustp.edu.ph institutional email address.' });
  }

  const existing = db.users.find(u => u.email.toLowerCase() === cleanEmail);
  if (existing) {
    return res.status(400).json({ error: 'An account with this email already exists' });
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const requireApproval = Boolean(db.systemSettings && db.systemSettings.requireAccountApproval);

  const newUser = {
    id: 'usr_' + Date.now(),
    name: name.trim(),
    email: cleanEmail,
    passwordHash,
    role: 'requester',
    status: requireApproval ? 'pending' : 'active',
    studentId: studentId ? studentId.trim() : 'N/A',
    courseAndYear: courseAndYear ? courseAndYear.trim() : 'N/A',
    boardingHouse: boardingHouse.trim(),
    address: address.trim(),
    landmark: landmark ? landmark.trim() : '',
    phone: phone.trim(),
    emergencyContact: emergencyContact || { name: 'Guardian', phone: 'N/A' },
    permissions: getDefaultPermissions('requester'),
    settings: getDefaultUserSettings('requester'),
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  db.users.push(newUser);
  saveDb();

  logAudit(req, {
    userId: newUser.id,
    userName: newUser.name,
    userRole: newUser.role,
    action: 'USER_REGISTERED',
    targetEntity: 'user',
    targetId: newUser.id,
    details: `Student registered account with Boarding House: ${newUser.boardingHouse} (Status: ${newUser.status})`
  });

  if (requireApproval) {
    // Notify admins of pending registration
    db.users.filter(u => u.role === 'admin').forEach(adm => {
      createNotification(
        adm.id,
        `Pending Account Approval: ${newUser.name}`,
        `New student registration (${newUser.email}) is awaiting administrator activation.`,
        'warning',
        null,
        'admin'
      );
    });
    return res.status(201).json({
      pendingApproval: true,
      message: 'Registration submitted! Your account is pending administrator approval.'
    });
  }

  const token = jwt.sign(
    { id: newUser.id, email: newUser.email, role: newUser.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  const { passwordHash: _, ...safeUser } = newUser;
  res.status(201).json({ token, user: safeUser, systemSettings: db.systemSettings });
});

// Auth: Current User
app.get('/api/auth/me', authenticateToken, (req, res) => {
  const { passwordHash, ...safeUser } = req.user;
  res.json(safeUser);
});

// Auth: Logout
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  const reason = (req.body && req.body.reason) === 'timeout'
    ? 'Session automatically expired due to user inactivity.'
    : 'User logged out successfully from web application.';

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: (req.body && req.body.reason) === 'timeout' ? 'SESSION_EXPIRED' : 'USER_LOGOUT',
    targetEntity: 'user',
    targetId: req.user.id,
    details: reason
  });
  res.json({ success: true, message: 'Logged out successfully' });
});

// ======================= PROFILE & DASHBOARD SETTINGS ROUTES =======================

// Update Profile (Editable Profile for Students, Personnel & Admin)
app.put('/api/users/profile', authenticateToken, (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.permissions && user.permissions.canUpdateProfile === false && user.role !== 'admin') {
    return res.status(403).json({ error: 'Profile editing has been restricted for your account.' });
  }

  const {
    name,
    phone,
    boardingHouse,
    address,
    landmark,
    studentId,
    courseAndYear,
    emergencyContact,
    title,
    licenseNumber,
    newPassword,
    profilePicture,  // Task 5: profile picture as base64 data URL
    doctorSignature  // Doctor digital signature (drawn or uploaded data URL)
  } = req.body;

  if (name && name.trim()) user.name = name.trim();
  if (phone !== undefined) user.phone = phone.trim();
  if (boardingHouse !== undefined) user.boardingHouse = boardingHouse.trim();
  if (address !== undefined) user.address = address.trim();
  if (landmark !== undefined) user.landmark = landmark.trim();
  if (studentId !== undefined) user.studentId = studentId.trim();
  if (courseAndYear !== undefined) user.courseAndYear = courseAndYear.trim();
  if (emergencyContact && typeof emergencyContact === 'object') {
    user.emergencyContact = {
      name: emergencyContact.name ? emergencyContact.name.trim() : (user.emergencyContact?.name || 'Guardian'),
      phone: emergencyContact.phone ? emergencyContact.phone.trim() : (user.emergencyContact?.phone || '')
    };
  }
  if (title !== undefined) user.title = title.trim();
  if (licenseNumber !== undefined) user.licenseNumber = licenseNumber.trim();

  if (newPassword && newPassword.trim().length >= 6) {
    const salt = bcrypt.genSaltSync(10);
    user.passwordHash = bcrypt.hashSync(newPassword.trim(), salt);
  }

  // Task 5: profile picture (base64 data URL) — store on user record
  if (profilePicture !== undefined) {
    user.profilePicture = profilePicture || '';
  }

  // Doctor Digital Signature (encrypted at rest when saved to disk)
  if (doctorSignature !== undefined && user.role === 'doctor') {
    user.doctorSignature = doctorSignature || getDefaultDoctorSignatureDataUrl();
    logAudit(req, {
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'DOCTOR_SIGNATURE_UPDATED',
      targetEntity: 'user',
      targetId: user.id,
      details: `Doctor digital signature updated by ${user.name} (encrypted at rest).`
    });
  }

  saveDb();

  logAudit(req, {
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: 'PROFILE_UPDATED',
    targetEntity: 'user',
    targetId: user.id,
    details: `Profile updated by user: Name: ${user.name}, Boarding House: ${user.boardingHouse || 'N/A'}`
  });

  const { passwordHash, ...safeUser } = user;
  res.json({ message: 'Profile updated successfully', user: safeUser });
});

// Get & Update User Dashboard Settings (for Student, Personnel, and Admin dashboards)
app.get('/api/users/settings', authenticateToken, (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    settings: user.settings || getDefaultUserSettings(user.role),
    permissions: user.permissions || getDefaultPermissions(user.role)
  });
});

app.put('/api/users/settings', authenticateToken, (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { settings = {}, currentPassword, newPassword } = req.body;

  if (!user.settings || typeof user.settings !== 'object') {
    user.settings = getDefaultUserSettings(user.role);
  }

  Object.keys(settings).forEach(key => {
    user.settings[key] = settings[key];
  });

  if (newPassword && newPassword.trim()) {
    if (newPassword.trim().length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }
    if (currentPassword && !bcrypt.compareSync(currentPassword, user.passwordHash)) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    const salt = bcrypt.genSaltSync(10);
    user.passwordHash = bcrypt.hashSync(newPassword.trim(), salt);
  }

  saveDb();

  logAudit(req, {
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: 'SETTINGS_UPDATED',
    targetEntity: 'user',
    targetId: user.id,
    details: `Dashboard preferences updated by ${user.name} (${user.role}).`
  });

  const { passwordHash, ...safeUser } = user;
  res.json({ message: 'Dashboard settings saved successfully', user: safeUser });
});

// Demo accounts quick-switch helper
app.get('/api/auth/demo-accounts', (req, res) => {
  const safeAccounts = db.users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status || 'active',
    studentId: u.studentId,
    courseAndYear: u.courseAndYear,
    boardingHouse: u.boardingHouse,
    title: u.title
  }));
  res.json(safeAccounts);
});

// ======================= REQUESTS & CLINICAL ROUTES =======================

// Save or Update Doctor Digital Signature
app.put('/api/doctor/signature', authenticateToken, requireRole('doctor'), (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Doctor account not found' });

  const { doctorSignature } = req.body;
  user.doctorSignature = doctorSignature || getDefaultDoctorSignatureDataUrl();
  saveDb();

  logAudit(req, {
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: 'DOCTOR_SIGNATURE_UPDATED',
    targetEntity: 'user',
    targetId: user.id,
    details: `Doctor ${user.name} saved digital signature on profile (encrypted at rest).`
  });

  res.json({ message: 'Doctor digital signature saved successfully', user: sanitizeUser(user) });
});

// Get Active Campus Nurses for Doctor Triage Assignment
app.get('/api/nurses', authenticateToken, requireRole('doctor', 'admin'), (req, res) => {
  const nurses = db.users
    .filter(u => u.role === 'personnel' && (u.status || 'active') === 'active')
    .map(n => ({
      id: n.id,
      name: n.name,
      email: n.email,
      phone: n.phone || '+63 920 111 8899',
      title: n.title || 'Campus Health Nurse',
      licenseNumber: n.licenseNumber || 'PRC RN-Verified',
      dutyStatus: (n.settings && n.settings.dutyStatus) || 'on_duty',
      activeAssignedCount: db.requests.filter(
        r => r.assignedTo && r.assignedTo.id === n.id && ['assigned', 'en_route', 'in_progress', 'returned_to_nurse'].includes(r.status)
      ).length
    }));
  res.json(nurses);
});

// Get Clinical Records (for Doctor review, Nurse assigned patients, or Admin oversight)
app.get('/api/clinical-records', authenticateToken, requireRole('doctor', 'personnel', 'admin'), (req, res) => {
  let records = [...(db.clinicalRecords || [])];
  if (req.user.role === 'personnel') {
    records = records.filter(cr => {
      if (cr.examinerId === req.user.id) return true;
      const parentReq = db.requests.find(r => r.id === cr.requestId);
      return parentReq && parentReq.assignedTo && parentReq.assignedTo.id === req.user.id;
    });
  }
  res.json(records);
});

// 2. Requests API
// Get requests:
// - Students (requester): only see their own requests
// - Nurses (personnel): ONLY see their own assigned patients (never pending or unassigned requests!)
// - Doctors (doctor) & Admins (admin): see all requests including Pending Triage Queue
app.get('/api/requests', authenticateToken, (req, res) => {
  let list = db.requests;
  if (req.user.role === 'requester') {
    list = list.filter(r => r.userId === req.user.id);
  } else if (req.user.role === 'personnel') {
    list = list.filter(r => r.assignedTo && r.assignedTo.id === req.user.id && r.status !== 'pending');
  }
  // Sort newest first
  list = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});

// Create new health checkup request (goes to Doctor's Pending Triage Queue)
app.post('/api/requests', authenticateToken, (req, res) => {
  if (db.systemSettings && db.systemSettings.maintenanceMode && req.user.role !== 'admin') {
    return res.status(503).json({ error: 'System is in Maintenance Mode. New checkup requests are temporarily paused.' });
  }
  if (req.user.permissions && req.user.permissions.canSubmitRequests === false && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Your account permission to submit new checkup requests is restricted.' });
  }

  const {
    urgency = 'moderate',
    symptoms = [],
    symptomDetails = '',
    temperature = '',
    canWalk = false,
    hasCompanion = false,
    preferredTime = 'As soon as possible',
    boardingHouse,
    address,
    landmark,
    phone
  } = req.body;

  if (!symptoms || symptoms.length === 0) {
    return res.status(400).json({ error: 'Please select at least one symptom' });
  }

  const reqId = 'REQ-2026-' + (1000 + db.requests.length + 1);
  const now = new Date().toISOString();

  const newRequest = {
    id: reqId,
    userId: req.user.id,
    studentName: req.user.name,
    studentId: req.user.studentId || 'N/A',
    courseAndYear: req.user.courseAndYear || 'N/A',
    phone: phone || req.user.phone || '',
    boardingHouse: boardingHouse || req.user.boardingHouse || '',
    address: address || req.user.address || '',
    landmark: landmark || req.user.landmark || '',
    urgency,
    symptoms,
    symptomDetails,
    temperature,
    canWalk: Boolean(canWalk),
    hasCompanion: Boolean(hasCompanion),
    preferredTime,
    status: 'pending',
    assignedTo: null,
    timeline: [
      {
        status: 'pending',
        timestamp: now,
        notes: `Checkup request submitted to Doctor's Pending Triage Queue. Symptoms: ${symptoms.join(', ')}`
      }
    ],
    createdAt: now,
    completedAt: null,
    certificateId: null
  };

  db.requests.unshift(newRequest);
  saveDb();

  // Audit log
  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'REQUEST_CREATED',
    targetEntity: 'request',
    targetId: newRequest.id,
    details: `Created health request (${urgency.toUpperCase()}) at ${newRequest.boardingHouse} (routed to Doctor Pending Triage Queue).`
  });

  // Notify Doctor (and Admin) — new requests go to the Doctor's Pending Triage Queue
  db.users
    .filter(u => u.role === 'doctor' || u.role === 'admin')
    .forEach(person => {
      createNotification(
        person.id,
        `New Triage Request: ${newRequest.studentName}`,
        `Urgency: ${urgency.toUpperCase()} | Location: ${newRequest.boardingHouse} — Awaiting Doctor Nurse Assignment`,
        urgency === 'severe' ? 'urgent' : 'info',
        newRequest.id,
        'queue'
      );
    });

  res.status(201).json(newRequest);
});

// Doctor Triage Assignment: Assign a pending checkup request to a Campus Nurse
app.post('/api/requests/:id/assign', authenticateToken, (req, res) => {
  if (req.user.role !== 'doctor') {
    logAudit(req, {
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UNAUTHORIZED_TRIAGE_ASSIGN_ATTEMPT',
      targetEntity: 'request',
      targetId: req.params.id,
      details: `Blocked attempt by ${req.user.role} (${req.user.name}) to assign triage request ${req.params.id}. Only a Doctor can assign requests from the Pending Triage Queue.`
    });
    return res.status(403).json({ error: 'Only the Campus Doctor can triage pending requests and assign them to a nurse.' });
  }

  const { id } = req.params;
  const { nurseId, notes = '', urgency } = req.body;

  const reqItem = db.requests.find(r => r.id === id);
  if (!reqItem) return res.status(404).json({ error: 'Request not found' });

  const nurse = db.users.find(u => u.id === nurseId && u.role === 'personnel')
    || db.users.find(u => u.role === 'personnel');
  if (!nurse) return res.status(400).json({ error: 'Selected campus nurse not found' });

  if (urgency && ['mild', 'moderate', 'severe'].includes(urgency)) {
    reqItem.urgency = urgency;
  }

  const now = new Date().toISOString();
  reqItem.status = 'assigned';
  reqItem.assignedTo = {
    id: nurse.id,
    name: nurse.name,
    phone: nurse.phone || '+63 920 111 8899',
    licenseNumber: nurse.licenseNumber || 'PRC RN-0982341'
  };
  reqItem.triagedBy = {
    id: req.user.id,
    name: req.user.name,
    timestamp: now
  };

  const assignNote = notes
    ? `Triaged by ${req.user.name} and assigned to ${nurse.name}. Notes: ${notes}`
    : `Triaged by ${req.user.name} and assigned to ${nurse.name} for off-site checkup.`;

  reqItem.timeline.push({
    status: 'assigned',
    timestamp: now,
    updatedBy: req.user.name,
    notes: assignNote
  });

  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'TRIAGE_ASSIGNED',
    targetEntity: 'request',
    targetId: reqItem.id,
    details: `Doctor ${req.user.name} assigned request ${reqItem.id} (${reqItem.studentName}) to ${nurse.name}.`
  });

  // Notify Assigned Nurse
  createNotification(
    nurse.id,
    `New Patient Assigned: ${reqItem.studentName}`,
    `${req.user.name} assigned you to examine ${reqItem.studentName} at ${reqItem.boardingHouse}.`,
    reqItem.urgency === 'severe' ? 'urgent' : 'info',
    reqItem.id,
    'queue'
  );

  // Notify Student
  createNotification(
    reqItem.userId,
    'Campus Nurse Assigned',
    `${req.user.name} has assigned ${nurse.name} to visit your boarding house (${reqItem.boardingHouse}).`,
    'info',
    reqItem.id,
    `request:${reqItem.id}`
  );

  res.json(reqItem);
});

// Update Request Status:
// - Nurses (personnel) can ONLY update their own assigned requests and MUST follow strict order:
//   assigned -> en_route -> in_progress (cannot self-assign, cannot skip steps, cannot mark completed)
app.patch('/api/requests/:id/status', authenticateToken, requireRole('personnel', 'doctor', 'admin'), (req, res) => {
  const { id } = req.params;
  const { status, notes, assignToSelf, nurseId } = req.body;

  const validStatuses = ['pending', 'assigned', 'en_route', 'in_progress', 'awaiting_doctor', 'returned_to_nurse', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status code' });
  }

  const reqItem = db.requests.find(r => r.id === id);
  if (!reqItem) {
    return res.status(404).json({ error: 'Request not found' });
  }

  // Nurse (personnel) strict rules
  if (req.user.role === 'personnel') {
    if (assignToSelf || status === 'assigned' || reqItem.status === 'pending') {
      logAudit(req, {
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'UNAUTHORIZED_NURSE_ASSIGN_ATTEMPT',
        targetEntity: 'request',
        targetId: reqItem.id,
        details: `Blocked attempt by nurse ${req.user.name} to self-assign or modify unassigned request ${reqItem.id}.`
      });
      return res.status(403).json({
        error: 'Nurses cannot view the pending queue or assign requests to themselves. Only the Doctor can assign requests.'
      });
    }

    if (!reqItem.assignedTo || reqItem.assignedTo.id !== req.user.id) {
      return res.status(403).json({ error: 'Nurses can only update status for their own assigned patients.' });
    }

    // Strict ordered workflow for Nurse: assigned -> en_route -> in_progress
    const currentStatus = reqItem.status;
    const isValidNurseTransition =
      (currentStatus === 'assigned' && status === 'en_route') ||
      (currentStatus === 'en_route' && status === 'in_progress') ||
      (currentStatus === 'returned_to_nurse' && (status === 'en_route' || status === 'in_progress'));

    if (!isValidNurseTransition) {
      return res.status(400).json({
        error: `Nurses must follow the steps in order: Assigned → En Route → In Progress → Record On-Site Checkup (cannot jump from ${currentStatus} to ${status}).`
      });
    }
  }

  // If Doctor assigns via PATCH /status
  if (req.user.role === 'doctor' && status === 'assigned') {
    const targetNurse = db.users.find(u => u.id === nurseId && u.role === 'personnel')
      || db.users.find(u => u.role === 'personnel');
    if (targetNurse) {
      reqItem.assignedTo = {
        id: targetNurse.id,
        name: targetNurse.name,
        phone: targetNurse.phone || '+63 920 111 8899',
        licenseNumber: targetNurse.licenseNumber || 'PRC RN-0982341'
      };
    }
  }

  const now = new Date().toISOString();
  reqItem.status = status;
  reqItem.timeline.push({
    status,
    timestamp: now,
    updatedBy: req.user.name,
    notes: notes || `Status updated to ${status.replace(/_/g, ' ').toUpperCase()} by ${req.user.name}`
  });

  if (status === 'completed') {
    reqItem.completedAt = now;
  }

  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'STATUS_UPDATED',
    targetEntity: 'request',
    targetId: reqItem.id,
    details: `Status shifted to ${status.toUpperCase()} by ${req.user.name}. Notes: ${notes || 'None'}`
  });

  // Notify student on nurse dispatch progress
  const statusText = status.replace(/_/g, ' ').toUpperCase();
  createNotification(
    reqItem.userId,
    `Request Update: ${statusText}`,
    notes || `Your checkup request status has been updated to ${statusText}.`,
    'info',
    reqItem.id,
    `request:${reqItem.id}`
  );

  res.json(reqItem);
});

// 3. Nurse On-Site Checkup Entry -> Creates Draft Certificate & Moves to Awaiting Doctor Validation
// Nurses can ONLY record vital signs, physical observations, and nurse notes.
// Diagnosis and prescribed medication are strictly blocked on both screen and server!
app.post('/api/requests/:id/clinical-record', authenticateToken, requireRole('personnel'), async (req, res) => {
  const { id } = req.params;
  const {
    vitals = {},
    symptomsObserved = '',
    nurseNotes = '',
    diagnosis,
    prescribedMedication,
    prescriptionAndCare
  } = req.body;

  const request = db.requests.find(r => r.id === id);
  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  // Ensure nurse is assigned to this patient
  if (!request.assignedTo || request.assignedTo.id !== req.user.id) {
    return res.status(403).json({ error: 'You can only record on-site checkups for your own assigned patients.' });
  }

  // Block and audit any attempt by a Nurse to submit a diagnosis or prescribed medication
  if (
    (diagnosis !== undefined && String(diagnosis).trim() !== '') ||
    (prescribedMedication !== undefined && String(prescribedMedication).trim() !== '') ||
    (prescriptionAndCare !== undefined && String(prescriptionAndCare).trim() !== '')
  ) {
    logAudit(req, {
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'NURSE_DIAGNOSIS_REJECTED',
      targetEntity: 'request',
      targetId: request.id,
      details: `Rejected attempt by nurse ${req.user.name} to submit clinical diagnosis or prescribed medication for ${request.studentName} (${request.id}).`
    });
    logSecurityEvent(req, {
      type: 'UNAUTHORIZED_CLINICAL_ACTION',
      severity: 'high',
      email: req.user.email,
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      details: `Nurse ${req.user.name} attempted to submit restricted diagnosis/medication fields on request ${request.id}.`,
      resolved: false
    });
    return res.status(403).json({
      error: 'Nurses can only record vital signs, physical observations, and nurse notes. Entering a clinical diagnosis or prescribing medication is restricted to the Campus Doctor.'
    });
  }

  // Enforce step order: must be 'in_progress' or 'returned_to_nurse'
  if (!['in_progress', 'returned_to_nurse'].includes(request.status)) {
    return res.status(400).json({
      error: 'Nurses must follow the steps in order: Assigned → En Route → In Progress → Record On-Site Checkup.'
    });
  }

  if (!symptomsObserved || !String(symptomsObserved).trim()) {
    return res.status(400).json({ error: 'Physical observations are required.' });
  }

  const now = new Date().toISOString();
  const formattedVitals = {
    bp: vitals.bp ? (String(vitals.bp).includes('mmHg') ? vitals.bp : `${vitals.bp} mmHg`) : '120/80 mmHg',
    temp: vitals.temp ? (String(vitals.temp).includes('°C') ? vitals.temp : `${vitals.temp} °C`) : '37.0 °C',
    pulse: vitals.pulse ? (String(vitals.pulse).includes('bpm') ? vitals.pulse : `${vitals.pulse} bpm`) : '78 bpm',
    respRate: vitals.respRate ? (String(vitals.respRate).includes('cpm') ? vitals.respRate : `${vitals.respRate} cpm`) : '18 cpm',
    spo2: vitals.spo2 ? (String(vitals.spo2).includes('%') ? vitals.spo2 : `${vitals.spo2} %`) : '99 %'
  };

  // Check if updating an existing draft after Return to Nurse
  let clinicalRecord = db.clinicalRecords.find(cr => cr.requestId === request.id);
  const isResubmission = Boolean(clinicalRecord);

  if (clinicalRecord) {
    clinicalRecord.vitals = formattedVitals;
    clinicalRecord.symptomsObserved = String(symptomsObserved).trim();
    clinicalRecord.nurseNotes = String(nurseNotes || '').trim();
    clinicalRecord.dateExamined = now;
    clinicalRecord.status = 'awaiting_doctor';
  } else {
    const clinicalRecordId = 'CR-2026-' + (1000 + db.clinicalRecords.length + 1);
    clinicalRecord = {
      id: clinicalRecordId,
      requestId: request.id,
      patientId: request.userId,
      patientName: request.studentName,
      studentId: request.studentId,
      examinerId: req.user.id,
      examinerName: req.user.name,
      examinerTitle: req.user.title || 'Campus Health Nurse',
      examinerLicense: req.user.licenseNumber || 'PRC RN-0982341',
      dateExamined: now,
      vitals: formattedVitals,
      symptomsObserved: String(symptomsObserved).trim(),
      nurseNotes: String(nurseNotes || '').trim(),
      diagnosis: '',
      prescribedMedication: '',
      prescriptionAndCare: '',
      excusedDuration: {
        isExcused: true,
        startDate: now.split('T')[0],
        endDate: now.split('T')[0],
        daysCount: 3,
        reason: 'Pending Doctor Validation'
      },
      remarks: '',
      status: 'awaiting_doctor'
    };
    db.clinicalRecords.push(clinicalRecord);
  }

  // Create or Update Draft Certificate (Hidden from Student & Public Verifier until Doctor Signs & Sends)
  let draftCert = db.certificates.find(c => c.requestId === request.id);
  const vitalSummaryStr = `BP: ${formattedVitals.bp} | Temp: ${formattedVitals.temp} | Pulse: ${formattedVitals.pulse} | SpO2: ${formattedVitals.spo2}`;

  if (draftCert) {
    draftCert.vitalSignsSummary = vitalSummaryStr;
    draftCert.symptomsObserved = clinicalRecord.symptomsObserved;
    draftCert.nurseNotes = clinicalRecord.nurseNotes;
    draftCert.issuerName = req.user.name;
    draftCert.issuerLicense = req.user.licenseNumber || 'PRC RN-0982341';
    draftCert.status = 'draft';
    draftCert.isDraft = true;
    draftCert.isSigned = false;
    draftCert.updatedAt = now;
  } else {
    const certId = 'CERT-USTP-2026-' + (100 + db.certificates.length + 1);
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const verificationCode = `USTP-VC-${randomSuffix}`;
    draftCert = {
      id: certId,
      verificationCode,
      requestId: request.id,
      clinicalRecordId: clinicalRecord.id,
      studentName: request.studentName,
      studentId: request.studentId,
      courseAndYear: request.courseAndYear,
      boardingHouse: `${request.boardingHouse}, ${request.address}`,
      issuedAt: now,
      validUntil: null,
      issuerName: req.user.name,
      issuerLicense: req.user.licenseNumber || 'PRC RN-0982341',
      approverName: 'Pending Doctor Validation',
      approverLicense: 'Pending Physician Signature',
      diagnosis: '',
      prescribedMedication: '',
      vitalSignsSummary: vitalSummaryStr,
      symptomsObserved: clinicalRecord.symptomsObserved,
      nurseNotes: clinicalRecord.nurseNotes,
      recommendations: '',
      excusedDates: 'Pending Doctor Validation',
      remarks: '',
      status: 'draft',
      isDraft: true,
      isSigned: false,
      doctorSignature: '',
      qrCodeDataUrl: '',
      integrityHash: '',
      institution: (db.systemSettings && db.systemSettings.institutionName) || 'University of Science and Technology of Southern Philippines (USTP) - Villanueva Campus',
      clinicName: (db.systemSettings && db.systemSettings.clinicName) || 'Health and Wellness Center - Off-Site Health Response Unit'
    };
    db.certificates.push(draftCert);
  }

  // Move request to Awaiting Doctor Validation ('awaiting_doctor')
  request.status = 'awaiting_doctor';
  request.returnNote = null;
  request.draftCertificateId = draftCert.id;
  request.timeline.push({
    status: 'awaiting_doctor',
    timestamp: now,
    updatedBy: req.user.name,
    notes: isResubmission
      ? `Nurse ${req.user.name} updated on-site checkup findings and resubmitted draft for Doctor Validation.`
      : `On-site checkup vitals and physical observations recorded by ${req.user.name}. Draft created — Awaiting Doctor Validation.`
  });

  saveDb();

  // Audit logs
  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'DRAFT_CERTIFICATE_CREATED',
    targetEntity: 'certificate',
    targetId: draftCert.id,
    details: `Nurse ${req.user.name} recorded on-site checkup vitals/observations for ${request.studentName} and created draft certificate ${draftCert.id} (Awaiting Doctor Validation).`
  });

  // Notify Doctors (Student is NOT notified of any certificate yet!)
  db.users
    .filter(u => u.role === 'doctor')
    .forEach(doc => {
      createNotification(
        doc.id,
        `Awaiting Doctor Validation: ${request.studentName}`,
        `${req.user.name} submitted on-site vitals and physical observations for ${request.studentName} (${request.id}). Ready for diagnosis & signature.`,
        'info',
        request.id,
        'queue'
      );
    });

  res.status(201).json({
    message: 'On-site checkup recorded. Draft certificate created and sent to Doctor for validation.',
    clinicalRecord,
    draftCertificate: draftCert,
    request
  });
});

// 3B. Doctor Returns Checkup to Nurse for Correction
app.post('/api/requests/:id/return-to-nurse', authenticateToken, (req, res) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({ error: 'Only the Campus Doctor can return a checkup to the nurse.' });
  }

  const { id } = req.params;
  const { note, reason } = req.body;
  const returnReason = String(note || reason || '').trim();
  if (!returnReason) {
    return res.status(400).json({ error: 'Please provide a note explaining what the nurse needs to fix.' });
  }

  const request = db.requests.find(r => r.id === id);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  const now = new Date().toISOString();
  request.status = 'returned_to_nurse';
  request.returnNote = returnReason;
  request.returnedBy = req.user.name;
  request.returnedAt = now;
  request.timeline.push({
    status: 'returned_to_nurse',
    timestamp: now,
    updatedBy: req.user.name,
    notes: `Returned to Nurse by ${req.user.name}: "${returnReason}"`
  });

  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'CHECKUP_RETURNED_TO_NURSE',
    targetEntity: 'request',
    targetId: request.id,
    details: `Doctor ${req.user.name} returned checkup ${request.id} (${request.studentName}) to nurse ${request.assignedTo ? request.assignedTo.name : 'N/A'}. Note: ${returnReason}`
  });

  if (request.assignedTo && request.assignedTo.id) {
    createNotification(
      request.assignedTo.id,
      `Checkup Returned by Doctor: ${request.studentName}`,
      `${req.user.name} returned checkup ${request.id} for revision: "${returnReason}"`,
      'warning',
      request.id,
      'queue'
    );
  }

  res.json({
    message: 'Checkup returned to nurse with notes.',
    request
  });
});

// 3C. Doctor Validation, Official Diagnosis, Prescription, Digital Signature & Sign & Send to Student
async function handleDoctorSignAndSend(req, res) {
  // Strictly enforce that ONLY a Doctor (never Nurse and never Admin!) can sign & send certificates
  if (req.user.role !== 'doctor') {
    logAudit(req, {
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UNAUTHORIZED_SIGN_ATTEMPT',
      targetEntity: 'certificate',
      targetId: req.params.id,
      details: `Blocked attempt by ${req.user.role.toUpperCase()} (${req.user.name}) to sign or send medical certificate on a doctor's behalf.`
    });
    logSecurityEvent(req, {
      type: 'UNAUTHORIZED_ACCESS',
      severity: 'high',
      email: req.user.email,
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      details: `${req.user.role.toUpperCase()} ${req.user.name} attempted to sign/send certificate ${req.params.id}. Only a Doctor can sign certificates.`,
      resolved: false
    });
    return res.status(403).json({
      error: 'Only the Campus Doctor can enter the official diagnosis, sign, and send medical certificates. Administrators and Nurses cannot sign on a doctor\'s behalf.'
    });
  }

  const { id } = req.params;
  // Find request by request ID or by certificate ID
  let request = db.requests.find(r => r.id === id || r.certificateId === id || r.draftCertificateId === id);
  let draftCert = db.certificates.find(c => c.id === id || c.verificationCode === id || (request && c.requestId === request.id));
  if (!request && draftCert) {
    request = db.requests.find(r => r.id === draftCert.requestId);
  }
  if (!request) {
    return res.status(404).json({ error: 'Checkup request or draft certificate not found' });
  }

  const {
    diagnosis = '',
    prescribedMedication = '',
    recommendations = '',
    careRecommendations = '',
    excusedDuration = {},
    excusedDates = '',
    validUntil = '',
    remarks = '',
    doctorSignature = ''
  } = req.body;

  if (!diagnosis || !String(diagnosis).trim()) {
    return res.status(400).json({ error: 'Official Clinical Diagnosis is required from the Doctor.' });
  }
  if (!prescribedMedication || !String(prescribedMedication).trim()) {
    return res.status(400).json({ error: 'Prescribed Medication is required from the Doctor.' });
  }

  const now = new Date().toISOString();
  let clinicalRecord = db.clinicalRecords.find(cr => cr.requestId === request.id);
  const careRecs = String(careRecommendations || recommendations || 'Strict bed rest and oral hydration as prescribed.').trim();
  const fullPrescriptionAndCare = `${String(prescribedMedication).trim()}\n${careRecs}`.trim();

  const startDate = excusedDuration.startDate || now.split('T')[0];
  const daysCount = Number(excusedDuration.daysCount) || 3;
  const endDate = excusedDuration.endDate || new Date(Date.now() + Math.max(0, daysCount - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const isExcused = excusedDuration.isExcused !== undefined ? Boolean(excusedDuration.isExcused) : true;

  const formattedExcusedDates = excusedDates && String(excusedDates).trim()
    ? String(excusedDates).trim()
    : (isExcused
        ? `${startDate} to ${endDate} (${daysCount} Days)`
        : 'Fit to resume regular academic load; rest recommended outside class hours.');

  const validityDays = (db.systemSettings && Number(db.systemSettings.defaultCertValidityDays)) || 7;
  const finalValidUntil = validUntil
    ? new Date(validUntil).toISOString()
    : new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString();

  if (clinicalRecord) {
    clinicalRecord.diagnosis = String(diagnosis).trim();
    clinicalRecord.prescribedMedication = String(prescribedMedication).trim();
    clinicalRecord.prescriptionAndCare = fullPrescriptionAndCare;
    clinicalRecord.excusedDuration = {
      isExcused,
      startDate,
      endDate,
      daysCount,
      reason: excusedDuration.reason || 'Medically unfit for physical class attendance due to acute illness.'
    };
    clinicalRecord.remarks = String(remarks || '').trim();
    clinicalRecord.validatedBy = req.user.name;
    clinicalRecord.validatedAt = now;
    clinicalRecord.status = 'completed';
  } else {
    const clinicalRecordId = 'CR-2026-' + (1000 + db.clinicalRecords.length + 1);
    clinicalRecord = {
      id: clinicalRecordId,
      requestId: request.id,
      patientId: request.userId,
      patientName: request.studentName,
      studentId: request.studentId,
      examinerId: (request.assignedTo && request.assignedTo.id) || req.user.id,
      examinerName: (request.assignedTo && request.assignedTo.name) || 'Nurse Sarah Alcantara, RN',
      examinerTitle: 'Campus Health Nurse',
      examinerLicense: (request.assignedTo && request.assignedTo.licenseNumber) || 'PRC RN-0982341',
      dateExamined: now,
      vitals: { bp: '120/80 mmHg', temp: '37.5 °C', pulse: '80 bpm', respRate: '18 cpm', spo2: '98 %' },
      symptomsObserved: 'Examined on-site.',
      nurseNotes: '',
      diagnosis: String(diagnosis).trim(),
      prescribedMedication: String(prescribedMedication).trim(),
      prescriptionAndCare: fullPrescriptionAndCare,
      excusedDuration: { isExcused, startDate, endDate, daysCount, reason: 'Medical rest ordered.' },
      remarks: String(remarks || '').trim(),
      validatedBy: req.user.name,
      validatedAt: now,
      status: 'completed'
    };
    db.clinicalRecords.push(clinicalRecord);
  }

  const signatureToUse = doctorSignature || req.user.doctorSignature || getDefaultDoctorSignatureDataUrl();
  if (doctorSignature && doctorSignature !== req.user.doctorSignature) {
    req.user.doctorSignature = doctorSignature;
  }

  if (!draftCert) {
    const certId = 'CERT-USTP-2026-' + (100 + db.certificates.length + 1);
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    draftCert = {
      id: certId,
      verificationCode: `USTP-VC-${randomSuffix}`,
      requestId: request.id,
      clinicalRecordId: clinicalRecord.id,
      studentName: request.studentName,
      studentId: request.studentId,
      courseAndYear: request.courseAndYear,
      boardingHouse: `${request.boardingHouse}, ${request.address}`,
      issuerName: clinicalRecord.examinerName || 'Nurse Sarah Alcantara, RN',
      issuerLicense: clinicalRecord.examinerLicense || 'PRC RN-0982341',
      vitalSignsSummary: `BP: ${clinicalRecord.vitals.bp} | Temp: ${clinicalRecord.vitals.temp} | Pulse: ${clinicalRecord.vitals.pulse} | SpO2: ${clinicalRecord.vitals.spo2}`,
      symptomsObserved: clinicalRecord.symptomsObserved,
      nurseNotes: clinicalRecord.nurseNotes || '',
      institution: (db.systemSettings && db.systemSettings.institutionName) || 'University of Science and Technology of Southern Philippines (USTP) - Villanueva Campus',
      clinicName: (db.systemSettings && db.systemSettings.clinicName) || 'Health and Wellness Center - Off-Site Health Response Unit'
    };
    db.certificates.push(draftCert);
  }

  // Seal Final Certificate
  draftCert.diagnosis = String(diagnosis).trim();
  draftCert.prescribedMedication = String(prescribedMedication).trim();
  draftCert.recommendations = `${String(prescribedMedication).trim()} — ${careRecs}`;
  draftCert.careRecommendations = careRecs;
  draftCert.excusedDates = formattedExcusedDates;
  draftCert.validUntil = finalValidUntil;
  draftCert.remarks = String(remarks || '').trim();
  draftCert.approverId = req.user.id;
  draftCert.approverName = req.user.name;
  draftCert.approverLicense = `${req.user.licenseNumber || 'PRC MD-0054321'} - Campus Physician`;
  draftCert.doctorSignature = signatureToUse;
  draftCert.issuedAt = now;
  draftCert.signedAt = now;
  draftCert.status = 'valid';
  draftCert.isDraft = false;
  draftCert.isSigned = true;

  // Generate QR code & cryptographic SHA-256 hash
  const verificationUrl = `${req.protocol}://${req.get('host')}/#verify?code=${draftCert.verificationCode}`;
  let qrCodeDataUrl = '';
  try {
    qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, {
      errorCorrectionLevel: 'H',
      margin: 1,
      color: {
        dark: '#162A56',
        light: '#FFFFFF'
      }
    });
  } catch (err) {
    console.error('QR code generation error:', err);
  }
  draftCert.qrCodeDataUrl = qrCodeDataUrl;
  draftCert.verificationUrl = verificationUrl;
  draftCert.integrityHash = generateHash({
    id: draftCert.id,
    verificationCode: draftCert.verificationCode,
    studentId: draftCert.studentId,
    issuedAt: draftCert.issuedAt,
    approverName: draftCert.approverName
  });

  // Mark Request Completed
  request.status = 'completed';
  request.completedAt = now;
  request.certificateId = draftCert.id;
  request.returnNote = null;
  request.timeline.push({
    status: 'completed',
    timestamp: now,
    updatedBy: req.user.name,
    notes: `Validated, digitally signed, and sent to student by ${req.user.name}. Official Certificate ${draftCert.verificationCode} issued.`
  });

  saveDb();

  // Audit logs for Doctor edit/validation and Certificate signing & sending
  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'DOCTOR_VALIDATED_CHECKUP',
    targetEntity: 'clinicalRecord',
    targetId: clinicalRecord.id,
    details: `Doctor ${req.user.name} entered official diagnosis "${draftCert.diagnosis}" and prescribed medication for ${request.studentName}.`
  });

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'CERTIFICATE_SIGNED_AND_SENT',
    targetEntity: 'certificate',
    targetId: draftCert.id,
    details: `Doctor ${req.user.name} sealed, digitally signed, and sent Medical Certificate ${draftCert.verificationCode} to student ${request.studentName}.`
  });

  // Now (and ONLY now) notify the student that their medical certificate is ready!
  createNotification(
    request.userId,
    'Your medical certificate is ready',
    `Your official USTP Medical Certificate (${draftCert.verificationCode}) has been signed by ${req.user.name} and is ready to view or download.`,
    'success',
    request.id,
    'certificates'
  );

  res.status(200).json({
    message: 'Certificate digitally signed, sealed, and sent to student!',
    clinicalRecord,
    certificate: draftCert,
    request
  });
}

app.post('/api/requests/:id/doctor-validate', authenticateToken, handleDoctorSignAndSend);
app.post('/api/certificates/:id/sign-and-send', authenticateToken, handleDoctorSignAndSend);

// 3D. Admin Certificate Revocation (Admin can revoke certificates, but cannot sign or send on a doctor's behalf)
app.post('/api/admin/certificates/:id/revoke', authenticateToken, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const { reason = 'Revoked by Clinic Director upon administrative audit.' } = req.body;
  const cert = db.certificates.find(c => c.id === id || c.verificationCode === id);
  if (!cert) return res.status(404).json({ error: 'Certificate not found' });

  const now = new Date().toISOString();
  cert.status = 'revoked';
  cert.revokedAt = now;
  cert.revokedBy = req.user.name;
  cert.revocationReason = String(reason).trim();
  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'CERTIFICATE_REVOKED',
    targetEntity: 'certificate',
    targetId: cert.id,
    details: `Clinic Director ${req.user.name} revoked certificate ${cert.verificationCode}. Reason: ${cert.revocationReason}`
  });

  res.json({ message: `Certificate ${cert.verificationCode} has been revoked.`, certificate: cert });
});

// 4. Certificates API
// Get all certificates:
// - Students (requester): ONLY see their own signed/issued certificates (NEVER unfinished drafts!)
// - Nurses (personnel): see certificates for their assigned patients
// - Doctors (doctor) & Admins (admin): see all certificates
app.get('/api/certificates', authenticateToken, (req, res) => {
  let list = [...(db.certificates || [])];
  if (req.user.role === 'requester') {
    list = list.filter(c => {
      if (c.status === 'draft' || c.isDraft === true) return false;
      if (c.studentId && req.user.studentId && c.studentId === req.user.studentId) return true;
      const parentReq = db.requests.find(r => r.id === c.requestId);
      return parentReq && parentReq.userId === req.user.id;
    });
  } else if (req.user.role === 'personnel') {
    list = list.filter(c => {
      if (c.issuerName === req.user.name) return true;
      const parentReq = db.requests.find(r => r.id === c.requestId);
      return parentReq && parentReq.assignedTo && parentReq.assignedTo.id === req.user.id;
    });
  }
  list.sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));
  res.json(list);
});

// Get certificate by ID, Verification Code, or Request ID
app.get('/api/certificates/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const cert = db.certificates.find(c => c.id === id || c.requestId === id || c.verificationCode === id);
  if (!cert) {
    return res.status(404).json({ error: 'Certificate not found' });
  }

  // Students can never view or download unfinished drafts
  if (req.user.role === 'requester') {
    if (cert.status === 'draft' || cert.isDraft === true) {
      return res.status(403).json({
        error: 'This certificate is still an unfinished draft awaiting Doctor Validation and cannot be viewed or downloaded yet.'
      });
    }
    const parentReq = db.requests.find(r => r.id === cert.requestId);
    const isOwn = (cert.studentId && req.user.studentId && cert.studentId === req.user.studentId) ||
                  (parentReq && parentReq.userId === req.user.id);
    if (!isOwn) {
      return res.status(403).json({ error: 'Unauthorized to view this certificate' });
    }
  }

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'CERTIFICATE_VIEWED',
    targetEntity: 'certificate',
    targetId: cert.id,
    details: `Certificate ${cert.verificationCode} viewed by ${req.user.name}.`
  });

  res.json(cert);
});

// PUBLIC Certificate Verification (No login required - for professors, department chair, admins)
// Rules:
// 1. Only works for issued/signed certificates (never for drafts or revoked certificates).
// 2. Never exposes diagnosis, prescribed medication, care recommendations, vitals, or nurse notes!
app.get('/api/verify-certificate/:code', (req, res) => {
  const { code } = req.params;
  const cleanCode = code.trim().toUpperCase();

  const cert = db.certificates.find(c => c.verificationCode.toUpperCase() === cleanCode || c.id.toUpperCase() === cleanCode);
  if (!cert || cert.status === 'draft' || cert.isDraft === true) {
    logAudit(req, {
      userId: 'anonymous_verifier',
      userName: 'Public Verifier',
      userRole: 'public',
      action: 'CERTIFICATE_VERIFY_FAILED',
      targetEntity: 'certificate',
      targetId: cleanCode,
      details: `Verification attempt failed for code ${cleanCode}. Certificate not found or is an unissued draft.`
    });
    logSecurityEvent(req, {
      type: 'SUSPICIOUS_ACTIVITY',
      severity: 'low',
      email: 'public_verifier',
      details: `Invalid or draft certificate verification code queried: ${cleanCode}.`,
      resolved: true
    });
    return res.status(404).json({
      verified: false,
      message: 'Certificate not found, or is an unissued draft that has not been signed by the Campus Doctor.'
    });
  }

  if (cert.status === 'revoked') {
    logAudit(req, {
      userId: 'anonymous_verifier',
      userName: 'Public Verifier',
      userRole: 'public',
      action: 'CERTIFICATE_VERIFY_REVOKED',
      targetEntity: 'certificate',
      targetId: cert.id,
      details: `Public verification queried revoked certificate ${cert.verificationCode}.`
    });
    return res.status(400).json({
      verified: false,
      status: 'revoked',
      message: `Certificate ${cert.verificationCode} has been revoked by the Clinic Director.`
    });
  }

  logAudit(req, {
    userId: 'anonymous_verifier',
    userName: 'Public Verifier',
    userRole: 'public',
    action: 'CERTIFICATE_VERIFIED',
    targetEntity: 'certificate',
    targetId: cert.id,
    details: `Official certificate ${cert.verificationCode} verified for student ${cert.studentName}.`
  });

  // Strip sensitive clinical details (never expose diagnosis, prescribedMedication, recommendations, vitals, or nurseNotes publicly)
  const sanitizedPublicCertificate = {
    id: cert.id,
    verificationCode: cert.verificationCode,
    studentName: cert.studentName,
    studentId: cert.studentId,
    courseAndYear: cert.courseAndYear,
    boardingHouse: cert.boardingHouse,
    issuedAt: cert.issuedAt,
    validUntil: cert.validUntil,
    excusedDates: cert.excusedDates,
    issuerName: cert.issuerName,
    issuerLicense: cert.issuerLicense,
    approverName: cert.approverName,
    approverLicense: cert.approverLicense,
    status: cert.status,
    isSigned: true,
    integrityHash: cert.integrityHash,
    institution: cert.institution,
    clinicName: cert.clinicName
  };

  res.json({
    verified: true,
    certificate: sanitizedPublicCertificate,
    verifiedAt: new Date().toISOString()
  });
});

// ======================= ADMIN ENHANCEMENT API ROUTES =======================

// 5. Audit Logs API (Admin only, immutable)
app.get('/api/admin/audit-logs', authenticateToken, requireRole('admin'), (req, res) => {
  let logs = [...(db.auditLogs || [])];
  const { search, role, action, entity, startDate, endDate } = req.query;

  if (search) {
    const q = search.toLowerCase();
    logs = logs.filter(l =>
      (l.userName && l.userName.toLowerCase().includes(q)) ||
      (l.action && l.action.toLowerCase().includes(q)) ||
      (l.details && l.details.toLowerCase().includes(q)) ||
      (l.targetId && l.targetId.toLowerCase().includes(q)) ||
      (l.targetEntity && l.targetEntity.toLowerCase().includes(q))
    );
  }
  if (role && role !== 'all') {
    logs = logs.filter(l => l.userRole === role);
  }
  if (action && action !== 'all') {
    logs = logs.filter(l => l.action === action);
  }
  if (entity && entity !== 'all') {
    logs = logs.filter(l => l.targetEntity === entity);
  }
  if (startDate) {
    const s = new Date(startDate);
    logs = logs.filter(l => new Date(l.timestamp) >= s);
  }
  if (endDate) {
    const e = new Date(endDate);
    e.setHours(23, 59, 59, 999);
    logs = logs.filter(l => new Date(l.timestamp) <= e);
  }

  res.json(logs);
});

// Protect audit logs from modification or deletion
app.delete('/api/admin/audit-logs/:id', authenticateToken, requireRole('admin'), (req, res) => {
  logSecurityEvent(req, {
    type: 'SUSPICIOUS_ACTIVITY',
    severity: 'high',
    email: req.user.email,
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    details: `Blocked attempt to delete immutable audit log entry (${req.params.id}).`,
    resolved: false
  });
  return res.status(403).json({ error: 'Activity logs and audit trail entries are immutable and protected from modification or deletion.' });
});

// 6. Analytics & Statistics API (Admin, Doctor & Personnel)
app.get('/api/admin/stats', authenticateToken, requireRole('admin', 'doctor', 'personnel'), (req, res) => {
  const totalRequests = db.requests.length;
  const pendingRequests = db.requests.filter(r => r.status === 'pending').length;
  const activeRequests = db.requests.filter(r => ['assigned', 'en_route', 'in_progress', 'awaiting_doctor', 'returned_to_nurse'].includes(r.status)).length;
  const completedRequests = db.requests.filter(r => r.status === 'completed').length;
  const cancelledRequests = db.requests.filter(r => r.status === 'cancelled').length;
  const totalCertificates = db.certificates.filter(c => c.status !== 'draft').length;
  const totalClinicalRecords = db.clinicalRecords.length;

  const totalUsers = db.users.length;
  const totalStudents = db.users.filter(u => u.role === 'requester').length;
  const totalPersonnel = db.users.filter(u => u.role === 'personnel' || u.role === 'doctor').length;
  const totalDoctors = db.users.filter(u => u.role === 'doctor').length;
  const totalNurses = db.users.filter(u => u.role === 'personnel').length;
  const totalAdmins = db.users.filter(u => u.role === 'admin').length;

  const activeAccounts = db.users.filter(u => (u.status || 'active') === 'active').length;
  const inactiveAccounts = db.users.filter(u => u.status === 'inactive').length;
  const pendingAccounts = db.users.filter(u => u.status === 'pending').length;
  const lockedAccounts = db.users.filter(u => u.lockedUntil && new Date(u.lockedUntil) > new Date()).length;

  // Triage breakdown
  const urgencyBreakdown = {
    severe: db.requests.filter(r => r.urgency === 'severe').length,
    moderate: db.requests.filter(r => r.urgency === 'moderate').length,
    mild: db.requests.filter(r => r.urgency === 'mild').length
  };

  const requestsByStatus = {
    pending: pendingRequests,
    assigned: db.requests.filter(r => r.status === 'assigned').length,
    en_route: db.requests.filter(r => r.status === 'en_route').length,
    in_progress: db.requests.filter(r => r.status === 'in_progress').length,
    completed: completedRequests,
    cancelled: cancelledRequests
  };

  // Boarding house clusters
  const boardingHouseCounts = {};
  db.requests.forEach(r => {
    const bh = r.boardingHouse ? r.boardingHouse.split('(')[0].trim() : 'Unknown';
    boardingHouseCounts[bh] = (boardingHouseCounts[bh] || 0) + 1;
  });

  // Top symptoms
  const symptomCounts = {};
  db.requests.forEach(r => {
    (r.symptoms || []).forEach(s => {
      symptomCounts[s] = (symptomCounts[s] || 0) + 1;
    });
  });

  // Login activity statistics from auditLogs & securityEvents
  const loginLogs = (db.auditLogs || []).filter(l => l.action === 'USER_LOGIN');
  const failedLoginLogs = (db.auditLogs || []).filter(l => l.action === 'LOGIN_FAILED');
  const failedSecEvents = (db.securityEvents || []).filter(e => e.type === 'LOGIN_FAILED');
  const loginsByRole = {
    requester: loginLogs.filter(l => l.userRole === 'requester').length,
    personnel: loginLogs.filter(l => l.userRole === 'personnel').length,
    admin: loginLogs.filter(l => l.userRole === 'admin').length
  };

  // Daily login & activity counts grouped by date (last 7 active dates)
  const activityByDate = {};
  (db.auditLogs || []).forEach(l => {
    const day = (l.timestamp || '').split('T')[0];
    if (!day) return;
    if (!activityByDate[day]) activityByDate[day] = { logins: 0, requests: 0, total: 0 };
    activityByDate[day].total++;
    if (l.action === 'USER_LOGIN') activityByDate[day].logins++;
    if (l.action === 'REQUEST_CREATED') activityByDate[day].requests++;
  });

  res.json({
    totalRequests,
    pendingRequests,
    activeRequests,
    completedRequests,
    cancelledRequests,
    totalCertificates,
    totalClinicalRecords,
    totalUsers,
    totalStudents,
    totalPersonnel,
    totalAdmins,
    activeAccounts,
    inactiveAccounts,
    pendingAccounts,
    lockedAccounts,
    urgencyBreakdown,
    requestsByStatus,
    boardingHouseCounts,
    symptomCounts,
    loginStats: {
      totalLogins: loginLogs.length,
      failedLogins: Math.max(failedLoginLogs.length, failedSecEvents.length),
      suspiciousEvents: (db.securityEvents || []).filter(e => !e.resolved).length,
      lockedAccounts,
      loginsByRole,
      activityByDate
    },
    recentActivities: (db.auditLogs || []).slice(0, 12),
    certificates: db.certificates
  });
});

// ======================= SECTION 1: USER MANAGEMENT ROUTES =======================

app.get('/api/admin/users', authenticateToken, requireRole('admin'), (req, res) => {
  const enrichedUsers = db.users.map(u => {
    const safe = sanitizeUser(u);
    const userRequests = db.requests.filter(r => r.userId === u.id).length;
    const assignedCount = db.requests.filter(r => r.assignedTo && r.assignedTo.id === u.id).length;
    const certsCount = u.role === 'requester'
      ? db.certificates.filter(c => c.studentId === u.studentId).length
      : db.certificates.filter(c => c.issuerName === u.name).length;

    return {
      ...safe,
      status: u.status || 'active',
      permissions: u.permissions || getDefaultPermissions(u.role),
      settings: u.settings || getDefaultUserSettings(u.role),
      metrics: {
        requestsCount: u.role === 'requester' ? userRequests : assignedCount,
        certificatesCount: certsCount
      }
    };
  });
  res.json(enrichedUsers);
});

app.post('/api/admin/users', authenticateToken, requireRole('admin'), (req, res) => {
  const {
    name,
    email,
    password,
    role = 'requester',
    status = 'active',
    phone = '',
    studentId = '',
    courseAndYear = '',
    boardingHouse = '',
    address = '',
    landmark = '',
    emergencyContact = { name: '', phone: '' },
    title = '',
    licenseNumber = '',
    permissions
  } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const validRoles = ['requester', 'personnel', 'doctor', 'admin'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid user role.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  if (db.users.some(u => u.email.toLowerCase() === cleanEmail)) {
    return res.status(400).json({ error: 'An account with this email already exists.' });
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);

  const newUser = {
    id: 'usr_' + Date.now() + '_' + Math.floor(Math.random() * 100),
    name: name.trim(),
    email: cleanEmail,
    passwordHash,
    role,
    status: ['active', 'inactive', 'pending'].includes(status) ? status : 'active',
    phone: phone.trim(),
    studentId: role === 'requester' ? (studentId.trim() || '2026-30000') : undefined,
    courseAndYear: role === 'requester' ? (courseAndYear.trim() || 'BS Information Technology') : undefined,
    boardingHouse: role === 'requester' ? (boardingHouse.trim() || 'Villanueva Boarding House') : undefined,
    address: role === 'requester' ? (address.trim() || 'Villanueva, Misamis Oriental') : undefined,
    landmark: role === 'requester' ? landmark.trim() : undefined,
    emergencyContact: role === 'requester' ? emergencyContact : undefined,
    title: role !== 'requester' ? (title.trim() || (role === 'admin' ? 'System Administrator' : 'Campus Health Personnel')) : undefined,
    licenseNumber: role !== 'requester' ? (licenseNumber.trim() || 'PRC Verified') : undefined,
    permissions: permissions && typeof permissions === 'object' ? { ...getDefaultPermissions(role), ...permissions } : getDefaultPermissions(role),
    settings: getDefaultUserSettings(role),
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: new Date().toISOString()
  };

  db.users.push(newUser);
  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'USER_CREATED',
    targetEntity: 'user',
    targetId: newUser.id,
    details: `Administrator created ${role.toUpperCase()} account for ${newUser.name} (${newUser.email}).`
  });

  createNotification(
    newUser.id,
    'Welcome to VitaCall USTP Villanueva',
    `Your ${role === 'requester' ? 'Student' : (role === 'personnel' ? 'Health Personnel' : 'Administrator')} account has been provisioned by ${req.user.name}.`,
    'info',
    null,
    'dashboard'
  );

  res.status(201).json({ message: 'User account created successfully', user: sanitizeUser(newUser) });
});

app.put('/api/admin/users/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const targetUser = db.users.find(u => u.id === req.params.id);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  const {
    name,
    email,
    role,
    status,
    phone,
    studentId,
    courseAndYear,
    boardingHouse,
    address,
    landmark,
    emergencyContact,
    title,
    licenseNumber,
    permissions
  } = req.body;

  const previousRole = targetUser.role;
  const previousStatus = targetUser.status || 'active';

  if (email && email.trim().toLowerCase() !== targetUser.email.toLowerCase()) {
    const cleanEmail = email.trim().toLowerCase();
    if (db.users.some(u => u.id !== targetUser.id && u.email.toLowerCase() === cleanEmail)) {
      return res.status(400).json({ error: 'Email address is already in use by another account.' });
    }
    targetUser.email = cleanEmail;
  }

  if (name && name.trim()) targetUser.name = name.trim();
  if (phone !== undefined) targetUser.phone = phone.trim();

  if (role && ['requester', 'personnel', 'doctor', 'admin'].includes(role)) {
    // Prevent removing admin role from the last active admin
    if (targetUser.id === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot demote your own active Administrator role.' });
    }
    targetUser.role = role;
    if (role !== previousRole && !permissions) {
      targetUser.permissions = getDefaultPermissions(role);
    }
  }

  if (status && ['active', 'inactive', 'pending'].includes(status)) {
    if (targetUser.id === req.user.id && status !== 'active') {
      return res.status(400).json({ error: 'You cannot deactivate your own active Administrator account.' });
    }
    targetUser.status = status;
  }

  if (studentId !== undefined) targetUser.studentId = studentId.trim();
  if (courseAndYear !== undefined) targetUser.courseAndYear = courseAndYear.trim();
  if (boardingHouse !== undefined) targetUser.boardingHouse = boardingHouse.trim();
  if (address !== undefined) targetUser.address = address.trim();
  if (landmark !== undefined) targetUser.landmark = landmark.trim();
  if (emergencyContact && typeof emergencyContact === 'object') {
    targetUser.emergencyContact = {
      name: (emergencyContact.name || '').trim(),
      phone: (emergencyContact.phone || '').trim()
    };
  }
  if (title !== undefined) targetUser.title = title.trim();
  if (licenseNumber !== undefined) targetUser.licenseNumber = licenseNumber.trim();

  if (permissions && typeof permissions === 'object') {
    targetUser.permissions = {
      ...(targetUser.permissions || getDefaultPermissions(targetUser.role)),
      ...permissions
    };
  }

  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: previousRole !== targetUser.role ? 'ROLE_CHANGED' : 'USER_UPDATED',
    targetEntity: 'user',
    targetId: targetUser.id,
    details: `Updated user ${targetUser.name} (${targetUser.email}). Role: ${previousRole} -> ${targetUser.role}, Status: ${previousStatus} -> ${targetUser.status}.`
  });

  if (previousRole !== targetUser.role) {
    logSecurityEvent(req, {
      type: 'PERMISSION_CHANGE',
      severity: 'medium',
      email: targetUser.email,
      userId: targetUser.id,
      userName: targetUser.name,
      userRole: targetUser.role,
      details: `Role changed for ${targetUser.name} from ${previousRole} to ${targetUser.role} by ${req.user.name}.`,
      resolved: true
    });
  }

  res.json({ message: 'User account updated successfully', user: sanitizeUser(targetUser) });
});

app.patch('/api/admin/users/:id/status', authenticateToken, requireRole('admin'), (req, res) => {
  const targetUser = db.users.find(u => u.id === req.params.id);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  const { status } = req.body;
  if (!['active', 'inactive', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Invalid account status' });
  }
  if (targetUser.id === req.user.id && status !== 'active') {
    return res.status(400).json({ error: 'You cannot deactivate your own active Administrator account.' });
  }

  const prevStatus = targetUser.status || 'active';
  targetUser.status = status;
  if (status === 'active') {
    targetUser.failedLoginAttempts = 0;
    targetUser.lockedUntil = null;
  }
  saveDb();

  const actionCode = status === 'active'
    ? (prevStatus === 'pending' ? 'USER_APPROVED' : 'USER_ACTIVATED')
    : 'USER_DEACTIVATED';

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: actionCode,
    targetEntity: 'user',
    targetId: targetUser.id,
    details: `Account status for ${targetUser.name} (${targetUser.email}) changed from ${prevStatus.toUpperCase()} to ${status.toUpperCase()}.`
  });

  createNotification(
    targetUser.id,
    `Account Status: ${status.toUpperCase()}`,
    `Your VitaCall account status has been updated to ${status.toUpperCase()} by ${req.user.name}.`,
    status === 'active' ? 'success' : 'warning',
    null,
    'dashboard'
  );

  res.json({ message: `Account status updated to ${status}`, user: sanitizeUser(targetUser) });
});

app.patch('/api/admin/users/:id/permissions', authenticateToken, requireRole('admin'), (req, res) => {
  const targetUser = db.users.find(u => u.id === req.params.id);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  const { permissions, role } = req.body;
  if (role && ['requester', 'personnel', 'doctor', 'admin'].includes(role)) {
    if (targetUser.id === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot remove admin role from your own account.' });
    }
    targetUser.role = role;
  }

  if (permissions && typeof permissions === 'object') {
    targetUser.permissions = {
      ...(targetUser.permissions || getDefaultPermissions(targetUser.role)),
      ...permissions
    };
  }

  saveDb();

  const enabledPerms = Object.entries(targetUser.permissions || {})
    .filter(([, val]) => val)
    .map(([k]) => k)
    .join(', ');

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'PERMISSIONS_UPDATED',
    targetEntity: 'user',
    targetId: targetUser.id,
    details: `Permissions updated for ${targetUser.name} (${targetUser.role}). Active permissions: ${enabledPerms || 'none'}.`
  });

  logSecurityEvent(req, {
    type: 'PERMISSION_CHANGE',
    severity: 'medium',
    email: targetUser.email,
    userId: targetUser.id,
    userName: targetUser.name,
    userRole: targetUser.role,
    details: `Access permissions modified for ${targetUser.name} by ${req.user.name}.`,
    resolved: true
  });

  res.json({ message: 'User permissions updated successfully', user: sanitizeUser(targetUser) });
});

app.post('/api/admin/users/:id/reset-password', authenticateToken, requireRole('admin'), (req, res) => {
  const targetUser = db.users.find(u => u.id === req.params.id);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  const { newPassword } = req.body;
  if (!newPassword || String(newPassword).trim().length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const salt = bcrypt.genSaltSync(10);
  targetUser.passwordHash = bcrypt.hashSync(String(newPassword).trim(), salt);
  targetUser.failedLoginAttempts = 0;
  targetUser.lockedUntil = null;
  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'PASSWORD_RESET',
    targetEntity: 'user',
    targetId: targetUser.id,
    details: `Password securely reset (bcrypt-hashed) for ${targetUser.name} (${targetUser.email}) by Administrator.`
  });

  logSecurityEvent(req, {
    type: 'PASSWORD_RESET',
    severity: 'medium',
    email: targetUser.email,
    userId: targetUser.id,
    userName: targetUser.name,
    userRole: targetUser.role,
    details: `Administrative password reset executed for ${targetUser.email} by ${req.user.name}.`,
    resolved: true
  });

  createNotification(
    targetUser.id,
    'Security Notice: Password Reset',
    `Your account password was reset by Administrator ${req.user.name}. Please update your password in your Profile or Settings.`,
    'warning',
    null,
    'profile'
  );

  res.json({ message: `Password securely reset for ${targetUser.name}` });
});

app.delete('/api/admin/users/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const idx = db.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  const targetUser = db.users[idx];
  if (targetUser.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own currently logged-in Administrator account.' });
  }

  db.users.splice(idx, 1);
  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'USER_DELETED',
    targetEntity: 'user',
    targetId: targetUser.id,
    details: `Deleted user account: ${targetUser.name} (${targetUser.email}, Role: ${targetUser.role}).`
  });

  res.json({ message: 'User account deleted successfully', deletedId: targetUser.id });
});

// ======================= SECTION 4: REPORTS & ANALYTICS ROUTES =======================

app.get('/api/admin/reports', authenticateToken, requireRole('admin'), (req, res) => {
  const { category = 'summary', period = 'all', startDate, endDate, log } = req.query;

  // Determine date range filter
  let minDate = null;
  let maxDate = new Date();
  maxDate.setHours(23, 59, 59, 999);

  if (period === 'daily') {
    minDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  } else if (period === 'weekly') {
    minDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === 'monthly') {
    minDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  } else if (period === 'custom') {
    if (startDate) minDate = new Date(startDate);
    if (endDate) {
      maxDate = new Date(endDate);
      maxDate.setHours(23, 59, 59, 999);
    }
  }

  const inRange = (isoStr) => {
    if (!isoStr) return true;
    const d = new Date(isoStr);
    if (minDate && d < minDate) return false;
    if (maxDate && d > maxDate) return false;
    return true;
  };

  // Note: If daily/weekly filter yields 0 records because seed dates are from Oct/Nov 2026,
  // we still return accurate filtered counts and provide a clear dataset.
  const filteredRequests = db.requests.filter(r => inRange(r.createdAt));
  const filteredAuditLogs = db.auditLogs.filter(l => inRange(l.timestamp));
  const filteredCertificates = db.certificates.filter(c => inRange(c.issuedAt));
  const filteredClinical = db.clinicalRecords.filter(c => inRange(c.dateExamined));

  const studentsReport = db.users
    .filter(u => u.role === 'requester')
    .map(s => {
      const sReqs = filteredRequests.filter(r => r.userId === s.id);
      const sCerts = filteredCertificates.filter(c => c.studentId === s.studentId);
      return {
        id: s.id,
        name: s.name,
        studentId: s.studentId || 'N/A',
        email: s.email,
        courseAndYear: s.courseAndYear || 'N/A',
        boardingHouse: s.boardingHouse || 'N/A',
        phone: s.phone || 'N/A',
        status: s.status || 'active',
        totalRequests: sReqs.length,
        completedRequests: sReqs.filter(r => r.status === 'completed').length,
        certificatesIssued: sCerts.length,
        createdAt: s.createdAt
      };
    });

  const personnelReport = db.users
    .filter(u => u.role === 'personnel' || u.role === 'admin')
    .map(p => {
      const assigned = filteredRequests.filter(r => r.assignedTo && r.assignedTo.id === p.id);
      const completed = assigned.filter(r => r.status === 'completed');
      const exams = filteredClinical.filter(c => c.examinerId === p.id || c.examinerName === p.name);
      const certs = filteredCertificates.filter(c => c.issuerName === p.name);
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        title: p.title || 'Health Personnel',
        licenseNumber: p.licenseNumber || 'PRC Verified',
        email: p.email,
        phone: p.phone || 'N/A',
        status: p.status || 'active',
        dutyStatus: (p.settings && p.settings.dutyStatus) || 'on_duty',
        assignedRequests: assigned.length,
        completedCheckups: completed.length,
        clinicalExamsRecorded: exams.length,
        certificatesIssued: certs.length
      };
    });

  const loginHistoryReport = (db.auditLogs || [])
    .filter(l => ['USER_LOGIN', 'USER_LOGOUT', 'LOGIN_FAILED', 'SESSION_EXPIRED'].includes(l.action) && inRange(l.timestamp))
    .map(l => ({
      id: l.id,
      timestamp: l.timestamp,
      userName: l.userName,
      userRole: l.userRole,
      action: l.action,
      ipAddress: l.ipAddress,
      userAgent: l.userAgent,
      details: l.details
    }));

  const accountActivityReport = filteredAuditLogs.map(l => ({
    id: l.id,
    timestamp: l.timestamp,
    userName: l.userName,
    userRole: l.userRole,
    action: l.action,
    targetEntity: l.targetEntity,
    targetId: l.targetId,
    details: l.details,
    ipAddress: l.ipAddress,
    integrityHash: l.integrityHash
  }));

  if (log === 'true') {
    logAudit(req, {
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'REPORT_GENERATED',
      targetEntity: 'report',
      targetId: `${category.toUpperCase()}-${period.toUpperCase()}`,
      details: `Generated ${period} ${category} report.`
    });
  }

  res.json({
    generatedAt: new Date().toISOString(),
    generatedBy: req.user.name,
    category,
    period,
    summary: {
      totalUsers: db.users.length,
      totalStudents: studentsReport.length,
      totalPersonnel: personnelReport.length,
      requestsInPeriod: filteredRequests.length,
      completedCheckupsInPeriod: filteredRequests.filter(r => r.status === 'completed').length,
      certificatesInPeriod: filteredCertificates.length,
      auditEventsInPeriod: filteredAuditLogs.length,
      loginsInPeriod: loginHistoryReport.filter(l => l.action === 'USER_LOGIN').length,
      failedLoginsInPeriod: loginHistoryReport.filter(l => l.action === 'LOGIN_FAILED').length
    },
    studentsReport,
    personnelReport,
    accountActivityReport,
    loginHistoryReport,
    clinicalRequestsReport: filteredRequests
  });
});

// ======================= SECTION 5: SECURITY MANAGEMENT ROUTES =======================

app.get('/api/admin/security', authenticateToken, requireRole('admin'), (req, res) => {
  const events = db.securityEvents || [];
  const lockedUsers = db.users
    .filter(u => (u.lockedUntil && new Date(u.lockedUntil) > new Date()) || (u.failedLoginAttempts || 0) > 0)
    .map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      failedLoginAttempts: u.failedLoginAttempts || 0,
      lockedUntil: u.lockedUntil
    }));

  const loginAttempts = events.filter(e => ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'ACCOUNT_LOCKED'].includes(e.type));
  const suspiciousActivities = events.filter(e =>
    ['LOGIN_FAILED', 'ACCOUNT_LOCKED', 'SUSPICIOUS_ACTIVITY', 'UNAUTHORIZED_ACCESS'].includes(e.type)
  );

  res.json({
    summary: {
      totalSecurityEvents: events.length,
      successfulLogins: events.filter(e => e.type === 'LOGIN_SUCCESS').length,
      failedLogins: events.filter(e => e.type === 'LOGIN_FAILED').length,
      unresolvedAlerts: events.filter(e => !e.resolved).length,
      lockedAccountsCount: lockedUsers.filter(u => u.lockedUntil && new Date(u.lockedUntil) > new Date()).length,
      sessionTimeoutMinutes: (db.systemSettings && db.systemSettings.sessionTimeoutMinutes) || 30,
      maxFailedLoginAttempts: (db.systemSettings && db.systemSettings.maxFailedLoginAttempts) || 5
    },
    securityEvents: events,
    loginAttempts,
    suspiciousActivities,
    lockedUsers
  });
});

app.post('/api/admin/security/events/:id/resolve', authenticateToken, requireRole('admin'), (req, res) => {
  const evt = (db.securityEvents || []).find(e => e.id === req.params.id);
  if (!evt) return res.status(404).json({ error: 'Security event not found' });

  evt.resolved = true;
  evt.resolvedAt = new Date().toISOString();
  evt.resolvedBy = req.user.name;
  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'SECURITY_ALERT_RESOLVED',
    targetEntity: 'securityEvent',
    targetId: evt.id,
    details: `Resolved security event ${evt.id} (${evt.type}).`
  });

  res.json({ message: 'Security event marked as resolved', event: evt });
});

app.post('/api/admin/security/unlock-user/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  if (user.status === 'inactive' && req.body.activate) {
    user.status = 'active';
  }
  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'ACCOUNT_UNLOCKED',
    targetEntity: 'user',
    targetId: user.id,
    details: `Reset failed login counter and unlocked account for ${user.name} (${user.email}).`
  });

  res.json({ message: `Unlocked account for ${user.name}`, user: sanitizeUser(user) });
});

// ======================= SECTION 6: DATA MANAGEMENT & BACKUP ROUTES =======================

// Get all system records for Admin Data Management
app.get('/api/admin/records', authenticateToken, requireRole('admin'), (req, res) => {
  res.json({
    requests: db.requests || [],
    clinicalRecords: db.clinicalRecords || [],
    certificates: db.certificates || [],
    backups: (db.backups || []).map(b => ({
      id: b.id,
      name: b.name,
      createdAt: b.createdAt,
      createdBy: b.createdBy,
      counts: b.counts
    }))
  });
});

// Create a record in requests, clinicalRecords, or certificates
app.post('/api/admin/records/:collection', authenticateToken, requireRole('admin'), (req, res) => {
  const { collection } = req.params;
  const payload = req.body;
  const now = new Date().toISOString();

  if (collection === 'requests') {
    const newReq = {
      id: payload.id || ('REQ-2026-' + (1000 + db.requests.length + 1)),
      userId: payload.userId || req.user.id,
      studentName: (payload.studentName || 'Student Requester').trim(),
      studentId: (payload.studentId || '2026-30001').trim(),
      courseAndYear: (payload.courseAndYear || 'BS Information Technology').trim(),
      phone: (payload.phone || '+63 917 000 0000').trim(),
      boardingHouse: (payload.boardingHouse || 'Villanueva Boarding House').trim(),
      address: (payload.address || 'Villanueva, Misamis Oriental').trim(),
      landmark: (payload.landmark || '').trim(),
      urgency: payload.urgency || 'moderate',
      symptoms: Array.isArray(payload.symptoms) ? payload.symptoms : String(payload.symptoms || 'Fever').split(',').map(s => s.trim()).filter(Boolean),
      symptomDetails: payload.symptomDetails || 'Created by Administrator.',
      temperature: payload.temperature || '37.5',
      canWalk: Boolean(payload.canWalk),
      hasCompanion: Boolean(payload.hasCompanion),
      preferredTime: payload.preferredTime || 'As soon as possible',
      status: payload.status || 'pending',
      assignedTo: payload.assignedTo || null,
      timeline: [{ status: payload.status || 'pending', timestamp: now, notes: 'Record created by Administrator.' }],
      createdAt: now,
      completedAt: payload.status === 'completed' ? now : null,
      certificateId: null
    };
    db.requests.unshift(newReq);
    saveDb();
    logAudit(req, {
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'RECORD_CREATED',
      targetEntity: 'request',
      targetId: newReq.id,
      details: `Admin created health request record ${newReq.id} for ${newReq.studentName}.`
    });
    return res.status(201).json({ message: 'Request record created', record: newReq });
  }

  if (collection === 'clinicalRecords') {
    const newCr = {
      id: payload.id || ('CR-2026-' + (1000 + db.clinicalRecords.length + 1)),
      requestId: payload.requestId || 'N/A',
      patientId: payload.patientId || 'usr_student1',
      patientName: (payload.patientName || 'Student Patient').trim(),
      studentId: (payload.studentId || '2023-30192').trim(),
      examinerId: req.user.id,
      examinerName: payload.examinerName || req.user.name,
      examinerTitle: req.user.title || 'Health Center Administrator',
      examinerLicense: req.user.licenseNumber || 'PRC MD-0033219',
      dateExamined: now,
      vitals: payload.vitals || { bp: '120/80 mmHg', temp: '37.5 °C', pulse: '80 bpm', respRate: '18 cpm', spo2: '98 %' },
      symptomsObserved: payload.symptomsObserved || '',
      diagnosis: (payload.diagnosis || 'General Clinical Consultation').trim(),
      prescriptionAndCare: payload.prescriptionAndCare || '',
      excusedDuration: payload.excusedDuration || { isExcused: true, startDate: now.split('T')[0], endDate: now.split('T')[0], daysCount: 1, reason: 'Medical consultation' },
      remarks: payload.remarks || ''
    };
    db.clinicalRecords.unshift(newCr);
    saveDb();
    logAudit(req, {
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'RECORD_CREATED',
      targetEntity: 'clinicalRecord',
      targetId: newCr.id,
      details: `Admin created clinical record ${newCr.id} for ${newCr.patientName}.`
    });
    return res.status(201).json({ message: 'Clinical record created', record: newCr });
  }

  return res.status(400).json({ error: 'Unsupported collection for direct creation' });
});

// Edit a record in requests, clinicalRecords, or certificates
app.put('/api/admin/records/:collection/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const { collection, id } = req.params;
  if (!['requests', 'clinicalRecords', 'certificates'].includes(collection)) {
    return res.status(400).json({ error: 'Invalid record collection' });
  }

  const list = db[collection] || [];
  const item = list.find(r => r.id === id);
  if (!item) return res.status(404).json({ error: 'Record not found' });

  const updates = req.body || {};
  Object.keys(updates).forEach(k => {
    if (k !== 'id') {
      item[k] = updates[k];
    }
  });

  if (collection === 'certificates') {
    item.integrityHash = generateHash(item);
  }

  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'RECORD_UPDATED',
    targetEntity: collection,
    targetId: id,
    details: `Administrator updated ${collection} record (${id}).`
  });

  res.json({ message: 'Record updated successfully', record: item });
});

// Delete a record in requests, clinicalRecords, or certificates
app.delete('/api/admin/records/:collection/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const { collection, id } = req.params;
  if (!['requests', 'clinicalRecords', 'certificates'].includes(collection)) {
    return res.status(400).json({ error: 'Invalid record collection' });
  }

  const list = db[collection] || [];
  const idx = list.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Record not found' });

  const removed = list.splice(idx, 1)[0];
  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'RECORD_DELETED',
    targetEntity: collection,
    targetId: id,
    details: `Administrator deleted record ${id} from ${collection}.`
  });

  res.json({ message: `Record ${id} deleted successfully`, deleted: removed });
});

// 7. System Backup & Restore (Admin only - Information Assurance requirement)
app.get('/api/admin/backup', authenticateToken, requireRole('admin'), (req, res) => {
  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'DATABASE_BACKUP_EXPORTED',
    targetEntity: 'system',
    targetId: 'vitacall-db',
    details: 'Full database snapshot exported for disaster recovery.'
  });

  const { backups, ...exportPayload } = db;
  res.setHeader('Content-Disposition', `attachment; filename=vitacall-backup-${Date.now()}.json`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(exportPayload, null, 2));
});

app.post('/api/admin/restore', authenticateToken, requireRole('admin'), (req, res) => {
  const backupData = req.body;
  if (!backupData || !backupData.users || !backupData.requests) {
    return res.status(400).json({ error: 'Invalid backup structure' });
  }

  // Keep existing backups history so restore points aren't lost
  const existingBackups = db.backups || [];
  db = {
    ...db,
    ...backupData,
    backups: existingBackups
  };
  ensureDbSchema();
  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'DATABASE_RESTORED',
    targetEntity: 'system',
    targetId: 'vitacall-db',
    details: 'Database restored from JSON backup image.'
  });

  res.json({ message: 'Database restored successfully', totalRecords: db.requests.length });
});

// In-App Backup Snapshots Manager
app.get('/api/admin/backups', authenticateToken, requireRole('admin'), (req, res) => {
  const list = (db.backups || []).map(b => ({
    id: b.id,
    name: b.name,
    createdAt: b.createdAt,
    createdBy: b.createdBy,
    counts: b.counts
  }));
  res.json(list);
});

app.post('/api/admin/backups', authenticateToken, requireRole('admin'), (req, res) => {
  const { name } = req.body;
  const snapId = 'BKP-' + Date.now();
  const { backups, ...snapshotData } = JSON.parse(JSON.stringify(db));

  const snapshot = {
    id: snapId,
    name: (name && name.trim()) ? name.trim() : `System Snapshot (${new Date().toLocaleDateString()})`,
    createdAt: new Date().toISOString(),
    createdBy: req.user.name,
    counts: {
      users: (db.users || []).length,
      requests: (db.requests || []).length,
      clinicalRecords: (db.clinicalRecords || []).length,
      certificates: (db.certificates || []).length,
      announcements: (db.announcements || []).length
    },
    data: snapshotData
  };

  if (!Array.isArray(db.backups)) db.backups = [];
  db.backups.unshift(snapshot);
  if (db.backups.length > 10) db.backups.pop();
  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'DATABASE_BACKUP_CREATED',
    targetEntity: 'backup',
    targetId: snapId,
    details: `Created in-app database restore point "${snapshot.name}".`
  });

  const { data, ...meta } = snapshot;
  res.status(201).json({ message: 'Backup snapshot created', backup: meta });
});

app.post('/api/admin/backups/:id/restore', authenticateToken, requireRole('admin'), (req, res) => {
  const snap = (db.backups || []).find(b => b.id === req.params.id);
  if (!snap || !snap.data) {
    return res.status(404).json({ error: 'Backup snapshot not found' });
  }

  const savedBackups = db.backups;
  db = {
    ...JSON.parse(JSON.stringify(snap.data)),
    backups: savedBackups
  };
  ensureDbSchema();
  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'DATABASE_RESTORED',
    targetEntity: 'backup',
    targetId: snap.id,
    details: `Restored system database from snapshot "${snap.name}" (${snap.id}).`
  });

  res.json({ message: `System restored from "${snap.name}"`, totalRecords: db.requests.length });
});

app.delete('/api/admin/backups/:id', authenticateToken, requireRole('admin'), (req, res) => {
  if (!Array.isArray(db.backups)) db.backups = [];
  const idx = db.backups.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Backup snapshot not found' });

  const removed = db.backups.splice(idx, 1)[0];
  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'BACKUP_DELETED',
    targetEntity: 'backup',
    targetId: removed.id,
    details: `Deleted backup snapshot "${removed.name}".`
  });

  res.json({ message: 'Backup snapshot deleted' });
});

// ======================= SECTION 7: ANNOUNCEMENTS & NOTIFICATIONS ROUTES =======================

app.get('/api/admin/announcements', authenticateToken, requireRole('admin'), (req, res) => {
  res.json({
    announcements: db.announcements || [],
    recentNotifications: (db.notifications || []).slice(0, 100)
  });
});

app.post('/api/admin/announcements', authenticateToken, requireRole('admin'), (req, res) => {
  const {
    title,
    message,
    targetRole = 'all',
    priority = 'info',
    isPinned = false,
    scheduledAt = null,
    expiresAt = null,
    sendNotification = true
  } = req.body;

  if (!title || !message) {
    return res.status(400).json({ error: 'Announcement title and message are required.' });
  }

  const now = new Date().toISOString();
  const announcement = {
    id: 'ANN-2026-' + Date.now().toString().slice(-5),
    title: title.trim(),
    message: message.trim(),
    targetRole: ['all', 'requester', 'personnel'].includes(targetRole) ? targetRole : 'all',
    priority: ['info', 'warning', 'urgent', 'maintenance'].includes(priority) ? priority : 'info',
    isPinned: Boolean(isPinned),
    authorId: req.user.id,
    authorName: req.user.name,
    createdAt: now,
    updatedAt: now,
    scheduledAt: scheduledAt || null,
    expiresAt: expiresAt || null
  };

  if (!Array.isArray(db.announcements)) db.announcements = [];
  db.announcements.unshift(announcement);

  // Also dispatch in-app notifications to matching users
  let recipientsCount = 0;
  if (sendNotification) {
    const recipients = db.users.filter(u =>
      targetRole === 'all' ? true : u.role === targetRole
    );
    recipients.forEach(u => {
      createNotification(
        u.id,
        `📢 ${announcement.title}`,
        announcement.message,
        priority === 'urgent' ? 'urgent' : 'info',
        null,
        'dashboard'
      );
      recipientsCount++;
    });
  }

  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'ANNOUNCEMENT_CREATED',
    targetEntity: 'announcement',
    targetId: announcement.id,
    details: `Published announcement "${announcement.title}" to [${targetRole.toUpperCase()}] (${recipientsCount} users notified).`
  });

  res.status(201).json({
    message: `Announcement published (${recipientsCount} users notified)`,
    announcement,
    recipientsCount
  });
});

app.put('/api/admin/announcements/:id', authenticateToken, requireRole('admin'), (req, res) => {
  const ann = (db.announcements || []).find(a => a.id === req.params.id);
  if (!ann) return res.status(404).json({ error: 'Announcement not found' });

  const { title, message, targetRole, priority, isPinned, scheduledAt, expiresAt } = req.body;
  if (title && title.trim()) ann.title = title.trim();
  if (message && message.trim()) ann.message = message.trim();
  if (targetRole && ['all', 'requester', 'personnel'].includes(targetRole)) ann.targetRole = targetRole;
  if (priority && ['info', 'warning', 'urgent', 'maintenance'].includes(priority)) ann.priority = priority;
  if (isPinned !== undefined) ann.isPinned = Boolean(isPinned);
  if (scheduledAt !== undefined) ann.scheduledAt = scheduledAt || null;
  if (expiresAt !== undefined) ann.expiresAt = expiresAt || null;
  ann.updatedAt = new Date().toISOString();

  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'ANNOUNCEMENT_UPDATED',
    targetEntity: 'announcement',
    targetId: ann.id,
    details: `Updated announcement "${ann.title}".`
  });

  res.json({ message: 'Announcement updated', announcement: ann });
});

app.delete('/api/admin/announcements/:id', authenticateToken, requireRole('admin'), (req, res) => {
  if (!Array.isArray(db.announcements)) db.announcements = [];
  const idx = db.announcements.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Announcement not found' });

  const removed = db.announcements.splice(idx, 1)[0];
  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'ANNOUNCEMENT_DELETED',
    targetEntity: 'announcement',
    targetId: removed.id,
    details: `Deleted announcement "${removed.title}".`
  });

  res.json({ message: 'Announcement deleted', deletedId: removed.id });
});

// ======================= SECTION 8: SYSTEM SETTINGS ROUTES =======================

app.get('/api/admin/settings', authenticateToken, requireRole('admin'), (req, res) => {
  const dbStat = fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE) : null;
  res.json({
    settings: db.systemSettings || getDefaultSystemSettings(),
    systemInfo: {
      version: '2.4.0-USTP-Enterprise',
      nodeVersion: process.version,
      platform: process.platform,
      uptimeSeconds: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
      databaseSizeKb: dbStat ? Math.round((dbStat.size / 1024) * 10) / 10 : 0,
      lastModified: dbStat ? dbStat.mtime.toISOString() : new Date().toISOString(),
      firebaseProjectId: (db.systemSettings && db.systemSettings.firebaseProjectId) || 'vitacall-ustp-villanueva',
      firebaseSyncStatus: 'Synchronized (Firestore + Realtime DB Rules Active)',
      collectionsCount: {
        users: (db.users || []).length,
        requests: (db.requests || []).length,
        clinicalRecords: (db.clinicalRecords || []).length,
        certificates: (db.certificates || []).length,
        auditLogs: (db.auditLogs || []).length,
        announcements: (db.announcements || []).length,
        securityEvents: (db.securityEvents || []).length,
        backups: (db.backups || []).length
      }
    }
  });
});

app.put('/api/admin/settings', authenticateToken, requireRole('admin'), (req, res) => {
  if (!db.systemSettings || typeof db.systemSettings !== 'object') {
    db.systemSettings = getDefaultSystemSettings();
  }

  const updates = req.body || {};
  const allowedFields = [
    'systemName',
    'systemSubtitle',
    'institutionName',
    'campusName',
    'clinicName',
    'logoUrl',
    'clinicHotline',
    'emergencyHotline',
    'operatingHours',
    'allowRegistration',
    'requireAccountApproval',
    'enforceUstpEmail',
    'maxFailedLoginAttempts',
    'lockoutDurationMinutes',
    'sessionTimeoutMinutes',
    'maintenanceMode',
    'maintenanceMessage',
    'enableAnnouncementsBanner',
    'autoNotifyPersonnelOnSevere',
    'enableSoundAlerts',
    'defaultCertValidityDays',
    'firebaseSyncEnabled',
    'firebaseProjectId'
  ];

  allowedFields.forEach(field => {
    if (updates[field] !== undefined) {
      db.systemSettings[field] = updates[field];
    }
  });

  db.systemSettings.updatedAt = new Date().toISOString();
  db.systemSettings.updatedBy = req.user.name;
  saveDb();

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'SYSTEM_SETTINGS_UPDATED',
    targetEntity: 'systemSettings',
    targetId: 'global-config',
    details: `System settings updated by ${req.user.name}. System Name: "${db.systemSettings.systemName}", Maintenance Mode: ${db.systemSettings.maintenanceMode ? 'ON' : 'OFF'}, Session Timeout: ${db.systemSettings.sessionTimeoutMinutes}m.`
  });

  res.json({
    message: 'System settings updated successfully',
    settings: db.systemSettings
  });
});

// 8. Notifications API
app.get('/api/notifications', authenticateToken, (req, res) => {
  const userNotifs = db.notifications.filter(n => n.userId === req.user.id);
  res.json(userNotifs);
});

app.patch('/api/notifications/:id/read', authenticateToken, (req, res) => {
  const notif = db.notifications.find(n => n.id === req.params.id && n.userId === req.user.id);
  if (notif) {
    notif.isRead = true;
    saveDb();
  }
  res.json({ success: true });
});

app.post('/api/notifications/mark-all-read', authenticateToken, (req, res) => {
  (db.notifications || []).forEach(n => {
    if (n.userId === req.user.id) n.isRead = true;
  });
  saveDb();
  res.json({ success: true });
});

// Fallback route to safely serve index.html for client-side routing
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    const indexPath = path.resolve(__dirname, 'public', 'index.html');
    return res.sendFile(indexPath, (err) => {
      if (err) {
        if (!res.headersSent) res.status(404).end();
      }
    });
  }
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` VitaCall Server running at http://localhost:${PORT}`);
    console.log(` USTP Villanueva Campus - Health Request & Monitoring`);
    console.log(`=======================================================`);
  });
}

app.encryptField = encryptField;
app.decryptField = decryptField;
module.exports = app;
