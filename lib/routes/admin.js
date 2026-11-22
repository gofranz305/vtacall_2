const express = require('express');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { DB_FILE, SERVER_START_TIME } = require('../config');
const { validatePasswordComplexity, generateId } = require('../crypto');
const {
  getDb,
  setDb,
  saveDb,
  ensureDbSchema,
  sanitizeUser,
  getDefaultPermissions,
  getDefaultUserSettings,
  getDefaultSystemSettings,
  logAudit,
  verifyAuditChain,
  logSecurityEvent,
  createNotification
} = require('../db');
const { authenticateToken, requireRole } = require('../middleware');

function verifyAdminPassword(req, res) {
  const { confirmPassword } = req.body || {};
  if (!confirmPassword || !bcrypt.compareSync(String(confirmPassword), req.user.passwordHash)) {
    logSecurityEvent(req, {
      type: 'FAILED_PRIVILEGED_REAUTH',
      severity: 'high',
      email: req.user.email,
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      details: `Destructive administrative operation ${req.method} ${req.originalUrl} rejected: invalid password re-entry.`,
      resolved: false
    });
    res.status(403).json({ error: 'Administrator password re-entry is required and must match your current password.' });
    return false;
  }
  return true;
}

module.exports = function createAdminRouter() {
  const router = express.Router();

  // Audit Logs & Chain Verification
  router.get('/api/admin/audit-logs', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
    let logs = [...(db.auditLogs || [])];
    const { search, role, action, entity, startDate, endDate } = req.query;

    if (search) {
      const q = String(search).toLowerCase();
      logs = logs.filter(l =>
        (l.userName && l.userName.toLowerCase().includes(q)) ||
        (l.action && l.action.toLowerCase().includes(q)) ||
        (l.details && l.details.toLowerCase().includes(q)) ||
        (l.targetId && l.targetId.toLowerCase().includes(q)) ||
        (l.targetEntity && l.targetEntity.toLowerCase().includes(q))
      );
    }
    if (role && role !== 'all') logs = logs.filter(l => l.userRole === role);
    if (action && action !== 'all') logs = logs.filter(l => l.action === action);
    if (entity && entity !== 'all') logs = logs.filter(l => l.targetEntity === entity);
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

  router.get('/api/admin/audit-logs/verify', authenticateToken, requireRole('admin'), (req, res) => {
    const result = verifyAuditChain();
    logAudit(req, {
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'AUDIT_CHAIN_VERIFIED',
      targetEntity: 'auditLogs',
      targetId: 'HMAC-CHAIN',
      details: `Audit HMAC chain verified: ${result.valid ? 'VALID' : 'TAMPERING DETECTED'} (${result.totalChecked} entries checked).`
    });
    res.json(result);
  });

  router.delete('/api/admin/audit-logs/:id', authenticateToken, requireRole('admin'), (req, res) => {
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

  // Analytics & Statistics
  router.get('/api/admin/stats', authenticateToken, requireRole('admin', 'doctor', 'personnel'), (req, res) => {
    const db = getDb();
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
    const totalAdmins = db.users.filter(u => u.role === 'admin').length;

    const activeAccounts = db.users.filter(u => (u.status || 'active') === 'active').length;
    const inactiveAccounts = db.users.filter(u => u.status === 'inactive').length;
    const pendingAccounts = db.users.filter(u => u.status === 'pending').length;
    const lockedAccounts = db.users.filter(u => u.lockedUntil && new Date(u.lockedUntil) > new Date()).length;

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

    const boardingHouseCounts = {};
    db.requests.forEach(r => {
      const bh = r.boardingHouse ? r.boardingHouse.split('(')[0].trim() : 'Unknown';
      boardingHouseCounts[bh] = (boardingHouseCounts[bh] || 0) + 1;
    });

    const symptomCounts = {};
    db.requests.forEach(r => {
      (r.symptoms || []).forEach(s => {
        symptomCounts[s] = (symptomCounts[s] || 0) + 1;
      });
    });

    const loginLogs = (db.auditLogs || []).filter(l => l.action === 'USER_LOGIN');
    const failedLoginLogs = (db.auditLogs || []).filter(l => l.action === 'LOGIN_FAILED');
    const failedSecEvents = (db.securityEvents || []).filter(e => e.type === 'LOGIN_FAILED');
    const loginsByRole = {
      requester: loginLogs.filter(l => l.userRole === 'requester').length,
      personnel: loginLogs.filter(l => l.userRole === 'personnel').length,
      doctor: loginLogs.filter(l => l.userRole === 'doctor').length,
      admin: loginLogs.filter(l => l.userRole === 'admin').length
    };

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

  // User Management
  router.get('/api/admin/users', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
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

  router.post('/api/admin/users', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
    const {
      name, email, password, role = 'requester', status = 'active', phone = '',
      studentId = '', courseAndYear = '', boardingHouse = '', address = '',
      landmark = '', emergencyContact = { name: '', phone: '' },
      title = '', licenseNumber = '', permissions
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    const pwdError = validatePasswordComplexity(password);
    if (pwdError) return res.status(400).json({ error: pwdError });

    const validRoles = ['requester', 'personnel', 'doctor', 'admin'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid user role.' });

    const cleanEmail = String(email).trim().toLowerCase();
    if (db.users.some(u => u.email.toLowerCase() === cleanEmail)) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const newUser = {
      id: generateId('USR'),
      name: String(name).trim(),
      email: cleanEmail,
      passwordHash,
      role,
      status: ['active', 'inactive', 'pending'].includes(status) ? status : 'active',
      mustChangePassword: true,
      phone: String(phone).trim(),
      studentId: role === 'requester' ? (String(studentId).trim() || '2026-30000') : undefined,
      courseAndYear: role === 'requester' ? (String(courseAndYear).trim() || 'BS Information Technology') : undefined,
      boardingHouse: role === 'requester' ? (String(boardingHouse).trim() || 'Villanueva Boarding House') : undefined,
      address: role === 'requester' ? (String(address).trim() || 'Villanueva, Misamis Oriental') : undefined,
      landmark: role === 'requester' ? String(landmark).trim() : undefined,
      emergencyContact: role === 'requester' ? emergencyContact : undefined,
      title: role !== 'requester' ? (String(title).trim() || (role === 'admin' ? 'System Administrator' : 'Campus Health Personnel')) : undefined,
      licenseNumber: role !== 'requester' ? (String(licenseNumber).trim() || 'PRC Verified') : undefined,
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
      details: `Administrator created ${role.toUpperCase()} account for ${newUser.name}.`
    });

    createNotification(
      newUser.id,
      'Welcome to VitaCall USTP Villanueva',
      `Your account has been provisioned by ${req.user.name}. Please change your password on first login.`,
      'info',
      null,
      'dashboard'
    );

    res.status(201).json({ message: 'User account created successfully', user: sanitizeUser(newUser) });
  });

  router.put('/api/admin/users/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
    const targetUser = db.users.find(u => u.id === req.params.id);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const {
      name, email, role, status, phone, studentId, courseAndYear,
      boardingHouse, address, landmark, emergencyContact, title, licenseNumber, permissions
    } = req.body;

    const previousRole = targetUser.role;
    const previousStatus = targetUser.status || 'active';

    if (email && String(email).trim().toLowerCase() !== targetUser.email.toLowerCase()) {
      const cleanEmail = String(email).trim().toLowerCase();
      if (db.users.some(u => u.id !== targetUser.id && u.email.toLowerCase() === cleanEmail)) {
        return res.status(400).json({ error: 'Email address is already in use by another account.' });
      }
      targetUser.email = cleanEmail;
    }

    if (name && String(name).trim()) targetUser.name = String(name).trim();
    if (phone !== undefined) targetUser.phone = String(phone).trim();

    if (role && ['requester', 'personnel', 'doctor', 'admin'].includes(role)) {
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

    if (studentId !== undefined) targetUser.studentId = String(studentId).trim();
    if (courseAndYear !== undefined) targetUser.courseAndYear = String(courseAndYear).trim();
    if (boardingHouse !== undefined) targetUser.boardingHouse = String(boardingHouse).trim();
    if (address !== undefined) targetUser.address = String(address).trim();
    if (landmark !== undefined) targetUser.landmark = String(landmark).trim();
    if (emergencyContact && typeof emergencyContact === 'object') {
      targetUser.emergencyContact = {
        name: String(emergencyContact.name || '').trim(),
        phone: String(emergencyContact.phone || '').trim()
      };
    }
    if (title !== undefined) targetUser.title = String(title).trim();
    if (licenseNumber !== undefined) targetUser.licenseNumber = String(licenseNumber).trim();

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
      details: `Updated user ${targetUser.name}. Role: ${previousRole} -> ${targetUser.role}, Status: ${previousStatus} -> ${targetUser.status}.`
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

  router.patch('/api/admin/users/:id/status', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
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
      details: `Account status for ${targetUser.name} changed from ${prevStatus.toUpperCase()} to ${status.toUpperCase()}.`
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

  router.patch('/api/admin/users/:id/permissions', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
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

    logAudit(req, {
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'PERMISSIONS_UPDATED',
      targetEntity: 'user',
      targetId: targetUser.id,
      details: `Permissions updated for ${targetUser.name} (${targetUser.role}).`
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

  router.post('/api/admin/users/:id/reset-password', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
    const targetUser = db.users.find(u => u.id === req.params.id);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const { newPassword } = req.body;
    const pwdError = validatePasswordComplexity(newPassword);
    if (pwdError) return res.status(400).json({ error: pwdError });

    const salt = bcrypt.genSaltSync(10);
    targetUser.passwordHash = bcrypt.hashSync(String(newPassword).trim(), salt);
    targetUser.mustChangePassword = true;
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
      details: `Password securely reset (bcrypt-hashed) for ${targetUser.name} by Administrator.`
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
      `Your account password was reset by Administrator ${req.user.name}. You will be asked to change it on your next login.`,
      'warning',
      null,
      'profile'
    );

    res.json({ message: `Password securely reset for ${targetUser.name}` });
  });

  router.delete('/api/admin/users/:id', authenticateToken, requireRole('admin'), (req, res) => {
    if (!verifyAdminPassword(req, res)) return;
    const db = getDb();
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

  // Reports
  router.get('/api/admin/reports', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
    const { category = 'summary', period = 'all', startDate, endDate, log } = req.query;

    let minDate = null;
    let maxDate = new Date();
    maxDate.setHours(23, 59, 59, 999);

    if (period === 'daily') minDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    else if (period === 'weekly') minDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    else if (period === 'monthly') minDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    else if (period === 'custom') {
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
      .filter(u => u.role === 'personnel' || u.role === 'doctor' || u.role === 'admin')
      .map(p => {
        const assigned = filteredRequests.filter(r => r.assignedTo && r.assignedTo.id === p.id);
        const completed = assigned.filter(r => r.status === 'completed');
        const exams = filteredClinical.filter(c => c.examinerId === p.id || c.examinerName === p.name);
        const certs = filteredCertificates.filter(c => c.issuerName === p.name || c.approverName === p.name);
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
        targetId: `${String(category).toUpperCase()}-${String(period).toUpperCase()}`,
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
        certificatesInPeriod: filteredCertificates.filter(c => c.status !== 'draft').length,
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

  // Security Management
  router.get('/api/admin/security', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
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
      loginAttempts: events.filter(e => ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'ACCOUNT_LOCKED'].includes(e.type)),
      suspiciousActivities: events.filter(e =>
        ['LOGIN_FAILED', 'ACCOUNT_LOCKED', 'SUSPICIOUS_ACTIVITY', 'UNAUTHORIZED_ACCESS', 'UNAUTHORIZED_CLINICAL_ACTION', 'FAILED_PRIVILEGED_REAUTH'].includes(e.type)
      ),
      lockedUsers
    });
  });

  router.post('/api/admin/security/events/:id/resolve', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
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

  router.post('/api/admin/security/unlock-user/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    if (user.status === 'inactive' && req.body.activate) user.status = 'active';
    saveDb();

    logAudit(req, {
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'ACCOUNT_UNLOCKED',
      targetEntity: 'user',
      targetId: user.id,
      details: `Reset failed login counter and unlocked account for ${user.name}.`
    });

    res.json({ message: `Unlocked account for ${user.name}`, user: sanitizeUser(user) });
  });

  // Data Management (Certificates are strictly read-only except revocation; Clinical Records cannot be altered by Admin)
  router.get('/api/admin/records', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
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

  router.post('/api/admin/records/:collection', authenticateToken, requireRole('admin'), (req, res) => {
    const { collection } = req.params;
    if (collection === 'certificates' || collection === 'clinicalRecords') {
      return res.status(403).json({
        error: `Administrators cannot directly create ${collection}. Clinical records and certificates must originate from Nurse/Doctor workflow.`
      });
    }
    if (collection !== 'requests') {
      return res.status(400).json({ error: 'Unsupported collection for direct creation' });
    }

    const db = getDb();
    const payload = req.body || {};
    const now = new Date().toISOString();
    const newReq = {
      id: payload.id || generateId('REQ'),
      userId: payload.userId || req.user.id,
      studentName: String(payload.studentName || 'Student Requester').trim(),
      studentId: String(payload.studentId || '2026-30001').trim(),
      courseAndYear: String(payload.courseAndYear || 'BS Information Technology').trim(),
      phone: String(payload.phone || '+63 917 000 0000').trim(),
      boardingHouse: String(payload.boardingHouse || 'Villanueva Boarding House').trim(),
      address: String(payload.address || 'Villanueva, Misamis Oriental').trim(),
      landmark: String(payload.landmark || '').trim(),
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
      completedAt: null,
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
      details: `Admin created health request record ${newReq.id}.`
    });
    res.status(201).json({ message: 'Request record created', record: newReq });
  });

  router.put('/api/admin/records/:collection/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const { collection, id } = req.params;
    if (collection === 'certificates') {
      logSecurityEvent(req, {
        type: 'UNAUTHORIZED_ACCESS',
        severity: 'high',
        email: req.user.email,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        details: `Blocked attempt by Admin ${req.user.name} to rewrite immutable certificate ${id}.`,
        resolved: false
      });
      return res.status(403).json({
        error: 'Medical certificates are read-only and cryptographically sealed. Administrators may only revoke a certificate via /api/admin/certificates/:id/revoke.'
      });
    }
    if (collection === 'clinicalRecords') {
      return res.status(403).json({
        error: 'Clinical records cannot be directly rewritten by an Administrator.'
      });
    }
    if (collection !== 'requests') {
      return res.status(400).json({ error: 'Invalid record collection' });
    }

    const db = getDb();
    const item = (db.requests || []).find(r => r.id === id);
    if (!item) return res.status(404).json({ error: 'Record not found' });

    const updates = req.body || {};
    ['studentName', 'studentId', 'boardingHouse', 'urgency', 'status', 'symptoms'].forEach(k => {
      if (updates[k] !== undefined) item[k] = updates[k];
    });
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

  router.delete('/api/admin/records/:collection/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const { collection, id } = req.params;
    if (collection === 'certificates' || collection === 'clinicalRecords') {
      return res.status(403).json({
        error: `Deleting ${collection} is prohibited for clinical & audit integrity. Use certificate revocation instead.`
      });
    }
    if (collection !== 'requests') {
      return res.status(400).json({ error: 'Invalid record collection' });
    }
    if (!verifyAdminPassword(req, res)) return;

    const db = getDb();
    const idx = db.requests.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Record not found' });

    const removed = db.requests.splice(idx, 1)[0];
    saveDb();

    logAudit(req, {
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'RECORD_DELETED',
      targetEntity: collection,
      targetId: id,
      details: `Administrator deleted record ${id} from ${collection} after password re-entry.`
    });

    res.json({ message: `Record ${id} deleted successfully`, deleted: removed });
  });

  // Backups & Restore (Restore requires password re-entry)
  router.get('/api/admin/backup', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
    logAudit(req, {
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'DATABASE_BACKUP_EXPORTED',
      targetEntity: 'system',
      targetId: 'vitacall-db',
      details: 'Full database snapshot exported for disaster recovery.'
    });

    const { backups, revokedTokens, activeSessions, ...exportPayload } = db;
    res.setHeader('Content-Disposition', `attachment; filename=vitacall-backup-${Date.now()}.json`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(exportPayload, null, 2));
  });

  router.post('/api/admin/restore', authenticateToken, requireRole('admin'), (req, res) => {
    if (!verifyAdminPassword(req, res)) return;
    const backupData = req.body && (req.body.backupData || req.body);
    if (!backupData || !backupData.users || !backupData.requests) {
      return res.status(400).json({ error: 'Invalid backup structure' });
    }

    const db = getDb();
    const existingBackups = db.backups || [];
    setDb({
      ...db,
      ...backupData,
      backups: existingBackups
    });
    ensureDbSchema();
    saveDb();

    logAudit(req, {
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'DATABASE_RESTORED',
      targetEntity: 'system',
      targetId: 'vitacall-db',
      details: 'Database restored from JSON backup image after password re-entry.'
    });

    res.json({ message: 'Database restored successfully', totalRecords: getDb().requests.length });
  });

  router.get('/api/admin/backups', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
    res.json((db.backups || []).map(b => ({
      id: b.id,
      name: b.name,
      createdAt: b.createdAt,
      createdBy: b.createdBy,
      counts: b.counts
    })));
  });

  router.post('/api/admin/backups', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
    const { name } = req.body;
    const snapId = generateId('BKP');
    const { backups, revokedTokens, activeSessions, ...snapshotData } = JSON.parse(JSON.stringify(db));

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

  router.post('/api/admin/backups/:id/restore', authenticateToken, requireRole('admin'), (req, res) => {
    if (!verifyAdminPassword(req, res)) return;
    const db = getDb();
    const snap = (db.backups || []).find(b => b.id === req.params.id);
    if (!snap || !snap.data) return res.status(404).json({ error: 'Backup snapshot not found' });

    const savedBackups = db.backups;
    setDb({
      ...JSON.parse(JSON.stringify(snap.data)),
      backups: savedBackups
    });
    ensureDbSchema();
    saveDb();

    logAudit(req, {
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'DATABASE_RESTORED',
      targetEntity: 'backup',
      targetId: snap.id,
      details: `Restored system database from snapshot "${snap.name}" (${snap.id}) after password re-entry.`
    });

    res.json({ message: `System restored from "${snap.name}"`, totalRecords: getDb().requests.length });
  });

  router.delete('/api/admin/backups/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
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

  // Announcements
  router.get('/api/admin/announcements', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
    res.json({
      announcements: db.announcements || [],
      recentNotifications: (db.notifications || []).slice(0, 100)
    });
  });

  router.post('/api/admin/announcements', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
    const {
      title, message, targetRole = 'all', priority = 'info',
      isPinned = false, scheduledAt = null, expiresAt = null, sendNotification = true
    } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'Announcement title and message are required.' });
    }

    const now = new Date().toISOString();
    const announcement = {
      id: generateId('ANN'),
      title: String(title).trim(),
      message: String(message).trim(),
      targetRole: ['all', 'requester', 'personnel', 'doctor'].includes(targetRole) ? targetRole : 'all',
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

    let recipientsCount = 0;
    if (sendNotification) {
      const recipients = db.users.filter(u => targetRole === 'all' ? true : u.role === targetRole);
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
      details: `Published announcement "${announcement.title}" to [${targetRole.toUpperCase()}].`
    });

    res.status(201).json({
      message: `Announcement published (${recipientsCount} users notified)`,
      announcement,
      recipientsCount
    });
  });

  router.put('/api/admin/announcements/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
    const ann = (db.announcements || []).find(a => a.id === req.params.id);
    if (!ann) return res.status(404).json({ error: 'Announcement not found' });

    const { title, message, targetRole, priority, isPinned, scheduledAt, expiresAt } = req.body;
    if (title && String(title).trim()) ann.title = String(title).trim();
    if (message && String(message).trim()) ann.message = String(message).trim();
    if (targetRole && ['all', 'requester', 'personnel', 'doctor'].includes(targetRole)) ann.targetRole = targetRole;
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

  router.delete('/api/admin/announcements/:id', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
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

  // System Settings
  router.get('/api/admin/settings', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
    const dbStat = fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE) : null;
    res.json({
      settings: db.systemSettings || getDefaultSystemSettings(),
      systemInfo: {
        version: '2.5.0-USTP-Hardened',
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

  router.put('/api/admin/settings', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
    if (!db.systemSettings || typeof db.systemSettings !== 'object') {
      db.systemSettings = getDefaultSystemSettings();
    }

    const updates = req.body || {};
    const allowedFields = [
      'systemName', 'systemSubtitle', 'institutionName', 'campusName', 'clinicName', 'logoUrl',
      'clinicHotline', 'emergencyHotline', 'operatingHours', 'allowRegistration', 'requireAccountApproval',
      'enforceUstpEmail', 'maxFailedLoginAttempts', 'lockoutDurationMinutes', 'sessionTimeoutMinutes',
      'maintenanceMode', 'maintenanceMessage', 'enableAnnouncementsBanner', 'autoNotifyPersonnelOnSevere',
      'enableSoundAlerts', 'defaultCertValidityDays', 'firebaseSyncEnabled', 'firebaseProjectId'
    ];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) db.systemSettings[field] = updates[field];
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
      details: `System settings updated by ${req.user.name}.`
    });

    res.json({ message: 'System settings updated successfully', settings: db.systemSettings });
  });

  return router;
};

