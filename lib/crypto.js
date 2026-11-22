const crypto = require('crypto');
const { ENCRYPTION_KEY, HMAC_KEY } = require('./config');

// Sensitive medical & PII fields encrypted at rest with AES-256-GCM
const SENSITIVE_FIELDS = [
  'diagnosis',
  'prescribedMedication',
  'prescriptionAndCare',
  'nurseNotes',
  'symptomsObserved',
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
  generateCertificateCode,
  generateId,
  validatePasswordComplexity
};

