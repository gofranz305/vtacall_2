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
# Run automated test suite (25/25 passing)
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
- **Sign & Send to Student**: Only the doctor can click **Sign & Send to Student** (`POST /api/requests/:id/doctor-validate` / `POST /api/certificates/:id/sign-and-send`), which seals the final certificate with a SHA-256 integrity hash, generates the official QR code, marks the request complete, and sends the notification to the student.
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
- **Tamper-Evident Audit Trail**: Every major action (`TRIAGE_ASSIGNED`, `UNAUTHORIZED_NURSE_ASSIGN_ATTEMPT`, `NURSE_DIAGNOSIS_REJECTED`, `DRAFT_CERTIFICATE_CREATED`, `DOCTOR_VALIDATED_CHECKUP`, `CERTIFICATE_SIGNED_AND_SENT`, `CHECKUP_RETURNED_TO_NURSE`, `DOCTOR_SIGNATURE_UPDATED`, `CERTIFICATE_REVOKED`, `UNAUTHORIZED_SIGN_ATTEMPT`) is recorded with a SHA-256 integrity hash in the immutable audit trail.
- **Automated Test Suite**: 25/25 unit and integration tests in `test/unit.test.js` verifying all role rules, workflow transitions, encryption at rest, and security boundaries.
