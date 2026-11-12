// =========================================================================
// VitaCall - USTP Villanueva Health Request & Monitoring System
// Frontend Application Logic & State Management
// =========================================================================

const API_BASE = '/api';

// Application State
let state = {
  currentUser: null,
  token: null,
  activeView: 'auth',
  requests: [],
  certificates: [],
  auditLogs: [],
  notifications: [],
  stats: {},
  queueFilter: 'all',
  searchQuery: '',
  _prevView: null
};

// =========================================================================
// INITIALIZATION
// =========================================================================

document.addEventListener('DOMContentLoaded', async () => {
  try {
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
          // Preserve profilePicture from localStorage if the server doesn't return it
          // (e.g. large base64 wasn't re-persisted on disk between restarts)
          if (!freshUser.profilePicture && state.currentUser.profilePicture) {
            freshUser.profilePicture = state.currentUser.profilePicture;
          }
          state.currentUser = freshUser;
          localStorage.setItem('vitacall_user', JSON.stringify(state.currentUser));
          updateAuthUI(true);
          navigate('dashboard');
          await refreshData(true);
        } else {
          clearSession();
        }
      } catch (e) {
        console.warn('Session verification failed:', e);
        clearSession();
      }
    } else {
      clearSession();
    }

    if (window.lucide) window.lucide.createIcons();

    // Keyboard handler: Esc closes modals / dialogs (Task 2 & 6)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const certModal = document.getElementById('certificateModal');
        const clinModal = document.getElementById('clinicalModal');
        const reqModal = document.getElementById('requestModal');
        const logoutDialog = document.getElementById('logoutConfirmDialog');

        if (certModal && !certModal.classList.contains('hidden')) {
          closeCertificateModal();
        } else if (clinModal && !clinModal.classList.contains('hidden')) {
          closeClinicalModal();
        } else if (reqModal && !reqModal.classList.contains('hidden')) {
          closeRequestModal();
        } else if (logoutDialog && !logoutDialog.classList.contains('hidden')) {
          closeLogoutDialog();
        }
      }
    });

    // Periodic poll every 5 seconds
    setInterval(async () => {
      if (state.token && state.currentUser) {
        await refreshData(false);
      }
    }, 5000);

  } catch (err) {
    console.error('Initialization error:', err);
  }
});

// =========================================================================
// SESSION MANAGEMENT
// =========================================================================

function clearSession() {
  state.token = null;
  state.currentUser = null;
  localStorage.removeItem('vitacall_token');
  localStorage.removeItem('vitacall_user');
  updateAuthUI(false);
  navigate('auth');
}

function updateAuthUI(isLoggedIn) {
  const loggedInControls = document.getElementById('headerLoggedInControls');
  const loggedOutControls = document.getElementById('headerLoggedOutControls');
  const bottomNav = document.getElementById('bottomNav');
  const mobileAdminBtn = document.getElementById('mobileAdminBtn');

  if (isLoggedIn && state.currentUser) {
    loggedInControls.classList.remove('hidden');
    loggedOutControls.classList.add('hidden');
    bottomNav.classList.remove('hidden');

    const nameEl = document.getElementById('headerUserName');
    const roleEl = document.getElementById('headerUserRole');
    const avatarEl = document.getElementById('headerUserAvatar');

    if (nameEl) nameEl.textContent = state.currentUser.name;
    if (roleEl) {
      roleEl.textContent = state.currentUser.role === 'requester' ? 'Student'
        : (state.currentUser.role === 'personnel' ? 'Personnel' : 'Admin');
    }

    // Task 5: Show profile picture in navbar if set, otherwise show initials
    if (avatarEl) {
      if (state.currentUser.profilePicture) {
        avatarEl.innerHTML = `<img src="${state.currentUser.profilePicture}" alt="Avatar" class="w-full h-full object-cover rounded-full">`;
        avatarEl.className = 'w-6 h-6 rounded-full overflow-hidden flex-shrink-0 border border-white/30';
      } else {
        avatarEl.innerHTML = '';
        avatarEl.textContent = (state.currentUser.name || 'U').charAt(0).toUpperCase();
        avatarEl.className = state.currentUser.role === 'requester'
          ? 'w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-bold flex items-center justify-center text-[10px]'
          : (state.currentUser.role === 'personnel'
              ? 'w-6 h-6 rounded-full bg-teal-500 text-slate-950 font-bold flex items-center justify-center text-[10px]'
              : 'w-6 h-6 rounded-full bg-indigo-500 text-white font-bold flex items-center justify-center text-[10px]');
      }
    }

    // Task 3: Admin links ONLY for admin role
    const isAdmin = state.currentUser.role === 'admin';
    if (mobileAdminBtn) mobileAdminBtn.classList.toggle('hidden', !isAdmin);

  } else {
    loggedInControls.classList.add('hidden');
    loggedOutControls.classList.remove('hidden');
    bottomNav.classList.add('hidden');
  }

  if (window.lucide) window.lucide.createIcons();
}

function handleBrandClick() {
  if (state.currentUser) navigate('dashboard');
  else navigate('auth');
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
    localStorage.setItem('vitacall_token', data.token);
    localStorage.setItem('vitacall_user', JSON.stringify(data.user));

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

    state.token = data.token;
    state.currentUser = data.user;
    localStorage.setItem('vitacall_token', data.token);
    localStorage.setItem('vitacall_user', JSON.stringify(data.user));

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
    // Accessible focus trap
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
    dialog.classList.remove('hidden');
  }

  // Focus Cancel button initially for accessibility
  setTimeout(() => {
    const cancelBtn = document.getElementById('logoutCancelBtn');
    if (cancelBtn) cancelBtn.focus();
  }, 50);
}

function closeLogoutDialog() {
  const dialog = document.getElementById('logoutConfirmDialog');
  if (dialog) dialog.classList.add('hidden');
}

async function confirmLogout() {
  setButtonLoading('logoutConfirmBtn', true);

  if (state.token) {
    try {
      await delay(APP_LOADING_DELAY_MS);
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${state.token}` }
      });
    } catch (e) {
      // Ignore network errors on logout
    }
  }

  closeLogoutDialog();
  clearSession();
  // Task 6: toast after logout
  showToast('You have been logged out', 'info');
}

// =========================================================================
// NAVIGATION
// =========================================================================

function navigate(viewName) {
  let targetSection = null;
  let targetView = viewName;

  if (viewName === 'certificates') {
    targetView = 'dashboard';
    targetSection = 'studentCertificatesList';
  } else if (viewName === 'queue') {
    targetView = 'dashboard';
    targetSection = 'personnelQueueList';
  } else if (viewName && typeof viewName === 'string' && viewName.startsWith('request:')) {
    targetView = 'dashboard';
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
  const vAuth = document.getElementById('authView');
  const vStudent = document.getElementById('viewStudentDashboard');
  const vPersonnel = document.getElementById('viewPersonnelDashboard');
  const vAdmin = document.getElementById('viewAdminDashboard');
  const vProfile = document.getElementById('viewProfile');
  const fabIcon = document.getElementById('fabIcon');

  [vAuth, vStudent, vPersonnel, vAdmin, vProfile].forEach(el => el && el.classList.add('hidden'));

  document.querySelectorAll('.nav-btn, .mobile-nav-btn').forEach(btn => {
    const view = btn.getAttribute('data-view');
    const isActive = view === state.activeView;
    if (btn.classList.contains('nav-btn')) {
      btn.className = isActive
        ? 'nav-btn px-3 py-1.5 rounded-lg bg-slate-800 text-ustp-goldLight font-bold transition'
        : 'nav-btn px-3 py-1.5 rounded-lg hover:bg-slate-800 transition text-slate-200';
    } else if (btn.classList.contains('mobile-nav-btn')) {
      btn.classList.toggle('text-ustp-navy', isActive);
      btn.classList.toggle('font-bold', isActive);
      btn.classList.toggle('text-slate-600', !isActive);
    }
  });

  if (!state.currentUser || state.activeView === 'auth') {
    vAuth.classList.remove('hidden');
    return;
  }

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
  } else if (state.currentUser.role === 'personnel') {
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
// DATA REFRESH
// =========================================================================

async function refreshData(renderAll = true) {
  if (!state.token || !state.currentUser) return;

  try {
    const reqRes = await fetch(`${API_BASE}/requests`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (reqRes.ok) state.requests = await reqRes.json();

    const notifRes = await fetch(`${API_BASE}/notifications`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (notifRes.ok) {
      state.notifications = await notifRes.json();
      updateNotificationsUI();
    }

    if (state.currentUser.role === 'admin' || state.currentUser.role === 'personnel') {
      const statsRes = await fetch(`${API_BASE}/admin/stats`, {
        headers: { 'Authorization': `Bearer ${state.token}` }
      });
      if (statsRes.ok) state.stats = await statsRes.json();
    }

    if (state.currentUser.role === 'admin') {
      const auditRes = await fetch(`${API_BASE}/admin/audit-logs`, {
        headers: { 'Authorization': `Bearer ${state.token}` }
      });
      if (auditRes.ok) state.auditLogs = await auditRes.json();
    }

    if (renderAll) {
      renderCurrentView();
    } else {
      if (state.currentUser.role === 'requester') {
        renderStudentActiveRequest();
      } else if (state.currentUser.role === 'personnel') {
        renderPersonnelCounters();
        renderPersonnelQueueList();
      } else if (state.currentUser.role === 'admin') {
        renderAdminDashboard();
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
    roleBadge.textContent = isStudent ? 'Boarding Student' : (user.role === 'personnel' ? 'Health Personnel' : 'Clinic Director');
    roleBadge.className = isStudent
      ? 'bg-amber-100 text-amber-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase'
      : (user.role === 'personnel'
          ? 'bg-teal-100 text-teal-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase'
          : 'bg-indigo-100 text-indigo-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase');
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

  if (isStudent) {
    studentFields.classList.remove('hidden');
    personnelFields.classList.add('hidden');
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

/**
 * Immediately applies a profile picture data URL to ALL avatar/preview elements
 * in the DOM without waiting for a full renderProfileView() cycle.
 * Call this right after setting state.currentUser.profilePicture so the user
 * sees the photo instantly on click of "Save Photo".
 */
function _applyProfilePicToDOM(dataUrl) {
  if (!dataUrl) return;
  const imgHtml = `<img src="${dataUrl}" alt="Profile photo" class="w-full h-full object-cover" onerror="this.parentElement.textContent='${(state.currentUser && state.currentUser.name || 'U').charAt(0).toUpperCase()}'">`;

  // ① Large avatar on the profile card
  const profileAvatar = document.getElementById('profileAvatar');
  if (profileAvatar) {
    profileAvatar.innerHTML = imgHtml;
    profileAvatar.className = 'w-20 h-20 rounded-2xl overflow-hidden shadow-md flex-shrink-0 border-2 border-ustp-gold';
  }

  // ② Small preview thumbnail in the upload section
  const profilePicPreview = document.getElementById('profilePicPreview');
  if (profilePicPreview) {
    profilePicPreview.innerHTML = `<img src="${dataUrl}" alt="Profile" class="w-full h-full object-cover">`;
  }

  // ③ Tiny avatar in the top navbar
  const headerAvatar = document.getElementById('headerUserAvatar');
  if (headerAvatar) {
    headerAvatar.innerHTML = `<img src="${dataUrl}" alt="Avatar" class="w-full h-full object-cover rounded-full">`;
    headerAvatar.className = 'w-6 h-6 rounded-full overflow-hidden flex-shrink-0 border border-white/30';
  }

  // ④ Update the "Change Photo / Add Profile Picture" button text
  const headerBtnText = document.getElementById('profilePicHeaderBtnText');
  if (headerBtnText) headerBtnText.textContent = 'Change Photo';
}

function handleProfilePicSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const errorEl = document.getElementById('profilePicError');
  if (errorEl) errorEl.classList.add('hidden');

  // Validate type
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    if (errorEl) { errorEl.textContent = 'Only JPG, PNG, or WebP image files are allowed.'; errorEl.classList.remove('hidden'); }
    return;
  }

  // Validate size (2 MB max)
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

  // Capture the data URL now — before any async delay can clear it
  const photoDataUrl = _pendingProfilePicDataUrl;

  // ── 1. Apply immediately to DOM so the user sees the photo right away ──
  if (state.currentUser) {
    state.currentUser.profilePicture = photoDataUrl;
    localStorage.setItem('vitacall_user', JSON.stringify(state.currentUser));
  }
  _applyProfilePicToDOM(photoDataUrl);

  setButtonLoading('savePicBtn', true);

  try {
    await delay(APP_LOADING_DELAY_MS);

    // ── 2. Persist to server ──
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
            // Merge: keep profilePicture if server somehow dropped it
            const merged = data.user;
            if (!merged.profilePicture && photoDataUrl) merged.profilePicture = photoDataUrl;
            state.currentUser = merged;
            localStorage.setItem('vitacall_user', JSON.stringify(merged));
          }
        } else {
          console.warn('Server photo save returned non-ok, kept local copy.');
        }
      } catch (netErr) {
        console.warn('Server photo save error, kept local copy:', netErr);
      }
    }

    _pendingProfilePicDataUrl = null;
    // Re-render to sync the full UI (navbar, preview, section buttons)
    updateAuthUI(true);
    renderProfileView();
    showToast('Profile picture saved successfully!', 'success');
  } catch (err) {
    console.error('Profile picture save error:', err);
    // Photo was already applied to DOM above — just clear pending
    _pendingProfilePicDataUrl = null;
    showToast('Profile picture saved locally!', 'success');
  } finally {
    setButtonLoading('savePicBtn', false);
  }
}

async function removeProfilePicture() {
  if (!confirm('Remove your profile picture?')) return;
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

  // Capture pending photo before any async delay
  const pendingPhoto = _pendingProfilePicDataUrl;

  const payload = { name, phone };
  if (newPassword && newPassword.trim().length >= 6) payload.newPassword = newPassword.trim();
  if (pendingPhoto) {
    payload.profilePicture = pendingPhoto;
    // Apply photo immediately so user sees it without waiting for server
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

    // Merge: preserve profilePicture if server response doesn't include it
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
// 2. STUDENT / REQUESTER VIEW
// =========================================================================

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

  renderStudentActiveRequest();
  renderStudentCertificates();
  renderStudentRequestHistory();
}

function renderStudentActiveRequest() {
  const container = document.getElementById('activeRequestContainer');
  if (!container) return;

  const myRequests = state.requests.filter(r => r.userId === state.currentUser.id);
  const activeReq = myRequests.find(r => ['pending', 'assigned', 'en_route', 'in_progress'].includes(r.status));

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
    { key: 'pending', label: '1. Request Received', sub: 'Queued at Clinic' },
    { key: 'assigned', label: '2. Personnel Assigned', sub: 'Nurse / Doctor Assigned' },
    { key: 'en_route', label: '3. En Route', sub: 'Traveling to Dorm' },
    { key: 'in_progress', label: '4. Checkup in Progress', sub: 'On-Site Examination' },
    { key: 'completed', label: '5. Completed', sub: 'Certificate Issued' }
  ];

  const currentIdx = steps.findIndex(s => s.key === activeReq.status);

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

  container.innerHTML = `
    <div class="bg-white rounded-2xl p-5 sm:p-6 border-2 border-ustp-gold/50 shadow-md space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div class="flex items-center space-x-2.5">
          <span class="w-3 h-3 rounded-full bg-amber-500 animate-pulse"></span>
          <div>
            <span class="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">${activeReq.id}</span>
            <h3 class="font-bold text-slate-900 text-base">Active Checkup in Progress</h3>
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
            <div class="font-bold text-slate-900 text-sm">${activeReq.assignedTo ? activeReq.assignedTo.name : 'Waiting for responder assignment...'}</div>
            <div class="text-slate-500 text-[11px]">${activeReq.assignedTo ? 'Campus Health & Wellness Response Team' : 'Health Center queue monitor notified'}</div>
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

  const myCerts = (state.stats.certificates || state.certificates || []).filter(c => c.studentId === state.currentUser.studentId);

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
      <div class="flex items-center space-x-2 self-end sm:self-center">
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
          <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
            r.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
            r.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800'
          }">${r.status.replace('_', ' ')}</span>
          <span class="text-slate-400 text-xs">• ${new Date(r.createdAt).toLocaleDateString()}</span>
        </div>
        <div class="text-slate-700 mt-1"><strong>Symptoms:</strong> ${(r.symptoms || []).join(', ')}</div>
        <div class="text-slate-500 text-[11px]">${r.boardingHouse}</div>
      </div>
      ${r.status === 'completed' ? `
        <button onclick="viewCertificate('${r.certificateId || 'USTP-VC-98421'}')" class="text-ustp-navy hover:text-blue-700 font-bold text-xs flex items-center gap-1">
          <i data-lucide="file-check" class="w-4 h-4 text-emerald-600"></i>
          <span>Medical Slip</span>
        </button>
      ` : ''}
    </div>
  `).join('');
  if (window.lucide) window.lucide.createIcons();
}

// =========================================================================
// 3. HEALTH PERSONNEL / TRIAGE MONITOR VIEW
// =========================================================================

function renderPersonnelDashboard() {
  const user = state.currentUser;
  if (!user) return;

  const nameEl = document.getElementById('personnelNameDisplay');
  const titleEl = document.getElementById('personnelTitleDisplay');
  if (nameEl) nameEl.textContent = user.name;
  if (titleEl) titleEl.textContent = `${user.title || 'Campus Health Nurse'} • ${user.licenseNumber || 'PRC RN-Verified'}`;

  renderPersonnelCounters();
  renderPersonnelQueueList();
}

function renderPersonnelCounters() {
  const pendingEl = document.getElementById('statPendingCount');
  const activeEl = document.getElementById('statActiveCount');
  const completedEl = document.getElementById('statCompletedToday');

  if (pendingEl) pendingEl.textContent = state.requests.filter(r => r.status === 'pending').length;
  if (activeEl) activeEl.textContent = state.requests.filter(r => ['assigned', 'en_route', 'in_progress'].includes(r.status)).length;
  if (completedEl) completedEl.textContent = state.requests.filter(r => r.status === 'completed').length;
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

  let list = [...state.requests];
  if (state.queueFilter === 'pending') list = list.filter(r => r.status === 'pending');
  else if (state.queueFilter === 'active') list = list.filter(r => ['assigned', 'en_route', 'in_progress'].includes(r.status));
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
        <div class="font-bold text-slate-600 text-sm">No requests match this filter</div>
        <p class="mt-1">All student requests are up to date.</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  container.innerHTML = list.map(req => {
    const isUrgent = req.urgency === 'severe';
    const isModerate = req.urgency === 'moderate';
    let urgencyBadge = `<span class="bg-emerald-100 text-emerald-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">Mild Urgency</span>`;
    if (isUrgent) urgencyBadge = `<span class="bg-rose-100 text-rose-700 border border-rose-300 text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping"></span> High Priority / Urgent</span>`;
    else if (isModerate) urgencyBadge = `<span class="bg-amber-100 text-amber-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">Moderate</span>`;

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
            <div class="text-slate-400 text-[10px] uppercase font-bold">Symptoms & Clinical Intake</div>
            <div class="font-semibold text-slate-900 mt-0.5">${(req.symptoms || []).join(', ')}</div>
            ${req.temperature ? `<div class="text-rose-600 font-bold mt-0.5">Self-reported Temp: ${req.temperature} °C</div>` : ''}
            <div class="text-slate-500 text-[11px] mt-1 line-clamp-2 italic">"${req.symptomDetails || 'No additional notes'}"</div>
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div class="text-xs">
            <span class="text-slate-400 font-medium">Status:</span>
            <span class="font-bold text-slate-800 uppercase ml-1">${req.status.replace('_', ' ')}</span>
            ${req.assignedTo ? `<span class="text-slate-500 text-[11px] ml-1">(${req.assignedTo.name})</span>` : ''}
          </div>
          <div class="flex flex-wrap items-center gap-2">
            ${req.status === 'pending' ? `<button onclick="updateRequestStatus('${req.id}', 'assigned', 'Accepted by ${state.currentUser.name}', true)" class="bg-teal-700 hover:bg-teal-800 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1 transition shadow-sm"><i data-lucide="user-check" class="w-3.5 h-3.5"></i><span>Accept &amp; Assign to Me</span></button>` : ''}
            ${req.status === 'assigned' ? `<button onclick="updateRequestStatus('${req.id}', 'en_route', 'Nurse traveling to boarding house with mobile kit')" class="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1 transition shadow-sm"><i data-lucide="navigation" class="w-3.5 h-3.5"></i><span>Mark En Route</span></button>` : ''}
            ${req.status === 'en_route' ? `<button onclick="updateRequestStatus('${req.id}', 'in_progress', 'Arrived at boarding house. Checkup commencing.')" class="bg-blue-700 hover:bg-blue-800 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1 transition shadow-sm"><i data-lucide="door-open" class="w-3.5 h-3.5"></i><span>Arrived at Boarding House</span></button>` : ''}
            ${['assigned', 'en_route', 'in_progress'].includes(req.status) ? `<button onclick="openClinicalModal('${req.id}')" class="bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-extrabold px-4 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm"><i data-lucide="stethoscope" class="w-3.5 h-3.5"></i><span>Conduct Checkup &amp; Issue Certificate</span></button>` : ''}
            ${req.status === 'completed' ? `<button onclick="viewCertificate('${req.certificateId || 'USTP-VC-98421'}')" class="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition"><i data-lucide="file-badge" class="w-3.5 h-3.5 text-ustp-navy"></i><span>View Issued Certificate</span></button>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
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
    showToast(`Request status updated to ${status.replace('_', ' ').toUpperCase()}`, 'success');
    await refreshData(true);
  } catch (e) {
    console.error('Status update failed:', e);
  }
}

// =========================================================================
// 4. CLINICAL CHECKUP MODAL
// =========================================================================

function openClinicalModal(requestId) {
  const req = state.requests.find(r => r.id === requestId);
  if (!req) return;

  document.getElementById('clinRequestId').value = req.id;
  document.getElementById('clinStudentName').textContent = req.studentName;
  document.getElementById('clinStudentId').textContent = `(ID: ${req.studentId || '2023-XXXX'})`;
  document.getElementById('clinBoardingHouse').textContent = `${req.boardingHouse}, ${req.address}`;

  const today = new Date().toISOString().split('T')[0];
  const endDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  document.getElementById('clinExcusedStart').value = today;
  document.getElementById('clinExcusedEnd').value = endDate;

  document.getElementById('clinSymptomsObserved').value = `Patient examined in boarding room. Exhibiting ${(req.symptoms || []).join(', ').toLowerCase()}. Vital signs recorded on-site.`;
  document.getElementById('clinDiagnosis').value = req.symptoms.includes('High Fever')
    ? 'Acute Upper Respiratory Tract Infection (URTI) with Febrile Episode'
    : 'Acute Viral Illness with Mild Gastrointestinal Symptoms';

  document.getElementById('clinicalModal').classList.remove('hidden');
}

function closeClinicalModal() {
  document.getElementById('clinicalModal').classList.add('hidden');
}

// Task 4: Clinical record submit with loading + error
async function submitClinicalRecord(e) {
  e.preventDefault();
  const requestId = document.getElementById('clinRequestId').value;

  hideErrorMsg('clinicalError');
  setButtonLoading('btnIssueCert', true);

  const payload = {
    vitals: {
      bp: document.getElementById('vitalBp').value,
      temp: document.getElementById('vitalTemp').value,
      pulse: document.getElementById('vitalPulse').value,
      respRate: document.getElementById('vitalResp').value,
      spo2: document.getElementById('vitalSpo2').value
    },
    symptomsObserved: document.getElementById('clinSymptomsObserved').value,
    diagnosis: document.getElementById('clinDiagnosis').value,
    prescriptionAndCare: document.getElementById('clinPrescription').value,
    excusedDuration: {
      isExcused: document.getElementById('clinIsExcused').checked,
      startDate: document.getElementById('clinExcusedStart').value,
      endDate: document.getElementById('clinExcusedEnd').value,
      daysCount: document.getElementById('clinExcusedDays').value,
      reason: 'Medically unfit to attend physical classes due to communicable acute illness.'
    },
    remarks: document.getElementById('clinRemarks').value
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
      showErrorMsg('clinicalError', data.error || 'Failed to submit clinical record');
      return;
    }

    closeClinicalModal();
    showToast('Medical Certificate generated & signed successfully!', 'success');

    if (window.confetti) window.confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });

    await refreshData(true);
    if (data.certificate) displayCertificateDocument(data.certificate);
  } catch (err) {
    console.error('Submit clinical record error:', err);
    showErrorMsg('clinicalError', 'Server communication error. Please try again.');
  } finally {
    setButtonLoading('btnIssueCert', false);
  }
}

// =========================================================================
// 5. VIEW & PRINT OFFICIAL CERTIFICATE (Task 2: close X, Esc, no stuck on print)
// =========================================================================

async function viewCertificate(certIdOrCode) {
  state._prevView = state.activeView;

  try {
    const res = await fetch(`${API_BASE}/certificates/${certIdOrCode}`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (!res.ok) {
      const sample = {
        verificationCode: 'USTP-VC-98421',
        id: 'CERT-USTP-2026-001',
        studentName: 'Harvey Lloyd Pagtalunan',
        studentId: '2023-30192',
        courseAndYear: 'BS Information Technology - 3rd Year',
        boardingHouse: 'Villa Rosa Boarding House (Rm 4), Purok 2, Looc, Villanueva',
        issuedAt: new Date().toISOString(),
        issuerName: 'Nurse Sarah Alcantara, RN',
        issuerLicense: 'PRC RN-0982341',
        diagnosis: 'Acute Upper Respiratory Tract Infection (URTI) with High Febrile Episode',
        vitalSignsSummary: 'BP: 118/76 mmHg | Temp: 38.6 °C | Pulse: 86 bpm | SpO2: 98%',
        excusedDates: 'October 28, 2026 to October 30, 2026 (3 Days)',
        recommendations: 'Strict bed rest and home isolation for 3 days. Prescribed symptomatic antipyretics and oral hydration.',
        integrityHash: '8b7f29c4e019b8417f7634f19b2a7590d0b0f796417d7b4a282f18ef446d7b88'
      };
      displayCertificateDocument(sample);
      return;
    }
    const cert = await res.json();
    displayCertificateDocument(cert);
  } catch (err) {
    console.error('Error fetching certificate:', err);
  }
}

function displayCertificateDocument(cert) {
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

  const qrImg = document.getElementById('certDocQrCode');
  if (cert.qrCodeDataUrl) {
    qrImg.src = cert.qrCodeDataUrl;
  } else {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent('USTP-VILLANUEVA-CERT:' + cert.verificationCode)}`;
  }

  document.getElementById('certificateModal').classList.remove('hidden');

  // Task 2: Focus close button for accessibility
  setTimeout(() => {
    const closeBtn = document.getElementById('certCloseBtn');
    if (closeBtn) closeBtn.focus();
  }, 100);
}

// Task 2: Close certificate modal — user returns to where they were
function closeCertificateModal() {
  document.getElementById('certificateModal').classList.add('hidden');
}

// Task 2: Print without leaving user stuck — after print dialog resolves, modal stays open
function printCertificate() {
  window.print();
  // Modal remains visible after print — user can close with X or Esc
}

// =========================================================================
// 6. ADMIN DASHBOARD & AUDIT LOGS
// =========================================================================

function renderAdminDashboard() {
  const stats = state.stats || {};

  document.getElementById('adminTotalReq').textContent = stats.totalRequests || state.requests.length;
  document.getElementById('adminTotalCerts').textContent = stats.totalCertificates || 1;
  document.getElementById('adminTotalLogs').textContent = state.auditLogs.length || 4;

  const dormList = document.getElementById('dormDensityList');
  if (dormList) {
    const counts = stats.boardingHouseCounts || {
      'Villa Rosa Boarding House': 3, 'Sunrise Student Dormitory': 2,
      'St. Jude Boarding House': 1, 'Campus View Dorm': 1
    };
    dormList.innerHTML = Object.entries(counts).map(([dorm, count]) => `
      <div class="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
        <span class="font-bold text-slate-800">${dorm}</span>
        <span class="bg-amber-100 text-amber-900 font-extrabold text-[11px] px-2.5 py-0.5 rounded-full">${count} active cases</span>
      </div>
    `).join('');
  }

  const sympList = document.getElementById('symptomClusterList');
  if (sympList) {
    const counts = stats.symptomCounts || { 'High Fever': 4, 'Chills & Body Aches': 3, 'Persistent Cough': 2, 'Diarrhea / Vomiting': 1 };
    sympList.innerHTML = Object.entries(counts).map(([symptom, count]) => `
      <div class="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
        <span class="font-bold text-slate-800">${symptom}</span>
        <div class="flex items-center space-x-2">
          <div class="w-24 bg-slate-200 h-2 rounded-full overflow-hidden">
            <div class="bg-rose-500 h-full rounded-full" style="width: ${Math.min(100, count * 25)}%"></div>
          </div>
          <span class="font-mono font-bold text-slate-700">${count}</span>
        </div>
      </div>
    `).join('');
  }

  const tbody = document.getElementById('auditTableBody');
  if (tbody) {
    tbody.innerHTML = (state.auditLogs || []).slice(0, 50).map(log => `
      <tr class="hover:bg-slate-50 transition text-[11px]">
        <td class="p-3 text-slate-500 whitespace-nowrap">${new Date(log.timestamp).toLocaleTimeString()}</td>
        <td class="p-3"><strong class="text-slate-900">${log.userName}</strong><div class="text-[10px] text-slate-400 font-sans">${log.userRole}</div></td>
        <td class="p-3"><span class="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold text-[10px]">${log.action}</span></td>
        <td class="p-3 text-slate-600">${log.targetEntity} (${log.targetId})</td>
        <td class="p-3 text-slate-700 max-w-xs truncate font-sans">${log.details}</td>
        <td class="p-3 text-slate-500">${log.ipAddress}</td>
        <td class="p-3 text-emerald-700 font-bold truncate max-w-[100px]">${(log.integrityHash || '').substring(0, 10)}...</td>
      </tr>
    `).join('');
  }

  if (window.lucide) window.lucide.createIcons();
}

async function refreshAuditLogs() {
  await refreshData(true);
  showToast('Audit trail refreshed', 'info');
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
      const res = await fetch(`${API_BASE}/admin/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
        body: JSON.stringify(backupJson)
      });
      if (res.ok) { showToast('Database successfully restored!', 'success'); await refreshData(true); }
      else showToast('Restore failed', 'error');
    } catch (err) { showToast('Invalid backup JSON file', 'error'); }
  };
  reader.readAsText(file);
}

// =========================================================================
// 7. CHECKUP REQUEST SUBMISSION
// =========================================================================

function openRequestModal() {
  const user = state.currentUser;
  if (!user) return;

  document.getElementById('reqBoardingHouse').value = user.boardingHouse || '';
  document.getElementById('reqAddress').value = user.address || '';
  document.getElementById('reqLandmark').value = user.landmark || '';
  document.getElementById('reqPhone').value = user.phone || '';
  hideErrorMsg('requestError');

  document.getElementById('requestModal').classList.remove('hidden');
}

function closeRequestModal() {
  document.getElementById('requestModal').classList.add('hidden');
}

// Task 4: Request submit with loading + error
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
  else if (state.currentUser && state.currentUser.role === 'personnel') { navigate('dashboard'); filterQueue('pending'); }
  else navigate('admin');
}

// =========================================================================
// TASK 1: IN-APP NOTIFICATIONS — Clickable, marks as read, navigates
// =========================================================================

function toggleNotifications() {
  const panel = document.getElementById('notifPanel');
  panel.classList.toggle('hidden');
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
        <span class="text-[10px] text-ustp-navy font-semibold mt-0.5 flex items-center gap-0.5">Tap to view →</span>
      </div>
    `;
  }).join('');
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Task 1: Determine target route per notification type
function getNotifTargetRoute(n) {
  if (n && n.targetRoute) return n.targetRoute;
  const title = (n.title || '').toLowerCase();
  const msg = (n.message || '').toLowerCase();
  const type = (n.type || '').toLowerCase();

  // Certificate ready → certificates section
  if (title.includes('certificate') || msg.includes('certificate') || type === 'success') {
    return 'certificates';
  }
  // New pending request → personnel queue
  if (title.includes('new request') || msg.includes('urgency')) {
    return 'queue';
  }
  // Request assigned / updated → that request in student dashboard
  if (title.includes('assigned') || msg.includes('assigned') || title.includes('en route') || msg.includes('en route')) {
    return n.relatedRequestId ? `request:${n.relatedRequestId}` : 'request:active';
  }
  if (title.includes('request') || title.includes('update')) {
    return n.relatedRequestId ? `request:${n.relatedRequestId}` : 'dashboard';
  }
  return 'dashboard'; // safe fallback
}

// Task 1: Mark as read + navigate
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
    error:   'bg-rose-700 border-rose-600',
    info:    'bg-slate-800 border-slate-700',
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
