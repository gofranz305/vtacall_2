const express = require('express');
const QRCode = require('qrcode');
const { generateHmac, generateCertificateCode, generateId } = require('../crypto');
const {
  getDb,
  saveDb,
  sanitizeUser,
  getDefaultDoctorSignatureDataUrl,
  logAudit,
  logSecurityEvent,
  createNotification,
  computeNurseAvailability
} = require('../db');
const { authenticateToken, requireRole } = require('../middleware');

module.exports = function createClinicalRouter({ verifyLimiter }) {
  const router = express.Router();

  // Save or Update Doctor Digital Signature (PATCH & PUT)
  function handleSaveDoctorSignature(req, res) {
    const db = getDb();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'Doctor account not found' });

    const { doctorSignature } = req.body;
    if (!doctorSignature || typeof doctorSignature !== 'string' || !doctorSignature.startsWith('data:image/')) {
      return res.status(400).json({ error: 'A valid signature image is required.' });
    }
    user.doctorSignature = doctorSignature;
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

    res.json({ message: 'Signature saved', user: sanitizeUser(user) });
  }
  router.patch('/api/doctor/signature', authenticateToken, requireRole('doctor'), handleSaveDoctorSignature);
  router.put('/api/doctor/signature', authenticateToken, requireRole('doctor'), handleSaveDoctorSignature);

  // Get Active Campus Nurses for Doctor Triage Assignment
  router.get('/api/nurses', authenticateToken, requireRole('doctor', 'admin'), (req, res) => {
    const db = getDb();
    const nurses = db.users
      .filter(u => u.role === 'personnel' && (u.status || 'active') === 'active')
      .map(n => {
        const activeAssignedCount = db.requests.filter(
          r => r.assignedTo && r.assignedTo.id === n.id && ['assigned', 'en_route', 'in_progress', 'returned_to_nurse'].includes(r.status)
        ).length;
        const avail = computeNurseAvailability(n, activeAssignedCount);
        return {
          id: n.id,
          name: n.name,
          email: n.email,
          phone: n.phone || '+63 920 111 8899',
          title: n.title || 'Campus Health Nurse',
          licenseNumber: n.licenseNumber || 'PRC RN-Verified',
          dutyStatus: (n.settings && n.settings.dutyStatus) || 'on_duty',
          effectiveStatus: avail.effectiveStatus,
          offDutyUntil: avail.offDutyUntil,
          availabilityReason: avail.reason,
          weeklySchedule: (n.settings && n.settings.weeklySchedule) || null,
          leaveRanges: (n.settings && n.settings.leaveRanges) || [],
          activeAssignedCount
        };
      });
    res.json(nurses);
  });

  // Get Clinical Records
  router.get('/api/clinical-records', authenticateToken, requireRole('doctor', 'personnel', 'admin'), (req, res) => {
    const db = getDb();
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

  // Get Requests
  router.get('/api/requests', authenticateToken, (req, res) => {
    const db = getDb();
    let list = db.requests;
    if (req.user.role === 'requester') {
      list = list
        .filter(r => r.userId === req.user.id)
        .map(({ checkupRevisions, returnNote, ...safeReq }) => safeReq);
    } else if (req.user.role === 'personnel') {
      list = list.filter(r => r.assignedTo && r.assignedTo.id === req.user.id && r.status !== 'pending');
    }
    list = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(list);
  });

  // Create new health checkup request (goes to Doctor's Pending Triage Queue)
  router.post('/api/requests', authenticateToken, (req, res) => {
    const db = getDb();
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

    const reqId = generateId('REQ');
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

    logAudit(req, {
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'REQUEST_CREATED',
      targetEntity: 'request',
      targetId: newRequest.id,
      details: `Created health request (${urgency.toUpperCase()}) routed to Doctor Pending Triage Queue.`
    });

    db.users
      .filter(u => u.role === 'doctor' || u.role === 'admin')
      .forEach(person => {
        createNotification(
          person.id,
          `New Triage Request (${newRequest.id})`,
          `A new health checkup request (${urgency.toUpperCase()}) is awaiting nurse assignment.`,
          urgency === 'severe' ? 'urgent' : 'info',
          newRequest.id,
          'queue'
        );
      });

    res.status(201).json(newRequest);
  });

  // Doctor Triage Assignment
  router.post('/api/requests/:id/assign', authenticateToken, (req, res) => {
    const db = getDb();
    if (req.user.role !== 'doctor') {
      logAudit(req, {
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'UNAUTHORIZED_TRIAGE_ASSIGN_ATTEMPT',
        targetEntity: 'request',
        targetId: req.params.id,
        details: `Blocked attempt by ${req.user.role} (${req.user.name}) to assign triage request ${req.params.id}.`
      });
      return res.status(403).json({ error: 'Only the Campus Doctor can triage pending requests and assign them to a nurse.' });
    }

    const { id } = req.params;
    const { nurseId, notes = '', urgency, allowBusy = false } = req.body;

    const reqItem = db.requests.find(r => r.id === id);
    if (!reqItem) return res.status(404).json({ error: 'Request not found' });

    const nurse = db.users.find(u => u.id === nurseId && u.role === 'personnel')
      || (!nurseId ? db.users.find(u => u.role === 'personnel') : null);
    if (!nurse) return res.status(400).json({ error: 'Selected campus nurse not found' });

    const openCount = db.requests.filter(
      r => r.assignedTo && r.assignedTo.id === nurse.id && ['assigned', 'en_route', 'in_progress', 'returned_to_nurse'].includes(r.status)
    ).length;
    const avail = computeNurseAvailability(nurse, openCount);
    if (avail.effectiveStatus === 'off_duty') {
      return res.status(409).json({
        error: `Nurse ${nurse.name} is off duty${avail.offDutyUntil ? ` until ${avail.offDutyUntil}` : ''}. (${avail.reason})`
      });
    }
    if (avail.effectiveStatus === 'dispatched' && !allowBusy) {
      return res.status(409).json({
        error: `Nurse ${nurse.name} is currently dispatched on-site. Confirm allowBusy=true to assign.`,
        requiresConfirmBusy: true
      });
    }

    if (urgency && ['mild', 'moderate', 'severe'].includes(urgency)) {
      reqItem.urgency = urgency;
    }

    const now = new Date().toISOString();
    reqItem.status = 'assigned';
    reqItem.needsReassignment = false;
    reqItem.needsReassignmentReason = null;
    reqItem.assignedTo = {
      id: nurse.id,
      name: nurse.name,
      phone: nurse.phone || '+63 920 111 8899',
      licenseNumber: nurse.licenseNumber || 'PRC RN-0982341'
    };
    reqItem.triagedBy = { id: req.user.id, name: req.user.name, timestamp: now };

    const assignNote = notes
      ? `Triaged by ${req.user.name} and assigned to ${nurse.name}. Notes: ${notes}`
      : `Triaged by ${req.user.name} and assigned to ${nurse.name} for off-site checkup.`;

    reqItem.timeline.push({ status: 'assigned', timestamp: now, updatedBy: req.user.name, notes: assignNote });
    saveDb();

    logAudit(req, {
      userId: req.user.id,
      userName: req.user.id,
      userRole: req.user.role,
      action: 'TRIAGE_ASSIGNED',
      targetEntity: 'request',
      targetId: reqItem.id,
      details: `Doctor (${req.user.id}) assigned request ${reqItem.id} to nurse (${nurse.id}).`
    });

    createNotification(
      nurse.id,
      `New Patient Assigned (${reqItem.id})`,
      'A new patient was assigned to you.',
      reqItem.urgency === 'severe' ? 'urgent' : 'info',
      reqItem.id,
      'queue'
    );

    createNotification(
      reqItem.userId,
      'Campus Nurse Assigned',
      `A campus nurse has been assigned to your checkup request (${reqItem.id}).`,
      'info',
      reqItem.id,
      `request:${reqItem.id}`
    );

    res.json(reqItem);
  });

  // Doctor Reassignment (when assigned nurse goes off duty or needs reassignment)
  router.post('/api/requests/:id/reassign', authenticateToken, (req, res) => {
    const db = getDb();
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ error: 'Only the Campus Doctor can reassign requests.' });
    }
    const reqItem = db.requests.find(r => r.id === req.params.id);
    if (!reqItem) return res.status(404).json({ error: 'Request not found' });

    const { nurseId, notes = '', allowBusy = false } = req.body;
    const nurse = db.users.find(u => u.id === nurseId && u.role === 'personnel');
    if (!nurse) return res.status(400).json({ error: 'Selected campus nurse not found' });

    const openCount = db.requests.filter(
      r => r.assignedTo && r.assignedTo.id === nurse.id && ['assigned', 'en_route', 'in_progress', 'returned_to_nurse'].includes(r.status)
    ).length;
    const avail = computeNurseAvailability(nurse, openCount);
    if (avail.effectiveStatus === 'off_duty') {
      return res.status(409).json({
        error: `Nurse ${nurse.name} is off duty${avail.offDutyUntil ? ` until ${avail.offDutyUntil}` : ''}.`
      });
    }
    if (avail.effectiveStatus === 'dispatched' && !allowBusy) {
      return res.status(409).json({
        error: `Nurse ${nurse.name} is currently dispatched on-site. Confirm allowBusy=true to reassign.`,
        requiresConfirmBusy: true
      });
    }

    const prevNurseName = reqItem.assignedTo ? reqItem.assignedTo.name : 'Unassigned';
    const now = new Date().toISOString();
    reqItem.assignedTo = {
      id: nurse.id,
      name: nurse.name,
      phone: nurse.phone || '+63 920 111 8899',
      licenseNumber: nurse.licenseNumber || 'PRC RN-0982341'
    };
    reqItem.needsReassignment = false;
    reqItem.needsReassignmentReason = null;
    if (reqItem.status === 'pending') reqItem.status = 'assigned';
    reqItem.timeline.push({
      status: reqItem.status,
      timestamp: now,
      updatedBy: req.user.name,
      notes: `Reassigned from ${prevNurseName} to ${nurse.name} by ${req.user.name}.${notes ? ' ' + notes : ''}`
    });
    saveDb();

    logAudit(req, {
      userId: req.user.id,
      userName: req.user.id,
      userRole: req.user.role,
      action: 'TRIAGE_REASSIGNED',
      targetEntity: 'request',
      targetId: reqItem.id,
      details: `Doctor (${req.user.id}) reassigned ${reqItem.id} to nurse (${nurse.id}).`
    });

    createNotification(
      nurse.id,
      `Patient Reassigned (${reqItem.id})`,
      `Checkup request ${reqItem.id} was reassigned to you.`,
      'info',
      reqItem.id,
      'queue'
    );

    res.json({ message: `Request ${reqItem.id} reassigned to ${nurse.name}`, request: reqItem });
  });

  // Update Request Status (strict step order for Nurse)
  router.patch('/api/requests/:id/status', authenticateToken, requireRole('personnel', 'doctor', 'admin'), (req, res) => {
    const db = getDb();
    const { id } = req.params;
    const { status, notes, assignToSelf, nurseId } = req.body;

    const validStatuses = ['pending', 'assigned', 'en_route', 'in_progress', 'awaiting_doctor', 'returned_to_nurse', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status code' });
    }

    const reqItem = db.requests.find(r => r.id === id);
    if (!reqItem) return res.status(404).json({ error: 'Request not found' });

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

    if (status === 'completed') reqItem.completedAt = now;
    saveDb();

    logAudit(req, {
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'STATUS_UPDATED',
      targetEntity: 'request',
      targetId: reqItem.id,
      details: `Status shifted to ${status.toUpperCase()} by ${req.user.name}.`
    });

    const statusText = status.replace(/_/g, ' ').toUpperCase();
    createNotification(
      reqItem.userId,
      `Request Update: ${statusText}`,
      `Your checkup request (${reqItem.id}) status has been updated to ${statusText}.`,
      'info',
      reqItem.id,
      `request:${reqItem.id}`
    );

    res.json(reqItem);
  });

  // Nurse On-Site Checkup Entry -> Creates Draft Certificate
  router.post('/api/requests/:id/clinical-record', authenticateToken, requireRole('personnel'), async (req, res) => {
    const db = getDb();
    const { id } = req.params;
    const { vitals = {}, symptomsObserved = '', nurseNotes = '', diagnosis, prescribedMedication, prescriptionAndCare } = req.body;

    const request = db.requests.find(r => r.id === id);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    if (!request.assignedTo || request.assignedTo.id !== req.user.id) {
      return res.status(403).json({ error: 'You can only record on-site checkups for your own assigned patients.' });
    }

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
        details: `Rejected attempt by nurse ${req.user.name} to submit clinical diagnosis or prescribed medication on ${request.id}.`
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

    let clinicalRecord = db.clinicalRecords.find(cr => cr.requestId === request.id);
    const isResubmission = Boolean(clinicalRecord);

    if (clinicalRecord) {
      clinicalRecord.vitals = formattedVitals;
      clinicalRecord.symptomsObserved = String(symptomsObserved).trim();
      clinicalRecord.nurseNotes = String(nurseNotes || '').trim();
      clinicalRecord.dateExamined = now;
      clinicalRecord.status = 'awaiting_doctor';
    } else {
      clinicalRecord = {
        id: generateId('CR'),
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
      draftCert = {
        id: generateId('CERT'),
        verificationCode: generateCertificateCode(),
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

    logAudit(req, {
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'DRAFT_CERTIFICATE_CREATED',
      targetEntity: 'certificate',
      targetId: draftCert.id,
      details: `Nurse ${req.user.name} recorded on-site checkup vitals/observations and created draft certificate ${draftCert.id}.`
    });

    db.users.filter(u => u.role === 'doctor').forEach(doc => {
      createNotification(
        doc.id,
        `Awaiting Doctor Validation (${request.id})`,
        `On-site vitals and physical observations were submitted for request ${request.id}. Ready for diagnosis & signature.`,
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

  // Doctor Returns Checkup to Nurse
  router.post('/api/requests/:id/return-to-nurse', authenticateToken, (req, res) => {
    const db = getDb();
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
    const clinicalRecord = db.clinicalRecords.find(cr => cr.requestId === request.id);
    if (!Array.isArray(request.checkupRevisions)) {
      request.checkupRevisions = [];
    }
    request.checkupRevisions.push({
      revision: request.checkupRevisions.length + 1,
      vitals: clinicalRecord && clinicalRecord.vitals ? { ...clinicalRecord.vitals } : {},
      symptomsObserved: clinicalRecord ? (clinicalRecord.symptomsObserved || '') : '',
      nurseNotes: clinicalRecord ? (clinicalRecord.nurseNotes || '') : '',
      submittedAt: clinicalRecord ? clinicalRecord.dateExamined : now,
      submittedBy: clinicalRecord ? clinicalRecord.examinerName : (request.assignedTo ? request.assignedTo.name : ''),
      returnNote: returnReason,
      returnedBy: req.user.name,
      returnedAt: now
    });

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
      userName: req.user.id,
      userRole: req.user.role,
      action: 'CHECKUP_RETURNED_TO_NURSE',
      targetEntity: 'request',
      targetId: request.id,
      details: `Doctor (${req.user.id}) returned checkup ${request.id} to nurse for revision.`
    });

    if (request.assignedTo && request.assignedTo.id) {
      createNotification(
        request.assignedTo.id,
        `Checkup Returned by Doctor (${request.id})`,
        `Checkup ${request.id} was returned by the Doctor for revision.`,
        'warning',
        request.id,
        'queue'
      );
    }

    res.json({ message: 'Checkup returned to nurse with notes.', request });
  });

  // Doctor Validation, Diagnosis, Medication, Signature & Sign & Send
  async function handleDoctorSignAndSend(req, res) {
    const db = getDb();
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
    let request = db.requests.find(r => r.id === id || r.certificateId === id || r.draftCertificateId === id);
    let draftCert = db.certificates.find(c => c.id === id || c.verificationCode === id || (request && c.requestId === request.id));
    if (!request && draftCert) {
      request = db.requests.find(r => r.id === draftCert.requestId);
    }
    if (!request) return res.status(404).json({ error: 'Checkup request or draft certificate not found' });

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
      clinicalRecord = {
        id: generateId('CR'),
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
      draftCert = {
        id: generateId('CERT'),
        verificationCode: generateCertificateCode(),
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

    const verificationUrl = `${req.protocol}://${req.get('host')}/#verify?code=${draftCert.verificationCode}`;
    let qrCodeDataUrl = '';
    try {
      qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, {
        errorCorrectionLevel: 'H',
        margin: 1,
        color: { dark: '#162A56', light: '#FFFFFF' }
      });
    } catch (_) { }
    draftCert.qrCodeDataUrl = qrCodeDataUrl;
    draftCert.verificationUrl = verificationUrl;

    // Keyed HMAC integrity hash covering identity + diagnosis + prescribedMedication + recommendations + validity + approval
    draftCert.integrityHash = computeCertificateHmac(draftCert);

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

    logAudit(req, {
      userId: req.user.id,
      userName: req.user.id,
      userRole: req.user.role,
      action: 'DOCTOR_VALIDATED_CHECKUP',
      targetEntity: 'clinicalRecord',
      targetId: clinicalRecord.id,
      details: `Doctor (${req.user.id}) validated clinical record ${clinicalRecord.id} for request ${request.id}.`
    });

    logAudit(req, {
      userId: req.user.id,
      userName: req.user.id,
      userRole: req.user.role,
      action: 'CERTIFICATE_SIGNED_AND_SENT',
      targetEntity: 'certificate',
      targetId: draftCert.id,
      details: `Doctor (${req.user.id}) sealed, digitally signed, and sent Medical Certificate ${draftCert.id}.`
    });

    createNotification(
      request.userId,
      'Your medical certificate is ready',
      `Your official USTP Medical Certificate (${draftCert.verificationCode}) has been signed and is ready to view or download.`,
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

  router.post('/api/requests/:id/doctor-validate', authenticateToken, handleDoctorSignAndSend);
  router.post('/api/certificates/:id/sign-and-send', authenticateToken, handleDoctorSignAndSend);

  // Admin Certificate Revocation
  router.post('/api/admin/certificates/:id/revoke', authenticateToken, requireRole('admin'), (req, res) => {
    const db = getDb();
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

  // Get Certificates (with role-based visibility BEFORE search, filter, sort & pagination)
  router.get('/api/certificates', authenticateToken, (req, res) => {
    const db = getDb();
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
      }).map(({ doctorSignature, ...rest }) => rest);
    }

    // Enrich with parent request status for 'returned' filter
    const reqStatusById = new Map((db.requests || []).map(r => [r.id, r.status]));
    list = list.map(c => ({ ...c, requestStatus: reqStatusById.get(c.requestId) || '' }));

    const hasQueryParams = req.query && (
      req.query.q !== undefined ||
      req.query.status !== undefined ||
      req.query.from !== undefined ||
      req.query.to !== undefined ||
      req.query.sort !== undefined ||
      req.query.page !== undefined ||
      req.query.limit !== undefined
    );

    if (!hasQueryParams) {
      list.sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));
      return res.json(list);
    }

    const q = String(req.query.q || '').trim().toLowerCase();
    const statusFilter = String(req.query.status || '').trim().toLowerCase();
    const fromDate = req.query.from ? new Date(req.query.from) : null;
    const toDate = req.query.to ? new Date(req.query.to + 'T23:59:59.999Z') : null;
    const sort = String(req.query.sort || 'newest').toLowerCase();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));

    let filtered = list.filter(c => {
      if (q) {
        const hay = `${c.studentName || ''} ${c.studentId || ''} ${c.boardingHouse || ''} ${c.verificationCode || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter && statusFilter !== 'all') {
        const isDraft = c.status === 'draft' || c.isDraft === true;
        const isReturned = c.requestStatus === 'returned_to_nurse';
        if (statusFilter === 'pending_review' || statusFilter === 'draft') {
          if (!isDraft || isReturned) return false;
        } else if (statusFilter === 'returned') {
          if (!isReturned) return false;
        } else if (statusFilter === 'issued' || statusFilter === 'valid') {
          if (isDraft || c.status !== 'valid') return false;
        } else if (statusFilter === 'revoked') {
          if (c.status !== 'revoked') return false;
        }
      }
      if (fromDate && !Number.isNaN(fromDate.getTime())) {
        if (new Date(c.issuedAt) < fromDate) return false;
      }
      if (toDate && !Number.isNaN(toDate.getTime())) {
        if (new Date(c.issuedAt) > toDate) return false;
      }
      return true;
    });

    if (sort === 'oldest') {
      filtered.sort((a, b) => new Date(a.issuedAt) - new Date(b.issuedAt));
    } else if (sort === 'name_az') {
      filtered.sort((a, b) => String(a.studentName || '').localeCompare(String(b.studentName || '')));
    } else {
      filtered.sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));
    }

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const items = filtered.slice(start, start + limit);

    res.json({
      items,
      total,
      page: safePage,
      limit,
      totalPages
    });
  });

  function computeCertificateHmac(cert) {
    return generateHmac({
      id: cert.id,
      verificationCode: cert.verificationCode,
      studentId: cert.studentId,
      diagnosis: cert.diagnosis,
      prescribedMedication: cert.prescribedMedication,
      recommendations: cert.recommendations,
      excusedDates: cert.excusedDates,
      issuedAt: cert.issuedAt,
      validUntil: cert.validUntil,
      approverName: cert.approverName,
      doctorSignatureHash: cert.doctorSignature ? generateHmac(cert.doctorSignature) : ''
    });
  }

  function sanitizeVerifyCodeForLog(rawCode) {
    const rawStr = String(rawCode || '');
    const stripped = rawStr.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
    if (!stripped) return 'INVALID';
    if (stripped.length > 24 || rawStr.length > 24) {
      return `${stripped.slice(0, 13)}[truncated]`;
    }
    return stripped;
  }

  const failedVerifyTracker = { count: 0, windowStart: Date.now() };
  function recordFailedVerification(req, rawCode, reason) {
    const safeCode = sanitizeVerifyCodeForLog(rawCode);
    const nowMs = Date.now();
    if (nowMs - failedVerifyTracker.windowStart > 5 * 60 * 1000) {
      failedVerifyTracker.count = 0;
      failedVerifyTracker.windowStart = nowMs;
    }
    failedVerifyTracker.count += 1;
    // Aggregate failed verifications so attackers cannot flood the audit log
    if (failedVerifyTracker.count === 1 || failedVerifyTracker.count % 10 === 0) {
      logAudit(req, {
        userId: 'anonymous_verifier',
        userName: 'Public Verifier',
        userRole: 'public',
        action: 'CERTIFICATE_VERIFY_FAILED_AGGREGATE',
        targetEntity: 'certificate',
        targetId: safeCode,
        details: `Aggregated failed certificate verification count in current 5m window: ${failedVerifyTracker.count} (code: ${safeCode}, reason: ${reason}).`
      });
      logSecurityEvent(req, {
        type: 'SUSPICIOUS_ACTIVITY',
        severity: failedVerifyTracker.count >= 10 ? 'medium' : 'low',
        email: 'public_verifier',
        details: `Aggregated ${failedVerifyTracker.count} failed public certificate verification query/queries (code: ${safeCode}).`,
        resolved: failedVerifyTracker.count < 10
      });
    }
  }

  // Get Certificate by ID / Code / Request ID
  router.get('/api/certificates/:id', authenticateToken, (req, res) => {
    const db = getDb();
    const { id } = req.params;
    const cert = db.certificates.find(c => c.id === id || c.requestId === id || c.verificationCode === id);
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });

    if (req.user.role === 'requester') {
      if (cert.status === 'draft' || cert.isDraft === true) {
        return res.status(403).json({
          error: 'This certificate is still an unfinished draft awaiting Doctor Validation and cannot be viewed or downloaded yet.'
        });
      }
      const parentReq = db.requests.find(r => r.id === cert.requestId);
      const isOwn = (cert.studentId && req.user.studentId && cert.studentId === req.user.studentId) ||
        (parentReq && parentReq.userId === req.user.id);
      if (!isOwn) return res.status(403).json({ error: 'Unauthorized to view this certificate' });
    }

    let tampered = false;
    let integrityVerified = false;
    if (cert.status !== 'draft' && cert.isDraft !== true) {
      const expectedHmac = computeCertificateHmac(cert);
      integrityVerified = Boolean(cert.integrityHash && cert.integrityHash === expectedHmac);
      tampered = !integrityVerified;
      if (tampered) {
        logSecurityEvent(req, {
          type: 'CERTIFICATE_TAMPERED',
          severity: 'critical',
          userId: req.user.id,
          userName: req.user.name,
          userRole: req.user.role,
          details: `HMAC mismatch detected when viewing certificate ${cert.verificationCode} (${cert.id}).`,
          resolved: false
        });
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

    const canViewSig = req.user.role === 'doctor' || req.user.role === 'admin' || req.user.role === 'requester';
    const responseCert = canViewSig ? { ...cert } : (({ doctorSignature, ...rest }) => rest)(cert);

    res.json({
      ...responseCert,
      tampered,
      integrityVerified
    });
  });

  // PUBLIC Certificate Verification (Rate-limited, strips diagnosis, medication, studentId & boardingHouse)
  router.get('/api/verify-certificate/:code', verifyLimiter, (req, res) => {
    const db = getDb();
    const { code } = req.params;
    const cleanCode = String(code || '').trim().toUpperCase();

    const cert = db.certificates.find(c => c.verificationCode.toUpperCase() === cleanCode || c.id.toUpperCase() === cleanCode);
    if (!cert || cert.status === 'draft' || cert.isDraft === true || cert.status === 'revoked') {
      const reason = !cert ? 'not_found' : (cert.status === 'revoked' ? 'revoked' : 'draft');
      recordFailedVerification(req, code, reason);
      // Uniform 404 response so revoked vs unknown codes cannot be enumerated
      return res.status(404).json({
        verified: false,
        message: 'Certificate could not be verified. It may be invalid, unissued, or revoked.'
      });
    }

    const expectedHmac = computeCertificateHmac(cert);
    if (!cert.integrityHash || cert.integrityHash !== expectedHmac) {
      logSecurityEvent(req, {
        type: 'CERTIFICATE_TAMPERED',
        severity: 'critical',
        email: 'public_verifier',
        details: `Public verification detected HMAC tampering on certificate ${cert.id}.`,
        resolved: false
      });
      return res.status(400).json({
        verified: false,
        status: 'tampered',
        tampered: true,
        message: 'Certificate integrity verification failed: this record may have been altered.'
      });
    }

    logAudit(req, {
      userId: 'anonymous_verifier',
      userName: 'Public Verifier',
      userRole: 'public',
      action: 'CERTIFICATE_VERIFIED',
      targetEntity: 'certificate',
      targetId: cert.id,
      details: `Official certificate ${cert.id} (${cert.verificationCode}) verified via public verification endpoint.`
    });

    const sanitizedPublicCertificate = {
      id: cert.id,
      verificationCode: cert.verificationCode,
      studentName: cert.studentName,
      courseAndYear: cert.courseAndYear,
      issuedAt: cert.issuedAt,
      validUntil: cert.validUntil,
      excusedDates: cert.excusedDates,
      issuerName: cert.issuerName,
      issuerLicense: cert.issuerLicense,
      approverName: cert.approverName,
      approverLicense: cert.approverLicense,
      status: cert.status,
      isSigned: true,
      integrityVerified: true,
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

  // Notifications API
  router.get('/api/notifications', authenticateToken, (req, res) => {
    const db = getDb();
    res.json(db.notifications.filter(n => n.userId === req.user.id));
  });

  router.patch('/api/notifications/:id/read', authenticateToken, (req, res) => {
    const db = getDb();
    const notif = db.notifications.find(n => n.id === req.params.id && n.userId === req.user.id);
    if (notif) {
      notif.isRead = true;
      saveDb();
    }
    res.json({ success: true });
  });

  router.post('/api/notifications/mark-all-read', authenticateToken, (req, res) => {
    const db = getDb();
    (db.notifications || []).forEach(n => {
      if (n.userId === req.user.id) n.isRead = true;
    });
    saveDb();
    res.json({ success: true });
  });

  return router;
};

