const crypto = require('crypto');
const { ENCRYPTION_KEY, HMAC_KEY } = require('./config');

// Sensitive medical & PII fields encrypted at rest with AES-256-GCM
const SENSITIVE_FIELDS = [
  'diagnosis',
  'prescribedMedication',
  'prescriptionAndCare',
  'recommendations',
  'careRecommendations',
  'nurseNotes',
  'symptomsObserved',
  'returnNote',
  'doctorSignature',
  'name',
  'studentName',
  'patientName',
  'studentId',
  'boardingHouse',
  'address',
  'landmark',
  'phone'
];

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
    return str;
  }
}

function transformSensitiveFields(obj, fn) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => transformSensitiveFields(item, fn));
  }
  const copy = { ...obj };
  for (const key of Object.keys(copy)) {
    if (SENSITIVE_FIELDS.includes(key) && typeof copy[key] === 'string' && copy[key].length > 0) {
      copy[key] = fn(copy[key]);
    } else if (key === 'checkupRevisions' && Array.isArray(copy[key])) {
      copy[key] = copy[key].map(rev => transformSensitiveFields(rev, fn));
    } else if (key === 'emergencyContact' && copy[key] && typeof copy[key] === 'object') {
      copy[key] = {
        ...copy[key],
        name: typeof copy[key].name === 'string' && copy[key].name ? fn(copy[key].name) : copy[key].name,
        phone: typeof copy[key].phone === 'string' && copy[key].phone ? fn(copy[key].phone) : copy[key].phone
      };
    }
  }
  return copy;
}

// Keyed HMAC-SHA256 for tamper-evident certificates and audit chains
function generateHmac(data) {
  return crypto.createHmac('sha256', HMAC_KEY).update(JSON.stringify(data)).digest('hex');
}

// Whole-file AES-256-GCM encryption for standalone backup files
function encryptWholePayload(payloadObj) {
  const plaintext = JSON.stringify(payloadObj);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  const fileContent = `VCBKP:v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
  const sha256 = crypto.createHash('sha256').update(fileContent, 'utf8').digest('hex');
  const size = Buffer.byteLength(fileContent, 'utf8');
  return { fileContent, sha256, size };
}

function decryptWholePayload(fileContent, expectedSha256) {
  if (typeof fileContent !== 'string' || !fileContent.startsWith('VCBKP:v1:')) {
    throw new Error('Backup integrity check failed: unrecognized encrypted backup format.');
  }
  const actualSha256 = crypto.createHash('sha256').update(fileContent, 'utf8').digest('hex');
  if (expectedSha256 && actualSha256 !== expectedSha256) {
    throw new Error('Backup integrity check failed: SHA-256 mismatch (backup file was modified or tampered).');
  }
  const parts = fileContent.split(':');
  if (parts.length < 5) {
    throw new Error('Backup integrity check failed: malformed encrypted backup header.');
  }
  try {
    const iv = Buffer.from(parts[2], 'hex');
    const authTag = Buffer.from(parts[3], 'hex');
    const cipherHex = parts.slice(4).join(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (err) {
    throw new Error('Backup integrity check failed: AES-256-GCM authentication tag verification failed (file tampered).');
  }
}

// Redact emails and phone numbers from log/audit strings
function redactForLog(input) {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    return input
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED-EMAIL]')
      .replace(/(?:\+63|0)\s*9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, '[REDACTED-PHONE]');
  }
  if (Array.isArray(input)) {
    return input.map(item => redactForLog(item));
  }
  if (typeof input === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
      out[k] = redactForLog(v);
    }
    return out;
  }
  return input;
}

// Cryptographically random, non-guessable certificate verification code
function generateCertificateCode() {
  return `USTP-VC-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

// Strong UUID-based IDs (no Date.now() + Math.random() collisions)
function generateId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 12).toUpperCase()}`;
}

// Password complexity validator: >= 8 chars, upper, lower, digit, special char
function validatePasswordComplexity(password) {
  const str = String(password || '');
  if (str.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Z]/.test(str)) {
    return 'Password must contain at least one uppercase letter.';
  }
  if (!/[a-z]/.test(str)) {
    return 'Password must contain at least one lowercase letter.';
  }
  if (!/[0-9]/.test(str)) {
    return 'Password must contain at least one number.';
  }
  if (!/[^A-Za-z0-9]/.test(str)) {
    return 'Password must contain at least one special character (e.g. !@#$%^&*).';
  }
  return null;
}

module.exports = {
  SENSITIVE_FIELDS,
  encryptField,
  decryptField,
  transformSensitiveFields,
  generateHmac,
  encryptWholePayload,
  decryptWholePayload,
  redactForLog,
  generateCertificateCode,
  generateId,
  validatePasswordComplexity
};

