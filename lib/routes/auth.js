const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, TOKEN_TTL, IS_PROD } = require('../config');
const { validatePasswordComplexity, generateId } = require('../crypto');
const {
  getDb,
  saveDb,
  sanitizeUser,
  getDefaultPermissions,
  getDefaultUserSettings,
  getDefaultSystemSettings,
  logAudit,
  logSecurityEvent,
  createNotification,
  revokeToken,
  touchSessionActivity
} = require('../db');
const { authenticateToken, extractToken, setAuthCookie, clearAuthCookie, ensureCsrfCookie } = require('../middleware');

module.exports = function createAuthRouter({ authLimiter }) {
  const router = express.Router();

  router.get('/api/auth/csrf-token', (req, res) => {
    const csrfToken = ensureCsrfCookie(req, res);
    res.json({ csrfToken });
  });

  // Public Landing Page & System Metadata
  router.get('/api/public/landing-info', (req, res) => {
    const db = getDb();
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
        certificatesIssued: db.certificates.filter(c => c.status !== 'draft').length,
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
  router.get('/api/announcements', (req, res) => {
    const db = getDb();
    const token = extractToken(req);
    let userRole = 'public';
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const found = db.users.find(u => u.id === decoded.id);
        if (found) userRole = found.role;
      } catch (_) { }
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

  // 1. Auth: Login
  router.post('/api/auth/login', authLimiter, (req, res) => {
    const db = getDb();
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = String(email).toLowerCase().trim();
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

    if (db.systemSettings && db.systemSettings.maintenanceMode && user.role !== 'admin') {
      return res.status(503).json({
        error: db.systemSettings.maintenanceMessage || 'System is currently under maintenance. Only Administrators can sign in right now.'
      });
    }

    const validPassword = bcrypt.compareSync(String(password), user.passwordHash);
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

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date().toISOString();
    user.lastLoginIp = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';

    const jti = crypto.randomUUID();
    touchSessionActivity(jti);
    saveDb();

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, jti },
      JWT_SECRET,
      { expiresIn: TOKEN_TTL }
    );

    setAuthCookie(res, token);

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

    res.json({
      token,
      user: sanitizeUser(user),
      mustChangePassword: Boolean(user.mustChangePassword),
      systemSettings: db.systemSettings
    });
  });

  // Auth: Register (Students / Citizens)
  router.post('/api/auth/register', authLimiter, (req, res) => {
    const db = getDb();
    if (db.systemSettings && db.systemSettings.allowRegistration === false) {
      return res.status(403).json({ error: 'Public student self-registration is currently disabled by the Administrator.' });
    }

    const { name, email, password, studentId, courseAndYear, boardingHouse, address, landmark, phone, emergencyContact } = req.body;

    if (!name || !email || !password || !boardingHouse || !address || !phone) {
      return res.status(400).json({ error: 'Please fill in all required fields' });
    }

    const pwdError = validatePasswordComplexity(password);
    if (pwdError) {
      return res.status(400).json({ error: pwdError });
    }

    const cleanEmail = String(email).trim().toLowerCase();
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
      id: generateId('USR'),
      name: String(name).trim(),
      email: cleanEmail,
      passwordHash,
      role: 'requester',
      status: requireApproval ? 'pending' : 'active',
      mustChangePassword: false,
      studentId: studentId ? String(studentId).trim() : 'N/A',
      courseAndYear: courseAndYear ? String(courseAndYear).trim() : 'N/A',
      boardingHouse: String(boardingHouse).trim(),
      address: String(address).trim(),
      landmark: landmark ? String(landmark).trim() : '',
      phone: String(phone).trim(),
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

    const jti = crypto.randomUUID();
    touchSessionActivity(jti);
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role, jti },
      JWT_SECRET,
      { expiresIn: TOKEN_TTL }
    );
    setAuthCookie(res, token);

    res.status(201).json({ token, user: sanitizeUser(newUser), systemSettings: db.systemSettings });
  });

  // Auth: Current User
  router.get('/api/auth/me', authenticateToken, (req, res) => {
    res.json(sanitizeUser(req.user));
  });

  // Auth: Forced or Voluntary Password Change
  router.post('/api/auth/change-password', authenticateToken, (req, res) => {
    const db = getDb();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !bcrypt.compareSync(String(currentPassword), user.passwordHash)) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const pwdError = validatePasswordComplexity(newPassword);
    if (pwdError) {
      return res.status(400).json({ error: pwdError });
    }

    const salt = bcrypt.genSaltSync(10);
    user.passwordHash = bcrypt.hashSync(String(newPassword), salt);
    user.mustChangePassword = false;
    saveDb();

    logAudit(req, {
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'PASSWORD_CHANGED',
      targetEntity: 'user',
      targetId: user.id,
      details: `User ${user.name} updated their account password.`
    });

    res.json({ message: 'Password updated successfully.', user: sanitizeUser(user) });
  });

  // Auth: Logout (revokes JWT + clears HttpOnly cookie)
  router.post('/api/auth/logout', authenticateToken, (req, res) => {
    const reason = (req.body && req.body.reason) === 'timeout'
      ? 'Session automatically expired due to user inactivity.'
      : 'User logged out successfully from web application.';

    if (req.tokenDecoded && req.tokenDecoded.jti) {
      revokeToken(
        req.tokenDecoded.jti,
        req.tokenDecoded.exp ? req.tokenDecoded.exp * 1000 : undefined
      );
    }
    clearAuthCookie(res);

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

  // Fixed demo hints ONLY in non-production (never reads db.users)
  router.get('/api/auth/demo-accounts', (req, res) => {
    if (IS_PROD) {
      return res.status(404).json({ error: 'Endpoint not available in production' });
    }
    res.json([
      { email: 'harvey.pagtalunan@ustp.edu.ph', role: 'requester', label: 'Student Demo' },
      { email: 'nurse.sarah@ustp.edu.ph', role: 'personnel', label: 'Campus Nurse Demo' },
      { email: 'dr.santos@ustp.edu.ph', role: 'doctor', label: 'Campus Doctor Demo' },
      { email: 'admin.clinic@ustp.edu.ph', role: 'admin', label: 'Admin Demo' }
    ]);
  });

  // Update Profile
  router.put('/api/users/profile', authenticateToken, (req, res) => {
    const db = getDb();
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
      profilePicture,
      doctorSignature
    } = req.body;

    if (newPassword && String(newPassword).trim()) {
      const pwdError = validatePasswordComplexity(String(newPassword).trim());
      if (pwdError) {
        return res.status(400).json({ error: pwdError });
      }
      const salt = bcrypt.genSaltSync(10);
      user.passwordHash = bcrypt.hashSync(String(newPassword).trim(), salt);
      user.mustChangePassword = false;
    }

    if (name && String(name).trim()) user.name = String(name).trim();
    if (phone !== undefined) user.phone = String(phone).trim();
    if (boardingHouse !== undefined) user.boardingHouse = String(boardingHouse).trim();
    if (address !== undefined) user.address = String(address).trim();
    if (landmark !== undefined) user.landmark = String(landmark).trim();
    if (studentId !== undefined) user.studentId = String(studentId).trim();
    if (courseAndYear !== undefined) user.courseAndYear = String(courseAndYear).trim();
    if (emergencyContact && typeof emergencyContact === 'object') {
      user.emergencyContact = {
        name: emergencyContact.name ? String(emergencyContact.name).trim() : (user.emergencyContact?.name || 'Guardian'),
        phone: emergencyContact.phone ? String(emergencyContact.phone).trim() : (user.emergencyContact?.phone || '')
      };
    }
    if (title !== undefined) user.title = String(title).trim();
    if (licenseNumber !== undefined) user.licenseNumber = String(licenseNumber).trim();

    if (profilePicture !== undefined) {
      user.profilePicture = profilePicture || '';
    }

    if (doctorSignature !== undefined && user.role === 'doctor') {
      user.doctorSignature = doctorSignature;
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
      details: `Profile updated by ${user.name}.`
    });

    res.json({ message: 'Profile updated successfully', user: sanitizeUser(user) });
  });

  // Dashboard Settings
  router.get('/api/users/settings', authenticateToken, (req, res) => {
    const db = getDb();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      settings: user.settings || getDefaultUserSettings(user.role),
      permissions: user.permissions || getDefaultPermissions(user.role)
    });
  });

  router.put('/api/users/settings', authenticateToken, (req, res) => {
    const db = getDb();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { settings = {}, currentPassword, newPassword } = req.body;

    if (!user.settings || typeof user.settings !== 'object') {
      user.settings = getDefaultUserSettings(user.role);
    }

    Object.keys(settings).forEach(key => {
      user.settings[key] = settings[key];
    });

    if (newPassword && String(newPassword).trim()) {
      const pwdError = validatePasswordComplexity(String(newPassword).trim());
      if (pwdError) {
        return res.status(400).json({ error: pwdError });
      }
      if (currentPassword && !bcrypt.compareSync(String(currentPassword), user.passwordHash)) {
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
      const salt = bcrypt.genSaltSync(10);
      user.passwordHash = bcrypt.hashSync(String(newPassword).trim(), salt);
      user.mustChangePassword = false;
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

    res.json({ message: 'Dashboard settings saved successfully', user: sanitizeUser(user) });
  });

  return router;
};

