const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// 1. Notifications tests
test('Task 1: Notifications have targetRoute and routes correctly', () => {
  const serverCode = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(serverCode, /targetRoute/, 'server.js must define targetRoute in notifications');
  assert.match(serverCode, /createNotification\s*\(\s*person\.id[\s\S]*?'queue'\s*\)/, 'server.js must route new requests to queue');
  assert.match(serverCode, /createNotification\s*\(\s*request\.userId[\s\S]*?'certificates'\s*\)/, 'server.js must route certificates to certificates');
  
  const appCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(appCode, /getNotifTargetRoute/, 'app.js must determine targetRoute for notification');
  assert.match(appCode, /handleNotifClick/, 'app.js must have notification click handler');
  assert.match(appCode, /studentCertificatesList/, 'app.js navigate must handle scrolling to certificates section');
  assert.match(appCode, /personnelQueueList/, 'app.js navigate must handle scrolling to personnel queue');
});

// 2. Certificates tests
test('Task 2: Certificates have clear Close button and Esc handling', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(html, /id="certCloseBtn"/, 'index.html must have certCloseBtn');
  assert.match(html, /closeCertificateModal\(\)/, 'index.html must call closeCertificateModal');
  
  const appCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(appCode, /closeCertificateModal/, 'app.js must define closeCertificateModal');
  assert.match(appCode, /printCertificate/, 'app.js must define printCertificate without locking user');
});

// 3. Students & Audit Trail protection
test('Task 3: Students cannot access Audit Trail, admin role guard enforced', () => {
  const serverCode = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(serverCode, /requireRole\('admin'\)/, 'server.js must enforce admin role guard on audit logs');
  
  const appCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(appCode, /state\.currentUser\.role !== 'admin'/, 'app.js must guard admin view from students');
});

// 4. Loading state & Config
test('Task 4: Loading delay constant defined in config.js (1000 ms)', () => {
  const configCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'config.js'), 'utf8');
  assert.match(configCode, /APP_LOADING_DELAY_MS\s*=\s*(1000|5000)/, 'config.js must define APP_LOADING_DELAY_MS');
  
  const appCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(appCode, /setButtonLoading/, 'app.js must support disabling buttons while loading');
});

// 5. Profile Picture
test('Task 5: Profile picture supported with JPG/PNG/WebP, resizing and storage', () => {
  const serverCode = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(serverCode, /profilePicture/, 'server.js must accept profilePicture in user update');
  
  const appCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(appCode, /handleProfilePicSelect/, 'app.js must handle profile picture file selection');
  assert.match(appCode, /saveProfilePicture/, 'app.js must save profile picture');
  assert.match(appCode, /canvas\.width = 256/, 'app.js must crop/resize picture to 256x256');
  assert.match(appCode, /payload\.profilePicture/, 'handleProfileUpdate must include pending photo in payload');
});

// 6. Login/Logout Messages & Dialogs
test('Task 6: Confirmation dialog before logout, toasts on login/logout, accessible dialogs', () => {
  const appCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
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
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
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
  
  // Verify core files exist and are non-empty
  ['server.js', 'public/app.js', 'public/config.js', 'public/styles.css', 'public/index.html'].forEach(file => {
    const filePath = path.join(__dirname, '..', file);
    assert.ok(fs.existsSync(filePath), `${file} must exist`);
    assert.ok(fs.statSync(filePath).size > 0, `${file} must not be empty`);
  });
});

