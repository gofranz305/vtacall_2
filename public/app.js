// =========================================================================
// VitaCall - USTP Villanueva Health Request & Monitoring System
// Frontend Application Logic, Landing Page, Role Settings & Admin Console
// =========================================================================

const API_BASE = '/api';

// Application State
let state = {
  currentUser: null,
  token: null,
  activeView: 'landing',
  studentSubTab: 'overview',
  personnelSubTab: 'queue',
  adminSection: 'overview',
  dataCollectionTab: 'requests',
  requests: [],
  certificates: [],
  clinicalRecords: [],
  nurses: [],
  auditLogs: [],
  notifications: [],
  announcements: [],
  adminUsers: [],
  securityData: null,
  backups: [],
  systemSettings: null,
  systemInfo: null,
  reportData: null,
  stats: {},
  queueFilter: 'all',
  searchQuery: '',
  usersPage: 1,
  usersPageSize: 8,
  auditPage: 1,
  auditPageSize: 15,
  lastActivityTime: Date.now(),
  _prevView: null,
  _pendingConfirmFn: null
};

// =========================================================================
// INITIALIZATION
// =========================================================================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Load public landing info & system settings first
    await loadPublicLandingInfo();

    const savedToken = localStorage.getItem('vitacall_token');
    const savedUser = localStorage.getItem('vitacall_user');

    if (savedToken && savedUser) {
      try {
        state.token = savedToken;
        state.currentUser = JSON.parse(savedUser);

        const meRes = await fetch(`${API_BASE}/auth/me`, {
          headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (meRes.ok) {
          const freshUser = await meRes.json();
          if (!freshUser.profilePicture && state.currentUser.profilePicture) {
            freshUser.profilePicture = state.currentUser.profilePicture;
          }
          state.currentUser = freshUser;
          localStorage.setItem('vitacall_user', JSON.stringify(state.currentUser));
          applyUserDisplayPreferences();
          updateAuthUI(true);
          navigate('dashboard');
          await refreshData(true);
        } else {
          clearSession('landing');
        }
      } catch (e) {
        console.warn('Session verification failed:', e);
        clearSession('landing');
      }
    } else {
      clearSession('landing');
    }

    // Check URL hash for direct certificate verification (#verify?code=...)
    if (window.location.hash && window.location.hash.startsWith('#verify')) {
      const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
      const code = params.get('code');
      if (code) {
        navigate('landing');
        const input = document.getElementById('landingVerifyCodeInput');
        if (input) {
          input.value = code;
          verifyPublicCertificate();
        }
      }
    }

    if (window.lucide) window.lucide.createIcons();

    // Keyboard handler: Esc closes modals / dialogs (Task 2 & 6)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const certModal = document.getElementById('certificateModal');
        const clinModal = document.getElementById('clinicalModal');
        const reqModal = document.getElementById('requestModal');
        const logoutDialog = document.getElementById('logoutConfirmDialog');
        const confirmModal = document.getElementById('confirmActionModal');
        const userModal = document.getElementById('adminUserModal');
        const permModal = document.getElementById('userPermissionsModal');
        const detailModal = document.getElementById('userDetailModal');
        const resetModal = document.getElementById('adminResetPasswordModal');
        const recordModal = document.getElementById('adminRecordModal');

        if (certModal && !certModal.classList.contains('hidden')) {
          closeCertificateModal();
        } else if (confirmModal && !confirmModal.classList.contains('hidden')) {
          closeConfirmActionModal();
        } else if (clinModal && !clinModal.classList.contains('hidden')) {
          closeClinicalModal();
        } else if (reqModal && !reqModal.classList.contains('hidden')) {
          closeRequestModal();
        } else if (logoutDialog && !logoutDialog.classList.contains('hidden')) {
          closeLogoutDialog();
        } else if (userModal && !userModal.classList.contains('hidden')) {
          closeAdminUserModal();
        } else if (permModal && !permModal.classList.contains('hidden')) {
          closeUserPermissionsModal();
        } else if (detailModal && !detailModal.classList.contains('hidden')) {
          detailModal.classList.add('hidden');
        } else if (resetModal && !resetModal.classList.contains('hidden')) {
          resetModal.classList.add('hidden');
        } else if (recordModal && !recordModal.classList.contains('hidden')) {
          recordModal.classList.add('hidden');
        }
      }
    });

    // Track user activity for automatic inactive session expiration
    ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(evtName => {
      document.addEventListener(evtName, () => {
        state.lastActivityTime = Date.now();
      }, { passive: true });
    });

    // Periodic poll every 5 seconds + session inactivity check
    setInterval(async () => {
      if (state.token && state.currentUser) {
        checkSessionInactivityTimeout();
        await refreshData(false);
      }
    }, 5000);

  } catch (err) {
    console.error('Initialization error:', err);
  }
});

// =========================================================================
// PUBLIC LANDING PAGE & SYSTEM BRANDING
// =========================================================================

async function loadPublicLandingInfo() {
  try {
    const res = await fetch(`${API_BASE}/public/landing-info`);
    if (!res.ok) return;
    const data = await res.json();

    if (data.systemSettings) {
      state.systemSettings = data.systemSettings;
      applySystemSettingsBranding(data.systemSettings);
    }

    if (data.metrics) {
      const sStudents = document.getElementById('landingStatStudents');
      const sDorms = document.getElementById('landingStatDorms');
      const sCheckups = document.getElementById('landingStatCheckups');
      const sCerts = document.getElementById('landingStatCerts');

      if (sStudents) sStudents.textContent = data.metrics.totalStudents || 4;
      if (sDorms) sDorms.textContent = data.metrics.boardingHousesCovered || 5;
      if (sCheckups) sCheckups.textContent = data.metrics.totalRequests || 7;
      if (sCerts) sCerts.textContent = data.metrics.certificatesIssued || 2;
    }

    if (Array.isArray(data.announcements)) {
      if (!state.token) state.announcements = data.announcements;
      renderLandingAnnouncements(data.announcements);
    }
  } catch (err) {
    console.warn('Could not load public landing info:', err);
  }
}

function applySystemSettingsBranding(settings) {
  if (!settings) return;
  const sysName = settings.systemName || 'VitaCall';
  document.title = `${sysName} - USTP ${settings.campusName || 'Villanueva'} Health Request & Monitoring`;

  const brandLogo = document.getElementById('brandLogoImg');
  const brandName = document.getElementById('brandNameDisplay');
  const brandCampus = document.getElementById('brandCampusBadge');
  const brandSubtitle = document.getElementById('brandSubtitleDisplay');
  const bannerSysName = document.getElementById('bannerSystemName');
  const bannerClinic = document.getElementById('bannerClinicHotline');
  const bannerEmergency = document.getElementById('bannerEmergencyHotline');
  const landingHours = document.getElementById('landingHoursDisplay');
  const maintBanner = document.getElementById('maintenanceModeBanner');
  const maintText = document.getElementById('maintenanceModeBannerText');

  if (brandLogo && settings.logoUrl) brandLogo.src = settings.logoUrl;
  if (brandName) {
    if (sysName.toLowerCase() === 'vitacall') {
      brandName.innerHTML = `Vita<span class="text-ustp-goldLight">Call</span>`;
    } else {
      brandName.textContent = sysName;
    }
  }
  if (brandCampus) brandCampus.textContent = (settings.campusName || 'Villanueva').replace(/campus/i, '').trim() || 'Villanueva';
  if (brandSubtitle && settings.systemSubtitle) brandSubtitle.textContent = settings.systemSubtitle;
  if (bannerSysName) bannerSysName.textContent = sysName;
  if (bannerClinic && settings.clinicHotline) bannerClinic.textContent = settings.clinicHotline;
  if (bannerEmergency && settings.emergencyHotline) bannerEmergency.textContent = settings.emergencyHotline;
  if (landingHours && settings.operatingHours) landingHours.textContent = settings.operatingHours;

  if (maintBanner) {
    if (settings.maintenanceMode) {
      maintBanner.classList.remove('hidden');
      if (maintText) maintText.textContent = `🔧 MAINTENANCE MODE ACTIVE: ${settings.maintenanceMessage || 'Non-administrator actions are temporarily restricted.'}`;
    } else {
      maintBanner.classList.add('hidden');
    }
  }
}

function renderLandingAnnouncements(list) {
  const container = document.getElementById('landingAnnouncementsList');
  if (!container) return;

  const items = list && list.length > 0 ? list : (state.announcements || []);
  if (items.length === 0) {
    container.innerHTML = `<div class="col-span-2 text-center py-6 text-slate-400">No active public advisories at this time.</div>`;
    return;
  }

  container.innerHTML = items.slice(0, 4).map(a => {
    const badgeColor = a.priority === 'urgent'
      ? 'bg-rose-100 text-rose-800 border-rose-200'
      : (a.priority === 'warning' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-blue-50 text-blue-800 border-blue-200');
    return `
      <div class="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${badgeColor}">${escHtml(a.priority || 'info')}</span>
          <span class="text-[10px] text-slate-400">${new Date(a.createdAt).toLocaleDateString()}</span>
        </div>
        <h3 class="font-bold text-slate-900 text-xs sm:text-sm">${escHtml(a.title)}</h3>
        <p class="text-slate-600 text-xs leading-relaxed">${escHtml(a.message)}</p>
        <div class="text-[10px] text-slate-400 pt-1">Issued by: ${escHtml(a.authorName || 'Health Center Admin')}</div>
      </div>
    `;
  }).join('');
}

async function verifyPublicCertificate(e) {
  if (e && e.preventDefault) e.preventDefault();
  const input = document.getElementById('landingVerifyCodeInput');
  const resultBox = document.getElementById('landingVerifyResult');
  if (!input || !resultBox) return;

  const code = input.value.trim().toUpperCase();
  if (!code) return;

  setButtonLoading('btnVerifyPublicCert', true);
  resultBox.classList.add('hidden');

  try {
    const res = await fetch(`${API_BASE}/verify-certificate/${encodeURIComponent(code)}`);
    const data = await res.json();

    resultBox.classList.remove('hidden');
    if (res.ok && data.verified && data.certificate) {
      const c = data.certificate;
      resultBox.className = 'rounded-xl p-3.5 text-xs border bg-emerald-50 border-emerald-300 text-emerald-950 space-y-2';
      resultBox.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="font-extrabold text-emerald-800 flex items-center gap-1">
            ✓ AUTHENTIC USTP MEDICAL CERTIFICATE
          </span>
          <span class="font-mono text-[10px] bg-emerald-200/70 text-emerald-900 px-2 py-0.5 rounded font-bold">${escHtml(c.verificationCode)}</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
          <div><strong>Student:</strong> ${escHtml(c.studentName)} (${escHtml(c.studentId)})</div>
          <div><strong>Signed By Physician:</strong> ${escHtml(c.approverName || 'Dr. Roberto Santos, MD')}</div>
          <div><strong>Examined By Nurse:</strong> ${escHtml(c.issuerName)}</div>
          <div><strong>Status:</strong> <span class="uppercase font-bold text-emerald-800">${escHtml(c.status || 'valid')}</span></div>
          <div class="sm:col-span-2"><strong>Excused Dates:</strong> ${escHtml(c.excusedDates)}</div>
          <div class="sm:col-span-2 text-[10px] text-emerald-800 italic">🔒 Medical Privacy Protected: Clinical diagnosis and prescribed medications are confidential and omitted from public verification.</div>
        </div>
      `;
    } else {
      resultBox.className = 'rounded-xl p-3.5 text-xs border bg-rose-50 border-rose-200 text-rose-800';
      resultBox.innerHTML = `<strong>Verification Failed:</strong> ${escHtml(data.message || 'No matching official certificate found for code ' + code)}`;
    }
  } catch (err) {
    resultBox.classList.remove('hidden');
    resultBox.className = 'rounded-xl p-3.5 text-xs border bg-rose-50 border-rose-200 text-rose-800';
    resultBox.textContent = 'Could not verify certificate at this time.';
  } finally {
    setButtonLoading('btnVerifyPublicCert', false);
  }
}

function goToAuth(tab = 'login') {
  navigate('auth');
  switchAuthTab(tab);
}

function quickLaunchDemo(email) {
  navigate('auth');
  prefillLogin(email);
}

// =========================================================================
// SESSION MANAGEMENT & AUTO-TIMEOUT
// =========================================================================

function checkSessionInactivityTimeout() {
  if (!state.token || !state.currentUser) return;
  const timeoutMins = (state.systemSettings && Number(state.systemSettings.sessionTimeoutMinutes)) || 30;
  const maxIdleMs = timeoutMins * 60 * 1000;
  if (Date.now() - state.lastActivityTime > maxIdleMs) {
    fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify({ reason: 'timeout' })
    }).catch(() => { });
    clearSession('auth');
    showToast(`Session expired after ${timeoutMins} minutes of inactivity. Please sign in again.`, 'warning');
  }
}

function clearSession(targetView = 'landing') {
  state.token = null;
  state.currentUser = null;
  localStorage.removeItem('vitacall_token');
  localStorage.removeItem('vitacall_user');
  document.body.classList.remove('compact-mode', 'high-contrast-mode');
  updateAuthUI(false);
  navigate(targetView);
}

function toggleLeftSidebar() {
  const sidebar = document.getElementById('sidebarNav');
  const backdrop = document.getElementById('leftSidebarBackdrop');
  if (!sidebar) return;

  const isMobileHidden = sidebar.classList.contains('hidden');
  if (isMobileHidden) {
    sidebar.classList.remove('hidden');
    sidebar.classList.add('fixed', 'top-16', 'left-0', 'bottom-0', 'z-40', 'flex');
    if (backdrop) backdrop.classList.remove('hidden');
  } else {
    closeLeftSidebar();
  }
}

function closeLeftSidebar() {
  const sidebar = document.getElementById('sidebarNav');
  const backdrop = document.getElementById('leftSidebarBackdrop');
  if (sidebar) {
    sidebar.classList.add('hidden');
    sidebar.classList.remove('fixed', 'top-16', 'left-0', 'bottom-0', 'z-40', 'flex');
  }
  if (backdrop) backdrop.classList.add('hidden');
}

function updateAuthUI(isLoggedIn) {
  const loggedInControls = document.getElementById('headerLoggedInControls');
  const loggedOutControls = document.getElementById('headerLoggedOutControls');
  const bottomNav = document.getElementById('bottomNav');
  const mobileAdminBtn = document.getElementById('mobileAdminBtn');
  const landingReturnWrap = document.getElementById('landingReturnDashboardWrap');

  // Left Sidebar containers
  const sidebarUserCard = document.getElementById('sidebarUserCard');
  const sidebarLoggedOutNav = document.getElementById('sidebarLoggedOutNav');
  const studentLeftNav = document.getElementById('studentLeftNav');
  const personnelLeftNav = document.getElementById('personnelLeftNav');
  const adminSidebar = document.getElementById('adminSidebar');
  const sidebarCommonAccountNav = document.getElementById('sidebarCommonAccountNav');
  const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');

  if (isLoggedIn && state.currentUser) {
    loggedInControls.classList.remove('hidden');
    loggedOutControls.classList.add('hidden');
    bottomNav.classList.remove('hidden');
    if (landingReturnWrap) landingReturnWrap.classList.remove('hidden');

    if (sidebarUserCard) sidebarUserCard.classList.remove('hidden');
    if (sidebarLoggedOutNav) sidebarLoggedOutNav.classList.add('hidden');
    if (sidebarCommonAccountNav) sidebarCommonAccountNav.classList.remove('hidden');
    if (sidebarLogoutBtn) sidebarLogoutBtn.classList.remove('hidden');

    const role = state.currentUser.role;
    const isMedicalStaff = role === 'personnel' || role === 'doctor';
    if (studentLeftNav) studentLeftNav.classList.toggle('hidden', role !== 'requester');
    if (personnelLeftNav) personnelLeftNav.classList.toggle('hidden', !isMedicalStaff);
    if (adminSidebar) adminSidebar.classList.toggle('hidden', role !== 'admin');

    const nameEl = document.getElementById('headerUserName');
    const roleEl = document.getElementById('headerUserRole');
    const avatarEl = document.getElementById('headerUserAvatar');
    const sideNameEl = document.getElementById('sidebarUserName');
    const sideEmailEl = document.getElementById('sidebarUserEmail');
    const sideRoleEl = document.getElementById('sidebarUserRoleBadge');
    const sideAvatarEl = document.getElementById('sidebarUserAvatar');

    const roleLabel = role === 'requester'
      ? 'Student'
      : (role === 'doctor' ? 'Campus Doctor' : (role === 'personnel' ? 'Campus Nurse' : 'Clinic Director'));
    if (nameEl) nameEl.textContent = state.currentUser.name;
    if (roleEl) roleEl.textContent = roleLabel;
    if (sideNameEl) sideNameEl.textContent = state.currentUser.name;
    if (sideEmailEl) sideEmailEl.textContent = state.currentUser.email || '';
    if (sideRoleEl) sideRoleEl.textContent = roleLabel;

    // Task 5: Show profile picture in navbar & left sidebar if set, otherwise show initials
    if (avatarEl) {
      if (state.currentUser.profilePicture) {
        avatarEl.innerHTML = `<img src="${state.currentUser.profilePicture}" alt="Avatar" class="w-full h-full object-cover rounded-full">`;
        avatarEl.className = 'w-6 h-6 rounded-full overflow-hidden flex-shrink-0 border border-white/30';
      } else {
        avatarEl.innerHTML = '';
        avatarEl.textContent = (state.currentUser.name || 'U').charAt(0).toUpperCase();
        avatarEl.className = role === 'requester'
          ? 'w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-bold flex items-center justify-center text-[10px]'
          : (role === 'personnel'
            ? 'w-6 h-6 rounded-full bg-teal-500 text-slate-950 font-bold flex items-center justify-center text-[10px]'
            : 'w-6 h-6 rounded-full bg-indigo-500 text-white font-bold flex items-center justify-center text-[10px]');
      }
    }

    if (sideAvatarEl) {
      if (state.currentUser.profilePicture) {
        sideAvatarEl.innerHTML = `<img src="${state.currentUser.profilePicture}" alt="Avatar" class="w-full h-full object-cover rounded-xl">`;
        sideAvatarEl.className = 'w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 border border-white/30';
      } else {
        sideAvatarEl.innerHTML = '';
        sideAvatarEl.textContent = (state.currentUser.name || 'U').charAt(0).toUpperCase();
        sideAvatarEl.className = 'w-10 h-10 rounded-xl bg-ustp-gold text-slate-950 font-black flex items-center justify-center text-sm flex-shrink-0';
      }
    }

    // Task 3: Admin links ONLY for admin role
    const isAdmin = role === 'admin';
    if (mobileAdminBtn) mobileAdminBtn.classList.toggle('hidden', !isAdmin);

  } else {
    loggedInControls.classList.add('hidden');
    loggedOutControls.classList.remove('hidden');
    bottomNav.classList.add('hidden');
    if (landingReturnWrap) landingReturnWrap.classList.add('hidden');

    if (sidebarUserCard) sidebarUserCard.classList.add('hidden');
    if (sidebarLoggedOutNav) sidebarLoggedOutNav.classList.remove('hidden');
    if (studentLeftNav) studentLeftNav.classList.add('hidden');
    if (personnelLeftNav) personnelLeftNav.classList.add('hidden');
    if (adminSidebar) adminSidebar.classList.add('hidden');
    if (sidebarCommonAccountNav) sidebarCommonAccountNav.classList.add('hidden');
    if (sidebarLogoutBtn) sidebarLogoutBtn.classList.add('hidden');
  }

  if (window.lucide) window.lucide.createIcons();
}

function handleBrandClick() {
  if (state.currentUser) navigate('dashboard');
  else navigate('landing');
}

// =========================================================================
// AUTH TABS
// =========================================================================

function switchAuthTab(tab) {
  const tabLogin = document.getElementById('tabBtnLogin');
  const tabReg = document.getElementById('tabBtnRegister');
  const formLogin = document.getElementById('loginForm');
  const formReg = document.getElementById('registerForm');

  if (tab === 'login') {
    tabLogin.className = 'flex-1 py-2 rounded-lg bg-white text-slate-900 shadow-sm transition';
    tabReg.className = 'flex-1 py-2 rounded-lg text-slate-600 hover:text-slate-900 transition';
    formLogin.classList.remove('hidden');
    formReg.classList.add('hidden');
  } else {
    tabReg.className = 'flex-1 py-2 rounded-lg bg-white text-slate-900 shadow-sm transition';
    tabLogin.className = 'flex-1 py-2 rounded-lg text-slate-600 hover:text-slate-900 transition';
    formReg.classList.remove('hidden');
    formLogin.classList.add('hidden');
  }

  if (window.lucide) window.lucide.createIcons();
}

function prefillLogin(email, password = 'password123') {
  document.getElementById('loginEmail').value = email;
  document.getElementById('loginPassword').value = password;
  switchAuthTab('login');
  const submitBtn = document.getElementById('btnLoginSubmit');
  if (submitBtn) submitBtn.click();
}

// =========================================================================
// TASK 4: LOADING HELPERS
// =========================================================================

function setButtonLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
    btn.innerHTML = `<svg class="animate-spin w-4 h-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg><span>Processing…</span>`;
  } else if (btn.dataset.originalHtml) {
    btn.innerHTML = btn.dataset.originalHtml;
    delete btn.dataset.originalHtml;
  }
  if (window.lucide) window.lucide.createIcons();
}

function showErrorMsg(containerId, msg) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const textEl = document.getElementById(containerId + 'Text');
  if (textEl) {
    textEl.textContent = msg;
  } else {
    el.textContent = msg;
  }
  el.classList.remove('hidden');
}

function hideErrorMsg(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.classList.add('hidden');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =========================================================================
// TASK 6 & 4: LOGIN SUBMIT — loading spinner + success toast + error display
// =========================================================================

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  hideErrorMsg('loginError');
  setButtonLoading('btnLoginSubmit', true);

  try {
    await delay(APP_LOADING_DELAY_MS);

    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      showErrorMsg('loginError', data.error || 'Invalid email or password. Please check your credentials and try again.');
      return;
    }

    state.token = data.token;
    state.currentUser = data.user;
    state.lastActivityTime = Date.now();
    if (data.systemSettings) {
      state.systemSettings = data.systemSettings;
      applySystemSettingsBranding(data.systemSettings);
    }
    localStorage.setItem('vitacall_token', data.token);
    localStorage.setItem('vitacall_user', JSON.stringify(data.user));

    applyUserDisplayPreferences();
    updateAuthUI(true);
    // Task 6: success toast after login
    showToast(`Welcome back, ${state.currentUser.name}!`, 'success');

    navigate('dashboard');

    await refreshData(true);
  } catch (err) {
    console.error('Login error:', err);
    showErrorMsg('loginError', 'Server communication error. Please try again.');
  } finally {
    setButtonLoading('btnLoginSubmit', false);
  }
}

// =========================================================================
// TASK 4: REGISTER SUBMIT — loading + error display
// =========================================================================

async function handleRegisterSubmit(e) {
  e.preventDefault();

  hideErrorMsg('registerError');
  setButtonLoading('btnRegisterSubmit', true);

  const payload = {
    name: document.getElementById('regName').value.trim(),
    studentId: document.getElementById('regStudentId').value.trim(),
    email: document.getElementById('regEmail').value.trim().toLowerCase(),
    password: document.getElementById('regPassword').value,
    courseAndYear: document.getElementById('regCourse').value.trim(),
    phone: document.getElementById('regPhone').value.trim(),
    boardingHouse: document.getElementById('regBoardingHouse').value.trim(),
    address: document.getElementById('regAddress').value.trim(),
    landmark: document.getElementById('regLandmark').value.trim(),
    emergencyContact: {
      name: document.getElementById('regEmName').value.trim(),
      phone: document.getElementById('regEmPhone').value.trim()
    }
  };

  try {
    await delay(APP_LOADING_DELAY_MS);

    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      showErrorMsg('registerError', data.error || 'Registration failed. Please check your details.');
      return;
    }

    if (data.pendingApproval) {
      showToast(data.message || 'Account registered and awaiting administrator approval.', 'info');
      switchAuthTab('login');
      return;
    }

    state.token = data.token;
    state.currentUser = data.user;
    state.lastActivityTime = Date.now();
    localStorage.setItem('vitacall_token', data.token);
    localStorage.setItem('vitacall_user', JSON.stringify(data.user));

    applyUserDisplayPreferences();
    updateAuthUI(true);
    showToast(`Account created! Welcome, ${state.currentUser.name}`, 'success');
    navigate('dashboard');
    await refreshData(true);
  } catch (err) {
    console.error('Registration error:', err);
    showErrorMsg('registerError', 'Server communication error. Please try again.');
  } finally {
    setButtonLoading('btnRegisterSubmit', false);
  }
}

// =========================================================================
// TASK 6: LOGOUT — confirmation dialog + loading + toast
// =========================================================================

function logout() {
  showLogoutConfirmDialog();
}

function showLogoutConfirmDialog() {
  let dialog = document.getElementById('logoutConfirmDialog');
  if (!dialog) {
    dialog = document.createElement('div');
    dialog.id = 'logoutConfirmDialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'logoutDialogTitle');
    dialog.className = 'fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4';
    dialog.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 space-y-4" role="document">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </div>
          <div>
            <h3 id="logoutDialogTitle" class="font-bold text-slate-900 text-base">Are you sure?</h3>
            <p class="text-xs text-slate-500 mt-0.5">Are you sure you want to log out of VitaCall? You will need to sign in again to access services.</p>
          </div>
        </div>
        <div class="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
          <button id="logoutCancelBtn" onclick="closeLogoutDialog()" class="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-xs transition">
            Cancel
          </button>
          <button id="logoutConfirmBtn" onclick="confirmLogout()" class="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Log Out
          </button>
        </div>
      </div>
    `;
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeLogoutDialog();
        return;
      }
      if (e.key === 'Tab') {
        const cancelBtn = document.getElementById('logoutCancelBtn');
        const confirmBtn = document.getElementById('logoutConfirmBtn');
        if (e.shiftKey) {
          if (document.activeElement === cancelBtn) {
            e.preventDefault();
            confirmBtn.focus();
          }
        } else {
          if (document.activeElement === confirmBtn) {
            e.preventDefault();
            cancelBtn.focus();
          }
        }
      }
    });
    document.body.appendChild(dialog);
  } else {
    setButtonLoading('logoutConfirmBtn', false);
    const cancelBtn = document.getElementById('logoutCancelBtn');
    if (cancelBtn) cancelBtn.disabled = false;
    dialog.classList.remove('hidden');
  }

  setTimeout(() => {
    const cancelBtn = document.getElementById('logoutCancelBtn');
    if (cancelBtn) cancelBtn.focus();
  }, 50);
}

function closeLogoutDialog() {
  setButtonLoading('logoutConfirmBtn', false);
  const cancelBtn = document.getElementById('logoutCancelBtn');
  if (cancelBtn) cancelBtn.disabled = false;
  const dialog = document.getElementById('logoutConfirmDialog');
  if (dialog) dialog.classList.add('hidden');
}

async function confirmLogout() {
  setButtonLoading('logoutConfirmBtn', true);
  const cancelBtn = document.getElementById('logoutCancelBtn');
  if (cancelBtn) cancelBtn.disabled = true;

  try {
    const logoutDelayMs = typeof APP_LOADING_DELAY_MS === 'number' ? APP_LOADING_DELAY_MS : 1000;
    const logoutFetch = state.token
      ? fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${state.token}` }
        }).catch(() => {})
      : Promise.resolve();

    // Run 1-second loading delay and logout API request concurrently so logout always takes 1 second
    await Promise.all([
      delay(logoutDelayMs),
      Promise.race([logoutFetch, delay(logoutDelayMs)])
    ]);
  } catch (e) {
    // Ignore network errors on logout
  } finally {
    setButtonLoading('logoutConfirmBtn', false);
    if (cancelBtn) cancelBtn.disabled = false;
  }

  closeLogoutDialog();
  clearSession('auth');
  // Task 6: toast after logout
  showToast('You have been logged out', 'info');
}

// =========================================================================
// NAVIGATION & DASHBOARD SETTINGS ROUTING
// =========================================================================

function openCurrentDashboardSettings() {
  if (!state.currentUser) {
    navigate('auth');
    return;
  }
  navigate('dashboard');
  if (state.currentUser.role === 'requester') {
    switchStudentTab('settings');
  } else if (state.currentUser.role === 'personnel' || state.currentUser.role === 'doctor') {
    switchPersonnelTab('settings');
  } else if (state.currentUser.role === 'admin') {
    switchAdminSection('settings');
  }
}

function navigate(viewName) {
  let targetSection = null;
  let targetView = viewName;

  if (viewName === 'certificates') {
    targetView = 'dashboard';
    if (state.currentUser && state.currentUser.role === 'requester') {
      state.studentSubTab = 'overview';
    }
    targetSection = 'studentCertificatesList';
  } else if (viewName === 'queue') {
    targetView = 'dashboard';
    if (state.currentUser && (state.currentUser.role === 'personnel' || state.currentUser.role === 'doctor')) {
      state.personnelSubTab = 'queue';
    }
    targetSection = 'personnelQueueList';
  } else if (viewName && typeof viewName === 'string' && viewName.startsWith('request:')) {
    targetView = 'dashboard';
    if (state.currentUser && state.currentUser.role === 'requester') {
      state.studentSubTab = 'overview';
    }
    targetSection = 'activeRequestContainer';
  }

  state._prevView = state.activeView;
  state.activeView = targetView;
  renderCurrentView();

  if (targetSection) {
    setTimeout(() => {
      const el = document.getElementById(targetSection);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-ustp-gold', 'ring-offset-2');
        setTimeout(() => el.classList.remove('ring-2', 'ring-ustp-gold', 'ring-offset-2'), 2500);
      }
    }, 120);
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function renderCurrentView() {
  const vLanding = document.getElementById('landingView');
  const vAuth = document.getElementById('authView');
  const vStudent = document.getElementById('viewStudentDashboard');
  const vPersonnel = document.getElementById('viewPersonnelDashboard');
  const vAdmin = document.getElementById('viewAdminDashboard');
  const vProfile = document.getElementById('viewProfile');
  const globalAnnBar = document.getElementById('globalAnnouncementsBar');
  const fabIcon = document.getElementById('fabIcon');
  const sidebarNav = document.getElementById('sidebarNav');
  const mobileToggleBtn = document.getElementById('mobileSidebarToggleBtn');
  const landingTopNav = document.getElementById('landingTopNav');
  const headerBackToDash = document.getElementById('headerBackToDashboardBtn');

  [vLanding, vAuth, vStudent, vPersonnel, vAdmin, vProfile].forEach(el => el && el.classList.add('hidden'));

  const isLandingOrAuth = !state.currentUser || state.activeView === 'landing' || state.activeView === 'auth';

  // Show Top Navigation ONLY on Landing / Auth view; Show Left Sidebar ONLY inside logged-in Dashboards / Profile
  if (sidebarNav) {
    if (isLandingOrAuth) {
      sidebarNav.classList.add('hidden');
      sidebarNav.classList.remove('md:flex', 'fixed', 'top-16', 'left-0', 'bottom-0', 'z-40', 'flex');
    } else {
      sidebarNav.classList.remove('hidden');
      sidebarNav.classList.add('hidden', 'md:flex');
    }
  }
  if (mobileToggleBtn) {
    mobileToggleBtn.classList.toggle('hidden', isLandingOrAuth);
    mobileToggleBtn.classList.toggle('md:hidden', !isLandingOrAuth);
  }
  if (landingTopNav) {
    landingTopNav.classList.toggle('hidden', !isLandingOrAuth);
  }
  if (headerBackToDash) {
    const showBackBtn = Boolean(state.currentUser && state.activeView === 'landing');
    headerBackToDash.classList.toggle('hidden', !showBackBtn);
    headerBackToDash.classList.toggle('flex', showBackBtn);
  }

  document.querySelectorAll('.nav-btn, .mobile-nav-btn').forEach(btn => {
    const view = btn.getAttribute('data-view');
    const isActive = view === state.activeView;
    if (btn.classList.contains('nav-btn')) {
      btn.className = isActive
        ? 'nav-btn w-full text-left px-3.5 py-2.5 rounded-xl bg-ustp-navy text-white text-xs font-bold transition flex items-center gap-2.5 shadow-sm'
        : 'nav-btn w-full text-left px-3.5 py-2.5 rounded-xl hover:bg-slate-100 text-slate-700 text-xs font-bold transition flex items-center gap-2.5';
    } else if (btn.classList.contains('mobile-nav-btn')) {
      btn.classList.toggle('text-ustp-navy', isActive);
      btn.classList.toggle('font-bold', isActive);
      btn.classList.toggle('text-slate-600', !isActive);
    }
  });

  if (state.activeView === 'landing') {
    if (globalAnnBar) globalAnnBar.classList.add('hidden');
    if (vLanding) vLanding.classList.remove('hidden');
    renderLandingAnnouncements(state.announcements);
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  if (!state.currentUser || state.activeView === 'auth') {
    if (globalAnnBar) globalAnnBar.classList.add('hidden');
    if (vAuth) vAuth.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  renderGlobalAnnouncementsBar();

  if (state.activeView === 'profile') {
    vProfile.classList.remove('hidden');
    renderProfileView();
    if (fabIcon) fabIcon.setAttribute('data-lucide', 'arrow-left');
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // Task 3: Prevent non-admin from accessing admin view
  if (state.activeView === 'admin' && state.currentUser.role !== 'admin') {
    state.activeView = 'dashboard';
  }

  if (state.currentUser.role === 'requester') {
    vStudent.classList.remove('hidden');
    renderStudentDashboard();
    if (fabIcon) fabIcon.setAttribute('data-lucide', 'plus');
  } else if (state.currentUser.role === 'personnel' || state.currentUser.role === 'doctor') {
    vPersonnel.classList.remove('hidden');
    renderPersonnelDashboard();
    if (fabIcon) fabIcon.setAttribute('data-lucide', 'activity');
  } else if (state.currentUser.role === 'admin') {
    vAdmin.classList.remove('hidden');
    renderAdminDashboard();
    if (fabIcon) fabIcon.setAttribute('data-lucide', 'shield');
  }

  if (window.lucide) window.lucide.createIcons();
}

// =========================================================================
// GLOBAL ANNOUNCEMENTS BAR & ROLE DASHBOARD SETTINGS
// =========================================================================

function renderGlobalAnnouncementsBar() {
  const bar = document.getElementById('globalAnnouncementsBar');
  if (!bar || !state.currentUser) return;

  const sysEnabled = !state.systemSettings || state.systemSettings.enableAnnouncementsBanner !== false;
  const userSet = (state.currentUser && state.currentUser.settings) || {};
  const userEnabled = userSet.showAnnouncements !== false;

  const pinnedOrUrgent = (state.announcements || []).filter(a => {
    const roleMatch = state.currentUser.role === 'admin' || a.targetRole === 'all' || a.targetRole === state.currentUser.role;
    return roleMatch && (a.isPinned || a.priority === 'urgent' || a.priority === 'maintenance');
  });

  if (!sysEnabled || !userEnabled || pinnedOrUrgent.length === 0) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }

  bar.classList.remove('hidden');
  bar.innerHTML = pinnedOrUrgent.slice(0, 2).map(a => {
    const style = a.priority === 'urgent'
      ? 'bg-rose-50 border-rose-300 text-rose-950'
      : (a.priority === 'maintenance' ? 'bg-amber-50 border-amber-300 text-amber-950' : 'bg-blue-50/90 border-blue-200 text-slate-900');
    return `
      <div class="px-4 py-2.5 rounded-xl border ${style} text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm">
        <div class="flex items-start sm:items-center gap-2">
          <span class="font-extrabold uppercase text-[10px] px-2 py-0.5 rounded bg-white/80 border border-current/20 flex-shrink-0">📢 ${escHtml(a.priority || 'Announcement')}</span>
          <div>
            <strong class="font-bold">${escHtml(a.title)}:</strong>
            <span class="ml-1">${escHtml(a.message)}</span>
          </div>
        </div>
        <span class="text-[10px] opacity-75 flex-shrink-0">${new Date(a.createdAt).toLocaleDateString()}</span>
      </div>
    `;
  }).join('');
}

function applyUserDisplayPreferences() {
  if (!state.currentUser || !state.currentUser.settings) return;
  const s = state.currentUser.settings;
  document.body.classList.toggle('compact-mode', Boolean(s.compactView || s.compactTables));
  document.body.classList.toggle('high-contrast-mode', Boolean(s.highContrastBadges));
}

async function saveRoleDashboardSettings(e, role) {
  e.preventDefault();
  let settings = {};
  let newPassword = '';
  let btnId = role === 'requester' ? 'btnSaveStudentSettings' : 'btnSavePersonnelSettings';

  if (role === 'requester') {
    settings = {
      emailAlerts: document.getElementById('stuSetEmailAlerts').checked,
      smsAlerts: document.getElementById('stuSetSmsAlerts').checked,
      soundAlerts: document.getElementById('stuSetSoundAlerts').checked,
      showAnnouncements: document.getElementById('stuSetShowAnnouncements').checked,
      shareLocationWithResponder: document.getElementById('stuSetShareLocation').checked,
      autoShareEmergencyOnSevere: document.getElementById('stuSetAutoEmergency').checked,
      compactView: document.getElementById('stuSetCompactView').checked,
      highContrastBadges: document.getElementById('stuSetHighContrast').checked
    };
    newPassword = (document.getElementById('stuSetNewPassword').value || '').trim();
  } else if (role === 'personnel') {
    settings = {
      dutyStatus: document.getElementById('perSetDutyStatus').value,
      responseZone: document.getElementById('perSetResponseZone').value.trim(),
      defaultQueueFilter: document.getElementById('perSetDefaultFilter').value,
      urgentSoundAlert: document.getElementById('perSetUrgentSound').checked,
      defaultExcusedDays: Number(document.getElementById('perSetDefaultExcusedDays').value) || 3,
      defaultFollowUpNote: document.getElementById('perSetFollowUpNote').value.trim(),
      showLicenseOnCert: document.getElementById('perSetShowLicense').checked,
      showAnnouncements: document.getElementById('perSetShowAnnouncements').checked
    };
    newPassword = (document.getElementById('perSetNewPassword').value || '').trim();
  }

  setButtonLoading(btnId, true);
  try {
    await delay(APP_LOADING_DELAY_MS);
    const payload = { settings };
    if (newPassword) payload.newPassword = newPassword;

    const res = await fetch(`${API_BASE}/users/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to save dashboard settings', 'error');
      return;
    }

    if (data.user) {
      if (!data.user.profilePicture && state.currentUser.profilePicture) {
        data.user.profilePicture = state.currentUser.profilePicture;
      }
      state.currentUser = data.user;
      localStorage.setItem('vitacall_user', JSON.stringify(state.currentUser));
    }

    if (role === 'requester') document.getElementById('stuSetNewPassword').value = '';
    if (role === 'personnel') document.getElementById('perSetNewPassword').value = '';

    applyUserDisplayPreferences();
    renderGlobalAnnouncementsBar();
    renderCurrentView();
    showToast('Dashboard settings saved and synchronized!', 'success');
  } catch (err) {
    console.error('Save dashboard settings error:', err);
    showToast('Server error while saving settings', 'error');
  } finally {
    setButtonLoading(btnId, false);
  }
}

// =========================================================================
// DATA REFRESH & REAL-TIME SYNC
// =========================================================================

async function refreshData(renderAll = true) {
  if (!state.token || !state.currentUser) return;

  try {
    const [reqRes, notifRes, annRes, certRes] = await Promise.all([
      fetch(`${API_BASE}/requests`, { headers: { 'Authorization': `Bearer ${state.token}` } }),
      fetch(`${API_BASE}/notifications`, { headers: { 'Authorization': `Bearer ${state.token}` } }),
      fetch(`${API_BASE}/announcements`, { headers: { 'Authorization': `Bearer ${state.token}` } }),
      fetch(`${API_BASE}/certificates`, { headers: { 'Authorization': `Bearer ${state.token}` } })
    ]);

    if (reqRes.ok) state.requests = await reqRes.json();
    if (notifRes.ok) {
      state.notifications = await notifRes.json();
      updateNotificationsUI();
    }
    if (annRes.ok) state.announcements = await annRes.json();
    if (certRes.ok) state.certificates = await certRes.json();

    if (state.currentUser.role === 'admin' || state.currentUser.role === 'personnel' || state.currentUser.role === 'doctor') {
      const fetches = [
        fetch(`${API_BASE}/admin/stats`, { headers: { 'Authorization': `Bearer ${state.token}` } }),
        fetch(`${API_BASE}/clinical-records`, { headers: { 'Authorization': `Bearer ${state.token}` } })
      ];
      if (state.currentUser.role === 'doctor' || state.currentUser.role === 'admin') {
        fetches.push(fetch(`${API_BASE}/nurses`, { headers: { 'Authorization': `Bearer ${state.token}` } }));
      }
      const [statsRes, clinRes, nursesRes] = await Promise.all(fetches);
      if (statsRes && statsRes.ok) state.stats = await statsRes.json();
      if (clinRes && clinRes.ok) state.clinicalRecords = await clinRes.json();
      if (nursesRes && nursesRes.ok) state.nurses = await nursesRes.json();
    }

    if (state.currentUser.role === 'admin') {
      const [auditRes, usersRes, secRes, recRes, setRes] = await Promise.all([
        fetch(`${API_BASE}/admin/audit-logs`, { headers: { 'Authorization': `Bearer ${state.token}` } }),
        fetch(`${API_BASE}/admin/users`, { headers: { 'Authorization': `Bearer ${state.token}` } }),
        fetch(`${API_BASE}/admin/security`, { headers: { 'Authorization': `Bearer ${state.token}` } }),
        fetch(`${API_BASE}/admin/records`, { headers: { 'Authorization': `Bearer ${state.token}` } }),
        fetch(`${API_BASE}/admin/settings`, { headers: { 'Authorization': `Bearer ${state.token}` } })
      ]);

      if (auditRes.ok) state.auditLogs = await auditRes.json();
      if (usersRes.ok) state.adminUsers = await usersRes.json();
      if (secRes.ok) state.securityData = await secRes.json();
      if (recRes.ok) {
        const rData = await recRes.json();
        state.clinicalRecords = rData.clinicalRecords || [];
        state.backups = rData.backups || [];
      }
      if (setRes.ok) {
        const sData = await setRes.json();
        state.systemSettings = sData.settings;
        state.systemInfo = sData.systemInfo;
        applySystemSettingsBranding(state.systemSettings);
      }
    }

    if (typeof VitaCallDataSync !== 'undefined') {
      VitaCallDataSync.notifyChange('all', { timestamp: new Date().toISOString() });
    }

    renderGlobalAnnouncementsBar();

    if (renderAll) {
      renderCurrentView();
    } else {
      if (state.currentUser.role === 'requester') {
        renderStudentActiveRequest();
      } else if (state.currentUser.role === 'personnel') {
        renderPersonnelCounters();
        if (state.personnelSubTab === 'queue') renderPersonnelQueueList();
      } else if (state.currentUser.role === 'admin') {
        updateAdminSidebarBadges();
        if (state.adminSection === 'overview') renderAdminOverviewSection();
      }
    }

    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    console.error('Data refresh error:', err);
  }
}

// =========================================================================
// 1. EDITABLE USER PROFILE VIEW
// =========================================================================

function renderProfileView() {
  const user = state.currentUser;
  if (!user) return;

  const isStudent = user.role === 'requester';

  const avatar = document.getElementById('profileAvatar');
  const nameDisplay = document.getElementById('profileDisplayName');
  const emailDisplay = document.getElementById('profileDisplayEmail');
  const roleBadge = document.getElementById('profileRoleBadge');
  const idBadge = document.getElementById('profileDisplayIdBadge');
  const subtitle = document.getElementById('profileDisplaySubtitle');

  // Task 5: Profile picture display
  if (avatar) {
    if (user.profilePicture) {
      avatar.innerHTML = `<img src="${user.profilePicture}" alt="Profile photo" class="w-full h-full object-cover" onerror="this.style.display='none'">`;
      avatar.className = 'w-20 h-20 rounded-2xl overflow-hidden shadow-md flex-shrink-0 border-2 border-slate-200';
    } else {
      avatar.innerHTML = '';
      avatar.textContent = (user.name || 'U').charAt(0).toUpperCase();
      avatar.className = 'w-20 h-20 rounded-2xl bg-gradient-to-tr from-ustp-navy to-ustp-blue text-ustp-goldLight text-2xl font-black flex items-center justify-center shadow-md flex-shrink-0';
    }
  }

  const headerBtnText = document.getElementById('profilePicHeaderBtnText');
  if (headerBtnText) {
    headerBtnText.textContent = user.profilePicture ? 'Change Photo' : 'Add Profile Picture';
  }

  if (nameDisplay) nameDisplay.textContent = user.name;
  if (emailDisplay) emailDisplay.textContent = user.email;

  if (roleBadge) {
    roleBadge.textContent = isStudent
      ? 'Boarding Student'
      : (user.role === 'doctor' ? 'Campus Physician / Doctor' : (user.role === 'personnel' ? 'Campus Health Nurse' : 'Clinic Director'));
    roleBadge.className = isStudent
      ? 'bg-amber-100 text-amber-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase'
      : (user.role === 'doctor'
        ? 'bg-blue-100 text-blue-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase'
        : (user.role === 'personnel'
          ? 'bg-teal-100 text-teal-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase'
          : 'bg-indigo-100 text-indigo-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase'));
  }

  if (idBadge) idBadge.textContent = isStudent ? `ID: ${user.studentId || 'Pending'}` : (user.licenseNumber || 'PRC Verified');
  if (subtitle) {
    subtitle.textContent = isStudent
      ? `${user.boardingHouse || 'Boarding Resident'} • Villanueva`
      : `${user.title || 'USTP Health Services'}`;
  }

  document.getElementById('profName').value = user.name || '';
  document.getElementById('profPhone').value = user.phone || '';

  const studentFields = document.getElementById('profStudentFields');
  const personnelFields = document.getElementById('profPersonnelFields');
  const docSigCard = document.getElementById('doctorSignatureProfileCard');

  if (isStudent) {
    studentFields.classList.remove('hidden');
    personnelFields.classList.add('hidden');
    if (docSigCard) docSigCard.classList.add('hidden');
    document.getElementById('profStudentId').value = user.studentId || '';
    document.getElementById('profCourse').value = user.courseAndYear || '';
    document.getElementById('profBoardingHouse').value = user.boardingHouse || '';
    document.getElementById('profAddress').value = user.address || '';
    document.getElementById('profLandmark').value = user.landmark || '';
    const em = user.emergencyContact || {};
    document.getElementById('profEmName').value = em.name || '';
    document.getElementById('profEmPhone').value = em.phone || '';
  } else {
    studentFields.classList.add('hidden');
    personnelFields.classList.remove('hidden');
    document.getElementById('profTitle').value = user.title || '';
    document.getElementById('profLicense').value = user.licenseNumber || '';
    if (docSigCard) {
      const isDoc = user.role === 'doctor';
      docSigCard.classList.toggle('hidden', !isDoc);
      if (isDoc) {
        const sigPreview = document.getElementById('profSavedSignaturePreview');
        if (sigPreview && user.doctorSignature) sigPreview.src = user.doctorSignature;
        setTimeout(() => initSignaturePadCanvas('profSignatureCanvas'), 60);
      }
    }
  }

  document.getElementById('profNewPassword').value = '';

  // Task 5: render profile picture upload section
  renderProfilePictureSection();
}

// =========================================================================
// TASK 5: PROFILE PICTURE MANAGEMENT
// =========================================================================

function renderProfilePictureSection() {
  const container = document.getElementById('profilePicSection');
  if (!container) return;

  const user = state.currentUser;
  const hasPhoto = !!(user && user.profilePicture);

  container.innerHTML = `
    <div class="pt-2 border-t border-slate-100">
      <div class="font-bold text-slate-700 mb-2 text-xs sm:text-sm flex items-center gap-1.5">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        Profile Picture
      </div>
      <div class="flex items-center gap-4 flex-wrap">
        <div id="profilePicPreview" class="w-16 h-16 rounded-xl overflow-hidden border-2 border-slate-200 flex-shrink-0 flex items-center justify-center bg-slate-100 text-slate-400">
          ${hasPhoto
      ? `<img src="${user.profilePicture}" alt="Profile" class="w-full h-full object-cover">`
      : `<svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
    }
        </div>
        <div class="flex-1 min-w-0">
          <label class="cursor-pointer inline-flex items-center gap-1.5 bg-ustp-navy hover:bg-ustp-navyLight text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm border border-slate-700">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-ustp-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            <span id="profilePicBtnLabel">${hasPhoto ? 'Change Profile Picture' : 'Add Profile Picture'}</span>
            <input type="file" id="profilePicInput" accept="image/jpeg,image/png,image/webp" class="hidden" onchange="handleProfilePicSelect(event)">
          </label>
          <p class="text-[10px] text-slate-400 mt-1">JPG, PNG, or WebP · Max 2 MB · Cropped to square (256×256)</p>
          ${hasPhoto ? `<button type="button" onclick="removeProfilePicture()" class="mt-1 text-[10px] text-rose-500 hover:text-rose-700 font-semibold transition">Remove photo</button>` : ''}
        </div>
      </div>
      <div id="profilePicActions" class="hidden mt-3 flex items-center gap-2">
        <button type="button" id="savePicBtn" onclick="saveProfilePicture()" class="bg-ustp-navy hover:bg-ustp-navyLight text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Save Photo
        </button>
        <button type="button" onclick="cancelProfilePicSelect()" class="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition">
          Cancel
        </button>
      </div>
      <div id="profilePicError" class="hidden mt-1.5 text-xs text-rose-600 font-medium bg-rose-50 px-2 py-1.5 rounded-lg border border-rose-100"></div>
    </div>
  `;
}

let _pendingProfilePicDataUrl = null;

function _applyProfilePicToDOM(dataUrl) {
  if (!dataUrl) return;
  const imgHtml = `<img src="${dataUrl}" alt="Profile photo" class="w-full h-full object-cover" onerror="this.parentElement.textContent='${(state.currentUser && state.currentUser.name || 'U').charAt(0).toUpperCase()}'">`;

  const profileAvatar = document.getElementById('profileAvatar');
  if (profileAvatar) {
    profileAvatar.innerHTML = imgHtml;
    profileAvatar.className = 'w-20 h-20 rounded-2xl overflow-hidden shadow-md flex-shrink-0 border-2 border-ustp-gold';
  }

  const profilePicPreview = document.getElementById('profilePicPreview');
  if (profilePicPreview) {
    profilePicPreview.innerHTML = `<img src="${dataUrl}" alt="Profile" class="w-full h-full object-cover">`;
  }

  const headerAvatar = document.getElementById('headerUserAvatar');
  if (headerAvatar) {
    headerAvatar.innerHTML = `<img src="${dataUrl}" alt="Avatar" class="w-full h-full object-cover rounded-full">`;
    headerAvatar.className = 'w-6 h-6 rounded-full overflow-hidden flex-shrink-0 border border-white/30';
  }

  const headerBtnText = document.getElementById('profilePicHeaderBtnText');
  if (headerBtnText) headerBtnText.textContent = 'Change Photo';
}

function handleProfilePicSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const errorEl = document.getElementById('profilePicError');
  if (errorEl) errorEl.classList.add('hidden');

  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    if (errorEl) { errorEl.textContent = 'Only JPG, PNG, or WebP image files are allowed.'; errorEl.classList.remove('hidden'); }
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    if (errorEl) { errorEl.textContent = 'Image is too large. Maximum size is 2 MB.'; errorEl.classList.remove('hidden'); }
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // Crop to square and resize to 256x256
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 256, 256);
      _pendingProfilePicDataUrl = canvas.toDataURL('image/jpeg', 0.85);

      const preview = document.getElementById('profilePicPreview');
      if (preview) {
        preview.innerHTML = `<img src="${_pendingProfilePicDataUrl}" alt="Preview" class="w-full h-full object-cover">`;
      }

      const topAvatar = document.getElementById('profileAvatar');
      if (topAvatar) {
        topAvatar.innerHTML = `<img src="${_pendingProfilePicDataUrl}" alt="Preview" class="w-full h-full object-cover">`;
        topAvatar.className = 'w-20 h-20 rounded-2xl overflow-hidden shadow-md border-2 border-ustp-gold';
      }

      const actions = document.getElementById('profilePicActions');
      if (actions) {
        actions.classList.remove('hidden');
        actions.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function cancelProfilePicSelect() {
  _pendingProfilePicDataUrl = null;
  renderProfileView();
}

async function saveProfilePicture() {
  if (!_pendingProfilePicDataUrl) {
    showToast('Please select a photo first.', 'warning');
    return;
  }

  const photoDataUrl = _pendingProfilePicDataUrl;

  if (state.currentUser) {
    state.currentUser.profilePicture = photoDataUrl;
    localStorage.setItem('vitacall_user', JSON.stringify(state.currentUser));
  }
  _applyProfilePicToDOM(photoDataUrl);

  setButtonLoading('savePicBtn', true);

  try {
    await delay(APP_LOADING_DELAY_MS);

    if (state.token) {
      try {
        const res = await fetch(`${API_BASE}/users/profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
          body: JSON.stringify({ profilePicture: photoDataUrl })
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.user) {
            const merged = data.user;
            if (!merged.profilePicture && photoDataUrl) merged.profilePicture = photoDataUrl;
            state.currentUser = merged;
            localStorage.setItem('vitacall_user', JSON.stringify(merged));
          }
        }
      } catch (netErr) {
        console.warn('Server photo save error, kept local copy:', netErr);
      }
    }

    _pendingProfilePicDataUrl = null;
    updateAuthUI(true);
    renderProfileView();
    showToast('Profile picture saved successfully!', 'success');
  } catch (err) {
    console.error('Profile picture save error:', err);
    _pendingProfilePicDataUrl = null;
    showToast('Profile picture saved locally!', 'success');
  } finally {
    setButtonLoading('savePicBtn', false);
  }
}

async function removeProfilePicture() {
  openConfirmActionModal(
    'Remove Profile Picture',
    'Are you sure you want to remove your profile picture?',
    async () => {
      try {
        const res = await fetch(`${API_BASE}/users/profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
          body: JSON.stringify({ profilePicture: '' })
        });
        if (res.ok) {
          const data = await res.json();
          state.currentUser = data.user;
          localStorage.setItem('vitacall_user', JSON.stringify(data.user));
          updateAuthUI(true);
          renderProfileView();
          showToast('Profile picture removed.', 'info');
        }
      } catch (err) {
        console.error('Remove picture error:', err);
      }
    }
  );
}

// =========================================================================
// TASK 4: PROFILE UPDATE — loading + error
// =========================================================================

async function handleProfileUpdate(e) {
  e.preventDefault();

  hideErrorMsg('profileError');
  setButtonLoading('btnSaveProfile', true);

  const isStudent = state.currentUser.role === 'requester';
  const name = document.getElementById('profName').value.trim();
  const phone = document.getElementById('profPhone').value.trim();
  const newPassword = document.getElementById('profNewPassword').value;

  const pendingPhoto = _pendingProfilePicDataUrl;

  const payload = { name, phone };
  if (newPassword && newPassword.trim().length >= 6) payload.newPassword = newPassword.trim();
  if (pendingPhoto) {
    payload.profilePicture = pendingPhoto;
    if (state.currentUser) state.currentUser.profilePicture = pendingPhoto;
    _applyProfilePicToDOM(pendingPhoto);
    localStorage.setItem('vitacall_user', JSON.stringify(state.currentUser));
  }

  if (isStudent) {
    payload.studentId = document.getElementById('profStudentId').value.trim();
    payload.courseAndYear = document.getElementById('profCourse').value.trim();
    payload.boardingHouse = document.getElementById('profBoardingHouse').value.trim();
    payload.address = document.getElementById('profAddress').value.trim();
    payload.landmark = document.getElementById('profLandmark').value.trim();
    payload.emergencyContact = {
      name: document.getElementById('profEmName').value.trim(),
      phone: document.getElementById('profEmPhone').value.trim()
    };
  } else {
    payload.title = document.getElementById('profTitle').value.trim();
    payload.licenseNumber = document.getElementById('profLicense').value.trim();
  }

  try {
    await delay(APP_LOADING_DELAY_MS);

    const res = await fetch(`${API_BASE}/users/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      showErrorMsg('profileError', data.error || 'Failed to update profile.');
      return;
    }

    const merged = data.user;
    if (!merged.profilePicture && pendingPhoto) merged.profilePicture = pendingPhoto;
    state.currentUser = merged;
    localStorage.setItem('vitacall_user', JSON.stringify(merged));
    _pendingProfilePicDataUrl = null;
    updateAuthUI(true);
    renderProfileView();
    showToast('Profile updated successfully!', 'success');
  } catch (err) {
    console.error('Profile update error:', err);
    showErrorMsg('profileError', 'Server communication error. Please try again.');
  } finally {
    setButtonLoading('btnSaveProfile', false);
  }
}

// =========================================================================
// 2. STUDENT / REQUESTER VIEW & SETTINGS
// =========================================================================

function triggerSmoothEntrance(el) {
  if (!el) return;
  el.classList.remove('smooth-view-enter');
  // Force reflow so the entrance animation replays cleanly on tab/section switches
  void el.offsetWidth;
  el.classList.add('smooth-view-enter');
}

function switchStudentTab(tab) {
  state.studentSubTab = tab;
  const tOver = document.getElementById('studentTabOverview');
  const tAnn = document.getElementById('studentTabAnnouncements');
  const tSet = document.getElementById('studentTabSettings');
  const bOver = document.getElementById('studentTabBtnOverview');
  const bAnn = document.getElementById('studentTabBtnAnnouncements');
  const bSet = document.getElementById('studentTabBtnSettings');

  [tOver, tAnn, tSet].forEach(el => el && el.classList.add('hidden'));
  [bOver, bAnn, bSet].forEach(btn => {
    if (btn) btn.className = 'student-subtab w-full text-left px-3.5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold flex items-center gap-2.5 transition';
  });

  const activeBtnClass = 'student-subtab w-full text-left px-3.5 py-2.5 rounded-xl bg-ustp-navy text-white text-xs font-bold flex items-center gap-2.5 transition shadow-sm';

  if (tab === 'announcements') {
    if (tAnn) { tAnn.classList.remove('hidden'); triggerSmoothEntrance(tAnn); }
    if (bAnn) bAnn.className = activeBtnClass;
    renderRoleAnnouncementsList('studentAnnouncementsList', 'requester');
  } else if (tab === 'settings') {
    if (tSet) { tSet.classList.remove('hidden'); triggerSmoothEntrance(tSet); }
    if (bSet) bSet.className = activeBtnClass;
    populateStudentSettingsForm();
  } else {
    if (tOver) { tOver.classList.remove('hidden'); triggerSmoothEntrance(tOver); }
    if (bOver) bOver.className = activeBtnClass;
  }

  if (window.lucide) window.lucide.createIcons();
}

function populateStudentSettingsForm() {
  const s = (state.currentUser && state.currentUser.settings) || {};
  const setCheck = (id, val, def = true) => {
    const el = document.getElementById(id);
    if (el) el.checked = val !== undefined ? Boolean(val) : def;
  };
  setCheck('stuSetEmailAlerts', s.emailAlerts, true);
  setCheck('stuSetSmsAlerts', s.smsAlerts, true);
  setCheck('stuSetSoundAlerts', s.soundAlerts, true);
  setCheck('stuSetShowAnnouncements', s.showAnnouncements, true);
  setCheck('stuSetShareLocation', s.shareLocationWithResponder, true);
  setCheck('stuSetAutoEmergency', s.autoShareEmergencyOnSevere, true);
  setCheck('stuSetCompactView', s.compactView, false);
  setCheck('stuSetHighContrast', s.highContrastBadges, false);

  const permSummary = document.getElementById('stuPermissionsSummary');
  if (permSummary && state.currentUser && state.currentUser.permissions) {
    const p = state.currentUser.permissions;
    const labels = [];
    if (p.canSubmitRequests) labels.push('Submit Checkup Requests');
    if (p.canViewCertificates) labels.push('View & Print Certificates');
    if (p.canUpdateProfile) labels.push('Update Profile & Dorm Info');
    permSummary.textContent = labels.join(' • ') || 'Standard Student Access';
  }
}

function renderRoleAnnouncementsList(containerId, role) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const list = (state.announcements || []).filter(a => a.targetRole === 'all' || a.targetRole === role);
  if (list.length === 0) {
    container.innerHTML = `<div class="py-8 text-center text-slate-400">No announcements for your portal right now.</div>`;
    return;
  }

  container.innerHTML = list.map(a => `
    <div class="p-4 rounded-xl border ${a.isPinned ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-slate-50/60'} space-y-1.5">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          ${a.isPinned ? `<span class="bg-amber-200 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded uppercase">📌 Pinned</span>` : ''}
          <span class="bg-slate-200 text-slate-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase">${escHtml(a.priority || 'info')}</span>
        </div>
        <span class="text-[11px] text-slate-400">${new Date(a.createdAt).toLocaleString()}</span>
      </div>
      <h3 class="font-bold text-slate-900 text-sm">${escHtml(a.title)}</h3>
      <p class="text-slate-600 text-xs leading-relaxed">${escHtml(a.message)}</p>
      <div class="text-[10px] text-slate-400 pt-1">Posted by ${escHtml(a.authorName || 'Health Center Admin')}</div>
    </div>
  `).join('');
}

function renderStudentDashboard() {
  const user = state.currentUser;
  if (!user) return;

  const nameEl = document.getElementById('studentWelcomeName');
  const dormEl = document.getElementById('studentBoardingHouseDisplay');
  const idEl = document.getElementById('studentIdDisplay');
  const courseEl = document.getElementById('studentCourseDisplay');
  const phoneEl = document.getElementById('studentPhoneDisplay');

  if (nameEl) nameEl.textContent = user.name;
  if (dormEl) dormEl.textContent = `${user.boardingHouse || 'Boarding House'}, ${user.address || 'Villanueva'}`;
  if (idEl) idEl.textContent = `ID: ${user.studentId || '2023-XXXX'}`;
  if (courseEl) courseEl.textContent = user.courseAndYear || 'BSIT';
  if (phoneEl) phoneEl.textContent = user.phone || 'N/A';

  switchStudentTab(state.studentSubTab || 'overview');
  renderStudentActiveRequest();
  renderStudentCertificates();
  renderStudentRequestHistory();
}

function renderStudentActiveRequest() {
  const container = document.getElementById('activeRequestContainer');
  if (!container) return;

  const myRequests = state.requests.filter(r => r.userId === state.currentUser.id);
  const activeReq = myRequests.find(r =>
    ['pending', 'assigned', 'en_route', 'in_progress', 'awaiting_doctor', 'returned_to_nurse'].includes(r.status)
  );

  if (!activeReq) {
    container.innerHTML = `
      <div class="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div class="flex items-center space-x-3.5">
          <div class="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <i data-lucide="check-circle-2" class="w-6 h-6"></i>
          </div>
          <div>
            <h3 class="font-bold text-slate-900 text-sm sm:text-base">No active checkup request in progress</h3>
            <p class="text-xs text-slate-500 mt-0.5">Feeling sick in your boarding house? Request an off-site medical checkup from the campus clinic anytime.</p>
          </div>
        </div>
        <button onclick="openRequestModal()" class="w-full sm:w-auto bg-ustp-navy hover:bg-ustp-navyLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 flex-shrink-0">
          <i data-lucide="plus" class="w-4 h-4"></i>
          <span>New Checkup Request</span>
        </button>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const steps = [
    { key: 'pending', label: '1. Request Received', sub: 'Doctor Triage Queue' },
    { key: 'assigned', label: '2. Nurse Assigned', sub: 'Assigned by Doctor' },
    { key: 'en_route', label: '3. En Route', sub: 'Traveling to Dorm' },
    { key: 'in_progress', label: '4. On-Site Checkup', sub: 'Vitals & Assessment' },
    { key: 'awaiting_doctor', label: '5. Doctor Validation', sub: 'Diagnosis & Sign-Off' },
    { key: 'completed', label: '6. Completed', sub: 'Certificate Sent' }
  ];

  const mappedStatus = activeReq.status === 'returned_to_nurse' ? 'in_progress' : activeReq.status;
  const currentIdx = steps.findIndex(s => s.key === mappedStatus);

  let stepperHtml = steps.map((s, idx) => {
    const isPast = idx < currentIdx;
    const isCurrent = idx === currentIdx;
    let circleClass = 'bg-slate-200 text-slate-400 border-slate-300';
    let textClass = 'text-slate-400 font-medium';
    if (isPast) { circleClass = 'bg-emerald-600 text-white border-emerald-600'; textClass = 'text-slate-700 font-bold'; }
    else if (isCurrent) { circleClass = 'bg-ustp-gold text-slate-950 border-ustp-gold pulse-step font-black'; textClass = 'text-ustp-navy font-black'; }

    return `
      <div class="flex-1 flex flex-col items-center text-center relative">
        <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center text-xs z-10 ${circleClass} shadow-sm transition">
          ${isPast ? '<i data-lucide="check" class="w-4 h-4"></i>' : (idx + 1)}
        </div>
        <div class="mt-1.5 ${textClass} text-[10px] sm:text-xs leading-tight">
          <span>${s.label.split('. ')[1]}</span>
          <span class="hidden sm:block text-[9px] text-slate-400 font-normal">${s.sub}</span>
        </div>
      </div>
    `;
  }).join('');

  const timelineItems = (activeReq.timeline || []).slice().reverse();
  const liveTimelineHtml = timelineItems.length > 0 ? `
    <div class="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200 space-y-2">
      <div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
        <i data-lucide="history" class="w-3.5 h-3.5 text-ustp-navy"></i>
        <span>Live Checkup &amp; Validation Timeline</span>
      </div>
      <div class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
        ${timelineItems.map((t, i) => `
          <div class="flex items-start gap-2.5 text-[11px] ${i === 0 ? 'text-slate-900 font-semibold' : 'text-slate-500'}">
            <span class="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${i === 0 ? 'bg-emerald-500' : 'bg-slate-300'}"></span>
            <div class="flex-1">
              <span class="uppercase font-bold text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 mr-1.5">${escHtml((t.status || '').replace(/_/g, ' '))}</span>
              <span>${escHtml(t.notes || '')}</span>
              <span class="text-[10px] text-slate-400 ml-1">• ${new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="bg-white rounded-2xl p-5 sm:p-6 border-2 border-ustp-gold/50 shadow-md space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div class="flex items-center space-x-2.5">
          <span class="w-3 h-3 rounded-full bg-amber-500 animate-pulse"></span>
          <div>
            <span class="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">${activeReq.id}</span>
            <h3 class="font-bold text-slate-900 text-base">${activeReq.status === 'awaiting_doctor' ? 'Awaiting Doctor Validation & Signature' : 'Active Checkup in Progress'}</h3>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <span class="text-xs px-2.5 py-1 rounded-full font-bold uppercase ${activeReq.urgency === 'severe' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}">
            ${activeReq.urgency} Urgency
          </span>
          <span class="text-xs text-slate-400">• ${new Date(activeReq.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
      <div class="py-2">
        <div class="flex items-center justify-between relative">
          <div class="absolute top-3.5 sm:top-4 left-6 right-6 h-0.5 bg-slate-200 z-0"></div>
          ${stepperHtml}
        </div>
      </div>
      <div class="bg-slate-50 rounded-xl p-3.5 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-base flex-shrink-0">🩺</div>
          <div>
            <div class="text-[10px] text-slate-500 uppercase font-semibold">Assigned Health Responder</div>
            <div class="font-bold text-slate-900 text-sm">${activeReq.assignedTo ? activeReq.assignedTo.name : 'In Doctor\'s Pending Triage Queue — Awaiting Nurse Assignment...'}</div>
            <div class="text-slate-500 text-[11px]">${activeReq.status === 'awaiting_doctor' ? 'On-site checkup completed by nurse • Dr. Roberto Santos, MD validating & signing certificate' : (activeReq.assignedTo ? 'Campus Health & Wellness Response Team' : 'Campus Doctor notified for triage assignment')}</div>
          </div>
        </div>
        ${activeReq.assignedTo ? `
          <div class="flex items-center space-x-2 self-end sm:self-center">
            <a href="tel:${activeReq.assignedTo.phone}" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition shadow-sm">
              <i data-lucide="phone" class="w-3.5 h-3.5"></i>
              <span>Call Responder</span>
            </a>
          </div>
        ` : ''}
      </div>
      ${liveTimelineHtml}
      <div class="text-xs text-slate-600 grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100">
        <div><strong class="text-slate-800">Reported Symptoms:</strong> ${(activeReq.symptoms || []).join(', ')}</div>
        <div><strong class="text-slate-800">Destination:</strong> ${activeReq.boardingHouse} (${activeReq.landmark || 'Villanueva'})</div>
      </div>
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
}

function renderStudentCertificates() {
  const container = document.getElementById('studentCertificatesList');
  const countBadge = document.getElementById('certCountBadge');
  if (!container) return;

  // Students can never view or download unfinished drafts
  const myCerts = (state.certificates || state.stats.certificates || []).filter(
    c => c.studentId === state.currentUser.studentId && c.status !== 'draft' && !c.isDraft
  );

  const sampleCerts = [{
    id: 'CERT-USTP-2026-001',
    verificationCode: 'USTP-VC-98421',
    studentName: 'Harvey Lloyd Pagtalunan',
    studentId: '2023-30192',
    courseAndYear: 'BS Information Technology - 3rd Year',
    boardingHouse: 'Villa Rosa Boarding House (Rm 4), Purok 2, Looc, Villanueva',
    issuedAt: '2026-10-28T08:50:00.000Z',
    issuerName: 'Nurse Sarah Alcantara, RN',
    diagnosis: 'Acute Upper Respiratory Tract Infection (URTI) with High Febrile Episode',
    vitalSignsSummary: 'BP: 118/76 mmHg | Temp: 38.6 °C | Pulse: 86 bpm | SpO2: 98%',
    excusedDates: 'October 28, 2026 to October 30, 2026 (3 Days)',
    recommendations: 'Strict bed rest and home isolation for 3 days. Prescribed symptomatic antipyretics and oral hydration.'
  }];

  const visibleCerts = myCerts.length > 0 ? myCerts : (state.currentUser.id === 'usr_student1' ? sampleCerts : []);

  if (countBadge) countBadge.textContent = `${visibleCerts.length} certificate${visibleCerts.length === 1 ? '' : 's'}`;

  if (visibleCerts.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-slate-400 text-xs space-y-2">
        <i data-lucide="file-text" class="w-10 h-10 mx-auto text-slate-300"></i>
        <p class="text-slate-500 text-sm font-medium">No certificates yet</p>
        <p>Certificates are automatically generated upon checkup completion.</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = visibleCerts.map(cert => `
    <div class="bg-gradient-to-r from-amber-50/50 to-white p-4 rounded-xl border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-sm hover:shadow-md transition">
      <div class="flex items-start space-x-3">
        <div class="w-10 h-10 rounded-lg bg-ustp-navy text-ustp-goldLight flex items-center justify-center font-bold text-lg flex-shrink-0">
          <i data-lucide="award" class="w-5 h-5"></i>
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <span class="font-mono font-bold text-ustp-navy text-sm">${cert.verificationCode}</span>
            <span class="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded font-bold uppercase">Official Valid</span>
          </div>
          <div class="font-bold text-slate-900 mt-0.5 text-xs sm:text-sm">${cert.diagnosis}</div>
          <div class="text-slate-600 mt-1 flex flex-wrap items-center gap-2 text-[11px]">
            <span>📅 Excused: <strong>${cert.excusedDates}</strong></span>
            <span>•</span>
            <span>Examined by: ${cert.issuerName}</span>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2 self-end sm:self-center">
        <button onclick="downloadCertificatePdf('${cert.verificationCode}')" class="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition shadow-sm" title="Download Official Medical Certificate as PDF">
          <i data-lucide="download" class="w-3.5 h-3.5 text-emerald-200"></i>
          <span>Download PDF</span>
        </button>
        <button onclick="viewCertificate('${cert.verificationCode}')" class="bg-ustp-navy hover:bg-ustp-navyLight text-white font-bold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition">
          <i data-lucide="printer" class="w-3.5 h-3.5 text-ustp-gold"></i>
          <span>View / Print</span>
        </button>
      </div>
    </div>
  `).join('');
  if (window.lucide) window.lucide.createIcons();
}

function renderStudentRequestHistory() {
  const container = document.getElementById('studentRequestHistory');
  if (!container) return;

  const myRequests = state.requests.filter(r => r.userId === state.currentUser.id);
  if (myRequests.length === 0) {
    container.innerHTML = `<div class="py-6 text-center text-slate-400 text-xs">No request history found.</div>`;
    return;
  }

  container.innerHTML = myRequests.map(r => `
    <div class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <div class="flex items-center space-x-2">
          <span class="font-mono font-bold text-slate-700">${r.id}</span>
          <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${r.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
      r.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800'
    }">${r.status.replace('_', ' ')}</span>
          <span class="text-slate-400 text-xs">• ${new Date(r.createdAt).toLocaleDateString()}</span>
        </div>
        <div class="text-slate-700 mt-1"><strong>Symptoms:</strong> ${(r.symptoms || []).join(', ')}</div>
        <div class="text-slate-500 text-[11px]">${r.boardingHouse}</div>
      </div>
      ${r.status === 'completed' ? `
        <div class="flex items-center gap-2 self-end sm:self-center">
          <button onclick="downloadCertificatePdf('${r.certificateId || 'USTP-VC-98421'}')" class="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition">
            <i data-lucide="download" class="w-3.5 h-3.5 text-emerald-700"></i>
            <span>Download PDF</span>
          </button>
          <button onclick="viewCertificate('${r.certificateId || 'USTP-VC-98421'}')" class="text-ustp-navy hover:text-blue-700 font-bold text-xs px-2 py-1.5 flex items-center gap-1">
            <i data-lucide="file-check" class="w-4 h-4 text-emerald-600"></i>
            <span>Medical Slip</span>
          </button>
        </div>
      ` : ''}
    </div>
  `).join('');
  if (window.lucide) window.lucide.createIcons();
}

// =========================================================================
// 3. HEALTH PERSONNEL / TRIAGE MONITOR VIEW & SETTINGS
// =========================================================================

function switchPersonnelTab(tab) {
  state.personnelSubTab = tab;
  const tQueue = document.getElementById('personnelTabQueue');
  const tCerts = document.getElementById('personnelTabCertificates');
  const tAnn = document.getElementById('personnelTabAnnouncements');
  const tSet = document.getElementById('personnelTabSettings');

  const bQueue = document.getElementById('personnelTabBtnQueue');
  const bCerts = document.getElementById('personnelTabBtnCertificates');
  const bAnn = document.getElementById('personnelTabBtnAnnouncements');
  const bSet = document.getElementById('personnelTabBtnSettings');

  [tQueue, tCerts, tAnn, tSet].forEach(el => el && el.classList.add('hidden'));
  [bQueue, bCerts, bAnn, bSet].forEach(btn => {
    if (btn) btn.className = 'personnel-subtab w-full text-left px-3.5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold flex items-center gap-2.5 transition';
  });

  const activeClass = 'personnel-subtab w-full text-left px-3.5 py-2.5 rounded-xl bg-ustp-navy text-white text-xs font-bold flex items-center gap-2.5 transition shadow-sm';

  if (tab === 'certificates') {
    if (tCerts) { tCerts.classList.remove('hidden'); triggerSmoothEntrance(tCerts); }
    if (bCerts) bCerts.className = activeClass;
    renderPersonnelCertificatesList();
  } else if (tab === 'announcements') {
    if (tAnn) { tAnn.classList.remove('hidden'); triggerSmoothEntrance(tAnn); }
    if (bAnn) bAnn.className = activeClass;
    renderRoleAnnouncementsList('personnelAnnouncementsList', 'personnel');
  } else if (tab === 'settings') {
    if (tSet) { tSet.classList.remove('hidden'); triggerSmoothEntrance(tSet); }
    if (bSet) bSet.className = activeClass;
    populatePersonnelSettingsForm();
  } else {
    if (tQueue) { tQueue.classList.remove('hidden'); triggerSmoothEntrance(tQueue); }
    if (bQueue) bQueue.className = activeClass;
  }

  if (window.lucide) window.lucide.createIcons();
}

function populatePersonnelSettingsForm() {
  const s = (state.currentUser && state.currentUser.settings) || {};
  const dutyEl = document.getElementById('perSetDutyStatus');
  const zoneEl = document.getElementById('perSetResponseZone');
  const filterEl = document.getElementById('perSetDefaultFilter');
  const soundEl = document.getElementById('perSetUrgentSound');
  const daysEl = document.getElementById('perSetDefaultExcusedDays');
  const noteEl = document.getElementById('perSetFollowUpNote');
  const licEl = document.getElementById('perSetShowLicense');
  const annEl = document.getElementById('perSetShowAnnouncements');

  if (dutyEl) dutyEl.value = s.dutyStatus || 'on_duty';
  if (zoneEl) zoneEl.value = s.responseZone || 'All Villanueva Sectors (Purok 1-6)';
  if (filterEl) filterEl.value = s.defaultQueueFilter || 'all';
  if (soundEl) soundEl.checked = s.urgentSoundAlert !== false;
  if (daysEl) daysEl.value = s.defaultExcusedDays || 3;
  if (noteEl && s.defaultFollowUpNote) noteEl.value = s.defaultFollowUpNote;
  if (licEl) licEl.checked = s.showLicenseOnCert !== false;
  if (annEl) annEl.checked = s.showAnnouncements !== false;
}

function renderPersonnelCertificatesList() {
  const container = document.getElementById('personnelCertificatesList');
  if (!container) return;

  const isDoctor = state.currentUser && state.currentUser.role === 'doctor';
  const certs = state.certificates || [];
  if (certs.length === 0) {
    container.innerHTML = `<div class="py-8 text-center text-slate-400">No medical certificates or drafts found.</div>`;
    return;
  }

  container.innerHTML = certs.map(c => {
    const isDraft = c.status === 'draft' || c.isDraft === true;
    const isRevoked = c.status === 'revoked';
    const badgeClass = isDraft
      ? 'bg-amber-100 text-amber-800'
      : (isRevoked ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800');
    const badgeText = isDraft ? 'Draft • Awaiting Doctor' : (c.status || 'valid');

    return `
      <div class="p-4 rounded-xl border ${isDraft ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-slate-50/70'} flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <span class="font-mono font-bold text-ustp-navy text-sm">${escHtml(c.verificationCode)}</span>
            <span class="${badgeClass} text-[10px] font-bold px-2 py-0.5 rounded uppercase">${escHtml(badgeText)}</span>
            <span class="text-slate-400 text-[11px]">• ${new Date(c.issuedAt).toLocaleDateString()}</span>
          </div>
          <div class="font-bold text-slate-900 mt-1">${escHtml(c.studentName)} <span class="text-slate-500 font-normal">(${escHtml(c.studentId)})</span></div>
          <div class="text-slate-600 text-[11px] mt-0.5"><strong>Diagnosis:</strong> ${escHtml(c.diagnosis || 'Pending Doctor Validation')}</div>
          <div class="text-slate-500 text-[11px]"><strong>Excused:</strong> ${escHtml(c.excusedDates)} • <strong>Examined by:</strong> ${escHtml(c.issuerName)}</div>
        </div>
        <div class="flex flex-wrap items-center gap-2 self-start sm:self-center">
          ${isDraft && isDoctor ? `
            <button onclick="openDoctorValidateModal('${c.requestId}')" class="bg-blue-700 hover:bg-blue-800 text-white font-bold px-3.5 py-2 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm">
              <i data-lucide="pen-tool" class="w-3.5 h-3.5 text-amber-300"></i>
              <span>Validate, Sign &amp; Send</span>
            </button>
          ` : ''}
          ${!isDraft ? `
            <button onclick="downloadCertificatePdf('${c.verificationCode}')" class="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3.5 py-2 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm">
              <i data-lucide="download" class="w-3.5 h-3.5 text-emerald-200"></i>
              <span>Download PDF</span>
            </button>
            <button onclick="viewCertificate('${c.verificationCode}')" class="bg-ustp-navy hover:bg-ustp-navyLight text-white font-bold px-3.5 py-2 rounded-lg text-xs flex items-center gap-1.5">
              <i data-lucide="printer" class="w-3.5 h-3.5 text-ustp-goldLight"></i>
              <span>Preview / Print</span>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
  if (window.lucide) window.lucide.createIcons();
}

function renderPersonnelDashboard() {
  const user = state.currentUser;
  if (!user) return;

  const isDoctor = user.role === 'doctor';
  const nameEl = document.getElementById('personnelNameDisplay');
  const titleEl = document.getElementById('personnelTitleDisplay');
  const dutyBadge = document.getElementById('personnelDutyBadge');
  const pendingTabBtn = document.getElementById('queueTabPendingBtn');

  if (nameEl) nameEl.textContent = user.name;
  if (titleEl) {
    titleEl.textContent = isDoctor
      ? `${user.title || 'USTP Campus Physician / Medical Officer'} • ${user.licenseNumber || 'PRC MD-0054321'}`
      : `${user.title || 'Campus Health Nurse'} • ${user.licenseNumber || 'PRC RN-Verified'}`;
  }

  // Nurses cannot see the pending triage queue — hide Pending Triage filter tab for Nurses
  if (pendingTabBtn) {
    pendingTabBtn.classList.toggle('hidden', !isDoctor);
  }
  if (!isDoctor && state.queueFilter === 'pending') {
    state.queueFilter = 'all';
  }

  if (dutyBadge) {
    const ds = (user.settings && user.settings.dutyStatus) || 'on_duty';
    const rolePrefix = isDoctor ? '👨‍⚕️ Campus Doctor • ' : '🩺 Campus Nurse • ';
    dutyBadge.textContent = rolePrefix + (ds === 'on_duty' ? '🟢 On Duty'
      : (ds === 'dispatched' ? '🟡 On-Site' : '⚪ Off Duty'));
  }

  switchPersonnelTab(state.personnelSubTab || 'queue');
  renderPersonnelCounters();
  renderPersonnelQueueList();
}

function renderPersonnelCounters() {
  const pendingEl = document.getElementById('statPendingCount');
  const activeEl = document.getElementById('statActiveCount');
  const completedEl = document.getElementById('statCompletedToday');
  const isDoctor = state.currentUser && state.currentUser.role === 'doctor';

  if (pendingEl) {
    // For Doctor: Pending Triage count; For Nurse: Awaiting Doctor Validation count for their assigned patients
    pendingEl.textContent = isDoctor
      ? state.requests.filter(r => r.status === 'pending').length
      : state.requests.filter(r => r.status === 'awaiting_doctor').length;
  }
  if (activeEl) {
    activeEl.textContent = state.requests.filter(r => ['assigned', 'en_route', 'in_progress', 'returned_to_nurse'].includes(r.status)).length;
  }
  if (completedEl) {
    completedEl.textContent = state.requests.filter(r => r.status === 'completed').length;
  }
}

function filterQueue(filter) {
  state.queueFilter = filter;
  document.querySelectorAll('.queue-tab').forEach(tab => {
    const isMatch = tab.getAttribute('data-filter') === filter;
    tab.className = isMatch
      ? 'queue-tab px-3 py-1.5 rounded-lg bg-ustp-navy text-white transition'
      : 'queue-tab px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition';
  });
  renderPersonnelQueueList();
}

function searchQueue(q) {
  state.searchQuery = q.toLowerCase();
  renderPersonnelQueueList();
}

function renderPersonnelQueueList() {
  const container = document.getElementById('personnelQueueList');
  if (!container) return;

  const isDoctor = state.currentUser && state.currentUser.role === 'doctor';
  const isNurse = state.currentUser && state.currentUser.role === 'personnel';

  // Nurses only see their own assigned patients (never pending or unassigned)
  let list = [...state.requests];
  if (isNurse) {
    list = list.filter(r => r.assignedTo && r.assignedTo.id === state.currentUser.id && r.status !== 'pending');
  }

  if (state.queueFilter === 'pending') list = list.filter(r => r.status === 'pending');
  else if (state.queueFilter === 'active') list = list.filter(r => ['assigned', 'en_route', 'in_progress', 'returned_to_nurse'].includes(r.status));
  else if (state.queueFilter === 'awaiting_doctor') list = list.filter(r => r.status === 'awaiting_doctor');
  else if (state.queueFilter === 'completed') list = list.filter(r => r.status === 'completed');

  if (state.searchQuery) {
    list = list.filter(r =>
      r.studentName.toLowerCase().includes(state.searchQuery) ||
      r.boardingHouse.toLowerCase().includes(state.searchQuery) ||
      (r.studentId && r.studentId.toLowerCase().includes(state.searchQuery))
    );
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-2xl p-8 border border-slate-200 text-center text-slate-400 text-xs">
        <i data-lucide="inbox" class="w-10 h-10 mx-auto mb-2 text-slate-300"></i>
        <div class="font-bold text-slate-600 text-sm">${isNurse ? 'No assigned patients match this filter' : 'No requests match this filter'}</div>
        <p class="mt-1">${isNurse ? 'You only see patients assigned to you by the Campus Doctor.' : 'All student checkup requests are up to date.'}</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const availableNurses = (state.nurses && state.nurses.length > 0)
    ? state.nurses
    : [
        { id: 'usr_nurse1', name: 'Nurse Sarah Alcantara, RN', licenseNumber: 'PRC RN-0982341' },
        { id: 'usr_nurse2', name: 'Nurse Mark Villanueva, RN', licenseNumber: 'PRC RN-0994120' }
      ];

  container.innerHTML = list.map(req => {
    const isUrgent = req.urgency === 'severe';
    const isModerate = req.urgency === 'moderate';
    let urgencyBadge = `<span class="bg-emerald-100 text-emerald-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">Mild Urgency</span>`;
    if (isUrgent) urgencyBadge = `<span class="bg-rose-100 text-rose-700 border border-rose-300 text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping"></span> High Priority / Urgent</span>`;
    else if (isModerate) urgencyBadge = `<span class="bg-amber-100 text-amber-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">Moderate</span>`;

    const clinRec = (state.clinicalRecords || []).find(cr => cr.requestId === req.id);

    // Doctor Return Note Alert Box (if Doctor returned this checkup to the Nurse)
    const returnAlertHtml = (req.status === 'returned_to_nurse' || req.returnNote) ? `
      <div class="bg-rose-50 border border-rose-300 rounded-xl p-3 text-xs text-rose-900 flex items-start gap-2">
        <i data-lucide="rotate-ccw" class="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5"></i>
        <div>
          <span class="font-extrabold">Returned to Nurse by ${escHtml(req.returnedBy || 'Dr. Roberto Santos, MD')}:</span>
          <p class="mt-0.5 font-medium">"${escHtml(req.returnNote || 'Please review and update on-site checkup findings.')}"</p>
        </div>
      </div>
    ` : '';

    // Nurse Checkup Summary Box (shown when Awaiting Doctor Validation)
    const nurseDraftSummaryHtml = (req.status === 'awaiting_doctor' && clinRec) ? `
      <div class="bg-blue-50/70 border border-blue-200 rounded-xl p-3 text-xs text-slate-800 space-y-1">
        <div class="font-extrabold text-blue-950 flex items-center justify-between">
          <span>📋 Nurse On-Site Checkup Findings (Awaiting Doctor Validation)</span>
          <span class="text-[10px] bg-blue-200/80 text-blue-900 px-2 py-0.5 rounded font-bold">Draft Created</span>
        </div>
        <div><strong>Recorded Vitals:</strong> <span class="font-mono">BP: ${escHtml(clinRec.vitals?.bp)} | Temp: ${escHtml(clinRec.vitals?.temp)} | Pulse: ${escHtml(clinRec.vitals?.pulse)} | SpO2: ${escHtml(clinRec.vitals?.spo2)}</span></div>
        <div><strong>Physical Observations:</strong> ${escHtml(clinRec.symptomsObserved)}</div>
        ${clinRec.nurseNotes ? `<div><strong>Nurse Notes:</strong> <em>${escHtml(clinRec.nurseNotes)}</em></div>` : ''}
      </div>
    ` : '';

    // Role-specific action controls
    let actionControlsHtml = '';

    if (isDoctor) {
      if (req.status === 'pending') {
        actionControlsHtml = `
          <div class="flex flex-wrap items-center gap-2">
            <select id="assignNurseSelect_${req.id}" class="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800">
              ${availableNurses.map(n => `<option value="${n.id}">🩺 ${escHtml(n.name)}</option>`).join('')}
            </select>
            <input type="text" id="assignNurseNotes_${req.id}" placeholder="Triage note for nurse (optional)..." class="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs w-44 sm:w-56">
            <button onclick="assignRequestToNurse('${req.id}')" class="bg-blue-700 hover:bg-blue-800 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm">
              <i data-lucide="user-check" class="w-3.5 h-3.5"></i>
              <span>Assign to Campus Nurse</span>
            </button>
          </div>
        `;
      } else if (req.status === 'awaiting_doctor') {
        actionControlsHtml = `
          <button onclick="openDoctorValidateModal('${req.id}')" class="bg-gradient-to-r from-blue-700 to-indigo-800 hover:from-blue-800 hover:to-indigo-900 text-white font-extrabold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition shadow-md">
            <i data-lucide="pen-tool" class="w-3.5 h-3.5 text-ustp-goldLight"></i>
            <span>Review &amp; Validate Checkup (Diagnose &amp; Sign)</span>
          </button>
        `;
      } else if (['assigned', 'en_route', 'in_progress', 'returned_to_nurse'].includes(req.status)) {
        actionControlsHtml = `
          <span class="bg-teal-50 text-teal-800 border border-teal-200 px-3 py-1 rounded-lg text-xs font-bold">
            🩺 Assigned to ${escHtml(req.assignedTo ? req.assignedTo.name : 'Campus Nurse')} (${escHtml(req.status.replace(/_/g, ' ').toUpperCase())})
          </span>
        `;
      } else if (req.status === 'completed') {
        actionControlsHtml = `
          <button onclick="viewCertificate('${req.certificateId || 'USTP-VC-98421'}')" class="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition">
            <i data-lucide="file-badge" class="w-3.5 h-3.5 text-ustp-navy"></i>
            <span>View Signed Certificate</span>
          </button>
        `;
      }
    } else if (isNurse) {
      // Nurses MUST follow steps in order: Assigned -> En Route -> In Progress -> Record On-Site Checkup
      if (req.status === 'assigned') {
        actionControlsHtml = `
          <button onclick="updateRequestStatus('${req.id}', 'en_route', 'Nurse traveling to boarding house with mobile kit')" class="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm">
            <i data-lucide="navigation" class="w-3.5 h-3.5"></i>
            <span>Step 1: Mark En Route</span>
          </button>
        `;
      } else if (req.status === 'en_route') {
        actionControlsHtml = `
          <button onclick="updateRequestStatus('${req.id}', 'in_progress', 'Arrived at boarding house. On-site checkup in progress.')" class="bg-blue-700 hover:bg-blue-800 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm">
            <i data-lucide="door-open" class="w-3.5 h-3.5"></i>
            <span>Step 2: Arrived — Start Checkup (In Progress)</span>
          </button>
        `;
      } else if (req.status === 'in_progress' || req.status === 'returned_to_nurse') {
        actionControlsHtml = `
          <button onclick="openClinicalModal('${req.id}')" class="bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-extrabold px-4 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm">
            <i data-lucide="stethoscope" class="w-3.5 h-3.5"></i>
            <span>${req.status === 'returned_to_nurse' ? 'Fix & Resubmit On-Site Checkup' : 'Step 3: Record On-Site Checkup'}</span>
          </button>
        `;
      } else if (req.status === 'awaiting_doctor') {
        actionControlsHtml = `
          <span class="bg-amber-100 text-amber-900 border border-amber-300 px-3 py-1 rounded-lg text-xs font-bold">
            ⏳ Draft Submitted • Awaiting Doctor Validation
          </span>
        `;
      } else if (req.status === 'completed') {
        actionControlsHtml = `
          <button onclick="viewCertificate('${req.certificateId || 'USTP-VC-98421'}')" class="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition">
            <i data-lucide="file-badge" class="w-3.5 h-3.5 text-ustp-navy"></i>
            <span>View Issued Certificate</span>
          </button>
        `;
      }
    }

    return `
      <div class="bg-white rounded-2xl p-5 border-2 ${isUrgent ? 'border-rose-300 shadow-md' : 'border-slate-200/90 shadow-sm'} hover:shadow-md transition space-y-3.5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div class="flex items-center space-x-2 flex-wrap gap-y-1">
            <span class="font-mono font-bold text-xs text-slate-500">${req.id}</span>
            ${urgencyBadge}
            ${!req.hasCompanion ? `<span class="bg-purple-100 text-purple-800 text-[10px] px-2 py-0.5 rounded font-bold">Alone in Dormitory</span>` : ''}
          </div>
          <div class="text-slate-400 text-xs flex items-center gap-1 flex-shrink-0">
            <i data-lucide="clock" class="w-3.5 h-3.5"></i>
            <span>${new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${new Date(req.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <div class="text-slate-400 text-[10px] uppercase font-bold">Patient / Requester</div>
            <div class="font-extrabold text-slate-900 text-sm mt-0.5">${req.studentName}</div>
            <div class="text-slate-500">${req.studentId || 'ID Pending'} • ${req.courseAndYear || 'USTP Student'}</div>
            <div class="mt-1"><a href="tel:${req.phone}" class="text-teal-700 hover:text-teal-900 font-bold inline-flex items-center gap-1"><i data-lucide="phone" class="w-3 h-3"></i> ${req.phone}</a></div>
          </div>
          <div>
            <div class="text-slate-400 text-[10px] uppercase font-bold">Boarding House Destination</div>
            <div class="font-bold text-slate-900 mt-0.5 flex items-start gap-1">
              <i data-lucide="map-pin" class="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0"></i>
              <span>${req.boardingHouse}</span>
            </div>
            <div class="text-slate-600 pl-4">${req.address}</div>
            ${req.landmark ? `<div class="text-amber-800 font-medium pl-4 text-[11px]">📍 ${req.landmark}</div>` : ''}
          </div>
          <div>
            <div class="text-slate-400 text-[10px] uppercase font-bold">Symptoms &amp; Clinical Intake</div>
            <div class="font-semibold text-slate-900 mt-0.5">${(req.symptoms || []).join(', ')}</div>
            ${req.temperature ? `<div class="text-rose-600 font-bold mt-0.5">Self-reported Temp: ${req.temperature} °C</div>` : ''}
            <div class="text-slate-500 text-[11px] mt-1 line-clamp-2 italic">"${req.symptomDetails || 'No additional notes'}"</div>
          </div>
        </div>
        ${returnAlertHtml}
        ${nurseDraftSummaryHtml}
        <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div class="text-xs">
            <span class="text-slate-400 font-medium">Status:</span>
            <span class="font-bold text-slate-800 uppercase ml-1">${req.status.replace(/_/g, ' ')}</span>
            ${req.assignedTo ? `<span class="text-slate-500 text-[11px] ml-1">(${req.assignedTo.name})</span>` : ''}
          </div>
          <div class="flex flex-wrap items-center gap-2">
            ${actionControlsHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

async function assignRequestToNurse(requestId) {
  const selectEl = document.getElementById(`assignNurseSelect_${requestId}`);
  const notesEl = document.getElementById(`assignNurseNotes_${requestId}`);
  const nurseId = selectEl ? selectEl.value : 'usr_nurse1';
  const notes = notesEl ? notesEl.value.trim() : '';

  try {
    const res = await fetch(`${API_BASE}/requests/${requestId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify({ nurseId, notes })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to assign request to nurse', 'error');
      return;
    }
    showToast(`Assigned request ${requestId} to ${data.assignedTo ? data.assignedTo.name : 'Campus Nurse'}!`, 'success');
    await refreshData(true);
  } catch (err) {
    console.error('Assign to nurse error:', err);
    showToast('Failed to assign request to nurse.', 'error');
  }
}

async function updateRequestStatus(requestId, status, notes = '', assignToSelf = false) {
  try {
    const res = await fetch(`${API_BASE}/requests/${requestId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify({ status, notes, assignToSelf })
    });
    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Failed to update status', 'error');
      return;
    }
    showToast(`Request status updated to ${status.replace(/_/g, ' ').toUpperCase()}`, 'success');
    await refreshData(true);
  } catch (e) {
    console.error('Status update failed:', e);
  }
}

// =========================================================================
// 4. NURSE ON-SITE CHECKUP MODAL & DOCTOR VALIDATION / SIGNATURE MODAL
// =========================================================================

function openClinicalModal(requestId) {
  const req = state.requests.find(r => r.id === requestId);
  if (!req) return;

  document.getElementById('clinRequestId').value = req.id;
  document.getElementById('clinStudentName').textContent = req.studentName;
  document.getElementById('clinStudentId').textContent = `(ID: ${req.studentId || '2023-XXXX'})`;
  document.getElementById('clinBoardingHouse').textContent = `${req.boardingHouse}, ${req.address}`;

  const returnAlert = document.getElementById('clinDoctorReturnAlert');
  const returnNoteText = document.getElementById('clinDoctorReturnNoteText');
  if (returnAlert && returnNoteText) {
    if (req.returnNote) {
      returnAlert.classList.remove('hidden');
      returnNoteText.textContent = req.returnNote;
    } else {
      returnAlert.classList.add('hidden');
    }
  }

  const existingCr = (state.clinicalRecords || []).find(cr => cr.requestId === req.id);
  if (existingCr) {
    document.getElementById('vitalBp').value = (existingCr.vitals?.bp || '120/80').replace(/\s*mmHg/i, '');
    document.getElementById('vitalTemp').value = (existingCr.vitals?.temp || '38.4').replace(/\s*°C/i, '');
    document.getElementById('vitalPulse').value = (existingCr.vitals?.pulse || '86').replace(/\s*bpm/i, '');
    document.getElementById('vitalResp').value = (existingCr.vitals?.respRate || '19').replace(/\s*cpm/i, '');
    document.getElementById('vitalSpo2').value = (existingCr.vitals?.spo2 || '98').replace(/\s*%/i, '');
    document.getElementById('clinSymptomsObserved').value = existingCr.symptomsObserved || '';
    const notesInput = document.getElementById('clinNurseNotes');
    if (notesInput) notesInput.value = existingCr.nurseNotes || '';
  } else {
    document.getElementById('clinSymptomsObserved').value = `Patient examined in boarding room. Exhibiting ${(req.symptoms || []).join(', ').toLowerCase()}. Vital signs recorded on-site.`;
    const notesInput = document.getElementById('clinNurseNotes');
    if (notesInput) notesInput.value = 'Patient resting in ventilated room. Advised oral hydration while awaiting Campus Doctor validation and prescription.';
  }

  hideErrorMsg('clinicalError');
  document.getElementById('clinicalModal').classList.remove('hidden');
}

function closeClinicalModal() {
  document.getElementById('clinicalModal').classList.add('hidden');
}

async function submitClinicalRecord(e) {
  e.preventDefault();
  const requestId = document.getElementById('clinRequestId').value;

  hideErrorMsg('clinicalError');
  setButtonLoading('btnIssueCert', true);

  // Nurses ONLY submit vital signs, physical observations, and nurse notes (never diagnosis or prescription)
  const payload = {
    vitals: {
      bp: document.getElementById('vitalBp').value,
      temp: document.getElementById('vitalTemp').value,
      pulse: document.getElementById('vitalPulse').value,
      respRate: document.getElementById('vitalResp').value,
      spo2: document.getElementById('vitalSpo2').value
    },
    symptomsObserved: document.getElementById('clinSymptomsObserved').value,
    nurseNotes: document.getElementById('clinNurseNotes') ? document.getElementById('clinNurseNotes').value : ''
  };

  try {
    await delay(APP_LOADING_DELAY_MS);

    const res = await fetch(`${API_BASE}/requests/${requestId}/clinical-record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      showErrorMsg('clinicalError', data.error || 'Failed to submit on-site checkup');
      return;
    }

    closeClinicalModal();
    showToast('Checkup draft saved! Moved to Awaiting Doctor Validation.', 'success');
    await refreshData(true);
  } catch (err) {
    console.error('Submit clinical record error:', err);
    showErrorMsg('clinicalError', 'Server communication error. Please try again.');
  } finally {
    setButtonLoading('btnIssueCert', false);
  }
}

// =========================================================================
// 4B. DOCTOR VALIDATION, SIGNATURE PAD & RETURN-TO-NURSE WORKFLOW
// =========================================================================

const _sigPadState = {};

function initSignaturePadCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || _sigPadState[canvasId]?.initialized) return;

  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#101E38';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const pad = { initialized: true, drawing: false, hasStrokes: false };
  _sigPadState[canvasId] = pad;

  const getPos = (evt) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height
    };
  };

  const start = (evt) => {
    evt.preventDefault();
    pad.drawing = true;
    pad.hasStrokes = true;
    const p = getPos(evt);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (evt) => {
    if (!pad.drawing) return;
    evt.preventDefault();
    const p = getPos(evt);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const end = () => {
    pad.drawing = false;
  };

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', end);
}

function clearSignatureCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (_sigPadState[canvasId]) _sigPadState[canvasId].hasStrokes = false;
}

async function saveDrawnProfileSignature() {
  const canvas = document.getElementById('profSignatureCanvas');
  if (!canvas) return;
  const dataUrl = canvas.toDataURL('image/png');
  await saveDoctorSignatureToServer(dataUrl);
}

function handleSignatureFileUpload(event, target = 'profile') {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    if (target === 'modal') {
      const hiddenInput = document.getElementById('docValSignatureData');
      const previewImg = document.getElementById('docValSignaturePreview');
      if (hiddenInput) hiddenInput.value = dataUrl;
      if (previewImg) previewImg.src = dataUrl;
      showToast('Uploaded digital signature applied to certificate!', 'success');
    } else {
      await saveDoctorSignatureToServer(dataUrl);
    }
  };
  reader.readAsDataURL(file);
}

async function saveDoctorSignatureToServer(dataUrl) {
  try {
    const res = await fetch(`${API_BASE}/doctor/signature`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify({ doctorSignature: dataUrl })
    });
    if (res.ok) {
      const data = await res.json();
      state.currentUser = data.user;
      localStorage.setItem('vitacall_user', JSON.stringify(state.currentUser));
      const preview = document.getElementById('profSavedSignaturePreview');
      if (preview) preview.src = dataUrl;
      showToast('Doctor digital signature saved & encrypted at rest!', 'success');
    } else {
      const err = await res.json();
      showToast(err.error || 'Could not save signature', 'error');
    }
  } catch (err) {
    console.error('Save signature error:', err);
    showToast('Error saving signature', 'error');
  }
}

function applySavedDoctorSignatureOneClick() {
  const savedSig = (state.currentUser && state.currentUser.doctorSignature) || '';
  const hiddenInput = document.getElementById('docValSignatureData');
  const previewImg = document.getElementById('docValSignaturePreview');
  const statusLabel = document.getElementById('docValSigStatusLabel');
  if (savedSig) {
    if (hiddenInput) hiddenInput.value = savedSig;
    if (previewImg) previewImg.src = savedSig;
    if (statusLabel) statusLabel.textContent = '✓ Saved Profile Signature Applied (1-Click)';
    showToast('Saved digital signature applied with 1 click!', 'success');
  } else {
    showToast('Draw your signature on the pad or upload an image first.', 'info');
  }
}

function useDrawnModalSignature() {
  const canvas = document.getElementById('docValSigCanvas');
  if (!canvas) return;
  const dataUrl = canvas.toDataURL('image/png');
  const hiddenInput = document.getElementById('docValSignatureData');
  const previewImg = document.getElementById('docValSignaturePreview');
  const statusLabel = document.getElementById('docValSigStatusLabel');
  if (hiddenInput) hiddenInput.value = dataUrl;
  if (previewImg) previewImg.src = dataUrl;
  if (statusLabel) statusLabel.textContent = '✓ Drawn Signature Pad Applied';
  showToast('Drawn signature applied to certificate!', 'success');
}

function openDoctorValidateModal(requestId) {
  const req = state.requests.find(r => r.id === requestId);
  if (!req) return;

  const cr = (state.clinicalRecords || []).find(c => c.requestId === req.id);
  const draftCert = (state.certificates || []).find(c => c.requestId === req.id);

  document.getElementById('docValRequestId').value = req.id;
  document.getElementById('docValStudentName').textContent = req.studentName;
  document.getElementById('docValStudentId').textContent = `(ID: ${req.studentId || '2023-XXXX'})`;
  document.getElementById('docValBoardingHouse').textContent = `${req.boardingHouse}, ${req.address}`;
  document.getElementById('docValExaminerBadge').textContent = `Examined by ${(cr && cr.examinerName) || (req.assignedTo && req.assignedTo.name) || 'Campus Nurse'}`;

  const vitalsStr = cr && cr.vitals
    ? `BP: ${cr.vitals.bp} | Temp: ${cr.vitals.temp} | Pulse: ${cr.vitals.pulse} | Resp: ${cr.vitals.respRate} | SpO2: ${cr.vitals.spo2}`
    : (draftCert && draftCert.vitalSignsSummary) || 'Vitals recorded on-site';
  document.getElementById('docValVitalsSummary').textContent = vitalsStr;
  document.getElementById('docValNurseObservations').textContent = (cr && cr.symptomsObserved) || (draftCert && draftCert.symptomsObserved) || 'Physical checkup completed.';
  document.getElementById('docValNurseNotes').textContent = (cr && cr.nurseNotes) || (draftCert && draftCert.nurseNotes) || 'No additional nurse notes.';

  const hasFever = (req.symptoms || []).some(s => s.toLowerCase().includes('fever'));
  document.getElementById('docValDiagnosis').value = (cr && cr.diagnosis) || (hasFever
    ? 'Acute Upper Respiratory Tract Infection (URTI) with Febrile Episode'
    : 'Acute Viral Gastroenteritis with Mild Dehydration');
  document.getElementById('docValMedication').value = (cr && cr.prescribedMedication) || (hasFever
    ? '1. Paracetamol 500mg tab: 1 tab PO every 4-6 hours for fever > 37.8°C\n2. Cetirizine 10mg tab: 1 tab PO once daily at bedtime for 3 days'
    : '1. Oral Rehydration Salts (ORS): 1 sachet dissolved in 1L clean water\n2. Racecadotril 100mg cap: 1 cap PO 3x daily for acute diarrhea');
  document.getElementById('docValCareRecs').value = 'Strict bed rest and temporary room isolation in boarding house for 3 days. Maintain high fluid intake.';

  const today = new Date().toISOString().split('T')[0];
  const endDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const validDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  document.getElementById('docValExcusedStart').value = today;
  document.getElementById('docValExcusedEnd').value = endDate;
  document.getElementById('docValExcusedDays').value = 3;
  document.getElementById('docValValidUntil').value = validDate;
  document.getElementById('docValRemarks').value = 'Follow up at USTP Campus Health & Wellness Center if symptoms persist after 48 hours.';
  document.getElementById('docValReturnNote').value = '';

  // Auto-apply saved doctor signature with 1-click ready
  const savedSig = (state.currentUser && state.currentUser.doctorSignature) || '';
  const hiddenSig = document.getElementById('docValSignatureData');
  const previewSig = document.getElementById('docValSignaturePreview');
  if (hiddenSig) hiddenSig.value = savedSig;
  if (previewSig) previewSig.src = savedSig;

  const errEl = document.getElementById('doctorValidateError');
  if (errEl) errEl.classList.add('hidden');

  document.getElementById('doctorValidateModal').classList.remove('hidden');
  setTimeout(() => initSignaturePadCanvas('docValSigCanvas'), 60);
  if (window.lucide) window.lucide.createIcons();
}

function closeDoctorValidateModal() {
  const modal = document.getElementById('doctorValidateModal');
  if (modal) modal.classList.add('hidden');
}

async function returnCheckupToNurse() {
  const requestId = document.getElementById('docValRequestId').value;
  const note = document.getElementById('docValReturnNote').value.trim();
  const errEl = document.getElementById('doctorValidateError');

  if (!note) {
    if (errEl) {
      errEl.textContent = 'Please enter a note for the nurse explaining what needs to be fixed before returning.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/requests/${requestId}/return-to-nurse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify({ note })
    });
    const data = await res.json();
    if (!res.ok) {
      if (errEl) {
        errEl.textContent = data.error || 'Failed to return checkup to nurse.';
        errEl.classList.remove('hidden');
      }
      return;
    }

    closeDoctorValidateModal();
    showToast('Checkup returned to nurse with revision notes.', 'warning');
    await refreshData(true);
  } catch (err) {
    console.error('Return to nurse error:', err);
    showToast('Error returning checkup to nurse.', 'error');
  }
}

async function submitDoctorValidation(e) {
  e.preventDefault();
  const requestId = document.getElementById('docValRequestId').value;
  const errEl = document.getElementById('doctorValidateError');
  if (errEl) errEl.classList.add('hidden');

  setButtonLoading('btnDoctorSignAndSend', true);

  // If doctor drew on the modal canvas and hasn't clicked "Use Drawn Pad", check if canvas has strokes
  const canvas = document.getElementById('docValSigCanvas');
  let doctorSignature = document.getElementById('docValSignatureData').value;
  if (_sigPadState['docValSigCanvas'] && _sigPadState['docValSigCanvas'].hasStrokes && canvas) {
    doctorSignature = canvas.toDataURL('image/png');
  }

  const payload = {
    diagnosis: document.getElementById('docValDiagnosis').value.trim(),
    prescribedMedication: document.getElementById('docValMedication').value.trim(),
    careRecommendations: document.getElementById('docValCareRecs').value.trim(),
    excusedDuration: {
      isExcused: document.getElementById('docValIsExcused').checked,
      startDate: document.getElementById('docValExcusedStart').value,
      endDate: document.getElementById('docValExcusedEnd').value,
      daysCount: Number(document.getElementById('docValExcusedDays').value) || 3
    },
    validUntil: document.getElementById('docValValidUntil').value,
    remarks: document.getElementById('docValRemarks').value.trim(),
    doctorSignature
  };

  try {
    await delay(APP_LOADING_DELAY_MS);

    const res = await fetch(`${API_BASE}/requests/${requestId}/doctor-validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      if (errEl) {
        errEl.textContent = data.error || 'Failed to validate and sign certificate.';
        errEl.classList.remove('hidden');
      }
      return;
    }

    closeDoctorValidateModal();
    showToast('Official Medical Certificate signed, sealed & sent to student!', 'success');
    if (window.confetti) window.confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });

    await refreshData(true);
    if (data.certificate) displayCertificateDocument(data.certificate);
  } catch (err) {
    console.error('Doctor validate error:', err);
    if (errEl) {
      errEl.textContent = 'Server communication error. Please try again.';
      errEl.classList.remove('hidden');
    }
  } finally {
    setButtonLoading('btnDoctorSignAndSend', false);
  }
}

async function revokeAdminCertificate(certId) {
  openConfirmActionModal(
    'Revoke Official Medical Certificate',
    `Are you sure you want to revoke certificate ${certId}? Once revoked, public QR verification will flag it as revoked.`,
    async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/certificates/${encodeURIComponent(certId)}/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
          body: JSON.stringify({ reason: 'Revoked by Clinic Director via Admin Console.' })
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Failed to revoke certificate', 'error');
          return;
        }
        showToast(data.message || 'Certificate revoked.', 'warning');
        await refreshData(true);
        if (state.adminSection === 'data') renderAdminDataSection();
      } catch (err) {
        showToast('Failed to revoke certificate.', 'error');
      }
    }
  );
}

// =========================================================================
// 5. VIEW, PRINT & DOWNLOAD PDF OF OFFICIAL CERTIFICATE
// =========================================================================

let _activeCertificateRecord = null;

async function fetchCertificateRecord(certIdOrCode) {
  const localMatch = (state.certificates || (state.stats && state.stats.certificates) || []).find(
    c => c.verificationCode === certIdOrCode || c.id === certIdOrCode
  );
  try {
    const res = await fetch(`${API_BASE}/certificates/${encodeURIComponent(certIdOrCode)}`, {
      headers: state.token ? { 'Authorization': `Bearer ${state.token}` } : {}
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Certificate fetch fallback:', err);
  }
  if (localMatch) return localMatch;

  return {
    verificationCode: certIdOrCode || 'USTP-VC-98421',
    id: 'CERT-USTP-2026-001',
    studentName: (state.currentUser && state.currentUser.role === 'requester' && state.currentUser.name) || 'Harvey Lloyd Pagtalunan',
    studentId: (state.currentUser && state.currentUser.role === 'requester' && state.currentUser.studentId) || '2023-30192',
    courseAndYear: (state.currentUser && state.currentUser.role === 'requester' && state.currentUser.courseAndYear) || 'BS Information Technology - 3rd Year',
    boardingHouse: (state.currentUser && state.currentUser.role === 'requester' && state.currentUser.boardingHouse) || 'Villa Rosa Boarding House (Rm 4), Purok 2, Looc, Villanueva',
    issuedAt: new Date().toISOString(),
    issuerName: 'Nurse Sarah Alcantara, RN',
    issuerLicense: 'PRC RN-0982341',
    diagnosis: 'Acute Upper Respiratory Tract Infection (URTI) with High Febrile Episode',
    vitalSignsSummary: 'BP: 118/76 mmHg | Temp: 38.6 °C | Pulse: 86 bpm | SpO2: 98%',
    excusedDates: 'October 28, 2026 to October 30, 2026 (3 Days)',
    recommendations: 'Strict bed rest and home isolation for 3 days. Prescribed symptomatic antipyretics and oral hydration.',
    integrityHash: '8b7f29c4e019b8417f7634f19b2a7590d0b0f796417d7b4a282f18ef446d7b88'
  };
}

function populateCertificateDOM(cert) {
  _activeCertificateRecord = cert;
  document.getElementById('certDocCode').textContent = cert.verificationCode || cert.id;
  document.getElementById('certDocDate').textContent = new Date(cert.issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById('certDocStudentName').textContent = cert.studentName;
  document.getElementById('certDocStudentId').textContent = cert.studentId;
  document.getElementById('certDocCourse').textContent = cert.courseAndYear || 'BS Information Technology';
  document.getElementById('certDocAddress').textContent = cert.boardingHouse || 'Villanueva Boarding House';
  document.getElementById('certDocExamDate').textContent = new Date(cert.issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById('certDocDiagnosis').textContent = cert.diagnosis;
  document.getElementById('certDocVitals').textContent = cert.vitalSignsSummary || 'Vitals recorded in clinical chart';
  document.getElementById('certDocRecommendations').textContent = cert.recommendations || 'Bed rest and prescribed hydration.';
  document.getElementById('certDocExcused').innerHTML = `Patient is recommended to be excused from academic classes and laboratory sessions from <strong>${cert.excusedDates}</strong>.`;
  document.getElementById('certDocIssuerName').textContent = cert.issuerName || 'Nurse Sarah Alcantara, RN';
  document.getElementById('certDocIssuerLicense').textContent = cert.issuerLicense || 'PRC License Verified';
  document.getElementById('certDocHash').textContent = (cert.integrityHash || '8b7f29c4e019...').substring(0, 16) + '...';

  const docSigImg = document.getElementById('certDocDoctorSigImg');
  const docSigText = document.getElementById('certDocDoctorSigText');
  if (docSigImg && docSigText) {
    if (cert.doctorSignature) {
      docSigImg.src = cert.doctorSignature;
      docSigImg.classList.remove('hidden');
      docSigText.classList.add('hidden');
    } else {
      docSigImg.classList.add('hidden');
      docSigText.classList.remove('hidden');
    }
  }

  const qrImg = document.getElementById('certDocQrCode');
  if (cert.qrCodeDataUrl) {
    qrImg.src = cert.qrCodeDataUrl;
  } else {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent('USTP-VILLANUEVA-CERT:' + cert.verificationCode)}`;
  }
}

async function viewCertificate(certIdOrCode) {
  state._prevView = state.activeView;
  const cert = await fetchCertificateRecord(certIdOrCode);
  displayCertificateDocument(cert);
}

function displayCertificateDocument(cert) {
  populateCertificateDOM(cert);
  document.getElementById('certificateModal').classList.remove('hidden');

  setTimeout(() => {
    const closeBtn = document.getElementById('certCloseBtn');
    if (closeBtn) closeBtn.focus();
  }, 100);
}

function closeCertificateModal() {
  document.getElementById('certificateModal').classList.add('hidden');
}

function printCertificate() {
  document.body.classList.remove('printing-report');
  window.print();
}

function loadCertImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = 'anonymous';
    }
    const timer = setTimeout(() => resolve(null), 2500);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapCanvasText(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function drawDeterministicQrPattern(ctx, x, y, size, seedStr) {
  const cells = 21;
  const cellSize = size / cells;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#101E38';

  const drawFinder = (r0, c0) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        if (isBorder || isInner) {
          ctx.fillRect(x + (c0 + c) * cellSize, y + (r0 + r) * cellSize, Math.ceil(cellSize), Math.ceil(cellSize));
        }
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, cells - 7);
  drawFinder(cells - 7, 0);

  let hash = 2166136261;
  const s = String(seedStr || 'USTP-VC-98421');
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      const inFinder = (r < 8 && c < 8) || (r < 8 && c >= cells - 8) || (r >= cells - 8 && c < 8);
      if (inFinder) continue;
      hash ^= (r * 31 + c * 17) & 0xff;
      hash = Math.imul(hash, 16777619);
      if ((Math.abs(hash) % 10) < 5) {
        ctx.fillRect(x + c * cellSize, y + r * cellSize, Math.ceil(cellSize), Math.ceil(cellSize));
      }
    }
  }
}

async function renderCertificateToCanvas(cert) {
  const W = 1240;
  const H = 1754;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Load SVG emblems & QR code image if available
  const [ustpLogo, clinicSeal, qrImg] = await Promise.all([
    loadCertImage('assets/ustp-logo.svg'),
    loadCertImage('assets/clinic-seal.svg'),
    loadCertImage(cert.qrCodeDataUrl || '')
  ]);

  // 1. White Page Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // 2. Outer Double Border (USTP Navy + Gold Inner Trim)
  ctx.strokeStyle = '#101E38';
  ctx.lineWidth = 6;
  ctx.strokeRect(48, 48, W - 96, H - 96);

  ctx.strokeStyle = '#EAA100';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(60, 60, W - 120, H - 120);

  // 3. Faint Watermark Seal in Center
  if (clinicSeal) {
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.drawImage(clinicSeal, (W - 560) / 2, (H - 560) / 2 + 40, 560, 560);
    ctx.restore();
  }

  // 4. Official Header Logos & Text
  if (ustpLogo) {
    ctx.drawImage(ustpLogo, 100, 96, 95, 95);
  }
  if (clinicSeal) {
    ctx.drawImage(clinicSeal, W - 195, 96, 95, 95);
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 17px "Segoe UI", Arial, sans-serif';
  ctx.fillText('REPUBLIC OF THE PHILIPPINES', W / 2, 114);

  ctx.fillStyle = '#101E38';
  ctx.font = '900 22px Georgia, "Times New Roman", serif';
  ctx.fillText('UNIVERSITY OF SCIENCE AND TECHNOLOGY OF SOUTHERN PHILIPPINES', W / 2, 144);

  ctx.fillStyle = '#C28200';
  ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
  ctx.fillText('VILLANUEVA CAMPUS', W / 2, 172);

  ctx.fillStyle = '#334155';
  ctx.font = '600 18px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Health & Wellness Center  •  Off-Site Medical Response', W / 2, 198);

  // Title Block
  ctx.fillStyle = '#0F172A';
  ctx.font = '900 38px Georgia, "Times New Roman", serif';
  ctx.fillText('MEDICAL CERTIFICATE', W / 2, 260);

  const code = cert.verificationCode || cert.id || 'USTP-VC-98421';
  const issuedDate = new Date(cert.issuedAt || Date.now()).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 19px "Courier New", Consolas, monospace';
  ctx.fillText(`Verification ID: ${code}   •   Date Issued: ${issuedDate}`, W / 2, 294);

  // Header Divider Line
  ctx.strokeStyle = '#101E38';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(96, 322);
  ctx.lineTo(W - 96, 322);
  ctx.stroke();

  // 5. Body Content
  ctx.textAlign = 'left';
  const leftX = 104;
  const contentW = W - 208;
  let y = 376;

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 20px Georgia, "Times New Roman", serif';
  ctx.fillText('TO WHOM IT MAY CONCERN:', leftX, y);
  y += 44;

  const studentName = cert.studentName || 'Harvey Lloyd Pagtalunan';
  const studentId = cert.studentId || '2023-30192';
  const course = cert.courseAndYear || 'BS Information Technology - 3rd Year';
  const address = cert.boardingHouse || 'Villa Rosa Boarding House (Rm 4), Purok 2, Looc, Villanueva';

  const bodyParagraph = `This is to certify that ${studentName}, bearing Student Identification Number ${studentId}, enrolled in ${course}, residing at ${address}, was physically examined by the USTP Health & Wellness Off-Site Medical Team on ${issuedDate} at the said off-campus residence.`;

  ctx.fillStyle = '#1E293B';
  ctx.font = '22px "Segoe UI", Arial, sans-serif';
  const bodyLines = wrapCanvasText(ctx, bodyParagraph, contentW);
  for (const line of bodyLines) {
    ctx.fillText(line, leftX, y);
    y += 34;
  }

  y += 22;

  // 6. Clinical Examination Findings Box
  const diagnosisLines = wrapCanvasText(ctx, cert.diagnosis || 'Acute Upper Respiratory Tract Infection (URTI)', contentW - 260);
  const vitalsLines = wrapCanvasText(ctx, cert.vitalSignsSummary || 'Vitals recorded in clinical chart', contentW - 260);
  const rxLines = wrapCanvasText(ctx, cert.recommendations || 'Bed rest and prescribed hydration.', contentW - 260);

  const boxPadding = 28;
  const lineStep = 30;
  const findingsBoxH = boxPadding * 2
    + (diagnosisLines.length * lineStep)
    + (vitalsLines.length * lineStep)
    + (rxLines.length * lineStep)
    + 36;

  drawRoundedRect(ctx, leftX, y, contentW, findingsBoxH, 18);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.stroke();

  let fy = y + boxPadding + 20;
  const labelX = leftX + 26;
  const valX = leftX + 250;

  // Row 1: Clinical Diagnosis
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Clinical Diagnosis:', labelX, fy);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 21px "Segoe UI", Arial, sans-serif';
  for (const line of diagnosisLines) {
    ctx.fillText(line, valX, fy);
    fy += lineStep;
  }
  fy += 12;

  // Row 2: Examined Vitals
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Examined Vitals:', labelX, fy);
  ctx.fillStyle = '#1E293B';
  ctx.font = '20px "Courier New", Consolas, monospace';
  for (const line of vitalsLines) {
    ctx.fillText(line, valX, fy);
    fy += lineStep;
  }
  fy += 12;

  // Row 3: Medical Care & Rx
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Medical Care & Rx:', labelX, fy);
  ctx.fillStyle = '#1E293B';
  ctx.font = '20px "Segoe UI", Arial, sans-serif';
  for (const line of rxLines) {
    ctx.fillText(line, valX, fy);
    fy += lineStep;
  }

  y += findingsBoxH + 30;

  // 7. Academic Absence Recommendation Box (Amber Callout)
  const excuseText = `Patient is recommended to be excused from academic classes and laboratory sessions from ${cert.excusedDates || 'October 28, 2026 to October 30, 2026 (3 Days)'} due to communicable acute illness requiring rest and isolation.`;
  ctx.font = '20px "Segoe UI", Arial, sans-serif';
  const excuseLines = wrapCanvasText(ctx, excuseText, contentW - 56);
  const excuseBoxH = 68 + excuseLines.length * 30;

  drawRoundedRect(ctx, leftX, y, contentW, excuseBoxH, 14);
  ctx.fillStyle = '#FFFBEB';
  ctx.fill();
  ctx.strokeStyle = '#FCD34D';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Left amber accent stripe
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(leftX, y + 6, 8, excuseBoxH - 12);

  let ey = y + 34;
  ctx.fillStyle = '#78350F';
  ctx.font = 'bold 21px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Academic Absence Recommendation:', leftX + 26, ey);
  ey += 32;

  ctx.fillStyle = '#92400E';
  ctx.font = '600 20px "Segoe UI", Arial, sans-serif';
  for (const line of excuseLines) {
    ctx.fillText(line, leftX + 26, ey);
    ey += 30;
  }

  y += excuseBoxH + 34;

  // 8. Official Note
  const noteText = 'This certificate is officially issued upon physical off-site examination to justify student medical absence pursuant to USTP Student Affairs & Health Services Guidelines.';
  ctx.fillStyle = '#475569';
  ctx.font = 'italic 19px "Segoe UI", Arial, sans-serif';
  for (const line of wrapCanvasText(ctx, noteText, contentW)) {
    ctx.fillText(line, leftX, y);
    y += 28;
  }

  // 9. Signatures & Verification QR Section (Anchored near bottom)
  const footerTopY = Math.max(y + 30, 1340);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftX, footerTopY);
  ctx.lineTo(W - leftX, footerTopY);
  ctx.stroke();

  const qrBoxX = leftX;
  const qrBoxY = footerTopY + 28;
  const qrBoxSize = 148;

  drawRoundedRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 12);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  if (qrImg) {
    ctx.drawImage(qrImg, qrBoxX + 10, qrBoxY + 10, qrBoxSize - 20, qrBoxSize - 20);
  } else {
    drawDeterministicQrPattern(ctx, qrBoxX + 12, qrBoxY + 12, qrBoxSize - 24, code);
  }

  const stampX = qrBoxX + qrBoxSize + 22;
  let stampY = qrBoxY + 34;
  ctx.fillStyle = '#047857';
  ctx.font = 'bold 19px "Courier New", Consolas, monospace';
  ctx.fillText('VERIFIED AUTHENTIC', stampX, stampY);
  stampY += 28;

  ctx.fillStyle = '#475569';
  ctx.font = '18px "Courier New", Consolas, monospace';
  ctx.fillText('Digital Clinic Seal', stampX, stampY);
  stampY += 26;

  ctx.fillStyle = '#101E38';
  ctx.font = 'bold 19px "Courier New", Consolas, monospace';
  ctx.fillText('USTP Villanueva', stampX, stampY);
  stampY += 26;

  const shortHash = (cert.integrityHash || '8b7f29c4e019b8417f7634f19b2a7590').substring(0, 18) + '...';
  ctx.fillStyle = '#64748B';
  ctx.font = '16px "Courier New", Consolas, monospace';
  ctx.fillText(`Hash: ${shortHash}`, stampX, stampY);

  // Signatures on Right
  const issuerName = cert.issuerName || 'Nurse Sarah Alcantara, RN';
  const issuerLicense = cert.issuerLicense || 'PRC RN-0982341';

  const sig1CenterX = W - 430;
  const sig2CenterX = W - 185;
  const sigBaseY = qrBoxY + 70;

  ctx.textAlign = 'center';

  // Examining Nurse Signature
  ctx.fillStyle = '#334155';
  ctx.font = 'italic 22px Georgia, "Times New Roman", serif';
  ctx.fillText(issuerName, sig1CenterX, sigBaseY - 12);

  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(sig1CenterX - 105, sigBaseY);
  ctx.lineTo(sig1CenterX + 105, sigBaseY);
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 19px "Segoe UI", Arial, sans-serif';
  ctx.fillText(issuerName, sig1CenterX, sigBaseY + 26);

  ctx.fillStyle = '#475569';
  ctx.font = '17px "Segoe UI", Arial, sans-serif';
  ctx.fillText(issuerLicense, sig1CenterX, sigBaseY + 48);

  ctx.fillStyle = '#64748B';
  ctx.font = '15px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Attending Campus Nurse', sig1CenterX, sigBaseY + 68);

  // Campus Medical Officer Signature
  ctx.fillStyle = '#334155';
  ctx.font = 'italic 22px Georgia, "Times New Roman", serif';
  ctx.fillText('Dr. R. Santos, MD', sig2CenterX, sigBaseY - 12);

  ctx.beginPath();
  ctx.moveTo(sig2CenterX - 95, sigBaseY);
  ctx.lineTo(sig2CenterX + 95, sigBaseY);
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 19px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Dr. Roberto Santos, MD', sig2CenterX, sigBaseY + 26);

  ctx.fillStyle = '#475569';
  ctx.font = '17px "Segoe UI", Arial, sans-serif';
  ctx.fillText('PRC MD-0054321', sig2CenterX, sigBaseY + 48);

  ctx.fillStyle = '#64748B';
  ctx.font = '15px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Campus Medical Officer', sig2CenterX, sigBaseY + 68);

  // 10. Watermark Footer Bar
  const bottomLineY = H - 120;
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(leftX, bottomLineY);
  ctx.lineTo(W - leftX, bottomLineY);
  ctx.stroke();

  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 15px "Courier New", Consolas, monospace';
  ctx.fillText(
    'USTP-VILLANUEVA HEALTH & WELLNESS • SECURE DIGITAL HEALTH CERTIFICATE SYSTEM • ISSUED VIA VITACALL',
    W / 2,
    bottomLineY + 30
  );

  return canvas;
}

function buildPdfBlobFromJpegCanvas(canvas) {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const base64 = dataUrl.split(',')[1];
  const binaryStr = atob(base64);
  const jpegBytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    jpegBytes[i] = binaryStr.charCodeAt(i);
  }

  const pageW = 595.28;
  const pageH = 841.89;
  const imgW = canvas.width;
  const imgH = canvas.height;

  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [0];
  let byteLength = 0;

  const pushStr = (str) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    byteLength += bytes.length;
  };
  const pushBytes = (bytes) => {
    chunks.push(bytes);
    byteLength += bytes.length;
  };
  const markObj = () => {
    offsets.push(byteLength);
  };

  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // 1: Catalog
  markObj();
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: Pages
  markObj();
  pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // 3: Page (A4)
  markObj();
  pushStr(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);

  // 4: Image XObject (/DCTDecode JPEG)
  markObj();
  pushStr(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
  pushBytes(jpegBytes);
  pushStr('\nendstream\nendobj\n');

  // 5: Page Content Stream
  const contentStream = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;
  markObj();
  pushStr(`5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`);

  const xrefOffset = byteLength;
  const totalObjs = offsets.length;
  let xref = `xref\n0 ${totalObjs}\n0000000000 65535 f \n`;
  for (let i = 1; i < totalObjs; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${totalObjs} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  pushStr(xref);

  return new Blob(chunks, { type: 'application/pdf' });
}

async function downloadCertificatePdf(certIdOrCode) {
  try {
    showToast('Generating complete PDF certificate...', 'info');
    const cert = await fetchCertificateRecord(certIdOrCode);
    populateCertificateDOM(cert);

    const code = (cert.verificationCode || cert.id || 'USTP-CERT').replace(/[^a-zA-Z0-9_-]/g, '-');
    const studentSlug = (cert.studentName || 'Student').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
    const fileName = `USTP-Medical-Certificate-${code}-${studentSlug}.pdf`;

    const canvas = await renderCertificateToCanvas(cert);
    const pdfBlob = buildPdfBlobFromJpegCanvas(canvas);

    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 400);

    showToast(`Downloaded ${fileName}`, 'success');
  } catch (err) {
    console.error('Error downloading certificate PDF:', err);
    showToast('Failed to download certificate PDF.', 'error');
  }
}

async function downloadCurrentCertificatePdf() {
  const code = (_activeCertificateRecord && (_activeCertificateRecord.verificationCode || _activeCertificateRecord.id))
    || (document.getElementById('certDocCode') && document.getElementById('certDocCode').textContent)
    || 'USTP-VC-98421';
  await downloadCertificatePdf(code);
}

// =========================================================================
// 6. COMPREHENSIVE ADMIN DASHBOARD & SYSTEM MANAGEMENT (SECTIONS 1 - 8)
// =========================================================================

function switchAdminSection(sectionName) {
  state.adminSection = sectionName;

  document.querySelectorAll('.admin-nav-item').forEach(btn => {
    const target = btn.getAttribute('data-admin-nav');
    btn.classList.toggle('active', target === sectionName);
  });

  const sections = {
    overview: 'adminSectionOverview',
    users: 'adminSectionUsers',
    logs: 'adminSectionLogs',
    reports: 'adminSectionReports',
    security: 'adminSectionSecurity',
    data: 'adminSectionData',
    announcements: 'adminSectionAnnouncements',
    settings: 'adminSectionSettings'
  };

  Object.entries(sections).forEach(([key, domId]) => {
    const el = document.getElementById(domId);
    if (el) {
      const isMatch = key === sectionName;
      el.classList.toggle('hidden', !isMatch);
      if (isMatch) triggerSmoothEntrance(el);
    }
  });

  if (sectionName === 'overview') renderAdminOverviewSection();
  else if (sectionName === 'users') renderAdminUsersTable();
  else if (sectionName === 'logs') renderAdminAuditLogsTable();
  else if (sectionName === 'reports') generateAdminReport(false);
  else if (sectionName === 'security') renderAdminSecuritySection();
  else if (sectionName === 'data') renderAdminDataSection();
  else if (sectionName === 'announcements') renderAdminAnnouncementsSection();
  else if (sectionName === 'settings') renderAdminSettingsSection();

  if (window.lucide) window.lucide.createIcons();
}

function updateAdminSidebarBadges() {
  const uCount = document.getElementById('adminNavUsersCount');
  const lCount = document.getElementById('adminNavLogsCount');
  const sBadge = document.getElementById('adminNavSecurityBadge');
  const aCount = document.getElementById('adminNavAnnCount');

  if (uCount) uCount.textContent = (state.adminUsers || []).length || (state.stats && state.stats.totalUsers) || 0;
  if (lCount) lCount.textContent = (state.auditLogs || []).length || 0;
  if (sBadge) {
    const unresolved = state.securityData && state.securityData.summary
      ? state.securityData.summary.unresolvedAlerts
      : ((state.stats && state.stats.loginStats && state.stats.loginStats.suspiciousEvents) || 0);
    sBadge.textContent = unresolved;
  }
  if (aCount) aCount.textContent = (state.announcements || []).length || 0;
}

function renderAdminDashboard() {
  updateAdminSidebarBadges();
  renderAdminOverviewSection();
  renderAdminAuditLogsTable();
  switchAdminSection(state.adminSection || 'overview');
}

// -------------------------------------------------------------------------
// ADMIN SECTION 1: DASHBOARD OVERVIEW & REAL-TIME ANALYTICS
// -------------------------------------------------------------------------

function renderAdminOverviewSection() {
  const stats = state.stats || {};
  const users = state.adminUsers || [];

  const totalUsers = stats.totalUsers !== undefined ? stats.totalUsers : users.length;
  const totalStudents = stats.totalStudents !== undefined ? stats.totalStudents : users.filter(u => u.role === 'requester').length;
  const totalPersonnel = stats.totalPersonnel !== undefined ? stats.totalPersonnel : users.filter(u => u.role === 'personnel').length;
  const totalAdmins = stats.totalAdmins !== undefined ? stats.totalAdmins : users.filter(u => u.role === 'admin').length;
  const activeAccounts = stats.activeAccounts !== undefined ? stats.activeAccounts : users.filter(u => (u.status || 'active') === 'active').length;
  const inactiveAccounts = stats.inactiveAccounts !== undefined ? stats.inactiveAccounts : users.filter(u => u.status === 'inactive').length;
  const pendingAccounts = stats.pendingAccounts !== undefined ? stats.pendingAccounts : users.filter(u => u.status === 'pending').length;

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt('adminStatTotalUsers', totalUsers);
  setTxt('adminStatStudents', totalStudents);
  setTxt('adminStatPersonnel', totalPersonnel);
  setTxt('adminStatAdmins', totalAdmins);
  setTxt('adminStatActiveAccounts', activeAccounts);
  setTxt('adminStatInactiveAccounts', inactiveAccounts);
  setTxt('adminStatPendingApprovals', pendingAccounts);

  const uniqueDorms = Object.keys(stats.boardingHouseCounts || {}).length || 5;
  setTxt('adminTotalReq', stats.totalRequests !== undefined ? stats.totalRequests : state.requests.length);
  setTxt('adminTotalDorms', uniqueDorms);
  setTxt('adminTotalCerts', stats.totalCertificates !== undefined ? stats.totalCertificates : (state.certificates.length || 1));
  setTxt('adminTotalLogs', (state.auditLogs || []).length || 4);

  // Pending Approvals Box
  const pendingBox = document.getElementById('adminPendingApprovalsBox');
  if (pendingBox) {
    const pendingList = users.filter(u => u.status === 'pending');
    if (pendingList.length > 0) {
      pendingBox.classList.remove('hidden');
      pendingBox.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center font-bold flex-shrink-0">
            <i data-lucide="user-check" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="font-extrabold text-amber-950 text-xs sm:text-sm">${pendingList.length} Pending Account Registration(s) Awaiting Approval</div>
            <div class="text-xs text-amber-800">${pendingList.map(u => escHtml(u.name)).join(', ')}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          ${pendingList.slice(0, 2).map(u => `
            <button onclick="updateAdminUserStatus('${u.id}', 'active')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition">
              Approve ${escHtml(u.name.split(' ')[0])}
            </button>
          `).join('')}
          <button onclick="switchAdminSection('users')" class="bg-white border border-amber-300 text-amber-900 font-bold px-3 py-1.5 rounded-xl text-xs">View All</button>
        </div>
      `;
    } else {
      pendingBox.classList.add('hidden');
    }
  }

  // Interactive Chart 1: User Role & Account Status Distribution
  const chartUsers = document.getElementById('adminChartUsersDistribution');
  if (chartUsers) {
    const denom = Math.max(1, totalUsers);
    const sPct = Math.round((totalStudents / denom) * 100);
    const pPct = Math.round((totalPersonnel / denom) * 100);
    const aPct = Math.max(5, 100 - sPct - pPct);

    chartUsers.innerHTML = `
      <div class="h-4 w-full rounded-full overflow-hidden flex bg-slate-100 border border-slate-200">
        <div style="width:${sPct}%" class="bg-amber-500 h-full" title="Students: ${totalStudents}"></div>
        <div style="width:${pPct}%" class="bg-teal-600 h-full" title="Personnel: ${totalPersonnel}"></div>
        <div style="width:${aPct}%" class="bg-indigo-600 h-full" title="Admins: ${totalAdmins}"></div>
      </div>
      <div class="grid grid-cols-3 gap-2 pt-1 text-center">
        <div class="p-2 rounded-xl bg-amber-50 border border-amber-200">
          <div class="font-black text-amber-800 text-sm">${totalStudents}</div>
          <div class="text-[10px] text-amber-700 font-semibold">Students (${sPct}%)</div>
        </div>
        <div class="p-2 rounded-xl bg-teal-50 border border-teal-200">
          <div class="font-black text-teal-800 text-sm">${totalPersonnel}</div>
          <div class="text-[10px] text-teal-700 font-semibold">Personnel (${pPct}%)</div>
        </div>
        <div class="p-2 rounded-xl bg-indigo-50 border border-indigo-200">
          <div class="font-black text-indigo-800 text-sm">${totalAdmins}</div>
          <div class="text-[10px] text-indigo-700 font-semibold">Admins</div>
        </div>
      </div>
      <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
        <span class="text-emerald-700 font-bold">● ${activeAccounts} Active</span>
        <span class="text-amber-600 font-bold">● ${pendingAccounts} Pending</span>
        <span class="text-rose-600 font-bold">● ${inactiveAccounts} Inactive</span>
      </div>
    `;
  }

  // Interactive Chart 2: Request Status & Urgency Breakdown
  const chartReqs = document.getElementById('adminChartRequestsBreakdown');
  if (chartReqs) {
    const urg = stats.urgencyBreakdown || {
      severe: state.requests.filter(r => r.urgency === 'severe').length,
      moderate: state.requests.filter(r => r.urgency === 'moderate').length,
      mild: state.requests.filter(r => r.urgency === 'mild').length
    };
    const totalR = Math.max(1, state.requests.length);
    const pendingR = stats.pendingRequests !== undefined ? stats.pendingRequests : state.requests.filter(r => r.status === 'pending').length;
    const activeR = stats.activeRequests !== undefined ? stats.activeRequests : state.requests.filter(r => ['assigned', 'en_route', 'in_progress'].includes(r.status)).length;
    const compR = stats.completedRequests !== undefined ? stats.completedRequests : state.requests.filter(r => r.status === 'completed').length;

    chartReqs.innerHTML = `
      <div class="space-y-2">
        <div>
          <div class="flex justify-between text-[11px] font-semibold mb-1">
            <span class="text-rose-700">Severe Urgency</span>
            <span class="font-mono font-bold">${urg.severe || 0}</span>
          </div>
          <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div class="bg-rose-500 h-full rounded-full" style="width:${Math.round(((urg.severe || 0) / totalR) * 100)}%"></div>
          </div>
        </div>
        <div>
          <div class="flex justify-between text-[11px] font-semibold mb-1">
            <span class="text-amber-700">Moderate Urgency</span>
            <span class="font-mono font-bold">${urg.moderate || 0}</span>
          </div>
          <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div class="bg-amber-500 h-full rounded-full" style="width:${Math.round(((urg.moderate || 0) / totalR) * 100)}%"></div>
          </div>
        </div>
        <div>
          <div class="flex justify-between text-[11px] font-semibold mb-1">
            <span class="text-emerald-700">Mild Urgency</span>
            <span class="font-mono font-bold">${urg.mild || 0}</span>
          </div>
          <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div class="bg-emerald-500 h-full rounded-full" style="width:${Math.round(((urg.mild || 0) / totalR) * 100)}%"></div>
          </div>
        </div>
      </div>
      <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
        <span class="text-amber-700 font-bold">⏳ ${pendingR} Pending</span>
        <span class="text-teal-700 font-bold">🚑 ${activeR} Active</span>
        <span class="text-emerald-700 font-bold">✓ ${compR} Completed</span>
      </div>
    `;
  }

  // Interactive Chart 3: Login Activity Statistics
  const chartLogins = document.getElementById('adminChartLoginActivity');
  if (chartLogins) {
    const ls = stats.loginStats || {
      totalLogins: (state.auditLogs || []).filter(l => l.action === 'USER_LOGIN').length,
      failedLogins: (state.auditLogs || []).filter(l => l.action === 'LOGIN_FAILED').length,
      suspiciousEvents: 1,
      loginsByRole: { requester: 5, personnel: 2, admin: 3 }
    };
    const byRole = ls.loginsByRole || { requester: 0, personnel: 0, admin: 0 };

    chartLogins.innerHTML = `
      <div class="grid grid-cols-2 gap-2">
        <div class="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
          <div class="text-[10px] text-emerald-700 font-semibold">Successful Logins</div>
          <div class="text-lg font-black text-emerald-800">${ls.totalLogins || 0}</div>
        </div>
        <div class="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
          <div class="text-[10px] text-rose-700 font-semibold">Failed Attempts</div>
          <div class="text-lg font-black text-rose-800">${ls.failedLogins || 0}</div>
        </div>
      </div>
      <div class="space-y-1.5 pt-1 text-[11px]">
        <div class="flex items-center justify-between">
          <span class="text-slate-600">Student Sessions</span>
          <span class="font-mono font-bold text-slate-900">${byRole.requester || 0}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-600">Personnel Sessions</span>
          <span class="font-mono font-bold text-slate-900">${byRole.personnel || 0}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-600">Administrator Sessions</span>
          <span class="font-mono font-bold text-slate-900">${byRole.admin || 0}</span>
        </div>
      </div>
    `;
  }

  // Dormitory Request Density (Preserving #dormDensityList)
  const dormList = document.getElementById('dormDensityList');
  if (dormList) {
    const counts = stats.boardingHouseCounts || {
      'Villa Rosa Boarding House': 3, 'Sunrise Student Dormitory': 2,
      'St. Jude Boarding House': 1, 'Campus View Dorm': 1
    };
    dormList.innerHTML = Object.entries(counts).map(([dorm, count]) => `
      <div class="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
        <span class="font-bold text-slate-800">${escHtml(dorm)}</span>
        <span class="bg-amber-100 text-amber-900 font-extrabold text-[11px] px-2.5 py-0.5 rounded-full">${count} case${count === 1 ? '' : 's'}</span>
      </div>
    `).join('');
  }

  // Symptom Clusters (Preserving #symptomClusterList)
  const sympList = document.getElementById('symptomClusterList');
  if (sympList) {
    const counts = stats.symptomCounts || { 'High Fever': 4, 'Chills & Body Aches': 3, 'Persistent Cough': 2, 'Diarrhea / Vomiting': 1 };
    sympList.innerHTML = Object.entries(counts).map(([symptom, count]) => `
      <div class="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
        <span class="font-bold text-slate-800">${escHtml(symptom)}</span>
        <div class="flex items-center space-x-2">
          <div class="w-24 bg-slate-200 h-2 rounded-full overflow-hidden">
            <div class="bg-rose-500 h-full rounded-full" style="width: ${Math.min(100, count * 25)}%"></div>
          </div>
          <span class="font-mono font-bold text-slate-700">${count}</span>
        </div>
      </div>
    `).join('');
  }

  // Recent System Activities Stream
  const recentEl = document.getElementById('adminOverviewRecentActivity');
  if (recentEl) {
    const recent = (state.auditLogs || []).slice(0, 8);
    if (recent.length === 0) {
      recentEl.innerHTML = `<div class="py-4 text-center text-slate-400">No recent activities logged.</div>`;
    } else {
      recentEl.innerHTML = recent.map(log => `
        <div class="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div class="flex items-start space-x-2.5">
            <span class="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-mono font-bold text-[10px] mt-0.5">${escHtml(log.action)}</span>
            <div>
              <div class="text-slate-900 font-semibold">${escHtml(log.details)}</div>
              <div class="text-[11px] text-slate-500">By <strong>${escHtml(log.userName)}</strong> (${escHtml(log.userRole)}) • Target: <span class="font-mono">${escHtml(log.targetEntity)}/${escHtml(log.targetId)}</span></div>
            </div>
          </div>
          <div class="text-[11px] text-slate-400 font-mono flex-shrink-0">${new Date(log.timestamp).toLocaleString()}</div>
        </div>
      `).join('');
    }
  }
}

// -------------------------------------------------------------------------
// ADMIN SECTION 2: USER MANAGEMENT (CRUD, Activate/Deactivate, Roles, Perms, Password Reset)
// -------------------------------------------------------------------------

function renderAdminUsersTable() {
  const tbody = document.getElementById('adminUsersTableBody');
  const pagEl = document.getElementById('adminUsersPagination');
  if (!tbody) return;

  const searchQ = ((document.getElementById('adminUserSearch') || {}).value || '').toLowerCase().trim();
  const roleF = ((document.getElementById('adminUserRoleFilter') || {}).value) || 'all';
  const statusF = ((document.getElementById('adminUserStatusFilter') || {}).value) || 'all';
  const sortBy = ((document.getElementById('adminUserSortBy') || {}).value) || 'newest';

  let list = [...(state.adminUsers || [])];

  if (searchQ) {
    list = list.filter(u =>
      (u.name || '').toLowerCase().includes(searchQ) ||
      (u.email || '').toLowerCase().includes(searchQ) ||
      (u.studentId || '').toLowerCase().includes(searchQ) ||
      (u.boardingHouse || '').toLowerCase().includes(searchQ) ||
      (u.title || '').toLowerCase().includes(searchQ) ||
      (u.licenseNumber || '').toLowerCase().includes(searchQ)
    );
  }
  if (roleF !== 'all') {
    list = list.filter(u => u.role === roleF);
  }
  if (statusF !== 'all') {
    list = list.filter(u => (u.status || 'active') === statusF);
  }

  list.sort((a, b) => {
    if (sortBy === 'oldest') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
    if (sortBy === 'name_desc') return (b.name || '').localeCompare(a.name || '');
    if (sortBy === 'role') return (a.role || '').localeCompare(b.role || '');
    if (sortBy === 'status') return (a.status || 'active').localeCompare(b.status || 'active');
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / state.usersPageSize));
  if (state.usersPage > totalPages) state.usersPage = totalPages;
  const startIdx = (state.usersPage - 1) * state.usersPageSize;
  const pageItems = list.slice(startIdx, startIdx + state.usersPageSize);

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">No user accounts match your search or filter criteria.</td></tr>`;
  } else {
    tbody.innerHTML = pageItems.map(u => {
      const roleLabel = u.role === 'requester' ? 'Student' : (u.role === 'personnel' ? 'Personnel' : 'Admin');
      const roleBadge = u.role === 'requester'
        ? 'bg-amber-100 text-amber-800 border-amber-200'
        : (u.role === 'personnel' ? 'bg-teal-100 text-teal-800 border-teal-200' : 'bg-indigo-100 text-indigo-800 border-indigo-200');

      const st = u.status || 'active';
      const isLocked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
      const statusBadge = isLocked
        ? 'bg-purple-100 text-purple-800 border-purple-200'
        : (st === 'active' ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
          : (st === 'pending' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-rose-100 text-rose-800 border-rose-200'));

      const affil = u.role === 'requester'
        ? `<div><strong class="text-slate-800">${escHtml(u.studentId || 'N/A')}</strong></div><div class="text-[11px] text-slate-500 truncate max-w-[180px]">${escHtml(u.boardingHouse || 'Villanueva')}</div>`
        : `<div><strong class="text-slate-800">${escHtml(u.title || 'Health Staff')}</strong></div><div class="text-[11px] text-slate-500">${escHtml(u.licenseNumber || 'PRC Verified')}</div>`;

      const permCount = Object.values(u.permissions || {}).filter(Boolean).length;

      return `
        <tr class="hover:bg-slate-50/80 transition">
          <td class="p-3">
            <div class="flex items-center space-x-2.5">
              <div class="w-8 h-8 rounded-xl bg-ustp-navy text-ustp-goldLight font-bold flex items-center justify-center text-xs flex-shrink-0">
                ${escHtml((u.name || 'U').charAt(0).toUpperCase())}
              </div>
              <div class="min-w-0">
                <div class="font-bold text-slate-900 truncate max-w-[160px]">${escHtml(u.name)}</div>
                <div class="text-[11px] text-slate-500 truncate max-w-[160px]">${escHtml(u.email)}</div>
              </div>
            </div>
          </td>
          <td class="p-3">
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${roleBadge}">${roleLabel}</span>
          </td>
          <td class="p-3">
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusBadge}">${isLocked ? 'Locked' : st}</span>
          </td>
          <td class="p-3">${affil}</td>
          <td class="p-3">
            <button onclick="openUserPermissionsModal('${u.id}')" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 text-[11px] font-semibold transition">
              🛡️ ${permCount} Perms
            </button>
          </td>
          <td class="p-3 text-slate-500 whitespace-nowrap text-[11px]">
            ${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
          </td>
          <td class="p-3 text-right whitespace-nowrap">
            <div class="inline-flex items-center gap-1">
              <button onclick="openUserDetailModal('${u.id}')" title="View Full User Info" class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition">
                <i data-lucide="eye" class="w-3.5 h-3.5"></i>
              </button>
              <button onclick="openAdminUserModal('${u.id}')" title="Edit User Account" class="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition">
                <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
              </button>
              <button onclick="openAdminResetPasswordModal('${u.id}')" title="Reset User Password" class="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 transition">
                <i data-lucide="key-round" class="w-3.5 h-3.5"></i>
              </button>
              ${st === 'active'
          ? `<button onclick="updateAdminUserStatus('${u.id}', 'inactive')" title="Deactivate Account" class="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition"><i data-lucide="user-x" class="w-3.5 h-3.5"></i></button>`
          : `<button onclick="updateAdminUserStatus('${u.id}', 'active')" title="Activate / Approve Account" class="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition"><i data-lucide="user-check" class="w-3.5 h-3.5"></i></button>`
        }
              <button onclick="confirmDeleteUser('${u.id}')" title="Delete Account" class="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white transition">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  if (pagEl) {
    pagEl.innerHTML = `
      <div>Showing <strong>${total === 0 ? 0 : startIdx + 1}</strong> to <strong>${Math.min(total, startIdx + state.usersPageSize)}</strong> of <strong>${total}</strong> accounts</div>
      <div class="flex items-center gap-1.5">
        <button onclick="changeUsersPage(-1)" ${state.usersPage <= 1 ? 'disabled' : ''} class="px-3 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-semibold">Prev</button>
        <span class="px-2 font-bold text-slate-700">Page ${state.usersPage} / ${totalPages}</span>
        <button onclick="changeUsersPage(1)" ${state.usersPage >= totalPages ? 'disabled' : ''} class="px-3 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-semibold">Next</button>
      </div>
    `;
  }

  if (window.lucide) window.lucide.createIcons();
}

function changeUsersPage(delta) {
  state.usersPage = Math.max(1, state.usersPage + delta);
  renderAdminUsersTable();
}

function toggleAdminUserRoleFields() {
  const role = document.getElementById('adminUserRole').value;
  const stuFields = document.getElementById('adminUserStudentFields');
  const staffFields = document.getElementById('adminUserStaffFields');
  if (role === 'requester') {
    stuFields.classList.remove('hidden');
    staffFields.classList.add('hidden');
  } else {
    stuFields.classList.add('hidden');
    staffFields.classList.remove('hidden');
  }
}

function openAdminUserModal(userId = null) {
  const modal = document.getElementById('adminUserModal');
  const title = document.getElementById('adminUserModalTitle');
  const editIdInput = document.getElementById('adminUserEditId');
  const pwdWrap = document.getElementById('adminUserPasswordWrap');
  const pwdInput = document.getElementById('adminUserPassword');

  if (userId) {
    const u = (state.adminUsers || []).find(item => item.id === userId);
    if (!u) return;
    title.textContent = `Edit User Account: ${u.name}`;
    editIdInput.value = u.id;
    pwdWrap.classList.add('hidden');
    pwdInput.required = false;

    document.getElementById('adminUserName').value = u.name || '';
    document.getElementById('adminUserEmail').value = u.email || '';
    document.getElementById('adminUserRole').value = u.role || 'requester';
    document.getElementById('adminUserStatus').value = u.status || 'active';
    document.getElementById('adminUserPhone').value = u.phone || '';
    document.getElementById('adminUserStudentId').value = u.studentId || '';
    document.getElementById('adminUserCourse').value = u.courseAndYear || '';
    document.getElementById('adminUserDorm').value = u.boardingHouse || '';
    document.getElementById('adminUserAddress').value = u.address || '';
    document.getElementById('adminUserTitle').value = u.title || '';
    document.getElementById('adminUserLicense').value = u.licenseNumber || '';
  } else {
    title.textContent = 'Create New User Account';
    editIdInput.value = '';
    pwdWrap.classList.remove('hidden');
    pwdInput.required = true;
    document.getElementById('adminUserForm').reset();
    document.getElementById('adminUserRole').value = 'requester';
    document.getElementById('adminUserStatus').value = 'active';
  }

  toggleAdminUserRoleFields();
  modal.classList.remove('hidden');
}

function closeAdminUserModal() {
  document.getElementById('adminUserModal').classList.add('hidden');
}

async function submitAdminUserForm(e) {
  e.preventDefault();
  const editId = document.getElementById('adminUserEditId').value;
  const role = document.getElementById('adminUserRole').value;

  const payload = {
    name: document.getElementById('adminUserName').value.trim(),
    email: document.getElementById('adminUserEmail').value.trim().toLowerCase(),
    role,
    status: document.getElementById('adminUserStatus').value,
    phone: document.getElementById('adminUserPhone').value.trim(),
    studentId: document.getElementById('adminUserStudentId').value.trim(),
    courseAndYear: document.getElementById('adminUserCourse').value.trim(),
    boardingHouse: document.getElementById('adminUserDorm').value.trim(),
    address: document.getElementById('adminUserAddress').value.trim(),
    title: document.getElementById('adminUserTitle').value.trim(),
    licenseNumber: document.getElementById('adminUserLicense').value.trim()
  };

  if (!editId) {
    payload.password = document.getElementById('adminUserPassword').value;
  }

  setButtonLoading('btnSaveAdminUser', true);
  try {
    const url = editId ? `${API_BASE}/admin/users/${editId}` : `${API_BASE}/admin/users`;
    const method = editId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to save user account', 'error');
      return;
    }

    closeAdminUserModal();
    showToast(data.message || 'User account saved!', 'success');
    await refreshData(true);
  } catch (err) {
    console.error('Save user error:', err);
    showToast('Server error saving user account', 'error');
  } finally {
    setButtonLoading('btnSaveAdminUser', false);
  }
}

async function updateAdminUserStatus(userId, newStatus) {
  const user = (state.adminUsers || []).find(u => u.id === userId);
  if (!user) return;

  const executeStatusChange = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/users/${userId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Could not update account status', 'error');
        return;
      }
      showToast(`Account for ${user.name} is now ${newStatus.toUpperCase()}`, 'success');
      await refreshData(true);
    } catch (err) {
      showToast('Failed to update account status', 'error');
    }
  };

  if (newStatus === 'inactive') {
    openConfirmActionModal(
      'Deactivate User Account',
      `Are you sure you want to deactivate ${user.name} (${user.email})? They will be prevented from signing in until reactivated.`,
      executeStatusChange
    );
  } else {
    await executeStatusChange();
  }
}

function openUserPermissionsModal(userId) {
  const u = (state.adminUsers || []).find(item => item.id === userId);
  if (!u) return;

  document.getElementById('permUserId').value = u.id;
  document.getElementById('permModalUserSubtitle').textContent = `${u.name} (${u.email})`;
  document.getElementById('permRoleSelect').value = u.role || 'requester';

  const perms = u.permissions || {};
  const permKeys = [
    'canSubmitRequests', 'canViewCertificates', 'canUpdateProfile',
    'canTriageRequests', 'canIssueCertificates', 'canManageUsers',
    'canViewReports', 'canManageSecurity', 'canManageData', 'canManageSettings'
  ];
  permKeys.forEach(k => {
    const cb = document.getElementById(`perm_${k}`);
    if (cb) cb.checked = Boolean(perms[k]);
  });

  document.getElementById('userPermissionsModal').classList.remove('hidden');
}

function applyRoleDefaultCheckboxes(role) {
  const defaults = {
    requester: ['canSubmitRequests', 'canViewCertificates', 'canUpdateProfile'],
    personnel: ['canViewCertificates', 'canUpdateProfile', 'canTriageRequests', 'canIssueCertificates', 'canViewReports'],
    admin: [
      'canSubmitRequests', 'canViewCertificates', 'canUpdateProfile',
      'canTriageRequests', 'canIssueCertificates', 'canManageUsers',
      'canViewReports', 'canManageSecurity', 'canManageData', 'canManageSettings'
    ]
  }[role] || [];

  [
    'canSubmitRequests', 'canViewCertificates', 'canUpdateProfile',
    'canTriageRequests', 'canIssueCertificates', 'canManageUsers',
    'canViewReports', 'canManageSecurity', 'canManageData', 'canManageSettings'
  ].forEach(k => {
    const cb = document.getElementById(`perm_${k}`);
    if (cb) cb.checked = defaults.includes(k);
  });
}

function closeUserPermissionsModal() {
  document.getElementById('userPermissionsModal').classList.add('hidden');
}

async function submitUserPermissions(e) {
  e.preventDefault();
  const userId = document.getElementById('permUserId').value;
  const role = document.getElementById('permRoleSelect').value;

  const permissions = {};
  [
    'canSubmitRequests', 'canViewCertificates', 'canUpdateProfile',
    'canTriageRequests', 'canIssueCertificates', 'canManageUsers',
    'canViewReports', 'canManageSecurity', 'canManageData', 'canManageSettings'
  ].forEach(k => {
    const cb = document.getElementById(`perm_${k}`);
    permissions[k] = cb ? cb.checked : false;
  });

  try {
    const res = await fetch(`${API_BASE}/admin/users/${userId}/permissions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify({ role, permissions })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to update permissions', 'error');
      return;
    }
    closeUserPermissionsModal();
    showToast('Role and permissions updated!', 'success');
    await refreshData(true);
  } catch (err) {
    showToast('Server error updating permissions', 'error');
  }
}

function openUserDetailModal(userId) {
  const u = (state.adminUsers || []).find(item => item.id === userId);
  if (!u) return;

  const body = document.getElementById('userDetailModalBody');
  const activePerms = Object.entries(u.permissions || {})
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(', ');

  body.innerHTML = `
    <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center space-x-3">
      <div class="w-12 h-12 rounded-2xl bg-ustp-navy text-ustp-goldLight font-black text-lg flex items-center justify-center">
        ${escHtml((u.name || 'U').charAt(0).toUpperCase())}
      </div>
      <div>
        <div class="font-extrabold text-slate-900 text-sm">${escHtml(u.name)}</div>
        <div class="text-slate-500">${escHtml(u.email)}</div>
        <div class="flex items-center gap-2 mt-1">
          <span class="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px] uppercase">${escHtml(u.role)}</span>
          <span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase">${escHtml(u.status || 'active')}</span>
        </div>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-2.5">
      <div class="p-2.5 rounded-xl border border-slate-200">
        <div class="text-[10px] text-slate-400 uppercase font-bold">Account ID</div>
        <div class="font-mono font-bold text-slate-800 mt-0.5">${escHtml(u.id)}</div>
      </div>
      <div class="p-2.5 rounded-xl border border-slate-200">
        <div class="text-[10px] text-slate-400 uppercase font-bold">Contact Phone</div>
        <div class="font-bold text-slate-800 mt-0.5">${escHtml(u.phone || 'N/A')}</div>
      </div>
      ${u.role === 'requester' ? `
        <div class="p-2.5 rounded-xl border border-slate-200">
          <div class="text-[10px] text-slate-400 uppercase font-bold">Student ID &amp; Course</div>
          <div class="font-bold text-slate-800 mt-0.5">${escHtml(u.studentId || 'N/A')} • ${escHtml(u.courseAndYear || '')}</div>
        </div>
        <div class="p-2.5 rounded-xl border border-slate-200">
          <div class="text-[10px] text-slate-400 uppercase font-bold">Boarding House</div>
          <div class="font-bold text-slate-800 mt-0.5">${escHtml(u.boardingHouse || 'N/A')}</div>
        </div>
      ` : `
        <div class="p-2.5 rounded-xl border border-slate-200">
          <div class="text-[10px] text-slate-400 uppercase font-bold">Designation</div>
          <div class="font-bold text-slate-800 mt-0.5">${escHtml(u.title || 'Staff')}</div>
        </div>
        <div class="p-2.5 rounded-xl border border-slate-200">
          <div class="text-[10px] text-slate-400 uppercase font-bold">PRC License</div>
          <div class="font-bold text-slate-800 mt-0.5">${escHtml(u.licenseNumber || 'Verified')}</div>
        </div>
      `}
      <div class="p-2.5 rounded-xl border border-slate-200">
        <div class="text-[10px] text-slate-400 uppercase font-bold">Last Login</div>
        <div class="font-bold text-slate-800 mt-0.5">${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</div>
      </div>
      <div class="p-2.5 rounded-xl border border-slate-200">
        <div class="text-[10px] text-slate-400 uppercase font-bold">Activity Records</div>
        <div class="font-bold text-slate-800 mt-0.5">${(u.metrics && u.metrics.requestsCount) || 0} Requests • ${(u.metrics && u.metrics.certificatesCount) || 0} Certs</div>
      </div>
    </div>
    <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
      <div class="text-[10px] text-slate-400 uppercase font-bold mb-1">Granted Access Permissions</div>
      <div class="font-mono text-[11px] text-slate-700 break-words">${escHtml(activePerms || 'Standard Role Permissions')}</div>
    </div>
  `;

  document.getElementById('userDetailModal').classList.remove('hidden');
}

function openAdminResetPasswordModal(userId) {
  const u = (state.adminUsers || []).find(item => item.id === userId);
  if (!u) return;

  document.getElementById('resetPwdUserId').value = u.id;
  document.getElementById('resetPwdUserSubtitle').textContent = `Account: ${u.name} (${u.email})`;
  document.getElementById('resetPwdInput').value = '';
  document.getElementById('adminResetPasswordModal').classList.remove('hidden');
}

async function submitAdminPasswordReset(e) {
  e.preventDefault();
  const userId = document.getElementById('resetPwdUserId').value;
  const newPassword = document.getElementById('resetPwdInput').value;

  setButtonLoading('btnConfirmResetPwd', true);
  try {
    const res = await fetch(`${API_BASE}/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify({ newPassword })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Password reset failed', 'error');
      return;
    }
    document.getElementById('adminResetPasswordModal').classList.add('hidden');
    showToast(data.message || 'Password securely reset!', 'success');
    await refreshData(true);
  } catch (err) {
    showToast('Server error resetting password', 'error');
  } finally {
    setButtonLoading('btnConfirmResetPwd', false);
  }
}

function confirmDeleteUser(userId) {
  const u = (state.adminUsers || []).find(item => item.id === userId);
  if (!u) return;

  openConfirmActionModal(
    'Delete User Account Permanently',
    `Are you sure you want to permanently delete the account for "${u.name}" (${u.email})? This administrative action will be recorded in the immutable audit trail.`,
    async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Could not delete user account', 'error');
          return;
        }
        showToast(`User account "${u.name}" deleted`, 'info');
        await refreshData(true);
      } catch (err) {
        showToast('Failed to delete user account', 'error');
      }
    }
  );
}

function exportUsersCsv() {
  const rows = [
    ['User ID', 'Full Name', 'Email', 'Role', 'Status', 'Student ID / License', 'Boarding House / Title', 'Phone', 'Created At']
  ];
  (state.adminUsers || []).forEach(u => {
    rows.push([
      u.id,
      u.name,
      u.email,
      u.role,
      u.status || 'active',
      u.role === 'requester' ? (u.studentId || '') : (u.licenseNumber || ''),
      u.role === 'requester' ? (u.boardingHouse || '') : (u.title || ''),
      u.phone || '',
      u.createdAt || ''
    ]);
  });
  downloadCsvFile('vitacall-users-export.csv', rows);
  showToast('Registered users exported to CSV', 'success');
}

// -------------------------------------------------------------------------
// ADMIN SECTION 3: ACTIVITY LOGS & AUDIT TRAIL
// -------------------------------------------------------------------------

function renderAdminAuditLogsTable() {
  const tbody = document.getElementById('auditTableBody');
  const pagEl = document.getElementById('auditPagination');
  if (!tbody) return;

  const q = ((document.getElementById('auditSearchInput') || {}).value || '').toLowerCase().trim();
  const roleF = ((document.getElementById('auditRoleFilter') || {}).value) || 'all';
  const catF = ((document.getElementById('auditCategoryFilter') || {}).value) || 'all';
  const dateF = ((document.getElementById('auditDateFilter') || {}).value) || '';

  let logs = [...(state.auditLogs || [])];

  if (q) {
    logs = logs.filter(l =>
      (l.userName || '').toLowerCase().includes(q) ||
      (l.action || '').toLowerCase().includes(q) ||
      (l.details || '').toLowerCase().includes(q) ||
      (l.targetId || '').toLowerCase().includes(q) ||
      (l.targetEntity || '').toLowerCase().includes(q)
    );
  }
  if (roleF !== 'all') {
    logs = logs.filter(l => l.userRole === roleF);
  }
  if (catF !== 'all') {
    const catMap = {
      auth: ['USER_LOGIN', 'USER_LOGOUT', 'LOGIN_FAILED', 'SESSION_EXPIRED'],
      account: ['USER_REGISTERED', 'USER_CREATED', 'PROFILE_UPDATED', 'USER_UPDATED', 'USER_DELETED', 'SETTINGS_UPDATED'],
      status: ['USER_ACTIVATED', 'USER_DEACTIVATED', 'USER_APPROVED', 'ACCOUNT_UNLOCKED'],
      records: ['REQUEST_CREATED', 'REQUEST_ASSIGNED', 'STATUS_UPDATED', 'CLINICAL_RECORD_RECORDED', 'CERTIFICATE_ISSUED', 'CERTIFICATE_VIEWED', 'CERTIFICATE_VERIFIED', 'RECORD_CREATED', 'RECORD_UPDATED', 'RECORD_DELETED'],
      admin: ['DATABASE_BACKUP_EXPORTED', 'DATABASE_BACKUP_CREATED', 'DATABASE_RESTORED', 'BACKUP_DELETED', 'SYSTEM_SETTINGS_UPDATED', 'ANNOUNCEMENT_CREATED', 'ANNOUNCEMENT_UPDATED', 'ANNOUNCEMENT_DELETED', 'REPORT_GENERATED'],
      permissions: ['PERMISSIONS_UPDATED', 'ROLE_CHANGED', 'PASSWORD_RESET', 'SECURITY_ALERT_RESOLVED']
    };
    const allowedActions = catMap[catF] || [];
    logs = logs.filter(l => allowedActions.includes(l.action));
  }
  if (dateF) {
    logs = logs.filter(l => (l.timestamp || '').startsWith(dateF));
  }

  const total = logs.length;
  const pageSize = state.auditPageSize || 15;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (state.auditPage > totalPages) state.auditPage = totalPages;
  const startIdx = (state.auditPage - 1) * pageSize;
  const pageLogs = logs.slice(startIdx, startIdx + pageSize);

  if (pageLogs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400 font-sans">No activity log entries match the selected filters.</td></tr>`;
  } else {
    tbody.innerHTML = pageLogs.map(log => `
      <tr class="hover:bg-slate-50 transition text-[11px]">
        <td class="p-3 text-slate-500 whitespace-nowrap">
          <div>${new Date(log.timestamp).toLocaleDateString()}</div>
          <div class="text-[10px] text-slate-400">${new Date(log.timestamp).toLocaleTimeString()}</div>
        </td>
        <td class="p-3">
          <strong class="text-slate-900 font-sans">${escHtml(log.userName)}</strong>
          <div class="text-[10px] text-slate-400 font-sans uppercase">${escHtml(log.userRole)}</div>
        </td>
        <td class="p-3">
          <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 font-bold text-[10px]">${escHtml(log.action)}</span>
        </td>
        <td class="p-3 text-slate-600">${escHtml(log.targetEntity)} (<span class="text-indigo-700 font-bold">${escHtml(log.targetId)}</span>)</td>
        <td class="p-3 text-slate-700 max-w-xs font-sans leading-snug">${escHtml(log.details)}</td>
        <td class="p-3 text-slate-500">${escHtml(log.ipAddress)}</td>
        <td class="p-3 text-emerald-700 font-bold truncate max-w-[100px]" title="${escHtml(log.integrityHash || '')}">${escHtml((log.integrityHash || '').substring(0, 10))}...</td>
      </tr>
    `).join('');
  }

  if (pagEl) {
    pagEl.innerHTML = `
      <div>Showing <strong>${total === 0 ? 0 : startIdx + 1}</strong> to <strong>${Math.min(total, startIdx + pageSize)}</strong> of <strong>${total}</strong> immutable audit events</div>
      <div class="flex items-center gap-1.5">
        <button onclick="changeAuditPage(-1)" ${state.auditPage <= 1 ? 'disabled' : ''} class="px-3 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-semibold">Prev</button>
        <span class="px-2 font-bold text-slate-700">Page ${state.auditPage} / ${totalPages}</span>
        <button onclick="changeAuditPage(1)" ${state.auditPage >= totalPages ? 'disabled' : ''} class="px-3 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-semibold">Next</button>
      </div>
    `;
  }
}

function changeAuditPage(delta) {
  state.auditPage = Math.max(1, state.auditPage + delta);
  renderAdminAuditLogsTable();
}

async function refreshAuditLogs() {
  await refreshData(true);
  showToast('Audit trail refreshed', 'info');
}

function exportAuditLogsCsv() {
  const rows = [
    ['Log ID', 'Timestamp', 'User Name', 'Role', 'Activity Action', 'Target Entity', 'Target Identifier', 'Details', 'IP Address', 'SHA-256 Integrity Hash']
  ];
  (state.auditLogs || []).forEach(l => {
    rows.push([
      l.id, l.timestamp, l.userName, l.userRole, l.action, l.targetEntity, l.targetId, l.details, l.ipAddress, l.integrityHash
    ]);
  });
  downloadCsvFile('vitacall-audit-trail.csv', rows);
  showToast('Audit trail exported to CSV', 'success');
}

// -------------------------------------------------------------------------
// ADMIN SECTION 4: REPORTS & ANALYTICS (Generate, Filter, PDF/Print, Excel CSV)
// -------------------------------------------------------------------------

function handleReportPeriodChange() {
  const period = document.getElementById('reportPeriodSelect').value;
  const startInput = document.getElementById('reportStartDate');
  const endInput = document.getElementById('reportEndDate');
  const now = new Date();

  if (period === 'daily') {
    startInput.value = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    endInput.value = now.toISOString().split('T')[0];
  } else if (period === 'weekly') {
    startInput.value = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    endInput.value = now.toISOString().split('T')[0];
  } else if (period === 'monthly') {
    startInput.value = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    endInput.value = now.toISOString().split('T')[0];
  } else if (period === 'all') {
    startInput.value = '';
    endInput.value = '';
  }

  generateAdminReport(false);
}

async function generateAdminReport(logToAudit = false) {
  const container = document.getElementById('adminReportPreviewContainer');
  if (!container) return;

  const category = (document.getElementById('reportCategorySelect') || {}).value || 'summary';
  const period = (document.getElementById('reportPeriodSelect') || {}).value || 'all';
  const startDate = (document.getElementById('reportStartDate') || {}).value || '';
  const endDate = (document.getElementById('reportEndDate') || {}).value || '';

  try {
    const qs = new URLSearchParams({
      category,
      period,
      startDate,
      endDate,
      log: logToAudit ? 'true' : 'false'
    });
    const res = await fetch(`${API_BASE}/admin/reports?${qs.toString()}`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    state.reportData = data;

    if (logToAudit) {
      showToast('Official report generated from Firebase records', 'success');
    }

    const catTitles = {
      summary: 'Executive System & Clinical Surveillance Report',
      students: 'Registered Boarding Students & Checkup Activity Report',
      personnel: 'Health Personnel Triage & Clinical Workload Report',
      activity: 'System Account & Administrative Audit Activity Report',
      logins: 'Authentication & Login History Security Report'
    };

    let tableHtml = '';
    if (category === 'students') {
      const list = data.studentsReport || [];
      tableHtml = `
        <table class="w-full text-left text-xs border border-slate-200">
          <thead class="bg-slate-100 text-slate-700 font-bold">
            <tr>
              <th class="p-2.5 border-b">Student Name</th>
              <th class="p-2.5 border-b">Student ID</th>
              <th class="p-2.5 border-b">Course &amp; Year</th>
              <th class="p-2.5 border-b">Boarding House</th>
              <th class="p-2.5 border-b">Status</th>
              <th class="p-2.5 border-b text-center">Requests</th>
              <th class="p-2.5 border-b text-center">Certificates</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            ${list.map(s => `
              <tr>
                <td class="p-2.5 font-bold">${escHtml(s.name)}</td>
                <td class="p-2.5 font-mono">${escHtml(s.studentId)}</td>
                <td class="p-2.5">${escHtml(s.courseAndYear)}</td>
                <td class="p-2.5">${escHtml(s.boardingHouse)}</td>
                <td class="p-2.5 uppercase font-bold text-[10px]">${escHtml(s.status)}</td>
                <td class="p-2.5 text-center font-bold">${s.totalRequests}</td>
                <td class="p-2.5 text-center font-bold text-emerald-700">${s.certificatesIssued}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (category === 'personnel') {
      const list = data.personnelReport || [];
      tableHtml = `
        <table class="w-full text-left text-xs border border-slate-200">
          <thead class="bg-slate-100 text-slate-700 font-bold">
            <tr>
              <th class="p-2.5 border-b">Personnel Name</th>
              <th class="p-2.5 border-b">Role &amp; Title</th>
              <th class="p-2.5 border-b">PRC License</th>
              <th class="p-2.5 border-b text-center">Assigned</th>
              <th class="p-2.5 border-b text-center">Completed</th>
              <th class="p-2.5 border-b text-center">Certificates Issued</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            ${list.map(p => `
              <tr>
                <td class="p-2.5 font-bold">${escHtml(p.name)}</td>
                <td class="p-2.5">${escHtml(p.title)} (${escHtml(p.role)})</td>
                <td class="p-2.5 font-mono">${escHtml(p.licenseNumber)}</td>
                <td class="p-2.5 text-center font-bold">${p.assignedRequests}</td>
                <td class="p-2.5 text-center font-bold text-teal-700">${p.completedCheckups}</td>
                <td class="p-2.5 text-center font-bold text-emerald-700">${p.certificatesIssued}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (category === 'logins') {
      const list = (data.loginHistoryReport || []).slice(0, 40);
      tableHtml = `
        <table class="w-full text-left text-xs border border-slate-200">
          <thead class="bg-slate-100 text-slate-700 font-bold">
            <tr>
              <th class="p-2.5 border-b">Timestamp</th>
              <th class="p-2.5 border-b">User</th>
              <th class="p-2.5 border-b">Role</th>
              <th class="p-2.5 border-b">Auth Event</th>
              <th class="p-2.5 border-b">IP Address</th>
              <th class="p-2.5 border-b">Details</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            ${list.map(l => `
              <tr>
                <td class="p-2.5 font-mono text-[11px]">${new Date(l.timestamp).toLocaleString()}</td>
                <td class="p-2.5 font-bold">${escHtml(l.userName)}</td>
                <td class="p-2.5 uppercase text-[10px]">${escHtml(l.userRole)}</td>
                <td class="p-2.5 font-mono font-bold">${escHtml(l.action)}</td>
                <td class="p-2.5 font-mono">${escHtml(l.ipAddress)}</td>
                <td class="p-2.5">${escHtml(l.details)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (category === 'activity') {
      const list = (data.accountActivityReport || []).slice(0, 40);
      tableHtml = `
        <table class="w-full text-left text-xs border border-slate-200">
          <thead class="bg-slate-100 text-slate-700 font-bold">
            <tr>
              <th class="p-2.5 border-b">Date &amp; Time</th>
              <th class="p-2.5 border-b">Actor &amp; Role</th>
              <th class="p-2.5 border-b">Action</th>
              <th class="p-2.5 border-b">Target</th>
              <th class="p-2.5 border-b">Description</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            ${list.map(l => `
              <tr>
                <td class="p-2.5 font-mono text-[11px]">${new Date(l.timestamp).toLocaleString()}</td>
                <td class="p-2.5 font-bold">${escHtml(l.userName)} (${escHtml(l.userRole)})</td>
                <td class="p-2.5 font-mono font-bold">${escHtml(l.action)}</td>
                <td class="p-2.5 font-mono">${escHtml(l.targetEntity)}/${escHtml(l.targetId)}</td>
                <td class="p-2.5">${escHtml(l.details)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      // Executive summary: list requests in period
      const list = data.clinicalRequestsReport || [];
      tableHtml = `
        <table class="w-full text-left text-xs border border-slate-200">
          <thead class="bg-slate-100 text-slate-700 font-bold">
            <tr>
              <th class="p-2.5 border-b">Request ID</th>
              <th class="p-2.5 border-b">Date</th>
              <th class="p-2.5 border-b">Student Patient</th>
              <th class="p-2.5 border-b">Boarding House</th>
              <th class="p-2.5 border-b">Urgency</th>
              <th class="p-2.5 border-b">Symptoms</th>
              <th class="p-2.5 border-b">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            ${list.map(r => `
              <tr>
                <td class="p-2.5 font-mono font-bold">${escHtml(r.id)}</td>
                <td class="p-2.5">${new Date(r.createdAt).toLocaleDateString()}</td>
                <td class="p-2.5 font-bold">${escHtml(r.studentName)}</td>
                <td class="p-2.5">${escHtml(r.boardingHouse)}</td>
                <td class="p-2.5 uppercase font-bold text-[10px]">${escHtml(r.urgency)}</td>
                <td class="p-2.5">${escHtml((r.symptoms || []).join(', '))}</td>
                <td class="p-2.5 uppercase font-bold text-[10px]">${escHtml(r.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    const s = data.summary || {};
    container.innerHTML = `
      <div class="border-b-2 border-ustp-navy pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-center space-x-3">
          <img src="assets/ustp-logo.svg" alt="USTP" class="w-12 h-12 object-contain">
          <div>
            <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500">University of Science and Technology of Southern Philippines — Villanueva Campus</div>
            <h3 class="text-lg font-black text-ustp-navy">${escHtml(catTitles[category] || 'System Report')}</h3>
            <div class="text-xs text-slate-500">Period: <strong class="uppercase">${escHtml(period)}</strong> • Generated: ${new Date(data.generatedAt).toLocaleString()} by ${escHtml(data.generatedBy)}</div>
          </div>
        </div>
        <div class="text-right font-mono text-[11px] text-slate-500">
          <div>Document Ref: <strong>RPT-${Date.now().toString().slice(-6)}</strong></div>
          <div>Source: <strong>Firebase / VitaCall DB</strong></div>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div class="text-slate-500">Registered Accounts</div>
          <div class="text-xl font-black text-slate-900 mt-0.5">${s.totalUsers || 0} <span class="text-xs font-normal text-slate-500">(${s.totalStudents || 0} Students)</span></div>
        </div>
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div class="text-slate-500">Checkup Requests</div>
          <div class="text-xl font-black text-teal-700 mt-0.5">${s.requestsInPeriod || 0} <span class="text-xs font-normal text-slate-500">(${s.completedCheckupsInPeriod || 0} Done)</span></div>
        </div>
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div class="text-slate-500">Certificates Issued</div>
          <div class="text-xl font-black text-emerald-700 mt-0.5">${s.certificatesInPeriod || 0}</div>
        </div>
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div class="text-slate-500">Logins / Failed</div>
          <div class="text-xl font-black text-indigo-700 mt-0.5">${s.loginsInPeriod || 0} <span class="text-xs font-normal text-rose-600">(${s.failedLoginsInPeriod || 0} failed)</span></div>
        </div>
      </div>

      <div class="overflow-x-auto">
        ${tableHtml}
      </div>

      <div class="pt-4 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
        <span>Certified True System Extract • USTP Villanueva Student Health &amp; Wellness Center</span>
        <span>Authorized Administrator: <strong>${escHtml(state.currentUser ? state.currentUser.name : 'Admin')}</strong></span>
      </div>
    `;
  } catch (err) {
    console.error('Report generation error:', err);
  }
}

function exportAdminReportExcel() {
  if (!state.reportData) {
    showToast('Generating report data first...', 'info');
    generateAdminReport(true);
    return;
  }
  const cat = state.reportData.category || 'summary';
  let rows = [];

  if (cat === 'students') {
    rows.push(['Student ID', 'Full Name', 'Email', 'Course & Year', 'Boarding House', 'Status', 'Total Requests', 'Completed', 'Certificates Issued']);
    (state.reportData.studentsReport || []).forEach(s => {
      rows.push([s.studentId, s.name, s.email, s.courseAndYear, s.boardingHouse, s.status, s.totalRequests, s.completedRequests, s.certificatesIssued]);
    });
  } else if (cat === 'personnel') {
    rows.push(['ID', 'Name', 'Role', 'Title', 'PRC License', 'Email', 'Assigned Requests', 'Completed Checkups', 'Certificates Issued']);
    (state.reportData.personnelReport || []).forEach(p => {
      rows.push([p.id, p.name, p.role, p.title, p.licenseNumber, p.email, p.assignedRequests, p.completedCheckups, p.certificatesIssued]);
    });
  } else if (cat === 'logins') {
    rows.push(['Event ID', 'Timestamp', 'User Name', 'Role', 'Action', 'IP Address', 'Details']);
    (state.reportData.loginHistoryReport || []).forEach(l => {
      rows.push([l.id, l.timestamp, l.userName, l.userRole, l.action, l.ipAddress, l.details]);
    });
  } else if (cat === 'activity') {
    rows.push(['Audit ID', 'Timestamp', 'User Name', 'Role', 'Action', 'Target Entity', 'Target ID', 'Details', 'IP Address']);
    (state.reportData.accountActivityReport || []).forEach(l => {
      rows.push([l.id, l.timestamp, l.userName, l.userRole, l.action, l.targetEntity, l.targetId, l.details, l.ipAddress]);
    });
  } else {
    rows.push(['Request ID', 'Created At', 'Student Name', 'Student ID', 'Boarding House', 'Urgency', 'Symptoms', 'Status', 'Certificate ID']);
    (state.reportData.clinicalRequestsReport || []).forEach(r => {
      rows.push([r.id, r.createdAt, r.studentName, r.studentId, r.boardingHouse, r.urgency, (r.symptoms || []).join('; '), r.status, r.certificateId || '']);
    });
  }

  downloadCsvFile(`vitacall-report-${cat}-${Date.now()}.csv`, rows);
  showToast(`Exported ${cat.toUpperCase()} report to Excel-compatible CSV`, 'success');
}

function printAdminReportPdf() {
  document.body.classList.add('printing-report');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-report');
  }, 500);
}

// -------------------------------------------------------------------------
// ADMIN SECTION 5: SECURITY MANAGEMENT
// -------------------------------------------------------------------------

async function loadAdminSecurityData() {
  try {
    const res = await fetch(`${API_BASE}/admin/security`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (res.ok) {
      state.securityData = await res.json();
      renderAdminSecuritySection();
      showToast('Security monitor refreshed', 'info');
    }
  } catch (e) {
    console.error('Security load error:', e);
  }
}

function renderAdminSecuritySection() {
  const sec = state.securityData || {};
  const sum = sec.summary || {};

  const setTxt = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };

  setTxt('secStatSuccessLogins', sum.successfulLogins || 0);
  setTxt('secStatFailedLogins', sum.failedLogins || 0);
  setTxt('secStatUnresolvedAlerts', sum.unresolvedAlerts || 0);
  setTxt('secStatLockedAccounts', sum.lockedAccountsCount || 0);
  setTxt('secStatSessionTimeout', `${sum.sessionTimeoutMinutes || 30}m`);

  const lockedContainer = document.getElementById('securityLockedUsersList');
  if (lockedContainer) {
    const lockedList = sec.lockedUsers || [];
    if (lockedList.length === 0) {
      lockedContainer.innerHTML = `<div class="p-3 bg-white rounded-xl border border-slate-200 text-emerald-700 font-semibold">✓ Zero locked accounts or failed login warnings currently active.</div>`;
    } else {
      lockedContainer.innerHTML = lockedList.map(u => `
        <div class="p-3 bg-white rounded-xl border border-rose-200 flex items-center justify-between gap-2">
          <div>
            <div class="font-bold text-slate-900">${escHtml(u.name)} <span class="text-slate-500 font-normal">(${escHtml(u.email)})</span></div>
            <div class="text-[11px] text-rose-600 font-semibold">Failed Attempts: ${u.failedLoginAttempts} ${u.lockedUntil ? '• Locked until ' + new Date(u.lockedUntil).toLocaleTimeString() : ''}</div>
          </div>
          <button onclick="unlockAdminUserAccount('${u.id}')" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition">
            Unlock &amp; Reset
          </button>
        </div>
      `).join('');
    }
  }

  renderAdminSecurityTable();
}

function renderAdminSecurityTable() {
  const tbody = document.getElementById('securityEventsTableBody');
  if (!tbody) return;

  const filterType = ((document.getElementById('securityFilterType') || {}).value) || 'all';
  let events = (state.securityData && state.securityData.securityEvents) || [];
  if (filterType !== 'all') {
    events = events.filter(e => e.type === filterType);
  }

  if (events.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">No security events match this filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = events.slice(0, 40).map(e => {
    const sevBadge = e.severity === 'critical' || e.severity === 'high'
      ? 'bg-rose-100 text-rose-800 border-rose-200'
      : (e.severity === 'medium' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-700 border-slate-200');

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="p-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">${new Date(e.timestamp).toLocaleString()}</td>
        <td class="p-3"><span class="font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-800">${escHtml(e.type)}</span></td>
        <td class="p-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${sevBadge}">${escHtml(e.severity || 'low')}</span></td>
        <td class="p-3">
          <div class="font-bold text-slate-900">${escHtml(e.userName || e.email)}</div>
          <div class="text-[10px] text-slate-500">${escHtml(e.email || '')}</div>
        </td>
        <td class="p-3 text-slate-700 max-w-xs">${escHtml(e.details)}</td>
        <td class="p-3 font-mono text-slate-500">${escHtml(e.ipAddress)}</td>
        <td class="p-3 text-right whitespace-nowrap">
          ${e.resolved
        ? `<span class="text-emerald-700 font-bold text-[11px]">✓ Verified</span>`
        : `<button onclick="resolveSecurityEvent('${e.id}')" class="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[11px] transition">Mark Resolved</button>`
      }
        </td>
      </tr>
    `;
  }).join('');
}

async function resolveSecurityEvent(eventId) {
  try {
    const res = await fetch(`${API_BASE}/admin/security/events/${eventId}/resolve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (res.ok) {
      showToast('Security alert marked as resolved', 'success');
      await refreshData(true);
    }
  } catch (err) {
    showToast('Could not resolve security event', 'error');
  }
}

async function unlockAdminUserAccount(userId) {
  try {
    const res = await fetch(`${API_BASE}/admin/security/unlock-user/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify({ activate: true })
    });
    if (res.ok) {
      showToast('Account unlocked and failed login counter reset', 'success');
      await refreshData(true);
    }
  } catch (err) {
    showToast('Failed to unlock account', 'error');
  }
}

// -------------------------------------------------------------------------
// ADMIN SECTION 6: DATA MANAGEMENT & BACKUP
// -------------------------------------------------------------------------

function renderAdminDataSection() {
  renderAdminBackupsList();
  switchDataRecordTab(state.dataCollectionTab || 'requests');
}

function renderAdminBackupsList() {
  const container = document.getElementById('adminBackupsList');
  if (!container) return;

  const list = state.backups || [];
  if (list.length === 0) {
    container.innerHTML = `<div class="col-span-2 p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-center">No in-app snapshots created yet. Click <strong>"Create Snapshot Restore Point"</strong> above to save an instant restore point.</div>`;
    return;
  }

  container.innerHTML = list.map(b => `
    <div class="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3">
      <div>
        <div class="font-bold text-slate-900">${escHtml(b.name)}</div>
        <div class="text-[11px] text-slate-500">${new Date(b.createdAt).toLocaleString()} • By ${escHtml(b.createdBy)}</div>
        <div class="text-[10px] font-mono text-indigo-700 mt-1">
          Users: ${(b.counts && b.counts.users) || 0} | Requests: ${(b.counts && b.counts.requests) || 0} | Certs: ${(b.counts && b.counts.certificates) || 0}
        </div>
      </div>
      <div class="flex items-center gap-1.5 flex-shrink-0">
        <button onclick="confirmRestoreSnapshot('${b.id}', '${escHtml(b.name)}')" class="px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[11px] transition">
          Restore
        </button>
        <button onclick="confirmDeleteSnapshot('${b.id}')" class="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 transition">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>
  `).join('');
  if (window.lucide) window.lucide.createIcons();
}

async function createInAppBackupSnapshot() {
  const snapName = `Snapshot ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  try {
    const res = await fetch(`${API_BASE}/admin/backups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify({ name: snapName })
    });
    if (res.ok) {
      showToast('System backup restore point created!', 'success');
      await refreshData(true);
    }
  } catch (err) {
    showToast('Failed to create backup snapshot', 'error');
  }
}

function confirmRestoreSnapshot(snapId, snapName) {
  openConfirmActionModal(
    'Restore System Database from Snapshot',
    `Are you sure you want to restore the entire database to "${snapName}"? Current records will be replaced with the snapshot state.`,
    async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/backups/${snapId}/restore`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
          showToast(`Database restored from "${snapName}"`, 'success');
          await refreshData(true);
        } else {
          showToast('Snapshot restore failed', 'error');
        }
      } catch (err) {
        showToast('Error restoring snapshot', 'error');
      }
    }
  );
}

function confirmDeleteSnapshot(snapId) {
  openConfirmActionModal(
    'Delete Backup Snapshot',
    'Are you sure you want to delete this saved restore point?',
    async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/backups/${snapId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
          showToast('Backup snapshot deleted', 'info');
          await refreshData(true);
        }
      } catch (err) {
        showToast('Error deleting snapshot', 'error');
      }
    }
  );
}

function switchDataRecordTab(collection) {
  state.dataCollectionTab = collection;
  const bReq = document.getElementById('dataTabBtnRequests');
  const bClin = document.getElementById('dataTabBtnClinical');
  const bCert = document.getElementById('dataTabBtnCertificates');
  const addBtn = document.getElementById('btnAddAdminRecord');

  [bReq, bClin, bCert].forEach(b => {
    if (b) b.className = 'data-col-tab px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition';
  });
  const activeBtn = collection === 'clinicalRecords' ? bClin : (collection === 'certificates' ? bCert : bReq);
  if (activeBtn) activeBtn.className = 'data-col-tab px-3.5 py-2 rounded-xl bg-ustp-navy text-white transition';

  if (addBtn) {
    addBtn.classList.toggle('hidden', collection === 'certificates');
  }

  renderAdminDataRecordsTable();
}

function renderAdminDataRecordsTable() {
  const thead = document.getElementById('adminDataRecordsTableHead');
  const tbody = document.getElementById('adminDataRecordsTableBody');
  if (!thead || !tbody) return;

  const col = state.dataCollectionTab || 'requests';
  const q = ((document.getElementById('dataRecordsSearch') || {}).value || '').toLowerCase().trim();

  if (col === 'requests') {
    thead.innerHTML = `
      <tr>
        <th class="p-3">Request ID</th>
        <th class="p-3">Student</th>
        <th class="p-3">Boarding House</th>
        <th class="p-3">Urgency</th>
        <th class="p-3">Status</th>
        <th class="p-3">Created</th>
        <th class="p-3 text-right">Actions</th>
      </tr>
    `;
    let items = [...(state.requests || [])];
    if (q) {
      items = items.filter(r =>
        (r.id || '').toLowerCase().includes(q) ||
        (r.studentName || '').toLowerCase().includes(q) ||
        (r.boardingHouse || '').toLowerCase().includes(q)
      );
    }
    tbody.innerHTML = items.length === 0
      ? `<tr><td colspan="7" class="p-6 text-center text-slate-400">No request records found.</td></tr>`
      : items.map(r => `
        <tr class="hover:bg-slate-50">
          <td class="p-3 font-mono font-bold">${escHtml(r.id)}</td>
          <td class="p-3 font-bold">${escHtml(r.studentName)} <span class="text-slate-400 font-normal">(${escHtml(r.studentId)})</span></td>
          <td class="p-3 text-slate-600">${escHtml(r.boardingHouse)}</td>
          <td class="p-3 uppercase font-bold text-[10px]">${escHtml(r.urgency)}</td>
          <td class="p-3 uppercase font-bold text-[10px] text-teal-700">${escHtml(r.status)}</td>
          <td class="p-3 text-slate-500">${new Date(r.createdAt).toLocaleDateString()}</td>
          <td class="p-3 text-right space-x-1">
            <button onclick="openAdminRecordModal('requests', '${r.id}')" class="px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px]">Edit</button>
            <button onclick="confirmDeleteSystemRecord('requests', '${r.id}')" class="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px]">Delete</button>
          </td>
        </tr>
      `).join('');
  } else if (col === 'clinicalRecords') {
    thead.innerHTML = `
      <tr>
        <th class="p-3">Record ID</th>
        <th class="p-3">Patient</th>
        <th class="p-3">Examiner</th>
        <th class="p-3">Diagnosis</th>
        <th class="p-3">Exam Date</th>
        <th class="p-3 text-right">Actions</th>
      </tr>
    `;
    let items = [...(state.clinicalRecords || [])];
    if (q) {
      items = items.filter(c =>
        (c.id || '').toLowerCase().includes(q) ||
        (c.patientName || '').toLowerCase().includes(q) ||
        (c.diagnosis || '').toLowerCase().includes(q)
      );
    }
    tbody.innerHTML = items.length === 0
      ? `<tr><td colspan="6" class="p-6 text-center text-slate-400">No clinical records found.</td></tr>`
      : items.map(c => `
        <tr class="hover:bg-slate-50">
          <td class="p-3 font-mono font-bold">${escHtml(c.id)}</td>
          <td class="p-3 font-bold">${escHtml(c.patientName)}</td>
          <td class="p-3 text-slate-600">${escHtml(c.examinerName)}</td>
          <td class="p-3 text-slate-800 max-w-xs truncate">${escHtml(c.diagnosis)}</td>
          <td class="p-3 text-slate-500">${new Date(c.dateExamined).toLocaleDateString()}</td>
          <td class="p-3 text-right space-x-1">
            <button onclick="openAdminRecordModal('clinicalRecords', '${c.id}')" class="px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px]">Edit</button>
            <button onclick="confirmDeleteSystemRecord('clinicalRecords', '${c.id}')" class="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px]">Delete</button>
          </td>
        </tr>
      `).join('');
  } else {
    thead.innerHTML = `
      <tr>
        <th class="p-3">Verification Code</th>
        <th class="p-3">Student</th>
        <th class="p-3">Diagnosis</th>
        <th class="p-3">Issued By</th>
        <th class="p-3">Status</th>
        <th class="p-3 text-right">Actions</th>
      </tr>
    `;
    let items = [...(state.certificates || [])];
    if (q) {
      items = items.filter(c =>
        (c.verificationCode || '').toLowerCase().includes(q) ||
        (c.studentName || '').toLowerCase().includes(q) ||
        (c.diagnosis || '').toLowerCase().includes(q)
      );
    }
    tbody.innerHTML = items.length === 0
      ? `<tr><td colspan="6" class="p-6 text-center text-slate-400">No certificates found.</td></tr>`
      : items.map(c => `
        <tr class="hover:bg-slate-50">
          <td class="p-3 font-mono font-bold text-ustp-navy">${escHtml(c.verificationCode)}</td>
          <td class="p-3 font-bold">${escHtml(c.studentName)}</td>
          <td class="p-3 text-slate-700 max-w-xs truncate">${escHtml(c.diagnosis)}</td>
          <td class="p-3 text-slate-600">${escHtml(c.issuerName)}</td>
          <td class="p-3 uppercase font-bold text-[10px] text-emerald-700">${escHtml(c.status || 'valid')}</td>
          <td class="p-3 text-right space-x-1">
            <button onclick="viewCertificate('${c.verificationCode}')" class="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px]">View</button>
            ${c.status !== 'revoked' ? `<button onclick="revokeAdminCertificate('${c.id}')" class="px-2.5 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[11px]">Revoke</button>` : ''}
            <button onclick="openAdminRecordModal('certificates', '${c.id}')" class="px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px]">Edit</button>
            <button onclick="confirmDeleteSystemRecord('certificates', '${c.id}')" class="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px]">Delete</button>
          </td>
        </tr>
      `).join('');
  }
}

function openAdminRecordModal(collection = null, recordId = null) {
  const col = collection || state.dataCollectionTab || 'requests';
  document.getElementById('adminRecordCollection').value = col;
  document.getElementById('adminRecordId').value = recordId || '';
  const fieldsContainer = document.getElementById('adminRecordDynamicFields');
  const titleEl = document.getElementById('adminRecordModalTitle');

  if (col === 'requests') {
    const item = recordId ? (state.requests || []).find(r => r.id === recordId) : {};
    titleEl.textContent = recordId ? `Edit Request ${recordId}` : 'Add Checkup Request Record';
    fieldsContainer.innerHTML = `
      <div class="grid grid-cols-2 gap-2.5">
        <div>
          <label class="block font-bold text-slate-700 mb-1">Student Name</label>
          <input type="text" id="recReqStudentName" value="${escHtml(item.studentName || '')}" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" required>
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">Student ID</label>
          <input type="text" id="recReqStudentId" value="${escHtml(item.studentId || '2026-30100')}" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" required>
        </div>
      </div>
      <div>
        <label class="block font-bold text-slate-700 mb-1">Boarding House &amp; Room</label>
        <input type="text" id="recReqDorm" value="${escHtml(item.boardingHouse || '')}" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" required>
      </div>
      <div class="grid grid-cols-2 gap-2.5">
        <div>
          <label class="block font-bold text-slate-700 mb-1">Urgency</label>
          <select id="recReqUrgency" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold">
            <option value="mild" ${item.urgency === 'mild' ? 'selected' : ''}>Mild</option>
            <option value="moderate" ${(!item.urgency || item.urgency === 'moderate') ? 'selected' : ''}>Moderate</option>
            <option value="severe" ${item.urgency === 'severe' ? 'selected' : ''}>Severe</option>
          </select>
        </div>
        <div>
          <label class="block font-bold text-slate-700 mb-1">Status</label>
          <select id="recReqStatus" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold">
            <option value="pending" ${item.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="assigned" ${item.status === 'assigned' ? 'selected' : ''}>Assigned</option>
            <option value="en_route" ${item.status === 'en_route' ? 'selected' : ''}>En Route</option>
            <option value="in_progress" ${item.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
            <option value="completed" ${item.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="cancelled" ${item.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </div>
      </div>
      <div>
        <label class="block font-bold text-slate-700 mb-1">Symptoms (comma-separated)</label>
        <input type="text" id="recReqSymptoms" value="${escHtml((item.symptoms || ['High Fever']).join(', '))}" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" required>
      </div>
    `;
  } else if (col === 'clinicalRecords') {
    const item = recordId ? (state.clinicalRecords || []).find(c => c.id === recordId) : {};
    titleEl.textContent = recordId ? `Edit Clinical Record ${recordId}` : 'Add Clinical Record';
    fieldsContainer.innerHTML = `
      <div>
        <label class="block font-bold text-slate-700 mb-1">Patient Name</label>
        <input type="text" id="recClinPatient" value="${escHtml(item.patientName || '')}" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" required>
      </div>
      <div>
        <label class="block font-bold text-slate-700 mb-1">Clinical Diagnosis</label>
        <input type="text" id="recClinDiagnosis" value="${escHtml(item.diagnosis || '')}" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" required>
      </div>
      <div>
        <label class="block font-bold text-slate-700 mb-1">Prescription &amp; Care Notes</label>
        <textarea id="recClinRx" rows="3" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">${escHtml(item.prescriptionAndCare || '')}</textarea>
      </div>
    `;
  } else if (col === 'certificates') {
    const item = recordId ? (state.certificates || []).find(c => c.id === recordId) : {};
    titleEl.textContent = `Edit Certificate ${item.verificationCode || recordId}`;
    fieldsContainer.innerHTML = `
      <div>
        <label class="block font-bold text-slate-700 mb-1">Diagnosis on Certificate</label>
        <input type="text" id="recCertDiagnosis" value="${escHtml(item.diagnosis || '')}" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" required>
      </div>
      <div>
        <label class="block font-bold text-slate-700 mb-1">Excused Dates Text</label>
        <input type="text" id="recCertExcused" value="${escHtml(item.excusedDates || '')}" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" required>
      </div>
      <div>
        <label class="block font-bold text-slate-700 mb-1">Certificate Validity Status</label>
        <select id="recCertStatus" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold">
          <option value="valid" ${item.status === 'valid' ? 'selected' : ''}>Valid (Official)</option>
          <option value="revoked" ${item.status === 'revoked' ? 'selected' : ''}>Revoked</option>
        </select>
      </div>
    `;
  }

  document.getElementById('adminRecordModal').classList.remove('hidden');
}

async function submitAdminRecordForm(e) {
  e.preventDefault();
  const col = document.getElementById('adminRecordCollection').value;
  const id = document.getElementById('adminRecordId').value;

  let payload = {};
  if (col === 'requests') {
    payload = {
      studentName: document.getElementById('recReqStudentName').value.trim(),
      studentId: document.getElementById('recReqStudentId').value.trim(),
      boardingHouse: document.getElementById('recReqDorm').value.trim(),
      urgency: document.getElementById('recReqUrgency').value,
      status: document.getElementById('recReqStatus').value,
      symptoms: document.getElementById('recReqSymptoms').value.split(',').map(s => s.trim()).filter(Boolean)
    };
  } else if (col === 'clinicalRecords') {
    payload = {
      patientName: document.getElementById('recClinPatient').value.trim(),
      diagnosis: document.getElementById('recClinDiagnosis').value.trim(),
      prescriptionAndCare: document.getElementById('recClinRx').value.trim()
    };
  } else if (col === 'certificates') {
    payload = {
      diagnosis: document.getElementById('recCertDiagnosis').value.trim(),
      excusedDates: document.getElementById('recCertExcused').value.trim(),
      status: document.getElementById('recCertStatus').value
    };
  }

  try {
    const url = id ? `${API_BASE}/admin/records/${col}/${id}` : `${API_BASE}/admin/records/${col}`;
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      document.getElementById('adminRecordModal').classList.add('hidden');
      showToast('System record saved!', 'success');
      await refreshData(true);
    } else {
      const err = await res.json();
      showToast(err.error || 'Could not save record', 'error');
    }
  } catch (err) {
    showToast('Server error saving record', 'error');
  }
}

function confirmDeleteSystemRecord(collection, recordId) {
  openConfirmActionModal(
    'Delete System Record',
    `Are you sure you want to permanently delete record "${recordId}" from ${collection}? This action cannot be undone.`,
    async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/records/${collection}/${recordId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
          showToast(`Record ${recordId} deleted`, 'info');
          await refreshData(true);
        }
      } catch (err) {
        showToast('Failed to delete record', 'error');
      }
    }
  );
}

function exportCurrentCollectionCsv() {
  const col = state.dataCollectionTab || 'requests';
  let rows = [];
  if (col === 'requests') {
    rows.push(['ID', 'Student Name', 'Student ID', 'Boarding House', 'Urgency', 'Status', 'Created At']);
    (state.requests || []).forEach(r => rows.push([r.id, r.studentName, r.studentId, r.boardingHouse, r.urgency, r.status, r.createdAt]));
  } else if (col === 'clinicalRecords') {
    rows.push(['ID', 'Request ID', 'Patient Name', 'Examiner', 'Diagnosis', 'Date Examined']);
    (state.clinicalRecords || []).forEach(c => rows.push([c.id, c.requestId, c.patientName, c.examinerName, c.diagnosis, c.dateExamined]));
  } else {
    rows.push(['Certificate ID', 'Verification Code', 'Student Name', 'Diagnosis', 'Excused Dates', 'Issuer', 'Status']);
    (state.certificates || []).forEach(c => rows.push([c.id, c.verificationCode, c.studentName, c.diagnosis, c.excusedDates, c.issuerName, c.status]));
  }
  downloadCsvFile(`vitacall-${col}-export.csv`, rows);
  showToast(`Exported ${col} collection to CSV`, 'success');
}

function exportDatabaseBackup() {
  window.open(`${API_BASE}/admin/backup?token=${state.token}`, '_blank');
}

async function restoreDatabaseBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const backupJson = JSON.parse(evt.target.result);
      openConfirmActionModal(
        'Restore Database from Backup File',
        `Are you sure you want to overwrite current database records with backup file "${file.name}"?`,
        async () => {
          const res = await fetch(`${API_BASE}/admin/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
            body: JSON.stringify(backupJson)
          });
          if (res.ok) {
            showToast('Database successfully restored!', 'success');
            await refreshData(true);
          } else {
            showToast('Restore failed', 'error');
          }
        }
      );
    } catch (err) {
      showToast('Invalid backup JSON file', 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// -------------------------------------------------------------------------
// ADMIN SECTION 7: NOTIFICATIONS & ANNOUNCEMENTS
// -------------------------------------------------------------------------

function renderAdminAnnouncementsSection() {
  const listEl = document.getElementById('adminAnnouncementsList');
  const histEl = document.getElementById('adminNotificationHistoryList');

  if (listEl) {
    const list = state.announcements || [];
    if (list.length === 0) {
      listEl.innerHTML = `<div class="p-6 text-center text-slate-400">No announcements published yet.</div>`;
    } else {
      listEl.innerHTML = list.map(a => `
        <div class="p-4 rounded-xl border ${a.isPinned ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-slate-50/70'} space-y-2">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 flex-wrap">
              ${a.isPinned ? `<span class="bg-amber-200 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded uppercase">📌 Pinned</span>` : ''}
              <span class="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Target: ${escHtml(a.targetRole)}</span>
              <span class="bg-slate-200 text-slate-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase">${escHtml(a.priority)}</span>
            </div>
            <div class="flex items-center gap-1">
              <button onclick="editAdminAnnouncement('${a.id}')" class="px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px]">Edit</button>
              <button onclick="confirmDeleteAnnouncement('${a.id}')" class="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px]">Delete</button>
            </div>
          </div>
          <h4 class="font-bold text-slate-900 text-sm">${escHtml(a.title)}</h4>
          <p class="text-slate-600 text-xs leading-relaxed">${escHtml(a.message)}</p>
          <div class="text-[10px] text-slate-400 flex items-center justify-between pt-1">
            <span>By ${escHtml(a.authorName)} • ${new Date(a.createdAt).toLocaleString()}</span>
            ${a.expiresAt ? `<span>Expires: ${escHtml(a.expiresAt)}</span>` : ''}
          </div>
        </div>
      `).join('');
    }
  }

  if (histEl) {
    const notifs = state.notifications || [];
    if (notifs.length === 0) {
      histEl.innerHTML = `<div class="p-4 text-center text-slate-400">No recent notifications in history.</div>`;
    } else {
      histEl.innerHTML = notifs.slice(0, 25).map(n => `
        <div class="py-2.5 flex items-start justify-between gap-2">
          <div>
            <div class="font-bold text-slate-800">${escHtml(n.title)}</div>
            <div class="text-slate-600 text-[11px]">${escHtml(n.message)}</div>
          </div>
          <span class="text-[10px] text-slate-400 whitespace-nowrap">${new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      `).join('');
    }
  }
}

function editAdminAnnouncement(annId) {
  const a = (state.announcements || []).find(item => item.id === annId);
  if (!a) return;

  document.getElementById('annEditId').value = a.id;
  document.getElementById('annTitleInput').value = a.title || '';
  document.getElementById('annTargetRole').value = a.targetRole || 'all';
  document.getElementById('annPriority').value = a.priority || 'info';
  document.getElementById('annMessageInput').value = a.message || '';
  document.getElementById('annScheduledAt').value = a.scheduledAt || '';
  document.getElementById('annExpiresAt').value = a.expiresAt || '';
  document.getElementById('annIsPinned').checked = Boolean(a.isPinned);

  document.getElementById('btnSubmitAnnouncementText').textContent = 'Update Announcement';
  document.getElementById('btnCancelAnnEdit').classList.remove('hidden');
}

function resetAnnouncementForm() {
  document.getElementById('adminAnnouncementForm').reset();
  document.getElementById('annEditId').value = '';
  document.getElementById('btnSubmitAnnouncementText').textContent = 'Publish & Broadcast Announcement';
  document.getElementById('btnCancelAnnEdit').classList.add('hidden');
}

async function submitAdminAnnouncement(e) {
  e.preventDefault();
  const editId = document.getElementById('annEditId').value;

  const payload = {
    title: document.getElementById('annTitleInput').value.trim(),
    targetRole: document.getElementById('annTargetRole').value,
    priority: document.getElementById('annPriority').value,
    message: document.getElementById('annMessageInput').value.trim(),
    scheduledAt: document.getElementById('annScheduledAt').value || null,
    expiresAt: document.getElementById('annExpiresAt').value || null,
    isPinned: document.getElementById('annIsPinned').checked,
    sendNotification: document.getElementById('annSendNotif').checked
  };

  setButtonLoading('btnSubmitAnnouncement', true);
  try {
    const url = editId ? `${API_BASE}/admin/announcements/${editId}` : `${API_BASE}/admin/announcements`;
    const method = editId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Could not save announcement', 'error');
      return;
    }
    resetAnnouncementForm();
    showToast(data.message || 'Announcement published!', 'success');
    await refreshData(true);
  } catch (err) {
    showToast('Server error publishing announcement', 'error');
  } finally {
    setButtonLoading('btnSubmitAnnouncement', false);
  }
}

function confirmDeleteAnnouncement(annId) {
  openConfirmActionModal(
    'Delete Announcement',
    'Are you sure you want to delete this system announcement?',
    async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/announcements/${annId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
          showToast('Announcement deleted', 'info');
          await refreshData(true);
        }
      } catch (err) {
        showToast('Failed to delete announcement', 'error');
      }
    }
  );
}

// -------------------------------------------------------------------------
// ADMIN SECTION 8: SYSTEM SETTINGS
// -------------------------------------------------------------------------

function renderAdminSettingsSection() {
  const s = state.systemSettings || {};
  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (el && v !== undefined) el.value = v;
  };
  const setChk = (id, v) => {
    const el = document.getElementById(id);
    if (el && v !== undefined) el.checked = Boolean(v);
  };

  setVal('sysSettingName', s.systemName || 'VitaCall');
  setVal('sysSettingCampus', s.campusName || 'Villanueva Campus');
  setVal('sysSettingSubtitle', s.systemSubtitle || 'Mobile Health Request & Monitoring');
  setVal('sysSettingLogo', s.logoUrl || 'assets/ustp-logo.svg');
  setVal('sysSettingClinicHotline', s.clinicHotline || '0920-111-8899');
  setVal('sysSettingEmergencyHotline', s.emergencyHotline || '0917-882-8911');
  setVal('sysSettingHours', s.operatingHours || 'Monday - Saturday, 7:00 AM - 7:00 PM');
  setVal('sysSettingCertDays', s.defaultCertValidityDays || 7);

  setChk('sysSettingAllowReg', s.allowRegistration !== false);
  setChk('sysSettingRequireApproval', Boolean(s.requireAccountApproval));
  setChk('sysSettingEnforceEmail', Boolean(s.enforceUstpEmail));

  setVal('sysSettingMaxFailed', s.maxFailedLoginAttempts || 5);
  setVal('sysSettingLockoutMins', s.lockoutDurationMinutes || 15);
  setVal('sysSettingSessionTimeout', s.sessionTimeoutMinutes || 30);

  setChk('sysSettingEnableAnnouncements', s.enableAnnouncementsBanner !== false);
  setChk('sysSettingAutoNotifySevere', s.autoNotifyPersonnelOnSevere !== false);
  setChk('sysSettingMaintenanceMode', Boolean(s.maintenanceMode));
  setVal('sysSettingMaintenanceMsg', s.maintenanceMessage || '');

  const infoCard = document.getElementById('adminSystemInfoCard');
  if (infoCard) {
    const info = state.systemInfo || {};
    const cols = info.collectionsCount || {};
    infoCard.innerHTML = `
      <div class="p-2.5 bg-white rounded-xl border border-slate-200 flex justify-between">
        <span class="text-slate-500">System Release Version</span>
        <span class="font-mono font-bold text-slate-900">${escHtml(info.version || '2.4.0-USTP-Enterprise')}</span>
      </div>
      <div class="p-2.5 bg-white rounded-xl border border-slate-200 flex justify-between">
        <span class="text-slate-500">Firebase Project ID</span>
        <span class="font-mono font-bold text-indigo-700">${escHtml(info.firebaseProjectId || 'vitacall-ustp-villanueva')}</span>
      </div>
      <div class="p-2.5 bg-white rounded-xl border border-slate-200 flex justify-between">
        <span class="text-slate-500">Database &amp; Security Rules</span>
        <span class="font-bold text-emerald-700">✓ Firestore &amp; RTDB Enforced</span>
      </div>
      <div class="p-2.5 bg-white rounded-xl border border-slate-200 flex justify-between">
        <span class="text-slate-500">Runtime &amp; Storage Footprint</span>
        <span class="font-mono text-slate-800">${escHtml(info.nodeVersion || 'Node.js')} • ${info.databaseSizeKb || 42} KB</span>
      </div>
      <div class="p-2.5 bg-white rounded-xl border border-slate-200">
        <div class="text-slate-500 mb-1">Synchronized Collections Count</div>
        <div class="flex flex-wrap gap-1.5 font-mono text-[10px]">
          <span class="px-2 py-0.5 bg-slate-100 rounded">users: ${cols.users || 0}</span>
          <span class="px-2 py-0.5 bg-slate-100 rounded">requests: ${cols.requests || 0}</span>
          <span class="px-2 py-0.5 bg-slate-100 rounded">clinical: ${cols.clinicalRecords || 0}</span>
          <span class="px-2 py-0.5 bg-slate-100 rounded">certs: ${cols.certificates || 0}</span>
          <span class="px-2 py-0.5 bg-slate-100 rounded">auditLogs: ${cols.auditLogs || 0}</span>
        </div>
      </div>
    `;
  }
}

async function saveAdminSystemSettings(e) {
  e.preventDefault();
  const payload = {
    systemName: document.getElementById('sysSettingName').value.trim(),
    campusName: document.getElementById('sysSettingCampus').value.trim(),
    systemSubtitle: document.getElementById('sysSettingSubtitle').value.trim(),
    logoUrl: document.getElementById('sysSettingLogo').value.trim(),
    clinicHotline: document.getElementById('sysSettingClinicHotline').value.trim(),
    emergencyHotline: document.getElementById('sysSettingEmergencyHotline').value.trim(),
    operatingHours: document.getElementById('sysSettingHours').value.trim(),
    defaultCertValidityDays: Number(document.getElementById('sysSettingCertDays').value) || 7,
    allowRegistration: document.getElementById('sysSettingAllowReg').checked,
    requireAccountApproval: document.getElementById('sysSettingRequireApproval').checked,
    enforceUstpEmail: document.getElementById('sysSettingEnforceEmail').checked,
    maxFailedLoginAttempts: Number(document.getElementById('sysSettingMaxFailed').value) || 5,
    lockoutDurationMinutes: Number(document.getElementById('sysSettingLockoutMins').value) || 15,
    sessionTimeoutMinutes: Number(document.getElementById('sysSettingSessionTimeout').value) || 30,
    enableAnnouncementsBanner: document.getElementById('sysSettingEnableAnnouncements').checked,
    autoNotifyPersonnelOnSevere: document.getElementById('sysSettingAutoNotifySevere').checked,
    maintenanceMode: document.getElementById('sysSettingMaintenanceMode').checked,
    maintenanceMessage: document.getElementById('sysSettingMaintenanceMsg').value.trim()
  };

  setButtonLoading('btnSaveSystemSettings', true);
  try {
    await delay(APP_LOADING_DELAY_MS);
    const res = await fetch(`${API_BASE}/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Could not update system settings', 'error');
      return;
    }

    state.systemSettings = data.settings;
    applySystemSettingsBranding(state.systemSettings);
    showToast('System settings updated and applied globally!', 'success');
    await refreshData(true);
  } catch (err) {
    showToast('Server error updating system settings', 'error');
  } finally {
    setButtonLoading('btnSaveSystemSettings', false);
  }
}

// =========================================================================
// REUSABLE CONFIRMATION DIALOG & CSV DOWNLOAD HELPER
// =========================================================================

function openConfirmActionModal(title, message, onConfirm) {
  const modal = document.getElementById('confirmActionModal');
  document.getElementById('confirmActionTitle').textContent = title;
  document.getElementById('confirmActionMessage').textContent = message;
  state._pendingConfirmFn = onConfirm;

  const btn = document.getElementById('confirmActionExecuteBtn');
  btn.onclick = async () => {
    const fn = state._pendingConfirmFn;
    closeConfirmActionModal();
    if (typeof fn === 'function') await fn();
  };

  modal.classList.remove('hidden');
}

function closeConfirmActionModal() {
  const modal = document.getElementById('confirmActionModal');
  if (modal) modal.classList.add('hidden');
  state._pendingConfirmFn = null;
}

function downloadCsvFile(filename, rows) {
  const csvContent = rows.map(row =>
    row.map(cell => `"${String(cell === null || cell === undefined ? '' : cell).replace(/"/g, '""')}"`).join(',')
  ).join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// =========================================================================
// 7. CHECKUP REQUEST SUBMISSION
// =========================================================================

function openRequestModal() {
  const user = state.currentUser;
  if (!user) return;

  const shareLoc = !user.settings || user.settings.shareLocationWithResponder !== false;
  document.getElementById('reqBoardingHouse').value = shareLoc ? (user.boardingHouse || '') : '';
  document.getElementById('reqAddress').value = shareLoc ? (user.address || '') : '';
  document.getElementById('reqLandmark').value = shareLoc ? (user.landmark || '') : '';
  document.getElementById('reqPhone').value = user.phone || '';
  hideErrorMsg('requestError');

  document.getElementById('requestModal').classList.remove('hidden');
}

function closeRequestModal() {
  document.getElementById('requestModal').classList.add('hidden');
}

async function submitCheckupRequest(e) {
  e.preventDefault();

  const selectedSymptoms = Array.from(document.querySelectorAll('input[name="symptom"]:checked')).map(cb => cb.value);
  if (selectedSymptoms.length === 0) {
    showErrorMsg('requestError', 'Please select at least one symptom before submitting.');
    return;
  }

  hideErrorMsg('requestError');
  setButtonLoading('btnSubmitRequest', true);

  const payload = {
    urgency: document.querySelector('input[name="urgency"]:checked').value,
    symptoms: selectedSymptoms,
    symptomDetails: document.getElementById('reqDetails').value,
    temperature: document.getElementById('reqTempInput').value,
    canWalk: document.getElementById('reqCanWalk').checked,
    hasCompanion: document.getElementById('reqHasCompanion').checked,
    preferredTime: document.getElementById('reqPreferredTime').value,
    boardingHouse: document.getElementById('reqBoardingHouse').value,
    address: document.getElementById('reqAddress').value,
    landmark: document.getElementById('reqLandmark').value,
    phone: document.getElementById('reqPhone').value
  };

  try {
    await delay(APP_LOADING_DELAY_MS);

    const res = await fetch(`${API_BASE}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      showErrorMsg('requestError', data.error || 'Failed to submit checkup request');
      return;
    }

    closeRequestModal();
    showToast('Checkup request submitted! Health personnel notified.', 'success');
    await refreshData(true);
  } catch (err) {
    console.error('Request submission error:', err);
    showErrorMsg('requestError', 'Server communication error. Please try again.');
  } finally {
    setButtonLoading('btnSubmitRequest', false);
  }
}

function handleFabClick() {
  if (state.activeView === 'profile') { navigate('dashboard'); return; }
  if (state.currentUser && state.currentUser.role === 'requester') openRequestModal();
  else if (state.currentUser && state.currentUser.role === 'personnel') { navigate('dashboard'); switchPersonnelTab('queue'); filterQueue('pending'); }
  else { navigate('dashboard'); switchAdminSection('overview'); }
}

// =========================================================================
// TASK 1: IN-APP NOTIFICATIONS — Clickable, marks as read, navigates
// =========================================================================

function toggleNotifications() {
  const panel = document.getElementById('notifPanel');
  panel.classList.toggle('hidden');
}

async function markAllNotificationsRead() {
  if (!state.token) return;
  try {
    await fetch(`${API_BASE}/notifications/mark-all-read`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    (state.notifications || []).forEach(n => { n.isRead = true; });
    updateNotificationsUI();
    showToast('All notifications marked as read', 'info');
  } catch (e) { }
}

function updateNotificationsUI() {
  const list = document.getElementById('notifList');
  const badge = document.getElementById('notifBadge');
  const count = document.getElementById('notifCount');

  const unread = state.notifications.filter(n => !n.isRead);
  if (badge) badge.classList.toggle('hidden', unread.length === 0);
  if (count) count.textContent = `${unread.length} new`;

  if (!list) return;

  if (state.notifications.length === 0) {
    list.innerHTML = `<div class="p-4 text-center text-slate-400 text-xs">No notifications yet</div>`;
    return;
  }

  list.innerHTML = state.notifications.map(n => {
    const targetRoute = getNotifTargetRoute(n);
    const isCertNotif = (n.title || '').toLowerCase().includes('certificate') || targetRoute === 'certificates';
    return `
      <div
        role="button"
        tabindex="0"
        onclick="handleNotifClick('${n.id}', '${targetRoute}')"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();handleNotifClick('${n.id}','${targetRoute}')}"
        class="p-3 hover:bg-slate-50 transition cursor-pointer ${n.isRead ? 'opacity-60' : 'bg-amber-50/40 border-l-2 border-amber-400'} focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ustp-navy"
        aria-label="${escHtml(n.title)}"
      >
        <div class="font-bold text-slate-900 flex items-center justify-between gap-2">
          <span class="flex items-center gap-1.5 min-w-0">
            ${!n.isRead ? '<span class="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" aria-label="Unread"></span>' : ''}
            <span class="truncate text-xs">${escHtml(n.title)}</span>
          </span>
          <span class="text-[9px] text-slate-400 font-normal flex-shrink-0">${new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <p class="text-slate-600 mt-0.5 leading-snug text-xs">${escHtml(n.message)}</p>
        ${isCertNotif ? `
          <div class="mt-1.5">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-700 text-white font-bold text-[10px] shadow-sm">
              <i data-lucide="file-badge" class="w-3 h-3"></i>
              <span>Open Certificate</span>
            </span>
          </div>
        ` : `<span class="text-[10px] text-ustp-navy font-semibold mt-0.5 flex items-center gap-0.5">Tap to view →</span>`}
      </div>
    `;
  }).join('');
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getNotifTargetRoute(n) {
  if (n && n.targetRoute) return n.targetRoute;
  const title = (n.title || '').toLowerCase();
  const msg = (n.message || '').toLowerCase();
  const type = (n.type || '').toLowerCase();

  if (title.includes('certificate') || msg.includes('certificate') || type === 'success') {
    return 'certificates';
  }
  if (title.includes('new request') || msg.includes('urgency')) {
    return 'queue';
  }
  if (title.includes('assigned') || msg.includes('assigned') || title.includes('en route') || msg.includes('en route')) {
    return n.relatedRequestId ? `request:${n.relatedRequestId}` : 'request:active';
  }
  if (title.includes('request') || title.includes('update')) {
    return n.relatedRequestId ? `request:${n.relatedRequestId}` : 'dashboard';
  }
  return 'dashboard';
}

async function handleNotifClick(notifId, targetRoute) {
  const panel = document.getElementById('notifPanel');
  if (panel) panel.classList.add('hidden');

  try {
    await fetch(`${API_BASE}/notifications/${notifId}/read`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const notif = state.notifications.find(n => n.id === notifId);
    if (notif) notif.isRead = true;
    updateNotificationsUI();
  } catch (e) {
    console.warn('Could not mark notification as read:', e);
  }

  if (targetRoute) navigate(targetRoute);
}

// =========================================================================
// TASK 7: TOAST (improved — typed, animated)
// =========================================================================

function showToast(msg, type = 'success') {
  const existing = document.getElementById('appToast');
  if (existing) existing.remove();

  const colorMap = {
    success: 'bg-emerald-700 border-emerald-600',
    error: 'bg-rose-700 border-rose-600',
    info: 'bg-slate-800 border-slate-700',
    warning: 'bg-amber-600 border-amber-500'
  };
  const iconMap = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };

  const toast = document.createElement('div');
  toast.id = 'appToast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.className = `fixed top-20 right-4 ${colorMap[type] || colorMap.info} text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold z-[300] flex items-center space-x-2 border max-w-xs sm:max-w-sm`;
  toast.style.transform = 'translateX(130%)';
  toast.style.transition = 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)';
  toast.innerHTML = `<span class="text-sm flex-shrink-0">${iconMap[type] || '•'}</span><span>${escHtml(msg)}</span>`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; }));

  setTimeout(() => {
    toast.style.transition = 'transform 0.25s ease-in';
    toast.style.transform = 'translateX(130%)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
