const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { PORT, NODE_ENV, CORS_ORIGIN } = require('./lib/config');
const { encryptField, decryptField, generateHmac } = require('./lib/crypto');
const logger = require('./lib/logger');
const { createScheduledDiskBackup } = require('./lib/db');
const createAuthRouter = require('./lib/routes/auth');
const createClinicalRouter = require('./lib/routes/clinical');
const createAdminRouter = require('./lib/routes/admin');

const app = express();

// Security Headers via Helmet + CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://unpkg.com', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://api.qrserver.com'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Restricted CORS (allows same-origin, localhost, or configured CORS_ORIGIN)
const allowedOrigins = CORS_ORIGIN
  ? CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean)
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true
}));

// Reduced body size limit (2 MB)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Rate Limiters
const isTestEnv = NODE_ENV === 'test' || process.argv.some(a => a.includes('test'));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTestEnv ? 5000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTestEnv ? 5000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please wait 15 minutes before trying again.' }
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTestEnv ? 5000 : 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many certificate verification queries. Please slow down.' }
});

app.use('/api/', apiLimiter);

// Static Frontend
app.use(express.static(path.join(__dirname, 'public')));

// Modular API Routers
app.use(createAuthRouter({ authLimiter }));
app.use(createClinicalRouter({ verifyLimiter }));
app.use(createAdminRouter());

// Fallback route to safely serve index.html for client-side routing
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    const indexPath = path.resolve(__dirname, 'public', 'index.html');
    return res.sendFile(indexPath, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  }
  res.status(404).json({ error: 'Endpoint not found' });
});

// Centralized Error Handler
app.use((err, req, res, next) => {
  logger.error('UNHANDLED_SERVER_ERROR', {
    method: req.method,
    path: req.originalUrl,
    error: err.message
  });
  if (!res.headersSent) {
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
});

// Scheduled Automatic Backups (every 6 hours, unref'd so test runner exits cleanly)
const backupInterval = setInterval(() => {
  createScheduledDiskBackup();
}, 6 * 60 * 60 * 1000);
if (backupInterval.unref) backupInterval.unref();

// Start Server (binds to 0.0.0.0 so phones on the same Wi-Fi/hotspot can connect)
if (require.main === module) {
  const os = require('os');
  app.listen(PORT, '0.0.0.0', () => {
    const nets = os.networkInterfaces();
    const lanUrls = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          lanUrls.push(`http://${net.address}:${PORT}`);
        }
      }
    }
    logger.info('SERVER_STARTED', { port: PORT, env: NODE_ENV, lanUrls });
    console.log(`=======================================================`);
    console.log(` VitaCall Server running!`);
    console.log(` • Local PC:       http://localhost:${PORT}`);
    lanUrls.forEach(url => console.log(` • Phone / Wi-Fi:  ${url}`));
    console.log(` USTP Villanueva Campus - Health Request & Monitoring`);
    console.log(`=======================================================`);
  });
}

app.encryptField = encryptField;
app.decryptField = decryptField;
app.generateHmac = generateHmac;
module.exports = app;
