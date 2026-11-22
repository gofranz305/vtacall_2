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

function loadOrCreateSecrets() {
  let fileSecrets = {};
  try {
    if (fs.existsSync(SECRETS_FILE)) {
      fileSecrets = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8')) || {};
    }
  } catch (_) {}

  const jwtSecret = process.env.VITACALL_JWT_SECRET || process.env.JWT_SECRET || fileSecrets.jwtSecret || crypto.randomBytes(48).toString('hex');
  const encHex = process.env.VITACALL_ENCRYPTION_KEY || fileSecrets.encryptionKey || crypto.randomBytes(32).toString('hex');
  const hmacHex = process.env.VITACALL_HMAC_KEY || fileSecrets.hmacKey || crypto.randomBytes(32).toString('hex');

  const encryptionKey = Buffer.from(encHex.slice(0, 64).padEnd(64, '0'), 'hex');
  const hmacKey = Buffer.from(hmacHex.slice(0, 64).padEnd(64, '0'), 'hex');

  // Persist generated dev secrets to gitignored data/.secrets.json if env vars aren't set
  if (!process.env.VITACALL_JWT_SECRET && !process.env.VITACALL_ENCRYPTION_KEY) {
    try {
      fs.writeFileSync(SECRETS_FILE, JSON.stringify({
        jwtSecret,
        encryptionKey: encryptionKey.toString('hex'),
        hmacKey: hmacKey.toString('hex'),
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
  SERVER_START_TIME: Date.now()
};

