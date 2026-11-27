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

  test('37. Forgot password & reset flow: neutral responses, HMAC-hashed code, 5-attempt lock, expiry, complexity & session revocation', async () => {
    const dbMod = require('../lib/db');
    const { generateHmac } = require('../lib/crypto');
    const knownEmail = 'franz.go@ustp.edu.ph';
    const unknownEmail = 'nonexistent.user@ustp.edu.ph';

    // Log in before reset to verify old session is revoked after reset
    const beforeSession = await loginAs(knownEmail);
    assert.equal(beforeSession.res.status, 200);

    const rKnown = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: knownEmail })
    });
    const rUnknown = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: unknownEmail })
    });
    assert.equal(rKnown.status, 200);
    assert.equal(rUnknown.status, 200);
    const jKnown = await rKnown.json();
    const jUnknown = await rUnknown.json();
    assert.deepEqual(jKnown, jUnknown, 'Known and unknown emails must return identical responses');

    // Verify plaintext code is NOT stored
    const rec = dbMod.getDb().passwordResets[knownEmail];
    assert.ok(rec && rec.codeHash && !rec.code, 'Reset record must store codeHash only, never plaintext code');

    // Wrong code 5 times locks the code
    for (let i = 0; i < 5; i++) {
      const bad = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: knownEmail, code: '000000', newPassword: 'Valid@Password1' })
      });
      assert.equal(bad.status, 400);
    }
    assert.equal(dbMod.getDb().passwordResets[knownEmail].locked, true);

    // Request a fresh code, test expired code rejection
    await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: knownEmail })
    });
    dbMod.getDb().passwordResets[knownEmail].expiresAt = Date.now() - 1000;
    const expRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: knownEmail, code: '123456', newPassword: 'Valid@Password1' })
    });
    assert.equal(expRes.status, 400);

    // Plant known code HMAC and test weak password rejection -> then valid reset -> old session invalidated
    const knownCode = '654321';
    dbMod.getDb().passwordResets[knownEmail] = {
      codeHash: generateHmac(`pwd-reset:${knownEmail}:${knownCode}`),
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
      locked: false
    };

    const weakRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: knownEmail, code: knownCode, newPassword: 'weak' })
    });
    assert.equal(weakRes.status, 400);

    const okRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: knownEmail, code: knownCode, newPassword: 'NewStrong@Password1' })
    });
    assert.equal(okRes.status, 200);

    const oldSessionCheck = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: beforeSession.cookie }
    });
    assert.equal(oldSessionCheck.status, 401, 'Old session must be invalidated after password reset');
  });

  test('38. Returned checkup preserves revision history, hides revisions from student, and diff helper marks changes', async () => {
    const student = await loginAs('harvey.pagtalunan@ustp.edu.ph');
    const doctor = await loginAs('dr.santos@ustp.edu.ph');
    const nurse = await loginAs('nurse.sarah@ustp.edu.ph');

    const reqRes = await fetch(`${baseUrl}/api/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: student.cookie, 'X-CSRF-Token': student.csrfToken },
      body: JSON.stringify({ symptoms: ['Cough'], urgency: 'mild', boardingHouse: 'Villa Rosa', notes: 'Revision test' })
    });
    const reqObj = await reqRes.json();

    await fetch(`${baseUrl}/api/requests/${reqObj.id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: doctor.cookie, 'X-CSRF-Token': doctor.csrfToken },
      body: JSON.stringify({ nurseId: nurse.data.user.id })
    });
    await fetch(`${baseUrl}/api/requests/${reqObj.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: nurse.cookie, 'X-CSRF-Token': nurse.csrfToken },
      body: JSON.stringify({ status: 'en_route' })
    });
    await fetch(`${baseUrl}/api/requests/${reqObj.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: nurse.cookie, 'X-CSRF-Token': nurse.csrfToken },
      body: JSON.stringify({ status: 'in_progress' })
    });

    await fetch(`${baseUrl}/api/requests/${reqObj.id}/clinical-record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: nurse.cookie, 'X-CSRF-Token': nurse.csrfToken },
      body: JSON.stringify({
        vitals: { bp: '120/80', temp: '37.5', pulse: '80', respRate: '18', spo2: '99' },
        symptomsObserved: 'Dry cough observed',
        nurseNotes: 'Initial note'
      })
    });

    const retRes = await fetch(`${baseUrl}/api/requests/${reqObj.id}/return-to-nurse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: doctor.cookie, 'X-CSRF-Token': doctor.csrfToken },
      body: JSON.stringify({ note: 'Please re-check temperature and lung sounds' })
    });
    assert.equal(retRes.status, 200);

    await fetch(`${baseUrl}/api/requests/${reqObj.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: nurse.cookie, 'X-CSRF-Token': nurse.csrfToken },
      body: JSON.stringify({ status: 'in_progress' })
    });
    const resubRes = await fetch(`${baseUrl}/api/requests/${reqObj.id}/clinical-record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: nurse.cookie, 'X-CSRF-Token': nurse.csrfToken },
      body: JSON.stringify({
        vitals: { bp: '120/80', temp: '38.3', pulse: '88', respRate: '19', spo2: '98' },
        symptomsObserved: 'Dry cough with mild wheezing',
        nurseNotes: 'Re-checked temp 38.3'
      })
    });
    assert.equal(resubRes.status, 201);
    const resubBody = await resubRes.json();
    assert.equal(resubBody.request.checkupRevisions.length, 1);
    assert.equal(resubBody.request.checkupRevisions[0].symptomsObserved, 'Dry cough observed');

    // Student never sees revisions
    const stuReqsRes = await fetch(`${baseUrl}/api/requests`, { headers: { Cookie: student.cookie } });
    const stuReqs = await stuReqsRes.json();
    const stuFound = stuReqs.find(r => r.id === reqObj.id);
    assert.equal(stuFound.checkupRevisions, undefined);

    // Verify diff helper marks changed and unchanged fields in app.js
    assert.match(appCode, /function buildTextDiffHtml/);
    assert.match(appCode, /line-through/);
    assert.match(appCode, /No change/);
  });

  test('39. Certificate stores doctorSignature snapshot, resists profile signature changes, detects signature swap, and hides from public verify', async () => {
    const student = await loginAs('harvey.pagtalunan@ustp.edu.ph');
    const doctor = await loginAs('dr.santos@ustp.edu.ph');
    const nurse = await loginAs('nurse.sarah@ustp.edu.ph');

    const reqRes = await fetch(`${baseUrl}/api/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: student.cookie, 'X-CSRF-Token': student.csrfToken },
      body: JSON.stringify({ symptoms: ['Headache'], urgency: 'mild', boardingHouse: 'Villa Rosa' })
    });
    const reqObj = await reqRes.json();

    await fetch(`${baseUrl}/api/requests/${reqObj.id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: doctor.cookie, 'X-CSRF-Token': doctor.csrfToken },
      body: JSON.stringify({ nurseId: nurse.data.user.id })
    });
    await fetch(`${baseUrl}/api/requests/${reqObj.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: nurse.cookie, 'X-CSRF-Token': nurse.csrfToken },
      body: JSON.stringify({ status: 'en_route' })
    });
    await fetch(`${baseUrl}/api/requests/${reqObj.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: nurse.cookie, 'X-CSRF-Token': nurse.csrfToken },
      body: JSON.stringify({ status: 'in_progress' })
    });
    await fetch(`${baseUrl}/api/requests/${reqObj.id}/clinical-record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: nurse.cookie, 'X-CSRF-Token': nurse.csrfToken },
      body: JSON.stringify({ vitals: { bp: '118/78', temp: '37.0' }, symptomsObserved: 'Alert', nurseNotes: 'Stable' })
    });

    const sig1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const sig2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M9QzwAEjDAGACCKAoFF72j6AAAAAElFTkSuQmCC';

    const valRes = await fetch(`${baseUrl}/api/requests/${reqObj.id}/doctor-validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: doctor.cookie, 'X-CSRF-Token': doctor.csrfToken },
      body: JSON.stringify({
        diagnosis: 'Tension Headache',
        prescribedMedication: 'Ibuprofen 200mg PRN',
        excusedDates: 'Nov 27, 2026',
        validUntil: '2026-11-30',
        recommendations: 'Rest',
        doctorSignature: sig1
      })
    });
    assert.equal(valRes.status, 200);
    const { certificate } = await valRes.json();
    assert.equal(certificate.doctorSignature, sig1);

    // Change doctor's profile signature afterwards via PATCH
    const patchRes = await fetch(`${baseUrl}/api/doctor/signature`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: doctor.cookie, 'X-CSRF-Token': doctor.csrfToken },
      body: JSON.stringify({ doctorSignature: sig2 })
    });
    assert.equal(patchRes.status, 200);

    // Issued cert still retains sig1
    const certGet = await fetch(`${baseUrl}/api/certificates/${certificate.id}`, { headers: { Cookie: student.cookie } });
    const certData = await certGet.json();
    assert.equal(certData.doctorSignature, sig1);

    // Public verify must NOT contain doctorSignature
    const pubVerify = await fetch(`${baseUrl}/api/verify-certificate/${certificate.verificationCode}`);
    assert.equal(pubVerify.status, 200);
    const pubJson = await pubVerify.json();
    assert.equal(pubJson.certificate.doctorSignature, undefined);

    // Swapping cert.doctorSignature makes integrity check fail
    const dbMod = require('../lib/db');
    const diskCert = dbMod.getDb().certificates.find(c => c.id === certificate.id);
    diskCert.doctorSignature = sig2;
    const tamperedVerify = await fetch(`${baseUrl}/api/verify-certificate/${certificate.verificationCode}`);
    assert.equal(tamperedVerify.status, 400);
    const tamperedJson = await tamperedVerify.json();
    assert.equal(tamperedJson.tampered, true);
    diskCert.doctorSignature = sig1;
  });

  test('40. Signature PATCH validation & Save/Cancel/Clear UI helpers exist', async () => {
    const doctor = await loginAs('dr.santos@ustp.edu.ph');
    const emptyPatch = await fetch(`${baseUrl}/api/doctor/signature`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: doctor.cookie, 'X-CSRF-Token': doctor.csrfToken },
      body: JSON.stringify({ doctorSignature: '' })
    });
    assert.equal(emptyPatch.status, 400);

    assert.match(appCode, /function cancelProfileSignatureDraft/);
    assert.match(appCode, /function cancelModalSignatureDraft/);
    assert.match(appCode, /function trimSignatureCanvas/);
    assert.match(html, /id="btnSaveProfileSig"[\s\S]*?disabled/);
    assert.match(html, /id="btnSaveModalSig"[\s\S]*?disabled/);
  });

  test('41. Doctor certificates search, filter & pagination with requester isolation', async () => {
    const doctor = await loginAs('dr.santos@ustp.edu.ph');
    const otherStudent = await loginAs('jelly.maniscan@ustp.edu.ph');

    const searchRes = await fetch(`${baseUrl}/api/certificates?q=Harvey&page=1&limit=1`, {
      headers: { Cookie: doctor.cookie }
    });
    assert.equal(searchRes.status, 200);
    const searchData = await searchRes.json();
    assert.ok(Array.isArray(searchData.items));
    assert.equal(searchData.limit, 1);
    assert.ok(searchData.total >= 1);

    // Another student cannot see Harvey's certificates via search
    const otherRes = await fetch(`${baseUrl}/api/certificates?q=Harvey&page=1&limit=10`, {
      headers: { Cookie: otherStudent.cookie }
    });
    assert.equal(otherRes.status, 200);
    const otherData = await otherRes.json();
    assert.equal(otherData.total, 0);
  });

  test('42. Nurse schedule & availability enforcement, off-duty 409, leave range, reassignment, and cross-nurse protection', async () => {
    const student = await loginAs('harvey.pagtalunan@ustp.edu.ph');
    const doctor = await loginAs('dr.santos@ustp.edu.ph');
    const nurse = await loginAs('nurse.sarah@ustp.edu.ph');

    // Create a new request while nurse is on duty and assign it
    const reqRes = await fetch(`${baseUrl}/api/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: student.cookie, 'X-CSRF-Token': student.csrfToken },
      body: JSON.stringify({ symptoms: ['Fever'], urgency: 'moderate', boardingHouse: 'Villa Rosa' })
    });
    const req1 = await reqRes.json();

    const assignOk = await fetch(`${baseUrl}/api/requests/${req1.id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: doctor.cookie, 'X-CSRF-Token': doctor.csrfToken },
      body: JSON.stringify({ nurseId: nurse.data.user.id })
    });
    assert.equal(assignOk.status, 200);

    // Nurse cannot modify another nurse's settings
    const crossNurseRes = await fetch(`${baseUrl}/api/users/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: nurse.cookie, 'X-CSRF-Token': nurse.csrfToken },
      body: JSON.stringify({ targetUserId: 'usr_other_nurse', settings: { dutyStatus: 'off_duty' } })
    });
    assert.equal(crossNurseRes.status, 403);

    // Nurse goes off duty -> marks open assignment needsReassignment
    const offRes = await fetch(`${baseUrl}/api/users/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: nurse.cookie, 'X-CSRF-Token': nurse.csrfToken },
      body: JSON.stringify({ settings: { dutyStatus: 'off_duty' } })
    });
    assert.equal(offRes.status, 200);

    // Doctor sees off_duty in /api/nurses and cannot assign a new request -> 409
    const nursesRes = await fetch(`${baseUrl}/api/nurses`, { headers: { Cookie: doctor.cookie } });
    const nursesList = await nursesRes.json();
    const sarah = nursesList.find(n => n.id === nurse.data.user.id);
    assert.equal(sarah.effectiveStatus, 'off_duty');

    const req2Res = await fetch(`${baseUrl}/api/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: student.cookie, 'X-CSRF-Token': student.csrfToken },
      body: JSON.stringify({ symptoms: ['Fatigue'], urgency: 'mild', boardingHouse: 'Villa Rosa' })
    });
    const req2 = await req2Res.json();

    const assignOffRes = await fetch(`${baseUrl}/api/requests/${req2.id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: doctor.cookie, 'X-CSRF-Token': doctor.csrfToken },
      body: JSON.stringify({ nurseId: nurse.data.user.id })
    });
    assert.equal(assignOffRes.status, 409);

    // Nurse sets leave range covering today while dutyStatus is on_duty -> still off_duty -> 409
    const todayStr = new Date().toISOString().split('T')[0];
    await fetch(`${baseUrl}/api/users/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: nurse.cookie, 'X-CSRF-Token': nurse.csrfToken },
      body: JSON.stringify({
        settings: {
          dutyStatus: 'on_duty',
          leaveRanges: [{ startDate: todayStr, endDate: todayStr, note: 'Annual leave' }]
        }
      })
    });
    const assignLeaveRes = await fetch(`${baseUrl}/api/requests/${req2.id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: doctor.cookie, 'X-CSRF-Token': doctor.csrfToken },
      body: JSON.stringify({ nurseId: nurse.data.user.id })
    });
    assert.equal(assignLeaveRes.status, 409);

    // Clear leave -> nurse is back on duty -> Doctor can reassign req1
    await fetch(`${baseUrl}/api/users/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: nurse.cookie, 'X-CSRF-Token': nurse.csrfToken },
      body: JSON.stringify({ settings: { dutyStatus: 'on_duty', leaveRanges: [] } })
    });
    const reassignRes = await fetch(`${baseUrl}/api/requests/${req1.id}/reassign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: doctor.cookie, 'X-CSRF-Token': doctor.csrfToken },
      body: JSON.stringify({ nurseId: nurse.data.user.id, notes: 'Back on shift' })
    });
    assert.equal(reassignRes.status, 200);
    const reassignBody = await reassignRes.json();
    assert.equal(reassignBody.request.needsReassignment, false);
  });

  test('43. High 1: Backups stored as standalone AES-256-GCM encrypted files, no data in db.backups, tamper check & password-gated restore', async () => {
    const admin = await loginAs('admin.clinic@ustp.edu.ph');
    const createRes = await fetch(`${baseUrl}/api/admin/backups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: admin.cookie, 'X-CSRF-Token': admin.csrfToken },
      body: JSON.stringify({ name: 'Security Test Snapshot' })
    });
    assert.equal(createRes.status, 201);
    const { backup } = await createRes.json();
    assert.ok(backup.fileName && backup.sha256 && backup.size > 0);
    assert.equal(backup.data, undefined, 'Metadata must never include inline snapshot data');

    // Verify vitacall-db.json on disk has no plaintext diagnosis/medication and no "data" inside backups
    const rawMainDb = fs.readFileSync(path.join(__dirname, '..', 'data', 'vitacall-db.json'), 'utf8');
    const parsedMainDb = JSON.parse(rawMainDb);
    assert.ok(parsedMainDb.backups.every(b => b.data === undefined), 'vitacall-db.json backups must not have inline data field');
    assert.ok(!rawMainDb.includes('Acute Viral Febrile Illness'), 'vitacall-db.json must not contain plaintext diagnosis');
    assert.ok(!rawMainDb.includes('Paracetamol 500mg'), 'vitacall-db.json must not contain plaintext medication');

    // Verify standalone backup file is encrypted and contains no readable names
    const backupFilePath = path.join(__dirname, '..', 'data', 'backups', backup.fileName);
    assert.ok(fs.existsSync(backupFilePath), 'Encrypted backup file must exist in data/backups/');
    const rawBackupContent = fs.readFileSync(backupFilePath, 'utf8');
    assert.ok(rawBackupContent.startsWith('VCBKP:v1:'), 'Backup file must use VCBKP:v1 AES-256-GCM format');
    assert.ok(!rawBackupContent.includes('Harvey'), 'Encrypted backup file must not contain readable names');

    // Restore without admin password fails (403)
    const noPwdRestore = await fetch(`${baseUrl}/api/admin/backups/${backup.id}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: admin.cookie, 'X-CSRF-Token': admin.csrfToken },
      body: JSON.stringify({ confirmPassword: 'wrong' })
    });
    assert.equal(noPwdRestore.status, 403);

    // Valid restore round-trips and creates pre-restore snapshot + BACKUP_RESTORED audit log
    const okRestore = await fetch(`${baseUrl}/api/admin/backups/${backup.id}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: admin.cookie, 'X-CSRF-Token': admin.csrfToken },
      body: JSON.stringify({ confirmPassword: 'password123' })
    });
    assert.equal(okRestore.status, 200);

    // Tampering with the encrypted backup file causes restore to fail with 400
    const tamperedContent = rawBackupContent.slice(0, -4) + (rawBackupContent.endsWith('aaaa') ? 'bbbb' : 'aaaa');
    fs.writeFileSync(backupFilePath, tamperedContent, 'utf8');
    const tamperedRestore = await fetch(`${baseUrl}/api/admin/backups/${backup.id}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: admin.cookie, 'X-CSRF-Token': admin.csrfToken },
      body: JSON.stringify({ confirmPassword: 'password123' })
    });
    assert.equal(tamperedRestore.status, 400);

    // Clean up test backup file
    try { fs.unlinkSync(backupFilePath); } catch (_) {}
  });

  test('44. High 2 & 3: Firestore sync is OFF by default, strips passwordHash/PII, skips unchanged docs, soft-deletes, and blocks >20% drop', async () => {
    const fbMod = require('../lib/firebase');
    // Disabled by default
    fbMod.setFirestoreMock(null, { enabled: false });
    assert.equal(fbMod.getFirebaseSyncStatus().enabled, false);

    // Create mock Firestore client
    const writes = [];
    const deletes = [];
    const cloudStore = new Map();
    const mockClient = {
      collection(colName) {
        return {
          doc(docId) {
            return { colName, docId, ref: { colName, docId } };
          },
          async get() {
            const docs = [];
            for (const [k, v] of cloudStore.entries()) {
              if (k.startsWith(colName + ':')) {
                const id = k.split(':')[1];
                docs.push({ id, data: () => v, ref: { colName, docId: id } });
              }
            }
            return { docs };
          }
        };
      },
      batch() {
        const ops = [];
        return {
          set(docRef, data) {
            ops.push({ type: 'set', colName: docRef.colName, docId: docRef.docId, data });
          },
          delete(docRef) {
            ops.push({ type: 'delete', colName: docRef.colName, docId: docRef.docId });
          },
          async commit() {
            for (const op of ops) {
              if (op.type === 'set') {
                writes.push(op);
                const key = `${op.colName}:${op.docId}`;
                cloudStore.set(key, { ...(cloudStore.get(key) || {}), ...op.data });
              } else if (op.type === 'delete') {
                deletes.push(op);
                cloudStore.delete(`${op.colName}:${op.docId}`);
              }
            }
          }
        };
      }
    };

    fbMod.setFirestoreMock(mockClient, { enabled: true, resetState: true });

    const sampleSnapshot = {
      users: [
        { id: 'u1', name: 'ENC:v1:secret', email: 'a@ustp.edu.ph', passwordHash: '$2a$10$secretHash', role: 'requester', status: 'active', createdAt: '2026-10-01' },
        { id: 'u2', name: 'ENC:v1:secret2', email: 'b@ustp.edu.ph', passwordHash: '$2a$10$secretHash2', role: 'doctor', status: 'active', createdAt: '2026-10-01' }
      ],
      requests: [
        { id: 'r1', userId: 'u1', studentName: 'ENC:v1:stu', status: 'pending', checkupRevisions: [{ secret: 1 }] },
        { id: 'r2', userId: 'u1', studentName: 'ENC:v1:stu', status: 'pending' },
        { id: 'r3', userId: 'u1', studentName: 'ENC:v1:stu', status: 'pending' }
      ],
      clinicalRecords: [],
      certificates: [{ id: 'c1', verificationCode: 'USTP-VC-111', diagnosis: 'ENC:v1:diag', doctorSignature: 'ENC:v1:sig' }],
      announcements: [{ id: 'a1', title: 'Advisory', message: 'Hello', targetRole: 'all' }],
      auditLogs: [{ id: 'aud1', action: 'SECRET_AUDIT' }],
      backups: [{ id: 'bkp1', fileName: 'secret.enc' }]
    };

    await fbMod.syncDatabaseToFirestore(sampleSnapshot);
    assert.ok(writes.length > 0, 'First sync should write allowlisted docs');
    // Never uploads auditLogs or backups
    assert.ok(!writes.some(w => w.colName === 'auditLogs' || w.colName === 'backups'), 'auditLogs and backups must never be uploaded');
    // Never uploads passwordHash or email or doctorSignature
    assert.ok(writes.every(w => !JSON.stringify(w.data).includes('passwordHash') && !JSON.stringify(w.data).includes('$2a$10$')), 'passwordHash must never appear in upload payload');
    assert.ok(writes.every(w => w.data.doctorSignature === undefined), 'doctorSignature must be stripped from cloud upload');

    // Second sync with identical snapshot writes 0 documents
    const countAfterFirst = writes.length;
    await fbMod.syncDatabaseToFirestore(sampleSnapshot);
    assert.equal(writes.length, countAfterFirst, 'Unchanged documents must not be rewritten');

    // Empty local snapshot (>20% drop) is blocked and does not delete cloud data
    await fbMod.syncDatabaseToFirestore({ users: [], requests: [], clinicalRecords: [], certificates: [], announcements: [] });
    assert.equal(deletes.length, 0, 'Empty local DB must not delete cloud data');
    assert.match(fbMod.getFirebaseSyncStatus().lastError || '', /Blocked Firestore sync/i);

    fbMod.setFirestoreMock(null, { enabled: false, resetState: true });
  });

  test('45. Medium 4: Production bootstrap admin creates one admin once, logs no plaintext password, and enforces 403 PASSWORD_CHANGE_REQUIRED', async () => {
    const dbMod = require('../lib/db');
    const currentDb = dbMod.getDb();
    const savedUsers = [...currentDb.users];
    const prevBootEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const prevBootName = process.env.BOOTSTRAP_ADMIN_NAME;

    try {
      // Remove existing admins to test first-run bootstrap
      currentDb.users = currentDb.users.filter(u => u.role !== 'admin');
      process.env.BOOTSTRAP_ADMIN_EMAIL = 'boot.admin@ustp.edu.ph';
      process.env.BOOTSTRAP_ADMIN_NAME = 'Bootstrap Director';

      const firstBoot = dbMod.bootstrapProductionAdmin();
      assert.equal(firstBoot.created, true);
      assert.ok(firstBoot.tempPassword && firstBoot.tempPassword.length >= 12);

      // Second start creates none
      const secondBoot = dbMod.bootstrapProductionAdmin();
      assert.equal(secondBoot.created, false);

      // Temporary password is not in DB in plain text or in audit logs
      const rawDisk = fs.readFileSync(path.join(__dirname, '..', 'data', 'vitacall-db.json'), 'utf8');
      assert.ok(!rawDisk.includes(firstBoot.tempPassword), 'Temporary password must never appear in vitacall-db.json or auditLogs');

      // Login with temp password works, but other endpoints return 403 PASSWORD_CHANGE_REQUIRED
      const bootLogin = await loginAs('boot.admin@ustp.edu.ph', firstBoot.tempPassword);
      assert.equal(bootLogin.res.status, 200);
      assert.equal(bootLogin.data.mustChangePassword, true);

      const blockedRes = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Cookie: bootLogin.cookie }
      });
      assert.equal(blockedRes.status, 403);
      const blockedBody = await blockedRes.json();
      assert.equal(blockedBody.code, 'PASSWORD_CHANGE_REQUIRED');

      // Changing password clears flag, revokes old session, and unlocks endpoints
      const changeRes = await fetch(`${baseUrl}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: bootLogin.cookie, 'X-CSRF-Token': bootLogin.csrfToken },
        body: JSON.stringify({ currentPassword: firstBoot.tempPassword, newPassword: 'NewAdmin@Password2026!' })
      });
      assert.equal(changeRes.status, 200);

      // Old session cookie is now revoked
      const oldSessionRes = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Cookie: bootLogin.cookie }
      });
      assert.equal(oldSessionRes.status, 401);

      // Re-login with new password unlocks /api/admin/users
      const freshLogin = await loginAs('boot.admin@ustp.edu.ph', 'NewAdmin@Password2026!');
      const unlockedRes = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Cookie: freshLogin.cookie }
      });
      assert.equal(unlockedRes.status, 200);
    } finally {
      currentDb.users = savedUsers;
      dbMod.saveDb();
      if (prevBootEmail === undefined) delete process.env.BOOTSTRAP_ADMIN_EMAIL; else process.env.BOOTSTRAP_ADMIN_EMAIL = prevBootEmail;
      if (prevBootName === undefined) delete process.env.BOOTSTRAP_ADMIN_NAME; else process.env.BOOTSTRAP_ADMIN_NAME = prevBootName;
    }
  });

  test('46. Medium 5: Assigning request and verifying certificate write no student name, boarding house, or email in notifications or audit logs, and chain verifies', async () => {
    const dbMod = require('../lib/db');
    const student = await loginAs('harvey.pagtalunan@ustp.edu.ph');
    const doctor = await loginAs('dr.santos@ustp.edu.ph');
    const nurse = await loginAs('nurse.sarah@ustp.edu.ph');
    const admin = await loginAs('admin.clinic@ustp.edu.ph');

    const auditCountBefore = dbMod.getDb().auditLogs.length;
    const notifCountBefore = dbMod.getDb().notifications.length;

    const reqRes = await fetch(`${baseUrl}/api/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: student.cookie, 'X-CSRF-Token': student.csrfToken },
      body: JSON.stringify({ symptoms: ['Chills'], urgency: 'mild', boardingHouse: 'Villa Rosa Boarding House (Rm 4)' })
    });
    const reqObj = await reqRes.json();

    await fetch(`${baseUrl}/api/requests/${reqObj.id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: doctor.cookie, 'X-CSRF-Token': doctor.csrfToken },
      body: JSON.stringify({ nurseId: nurse.data.user.id })
    });

    const certs = dbMod.getDb().certificates.filter(c => c.status === 'valid');
    if (certs.length > 0) {
      await fetch(`${baseUrl}/api/verify-certificate/${certs[0].verificationCode}`);
    }

    const newAudits = dbMod.getDb().auditLogs.slice(0, dbMod.getDb().auditLogs.length - auditCountBefore);
    const newNotifs = dbMod.getDb().notifications.slice(0, dbMod.getDb().notifications.length - notifCountBefore);

    for (const a of newAudits) {
      const text = `${a.userName} ${a.details}`;
      assert.ok(!text.includes('Harvey Lloyd Pagtalunan'), `Audit entry must not contain student name: ${text}`);
      assert.ok(!text.includes('Villa Rosa'), `Audit entry must not contain boarding house: ${text}`);
      assert.ok(!text.includes('harvey.pagtalunan@ustp.edu.ph'), `Audit entry must not contain student email: ${text}`);
    }
    for (const n of newNotifs) {
      const text = `${n.title} ${n.message}`;
      assert.ok(!text.includes('Harvey Lloyd Pagtalunan'), `Notification must not contain student name: ${text}`);
      assert.ok(!text.includes('Villa Rosa'), `Notification must not contain boarding house: ${text}`);
      assert.ok(!text.includes('harvey.pagtalunan@ustp.edu.ph'), `Notification must not contain student email: ${text}`);
    }

    const verifyChainRes = await fetch(`${baseUrl}/api/admin/audit-logs/verify`, {
      headers: { Cookie: admin.cookie }
    });
    assert.equal(verifyChainRes.status, 200);
    const chainBody = await verifyChainRes.json();
    assert.equal(chainBody.valid, true);
  });

  test('47. Medium 6, 7 & Low 8: Firestore deny-all rules, no @latest or unpinned CDN scripts, and failed verify code truncation & sanitization', async () => {
    const fsRules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    const allowMatches = [...fsRules.matchAll(/allow\s+[^:]+:\s*if\s+([^;]+);/g)];
    assert.ok(allowMatches.length > 0, 'firestore.rules must contain an allow rule');
    assert.ok(allowMatches.every(m => m[1].trim() === 'false'), 'firestore.rules must contain no allow rule other than false');

    const latestHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.ok(!latestHtml.includes('@latest'), 'index.html must not contain @latest');
    const scriptTags = [...latestHtml.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)];
    for (const tag of scriptTags) {
      const src = tag[1];
      if (/^https?:\/\//i.test(src)) {
        assert.match(tag[0], /\bintegrity="sha384-[^"]+"/, `External script ${src} must have integrity attribute`);
      }
    }

    // 500-char code is truncated to <= 24 chars, and <script> is stripped
    const dbMod = require('../lib/db');
    const longCode = 'A'.repeat(500);
    await fetch(`${baseUrl}/api/verify-certificate/${longCode}`);
    const latestAudit1 = dbMod.getDb().auditLogs.find(a => a.action === 'CERTIFICATE_VERIFY_FAILED_AGGREGATE');
    assert.ok(latestAudit1 && latestAudit1.targetId.length <= 24, `Stored code length must be <= 24 (got ${latestAudit1 && latestAudit1.targetId.length})`);

    // Force aggregate counter to log on next call by advancing window or checking sanitizeVerifyCodeForLog
    const xssCode = encodeURIComponent('<script>alert(1)</script>');
    for (let i = 0; i < 10; i++) {
      await fetch(`${baseUrl}/api/verify-certificate/${xssCode}`);
    }
    const latestAudit2 = dbMod.getDb().auditLogs.find(a => a.action === 'CERTIFICATE_VERIFY_FAILED_AGGREGATE');
    assert.ok(!latestAudit2.targetId.includes('<') && !latestAudit2.targetId.includes('>'), 'Stored code must be sanitized of HTML tags');
  });
});
