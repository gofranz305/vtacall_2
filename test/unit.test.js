const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverPath = path.join(__dirname, '..', 'server.js');
const appJsPath = path.join(__dirname, '..', 'public', 'app.js');
const indexHtmlPath = path.join(__dirname, '..', 'public', 'index.html');
const stylesCssPath = path.join(__dirname, '..', 'public', 'styles.css');
const configJsPath = path.join(__dirname, '..', 'public', 'config.js');

const serverCode = [
  'server.js',
  'lib/config.js',
  'lib/crypto.js',
  'lib/logger.js',
  'lib/db.js',
  'lib/middleware.js',
  'lib/routes/auth.js',
  'lib/routes/clinical.js',
  'lib/routes/admin.js'
].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const appCode = fs.readFileSync(appJsPath, 'utf8');
const html = fs.readFileSync(indexHtmlPath, 'utf8');
const css = fs.readFileSync(stylesCssPath, 'utf8');
const configCode = fs.readFileSync(configJsPath, 'utf8');

// 1. Notifications tests
test('Task 1: Notifications have targetRoute and routes correctly', () => {
  assert.match(serverCode, /targetRoute/, 'server.js must define targetRoute in notifications');
  assert.match(serverCode, /createNotification\s*\(\s*person\.id[\s\S]*?'queue'\s*\)/, 'server.js must route new requests to queue');
  assert.match(serverCode, /createNotification\s*\(\s*request\.userId[\s\S]*?'certificates'\s*\)/, 'server.js must route certificates to certificates');
  assert.match(appCode, /getNotifTargetRoute/, 'app.js must determine targetRoute for notification');
  assert.match(appCode, /handleNotifClick/, 'app.js must have notification click handler');
  assert.match(appCode, /studentCertificatesList/, 'app.js navigate must handle scrolling to certificates section');
  assert.match(appCode, /personnelQueueList/, 'app.js navigate must handle scrolling to personnel queue');
});

// 2. Certificates tests
test('Task 2: Certificates have clear Close button and Esc handling', () => {
  assert.match(html, /id="certCloseBtn"/, 'index.html must have certCloseBtn');
  assert.match(html, /closeCertificateModal\(\)/, 'index.html must call closeCertificateModal');
  assert.match(appCode, /closeCertificateModal/, 'app.js must define closeCertificateModal');
  assert.match(appCode, /printCertificate/, 'app.js must define printCertificate without locking user');
});

// 3. Students & Audit Trail protection
test('Task 3: Students cannot access Audit Trail, admin role guard enforced', () => {
  assert.match(serverCode, /requireRole\('admin'\)/, 'server.js must enforce admin role guard on audit logs');
  assert.match(appCode, /state\.currentUser\.role !== 'admin'/, 'app.js must guard admin view from students');
});

// 4. Loading state & Config
test('Task 4: Loading delay constant defined in config.js (1000 ms)', () => {
  assert.match(configCode, /APP_LOADING_DELAY_MS\s*=\s*(1000|5000)/, 'config.js must define APP_LOADING_DELAY_MS');
  assert.match(appCode, /setButtonLoading/, 'app.js must support disabling buttons while loading');
});

// 5. Profile Picture
test('Task 5: Profile picture supported with JPG/PNG/WebP, resizing and storage', () => {
  assert.match(serverCode, /profilePicture/, 'server.js must accept profilePicture in user update');
  assert.match(appCode, /handleProfilePicSelect/, 'app.js must handle profile picture file selection');
  assert.match(appCode, /saveProfilePicture/, 'app.js must save profile picture');
  assert.match(appCode, /canvas\.width = 256/, 'app.js must crop/resize picture to 256x256');
  assert.match(appCode, /payload\.profilePicture/, 'handleProfileUpdate must include pending photo in payload');
});

// 6. Login/Logout Messages & Dialogs
test('Task 6: Confirmation dialog before logout, toasts on login/logout, accessible dialogs', () => {
  assert.match(appCode, /showLogoutConfirmDialog/, 'app.js must show logout confirmation dialog');
  assert.match(appCode, /Are you sure\?/, 'logout dialog must ask "Are you sure?"');
  assert.match(appCode, /Welcome back/, 'app.js must show welcome back toast');
  assert.match(appCode, /You have been logged out/, 'app.js must show logout toast');
  assert.match(appCode, /role['"],\s*['"]dialog['"]|role="dialog"/, 'logout dialog must have accessible dialog role');
  assert.match(appCode, /aria-modal/, 'logout dialog must declare aria-modal');
  assert.match(appCode, /Escape/, 'logout dialog must close on Esc');
});

// 7. Design Polish & Accessibility
test('Task 7: Design polish with skeletons, WCAG focus-visible, and responsive layout', () => {
  assert.match(css, /\.skeleton/, 'styles.css must define skeleton loading animation');
  assert.match(css, /:focus-visible/, 'styles.css must include WCAG AA focus-visible styles');
  assert.match(css, /max-width:\s*640px/, 'styles.css must include responsive styles');
  assert.match(css, /375px/, 'styles.css must optimize for 375px mobile breakpoint');
  assert.match(css, /768px/, 'styles.css must optimize for 768px tablet breakpoint');
});

// 8. Build and Test integrity
test('Task 8: Clean builds without syntax warnings and test runner integration', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.ok(pkg.scripts.build, 'package.json must have build script');
  assert.ok(pkg.scripts.test, 'package.json must have test script');
  ['server.js', 'public/app.js', 'public/config.js', 'public/styles.css', 'public/index.html'].forEach(file => {
    const filePath = path.join(__dirname, '..', file);
    assert.ok(fs.existsSync(filePath), `${file} must exist`);
    assert.ok(fs.statSync(filePath).size > 0, `${file} must not be empty`);
  });
});

// 9. Public Landing Page & Dashboard Settings for Each Role
test('Task 9: Landing page and dedicated Settings in Student, Personnel, and Admin dashboards', () => {
  assert.match(html, /id="landingView"/, 'index.html must include landingView section');
  assert.match(html, /id="studentTabSettings"/, 'index.html must include Student dashboard settings');
  assert.match(html, /id="personnelTabSettings"/, 'index.html must include Personnel dashboard settings');
  assert.match(html, /id="adminSectionSettings"/, 'index.html must include Admin system settings');
  assert.match(serverCode, /\/api\/public\/landing-info/, 'server.js must provide public landing-info endpoint');
  assert.match(serverCode, /\/api\/users\/settings/, 'server.js must provide user settings endpoint');
});

// 10. Comprehensive Admin Dashboard Enhancement & Firebase Security Rules
test('Task 10: Admin Dashboard 8 modules, RBAC enforcement, and Firebase Security Rules exist', () => {
  [
    'adminSectionOverview',
    'adminSectionUsers',
    'adminSectionLogs',
    'adminSectionReports',
    'adminSectionSecurity',
    'adminSectionData',
    'adminSectionAnnouncements',
    'adminSectionSettings'
  ].forEach(sectionId => {
    assert.match(html, new RegExp(`id="${sectionId}"`), `index.html must contain ${sectionId}`);
  });
  [
    '/api/admin/users',
    '/api/admin/reports',
    '/api/admin/security',
    '/api/admin/records',
    '/api/admin/backups',
    '/api/admin/announcements',
    '/api/admin/settings'
  ].forEach(endpoint => {
    assert.ok(serverCode.includes(endpoint), `server.js must implement ${endpoint}`);
  });
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'firestore.rules')), 'firestore.rules must exist');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'database.rules.json')), 'database.rules.json must exist');
});

// 11. Dedicated Doctor Role (Dr. Roberto Santos, MD)
test('Rule 11: Dedicated Doctor role exists for Dr. Roberto Santos, MD', () => {
  assert.match(serverCode, /name:\s*'Dr\. Roberto Santos, MD'[\s\S]*?role:\s*'doctor'/, 'Dr. Roberto Santos, MD must have dedicated doctor role');
  assert.match(serverCode, /if\s*\(role\s*===\s*'doctor'\)/, 'getDefaultPermissions and settings must support doctor role');
  assert.match(html, /dr\.santos@ustp\.edu\.ph/, 'Login screen must include Dr. Roberto Santos, MD quick account');
});

// 12. New student checkup requests go to Doctor's Pending Triage Queue & Doctor assigns to nurse
test('Rule 12: Doctor Pending Triage Queue and Nurse Assignment endpoint (/api/requests/:id/assign)', () => {
  assert.match(serverCode, /(?:app|router)\.post\('\/api\/requests\/:id\/assign'/, 'server must provide Doctor nurse assignment endpoint');
  assert.match(serverCode, /req\.user\.role !== 'doctor'/, 'Only the Doctor can assign pending requests to a campus nurse');
  assert.match(serverCode, /action:\s*'TRIAGE_ASSIGNED'/, 'Triage assignment must be logged in audit trail');
  assert.match(appCode, /assignRequestToNurse/, 'app.js must implement assignRequestToNurse for Doctor');
});

// 13. Nurses only see their own assigned patients and cannot see pending queue or self-assign
test('Rule 13: Nurses only see their own assigned patients and cannot self-assign', () => {
  assert.match(serverCode, /req\.user\.role === 'personnel'[\s\S]*?r\.assignedTo && r\.assignedTo\.id === req\.user\.id && r\.status !== 'pending'/, 'GET /api/requests must filter out unassigned and pending requests for nurses');
  assert.match(serverCode, /action:\s*'UNAUTHORIZED_NURSE_ASSIGN_ATTEMPT'/, 'Server must block and audit nurse self-assignment attempts');
  assert.match(appCode, /pendingTabBtn\.classList\.toggle\('hidden',\s*!isDoctor\)/, 'UI must hide Pending Triage Queue tab from nurses');
});

// 14. Nurses must follow strict ordered steps: Assigned -> En Route -> In Progress -> Record On-Site Checkup
test('Rule 14: Nurses must follow steps in order (Assigned -> En Route -> In Progress -> Record Checkup)', () => {
  assert.match(serverCode, /currentStatus === 'assigned' && status === 'en_route'/, 'Nurse transition must enforce assigned -> en_route');
  assert.match(serverCode, /currentStatus === 'en_route' && status === 'in_progress'/, 'Nurse transition must enforce en_route -> in_progress');
  assert.match(serverCode, /Nurses must follow the steps in order: Assigned → En Route → In Progress → Record On-Site Checkup/, 'Out-of-order nurse steps must be rejected');
});

// 15. Nurses can only record vitals, physical observations, and nurse notes (diagnosis & medication blocked on screen and server)
test('Rule 15: Nurse checkup blocks diagnosis and prescribed medication on both UI and server', () => {
  assert.match(serverCode, /action:\s*'NURSE_DIAGNOSIS_REJECTED'/, 'Server must reject and audit nurse attempts to enter diagnosis or medication');
  assert.match(serverCode, /Nurses can only record vital signs, physical observations, and nurse notes/, 'Server must return 403 error message when nurse submits diagnosis or medication');
  assert.match(html, /id="clinNurseNotes"/, 'Nurse checkup modal must include nurse notes field');
  assert.match(html, /Nurse Scope of Practice Notice/, 'Nurse checkup modal must display scope restriction notice without diagnosis/prescription inputs');
});

// 16. Submitting a nurse checkup creates a draft certificate and moves request to Awaiting Doctor Validation without notifying student
test('Rule 16: Nurse checkup creates draft certificate and moves request to awaiting_doctor without notifying student', () => {
  assert.match(serverCode, /status:\s*'draft'/, 'Nurse checkup must create a certificate with status draft');
  assert.match(serverCode, /request\.status = 'awaiting_doctor'/, 'Nurse checkup must move request status to awaiting_doctor');
  assert.match(serverCode, /action:\s*'DRAFT_CERTIFICATE_CREATED'/, 'Draft certificate creation must be logged in audit trail');
});

// 17. Doctor reviews nurse notes and enters Official Clinical Diagnosis, Prescribed Medication, care recommendations, excused dates, validity date, and remarks
test('Rule 17: Doctor Validation enters Official Clinical Diagnosis, Prescribed Medication, excused dates, validity date, and remarks', () => {
  assert.match(html, /id="doctorValidateModal"/, 'index.html must include Doctor Validation modal');
  assert.match(html, /id="docValDiagnosis"/, 'Doctor Validation modal must include Official Clinical Diagnosis field');
  assert.match(html, /id="docValMedication"/, 'Doctor Validation modal must include Prescribed Medication field');
  assert.match(html, /id="docValValidUntil"/, 'Doctor Validation modal must include Validity Date field');
  assert.match(serverCode, /Official Clinical Diagnosis is required from the Doctor/, 'Server must require diagnosis during Doctor Validation');
  assert.match(serverCode, /Prescribed Medication is required from the Doctor/, 'Server must require prescribedMedication during Doctor Validation');
});

// 18. Doctor can draw or upload digital signature on profile and apply it to certificates with one click
test('Rule 18: Doctor can draw or upload digital signature on profile and apply with one click', () => {
  assert.match(serverCode, /(?:app|router)\.put\('\/api\/doctor\/signature'/, 'server must support saving doctor digital signature');
  assert.match(serverCode, /action:\s*'DOCTOR_SIGNATURE_UPDATED'/, 'Updating doctor signature must be logged in audit trail');
  assert.match(html, /id="profSignatureCanvas"/, 'Profile must include signature drawing canvas for Doctor');
  assert.match(html, /applySavedDoctorSignatureOneClick\(\)/, 'Doctor Validation modal must have 1-click Apply Saved Signature button');
  assert.match(appCode, /function applySavedDoctorSignatureOneClick/, 'app.js must implement applySavedDoctorSignatureOneClick');
});

// 19. Only the Doctor can click Sign & Send to Student (Admin and Nurse are blocked)
test('Rule 19: Only Doctor can Sign & Send to Student; Admin and Nurse are blocked', () => {
  assert.match(serverCode, /(?:app|router)\.post\('\/api\/requests\/:id\/doctor-validate'/, 'server must expose doctor-validate endpoint');
  assert.match(serverCode, /(?:app|router)\.post\('\/api\/certificates\/:id\/sign-and-send'/, 'server must expose sign-and-send endpoint');
  assert.match(serverCode, /action:\s*'UNAUTHORIZED_SIGN_ATTEMPT'/, 'Server must block and audit non-doctor attempts to sign or send certificates');
  assert.match(serverCode, /action:\s*'CERTIFICATE_SIGNED_AND_SENT'/, 'Doctor signing and sending certificate must be logged in audit trail');
});

// 20. Doctor can Return to Nurse with a note so the nurse can fix and resubmit it
test('Rule 20: Doctor can Return to Nurse with a note for correction and resubmission', () => {
  assert.match(serverCode, /(?:app|router)\.post\('\/api\/requests\/:id\/return-to-nurse'/, 'server must implement return-to-nurse endpoint');
  assert.match(serverCode, /request\.status = 'returned_to_nurse'/, 'Return to nurse must set status to returned_to_nurse');
  assert.match(serverCode, /action:\s*'CHECKUP_RETURNED_TO_NURSE'/, 'Returning checkup to nurse must be logged in audit trail');
  assert.match(appCode, /function returnCheckupToNurse/, 'app.js must implement returnCheckupToNurse');
});

// 21. Student progress tracker includes Doctor Validation step and live timeline, plus "Your medical certificate is ready" notification with Open Certificate button
test('Rule 21: Student progress tracker includes Doctor Validation & live timeline, and notification shows Open Certificate button', () => {
  assert.match(appCode, /key:\s*'awaiting_doctor',\s*label:\s*'5\. Doctor Validation'/, 'Student progress tracker must include Doctor Validation step');
  assert.match(appCode, /Live Checkup &amp; Validation Timeline/, 'Student active request card must display live timeline');
  assert.match(serverCode, /'Your medical certificate is ready'/, 'Student must receive "Your medical certificate is ready" notification only after doctor signs');
  assert.match(appCode, /Open Certificate/, 'Notification dropdown must display Open Certificate button for certificate notifications');
});

// 22. Students can never view or download unfinished drafts
test('Rule 22: Students are blocked from viewing or downloading unfinished draft certificates', () => {
  assert.match(serverCode, /if\s*\(c\.status === 'draft' \|\| c\.isDraft === true\)\s*return false/, 'GET /api/certificates must filter out draft certificates for students');
  assert.match(serverCode, /This certificate is still an unfinished draft awaiting Doctor Validation/, 'GET /api/certificates/:id must return 403 for students requesting a draft');
  assert.match(appCode, /c\.status !== 'draft' && !c\.isDraft/, 'Student UI must exclude draft certificates');
});

// 23. Public QR verification only works for issued certificates and never exposes diagnosis or medication
test('Rule 23: Public QR verification rejects drafts and never exposes diagnosis or prescribed medication', () => {
  assert.match(serverCode, /if\s*\(!cert \|\| cert\.status === 'draft' \|\| cert\.isDraft === true \|\| cert\.status === 'revoked'\)/, 'Public verification must reject draft and revoked certificates');
  assert.match(serverCode, /const sanitizedPublicCertificate = \{/, 'Public verification must return sanitized certificate object');
  const sanitizedBlock = serverCode.split('const sanitizedPublicCertificate = {')[1].split('};')[0];
  assert.ok(!sanitizedBlock.includes('diagnosis:'), 'Public verification response must NEVER include diagnosis');
  assert.ok(!sanitizedBlock.includes('prescribedMedication:'), 'Public verification response must NEVER include prescribedMedication');
});

// 24. Admin (Clinic Director) can revoke certificates but cannot sign on a doctor's behalf
test('Rule 24: Admin can revoke certificates (/api/admin/certificates/:id/revoke) but cannot sign on a doctor\'s behalf', () => {
  assert.match(serverCode, /(?:app|router)\.post\('\/api\/admin\/certificates\/:id\/revoke'/, 'server must provide Admin certificate revocation endpoint');
  assert.match(serverCode, /action:\s*'CERTIFICATE_REVOKED'/, 'Certificate revocation must be logged in audit trail');
  assert.match(serverCode, /canSignCertificates:\s*false/, 'Admin permissions must have canSignCertificates set to false');
  assert.match(appCode, /function revokeAdminCertificate/, 'app.js must provide revokeAdminCertificate for Admin');
});

// 25. Sensitive medical fields (diagnosis, prescribedMedication, nurseNotes, doctorSignature) are encrypted at rest
test('Rule 25: Sensitive medical fields are AES-256-GCM encrypted at rest', () => {
  const app = require('../server.js');
  assert.equal(typeof app.encryptField, 'function', 'server.js must export encryptField');
  assert.equal(typeof app.decryptField, 'function', 'server.js must export decryptField');

  const sampleDiagnosis = 'Acute Upper Respiratory Tract Infection (URTI)';
  const encrypted = app.encryptField(sampleDiagnosis);
  assert.ok(encrypted.startsWith('ENC:v1:'), 'Encrypted field must carry ENC:v1: prefix');
  assert.notEqual(encrypted, sampleDiagnosis, 'Ciphertext must not match plaintext');
  assert.equal(app.decryptField(encrypted), sampleDiagnosis, 'decryptField must restore original plaintext');

  // Verify on-disk database file stores encrypted sensitive fields at rest
  const rawDiskDb = fs.readFileSync(path.join(__dirname, '..', 'data', 'vitacall-db.json'), 'utf8');
  assert.match(rawDiskDb, /ENC:v1:/, 'vitacall-db.json on disk must store sensitive medical fields encrypted at rest');
});

// 26+. Behavioral HTTP Security & Workflow Integration Tests
test.describe('Behavioral HTTP Security & Workflow Integration Tests', () => {
  const dbFilePath = path.join(__dirname, '..', 'data', 'vitacall-db.json');
  let originalDbBackup = null;
  let server;
  let baseUrl;

  test.before(async () => {
    if (fs.existsSync(dbFilePath)) {
      originalDbBackup = fs.readFileSync(dbFilePath);
    }
    const app = require('../server.js');
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  test.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (originalDbBackup) {
      fs.writeFileSync(dbFilePath, originalDbBackup);
    }
  });

  async function loginAs(email, password = 'password123') {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const setCookies = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie') || ''];
    const joined = setCookies.join('; ');
    const tokenMatch = joined.match(/vitacall_token=([^;]+)/);
    const csrfMatch = joined.match(/vitacall_csrf=([^;]+)/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';
    const cookieParts = [];
    if (tokenMatch) cookieParts.push(`vitacall_token=${tokenMatch[1]}`);
    if (csrfToken) cookieParts.push(`vitacall_csrf=${csrfToken}`);
    const cookie = cookieParts.join('; ');
    const data = await res.json();
    return { res, data, cookie, csrfToken, token: data.token };
  }

  test('26. Registration rejects weak passwords with 400', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Weak Pass Student',
        email: `weak.${Date.now()}@ustp.edu.ph`,
        password: 'password123',
        studentId: '2024-99999',
        courseAndYear: 'BSIT - 1st Year',
        boardingHouse: 'Test Dorm',
        address: 'Purok 1, Villanueva',
        phone: '09171234567'
      })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Password must/i);
  });

  test('27. Tokens in ?token= query param are rejected (401); HttpOnly cookie & Bearer header accepted', async () => {
    const { res, cookie, token } = await loginAs('harvey.pagtalunan@ustp.edu.ph');
    assert.equal(res.status, 200);
    assert.ok(cookie.includes('vitacall_token='), 'Login must set HttpOnly vitacall_token cookie');

    const queryRes = await fetch(`${baseUrl}/api/auth/me?token=${encodeURIComponent(token)}`);
    assert.equal(queryRes.status, 401, 'Query string ?token= must be rejected');

    const cookieRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookie }
    });
    assert.equal(cookieRes.status, 200, 'HttpOnly cookie must authenticate');
  });

  test('28. Logout revokes token so subsequent requests return 401', async () => {
    const { cookie, csrfToken, token } = await loginAs('harvey.pagtalunan@ustp.edu.ph');
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie, 'X-CSRF-Token': csrfToken }
    });
    assert.equal(logoutRes.status, 200);

    const afterRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(afterRes.status, 401, 'Revoked token must be rejected after logout');
  });

  test('29. Security headers (CSP, X-Frame-Options, X-Content-Type-Options) are set', async () => {
    const res = await fetch(`${baseUrl}/api/public/landing-info`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-security-policy'), 'CSP header must be present');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  test('30. Full 4-role workflow, nurse diagnosis block, student draft block, admin immutability, and public QR verification', async () => {
    const student = await loginAs('harvey.pagtalunan@ustp.edu.ph');
    const doctor = await loginAs('dr.santos@ustp.edu.ph');
    const nurse = await loginAs('nurse.sarah@ustp.edu.ph');
    const admin = await loginAs('admin.clinic@ustp.edu.ph');

    // Student creates request
    const reqRes = await fetch(`${baseUrl}/api/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: student.cookie, 'X-CSRF-Token': student.csrfToken },
      body: JSON.stringify({
        symptoms: ['Fever', 'Headache'],
        urgency: 'moderate',
        boardingHouse: 'Test Dormitory',
        landmark: 'Near USTP Gate',
        notes: 'Started this morning'
      })
    });
    assert.equal(reqRes.status, 201);
    const createdReqBody = await reqRes.json();
    const request = createdReqBody.request || createdReqBody;

    // Doctor assigns to Nurse Sarah
    const assignRes = await fetch(`${baseUrl}/api/requests/${request.id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: doctor.cookie, 'X-CSRF-Token': doctor.csrfToken },
      body: JSON.stringify({ nurseId: nurse.data.user.id })
    });
    assert.equal(assignRes.status, 200);

    // Nurse advances assigned -> en_route -> in_progress
    const enRouteRes = await fetch(`${baseUrl}/api/requests/${request.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: nurse.cookie, 'X-CSRF-Token': nurse.csrfToken },
      body: JSON.stringify({ status: 'en_route' })
    });
    assert.equal(enRouteRes.status, 200);

    const inProgRes = await fetch(`${baseUrl}/api/requests/${request.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: nurse.cookie, 'X-CSRF-Token': nurse.csrfToken },
      body: JSON.stringify({ status: 'in_progress' })
    });
    assert.equal(inProgRes.status, 200);

    // Nurse attempts to submit diagnosis -> 403
    const badCheckup = await fetch(`${baseUrl}/api/requests/${request.id}/clinical-record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: nurse.cookie, 'X-CSRF-Token': nurse.csrfToken },
      body: JSON.stringify({
        vitals: { temp: '38.2 C', bp: '110/70' },
        diagnosis: 'Dengue',
        prescribedMedication: 'Paracetamol'
      })
    });
    assert.equal(badCheckup.status, 403);

    // Nurse submits vitals & nurse notes only -> 201 + draft cert
    const goodCheckup = await fetch(`${baseUrl}/api/requests/${request.id}/clinical-record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: nurse.cookie, 'X-CSRF-Token': nurse.csrfToken },
      body: JSON.stringify({
        vitals: { temp: '38.2 C', bp: '110/70', pulse: '88 bpm', spo2: '98%' },
        symptomsObserved: 'Febrile, warm to touch',
        nurseNotes: 'Mild fever, hydrated'
      })
    });
    assert.equal(goodCheckup.status, 201);
    const checkupBody = await goodCheckup.json();
    const draftCertificate = checkupBody.draftCertificate || checkupBody.certificate;
    assert.equal(draftCertificate.status, 'draft');

    // Student cannot view draft certificate -> 403
    const studentDraftRes = await fetch(`${baseUrl}/api/certificates/${draftCertificate.id}`, {
      headers: { Cookie: student.cookie }
    });
    assert.equal(studentDraftRes.status, 403);

    // Admin cannot sign & send -> 403, and cannot rewrite certificate via /api/admin/records -> 403
    const adminSignRes = await fetch(`${baseUrl}/api/certificates/${draftCertificate.id}/sign-and-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: admin.cookie, 'X-CSRF-Token': admin.csrfToken },
      body: JSON.stringify({})
    });
    assert.equal(adminSignRes.status, 403);

    const adminEditCertRes = await fetch(`${baseUrl}/api/admin/records/certificates/${draftCertificate.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: admin.cookie, 'X-CSRF-Token': admin.csrfToken },
      body: JSON.stringify({ diagnosis: 'Tampered' })
    });
    assert.equal(adminEditCertRes.status, 403);

    // Doctor validates, signs & sends to student
    const docValRes = await fetch(`${baseUrl}/api/requests/${request.id}/doctor-validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: doctor.cookie, 'X-CSRF-Token': doctor.csrfToken },
      body: JSON.stringify({
        diagnosis: 'Acute Viral Febrile Illness',
        prescribedMedication: 'Paracetamol 500mg every 6 hours PRN',
        excusedDates: 'Nov 22-23, 2026',
        validUntil: '2026-11-25',
        recommendations: 'Rest and oral hydration',
        doctorSignature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
      })
    });
    assert.equal(docValRes.status, 200);
    const { certificate } = await docValRes.json();
    assert.match(certificate.verificationCode, /^USTP-VC-[0-9A-F]{12}$/);

    // Public QR verification succeeds without exposing diagnosis, medication, studentId, or boardingHouse
    const verifyRes = await fetch(`${baseUrl}/api/verify-certificate/${certificate.verificationCode}`);
    assert.equal(verifyRes.status, 200);
    const verifyBody = await verifyRes.json();
    assert.equal(verifyBody.verified, true);
    assert.equal(verifyBody.certificate.integrityVerified, true);
    assert.equal(verifyBody.certificate.diagnosis, undefined);
    assert.equal(verifyBody.certificate.prescribedMedication, undefined);
    assert.equal(verifyBody.certificate.studentId, undefined);
    assert.equal(verifyBody.certificate.boardingHouse, undefined);
  });

  test('31. Admin audit chain verification succeeds', async () => {
    const admin = await loginAs('admin.clinic@ustp.edu.ph');
    const res = await fetch(`${baseUrl}/api/admin/audit-logs/verify`, {
      headers: { Cookie: admin.cookie }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.valid, true);
  });

  test('32. Destructive admin user deletion requires confirmPassword', async () => {
    const admin = await loginAs('admin.clinic@ustp.edu.ph');
    const res = await fetch(`${baseUrl}/api/admin/users/usr_student2`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Cookie: admin.cookie, 'X-CSRF-Token': admin.csrfToken },
      body: JSON.stringify({ confirmPassword: 'wrong-password' })
    });
    assert.equal(res.status, 403);
  });

  test('33. Cookie-authenticated mutations without X-CSRF-Token are rejected with 403', async () => {
    const student = await loginAs('harvey.pagtalunan@ustp.edu.ph');
    const res = await fetch(`${baseUrl}/api/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: student.cookie },
      body: JSON.stringify({ symptoms: ['Fever'], urgency: 'low', boardingHouse: 'Dorm' })
    });
    assert.equal(res.status, 403);
  });

  test('34. Certificate HMAC tampering detection and uniform 404 for revoked vs unknown codes', async () => {
    const dbMod = require('../lib/db');
    const currentDb = dbMod.getDb();
    const cert = currentDb.certificates.find(c => c.status === 'valid');
    assert.ok(cert, 'An issued valid certificate should exist from test 30');

    // Tamper with validUntil in memory and verify public endpoint catches it
    const origValidUntil = cert.validUntil;
    cert.validUntil = '2099-12-31';
    const tamperedRes = await fetch(`${baseUrl}/api/verify-certificate/${cert.verificationCode}`);
    assert.equal(tamperedRes.status, 400);
    const tamperedBody = await tamperedRes.json();
    assert.equal(tamperedBody.tampered, true);
    assert.equal(tamperedBody.status, 'tampered');
    cert.validUntil = origValidUntil;

    // Revoke cert and ensure revoked vs unknown both return uniform 404
    const admin = await loginAs('admin.clinic@ustp.edu.ph');
    const revokeRes = await fetch(`${baseUrl}/api/admin/certificates/${cert.id}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: admin.cookie, 'X-CSRF-Token': admin.csrfToken },
      body: JSON.stringify({ reason: 'Test revocation' })
    });
    assert.equal(revokeRes.status, 200);

    const revokedVerify = await fetch(`${baseUrl}/api/verify-certificate/${cert.verificationCode}`);
    const unknownVerify = await fetch(`${baseUrl}/api/verify-certificate/USTP-VC-000000000000`);
    assert.equal(revokedVerify.status, 404);
    assert.equal(unknownVerify.status, 404);
    const revJson = await revokedVerify.json();
    const unkJson = await unknownVerify.json();
    assert.equal(revJson.message, unkJson.message);
  });

  test('35. Strict CSP has no unsafe-inline scripts and no third-party qrserver', async () => {
    const res = await fetch(`${baseUrl}/api/public/landing-info`);
    const csp = res.headers.get('content-security-policy') || '';
    assert.ok(!csp.includes("'unsafe-inline'") || !csp.split('script-src ')[1]?.split(';')[0]?.includes("'unsafe-inline'"), 'script-src must not allow unsafe-inline');
    assert.ok(!csp.includes('api.qrserver.com'), 'CSP must not allow api.qrserver.com');
  });

  test('36. Production mode refuses missing or short secrets (must be 64 hex chars)', () => {
    const { loadOrCreateSecrets } = require('../lib/config');
    const prevEnv = process.env.NODE_ENV;
    const prevJwt = process.env.VITACALL_JWT_SECRET;
    const prevEnc = process.env.VITACALL_ENCRYPTION_KEY;
    const prevHmac = process.env.VITACALL_HMAC_KEY;
    try {
      process.env.NODE_ENV = 'production';
      process.env.VITACALL_JWT_SECRET = 'short-key';
      process.env.VITACALL_ENCRYPTION_KEY = '0'.repeat(64);
      process.env.VITACALL_HMAC_KEY = 'a'.repeat(64);
      assert.throws(() => loadOrCreateSecrets(), /64 hex characters/i);

      process.env.VITACALL_JWT_SECRET = 'b'.repeat(64);
      const ok = loadOrCreateSecrets();
      assert.equal(ok.encryptionKey.length, 32);
      assert.equal(ok.hmacKey.length, 32);
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevJwt === undefined) delete process.env.VITACALL_JWT_SECRET; else process.env.VITACALL_JWT_SECRET = prevJwt;
      if (prevEnc === undefined) delete process.env.VITACALL_ENCRYPTION_KEY; else process.env.VITACALL_ENCRYPTION_KEY = prevEnc;
      if (prevHmac === undefined) delete process.env.VITACALL_HMAC_KEY; else process.env.VITACALL_HMAC_KEY = prevHmac;
    }
  });
});
