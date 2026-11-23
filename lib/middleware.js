const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, COOKIE_NAME, IS_PROD } = require('./config');
const {
  getDb,
  isTokenRevoked,
  isSessionTimedOut,
  touchSessionActivity,
  revokeToken,
  logAudit,
  logSecurityEvent
} = require('./db');

function parseCookies(req) {
  const list = {};
  const rc = req.headers && req.headers.cookie;
  if (!rc) return list;
  rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const key = parts.shift().trim();
    const val = decodeURIComponent(parts.join('='));
    list[key] = val;
  });
  return list;
}

// Extract token ONLY from HttpOnly Cookie or Authorization: Bearer header (NEVER URL ?token=)
function extractToken(req) {
  const authHeader = req.headers && req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req);
  if (cookies[COOKIE_NAME]) {
    return cookies[COOKIE_NAME];
  }
  return null;
}

function authenticateToken(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid or expired session token' });
    }

    if (decoded.jti && isTokenRevoked(decoded.jti)) {
      return res.status(401).json({ error: 'Session token has been revoked. Please sign in again.' });
    }

    if (decoded.jti && isSessionTimedOut(decoded.jti)) {
      revokeToken(decoded.jti, decoded.exp ? decoded.exp * 1000 : undefined);
      return res.status(401).json({ error: 'Session expired due to inactivity. Please sign in again.' });
    }

    const db = getDb();
    const user = db.users.find(u => u.id === decoded.id);
    if (!user) return res.status(403).json({ error: 'User no longer exists' });
    if (user.status === 'inactive') {
      return res.status(403).json({ error: 'Account has been deactivated by an administrator' });
    }

    if (decoded.jti) {
      touchSessionActivity(decoded.jti);
    }

    req.user = user;
    req.tokenDecoded = decoded;
    next();
  });
}

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

const CSRF_COOKIE_NAME = 'vitacall_csrf';

function ensureCsrfCookie(req, res) {
  const cookies = req ? parseCookies(req) : {};
  let token = cookies[CSRF_COOKIE_NAME];
  if (!token) {
    token = crypto.randomBytes(24).toString('hex');
  }
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: 2 * 60 * 60 * 1000,
    path: '/'
  });
  return token;
}

function csrfProtection(req, res, next) {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }
  const cookies = parseCookies(req);
  const authCookie = cookies[COOKIE_NAME];
  const authHeader = req.headers && req.headers['authorization'];
  // Enforce CSRF check whenever cookie-based auth is active (no Bearer header override)
  if (!authCookie || (authHeader && authHeader.startsWith('Bearer '))) {
    return next();
  }
  const csrfCookie = cookies[CSRF_COOKIE_NAME];
  const csrfHeader = req.headers['x-csrf-token'];
  if (!csrfCookie || !csrfHeader || typeof csrfHeader !== 'string') {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  const a = Buffer.from(csrfCookie, 'utf8');
  const b = Buffer.from(csrfHeader, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  next();
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: 2 * 60 * 60 * 1000,
    path: '/'
  });
  ensureCsrfCookie(null, res);
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

module.exports = {
  extractToken,
  authenticateToken,
  requireRole,
  setAuthCookie,
  clearAuthCookie,
  ensureCsrfCookie,
  csrfProtection,
  CSRF_COOKIE_NAME
};

