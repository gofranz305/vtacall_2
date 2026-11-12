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
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'vitacall-db.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-Memory Database with JSON disk persistence
let db = {
  users: [],
  requests: [],
  clinicalRecords: [],
  certificates: [],
  auditLogs: [],
  notifications: []
};

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing to DB file:', err);
  }
}

function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(raw);
      console.log('Database loaded from disk.');
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
    ipAddress: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
    userAgent: req.headers['user-agent'] || 'VitaCall Client'
  };
  logEntry.integrityHash = generateHash(logEntry);
  db.auditLogs.unshift(logEntry);

  // Keep audit logs to reasonable size in memory
  if (db.auditLogs.length > 500) {
    db.auditLogs.pop();
  }
  saveDb();
  return logEntry;
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
      createdAt: '2026-10-20T08:00:00.000Z'
    },
    {
      id: 'usr_student2',
      name: 'Franz Clyde Rian Go',
      email: 'franz.go@ustp.edu.ph',
      passwordHash: defaultHash,
      role: 'requester',
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
      createdAt: '2026-10-22T09:30:00.000Z'
    },
    {
      id: 'usr_student3',
      name: 'Jelly Quen Maniscan',
      email: 'jelly.maniscan@ustp.edu.ph',
      passwordHash: defaultHash,
      role: 'requester',
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
      createdAt: '2026-10-24T10:15:00.000Z'
    },
    // Health Personnel
    {
      id: 'usr_nurse1',
      name: 'Nurse Sarah Alcantara, RN',
      email: 'nurse.sarah@ustp.edu.ph',
      passwordHash: defaultHash,
      role: 'personnel',
      title: 'Campus Health Nurse - Off-Site Response Team',
      licenseNumber: 'PRC RN-0982341',
      phone: '+63 920 111 8899',
      createdAt: '2026-10-01T08:00:00.000Z'
    },
    {
      id: 'usr_doc1',
      name: 'Dr. Roberto Santos, MD',
      email: 'dr.santos@ustp.edu.ph',
      passwordHash: defaultHash,
      role: 'personnel',
      title: 'USTP Campus Physician / Medical Officer',
      licenseNumber: 'PRC MD-0054321',
      phone: '+63 922 444 7788',
      createdAt: '2026-10-01T08:00:00.000Z'
    },
    // Health Center Administrator
    {
      id: 'usr_admin1',
      name: 'Dr. Eleanor Reyes, MD, MHA',
      email: 'admin.clinic@ustp.edu.ph',
      passwordHash: defaultHash,
      role: 'admin',
      title: 'Director of Student Health & Wellness Center',
      licenseNumber: 'PRC MD-0033219',
      phone: '+63 917 888 9900',
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

  saveDb();
  console.log('Database seeded with USTP Villanueva sample data.');
}

loadDb();

// JWT Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired session token' });
    const user = db.users.find(u => u.id === decodedUser.id);
    if (!user) return res.status(403).json({ error: 'User no longer exists' });
    req.user = user;
    next();
  });
}

// Role Authorization Middleware
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: insufficient privileges' });
    }
    next();
  };
}

// ======================= API ROUTES =======================

// 1. Auth: Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const validPassword = bcrypt.compareSync(password, user.passwordHash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

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

  const { passwordHash, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

// Auth: Register (Students / Citizens)
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, studentId, courseAndYear, boardingHouse, address, landmark, phone, emergencyContact } = req.body;

  if (!name || !email || !password || !boardingHouse || !address || !phone) {
    return res.status(400).json({ error: 'Please fill in all required fields' });
  }

  const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
  if (existing) {
    return res.status(400).json({ error: 'An account with this email already exists' });
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);

  const newUser = {
    id: 'usr_' + Date.now(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash,
    role: 'requester',
    studentId: studentId ? studentId.trim() : 'N/A',
    courseAndYear: courseAndYear ? courseAndYear.trim() : 'N/A',
    boardingHouse: boardingHouse.trim(),
    address: address.trim(),
    landmark: landmark ? landmark.trim() : '',
    phone: phone.trim(),
    emergencyContact: emergencyContact || { name: 'Guardian', phone: 'N/A' },
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
    details: `Student registered account with Boarding House: ${newUser.boardingHouse}`
  });

  const token = jwt.sign(
    { id: newUser.id, email: newUser.email, role: newUser.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  const { passwordHash: _, ...safeUser } = newUser;
  res.status(201).json({ token, user: safeUser });
});

// Auth: Current User
app.get('/api/auth/me', authenticateToken, (req, res) => {
  const { passwordHash, ...safeUser } = req.user;
  res.json(safeUser);
});

// Auth: Logout
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'USER_LOGOUT',
    targetEntity: 'user',
    targetId: req.user.id,
    details: 'User logged out successfully from web application.'
  });
  res.json({ success: true, message: 'Logged out successfully' });
});

// Update Profile (Editable Profile for Students & Personnel)
app.put('/api/users/profile', authenticateToken, (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

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
    profilePicture  // Task 5: profile picture as base64 data URL
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
    // Accept data URL or empty string (to remove)
    user.profilePicture = profilePicture || '';
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

// Demo accounts quick-switch helper
app.get('/api/auth/demo-accounts', (req, res) => {
  const safeAccounts = db.users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    studentId: u.studentId,
    courseAndYear: u.courseAndYear,
    boardingHouse: u.boardingHouse,
    title: u.title
  }));
  res.json(safeAccounts);
});

// 2. Requests API
// Get requests (Requesters only see their own; Personnel and Admin see all)
app.get('/api/requests', authenticateToken, (req, res) => {
  let list = db.requests;
  if (req.user.role === 'requester') {
    list = list.filter(r => r.userId === req.user.id);
  }
  // Sort newest first
  list = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});

// Create new health checkup request
app.post('/api/requests', authenticateToken, (req, res) => {
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
        notes: `Checkup request submitted. Symptoms: ${symptoms.join(', ')}`
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
    details: `Created health request (${urgency.toUpperCase()}) at ${newRequest.boardingHouse}.`
  });

  // Notify Health Personnel (targetRoute: personnel queue)
  db.users
    .filter(u => u.role === 'personnel' || u.role === 'admin')
    .forEach(person => {
      createNotification(
        person.id,
        `New Request: ${newRequest.studentName}`,
        `Urgency: ${urgency.toUpperCase()} | Location: ${newRequest.boardingHouse}`,
        urgency === 'severe' ? 'urgent' : 'info',
        newRequest.id,
        'queue'
      );
    });

  res.status(201).json(newRequest);
});

// Update Request Status (Personnel or Admin)
app.patch('/api/requests/:id/status', authenticateToken, requireRole('personnel', 'admin'), (req, res) => {
  const { id } = req.params;
  const { status, notes, assignToSelf } = req.body;

  const validStatuses = ['pending', 'assigned', 'en_route', 'in_progress', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status code' });
  }

  const reqItem = db.requests.find(r => r.id === id);
  if (!reqItem) {
    return res.status(404).json({ error: 'Request not found' });
  }

  const now = new Date().toISOString();

  if (assignToSelf || (status === 'assigned' && !reqItem.assignedTo)) {
    reqItem.assignedTo = {
      id: req.user.id,
      name: req.user.name,
      phone: req.user.phone || '+63 920 111 8899'
    };
  }

  reqItem.status = status;
  reqItem.timeline.push({
    status,
    timestamp: now,
    updatedBy: req.user.name,
    notes: notes || `Status updated to ${status.replace('_', ' ').toUpperCase()} by ${req.user.name}`
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

  // Notify student (targetRoute: that request in the student dashboard, or certificates if completed)
  let statusText = status.replace('_', ' ').toUpperCase();
  createNotification(
    reqItem.userId,
    `Request Update: ${statusText}`,
    notes || `Your checkup request status has been updated to ${statusText}.`,
    status === 'completed' ? 'success' : 'info',
    reqItem.id,
    status === 'completed' ? 'certificates' : `request:${reqItem.id}`
  );

  res.json(reqItem);
});

// 3. Clinical Checkup Entry & Automated Certificate Issuance
app.post('/api/requests/:id/clinical-record', authenticateToken, requireRole('personnel', 'admin'), async (req, res) => {
  const { id } = req.params;
  const {
    vitals = {},
    symptomsObserved = '',
    diagnosis = '',
    prescriptionAndCare = '',
    excusedDuration = {},
    remarks = ''
  } = req.body;

  const request = db.requests.find(r => r.id === id);
  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  if (!diagnosis || !diagnosis.trim()) {
    return res.status(400).json({ error: 'Clinical diagnosis is required' });
  }

  const now = new Date().toISOString();
  const clinicalRecordId = 'CR-2026-' + (1000 + db.clinicalRecords.length + 1);

  const clinicalRecord = {
    id: clinicalRecordId,
    requestId: request.id,
    patientId: request.userId,
    patientName: request.studentName,
    studentId: request.studentId,
    examinerId: req.user.id,
    examinerName: req.user.name,
    examinerTitle: req.user.title || 'Campus Health Personnel',
    examinerLicense: req.user.licenseNumber || 'PRC License Verified',
    dateExamined: now,
    vitals: {
      bp: vitals.bp || '120/80 mmHg',
      temp: vitals.temp ? `${vitals.temp} °C` : '37.0 °C',
      pulse: vitals.pulse ? `${vitals.pulse} bpm` : '78 bpm',
      respRate: vitals.respRate ? `${vitals.respRate} cpm` : '18 cpm',
      spo2: vitals.spo2 ? `${vitals.spo2} %` : '99 %'
    },
    symptomsObserved,
    diagnosis,
    prescriptionAndCare,
    excusedDuration: {
      isExcused: Boolean(excusedDuration.isExcused),
      startDate: excusedDuration.startDate || now.split('T')[0],
      endDate: excusedDuration.endDate || now.split('T')[0],
      daysCount: Number(excusedDuration.daysCount) || 1,
      reason: excusedDuration.reason || 'Medical rest ordered due to acute illness.'
    },
    remarks
  };

  db.clinicalRecords.push(clinicalRecord);

  // Automatically generate tamper-resistant Medical Certificate
  const certId = 'CERT-USTP-2026-' + (100 + db.certificates.length + 1);
  const randomSuffix = Math.floor(10000 + Math.random() * 90000);
  const verificationCode = `USTP-VC-${randomSuffix}`;

  // Calculate validity period (e.g. 7 days from issue)
  const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const certificatePayload = {
    id: certId,
    verificationCode,
    requestId: request.id,
    clinicalRecordId: clinicalRecord.id,
    studentName: request.studentName,
    studentId: request.studentId,
    courseAndYear: request.courseAndYear,
    boardingHouse: `${request.boardingHouse}, ${request.address}`,
    issuedAt: now,
    validUntil,
    issuerName: req.user.name,
    issuerLicense: req.user.licenseNumber || 'PRC RN-0982341',
    approverName: req.user.role === 'admin' ? req.user.name : 'Dr. Roberto Santos, MD',
    approverLicense: 'PRC MD-0054321 - Campus Physician',
    diagnosis,
    vitalSignsSummary: `BP: ${clinicalRecord.vitals.bp} | Temp: ${clinicalRecord.vitals.temp} | Pulse: ${clinicalRecord.vitals.pulse} | SpO2: ${clinicalRecord.vitals.spo2}`,
    recommendations: prescriptionAndCare,
    excusedDates: clinicalRecord.excusedDuration.isExcused
      ? `${clinicalRecord.excusedDuration.startDate} to ${clinicalRecord.excusedDuration.endDate} (${clinicalRecord.excusedDuration.daysCount} Days)`
      : 'Fit to resume regular academic load; rest recommended outside class hours.',
    status: 'valid',
    institution: 'University of Science and Technology of Southern Philippines (USTP) - Villanueva Campus',
    clinicName: 'Health and Wellness Center - Off-Site Health Response Unit'
  };

  // Cryptographic integrity hash (SHA256)
  certificatePayload.integrityHash = generateHash(certificatePayload);

  // Generate QR Code data URL for instant verification
  const verificationUrl = `${req.protocol}://${req.get('host')}/#verify?code=${verificationCode}`;
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
  certificatePayload.qrCodeDataUrl = qrCodeDataUrl;
  certificatePayload.verificationUrl = verificationUrl;

  db.certificates.push(certificatePayload);

  // Update Request status to completed
  request.status = 'completed';
  request.completedAt = now;
  request.certificateId = certId;
  request.timeline.push({
    status: 'completed',
    timestamp: now,
    updatedBy: req.user.name,
    notes: `Checkup completed on-site. Medical Certificate ${verificationCode} generated and issued.`
  });

  saveDb();

  // Audit logs
  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'CLINICAL_RECORD_RECORDED',
    targetEntity: 'clinicalRecord',
    targetId: clinicalRecord.id,
    details: `Recorded diagnosis "${diagnosis}" for student ${request.studentName}.`
  });

  logAudit(req, {
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: 'CERTIFICATE_ISSUED',
    targetEntity: 'certificate',
    targetId: certId,
    details: `Generated verifiable certificate ${verificationCode} for ${request.studentName}.`
  });

  // Notify student (targetRoute: certificates section)
  createNotification(
    request.userId,
    'Medical Certificate Issued!',
    `Your checkup has been completed. Your official USTP Medical Certificate (${verificationCode}) is ready to download.`,
    'success',
    request.id,
    'certificates'
  );

  res.status(201).json({
    message: 'Checkup recorded and certificate issued successfully',
    clinicalRecord,
    certificate: certificatePayload,
    request
  });
});

// 4. Certificates API
// Get certificate by ID or Request ID
app.get('/api/certificates/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const cert = db.certificates.find(c => c.id === id || c.requestId === id || c.verificationCode === id);
  if (!cert) {
    return res.status(404).json({ error: 'Certificate not found' });
  }

  // Authorization: Requester can only view their own certificate
  if (req.user.role === 'requester') {
    const parentReq = db.requests.find(r => r.id === cert.requestId);
    if (parentReq && parentReq.userId !== req.user.id) {
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
app.get('/api/verify-certificate/:code', (req, res) => {
  const { code } = req.params;
  const cleanCode = code.trim().toUpperCase();

  const cert = db.certificates.find(c => c.verificationCode.toUpperCase() === cleanCode || c.id.toUpperCase() === cleanCode);
  if (!cert) {
    logAudit(req, {
      userId: 'anonymous_verifier',
      userName: 'Public Verifier',
      userRole: 'public',
      action: 'CERTIFICATE_VERIFY_FAILED',
      targetEntity: 'certificate',
      targetId: cleanCode,
      details: `Verification attempt failed for code ${cleanCode}. Certificate not found.`
    });
    return res.status(404).json({
      verified: false,
      message: 'Certificate not found or verification code is invalid.'
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

  res.json({
    verified: true,
    certificate: cert,
    verifiedAt: new Date().toISOString()
  });
});

// 5. Audit Logs API (Admin only)
app.get('/api/admin/audit-logs', authenticateToken, requireRole('admin'), (req, res) => {
  res.json(db.auditLogs);
});

// 6. Analytics & Statistics API (Admin & Personnel)
app.get('/api/admin/stats', authenticateToken, requireRole('admin', 'personnel'), (req, res) => {
  const totalRequests = db.requests.length;
  const pendingRequests = db.requests.filter(r => r.status === 'pending').length;
  const activeRequests = db.requests.filter(r => ['assigned', 'en_route', 'in_progress'].includes(r.status)).length;
  const completedRequests = db.requests.filter(r => r.status === 'completed').length;
  const totalCertificates = db.certificates.length;
  const totalStudents = db.users.filter(u => u.role === 'requester').length;

  // Triage breakdown
  const urgencyBreakdown = {
    severe: db.requests.filter(r => r.urgency === 'severe').length,
    moderate: db.requests.filter(r => r.urgency === 'moderate').length,
    mild: db.requests.filter(r => r.urgency === 'mild').length
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

  res.json({
    totalRequests,
    pendingRequests,
    activeRequests,
    completedRequests,
    totalCertificates,
    totalStudents,
    urgencyBreakdown,
    boardingHouseCounts,
    symptomCounts
  });
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

  res.setHeader('Content-Disposition', `attachment; filename=vitacall-backup-${Date.now()}.json`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(db, null, 2));
});

app.post('/api/admin/restore', authenticateToken, requireRole('admin'), (req, res) => {
  const backupData = req.body;
  if (!backupData || !backupData.users || !backupData.requests) {
    return res.status(400).json({ error: 'Invalid backup structure' });
  }

  db = backupData;
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
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` VitaCall Server running at http://localhost:${PORT}`);
  console.log(` USTP Villanueva Campus - Health Request & Monitoring`);
  console.log(`=======================================================`);
});
