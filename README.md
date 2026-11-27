# VitaCall: Mobile-Accessible Health Request & Monitoring System
### University of Science and Technology of Southern Philippines (USTP) — Villanueva Campus
**Project Proposal Implementation — Group 1**  
*Submitted To: Ms. Norvilyn M. Malingin & Ms. Trisha B. Posadas*  
*Submitted By: Betco, Venus | Datu-imam, Baby Manis | Go, Franz Clyde Rian | Maniscan, Jelly Quen | Pagtalunan, Harvey Lloyd*

---

## 🌟 Overview

**VitaCall** is a secure, responsive, mobile-first web application designed for college students living in boarding houses and dormitories in Villanueva, Misamis Oriental. When students fall ill with acute conditions (fever, flu, gastroenteritis), they often lack transportation, energy, or companions to visit the campus clinic.

VitaCall bridges this gap by allowing students to request on-site boarding house checkups, routing requests through a **Doctor-led Triage & Validation Workflow**, enabling campus nurses to conduct on-site vitals assessments, and empowering the Campus Physician to diagnose, prescribe, digitally sign, and issue **tamper-resistant, verifiable digital medical certificates** — while providing **comprehensive system administration, AES-256 encryption at rest, security monitoring, and real-time analytics**.

---

## 🚀 Quick Start

The app runs on port `3000`.

- **Web Application URL:** [http://localhost:3000](http://localhost:3000)

### To run manually:
```bash
npm install
npm start
```

### To run tests and build checks:
```bash
# Run automated test suite (36/36 passing: 25 static/crypto checks + 11 live HTTP integration tests)
npm test

# Run build / syntax compilation check
npm run build
```

---

## 🩺 1. Role Model & End-to-End Checkup Workflow

### 👨‍⚕️ Campus Doctor (`role: 'doctor'` — Dr. Roberto Santos, MD)
- **Pending Triage Queue & Nurse Assignment**: New student checkup requests arrive in the Doctor's **Pending Triage Queue**, where the doctor reviews symptoms/urgency and assigns the request to an active Campus Nurse (`POST /api/requests/:id/assign`).
- **Clinical Validation, Diagnosis & Prescription**: Reviews the nurse's on-site checkup findings (vital signs, physical observations, and nurse notes) and enters the **Official Clinical Diagnosis**, **Prescribed Medication**, care recommendations, excused dates, certificate validity date, and physician remarks.
- **Digital Signature Pad (Draw, Upload & 1-Click Apply)**: The doctor can draw or upload their digital signature on their Profile (`#profSignatureCanvas`) and apply it to certificates with one click (`applySavedDoctorSignatureOneClick()`).
- **Sign & Send to Student**: Only the doctor can click **Sign & Send to Student** (`POST /api/requests/:id/doctor-validate` / `POST /api/certificates/:id/sign-and-send`), which seals the final certificate with a keyed HMAC-SHA256 integrity hash (re-verified on view and public QR lookup), generates the official QR code, marks the request complete, and sends the notification to the student.
- **Return to Nurse**: If corrections are needed on the nurse's checkup findings, the doctor can click **Return to Nurse** (`POST /api/requests/:id/return-to-nurse`) with a revision note so the nurse can fix and resubmit the checkup.

### 🩺 Campus Nurse / Health Personnel (`role: 'personnel'` — Nurse Sarah Alcantara, RN)
- **Assigned Patients Only**: Nurses only see their own assigned patients (`GET /api/requests`); they cannot view the pending triage queue or assign requests to themselves.
- **Strict Step-by-Step Field Workflow**: Nurses must follow the steps in strict order:
  1. **Assigned** →
  2. **En Route** →
  3. **In Progress** →
  4. **Record On-Site Checkup** (`POST /api/requests/:id/clinical-record`).
- **Scope of Practice Enforcement (UI & Server)**: During the on-site checkup, nurses can only record **vital signs**, **physical observations**, and **nurse notes**. They are blocked on both the screen and the server (`403 Forbidden` + `NURSE_DIAGNOSIS_REJECTED` audit log) from entering a clinical diagnosis or prescribing medication.
- **Draft Certificate Creation**: Submitting a checkup creates a **draft certificate** (`status: 'draft'`) and moves the request to **Awaiting Doctor Validation** (`status: 'awaiting_doctor'`). The student is not notified yet and cannot view the draft.

### 🎓 Student / Requester (`role: 'requester'` — Harvey Lloyd Pagtalunan)
- **6-Step Progress Tracker & Live Timeline**: The student's active request tracker includes the **Doctor Validation** step (`Request Received` → `Nurse Assigned` → `En Route` → `On-Site Checkup` → `Doctor Validation` → `Completed`) along with a live timestamped timeline.
- **Instant Notification with Open Certificate Button**: Students only receive the `"Your medical certificate is ready"` notification (featuring an **Open Certificate** button) after the doctor signs and sends it.
- **Draft Protection & Direct A4 PDF Download**: Students can never view or download unfinished drafts. Once signed and issued, every student certificate includes a **Download PDF** button that generates a complete, high-resolution A4 PDF certificate.

### 🛡️ Admin / Clinic Director (`role: 'admin'` — Mr. Franz Cruz)
- **Full Oversight & Certificate Revocation**: Retains full oversight across all 8 Admin Console modules (Overview & Analytics, User Management, Immutable Audit Logs, Reports & Exports, Security Management, Data & Backups, Announcements, and System Settings) plus **Certificate Revocation** (`POST /api/admin/certificates/:id/revoke`).
- **Separation of Duties**: Administrators cannot sign or send medical certificates on a doctor's behalf (`403 Forbidden` + `UNAUTHORIZED_SIGN_ATTEMPT` audit log).

---

## 🔒 2. Security, Encryption at Rest & Reliability

- **AES-256-GCM Encryption at Rest**: Sensitive medical fields — including `diagnosis`, `prescribedMedication`, `prescriptionAndCare`, `nurseNotes`, `symptomsObserved`, and `doctorSignature` — are encrypted at rest (`ENC:v1:...`) in `data/vitacall-db.json` using AES-256-GCM.
- **Privacy-Preserving Public QR Verification (`GET /api/verify-certificate/:code`)**: Public verification only succeeds for doctor-signed, valid certificates (rejecting drafts and revoked certificates) and **never** exposes clinical diagnosis, prescribed medication, vitals, or nurse notes.
- **Tamper-Evident Audit Trail**: Every major action (`TRIAGE_ASSIGNED`, `UNAUTHORIZED_NURSE_ASSIGN_ATTEMPT`, `NURSE_DIAGNOSIS_REJECTED`, `DRAFT_CERTIFICATE_CREATED`, `DOCTOR_VALIDATED_CHECKUP`, `CERTIFICATE_SIGNED_AND_SENT`, `CHECKUP_RETURNED_TO_NURSE`, `DOCTOR_SIGNATURE_UPDATED`, `CERTIFICATE_REVOKED`, `UNAUTHORIZED_SIGN_ATTEMPT`, `BACKUP_RESTORED`, `BOOTSTRAP_ADMIN_CREATED`) is recorded with a keyed HMAC-SHA256 hash chain in the immutable audit trail (with automatic archival when exceeding 1,000 entries). *Note: Existing historical audit entries are kept untouched so their cryptographic HMAC hash chain remains verifiable, while all new audit entries and notifications scrub personal names, emails, phones, and boarding house addresses in favor of record IDs.*
- **Standalone Encrypted Backups**: Database snapshots (`POST /api/admin/backups` and scheduled automatic backups) are stored as standalone whole-file **AES-256-GCM** encrypted `.enc` files (`mode 0o600`) inside `data/backups/`, with only metadata and SHA-256 checksums kept in `vitacall-db.json`. Restoring requires administrator password re-entry, verifies the SHA-256 hash and GCM auth tag, and creates an automatic pre-restore safety backup first.
- **Automated Test Suite**: 48/48 tests in `test/unit.test.js` covering RBAC, CSRF, strict self-hosted CSP, HMAC tampering detection, standalone encrypted backups, non-destructive Firestore sync, production admin bootstrap, PII redaction, and nurse schedule enforcement.

---

## 🚀 3. First-Run Production Bootstrap

In production (`NODE_ENV=production`), VitaCall refuses to start unless `VITACALL_JWT_SECRET`, `VITACALL_ENCRYPTION_KEY`, and `VITACALL_HMAC_KEY` are all set to 64-character hex keys, and does **not** seed demo accounts.

To bootstrap the initial Clinic Director / Administrator on first startup:
1. Set `BOOTSTRAP_ADMIN_EMAIL` (and optionally `BOOTSTRAP_ADMIN_NAME`) in your environment before starting the server.
2. On first startup when zero admin accounts exist, VitaCall creates one admin account with `mustChangePassword=true` and prints the random one-time temporary password **once to the server console** (never written to audit logs or disk files).
3. Sign in with that temporary password; all API endpoints except `/api/auth/change-password` and `/api/auth/logout` return `403 PASSWORD_CHANGE_REQUIRED` until you set a new strong password. Subsequent restarts ignore `BOOTSTRAP_ADMIN_EMAIL`.

---

## 🛡️ 4. Privacy & Philippine Data Privacy Act (RA 10173)

Health and clinical records are classified as **Sensitive Personal Information** under the **Philippine Data Privacy Act of 2012 (Republic Act No. 10173)**.

- **Cloud Sync Disabled by Default**: Firestore cloud synchronization is **OFF by default** (`FIREBASE_SYNC_ENABLED=false`). When enabled, only allowlisted collections (`requests`, `clinicalRecords`, `certificates` in their AES-256-GCM encrypted form, `announcements`, and minimal user role metadata without password hashes or PII) are synchronized using incremental SHA-256 change detection and non-destructive soft deletes (`deletedAt`).
- **Before Enabling Cloud Sync in Production**:
  1. **Obtain Explicit Consent**: Ensure students review and accept the RA 10173 Data Privacy Consent checkbox at registration.
  2. **Data Processing Agreement (DPA)**: Execute an institutional Data Processing Agreement with your cloud provider.
  3. **Deliberate Region Selection**: Configure your cloud storage region deliberately (e.g., `asia-southeast1`) in accordance with institutional data residency policies.
  4. **DPO Approval**: Confirm deployment architecture and retention policies with your academic adviser or the University Data Protection Officer (DPO).
