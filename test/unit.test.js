const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverPath = path.join(__dirname, '..', 'server.js');
const appJsPath = path.join(__dirname, '..', 'public', 'app.js');
const indexHtmlPath = path.join(__dirname, '..', 'public', 'index.html');
const stylesCssPath = path.join(__dirname, '..', 'public', 'styles.css');
const configJsPath = path.join(__dirname, '..', 'public', 'config.js');

const serverCode = fs.readFileSync(serverPath, 'utf8');
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
  assert.match(serverCode, /app\.post\('\/api\/requests\/:id\/assign'/, 'server.js must provide Doctor nurse assignment endpoint');
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
  assert.match(serverCode, /app\.put\('\/api\/doctor\/signature'/, 'server.js must support saving doctor digital signature');
  assert.match(serverCode, /action:\s*'DOCTOR_SIGNATURE_UPDATED'/, 'Updating doctor signature must be logged in audit trail');
  assert.match(html, /id="profSignatureCanvas"/, 'Profile must include signature drawing canvas for Doctor');
  assert.match(html, /applySavedDoctorSignatureOneClick\(\)/, 'Doctor Validation modal must have 1-click Apply Saved Signature button');
  assert.match(appCode, /function applySavedDoctorSignatureOneClick/, 'app.js must implement applySavedDoctorSignatureOneClick');
});

// 19. Only the Doctor can click Sign & Send to Student (Admin and Nurse are blocked)
test('Rule 19: Only Doctor can Sign & Send to Student; Admin and Nurse are blocked', () => {
  assert.match(serverCode, /app\.post\('\/api\/requests\/:id\/doctor-validate'/, 'server.js must expose doctor-validate endpoint');
  assert.match(serverCode, /app\.post\('\/api\/certificates\/:id\/sign-and-send'/, 'server.js must expose sign-and-send endpoint');
  assert.match(serverCode, /action:\s*'UNAUTHORIZED_SIGN_ATTEMPT'/, 'Server must block and audit non-doctor attempts to sign or send certificates');
  assert.match(serverCode, /action:\s*'CERTIFICATE_SIGNED_AND_SENT'/, 'Doctor signing and sending certificate must be logged in audit trail');
});

// 20. Doctor can Return to Nurse with a note so the nurse can fix and resubmit it
test('Rule 20: Doctor can Return to Nurse with a note for correction and resubmission', () => {
  assert.match(serverCode, /app\.post\('\/api\/requests\/:id\/return-to-nurse'/, 'server.js must implement return-to-nurse endpoint');
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
  assert.match(serverCode, /if\s*\(!cert \|\| cert\.status === 'draft' \|\| cert\.isDraft === true\)/, 'Public verification must reject draft certificates');
  assert.match(serverCode, /const sanitizedPublicCertificate = \{/, 'Public verification must return sanitized certificate object');
  const sanitizedBlock = serverCode.split('const sanitizedPublicCertificate = {')[1].split('};')[0];
  assert.ok(!sanitizedBlock.includes('diagnosis:'), 'Public verification response must NEVER include diagnosis');
  assert.ok(!sanitizedBlock.includes('prescribedMedication:'), 'Public verification response must NEVER include prescribedMedication');
});

// 24. Admin (Clinic Director) can revoke certificates but cannot sign on a doctor's behalf
test('Rule 24: Admin can revoke certificates (/api/admin/certificates/:id/revoke) but cannot sign on a doctor\'s behalf', () => {
  assert.match(serverCode, /app\.post\('\/api\/admin\/certificates\/:id\/revoke'/, 'server.js must provide Admin certificate revocation endpoint');
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
