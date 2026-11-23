const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'vitacall-db.json');
const SECRETS_FILE = path.join(DATA_DIR, '.secrets.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

const HEX_64_REGEX = /^[0-9a-fA-F]{64}$/;

function loadOrCreateSecrets() {
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    const jwtSecret = process.env.VITACALL_JWT_SECRET || process.env.JWT_SECRET || '';
    const encHex = process.env.VITACALL_ENCRYPTION_KEY || '';
    const hmacHex = process.env.VITACALL_HMAC_KEY || '';

    if (!HEX_64_REGEX.test(jwtSecret) || !HEX_64_REGEX.test(encHex) || !HEX_64_REGEX.test(hmacHex)) {
      throw new Error(
        'FATAL: In production (NODE_ENV=production), VITACALL_JWT_SECRET, VITACALL_ENCRYPTION_KEY, and VITACALL_HMAC_KEY must all be provided and be exactly 64 hex characters (32 bytes).'
      );
    }

    return {
      jwtSecret,
      encryptionKey: Buffer.from(encHex, 'hex'),
      hmacKey: Buffer.from(hmacHex, 'hex')
    };
  }

  let fileSecrets = {};
  try {
    if (fs.existsSync(SECRETS_FILE)) {
      fileSecrets = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8')) || {};
    }
  } catch (_) {}

  const rawJwt = process.env.VITACALL_JWT_SECRET || process.env.JWT_SECRET || fileSecrets.jwtSecret;
  const rawEnc = process.env.VITACALL_ENCRYPTION_KEY || fileSecrets.encryptionKey;
  const rawHmac = process.env.VITACALL_HMAC_KEY || fileSecrets.hmacKey;

  if (rawJwt && !HEX_64_REGEX.test(rawJwt)) {
    throw new Error('VITACALL_JWT_SECRET must be exactly 64 hex characters.');
  }
  if (rawEnc && !HEX_64_REGEX.test(rawEnc)) {
    throw new Error('VITACALL_ENCRYPTION_KEY must be exactly 64 hex characters.');
  }
  if (rawHmac && !HEX_64_REGEX.test(rawHmac)) {
    throw new Error('VITACALL_HMAC_KEY must be exactly 64 hex characters.');
  }

  const jwtSecret = rawJwt || crypto.randomBytes(32).toString('hex');
  const encHex = rawEnc || crypto.randomBytes(32).toString('hex');
  const hmacHex = rawHmac || crypto.randomBytes(32).toString('hex');

  const encryptionKey = Buffer.from(encHex, 'hex');
  const hmacKey = Buffer.from(hmacHex, 'hex');

  // Persist generated dev secrets to gitignored data/.secrets.json if env vars aren't set
  if (!process.env.VITACALL_JWT_SECRET && !process.env.VITACALL_ENCRYPTION_KEY && !process.env.VITACALL_HMAC_KEY) {
    try {
      fs.writeFileSync(SECRETS_FILE, JSON.stringify({
        jwtSecret,
        encryptionKey: encHex,
        hmacKey: hmacHex,
        algorithm: 'aes-256-gcm',
        rotatedAt: new Date().toISOString()
      }, null, 2), 'utf8');
    } catch (_) {}
  }

  return { jwtSecret, encryptionKey, hmacKey };
}

const SECRETS = loadOrCreateSecrets();

module.exports = {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PROD: process.env.NODE_ENV === 'production',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '',
  DATA_DIR,
  DB_FILE,
  SECRETS_FILE,
  BACKUPS_DIR,
  JWT_SECRET: SECRETS.jwtSecret,
  ENCRYPTION_KEY: SECRETS.encryptionKey,
  HMAC_KEY: SECRETS.hmacKey,
  TOKEN_TTL: '2h',
  COOKIE_NAME: 'vitacall_token',
  SERVER_START_TIME: Date.now(),
  loadOrCreateSecrets,
  HEX_64_REGEX
};

