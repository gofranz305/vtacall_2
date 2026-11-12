# VitaCall: Mobile-Accessible Health Request & Monitoring System
### University of Science and Technology of Southern Philippines (USTP) — Villanueva Campus
**Project Proposal Implementation — Group 1**  
*Submitted To: Ms. Norvilyn M. Malingin & Ms. Trisha B. Posadas*  
*Submitted By: Betco, Venus | Datu-imam, Baby Manis | Go, Franz Clyde Rian | Maniscan, Jelly Quen | Pagtalunan, Harvey Lloyd*

---

## 🌟 Overview

**VitaCall** is a secure, responsive, mobile-first web application designed for college students living in boarding houses and dormitories in Villanueva, Misamis Oriental. When students fall ill with acute conditions (fever, flu, gastroenteritis), they often lack transportation, energy, or companions to visit the campus clinic. 

VitaCall bridges this gap by allowing students to request on-site boarding house checkups, enabling campus health personnel to triage, travel, examine, and issue **tamper-resistant, verifiable digital medical certificates**.

---

## 🚀 Quick Start

The app is currently running live on port `3000`.

- **Web Application URL:** [http://localhost:3000](http://localhost:3000)

### To run manually:
```bash
npm install
npm start
```

### To run tests and build checks:
```bash
# Run unit test suite
npm test
# Or using the ng CLI shim:
./ng test

# Run build / syntax compilation check
npm run build
# Or using the ng CLI shim:
./ng build
```

---

## ✨ Features & Recent Improvements

1. **Interactive In-App Notifications**:
   - Each notification is clickable, marking it as read and navigating to the relevant destination (e.g., student checkup request, issued medical certificates, or personnel triage queue).
   - Target route stored directly on each notification object (`targetRoute`).

2. **Official Medical Certificate Viewer**:
   - Dedicated Close (`X`) button and `Esc` keyboard shortcut to dismiss the certificate preview and return to the prior screen.
   - Non-blocking print action with print-optimized CSS layout.

3. **Role-Based Access Control (RBAC) & Audit Protection**:
   - Students cannot view or access the Security Audit Trail in menus, mobile navigation, or routes.
   - Server-side `requireRole('admin')` middleware enforces access control on `/api/admin/audit-logs`.

4. **Async Loading States & Simulated Delay**:
   - Async/await loading states with animated spinners on login, registration, logout, checkup request submissions, and clinical records.
   - Centralized delay constant `APP_LOADING_DELAY_MS = 1000` (1 second) in `public/config.js` for easy configuration.
   - Form buttons disabled during requests to prevent duplicate submissions.

5. **Profile Picture Management**:
   - Upload and change profile photo from the profile view with square cropping (256x256).
   - Validates file types (JPG, PNG, WebP) and 2 MB size limits.
   - Displays avatar in header navigation and profile view, falling back to role-colored initials.
   - Persisted as compressed data URLs in the user profile document.

6. **Accessible Login & Logout Dialogs**:
   - Accessible confirmation modal on logout with focus management and `Esc` key handling.
   - Visual toast feedback on successful login ("Welcome back, <name>"), logout ("You have been logged out"), and actions.
   - Explicit inline error alerts on invalid credentials.

7. **Design Polish & WCAG AA Accessibility**:
   - Responsive design verified across mobile (375px), tablet (768px), and desktop breakpoints.
   - High-contrast color tokens and WCAG AA-compliant `:focus-visible` outlines.
   - Skeleton loading placeholders and smooth transitions.

---

## 🔐 Separate Accounts & Authentication

VitaCall features individual accounts and session management:

### 1. Account Sign In (`#authView`)
- Users sign in with their unique USTP email and password.
- Convenient **Quick Test Account Pills** are provided on the login card for instant testing during thesis defense / code review:
  - 🎓 **Harvey Lloyd Pagtalunan** (Student): `harvey.pagtalunan@ustp.edu.ph` / `password123`
  - 🎓 **Franz Clyde Rian Go** (Student): `franz.go@ustp.edu.ph` / `password123`
  - 🩺 **Nurse Sarah Alcantara, RN** (Health Personnel): `nurse.sarah@ustp.edu.ph` / `password123`
  - 🛡️ **Dr. Eleanor Reyes, MD** (Clinic Director / Admin): `admin.clinic@ustp.edu.ph` / `password123`

### 2. Student Registration Tab
- Boarding students can create an account by filling in:
  - Full Name, USTP Student ID, USTP Email, Password.
  - Course & Year Level, Contact Phone Number.
  - Boarding House Name & Room #, Complete Villanueva Street Address, Landmark & Gate Instructions.
  - Emergency Contact Person & Phone Number.

### 3. Log Out Functionality
- Clicking the **Log Out** button (available in the desktop header, profile view, and mobile navigation):
  - Sends a secure request to `POST /api/auth/logout`.
  - Logs the `USER_LOGOUT` event with timestamp and IP in the Information Assurance audit trail.
  - Clears the JWT session and cached data from `localStorage`.
  - Returns to the clean Sign In / Registration portal.

---

## 👤 Editable User Profile (`#viewProfile`)

Users have a dedicated **Profile View** to update their details:

- **For Students**:
  - Full Name
  - Contact Phone Number
  - Student ID & Course / Year Level
  - Boarding House Name & Room #
  - Complete Street / Purok / Barangay Address
  - Landmarks & Gate Directions
  - Emergency Contact Person & Phone Number
  - Optional Password Update
- **For Health Personnel & Admin**:
  - Full Name
  - Contact Phone Number
  - Official Designation / Title
  - PRC License Number
  - Optional Password Update
- Updates are saved via `PUT /api/users/profile`, persisted to disk, and logged in the system audit trail (`PROFILE_UPDATED`).

---

## 📱 Fully Responsive Web Design

- **Mobile Phones (360px - 600px)**:
  - Mobile bottom navigation bar (Home, Requests, (+) FAB Checkup, Profile, Admin).
  - Touch-friendly tap targets and collapsible cards.
  - Safe area inset padding for notch displays.
- **Tablets & Laptops (768px - 1024px)**:
  - Adaptive grids for triage queue and clinical intake.
  - Multi-column symptom selectors and vital sign inputs.
- **Desktop (1024px+)**:
  - Header navigation links with user avatar, name, and role pill.
  - Side-by-side surveillance analytics, boarding house density maps, and audit tables.

---

## 📄 Official Printable USTP Medical Certificate

- Authentic USTP Villanueva crest, Republic of the Philippines letterhead, and official clinic watermark seal.
- Comprehensive examination report, clinical diagnosis, vital signs summary, and excused absence recommendation for academic consideration.
- Attending nurse and campus physician signature lines with PRC license numbers.
- Print-optimized CSS (`@media print`) that formats the certificate for physical printing or saving as a PDF.
- *(Note: The separate "Verify Slip" navigation tab has been removed as requested, keeping verification integrated within issued certificates).*

---

## 🛠️ Codebase Structure

```
vitacall/
├── data/
│   └── vitacall-db.json          # Persistent JSON database with pre-seeded USTP data
├── public/
│   ├── assets/
│   │   ├── ustp-logo.svg         # Official USTP Villanueva emblem
│   │   └── clinic-seal.svg       # Health & Wellness Center official seal
│   ├── app.js                    # Reactive state, auth, profile & workflows
│   ├── config.js                 # Shared frontend configuration & delay constants
│   ├── index.html                # Responsive mobile-first UI & accessible modals
│   └── styles.css                # Tailwind styling, skeletons, WCAG tokens & print CSS
├── test/
│   └── unit.test.js              # Unit tests for all 8 task capabilities
├── package.json                  # Dependencies & test/build scripts
├── README.md                     # Documentation
├── server.js                     # Express REST API, auth, crypto & audit engine
└── ng.cmd / ng                   # Cross-platform CLI shims for ng build and ng test
```
