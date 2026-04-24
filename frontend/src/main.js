import './style.css';
import { api } from './api.js';
import {
  showToast,
  formatDate,
  getStatusClass,
  getStatusLabel,
  getUserInitials,
} from './utils.js';

// ===== APP STATE =====
let currentPage = 'dashboard';

// ===== ACADEMIC YEAR HELPERS =====
function getCurrentAcademicYear() {
  const now = new Date();
  const y = now.getFullYear();
  // Academic year runs Sep-Aug. If before September, current FY started previous year.
  return now.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
function getAcademicYearOptions() {
  const now = new Date();
  const base = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return [
    `${base - 1}-${base}`,
    `${base}-${base + 1}`,
    `${base + 1}-${base + 2}`,
  ];
}
function academicYearLabel(ay) {
  const [s, e] = ay.split('-');
  return `FY ${s}–${e}`;
}
function academicYearDateRange(ay) {
  const [s, e] = ay.split('-').map(Number);
  return { start: `${s}-09-01`, end: `${e}-08-31` };
}
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ===== DATE RANGE FILTER HELPERS =====
function getDateRangeLabel() {
  const ay = pageState.academicYear || getCurrentAcademicYear();
  const from = pageState.fromMonth;
  const to = pageState.toMonth;
  if (!from && !to) return null;
  const [startYear, endYear] = ay.split('-');
  // Month-to-year mapping: Sep(9)-Dec(12) belongs to startYear, Jan(1)-Aug(8) to endYear
  const monthYear = (m) => (m >= 9 ? startYear : endYear);
  const fromLabel = from ? `${MONTH_NAMES_FULL[from - 1]} ${monthYear(from)}` : null;
  const toLabel = to ? `${MONTH_NAMES_FULL[to - 1]} ${monthYear(to)}` : null;
  if (fromLabel && toLabel) return `Showing data from ${fromLabel} to ${toLabel}`;
  if (fromLabel) return `Showing data from ${fromLabel}`;
  if (toLabel) return `Showing data up to ${toLabel}`;
  return null;
}

function injectDateRangeFilter(headerActions) {
  // Don't inject on detail/settings pages
  const noFilterPages = ['settings', 'event-detail', 'hod-event-detail', 'admin-event-detail', 'dept-drilldown'];
  if (noFilterPages.includes(currentPage)) return;

  const ay = pageState.academicYear || getCurrentAcademicYear();
  const fromM = pageState.fromMonth || '';
  const toM = pageState.toMonth || '';

  const yearOpts = getAcademicYearOptions().map(y =>
    `<option value="${y}" ${ay === y ? 'selected' : ''}>${y.replace('-', '–')}</option>`
  ).join('');

  const fromOpts = `<option value="">From</option>` + MONTH_NAMES_FULL.map((m, i) =>
    `<option value="${i + 1}" ${fromM == i + 1 ? 'selected' : ''}>${m.slice(0,3)}</option>`
  ).join('');

  const toOpts = `<option value="">To</option>` + MONTH_NAMES_FULL.map((m, i) =>
    `<option value="${i + 1}" ${toM == i + 1 ? 'selected' : ''}>${m.slice(0,3)}</option>`
  ).join('');

  const filterDiv = document.createElement('div');
  filterDiv.id = 'date-range-filter';
  filterDiv.style.cssText = 'display:flex;align-items:center;gap:5px;flex-shrink:0;';
  filterDiv.innerHTML = `
    <style>
      #date-range-filter select {
        padding:5px 8px;font-size:0.78rem;font-weight:500;
        border:1px solid var(--border,#e2e8f0);border-radius:8px;
        background:var(--surface-0,#fff);color:var(--text-primary,#1e293b);
        box-shadow:0 1px 3px rgba(0,0,0,0.07);cursor:pointer;
        appearance:auto;outline:none;transition:border-color .2s;
      }
      #date-range-filter select:focus { border-color:var(--primary,#4f46e5); }
      #drf-apply {
        padding:5px 12px;font-size:0.78rem;font-weight:700;
        border:none;border-radius:8px;cursor:pointer;
        background:var(--primary,#4f46e5);color:#fff;
        box-shadow:0 1px 4px rgba(79,70,229,0.25);
        transition:opacity .2s;white-space:nowrap;
      }
      #drf-apply:hover { opacity:.88; }
      #drf-reset {
        padding:5px 8px;font-size:0.78rem;font-weight:600;
        border:1px solid var(--border,#e2e8f0);border-radius:8px;
        background:transparent;color:var(--text-tertiary,#94a3b8);
        cursor:pointer;transition:color .2s;
      }
      #drf-reset:hover { color:var(--error,#ef4444); }
      @media(max-width:640px){
        #date-range-filter { gap:3px; }
        #date-range-filter select { padding:4px 5px;font-size:0.72rem; }
        #drf-apply,#drf-reset { padding:4px 8px;font-size:0.72rem; }
      }
    </style>
    <span class="material-symbols-outlined" style="font-size:16px;color:var(--text-tertiary);flex-shrink:0;">date_range</span>
    <select id="drf-year" title="Academic Year">${yearOpts}</select>
    <select id="drf-from" title="From Month">${fromOpts}</select>
    <span style="color:var(--text-tertiary);font-size:0.75rem;flex-shrink:0;">→</span>
    <select id="drf-to" title="To Month">${toOpts}</select>
    <button id="drf-apply">Apply</button>
    ${(fromM || toM) ? `<button id="drf-reset" title="Clear filter">✕</button>` : ''}
  `;

  // Insert BEFORE existing header-action buttons
  headerActions.insertBefore(filterDiv, headerActions.firstChild);

  // Handlers
  document.getElementById('drf-apply')?.addEventListener('click', () => {
    pageState.academicYear = document.getElementById('drf-year')?.value || ay;
    const newFrom = document.getElementById('drf-from')?.value;
    const newTo = document.getElementById('drf-to')?.value;
    pageState.fromMonth = newFrom ? parseInt(newFrom) : '';
    pageState.toMonth = newTo ? parseInt(newTo) : '';
    loadPage();
  });

  document.getElementById('drf-reset')?.addEventListener('click', () => {
    pageState.fromMonth = '';
    pageState.toMonth = '';
    loadPage();
  });
}

function injectDateRangeBanner() {
  const label = getDateRangeLabel();
  if (!label) return;
  const existing = document.getElementById('date-range-banner');
  if (existing) return;
  const banner = document.createElement('div');
  banner.id = 'date-range-banner';
  banner.style.cssText = [
    'display:flex;align-items:center;gap:8px;',
    'padding:8px 16px;margin-bottom:20px;',
    'background:linear-gradient(90deg,var(--primary-surface,#e0e7ff),transparent);',
    'border-left:3px solid var(--primary,#4f46e5);border-radius:0 8px 8px 0;',
    'font-size:0.82rem;color:var(--text-secondary,#475569);font-weight:500;',
  ].join('');
  banner.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;color:var(--primary,#4f46e5);">info</span> ${label}`;
  const content = document.getElementById('main-content');
  if (content && content.firstChild) {
    content.insertBefore(banner, content.firstChild);
  }
}

// Schedule status helpers
function getScheduleStatusClass(status) {
  switch (status) {
    case 'COMPLETED': return 'sched-completed';
    case 'COMPLETED_LATE': return 'sched-late';
    case 'MISSED': return 'sched-missed';
    case 'UPCOMING': return 'sched-upcoming';
    default: return '';
  }
}
function getScheduleStatusLabel(status) {
  switch (status) {
    case 'COMPLETED': return 'Completed';
    case 'COMPLETED_LATE': return 'Completed Late';
    case 'MISSED': return 'Missed';
    case 'UPCOMING': return 'Upcoming';
    default: return status;
  }
}
function getScheduleStatusIcon(status) {
  switch (status) {
    case 'COMPLETED': return 'check_circle';
    case 'COMPLETED_LATE': return 'schedule';
    case 'MISSED': return 'cancel';
    case 'UPCOMING': return 'upcoming';
    default: return 'help';
  }
}

// ===== THEME MANAGEMENT =====
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if(theme === 'dark') document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
  localStorage.setItem('theme', theme);
}
function initTheme() {
  // If logged in, use user's saved preference; otherwise use localStorage or default to dark
  const user = api.auth.getUser();
  const saved = user?.theme_preference || localStorage.getItem('theme') || 'dark';
  applyTheme(saved);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  // If logged in, persist to API (fire-and-forget)
  if (api.auth.isLoggedIn()) {
    api.auth.saveTheme(next).catch(() => {});
    // Update the stored user object
    const user = api.auth.getUser();
    if (user) {
      user.theme_preference = next;
      localStorage.setItem('user', JSON.stringify(user));
    }
  }
  return next;
}
function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

// ===== BOOTSTRAP =====
function init() {
  initTheme();
  
  // Check for public form link
  const params = new URLSearchParams(window.location.search);
  const formHash = params.get('form');
  if (formHash) {
    return renderPublicForm(formHash);
  }

  if (api.auth.isLoggedIn()) {
    renderApp();
  } else {
    renderLogin();
  }
}

// ===== LOGIN PAGE =====
function renderLogin() {
  const app = document.getElementById('app');
  app.className = 'min-h-screen flex flex-col w-full';
  
  app.innerHTML = `
    <!-- TopAppBar -->
    <header class="w-full top-0 left-0 flex justify-between items-center px-6 md:px-8 py-4 bg-slate-50 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition z-20">
      <div class="text-2xl font-extrabold tracking-tighter text-indigo-900 dark:text-indigo-100 font-headline">Event Flow</div>
      <div class="flex items-center gap-4">
        <button id="login-theme-toggle" class="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-colors" title="Toggle Dark/Light Mode">
          <span class="material-symbols-outlined" style="font-size: 20px;">${getCurrentTheme() === 'dark' ? 'light_mode' : 'dark_mode'}</span>
        </button>
        <div class="flex items-center gap-4 text-slate-500 dark:text-slate-400 font-medium font-body cursor-pointer hover:text-primary transition-colors">
          <span class="material-symbols-outlined text-indigo-900 dark:text-indigo-400" style="font-size: 20px;">help_outline</span>
          <span class="hidden md:block">Support</span>
        </div>
      </div>
    </header>

    <main class="flex-grow relative flex flex-col items-center justify-center px-4 py-8 md:py-12 z-10">
      <!-- Academic Background Motif -->
      <div class="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div class="absolute top-[-10%] right-[-5%] w-[40%] h-[60%] rounded-full bg-primary-fixed/20 blur-[120px]"></div>
        <div class="absolute bottom-[-10%] left-[-5%] w-[40%] h-[60%] rounded-full bg-secondary-fixed/10 blur-[120px]"></div>
      </div>

      <div class="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center relative z-10">
        <!-- Left Side: Branding & Live Events -->
        <div class="lg:col-span-7 flex flex-col gap-6 md:gap-8 order-2 lg:order-1">
          <div class="space-y-4 text-center lg:text-left">
            <h1 class="text-4xl md:text-5xl font-headline font-extrabold tracking-tight text-primary dark:text-primary-fixed leading-tight">
              Institutional Intelligence <br class="hidden lg:block"/>
              <span class="text-secondary dark:text-secondary-fixed">Refined for Leadership.</span>
            </h1>
            <p class="text-on-surface-variant dark:text-slate-400 max-w-lg mx-auto lg:mx-0 text-lg leading-relaxed">
              Access the centralized ledger for curriculum planning, event logistics, and departmental oversight.
            </p>
          </div>

          <!-- Live Upcoming Events Scroller -->
          <div class="p-6 bg-surface-container-lowest dark:bg-slate-900/50 backdrop-blur-sm border border-slate-200 dark:border-slate-800 rounded-xl drop-shadow-sm">
            <div class="flex items-center gap-2 text-secondary dark:text-secondary-fixed mb-4">
              <span class="material-symbols-outlined" style="font-size: 20px;">event</span>
              <span class="font-headline font-bold text-sm tracking-wide uppercase">Live Upcoming Events</span>
              <span class="ml-auto inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            </div>
            <div id="events-scroller" style="height:160px;overflow:hidden;position:relative;">
              <div id="events-scroller-inner" style="display:flex;flex-direction:column;gap:0;">
                <div style="padding:16px;text-align:center;color:var(--text-tertiary);font-size:0.85rem;">Loading events...</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Side: Login Card -->
        <div class="lg:col-span-5 order-1 lg:order-2 w-full max-w-md mx-auto">
          <div class="glass-panel bg-surface-container-lowest dark:bg-slate-900/80 p-8 md:p-10 rounded-2xl shadow-[0_20px_60px_rgba(25,28,29,0.08)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.3)] border border-slate-200 dark:border-slate-800 relative overflow-hidden">
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary"></div>
            <div class="mb-8 text-center pt-2">
              <div class="mx-auto w-12 h-12 bg-primary/10 dark:bg-primary-fixed/10 text-primary dark:text-primary-fixed rounded-xl flex items-center justify-center mb-4">
                <span class="material-symbols-outlined" style="font-size: 28px;">account_balance</span>
              </div>
              <h2 class="text-2xl font-headline font-bold text-primary dark:text-primary-fixed tracking-tight">Sign In to Event Flow</h2>
              <p class="text-on-surface-variant dark:text-slate-400 text-sm mt-2">Enter your institutional credentials</p>
            </div>
            
            <form class="space-y-5" id="login-form">
              <div id="login-error" class="hidden text-sm font-bold text-error dark:text-error-container bg-error/10 dark:bg-error-container/10 p-3 rounded-lg text-center" style="display: none;"></div>

              <div class="space-y-1.5">
                <label class="block text-xs font-bold font-headline uppercase tracking-wider text-on-surface-variant dark:text-slate-400" for="login-email">Institutional ID / Email</label>
                <div class="relative group">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant dark:text-outline material-symbols-outlined" style="font-size: 18px;">mail</span>
                  <input class="w-full bg-surface-container-low dark:bg-slate-800/50 border-none rounded-lg pl-10 pr-4 py-3.5 text-on-surface dark:text-slate-100 focus:ring-0 focus:ring-offset-0 placeholder:text-outline-variant dark:placeholder:text-outline transition-all border-b-2 border-transparent focus:border-primary dark:focus:border-primary-fixed" id="login-email" placeholder="admin.eventflow@institute.edu" type="email" required />
                </div>
              </div>
              
              <div class="space-y-1.5">
                <div class="flex justify-between items-end">
                  <label class="block text-xs font-bold font-headline uppercase tracking-wider text-on-surface-variant dark:text-slate-400" for="login-password">Password</label>
                  <a class="text-xs font-bold text-secondary dark:text-secondary-fixed hover:underline cursor-pointer" id="forgot-password-link">Forgot?</a>
                </div>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant dark:text-outline material-symbols-outlined" style="font-size: 18px;">lock</span>
                  <input class="w-full bg-surface-container-low dark:bg-slate-800/50 border-none rounded-lg pl-10 pr-10 py-3.5 text-on-surface dark:text-slate-100 focus:ring-0 focus:ring-offset-0 placeholder:text-outline-variant dark:placeholder:text-outline transition-all border-b-2 border-transparent focus:border-primary dark:focus:border-primary-fixed" id="login-password" placeholder="••••••••" type="password" required />
                  <span class="material-symbols-outlined pw-toggle absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-outline-variant hover:text-primary dark:hover:text-primary-fixed" style="font-size:20px;user-select:none;">visibility_off</span>
                </div>
              </div>

              <div class="pt-4">
                <button type="submit" id="login-btn" class="w-full bg-gradient-to-r from-primary to-primary-container dark:from-primary-fixed dark:to-primary-fixed-dim text-on-primary dark:text-primary font-headline font-bold py-3.5 rounded-lg shadow-[0_8px_16px_rgba(0,6,102,0.2)] dark:shadow-none hover:shadow-lg hover:from-primary-container hover:to-primary transition-all flex justify-center items-center gap-2">
                  <span>Secure Login</span>
                  <span class="material-symbols-outlined" style="font-size: 18px;">arrow_forward</span>
                </button>
              </div>
              

            </form>
          </div>
        </div>
      </div>
    </main>

    <!-- Forgot Password Modal -->
    <div id="forgot-modal" style="display:none;position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);align-items:center;justify-content:center;">
      <div style="background:var(--surface-1,#fff);border-radius:16px;padding:32px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <h3 style="font-size:1.2rem;font-weight:700;margin-bottom:4px;color:var(--text-primary);">Reset Password</h3>
        <div id="forgot-step-indicator" style="display:flex;gap:6px;margin-bottom:20px;">
          <span id="step-dot-1" style="width:8px;height:8px;border-radius:50%;background:var(--primary);"></span>
          <span id="step-dot-2" style="width:8px;height:8px;border-radius:50%;background:var(--border);"></span>
          <span id="step-dot-3" style="width:8px;height:8px;border-radius:50%;background:var(--border);"></span>
        </div>

        <!-- Step 1: Email -->
        <div id="forgot-step-1">
          <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:16px;">Enter your email to receive an OTP.</p>
          <input type="email" id="forgot-email" placeholder="your@email.com" style="width:100%;padding:12px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface-0);color:var(--text-primary);font-size:0.9rem;margin-bottom:16px;box-sizing:border-box;" />
          <div style="display:flex;gap:8px;">
            <button id="forgot-cancel" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text-primary);cursor:pointer;font-weight:600;">Cancel</button>
            <button id="forgot-send-otp" style="flex:1;padding:10px;border:none;border-radius:8px;background:var(--primary);color:#fff;cursor:pointer;font-weight:600;">Send OTP</button>
          </div>
        </div>

        <!-- Step 2: OTP -->
        <div id="forgot-step-2" style="display:none;">
          <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:16px;">Enter the 6-digit OTP sent to your email.</p>
          <input type="text" id="forgot-otp" placeholder="Enter 6-digit OTP" maxlength="6" style="width:100%;padding:14px;border:1px solid var(--border);border-radius:8px;background:var(--surface-0);color:var(--text-primary);font-size:1.3rem;text-align:center;letter-spacing:8px;font-weight:700;margin-bottom:16px;box-sizing:border-box;" />
          <div style="display:flex;gap:8px;">
            <button id="forgot-back-1" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text-primary);cursor:pointer;font-weight:600;">Back</button>
            <button id="forgot-verify-otp" style="flex:1;padding:10px;border:none;border-radius:8px;background:var(--primary);color:#fff;cursor:pointer;font-weight:600;">Verify OTP</button>
          </div>
        </div>

        <!-- Step 3: New Password -->
        <div id="forgot-step-3" style="display:none;">
          <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:16px;">Set your new password (min 6 characters).</p>
          <div style="position:relative;width:100%;margin-bottom:10px;">
            <input type="password" id="forgot-new-pass" placeholder="New Password" style="width:100%;padding:12px 14px;padding-right:40px;border:1px solid var(--border);border-radius:8px;background:var(--surface-0);color:var(--text-primary);font-size:0.9rem;box-sizing:border-box;" />
            <span class="material-symbols-outlined pw-toggle" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--text-tertiary);font-size:18px;user-select:none;">visibility_off</span>
          </div>
          <div style="position:relative;width:100%;margin-bottom:16px;">
            <input type="password" id="forgot-confirm-pass" placeholder="Confirm Password" style="width:100%;padding:12px 14px;padding-right:40px;border:1px solid var(--border);border-radius:8px;background:var(--surface-0);color:var(--text-primary);font-size:0.9rem;box-sizing:border-box;" />
            <span class="material-symbols-outlined pw-toggle" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--text-tertiary);font-size:18px;user-select:none;">visibility_off</span>
          </div>
          <div style="display:flex;gap:8px;">
            <button id="forgot-back-2" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text-primary);cursor:pointer;font-weight:600;">Back</button>
            <button id="forgot-reset-pass" style="flex:1;padding:10px;border:none;border-radius:8px;background:var(--primary);color:#fff;cursor:pointer;font-weight:600;">Reset Password</button>
          </div>
        </div>

        <div id="forgot-msg" style="margin-top:12px;font-size:0.8rem;text-align:center;"></div>
      </div>
    </div>

    <!-- Footer -->
    <footer class="mt-auto flex flex-col md:flex-row justify-between items-center px-6 md:px-12 py-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 backdrop-blur w-full z-20">
      <div class="text-sm font-bold text-indigo-900 dark:text-indigo-100 mb-4 md:mb-0 font-headline">Event Flow</div>
      <div class="flex flex-wrap justify-center gap-4 md:gap-8 mb-4 md:mb-0">
        <a class="text-slate-500 dark:text-slate-400 font-body text-[11px] font-bold tracking-wider uppercase hover:text-primary transition-colors" href="#">Privacy</a>
        <a class="text-slate-500 dark:text-slate-400 font-body text-[11px] font-bold tracking-wider uppercase hover:text-primary transition-colors" href="#">Terms</a>
        <a class="text-slate-500 dark:text-slate-400 font-body text-[11px] font-bold tracking-wider uppercase hover:text-primary transition-colors" href="#">Security</a>
      </div>
      <div class="text-slate-400 dark:text-slate-500 font-body text-[10px] tracking-widest uppercase text-center md:text-right">
        © 2024 Event Flow <br class="md:hidden" /> Academic Management
      </div>
    </footer>
  `;

  // Attach event listener to login form
  document.getElementById('login-form').addEventListener('submit', handleLogin);

  // Login page theme toggle
  document.getElementById('login-theme-toggle')?.addEventListener('click', () => {
    const newTheme = toggleTheme();
    renderLogin();
  });

  // ===== FORGOT PASSWORD (3-step OTP flow) =====
  let forgotEmail = '';
  let forgotOtp = '';
  const showStep = (step) => {
    document.getElementById('forgot-step-1').style.display = step === 1 ? 'block' : 'none';
    document.getElementById('forgot-step-2').style.display = step === 2 ? 'block' : 'none';
    document.getElementById('forgot-step-3').style.display = step === 3 ? 'block' : 'none';
    document.getElementById('step-dot-1').style.background = step >= 1 ? 'var(--primary)' : 'var(--border)';
    document.getElementById('step-dot-2').style.background = step >= 2 ? 'var(--primary)' : 'var(--border)';
    document.getElementById('step-dot-3').style.background = step >= 3 ? 'var(--primary)' : 'var(--border)';
    document.getElementById('forgot-msg').textContent = '';
  };
  const forgotMsg = (txt, isErr) => {
    const el = document.getElementById('forgot-msg');
    el.textContent = txt;
    el.style.color = isErr ? 'var(--error, red)' : 'var(--success, green)';
  };

  // Open modal
  document.getElementById('forgot-password-link')?.addEventListener('click', () => {
    document.getElementById('forgot-modal').style.display = 'flex';
    document.getElementById('forgot-email').value = document.getElementById('login-email').value || '';
    showStep(1);
  });
  // Cancel
  document.getElementById('forgot-cancel')?.addEventListener('click', () => {
    document.getElementById('forgot-modal').style.display = 'none';
  });

  // Step 1 → Send OTP
  document.getElementById('forgot-send-otp')?.addEventListener('click', async () => {
    forgotEmail = document.getElementById('forgot-email').value.trim();
    if (!forgotEmail) return forgotMsg('Please enter your email', true);
    const btn = document.getElementById('forgot-send-otp');
    btn.disabled = true; btn.textContent = 'Sending...';
    try {
      await api.auth.forgotPassword(forgotEmail);
      forgotMsg('OTP sent! Check your email.', false);
      setTimeout(() => showStep(2), 800);
    } catch (err) { forgotMsg(err.message, true); }
    btn.disabled = false; btn.textContent = 'Send OTP';
  });

  // Step 2 back
  document.getElementById('forgot-back-1')?.addEventListener('click', () => showStep(1));

  // Step 2 → Verify OTP (just store, actual verify on Step 3)
  document.getElementById('forgot-verify-otp')?.addEventListener('click', () => {
    forgotOtp = document.getElementById('forgot-otp').value.trim();
    if (!forgotOtp || forgotOtp.length !== 6) return forgotMsg('Enter a valid 6-digit OTP', true);
    showStep(3);
  });

  // Step 3 back
  document.getElementById('forgot-back-2')?.addEventListener('click', () => showStep(2));

  // Step 3 → Reset password
  document.getElementById('forgot-reset-pass')?.addEventListener('click', async () => {
    const newPass = document.getElementById('forgot-new-pass').value;
    const confirmPass = document.getElementById('forgot-confirm-pass').value;
    if (!newPass || newPass.length < 6) return forgotMsg('Password must be at least 6 characters', true);
    if (newPass !== confirmPass) return forgotMsg('Passwords do not match', true);
    const btn = document.getElementById('forgot-reset-pass');
    btn.disabled = true; btn.textContent = 'Resetting...';
    try {
      const data = await api.auth.resetPassword(forgotEmail, forgotOtp, newPass);
      forgotMsg(data.message || 'Password reset! You can now log in.', false);
      setTimeout(() => { document.getElementById('forgot-modal').style.display = 'none'; }, 2000);
    } catch (err) { forgotMsg(err.message, true); }
    btn.disabled = false; btn.textContent = 'Reset Password';
  });

  // Load and auto-scroll upcoming events
  loadUpcomingEvents();
}

async function loadUpcomingEvents() {
  const inner = document.getElementById('events-scroller-inner');
  if (!inner) return;
  try {
    const events = await api.public.getUpcomingEvents();
    if (!events || events.length === 0) {
      inner.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-tertiary);font-size:0.85rem;">No upcoming events</div>';
      return;
    }
    // Render event items
    const itemHtml = events.map(ev => `
      <div style="padding:12px 16px;border-bottom:1px solid var(--border,#e2e8f0);display:flex;align-items:center;gap:12px;min-height:48px;">
        <span class="material-symbols-outlined" style="font-size:20px;color:var(--primary);flex-shrink:0;">event</span>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:0.88rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ev.title}</div>
          <div style="font-size:0.75rem;color:var(--text-tertiary);margin-top:2px;">${ev.department} · ${new Date(ev.date).toLocaleDateString('en-IN', {day:'numeric',month:'short',year:'numeric'})}</div>
        </div>
        ${ev.category ? `<span style="font-size:0.65rem;font-weight:700;text-transform:uppercase;padding:3px 8px;border-radius:99px;background:var(--primary-surface,#e0e7ff);color:var(--primary,#4f46e5);flex-shrink:0;white-space:nowrap;">${ev.category}</span>` : ''}
      </div>
    `).join('');
    // We need the base content to be taller than the container (160px) so the loop is seamless
    const estItemHeight = 60; 
    const copiesNeeded = Math.ceil(160 / (events.length * estItemHeight));
    const copies = Math.max(1, copiesNeeded);
    
    let baseBlock = '';
    for (let i = 0; i < copies; i++) {
      baseBlock += itemHtml;
    }
    
    // Duplicate the base block exactly once for the CSS translateY(-50%) trick
    inner.innerHTML = baseBlock + baseBlock;

    // Add CSS animation if not exists
    if (!document.getElementById('events-marquee-style')) {
      const style = document.createElement('style');
      style.id = 'events-marquee-style';
      style.innerHTML = `
        @keyframes marquee-up {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        .animate-marquee-up {
          /* Duration will be overridden inline */
          animation: marquee-up 10s linear infinite;
        }
        .animate-marquee-up:hover {
          animation-play-state: paused;
        }
      `;
      document.head.appendChild(style);
    }
    
    // Set animation duration based on total items so speed is constant
    const totalItemsInBase = events.length * copies;
    const duration = totalItemsInBase * 3.5; // 3.5 seconds per item
    inner.style.animation = `marquee-up ${duration}s linear infinite`;
    inner.classList.add('animate-marquee-up');
  } catch (err) {
    inner.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-tertiary);font-size:0.85rem;">Could not load events</div>';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  const errorEl = document.getElementById('login-error');
  
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin" style="font-size: 18px;">sync</span> <span>Signing In...</span>';
  }
  
  if (errorEl) {
    errorEl.style.display = 'none';
    errorEl.classList.add('hidden');
  }

  try {
    const result = await api.auth.login(email, password);
    // Apply user's theme preference
    if (result.user?.theme_preference) {
      applyTheme(result.user.theme_preference);
    }
    showToast('Welcome back!', 'success');
    renderApp();
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message || 'Invalid credentials';
      errorEl.classList.remove('hidden');
      errorEl.style.display = 'block';
    } else {
      showToast(err.message || 'Invalid credentials', 'error');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>Secure Login</span><span class="material-symbols-outlined" style="font-size: 18px;">arrow_forward</span>';
    }
  }
}

// ===== MAIN APP SHELL =====
function renderApp() {
  const user = api.auth.getUser();
  if (!user) return renderLogin();
  const app = document.getElementById('app');
  const navItems = getNavItems(user.role);

  app.innerHTML = `
    <!-- Tailwind SideNavBar -->
    <aside class="bg-slate-50 dark:bg-slate-900 h-screen w-64 fixed left-0 top-0 flex flex-col py-6 px-4 z-50 overflow-y-auto border-r border-transparent dark:border-slate-800 transition-colors">
      <div class="mb-10 px-4">
        <h1 class="text-xl font-bold tracking-tight text-indigo-950 dark:text-indigo-300">Event Flow</h1>
        <p class="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-label mt-1">${getRoleLabel(user.role)}</p>
      </div>
      <nav class="flex-1 space-y-1" id="sidebar-nav">
        ${navItems.map((item) => `
          <a class="nav-item flex items-center gap-3 px-4 py-3 ${item.id === currentPage ? 'text-indigo-700 dark:text-indigo-400 font-bold border-r-4 border-indigo-700 dark:border-indigo-400 bg-slate-200/50 dark:bg-slate-800' : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'} transition-colors duration-200 cursor-pointer" data-page="${item.id}">
            <span class="material-symbols-outlined">${item.icon}</span>
            <span class="text-sm">${item.label}</span>
          </a>
        `).join('')}
      </nav>
      <div class="pt-6 mt-6 border-t border-slate-200/50 dark:border-slate-800 space-y-1">
        <div class="flex items-center justify-between gap-3 px-4 mt-6">
          <div class="flex items-center gap-3">
             <div class="w-10 h-10 rounded-full bg-indigo-100 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center">${getUserInitials(user.name)}</div>
             <div>
               <p class="text-xs font-bold text-on-surface dark:text-slate-200">${user.name.split(' ')[0]}</p>
               <p class="text-[10px] text-slate-500 dark:text-slate-400">${user.role}</p>
             </div>
          </div>
          <button class="text-slate-400 dark:text-slate-500 hover:text-red-500 transition-colors" id="btn-logout" title="Sign Out">
             <span class="material-symbols-outlined text-lg">logout</span>
          </button>
        </div>
      </div>
    </aside>

    <!-- Tailwind TopNavBar -->
    <header class="fixed top-0 right-0 w-[calc(100%-16rem)] z-40 bg-white/70 dark:bg-slate-900/80 backdrop-blur-xl flex justify-between items-center h-16 px-8 border-b border-slate-100 dark:border-slate-800 transition-colors">
      <div class="flex items-center gap-6">
        <span class="text-indigo-700 dark:text-indigo-400 font-semibold text-sm" id="header-title">${navItems.find((n) => n.id === currentPage)?.label || 'Dashboard'}</span>
      </div>
      <div class="flex items-center gap-3">
        <!-- Dynamic Header Actions Vector -->
        <span id="header-actions" class="flex flex-row items-center justify-end gap-3 flex-nowrap shrink-0 whitespace-nowrap"></span>
      </div>
    </header>

    <!-- Main Content Canvas -->
    <main class="ml-64 pt-24 pb-12 px-8 min-h-screen" id="main-content">
      <div class="loading-spinner"><div class="spinner"></div></div>
    </main>

    <div class="modal-overlay" id="modal-overlay">
      <div class="modal" id="modal-content"></div>
    </div>
  `;

  // Initialize academic year if not set
  if (!pageState.academicYear) pageState.academicYear = getCurrentAcademicYear();

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      currentPage = item.dataset.page;
      document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('header-title').textContent = navItems.find((n) => n.id === currentPage)?.label || '';
      loadPage();
    });
  });



  document.getElementById('btn-logout').addEventListener('click', () => {
    api.auth.logout();
    currentPage = 'dashboard';
    showToast('Signed out successfully', 'info');
    renderLogin();
  });

  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });

  loadPage();
}

// ===== NAV CONFIG =====
function getNavItems(role) {
  const settingsItem = { id: 'settings', icon: 'settings', label: 'Settings' };
  if (role === 'PRINCIPAL') {
    return [
      { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
      { id: 'departments', icon: 'business', label: 'Departments' },
      { id: 'category-overview', icon: 'category', label: 'Category Overview' },
      { id: 'schedule-overview', icon: 'event_repeat', label: 'Schedule Overview' },
      { id: 'calendar', icon: 'calendar_month', label: 'Event Calendar' },
      { id: 'events', icon: 'event_note', label: 'All Events' },
      { id: 'reports', icon: 'assessment', label: 'Reports & Analytics' },
      { id: 'logs', icon: 'history', label: 'Global Logs' },
      settingsItem,
    ];
  }
  if (role === 'HOD') {
    return [
      { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
      { id: 'categories', icon: 'category', label: 'Categories' },
      { id: 'scheduling', icon: 'event_repeat', label: 'Category Scheduling' },
      { id: 'admin-mgmt', icon: 'admin_panel_settings', label: 'Admin Users' },
      { id: 'events', icon: 'event_note', label: 'My Dept Events' },
      { id: 'reviews', icon: 'approval', label: 'Review Queue' },
      { id: 'calendar', icon: 'calendar_month', label: 'College Calendar' },
      { id: 'logs', icon: 'history', label: 'Dept Logs' },
      settingsItem,
    ];
  }
  if (role === 'ADMIN') {
    return [
      { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
      { id: 'hod-schedules', icon: 'event_repeat', label: 'HOD Schedules' },
      { id: 'events', icon: 'event_note', label: 'My Assigned Events' },
      settingsItem,
    ];
  }
  return [];
}

function getRoleLabel(role) {
  return { PRINCIPAL: 'Institutional Overseer', HOD: 'Department Head', ADMIN: 'Event Coordinator' }[role] || role;
}

// ===== PAGE ROUTER =====
async function loadPage() {
  const content = document.getElementById('main-content');
  const headerActions = document.getElementById('header-actions');
  content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  headerActions.innerHTML = '';
  const user = api.auth.getUser();

  try {
    switch (currentPage) {
      case 'dashboard': await renderDashboard(content, headerActions, user); break;
      case 'departments': await renderDepartments(content, headerActions, user); break;
      case 'calendar': await renderCalendar(content, headerActions, user); break;
      case 'events': await renderAllEvents(content, headerActions, user); break;
      case 'reports': await renderReports(content, headerActions, user); break;
      case 'logs':
        if (user.role === 'HOD') await renderHodLogs(content);
        else await renderLogs(content, headerActions, user);
        break;
      case 'dept-drilldown': await renderDeptDrilldown(content, headerActions, user); break;
      case 'event-detail': await renderEventDetail(content, headerActions, user); break;
      case 'reviews': await renderHodReviews(content, headerActions, user); break;
      case 'categories': await renderHodCategories(content, headerActions, user); break;
      case 'global-events': await renderHodGlobalEvents(content, headerActions, user); break;

      case 'hod-event-detail': await renderHodEventDetail(content, headerActions, user); break;
      case 'admin-mgmt': await renderHodAdminMgmt(content, headerActions, user); break;
      case 'admin-event-detail': await renderAdminEventDetail(content, headerActions, user); break;
      case 'scheduling': await renderHodScheduling(content, headerActions, user); break;
      case 'hod-schedules': await renderAdminSchedules(content, headerActions, user); break;
      case 'schedule-overview': await renderPrincipalScheduleOverview(content, headerActions, user); break;
      case 'category-overview': await renderCategoryOverview(content, headerActions, user); break;
      case 'settings': renderSettings(content, headerActions, user); break;
      default: await renderDashboard(content, headerActions, user);
    }
    // Inject date range filter into header (all pages except detail views)
    injectDateRangeFilter(headerActions);
    // Inject date range banner into content area
    injectDateRangeBanner();
  } catch (err) {
    content.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-outlined">cloud_off</span>
        <p>${err.message || 'Failed to load data. Is the backend running?'}</p>
      </div>`;
  }
}

// Helper to navigate with state
let pageState = {};
function navigateTo(page, state = {}) {
  currentPage = page;
  // Preserve global filter state across navigation
  const { academicYear, fromMonth, toMonth } = pageState;
  pageState = { ...state, academicYear, fromMonth, toMonth };
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');
  loadPage();
}

// =============================================
//          PRINCIPAL MODULE PAGES
// =============================================

// ===== 1. DASHBOARD =====
async function renderDashboard(container, headerActions, user) {
  if (user.role !== 'PRINCIPAL') {
    return renderGenericDashboard(container, user);
  }

  headerActions.innerHTML = `
    <button class="btn-icon" id="btn-refresh" title="Refresh"><span class="material-symbols-outlined">refresh</span></button>
  `;
  document.getElementById('btn-refresh')?.addEventListener('click', loadPage);

  const dash = await api.principal.getDashboard();

  container.innerHTML = `
    <div class="metrics-grid">
      ${metricCard('business', dash.totalDepartments, 'Total Departments', 'Institution', '', '')}
      ${metricCard('event_available', dash.totalEvents, 'Total Events', 'All Departments', '', '')}
      ${metricCard('check_circle', dash.completedEvents, 'Completed', `${dash.totalEvents ? Math.round((dash.completedEvents / dash.totalEvents) * 100) : 0}% completion`, 'accent-teal', '')}
      ${metricCard('pending_actions', dash.pendingEvents, 'Pending Approvals', dash.pendingEvents > 0 ? 'Needs Attention' : 'All Clear', 'accent-amber', '')}
      ${metricCard('thumb_up', dash.approvedEvents, 'Approved Events', 'Ready to go', '', '')}
      ${metricCard('groups', dash.totalParticipants, 'Total Participants', 'Across all events', 'accent-teal', '')}
    </div>

    <div class="insights-grid" style="margin-top:32px;">
      <div class="insights-card">
        <h3>Event Pipeline Overview</h3>
        ${progressBar('Completed', dash.completedEvents, dash.totalEvents, 'teal')}
        ${progressBar('Approved', dash.approvedEvents, dash.totalEvents, 'indigo')}
        ${progressBar('Pending Approval', dash.pendingEvents, dash.totalEvents, 'amber')}
        ${progressBar('Rejected', dash.rejectedEvents, dash.totalEvents, 'red')}
      </div>
      <div class="insights-card">
        <h3>Quick Actions</h3>
        <div class="quick-actions">
          <button class="quick-action-btn" onclick="window.__nav('departments')">
            <span class="material-symbols-outlined">business</span>
            <span>Manage Departments</span>
          </button>
          <button class="quick-action-btn" onclick="window.__nav('calendar')">
            <span class="material-symbols-outlined">calendar_month</span>
            <span>Event Calendar</span>
          </button>
          <button class="quick-action-btn" onclick="window.__nav('reports')">
            <span class="material-symbols-outlined">assessment</span>
            <span>View Reports</span>
          </button>
          <button class="quick-action-btn" onclick="window.__nav('logs')">
            <span class="material-symbols-outlined">history</span>
            <span>Activity Logs</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

// ===== 2. DEPARTMENT MANAGEMENT =====
async function renderDepartments(container, headerActions, user) {
  headerActions.innerHTML = `
    <button class="btn-primary" id="btn-create-hod" style="background:linear-gradient(135deg,var(--secondary),var(--secondary-light));box-shadow:0 2px 10px rgba(13,148,136,0.25);"><span class="material-symbols-outlined">person_add</span> Create HOD</button>
    <button class="btn-primary" id="btn-create-dept"><span class="material-symbols-outlined">add</span> New Department</button>
    <button class="btn-icon" id="btn-refresh" title="Refresh"><span class="material-symbols-outlined">refresh</span></button>
  `;
  document.getElementById('btn-create-hod')?.addEventListener('click', showCreateHodModal);
  document.getElementById('btn-create-dept')?.addEventListener('click', showCreateDepartmentModal);
  document.getElementById('btn-refresh')?.addEventListener('click', loadPage);

  const departments = await api.principal.getDepartments();

  if (!departments || departments.length === 0) {
    container.innerHTML = `
      <div class="table-section">
        <div class="table-header"><div><h2>Departments</h2><p>Manage your institutional departments</p></div></div>
        <div class="empty-state">
          <span class="material-symbols-outlined">apartment</span>
          <p>No departments yet. Click "New Department" to create one.</p>
        </div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-section">
      <div class="table-header" style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <h2>Departments</h2>
          <p>${departments.length} department${departments.length !== 1 ? 's' : ''} in the institution</p>
        </div>
        <div style="position:relative;">
          <span class="material-symbols-outlined" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);font-size:18px;pointer-events:none;">search</span>
          <input type="text" placeholder="Search departments..." onkeyup="window.__filterTable(this)" style="padding:8px 12px 8px 36px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-0);color:var(--text-primary);font-size:0.85rem;width:220px;" />
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Department</th>
              <th>HOD</th>
              <th>Total Events</th>
              <th>Completed</th>
              <th>Pending</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${departments.map((d) => `
              <tr>
                <td>
                  <div class="event-title">${d.name}</div>
                  <div class="event-id">ID: ${d.id.slice(0, 8)}</div>
                </td>
                <td>
                  ${d.hod_name
                    ? `<span style="font-size:0.85rem;font-weight:600;color:var(--text-primary);">${d.hod_name}</span>`
                    : `<span style="font-size:0.8rem;color:var(--text-tertiary);font-style:italic;">Not assigned</span>`}
                </td>
                <td><span style="font-weight:700;font-size:1.1rem;">${d.event_count}</span></td>
                <td><span class="status-badge status-completed"><span class="status-dot"></span> ${d.completed_count}</span></td>
                <td><span class="status-badge status-pending"><span class="status-dot"></span> ${d.pending_count}</span></td>
                <td style="text-align:right;">
                  <div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;">
                    <button class="btn-outline" onclick="window.__drillDept('${d.id}','${d.name}')">
                      <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">visibility</span> View Events
                    </button>
                    <button class="btn-outline" onclick="window.__editDept('${d.id}','${d.name}','${d.hod_id || ''}')">
                      <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">edit</span> Edit
                    </button>
                    ${d.hod_id ? `
                    <button class="btn-outline" style="color:#ef4444;border-color:rgba(239,68,68,0.2);" onclick="window.__removeHod('${d.hod_id}','${d.hod_name}')">
                      <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">person_remove</span> Remove HOD
                    </button>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ===== 3. GLOBAL EVENT CALENDAR =====
async function renderCalendar(container, headerActions, user) {
  const now = new Date();
  let calYear = pageState.calYear || now.getFullYear();
  let calMonth = pageState.calMonth || (now.getMonth() + 1);
  let calDept = pageState.calDept || '';

  const apiLayer = user.role === 'HOD' ? api.hod : api.principal;
  const departments = await apiLayer.getAllDepartments ? await apiLayer.getAllDepartments() : await apiLayer.getDepartments();

  const targetYear = pageState.academicYear || getCurrentAcademicYear();

  headerActions.innerHTML = `
    <select id="global-year-filter" class="filter-select">
      ${getAcademicYearOptions().map(ay => `<option value="${ay}" ${targetYear === ay ? 'selected' : ''}>${academicYearLabel(ay)}</option>`).join('')}
    </select>
    <select id="cal-dept-filter" class="filter-select">
      <option value="">All Departments</option>
      ${(departments || []).map((d) => `<option value="${d.id}" ${calDept === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
    </select>
    <button class="btn-icon" id="btn-refresh" title="Refresh"><span class="material-symbols-outlined">refresh</span></button>
  `;
  const eventsPromise = apiLayer.getCalendar({ year: calYear, month: calMonth, department_id: calDept || undefined, academic_year: targetYear });
  let schedulesPromise;
  
  if (user.role === 'PRINCIPAL') {
    schedulesPromise = apiLayer.getSchedules({ academic_year: targetYear, department_id: calDept || undefined });
  } else if (apiLayer.getSchedules) {
    schedulesPromise = apiLayer.getSchedules(targetYear);
  } else {
    schedulesPromise = Promise.resolve([]); // fallback
  }

  const [events, allSchedules] = await Promise.all([eventsPromise, schedulesPromise]);

  // Filter schedules for the currently viewed month
  const monthSchedules = (allSchedules || []).filter(s => 
    s.scheduled_month === calMonth && s.scheduled_year === calYear
  );

  // Build calendar grid
  const firstDay = new Date(calYear, calMonth - 1, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const monthName = new Date(calYear, calMonth - 1).toLocaleString('en-US', { month: 'long' });

  // Map events to days
  const eventsByDay = {};
  (events || []).forEach((ev) => {
    const day = new Date(ev.date).getDate();
    if (!eventsByDay[day]) eventsByDay[day] = [];
    eventsByDay[day].push(ev);
  });

  container.innerHTML = `
    <div class="calendar-wrapper">
      <div class="calendar-header-bar">
        <button class="btn-icon" id="cal-prev"><span class="material-symbols-outlined">chevron_left</span></button>
        <h2 class="calendar-month-title">${monthName} ${calYear}</h2>
        <button class="btn-icon" id="cal-next"><span class="material-symbols-outlined">chevron_right</span></button>
      </div>

      ${monthSchedules.length > 0 ? `
      <div style="padding: 12px 20px; background: var(--bg-secondary); border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
        <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Goals this Month:</span>
        ${monthSchedules.map(s => {
          const name = s.subcategories ? `${s.categories.name} - ${s.subcategories.name}` : s.categories.name;
          return `<span class="schedule-badge ${getScheduleStatusClass(s.computed_status)}" style="font-size:0.75rem; padding:4px 8px;">
            ${getScheduleStatusIcon(s.computed_status)} ${name}
          </span>`;
        }).join('')}
      </div>
      ` : ''}

      <div class="calendar-grid">
        <div class="cal-day-header">Sun</div>
        <div class="cal-day-header">Mon</div>
        <div class="cal-day-header">Tue</div>
        <div class="cal-day-header">Wed</div>
        <div class="cal-day-header">Thu</div>
        <div class="cal-day-header">Fri</div>
        <div class="cal-day-header">Sat</div>
        ${buildCalendarDays(firstDay, daysInMonth, eventsByDay, now, calYear, calMonth, user)}
      </div>
    </div>

    ${events && events.length > 0 ? `
    <div class="table-section" style="margin-top:24px;">
      <div class="table-header">
        <div><h2>Events in ${monthName} ${calYear}</h2><p>${events.length} event${events.length !== 1 ? 's' : ''}</p></div>
      </div>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Event</th><th>Venue</th><th>Department</th><th>Status</th></tr></thead>
          <tbody>
            ${events.map((ev) => `
              <tr class="clickable-row" onclick="window.${user.role === 'HOD' ? '__hodViewEvent' : '__viewEvent'}('${ev.id}')">
                <td style="white-space:nowrap;">${formatDate(ev.date)}</td>
                <td><div class="event-title">${ev.title}</div></td>
                <td style="font-size:0.8rem;color:var(--text-secondary);">${ev.venue || '—'}</td>
                <td><span class="category-tag">${ev.departments?.name || '—'}</span></td>
                <td><span class="status-badge ${getStatusClass(ev.status)}"><span class="status-dot"></span>${getStatusLabel(ev.status)}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
  `;

  // Calendar nav handlers
  document.getElementById('cal-prev').addEventListener('click', () => {
    calMonth--;
    if (calMonth < 1) { calMonth = 12; calYear--; }
    pageState = { ...pageState, calYear, calMonth, calDept };
    loadPage();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calMonth++;
    if (calMonth > 12) { calMonth = 1; calYear++; }
    pageState = { ...pageState, calYear, calMonth, calDept };
    loadPage();
  });
  document.getElementById('global-year-filter')?.addEventListener('change', (e) => {
    const ay = e.target.value;
    const startYear = ay.includes('-') ? parseInt(ay.split('-')[0], 10) : parseInt(ay, 10);
    pageState = { 
      ...pageState, 
      academicYear: ay,
      calYear: startYear,
      calMonth: 9
    };
    loadPage();
  });
  document.getElementById('cal-dept-filter').addEventListener('change', (e) => {
    calDept = e.target.value;
    pageState = { ...pageState, calYear, calMonth, calDept };
    loadPage();
  });
  document.getElementById('btn-refresh')?.addEventListener('click', loadPage);
}

function buildCalendarDays(firstDay, daysInMonth, eventsByDay, now, calYear, calMonth, user) {
  let html = '';
  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="cal-day empty"></div>';
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === now.getDate() && calMonth === now.getMonth() + 1 && calYear === now.getFullYear();
    const dayEvents = eventsByDay[d] || [];
    const hasEvents = dayEvents.length > 0;
    html += `
      <div class="cal-day ${isToday ? 'today' : ''} ${hasEvents ? 'has-events' : ''}">
        <span class="cal-day-num">${d}</span>
        ${dayEvents.slice(0, 2).map((ev) => `
          <div class="cal-event-chip ${getStatusClass(ev.status)}" onclick="window.${user.role === 'HOD' ? '__hodViewEvent' : '__viewEvent'}('${ev.id}')" title="${ev.title}">
            ${ev.title.length > 18 ? ev.title.slice(0, 18) + '…' : ev.title}
          </div>
        `).join('')}
        ${dayEvents.length > 2 ? `<div class="cal-more">+${dayEvents.length - 2} more</div>` : ''}
      </div>
    `;
  }
  return html;
}

// ===== 4. ALL EVENTS (with filters) =====
async function renderAllEvents(container, headerActions, user) {
  if (user.role !== 'PRINCIPAL') {
    return renderGenericEvents(container, headerActions, user);
  }

  const departments = await api.principal.getDepartments();
  let filterDept = pageState.filterDept || '';
  let filterStatus = pageState.filterStatus || '';
  let filterYear = pageState.filterYear || '';

  headerActions.innerHTML = `
    <select id="ev-dept-filter" class="filter-select">
      <option value="">All Departments</option>
      ${(departments || []).map((d) => `<option value="${d.id}" ${filterDept === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
    </select>
    <select id="ev-status-filter" class="filter-select">
      <option value="">All Statuses</option>
      <option value="DRAFT" ${filterStatus === 'DRAFT' ? 'selected' : ''}>Draft</option>
      <option value="PENDING_APPROVAL" ${filterStatus === 'PENDING_APPROVAL' ? 'selected' : ''}>Pending</option>
      <option value="APPROVED" ${filterStatus === 'APPROVED' ? 'selected' : ''}>Approved</option>
      <option value="COMPLETED" ${filterStatus === 'COMPLETED' ? 'selected' : ''}>Completed</option>
      <option value="REJECTED" ${filterStatus === 'REJECTED' ? 'selected' : ''}>Rejected</option>
    </select>
    <button class="btn-icon" id="btn-refresh" title="Refresh"><span class="material-symbols-outlined">refresh</span></button>
  `;

  const events = await api.principal.getEvents({
    department_id: filterDept || undefined,
    status: filterStatus || undefined,
  });

  container.innerHTML = events.length > 0 ? `
    <div class="table-section">
      <div class="table-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div><h2>All Events</h2><p>${events.length} event${events.length !== 1 ? 's' : ''} found</p></div>
        <div style="position:relative;"><span class="material-symbols-outlined" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);font-size:18px;pointer-events:none;">search</span><input type="text" placeholder="Search events..." onkeyup="window.__filterTable(this)" style="padding:8px 12px 8px 36px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-0);color:var(--text-primary);font-size:0.85rem;width:220px;" /></div>
      </div>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Event Title</th><th>Department</th><th>Category</th><th>Date</th><th>Venue</th><th>Status</th></tr></thead>
          <tbody>
            ${events.map((ev) => `
              <tr class="clickable-row" onclick="window.${user.role === 'HOD' ? '__hodViewEvent' : '__viewEvent'}('${ev.id}')">
                <td><div class="event-title">${ev.title}</div><div class="event-id">ID: ${ev.id.slice(0, 8)}</div></td>
                <td><span class="category-tag">${ev.departments?.name || '—'}</span></td>
                <td><span class="category-tag">${ev.categories?.name || '—'}</span></td>
                <td style="white-space:nowrap;">${formatDate(ev.date)}</td>
                <td style="font-size:0.8rem;color:var(--text-secondary);">${ev.venue || '—'}</td>
                <td><span class="status-badge ${getStatusClass(ev.status)}"><span class="status-dot"></span>${getStatusLabel(ev.status)}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="table-footer"><span>Showing ${events.length} event${events.length !== 1 ? 's' : ''}</span></div>
    </div>
  ` : `
    <div class="table-section">
      <div class="table-header"><div><h2>All Events</h2><p>No events match your filters</p></div></div>
      <div class="empty-state"><span class="material-symbols-outlined">event_busy</span><p>No events found. Try changing your filters.</p></div>
    </div>`;

  // Filter handlers
  const applyFilters = () => {
    pageState = {
      ...pageState,
      filterDept: document.getElementById('ev-dept-filter').value,
      filterStatus: document.getElementById('ev-status-filter').value,
    };
    loadPage();
  };
  document.getElementById('ev-dept-filter').addEventListener('change', applyFilters);
  document.getElementById('ev-status-filter').addEventListener('change', applyFilters);
  document.getElementById('btn-refresh')?.addEventListener('click', loadPage);
}

// ===== 5. DEPARTMENT DRILL DOWN =====
async function renderDeptDrilldown(container, headerActions, user) {
  const { deptId, deptName } = pageState;
  if (!deptId) return navigateTo('departments');

  headerActions.innerHTML = `
    <button class="btn-outline" id="btn-back-depts"><span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">arrow_back</span> Back to Departments</button>
    <button class="btn-icon" id="btn-refresh" title="Refresh"><span class="material-symbols-outlined">refresh</span></button>
  `;
  document.getElementById('btn-back-depts')?.addEventListener('click', () => navigateTo('departments'));
  document.getElementById('btn-refresh')?.addEventListener('click', loadPage);

  document.getElementById('header-title').textContent = deptName || 'Department';

  const data = await api.principal.getDepartmentEvents(deptId);

  container.innerHTML = `
    <div class="metrics-grid" style="grid-template-columns: repeat(4, 1fr);">
      ${metricCard('event_available', data.stats.total, 'Total Events', deptName, '', '')}
      ${metricCard('check_circle', data.stats.completed, 'Completed', data.stats.total ? Math.round((data.stats.completed / data.stats.total) * 100) + '%' : '0%', 'accent-teal', '')}
      ${metricCard('pending_actions', data.stats.pending, 'Pending', 'Awaiting approval', 'accent-amber', '')}
      ${metricCard('thumb_up', data.stats.approved, 'Approved', 'In progress', '', '')}
    </div>

    ${data.events.length > 0 ? `
    <div class="table-section" style="margin-top:24px;">
      <div class="table-header">
        <div><h2>${deptName} — Events</h2><p>${data.events.length} event${data.events.length !== 1 ? 's' : ''}</p></div>
      </div>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Event Title</th><th>Category</th><th>Date</th><th>Venue</th><th>Status</th></tr></thead>
          <tbody>
            ${data.events.map((ev) => `
              <tr class="clickable-row" onclick="window.${user.role === 'HOD' ? '__hodViewEvent' : '__viewEvent'}('${ev.id}')">
                <td><div class="event-title">${ev.title}</div><div class="event-id">ID: ${ev.id.slice(0, 8)}</div></td>
                <td><span class="category-tag">${ev.categories?.name || '—'}</span></td>
                <td style="white-space:nowrap;">${formatDate(ev.date)}</td>
                <td style="font-size:0.8rem;color:var(--text-secondary);">${ev.venue || '—'}</td>
                <td>
                  <span class="status-badge ${getStatusClass(ev.status)}"><span class="status-dot"></span>${getStatusLabel(ev.status)}</span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>` : `
    <div class="table-section" style="margin-top:24px;">
      <div class="table-header"><div><h2>${deptName} — Events</h2></div></div>
      <div class="empty-state"><span class="material-symbols-outlined">event_busy</span><p>No events in this department yet.</p></div>
    </div>`}
  `;
}

// ===== 6. EVENT DETAIL =====
async function renderEventDetail(container, headerActions, user) {
  const { eventId } = pageState;
  if (!eventId) return navigateTo('events');

  headerActions.innerHTML = `
    <button class="btn-outline" id="btn-back-events"><span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">arrow_back</span> Back</button>
  `;
  document.getElementById('btn-back-events')?.addEventListener('click', () => {
    // Go back to where we came from
    navigateTo(pageState.backTo || 'events');
  });

  const ev = await api.principal.getEventDetails(eventId);
  document.getElementById('header-title').textContent = ev.title || 'Event Details';

  const isDrive = (u) => u && (u.includes('drive.google.com') || u.includes('docs.google.com'));
  const images = (ev.media || []).filter((m) => m.type === 'IMAGE' && !isDrive(m.url));
  const videos = (ev.media || []).filter((m) => m.type === 'VIDEO' && !isDrive(m.url));
  const reports = (ev.media || []).filter((m) => m.type === 'REPORT_PDF' && !isDrive(m.url));
  const driveLinks = (ev.media || []).filter((m) => isDrive(m.url));

  container.innerHTML = `
    <!-- Event Info -->
    <div class="detail-grid">
      <div class="detail-main">
        <div class="detail-card">
          <h2>${ev.title}</h2>
          <div class="detail-meta">
            <span class="status-badge ${getStatusClass(ev.status)}"><span class="status-dot"></span>${getStatusLabel(ev.status)}</span>
            <span class="detail-meta-item"><span class="material-symbols-outlined">calendar_today</span>${formatDate(ev.date)}</span>
            <span class="detail-meta-item"><span class="material-symbols-outlined">location_on</span>${ev.venue || '—'}</span>
          </div>

          <div class="detail-section">
            <h4>Details</h4>
            <div class="detail-info-grid">
              <div class="detail-info-item"><span class="detail-label">Department</span><span class="detail-value">${ev.departments?.name || '—'}</span></div>
              <div class="detail-info-item"><span class="detail-label">Category</span><span class="detail-value">${ev.categories?.name || '—'}</span></div>
              <div class="detail-info-item"><span class="detail-label">Subcategory</span><span class="detail-value">${ev.subcategories?.name || '—'}</span></div>
              <div class="detail-info-item"><span class="detail-label">Target Attendance</span><span class="detail-value">${ev.target_count || '—'}</span></div>
              <div class="detail-info-item"><span class="detail-label">Actual Participants</span><span class="detail-value">${ev.participant_count}</span></div>
              <div class="detail-info-item"><span class="detail-label">Avg. Rating</span><span class="detail-value">${ev.avg_rating ? '⭐ ' + ev.avg_rating + '/5' : '—'}</span></div>
            </div>
          </div>

          ${ev.guests ? `
          <div class="detail-section">
            <h4>Guests / Speakers</h4>
            <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6;">${ev.guests}</p>
          </div>` : ''}
        </div>

        <!-- Participants -->
        <div class="detail-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <h3 style="margin:0;"><span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px;">groups</span> Participants (${ev.participant_count})</h3>
            ${ev.participants.length > 0 ? `<button class="btn-outline" style="padding:4px 12px;font-size:0.75rem;" onclick="window.__downloadParticipantsFromData(${JSON.stringify(ev.participants).replace(/'/g,'\\u0027').replace(/"/g,'&quot;')}, '${ev.title}')">
              <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">download</span> CSV
            </button>` : ''}
          </div>
          ${ev.participants.length > 0 ? `
          <div style="overflow-x:auto;">
            <table class="data-table compact">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Department</th><th>Year</th></tr></thead>
              <tbody>
                ${ev.participants.map((p) => `
                  <tr>
                    <td style="font-weight:600;">${p.name}</td>
                    <td style="font-size:0.8rem;color:var(--text-secondary);">${p.email}</td>
                    <td style="font-size:0.8rem;">${p.phone || '—'}</td>
                    <td style="font-size:0.8rem;">${p.department || '—'}</td>
                    <td style="font-size:0.8rem;">${p.year || '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>` : '<div class="empty-state" style="padding:24px;"><p>No participants registered yet.</p></div>'}
        </div>

        <!-- Media -->
        <div class="detail-card">
          <h3><span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px;">perm_media</span> Media Gallery</h3>
          ${images.length > 0 ? `
          <div class="detail-section">
            <h4>🖼️ Images (${images.length})</h4>
            <div class="media-grid">
              ${images.map((m) => `<a href="${m.url}" target="_blank" class="media-item"><img src="${m.url}" alt="Event image" /><span class="material-symbols-outlined media-download">open_in_new</span></a>`).join('')}
            </div>
            <div style="margin-top:8px;"><a href="${images[0].url}" download style="color:var(--primary);font-size:0.8rem;text-decoration:none;display:inline-flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:16px;">download</span> Download Images</a></div>
          </div>` : ''}
          ${videos.length > 0 ? `
          <div class="detail-section">
            <h4>🎥 Videos (${videos.length})</h4>
            <div class="media-list">
              ${videos.map((m) => `<a href="${m.url}" target="_blank" class="media-link"><span class="material-symbols-outlined">play_circle</span> ${m.url.split('/').pop() || 'Video'}<span class="material-symbols-outlined">open_in_new</span></a>`).join('')}
            </div>
            <div style="margin-top:8px;"><a href="${videos[0].url}" download style="color:var(--primary);font-size:0.8rem;text-decoration:none;display:inline-flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:16px;">download</span> Download Videos</a></div>
          </div>` : ''}
          ${reports.length > 0 ? `
          <div class="detail-section">
            <h4>📄 Reports (${reports.length})</h4>
            <div class="media-list">
              ${reports.map((m) => `<a href="${m.url}" target="_blank" class="media-link"><span class="material-symbols-outlined">description</span> ${m.url.split('/').pop() || 'Report PDF'}<span class="material-symbols-outlined">open_in_new</span></a>`).join('')}
            </div>
            <div style="margin-top:8px;"><a href="${reports[0].url}" download style="color:var(--primary);font-size:0.8rem;text-decoration:none;display:inline-flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:16px;">download</span> Download Reports</a></div>
          </div>` : ''}
          ${images.length === 0 && videos.length === 0 && reports.length === 0 && driveLinks.length === 0 ? '<div class="empty-state" style="padding:24px;"><p>No media uploaded for this event.</p></div>' : ''}
        </div>

        ${driveLinks.length > 0 ? `
        <div class="detail-card">
          <h3><span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px;">add_to_drive</span> Drive Links (${driveLinks.length})</h3>
          <div class="media-list">
            ${driveLinks.map((m) => `<a href="${m.url}" target="_blank" class="media-link" style="background:var(--surface-0);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:8px;"><span class="material-symbols-outlined" style="color:#4285f4;">add_to_drive</span> <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.url.length > 60 ? m.url.substring(0,60) + '...' : m.url}</span><span class="material-symbols-outlined">open_in_new</span></a>`).join('')}
          </div>
        </div>` : ''}
      </div>

      <!-- Sidebar -->
      <div class="detail-sidebar">

        <div class="detail-card">
          <h3>Feedback Summary</h3>
          ${ev.feedbacks.length > 0 ? `
            <div style="text-align:center;padding:12px 0;">
              <div style="font-size:2.5rem;font-weight:800;color:var(--primary);">${ev.avg_rating}</div>
              <div style="font-size:0.75rem;color:var(--text-tertiary);">Average from ${ev.feedback_count} response${ev.feedback_count !== 1 ? 's' : ''}</div>
            </div>
            ${ev.feedbacks.slice(0, 3).map((f) => `
              <div style="padding:10px 0;border-top:1px solid var(--border);font-size:0.8rem;">
                <div style="color:var(--accent);font-weight:700;margin-bottom:2px;">⭐ ${f.rating}/5</div>
                ${f.suggestions ? `<p style="color:var(--text-secondary);margin-top:4px;">"${f.suggestions}"</p>` : ''}
              </div>
            `).join('')}
          ` : '<div class="empty-state" style="padding:20px;"><p>No feedback yet.</p></div>'}
        </div>
      </div>
    </div>
  `;
}

// ===== 7. REPORTS & ANALYTICS =====
async function renderReports(container, headerActions, user) {
  headerActions.innerHTML = `
    <button class="btn-icon" id="btn-refresh" title="Refresh"><span class="material-symbols-outlined">refresh</span></button>
  `;
  document.getElementById('btn-refresh')?.addEventListener('click', loadPage);

  const reports = await api.principal.getReports();

  // Totals
  const totals = reports.reduce(
    (acc, r) => ({
      events: acc.events + r.total_events,
      completed: acc.completed + r.completed,
      pending: acc.pending + r.pending,
      participants: acc.participants + r.participants,
    }),
    { events: 0, completed: 0, pending: 0, participants: 0 }
  );

  container.innerHTML = `
    <div class="metrics-grid">
      ${metricCard('summarize', reports.length, 'Departments Tracked', 'Institution-wide', '', '')}
      ${metricCard('event_available', totals.events, 'Total Events', 'All departments', '', '')}
      ${metricCard('check_circle', totals.completed, 'Total Completed', `${totals.events ? Math.round((totals.completed / totals.events) * 100) : 0}% rate`, 'accent-teal', '')}
      ${metricCard('groups', totals.participants, 'Total Participants', 'Across all events', 'accent-amber', '')}
    </div>

    <div class="table-section" style="margin-top:24px;">
      <div class="table-header">
        <div><h2>Department-wise Reports</h2><p>Completed vs Pending tracking across departments</p></div>
      </div>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Department</th>
              <th>Total Events</th>
              <th>Completed</th>
              <th>Approved</th>
              <th>Pending</th>
              <th>Rejected</th>
              <th>Participants</th>
              <th>Completion Rate</th>
            </tr>
          </thead>
          <tbody>
            ${reports.map((r) => `
              <tr class="clickable-row" onclick="window.__drillDept('${r.department_id}','${r.department_name}')">
                <td><div class="event-title">${r.department_name}</div></td>
                <td style="font-weight:700;">${r.total_events}</td>
                <td><span class="status-badge status-completed"><span class="status-dot"></span>${r.completed}</span></td>
                <td><span class="status-badge status-approved"><span class="status-dot"></span>${r.approved}</span></td>
                <td><span class="status-badge status-pending"><span class="status-dot"></span>${r.pending}</span></td>
                <td><span class="status-badge status-rejected"><span class="status-dot"></span>${r.rejected}</span></td>
                <td>${r.participants}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div class="progress-bar" style="width:80px;">
                      <div class="progress-fill teal" style="width:${r.completion_rate}%"></div>
                    </div>
                    <span style="font-weight:700;font-size:0.8rem;color:var(--secondary);">${r.completion_rate}%</span>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ===== 8. GLOBAL LOGS =====
async function renderLogs(container, headerActions, user) {
  headerActions.innerHTML = `
    <button class="btn-icon" id="btn-refresh" title="Refresh"><span class="material-symbols-outlined">refresh</span></button>
  `;
  document.getElementById('btn-refresh')?.addEventListener('click', loadPage);

  const logs = await api.principal.getLogs();

  container.innerHTML = `
    <div class="table-section">
      <div class="table-header">
        <div><h2>Global Activity Logs</h2><p>Event creation, updates, and approvals across the institution</p></div>
      </div>
      ${logs.length > 0 ? `
      <div class="logs-feed">
        ${logs.map((log) => {
          const typeClass = log.status === 'REJECTED' ? 'alert' : log.status === 'APPROVED' || log.status === 'COMPLETED' ? 'update' : 'info';
          return `
            <div class="log-entry" onclick="window.__viewEvent('${log.id}')">
              <div class="log-icon ${typeClass}">
                <span class="material-symbols-outlined">${log.icon}</span>
              </div>
              <div class="log-body">
                <div class="log-action">${log.action}</div>
                <div class="log-title">${log.title}</div>
                <div class="log-meta">
                  <span class="category-tag">${log.department}</span>
                  <span class="category-tag">${log.category}</span>
                  <span class="status-badge ${getStatusClass(log.status)}"><span class="status-dot"></span>${getStatusLabel(log.status)}</span>
                </div>
              </div>
              <div class="log-time">${formatDate(log.timestamp)}</div>
            </div>
          `;
        }).join('')}
      </div>` : `
      <div class="empty-state"><span class="material-symbols-outlined">history</span><p>No activity logs yet.</p></div>`}
    </div>
  `;
}

// =============================================
//       COMPLETE HOD MODULE PAGES
// =============================================

async function renderGenericDashboard(container, user) {
  if (user.role === 'HOD') {
    const year = pageState.academicYear || getCurrentAcademicYear();
    const dash = await api.hod.getDashboard(year);
    container.innerHTML = `
      <div style="margin-bottom:6px;"><span style="font-size:0.85rem;color:var(--text-tertiary);">Department</span>
      <h2 style="font-size:1.4rem;font-weight:800;color:var(--text-primary);margin-top:2px;">${dash.departmentName}</h2></div>
      <div class="metrics-grid">
        ${metricCard('event_available', dash.totalEvents, 'Total Events', 'Department', '', '')}
        ${metricCard('check_circle', dash.completedEvents, 'Completed', `${dash.totalEvents ? Math.round((dash.completedEvents / dash.totalEvents) * 100) : 0}%`, 'accent-teal', '')}
        ${metricCard('pending_actions', dash.pendingEvents, 'Pending Approvals', dash.pendingEvents > 0 ? 'Needs review' : 'All clear', 'accent-amber', '')}
        ${metricCard('thumb_up', dash.approvedEvents, 'Approved', 'In progress', '', '')}
        ${metricCard('category', dash.totalCategories, 'Categories', 'Created', '', '')}
        ${metricCard('groups', dash.totalParticipants, 'Participants', 'Total across events', 'accent-teal', '')}
      </div>
      <div class="insights-grid" style="margin-top:32px;">
        <div class="insights-card">
          <h3>Event Pipeline</h3>
          ${progressBar('Completed', dash.completedEvents, dash.totalEvents, 'teal')}
          ${progressBar('Approved', dash.approvedEvents, dash.totalEvents, 'indigo')}
          ${progressBar('Pending', dash.pendingEvents, dash.totalEvents, 'amber')}
          ${progressBar('Rejected', dash.rejectedEvents, dash.totalEvents, 'red')}
        </div>
        <div class="insights-card">
          <h3>Quick Actions</h3>
          <div class="quick-actions">
            <button class="quick-action-btn" onclick="window.__nav('reviews')"><span class="material-symbols-outlined">approval</span><span>Review Queue</span></button>
            <button class="quick-action-btn" onclick="window.__nav('calendar')"><span class="material-symbols-outlined">calendar_month</span><span>Calendar</span></button>
            <button class="quick-action-btn" onclick="window.__nav('logs')"><span class="material-symbols-outlined">history</span><span>Dept Logs</span></button>
          </div>
        </div>
      </div>
    `;
    return;
  }
  
  if (user.role === 'ADMIN') {
    const year = pageState.academicYear || getCurrentAcademicYear();
    const dash = await api.admin.getDashboard(year);
    // Also fetch events for the Status Tracking table
    const events = await api.admin.getEvents(year ? { year } : {});
    
    container.innerHTML = `
<!-- Hero Metrics: Bento Grid Layout -->
<section class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
  <!-- Metric Card 1 -->
  <div class="bg-surface-container-lowest dark:bg-slate-800 p-8 rounded-xl flex flex-col justify-between h-48 border-b-2 border-transparent hover:border-primary transition-all">
    <div class="flex justify-between items-start">
      <div class="bg-primary-fixed dark:bg-indigo-900/50 p-3 rounded-xl">
        <span class="material-symbols-outlined text-primary dark:text-indigo-400">event_available</span>
      </div>
      <span class="text-secondary dark:text-teal-400 text-xs font-bold uppercase tracking-widest">+</span>
    </div>
    <div>
      <p class="text-4xl font-extrabold text-on-surface dark:text-slate-100 headline">${dash.totalEvents}</p>
      <p class="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-widest">Total Events</p>
    </div>
  </div>
  <!-- Metric Card 2 -->
  <div class="bg-surface-container-lowest dark:bg-slate-800 p-8 rounded-xl flex flex-col justify-between h-48 border-b-2 border-transparent hover:border-primary transition-all">
    <div class="flex justify-between items-start">
      <div class="bg-primary-fixed dark:bg-amber-900/30 p-3 rounded-xl" style="background:var(--error-container, #ffdbd0);">
        <span class="material-symbols-outlined" style="color:var(--error, #ba1a1a);">pending_actions</span>
      </div>
      <span class="text-tertiary dark:text-amber-400 text-xs font-bold uppercase tracking-widest hidden">Urgent</span>
    </div>
    <div>
      <p class="text-4xl font-extrabold text-on-surface dark:text-slate-100 headline">${dash.pending}</p>
      <p class="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-widest">Pending Approvals</p>
    </div>
  </div>
  <!-- Metric Card 3 -->
  <div class="glass-card dark:bg-slate-800 dark:border dark:border-slate-700 p-8 rounded-xl flex flex-col justify-between h-48 shadow-sm">
    <div class="flex justify-between items-start">
      <div class="bg-secondary-container dark:bg-teal-900/30 p-3 rounded-xl">
        <span class="material-symbols-outlined text-secondary dark:text-teal-400">verified</span>
      </div>
      <span class="text-secondary dark:text-teal-400 text-xs font-bold uppercase tracking-widest">Completed</span>
    </div>
    <div>
      <p class="text-4xl font-extrabold text-on-surface dark:text-slate-100 headline">${dash.completed}</p>
      <p class="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-widest">Completed Events</p>
    </div>
  </div>
</section>

<!-- Dynamic Content: Status Tracking -->
<section class="bg-surface-container-lowest dark:bg-slate-800 rounded-xl overflow-hidden shadow-sm">
  <div class="px-8 py-6 flex justify-between items-end border-b border-surface-container dark:border-slate-700">
    <div>
      <h2 class="text-2xl font-extrabold text-on-surface dark:text-slate-100">Status Tracking</h2>
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Real-time overview of ongoing academic activities</p>
    </div>
    <div class="flex gap-2">
      <button class="text-xs font-bold uppercase tracking-widest px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="window.__nav('events')">View All</button>
      <button class="text-xs font-bold uppercase tracking-widest px-4 py-2 bg-surface-container-highest dark:bg-slate-700 text-primary dark:text-indigo-300 rounded" onclick="window.__createAdminEventModal()">+ Create Event</button>
    </div>
  </div>
  <div class="overflow-x-auto">
    <table class="w-full text-left">
      <thead class="bg-surface-container-low dark:bg-slate-900/50">
        <tr>
          <th class="px-8 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Event Title</th>
          <th class="px-8 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Venue</th>
          <th class="px-8 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Date</th>
          <th class="px-8 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Status</th>
          <th class="px-8 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-400 text-right">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-surface-container dark:divide-slate-700">
        ${events.slice(0, 4).map(ev => `
        <tr class="hover:bg-surface dark:hover:bg-slate-700/50 transition-colors group">
          <td class="px-8 py-5">
            <p class="text-sm font-bold text-indigo-950 dark:text-indigo-300 cursor-pointer" onclick="window.__adminViewEvent('${ev.id}')">${ev.title}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">ID: ${ev.id.slice(0,8)}</p>
          </td>
          <td class="px-8 py-5">
            <span class="text-xs font-medium bg-surface-container-high dark:bg-slate-700 px-3 py-1 rounded-full text-slate-700 dark:text-slate-300">${ev.venue || 'TBD'}</span>
          </td>
          <td class="px-8 py-5">
            <p class="text-sm text-on-surface dark:text-slate-200">${new Date(ev.date).toLocaleDateString()}</p>
          </td>
          <td class="px-8 py-5">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full ${ev.status === 'COMPLETED' ? 'bg-secondary dark:bg-teal-400' : ev.status === 'DRAFT' ? 'bg-slate-400' : 'bg-tertiary dark:bg-amber-500'}"></span>
              <span class="text-xs font-bold uppercase ${ev.status === 'COMPLETED' ? 'text-secondary dark:text-teal-400' : ev.status === 'DRAFT' ? 'text-slate-500 dark:text-slate-400' : 'text-tertiary dark:text-amber-500'}">${ev.status.replace('_', ' ')}</span>
            </div>
          </td>
          <td class="px-8 py-5 text-right">
            <button class="text-slate-400 hover:text-primary dark:hover:text-indigo-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 p-2 rounded-full" onclick="window.__adminViewEvent('${ev.id}')" title="Details">
              <span class="material-symbols-outlined text-lg">visibility</span>
            </button>
          </td>
        </tr>
        `).join('')}
        ${events.length === 0 ? `<tr><td colspan="5" class="px-8 py-8 text-center text-slate-500">No events found. Let's create one!</td></tr>` : ''}
      </tbody>
    </table>
  </div>
</section>

    `;
    return;
  }
}

// ===== HOD 2. CATEGORY MANAGEMENT =====
async function renderHodCategories(container, headerActions, user) {
  headerActions.innerHTML = `
    <button class="btn-primary" id="btn-add-cat"><span class="material-symbols-outlined">add</span> New Category</button>
    <button class="btn-outline" id="btn-bulk-cat"><span class="material-symbols-outlined">upload_file</span> Bulk Upload</button>
    <button class="btn-icon" id="btn-refresh" title="Refresh"><span class="material-symbols-outlined">refresh</span></button>
  `;
  document.getElementById('btn-add-cat')?.addEventListener('click', showAddCategoryModal);
  document.getElementById('btn-bulk-cat')?.addEventListener('click', showBulkUploadModal);
  document.getElementById('btn-refresh')?.addEventListener('click', loadPage);

  const categories = await api.hod.getCategories();
  const totalSubs = categories.reduce((s, c) => s + (c.subcategories || []).length, 0);

  container.innerHTML = `
    <div class="metrics-grid" style="margin-bottom:24px;">
      ${metricCard('category', categories.length, 'Categories', 'Total', '', '')}
      ${metricCard('label', totalSubs, 'Subcategories', 'Total', '', '')}
    </div>
    <div class="table-section">
      <div class="table-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div><h2>Categories & Subcategories</h2><p>${categories.length} categories, ${totalSubs} subcategories in your department</p></div>
        <div style="position:relative;"><span class="material-symbols-outlined" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);font-size:18px;pointer-events:none;">search</span><input type="text" placeholder="Search categories..." onkeyup="window.__filterTable(this)" style="padding:8px 12px 8px 36px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-0);color:var(--text-primary);font-size:0.85rem;width:220px;" /></div>
      </div>
      ${categories.length > 0 ? `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Category</th><th>Subcategories</th><th style="text-align:right;">Actions</th></tr></thead>
          <tbody>
            ${categories.map((cat) => `
              <tr>
                <td>
                  <div class="event-title">${cat.name}</div>
                  <div class="event-id">ID: ${cat.id.slice(0, 8)} · ${(cat.subcategories || []).length} subcategories</div>
                </td>
                <td>
                  <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
                    ${(cat.subcategories || []).length > 0
                      ? cat.subcategories.map((s) => `
                        <span class="category-tag" style="margin:0;display:inline-flex;align-items:center;gap:4px;">
                          ${s.name}
                          <span class="material-symbols-outlined" style="font-size:12px;cursor:pointer;opacity:0.6;" 
                            onclick="window.__editSubcat('${s.id}','${s.name.replace(/'/g, "\\'")}')">edit</span>
                          <span class="material-symbols-outlined" style="font-size:12px;cursor:pointer;opacity:0.6;color:var(--error);" 
                            onclick="window.__deleteSubcat('${s.id}','${s.name.replace(/'/g, "\\'")}')">close</span>
                        </span>
                      `).join('')
                      : '<span style="font-size:0.8rem;color:var(--text-tertiary);font-style:italic;">No subcategories</span>'}
                  </div>
                </td>
                <td style="text-align:right;">
                  <div style="display:flex;gap:6px;justify-content:flex-end;">
                    <button class="btn-outline" style="font-size:0.75rem;" onclick="window.__addSubcat('${cat.id}','${cat.name.replace(/'/g, "\\'")}')">
                      <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">add</span> Sub
                    </button>
                    <button class="btn-outline" style="font-size:0.75rem;" onclick="window.__editCat('${cat.id}','${cat.name.replace(/'/g, "\\'")}')">
                      <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">edit</span> Edit
                    </button>
                    <button class="btn-reject" style="font-size:0.75rem;" onclick="window.__deleteCat('${cat.id}','${cat.name.replace(/'/g, "\\'")}')">
                      <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>` : `
      <div class="empty-state"><span class="material-symbols-outlined">category</span><p>No categories yet. Create one or use Bulk Upload.</p></div>`}
    </div>
  `;
}

function showAddCategoryModal() {
  openModal(`
    <div class="modal-header">
      <div><h2>New Category</h2><p>e.g. Academic, Technical, Cultural</p></div>
      <button class="modal-close" onclick="window.__closeModal()"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label for="cat-name">Category Name</label>
        <input type="text" id="cat-name" placeholder="e.g. Technical" required />
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="window.__closeModal()">Cancel</button>
      <button class="btn-primary" id="btn-submit-cat">Create Category</button>
    </div>
  `);
  document.getElementById('btn-submit-cat').addEventListener('click', async () => {
    const name = document.getElementById('cat-name').value.trim();
    if (!name) return showToast('Name is required', 'error');
    try { await api.hod.createCategory(name); showToast('Category created!', 'success'); closeModal(); loadPage(); }
    catch (err) { showToast(err.message, 'error'); }
  });
}

function showBulkUploadModal() {
  openModal(`
    <div class="modal-header">
      <div><h2>Bulk Upload Categories</h2><p>Add multiple categories at once with optional subcategories</p></div>
      <button class="modal-close" onclick="window.__closeModal()"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <div class="form-group" style="display:flex; justify-content:space-between; align-items:center;">
        <label style="margin:0;">Upload from CSV:</label>
        <button class="btn-outline" style="padding:4px 8px; font-size:0.8rem;" onclick="window.__downloadCategoryCsvTemplate()">Download Template</button>
      </div>
      <div class="form-group" style="margin-bottom: 20px;">
        <input type="file" id="csv-upload" accept=".csv" style="display:block; width:100%; border:1px dashed var(--border); padding:10px; border-radius:var(--radius-md); background:var(--bg-secondary);" />
        <small style="color:var(--text-tertiary); display:block; margin-top:4px;">Upload a CSV file to automatically populate the text area below.</small>
      </div>
      <div class="form-group">
        <label for="bulk-text">Or paste categories manually (Format: Category: Sub1, Sub2)</label>
        <textarea id="bulk-text" rows="8" placeholder="Academic: Workshop, Seminar, Guest Lecture
Technical: Hackathon, Coding Contest, Project Expo
Cultural: Dance, Music, Drama
Sports
Social Service" style="width:100%;font-family:monospace;font-size:0.85rem;resize:vertical;"></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="window.__closeModal()">Cancel</button>
      <button class="btn-primary" id="btn-submit-bulk">Upload Categories</button>
    </div>
  `);

  document.getElementById('csv-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const lines = text.split('\n');
      let output = [];
      for (let i = 1; i < lines.length; i++) { // Skip header
        let line = lines[i].trim();
        if (!line) continue;
        let cat = '';
        let subs = '';
        // Basic CSV parsing handling quotes
        if (line.includes('"')) {
          const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
          cat = parts[0]?.replace(/^"|"$/g, '').trim() || '';
          subs = parts[1]?.replace(/^"|"$/g, '').trim() || '';
        } else {
          const parts = line.split(',');
          cat = parts.shift()?.trim() || '';
          subs = parts.join(',').trim() || '';
        }
        if (cat) {
          output.push(cat + (subs ? ': ' + subs : ''));
        }
      }
      if (output.length > 0) {
        const tb = document.getElementById('bulk-text');
        tb.value = (tb.value.trim() ? tb.value.trim() + '\n' : '') + output.join('\n');
        showToast('CSV loaded successfully', 'success');
      } else {
        showToast('No valid categories found in CSV', 'error');
      }
      e.target.value = ''; // reset file input
    };
    reader.readAsText(file);
  });

  document.getElementById('btn-submit-bulk').addEventListener('click', async () => {
    const text = document.getElementById('bulk-text').value.trim();
    if (!text) return showToast('Paste categories first', 'error');

    const lines = text.split('\n').filter(l => l.trim());
    const categories = lines.map(line => {
      const parts = line.split(':');
      const name = parts[0].trim();
      const subcategories = parts.length > 1
        ? parts[1].split(',').map(s => s.trim()).filter(Boolean)
        : [];
      return { name, subcategories };
    }).filter(c => c.name);

    if (categories.length === 0) return showToast('No valid categories found', 'error');

    const btn = document.getElementById('btn-submit-bulk');
    btn.disabled = true;
    btn.textContent = 'Uploading...';

    try {
      const res = await api.hod.bulkUploadCategories(categories);
      showToast(res.message, 'success');
      closeModal();
      loadPage();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Upload Categories';
    }
  });
}

function showEditCategoryModal(id, currentName) {
  openModal(`
    <div class="modal-header">
      <div><h2>Edit Category</h2><p>Rename "${currentName}"</p></div>
      <button class="modal-close" onclick="window.__closeModal()"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label for="edit-cat-name">Category Name</label>
        <input type="text" id="edit-cat-name" value="${currentName}" required />
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="window.__closeModal()">Cancel</button>
      <button class="btn-primary" id="btn-save-cat">Save Changes</button>
    </div>
  `);
  document.getElementById('edit-cat-name').select();
  document.getElementById('btn-save-cat').addEventListener('click', async () => {
    const name = document.getElementById('edit-cat-name').value.trim();
    if (!name) return showToast('Name is required', 'error');
    try { await api.hod.editCategory(id, name); showToast('Category updated!', 'success'); closeModal(); loadPage(); }
    catch (err) { showToast(err.message, 'error'); }
  });
}

function showEditSubcategoryModal(id, currentName) {
  openModal(`
    <div class="modal-header">
      <div><h2>Edit Subcategory</h2><p>Rename "${currentName}"</p></div>
      <button class="modal-close" onclick="window.__closeModal()"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label for="edit-subcat-name">Subcategory Name</label>
        <input type="text" id="edit-subcat-name" value="${currentName}" required />
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="window.__closeModal()">Cancel</button>
      <button class="btn-primary" id="btn-save-subcat">Save Changes</button>
    </div>
  `);
  document.getElementById('edit-subcat-name').select();
  document.getElementById('btn-save-subcat').addEventListener('click', async () => {
    const name = document.getElementById('edit-subcat-name').value.trim();
    if (!name) return showToast('Name is required', 'error');
    try { await api.hod.editSubcategory(id, name); showToast('Subcategory updated!', 'success'); closeModal(); loadPage(); }
    catch (err) { showToast(err.message, 'error'); }
  });
}

function showAddSubcategoryModal(categoryId, categoryName) {
  openModal(`
    <div class="modal-header">
      <div><h2>New Subcategory</h2><p>Under: ${categoryName}</p></div>
      <button class="modal-close" onclick="window.__closeModal()"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label for="subcat-name">Subcategory Name</label>
        <input type="text" id="subcat-name" placeholder="e.g. Workshop, Hackathon" required />
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="window.__closeModal()">Cancel</button>
      <button class="btn-primary" id="btn-submit-subcat">Create Subcategory</button>
    </div>
  `);
  document.getElementById('btn-submit-subcat').addEventListener('click', async () => {
    const name = document.getElementById('subcat-name').value.trim();
    if (!name) return showToast('Name is required', 'error');
    try { await api.hod.createSubcategory(name, categoryId); showToast('Subcategory created!', 'success'); closeModal(); loadPage(); }
    catch (err) { showToast(err.message, 'error'); }
  });
}

// ===== HOD 3. EVENT REVIEW QUEUE =====
async function renderHodReviews(container, headerActions, user) {
  headerActions.innerHTML = `<button class="btn-icon" id="btn-refresh" title="Refresh"><span class="material-symbols-outlined">refresh</span></button>`;
  document.getElementById('btn-refresh')?.addEventListener('click', loadPage);

  const targetYear = pageState.academicYear || getCurrentAcademicYear();
  const events = await api.hod.getEvents({ status: 'PENDING_APPROVAL', year: targetYear });

  container.innerHTML = `
    <div class="table-section">
      <div class="table-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div><h2>Review Queue</h2><p>${events.length} events pending your approval</p></div>
        <div style="position:relative;"><span class="material-symbols-outlined" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);font-size:18px;pointer-events:none;">search</span><input type="text" placeholder="Search events..." onkeyup="window.__filterTable(this)" style="padding:8px 12px 8px 36px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-0);color:var(--text-primary);font-size:0.85rem;width:220px;" /></div>
      </div>
      ${events.length > 0 ? `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Event</th><th>Category</th><th>Date</th><th>Venue</th><th style="text-align:right;">Actions</th></tr></thead>
          <tbody>
            ${events.map((ev) => `
              <tr>
                <td>
                  <div class="event-title" style="cursor:pointer;" onclick="window.__hodViewEvent('${ev.id}')">${ev.title}</div>
                  <div class="event-id">ID: ${ev.id.slice(0, 8)}</div>
                </td>
                <td><span class="category-tag">${ev.categories?.name || '—'}</span></td>
                <td style="white-space:nowrap;">${formatDate(ev.date)}</td>
                <td style="font-size:0.8rem;color:var(--text-secondary);">${ev.venue || '—'}</td>
                <td style="text-align:right;">
                  <div style="display:flex;gap:6px;justify-content:flex-end;">
                    <button class="btn-outline" onclick="window.__hodViewEvent('${ev.id}')" style="font-size:0.75rem;">
                      <span class="material-symbols-outlined" style="font-size:14px;">visibility</span> View
                    </button>
                    <button class="btn-approve" onclick="window.__approveEvent('${ev.id}')">Approve</button>
                    <button class="btn-reject" onclick="window.__rejectEvent('${ev.id}')">Reject</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>` : `
      <div class="empty-state"><span class="material-symbols-outlined">done_all</span><p>All caught up! No events pending approval.</p></div>`}
    </div>
  `;
}

// ===== HOD 4. GLOBAL EVENTS (all departments, no participant list) =====
async function renderHodGlobalEvents(container, headerActions, user) {
  const departments = await api.hod.getDepartments();
  let filterDept = pageState.filterDept || '';
  let filterStatus = pageState.filterStatus || '';

  headerActions.innerHTML = `
    <select id="ge-dept-filter" class="filter-select">
      <option value="">All Departments</option>
      ${departments.map((d) => `<option value="${d.id}" ${filterDept === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
    </select>
    <select id="ge-status-filter" class="filter-select">
      <option value="">All Statuses</option>
      <option value="APPROVED" ${filterStatus === 'APPROVED' ? 'selected' : ''}>Approved</option>
      <option value="COMPLETED" ${filterStatus === 'COMPLETED' ? 'selected' : ''}>Completed</option>
      <option value="PENDING_APPROVAL" ${filterStatus === 'PENDING_APPROVAL' ? 'selected' : ''}>Pending</option>
    </select>
    <button class="btn-icon" id="btn-refresh" title="Refresh"><span class="material-symbols-outlined">refresh</span></button>
  `;

  const events = await api.hod.getGlobalEvents({ department_id: filterDept || undefined, status: filterStatus || undefined, year: pageState.academicYear || getCurrentAcademicYear() });

  container.innerHTML = `
    <div class="table-section">
      <div class="table-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div><h2>Global Events</h2><p>${events.length} events across all departments</p></div>
        <div style="position:relative;"><span class="material-symbols-outlined" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);font-size:18px;pointer-events:none;">search</span><input type="text" placeholder="Search events..." onkeyup="window.__filterTable(this)" style="padding:8px 12px 8px 36px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-0);color:var(--text-primary);font-size:0.85rem;width:220px;" /></div>
      </div>
      ${events.length > 0 ? `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Event</th><th>Department</th><th>Category</th><th>Date</th><th>Status</th><th style="text-align:right;">Action</th></tr></thead>
          <tbody>
            ${events.map((ev) => `
              <tr>
                <td><div class="event-title">${ev.title}</div></td>
                <td><span class="category-tag">${ev.departments?.name || '—'}</span></td>
                <td><span class="category-tag">${ev.categories?.name || '—'}</span></td>
                <td style="white-space:nowrap;">${formatDate(ev.date)}</td>
                <td><span class="status-badge ${getStatusClass(ev.status)}"><span class="status-dot"></span>${getStatusLabel(ev.status)}</span></td>
                <td style="text-align:right;">
                  <button class="btn-outline" onclick="window.__hodViewEvent('${ev.id}')">
                    <span class="material-symbols-outlined" style="font-size:14px;">visibility</span> View
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>` : `
      <div class="empty-state"><span class="material-symbols-outlined">public</span><p>No events found.</p></div>`}
    </div>
  `;

  const applyFilters = () => {
    pageState = { ...pageState, filterDept: document.getElementById('ge-dept-filter').value, filterStatus: document.getElementById('ge-status-filter').value };
    loadPage();
  };
  document.getElementById('ge-dept-filter').addEventListener('change', applyFilters);
  document.getElementById('ge-status-filter').addEventListener('change', applyFilters);
  document.getElementById('btn-refresh')?.addEventListener('click', loadPage);
}

// ===== HOD 5. MY DEPARTMENT EVENTS (full access) =====
async function renderGenericEvents(container, headerActions, user) {
  let filterStatus = pageState.filterStatus || '';

  headerActions.innerHTML = `
    ${user.role === 'ADMIN' ? `<button class="btn-primary" onclick="window.__createAdminEventModal()" style="margin-right: 8px;"><span class="material-symbols-outlined">add</span> Create Event</button>` : ''}
    <select id="de-status-filter" class="filter-select">
      <option value="">All Statuses</option>
      <option value="DRAFT" ${filterStatus === 'DRAFT' ? 'selected' : ''}>Draft</option>
      <option value="PENDING_APPROVAL" ${filterStatus === 'PENDING_APPROVAL' ? 'selected' : ''}>Pending</option>
      <option value="APPROVED" ${filterStatus === 'APPROVED' ? 'selected' : ''}>Approved</option>
      <option value="COMPLETED" ${filterStatus === 'COMPLETED' ? 'selected' : ''}>Completed</option>
      <option value="REJECTED" ${filterStatus === 'REJECTED' ? 'selected' : ''}>Rejected</option>
    </select>
    <button class="btn-icon" id="btn-refresh" title="Refresh"><span class="material-symbols-outlined">refresh</span></button>
  `;

  let events = [];
  const targetYear = pageState.academicYear || getCurrentAcademicYear();
  if (user.role === 'ADMIN') {
    events = await api.admin.getEvents({ status: filterStatus || undefined, year: targetYear });
  } else {
    events = await api.hod.getEvents({ status: filterStatus || undefined, year: targetYear });
  }

  container.innerHTML = `
    <div class="table-section">
      <div class="table-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div><h2>${user.role === 'ADMIN' ? 'My Assigned Events' : 'My Department Events'}</h2><p>${events.length} events</p></div>
        <div style="position:relative;"><span class="material-symbols-outlined" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);font-size:18px;pointer-events:none;">search</span><input type="text" placeholder="Search events..." onkeyup="window.__filterTable(this)" style="padding:8px 12px 8px 36px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-0);color:var(--text-primary);font-size:0.85rem;width:220px;" /></div>
      </div>
      ${events.length > 0 ? `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Event</th><th>Category</th><th>Date</th><th>Venue</th><th>Status</th><th style="text-align:right;">Actions</th></tr></thead>
          <tbody>
            ${events.map((ev) => `
              <tr>
                <td>
                  <div class="event-title" style="cursor:pointer;" onclick="window.${user.role === 'ADMIN' ? '__adminViewEvent' : '__hodViewEvent'}('${ev.id}')">${ev.title}</div>
                  <div class="event-id">ID: ${ev.id.slice(0, 8)}</div>
                </td>
                <td><span class="category-tag">${ev.categories?.name || '—'}</span></td>
                <td style="white-space:nowrap;">${formatDate(ev.date)}</td>
                <td style="font-size:0.8rem;color:var(--text-secondary);">${ev.venue || '—'}</td>
                <td><span class="status-badge ${getStatusClass(ev.status)}"><span class="status-dot"></span>${getStatusLabel(ev.status)}</span></td>
                <td style="text-align:right;">
                  <div style="display:flex;gap:6px;justify-content:flex-end;">
                    <button class="btn-outline" onclick="window.${user.role === 'ADMIN' ? '__adminViewEvent' : '__hodViewEvent'}('${ev.id}')">
                      <span class="material-symbols-outlined" style="font-size:14px;">visibility</span> Details
                    </button>
                    ${user.role === 'HOD' ? `
                      ${ev.status === 'PENDING_APPROVAL' ? `
                        <button class="btn-approve" onclick="window.__approveEvent('${ev.id}')">Approve</button>
                        <button class="btn-reject" onclick="window.__rejectEvent('${ev.id}')">Reject</button>
                      ` : ''}
                      ${ev.status === 'APPROVED' ? `
                        <button class="btn-outline" style="color:var(--success);border-color:var(--success);" onclick="window.__verifyEvent('${ev.id}','VERIFY')">
                          <span class="material-symbols-outlined" style="font-size:14px;">verified</span> Verify
                        </button>
                      ` : ''}
                    ` : ''}
                    ${user.role === 'ADMIN' ? `
                      ${ev.status === 'DRAFT' || ev.status === 'REJECTED' ? `
                        <button class="btn-reject" onclick="window.__deleteAdminEvent('${ev.id}')"><span class="material-symbols-outlined" style="font-size:14px;">delete</span></button>
                        <button class="btn-approve" onclick="window.__submitForApproval('${ev.id}')">Submit to HOD</button>
                      ` : ''}
                      ${ev.status === 'APPROVED' ? `
                        <button class="btn-outline" style="color:var(--success);border-color:var(--success);" onclick="window.__markCompleted('${ev.id}')">
                          <span class="material-symbols-outlined" style="font-size:14px;">task_alt</span> Complete
                        </button>
                      ` : ''}
                    ` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>` : `
      <div class="empty-state">
        <span class="material-symbols-outlined">event_busy</span>
        <p>No events found.</p>
        ${user.role === 'ADMIN' ? `<button class="btn-primary" style="margin-top:12px;" onclick="window.__createAdminEventModal()">Create Event</button>` : ''}
      </div>`}
    </div>
  `;

  document.getElementById('de-status-filter').addEventListener('change', () => {
    pageState = { ...pageState, filterStatus: document.getElementById('de-status-filter').value };
    loadPage();
  });
  document.getElementById('btn-refresh')?.addEventListener('click', loadPage);
}

// ===== HOD 6. DEPARTMENT LOGS =====
async function renderHodLogs(container) {
  const year = pageState.academicYear || getCurrentAcademicYear();
  const logs = await api.hod.getLogs(year);
  
  container.innerHTML = `
    <div class="max-w-4xl mx-auto py-6">
      <div class="flex items-center justify-between mb-8">
        <div>
          <h2 class="text-2xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">Department Logs</h2>
          <p class="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Chronological history of event modifications</p>
        </div>
        <div class="bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 px-4 py-2 rounded-lg text-sm font-bold shadow-sm">
          ${logs.length} Records ${year ? `in ${year}` : ''}
        </div>
      </div>

      ${logs.length > 0 ? `
      <div class="relative pl-6 border-l-2 border-slate-200 dark:border-slate-700/50 space-y-8">
        ${logs.map((log) => `
          <div class="relative group">
            <div class="absolute -left-[35px] top-1 h-6 w-6 rounded-full bg-slate-100 dark:bg-slate-800 border-[3px] border-white dark:border-slate-900 flex items-center justify-center text-indigo-500 shadow-sm transition-transform group-hover:scale-110">
              <span class="material-symbols-outlined" style="font-size: 14px;">${log.icon}</span>
            </div>
            <div class="bg-surface-container dark:bg-slate-800/80 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800 transition-all hover:shadow-md hover:border-indigo-100 dark:hover:border-indigo-900/50">
              <div class="flex items-start justify-between gap-4 mb-2">
                <h3 class="text-lg font-bold text-slate-800 dark:text-slate-200 leading-tight">${log.title}</h3>
                <span class="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap bg-slate-100 dark:bg-slate-900 px-3 py-1 rounded-full">${formatDate(log.timestamp)}</span>
              </div>
              <div class="flex items-center flex-wrap gap-2 mt-3">
                <span class="px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-md border border-slate-200 dark:border-slate-600">${log.action}</span>
                <span class="px-2.5 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-transparent border border-slate-200 dark:border-slate-700 rounded-md">${log.category}</span>
                <span class="px-2.5 py-1 text-xs font-bold rounded-md bg-transparent border ${getStatusBadgeColor(log.status)}">${getStatusLabel(log.status)}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>` : `
      <div class="flex flex-col items-center justify-center py-24 text-center bg-surface-container dark:bg-slate-800/50 rounded-3xl border border-slate-100 dark:border-slate-800 border-dashed">
        <div class="w-20 h-20 bg-slate-100 dark:bg-slate-900 rounded-full flex items-center justify-center mb-6">
          <span class="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600">history</span>
        </div>
        <h3 class="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">No logs found</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 max-w-sm">There are no operational event logs recorded for your department ${year ? `in ${year}` : 'yet'}.</p>
      </div>`}
    </div>
  `;
}

function getStatusBadgeColor(status) {
  switch (status) {
    case 'APPROVED': return 'border-teal-200 text-teal-700 dark:border-teal-900 dark:text-teal-400';
    case 'REJECTED': return 'border-red-200 text-red-700 dark:border-red-900 dark:text-red-400';
    case 'COMPLETED': return 'border-indigo-200 text-indigo-700 dark:border-indigo-900 dark:text-indigo-400';
    case 'DRAFT': return 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-400';
    default: return 'border-amber-200 text-amber-700 dark:border-amber-900/60 dark:text-amber-400';
  }
}

// ===== HOD 7. EVENT VERIFICATION =====
async function renderHodVerification(container, headerActions, user) {
  headerActions.innerHTML = `<button class="btn-icon" id="btn-refresh" title="Refresh"><span class="material-symbols-outlined">refresh</span></button>`;
  document.getElementById('btn-refresh')?.addEventListener('click', loadPage);

  const targetYear = pageState.academicYear || getCurrentAcademicYear();
  const events = await api.hod.getEvents({ status: 'APPROVED', year: targetYear });

  container.innerHTML = `
    <div class="table-section">
      <div class="table-header"><div><h2>Event Verification</h2><p>Verify approved events before sending to Principal</p></div></div>
      ${events.length > 0 ? `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Event</th><th>Category</th><th>Date</th><th>Status</th><th style="text-align:right;">Actions</th></tr></thead>
          <tbody>
            ${events.map((ev) => `
              <tr>
                <td>
                  <div class="event-title" style="cursor:pointer;" onclick="window.__hodViewEvent('${ev.id}')">${ev.title}</div>
                  <div class="event-id">ID: ${ev.id.slice(0, 8)}</div>
                </td>
                <td><span class="category-tag">${ev.categories?.name || '—'}</span></td>
                <td style="white-space:nowrap;">${formatDate(ev.date)}</td>
                <td><span class="status-badge ${getStatusClass(ev.status)}"><span class="status-dot"></span>${getStatusLabel(ev.status)}</span></td>
                <td style="text-align:right;">
                  <div style="display:flex;gap:6px;justify-content:flex-end;">
                    <button class="btn-outline" onclick="window.__hodViewEvent('${ev.id}')">
                      <span class="material-symbols-outlined" style="font-size:14px;">visibility</span> Review
                    </button>
                    <button class="btn-approve" onclick="window.__verifyEvent('${ev.id}','VERIFY')">
                      <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">verified</span> Verify ✅
                    </button>
                    <button class="btn-reject" onclick="window.__verifyEvent('${ev.id}','REJECT')">
                      <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">cancel</span> Reject ❌
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>` : `
      <div class="empty-state"><span class="material-symbols-outlined">verified</span><p>No approved events awaiting verification.</p></div>`}
    </div>
  `;
}

// ===== HOD 8. EVENT DETAIL (with AI) =====
async function renderHodEventDetail(container, headerActions, user) {
  const { eventId } = pageState;
  if (!eventId) return navigateTo('events');

  headerActions.innerHTML = `<button class="btn-outline" id="btn-back"><span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">arrow_back</span> Back</button>`;
  document.getElementById('btn-back')?.addEventListener('click', () => navigateTo(pageState.backTo || 'events'));

  const ev = await api.hod.getEventDetails(eventId);
  document.getElementById('header-title').textContent = ev.title || 'Event Details';

  const isDrive = (u) => u && (u.includes('drive.google.com') || u.includes('docs.google.com'));
  const images = (ev.media || []).filter((m) => m.type === 'IMAGE' && !isDrive(m.url));
  const videos = (ev.media || []).filter((m) => m.type === 'VIDEO' && !isDrive(m.url));
  const reports = (ev.media || []).filter((m) => m.type === 'REPORT_PDF' && !isDrive(m.url));
  const driveLinks = (ev.media || []).filter((m) => isDrive(m.url));

  container.innerHTML = `
    <div class="detail-grid">
      <div class="detail-main">
        <!-- Event Info -->
        <div class="detail-card">
          <h2>${ev.title}</h2>
          <div class="detail-meta">
            <span class="status-badge ${getStatusClass(ev.status)}"><span class="status-dot"></span>${getStatusLabel(ev.status)}</span>
            <span class="detail-meta-item"><span class="material-symbols-outlined">calendar_today</span>${formatDate(ev.date)}</span>
            <span class="detail-meta-item"><span class="material-symbols-outlined">location_on</span>${ev.venue || '—'}</span>
          </div>
          <div class="detail-section">
            <h4>Details</h4>
            <div class="detail-info-grid">
              <div class="detail-info-item"><span class="detail-label">Department</span><span class="detail-value">${ev.departments?.name || '—'}</span></div>
              <div class="detail-info-item"><span class="detail-label">Category</span><span class="detail-value">${ev.categories?.name || '—'}</span></div>
              <div class="detail-info-item"><span class="detail-label">Subcategory</span><span class="detail-value">${ev.subcategories?.name || '—'}</span></div>
              <div class="detail-info-item"><span class="detail-label">Target</span><span class="detail-value">${ev.target_count || '—'}</span></div>
              <div class="detail-info-item"><span class="detail-label">Participants</span><span class="detail-value">${ev.participant_count}</span></div>
              <div class="detail-info-item"><span class="detail-label">Rating</span><span class="detail-value">${ev.avg_rating ? '⭐ ' + ev.avg_rating + '/5' : '—'}</span></div>
            </div>
          </div>
          ${ev.guests ? `<div class="detail-section"><h4>Guests / Speakers</h4><p style="font-size:0.85rem;color:var(--text-secondary);">${ev.guests}</p></div>` : ''}
        </div>

        <!-- Participants (own dept only) -->
        ${ev.is_own_dept ? `
        <div class="detail-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <h3 style="margin:0;"><span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px;">groups</span> Participants (${ev.participant_count})</h3>
            ${ev.participants.length > 0 ? `<button class="btn-outline" style="padding:4px 12px;font-size:0.75rem;" onclick="window.__downloadParticipantsFromData(${JSON.stringify(ev.participants).replace(/'/g,'\\u0027').replace(/"/g,'&quot;')}, '${ev.title}')">
              <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">download</span> CSV
            </button>` : ''}
          </div>
          ${ev.participants.length > 0 ? `
          <div style="overflow-x:auto;">
            <table class="data-table compact">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Department</th><th>Year</th></tr></thead>
              <tbody>
                ${ev.participants.map((p) => `
                  <tr>
                    <td style="font-weight:600;">${p.name}</td>
                    <td style="font-size:0.8rem;color:var(--text-secondary);">${p.email}</td>
                    <td style="font-size:0.8rem;">${p.phone || '—'}</td>
                    <td style="font-size:0.8rem;">${p.department || '—'}</td>
                    <td style="font-size:0.8rem;">${p.year || '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>` : '<div class="empty-state" style="padding:24px;"><p>No participants registered.</p></div>'}
        </div>` : `
        <div class="detail-card">
          <h3><span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px;">groups</span> Participants</h3>
          <div style="padding:16px;background:var(--accent-surface);border-radius:var(--radius-md);font-size:0.85rem;color:var(--accent);">
            <strong>${ev.participant_count} participants</strong> — Participant list is only visible for your own department's events.
          </div>
        </div>`}

        <!-- Media -->
        <div class="detail-card">
          <h3><span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px;">perm_media</span> Media Gallery</h3>
          ${images.length > 0 ? `<div class="detail-section"><h4>🖼️ Images (${images.length})</h4><div class="media-grid">${images.map((m) => `<a href="${m.url}" target="_blank" class="media-item"><img src="${m.url}" alt="Event image" /><span class="material-symbols-outlined media-download">open_in_new</span></a>`).join('')}</div><div style="margin-top:8px;"><a href="${images[0].url}" download style="color:var(--primary);font-size:0.8rem;text-decoration:none;display:inline-flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:16px;">download</span> Download Images</a></div></div>` : ''}
          ${videos.length > 0 ? `<div class="detail-section"><h4>🎥 Videos (${videos.length})</h4><div class="media-list">${videos.map((m) => `<a href="${m.url}" target="_blank" class="media-link"><span class="material-symbols-outlined">play_circle</span> ${m.url.split('/').pop() || 'Video'}<span class="material-symbols-outlined">open_in_new</span></a>`).join('')}</div><div style="margin-top:8px;"><a href="${videos[0].url}" download style="color:var(--primary);font-size:0.8rem;text-decoration:none;display:inline-flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:16px;">download</span> Download Videos</a></div></div>` : ''}
          ${reports.length > 0 ? `<div class="detail-section"><h4>📄 Reports (${reports.length})</h4><div class="media-list">${reports.map((m) => `<a href="${m.url}" target="_blank" class="media-link"><span class="material-symbols-outlined">description</span> ${m.url.split('/').pop() || 'Report'}<span class="material-symbols-outlined">open_in_new</span></a>`).join('')}</div><div style="margin-top:8px;"><a href="${reports[0].url}" download style="color:var(--primary);font-size:0.8rem;text-decoration:none;display:inline-flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:16px;">download</span> Download Reports</a></div></div>` : ''}
          ${images.length === 0 && videos.length === 0 && reports.length === 0 && driveLinks.length === 0 ? '<div class="empty-state" style="padding:24px;"><p>No media uploaded.</p></div>' : ''}
        </div>

        ${driveLinks.length > 0 ? `
        <div class="detail-card">
          <h3><span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px;">add_to_drive</span> Drive Links (${driveLinks.length})</h3>
          <div class="media-list">
            ${driveLinks.map((m) => `<a href="${m.url}" target="_blank" class="media-link" style="background:var(--surface-0);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:8px;"><span class="material-symbols-outlined" style="color:#4285f4;">add_to_drive</span> <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.url.length > 60 ? m.url.substring(0,60) + '...' : m.url}</span><span class="material-symbols-outlined">open_in_new</span></a>`).join('')}
          </div>
        </div>` : ''}
      </div>

      <!-- Sidebar -->
      <div class="detail-sidebar">


        <!-- Actions (own dept) -->
        ${ev.is_own_dept ? `
        <div class="detail-card">
          <h3>Actions</h3>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
            ${ev.status === 'PENDING_APPROVAL' ? `
              <button class="btn-approve" style="width:100%;justify-content:center;" onclick="window.__approveEvent('${ev.id}')">Approve Event</button>
              <button class="btn-reject" style="width:100%;justify-content:center;" onclick="window.__rejectEvent('${ev.id}')">Reject Event</button>
            ` : ''}
            ${ev.status === 'APPROVED' ? `
              <button class="btn-approve" style="width:100%;justify-content:center;" onclick="window.__verifyEvent('${ev.id}','VERIFY')">✅ Verify & Complete</button>
              <button class="btn-reject" style="width:100%;justify-content:center;" onclick="window.__verifyEvent('${ev.id}','REJECT')">❌ Reject & Send Back</button>
            ` : ''}
          </div>
        </div>` : ''}

        <!-- Feedback -->
        ${ev.is_own_dept && ev.feedbacks.length > 0 ? `
        <div class="detail-card">
          <h3>Feedback (${ev.feedback_count})</h3>
          <div style="text-align:center;padding:12px 0;">
            <div style="font-size:2.5rem;font-weight:800;color:var(--primary);">${ev.avg_rating}</div>
            <div style="font-size:0.75rem;color:var(--text-tertiary);">Average from ${ev.feedback_count} responses</div>
          </div>
          ${ev.feedbacks.slice(0, 3).map((f) => `
            <div style="padding:10px 0;border-top:1px solid var(--border);font-size:0.8rem;">
              <div style="color:var(--accent);font-weight:700;">⭐ ${f.rating}/5</div>
              ${f.suggestions ? `<p style="color:var(--text-secondary);margin-top:4px;">"${f.suggestions}"</p>` : ''}
            </div>
          `).join('')}
        </div>` : ''}
      </div>
    </div>
  `;
}

// ===== HOD: ADMIN USER MANAGEMENT =====
async function renderHodAdminMgmt(container, headerActions, user) {
  headerActions.innerHTML = `
    <button class="btn-primary" id="btn-add-admin"><span class="material-symbols-outlined">person_add</span> Create Admin</button>
    <button class="btn-icon" id="btn-refresh" title="Refresh"><span class="material-symbols-outlined">refresh</span></button>
  `;
  document.getElementById('btn-add-admin')?.addEventListener('click', showCreateAdminModal);
  document.getElementById('btn-refresh')?.addEventListener('click', loadPage);

  const admins = await api.hod.getAdmins();

  container.innerHTML = `
    <div class="table-section">
      <div class="table-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div><h2>Admin Users</h2><p>${admins.length} admin${admins.length !== 1 ? 's' : ''} in your department</p></div>
        <div style="position:relative;"><span class="material-symbols-outlined" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);font-size:18px;pointer-events:none;">search</span><input type="text" placeholder="Search admins..." onkeyup="window.__filterTable(this)" style="padding:8px 12px 8px 36px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-0);color:var(--text-primary);font-size:0.85rem;width:220px;" /></div>
      </div>
      ${admins.length > 0 ? `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Created</th><th style="text-align:right;">Actions</th></tr></thead>
          <tbody>
            ${admins.map((a) => `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:34px;height:34px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;">${a.name.charAt(0).toUpperCase()}</div>
                    <div><div class="event-title">${a.name}</div><div class="event-id">ID: ${a.id.slice(0, 8)}</div></div>
                  </div>
                </td>
                <td style="font-size:0.85rem;color:var(--text-secondary);">${a.email}</td>
                <td style="font-size:0.8rem;white-space:nowrap;">${formatDate(a.created_at)}</td>
                <td style="text-align:right;">
                  <button class="btn-reject" style="font-size:0.75rem;" onclick="window.__deleteAdmin('${a.id}','${a.name}')">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">delete</span> Remove
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>` : `
      <div class="empty-state">
        <span class="material-symbols-outlined">admin_panel_settings</span>
        <p>No admins in your department yet. Create an admin to get started.</p>
      </div>`}
    </div>
  `;
}

function showCreateAdminModal() {
  openModal(`
    <div class="modal-header">
      <div><h2>Create Admin Account</h2><p>Add an event coordinator to your department</p></div>
      <button class="modal-close" onclick="window.__closeModal()"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label for="admin-name">Full Name</label>
        <input type="text" id="admin-name" placeholder="e.g. John Doe" required />
      </div>
      <div class="form-group">
        <label for="admin-email">Email Address</label>
        <input type="email" id="admin-email" placeholder="e.g. john@college.edu" required />
      </div>
      <div class="form-group">
        <label for="admin-password">Password</label>
        <div style="position:relative;width:100%;">
          <input type="password" id="admin-password" placeholder="Min 6 characters" required style="padding-right:40px;" />
          <span class="material-symbols-outlined pw-toggle" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--text-tertiary);font-size:18px;user-select:none;">visibility_off</span>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="window.__closeModal()">Cancel</button>
      <button class="btn-primary" id="btn-submit-admin">Create Admin Account</button>
    </div>
  `);

  document.getElementById('btn-submit-admin').addEventListener('click', async () => {
    const name = document.getElementById('admin-name').value.trim();
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;

    if (!name || !email || !password) return showToast('All fields are required', 'error');
    if (password.length < 6) return showToast('Password must be at least 6 characters', 'error');

    const btn = document.getElementById('btn-submit-admin');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      await api.hod.createAdmin(name, email, password);
      showToast(`Admin account created! Email: ${email}`, 'success');
      closeModal();
      loadPage();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Create Admin Account';
    }
  });
}

// ===== ADMIN EVENT DETAIL & FORM BUILDER =====
async function renderAdminEventDetail(container, headerActions, user) {
  const eventId = pageState.eventId;
  if (!eventId) return window.__nav('events');

  headerActions.innerHTML = `
    <button class="btn-outline" onclick="window.__nav('events')">
      <span class="material-symbols-outlined" style="font-size:16px;">arrow_back</span> Back
    </button>
    <button class="btn-icon" id="btn-refresh" title="Refresh"><span class="material-symbols-outlined">refresh</span></button>
  `;

  const details = await api.admin.getEventDetails(eventId);

  const activeTab = pageState.activeTab || 'overview';
  
  const setupTabHandler = () => {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        pageState.activeTab = e.target.dataset.tab;
        loadPage();
      });
    });
  };

  const isApprovedOrCompleted = details.status === 'APPROVED' || details.status === 'COMPLETED';
  const lockedStyle = !isApprovedOrCompleted ? 'opacity:0.4;pointer-events:none;cursor:not-allowed;' : '';
  const lockedTitle = !isApprovedOrCompleted ? 'title="Available after HOD approval"' : '';

  const tabsHtml = `
    <div class="tabs-header flex flex-wrap items-center gap-3 mb-6">
      <button type="button" class="tab-btn px-5 py-2.5 text-sm font-bold tracking-wide rounded border transition-all duration-200 ${activeTab === 'overview' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-surface-container border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600'}" data-tab="overview">Overview</button>
      <button type="button" class="tab-btn px-5 py-2.5 text-sm font-bold tracking-wide rounded border transition-all duration-200 ${activeTab === 'forms' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-surface-container border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600'}" data-tab="forms" style="${lockedStyle}" ${lockedTitle}>Form Builder</button>
      <button type="button" class="tab-btn px-5 py-2.5 text-sm font-bold tracking-wide rounded border transition-all duration-200 ${activeTab === 'execution' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-surface-container border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600'}" data-tab="execution" style="${lockedStyle}" ${lockedTitle}>Execution (${details.participantCount})</button>
      <button type="button" class="tab-btn px-5 py-2.5 text-sm font-bold tracking-wide rounded border transition-all duration-200 ${activeTab === 'media' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-surface-container border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600'}" data-tab="media" style="${lockedStyle}" ${lockedTitle}>Media & Reports</button>
    </div>
    ${!isApprovedOrCompleted && (activeTab === 'forms' || activeTab === 'execution' || activeTab === 'media') ? '<div style="background:var(--accent-surface);border:1px solid var(--accent);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:8px;"><span class="material-symbols-outlined" style="color:var(--accent);font-size:18px;">lock</span><span style="font-size:0.85rem;color:var(--accent);font-weight:600;">This section is locked until the HOD approves the event.</span></div>' : ''}
  `;

  let contentHtml = '';

  if (activeTab === 'overview') {
    contentHtml = `
      <div class="detail-grid">
        <div class="detail-card info-card">
          <div class="info-header" style="display:flex; justify-content:space-between; align-items:start;">
            <div>
              <span class="status-badge ${getStatusClass(details.status)}" style="margin-bottom:8px; display:inline-block;">${getStatusLabel(details.status)}</span>
              <h2>${details.title}</h2>
              <div class="info-meta">
                <span class="material-symbols-outlined">calendar_today</span> ${formatDate(details.date)}
                <span class="material-symbols-outlined" style="margin-left:12px;">location_on</span> ${details.venue || 'TBA'}
              </div>
            </div>
            ${details.status === 'DRAFT' || details.status === 'REJECTED' ? `
               <div style="display:flex; gap:8px;">
                 <button class="btn-reject" onclick="window.__deleteAdminEvent('${details.id}')"><span class="material-symbols-outlined" style="font-size:16px;">delete</span> Delete</button>
                 <button class="btn-outline" onclick="window.__editAdminEventModal('${details.id}')"><span class="material-symbols-outlined" style="font-size:16px;">edit</span> Edit Draft</button>
                 <button class="btn-primary" onclick="window.__submitForApproval('${details.id}')">Submit for Approval</button>
               </div>
            ` : details.status === 'APPROVED' ? `
               <button class="btn-primary" style="background:var(--success);" onclick="window.__markCompleted('${details.id}')"><span class="material-symbols-outlined">task_alt</span> Mark Completed</button>
            ` : ''}
          </div>
          <div class="info-body" style="margin-top:20px; display:grid; grid-template-columns:1fr 1fr; gap:16px;">
             <div><strong>Category:</strong> ${details.categories?.name}</div>
             <div><strong>Subcategory:</strong> ${details.subcategories?.name}</div>
             <div><strong>Target Count:</strong> ${details.target_count || 0} participants</div>
             <div><strong>Guests/Speakers:</strong> ${details.guests || 'None'}</div>
          </div>
        </div>
      </div>
    `;
  } else if (activeTab === 'forms') {
    const regForm = details.forms.find(f => f.type === 'REGISTRATION');
    const fbForm = details.forms.find(f => f.type === 'FEEDBACK');

    const isCompleted = details.status === 'COMPLETED';
    const fbClosed = fbForm && !fbForm.is_active;

    contentHtml = `
      <div class="metrics-grid">
        <div class="detail-card" style="position:relative;">
          ${isCompleted ? '<div style="position:absolute;top:12px;right:12px;background:var(--error);color:#fff;padding:4px 12px;border-radius:var(--radius-full);font-size:0.7rem;font-weight:700;letter-spacing:0.05em;z-index:2;">CLOSED</div>' : ''}
          <h3 style="margin-bottom:12px; display:flex; justify-content:space-between;">Registration Form
            ${regForm ? `<span class="status-badge ${regForm.is_active && !isCompleted ? 'status-approved' : 'status-rejected'}">${regForm.is_active && !isCompleted ? 'Open' : 'Closed'}</span>` : ''}
          </h3>
          ${regForm ? `
            <div style="background:var(--bg-secondary); padding:8px; border-radius:4px; font-family:monospace; font-size:0.8rem; margin-bottom:12px; word-break:break-all;${isCompleted ? 'opacity:0.5;' : ''}">
              ${window.location.origin}/?form=${regForm.link_hash}
            </div>
            <div style="display:flex; gap:8px; margin-bottom:12px;">
              <button class="btn-outline" style="flex:1;${isCompleted ? 'opacity:0.4;pointer-events:none;' : ''}" onclick="navigator.clipboard.writeText('${window.location.origin}/?form=${regForm.link_hash}'); showToast('Link copied!')">Copy Link</button>
              <button class="btn-outline" style="flex:1;" onclick="window.__downloadParticipantsCSV('${details.id}')"><span class="material-symbols-outlined" style="font-size:16px;">download</span> CSV</button>
            </div>
            ${isCompleted ? '<div style="padding:10px;background:var(--error-surface);border:1px solid var(--error);border-radius:var(--radius-md);text-align:center;margin-bottom:12px;font-size:0.85rem;font-weight:600;color:var(--error);">Registration closed — Event completed</div>' : `<button class="btn-${regForm.is_active ? 'reject' : 'primary'}" style="width:100%; margin-bottom:12px;" onclick="window.__toggleFormStatus('${details.id}', 'REGISTRATION', ${!regForm.is_active})">${regForm.is_active ? 'Close Registration' : 'Open Registration'}</button>`}
          ` : '<p style="color:var(--text-tertiary); margin-bottom:12px;">Not created yet.</p>'}
          ${!isCompleted ? `<button class="btn-outline" style="width:100%;" onclick="window.__openFormBuilder('${details.id}', 'REGISTRATION')"><span class="material-symbols-outlined">edit</span> Configure Form</button>` : ''}
        </div>
        
        <div class="detail-card" style="position:relative;">
          ${fbClosed ? '<div style="position:absolute;top:12px;right:12px;background:var(--error);color:#fff;padding:4px 12px;border-radius:var(--radius-full);font-size:0.7rem;font-weight:700;letter-spacing:0.05em;z-index:2;">CLOSED</div>' : ''}
          <h3 style="margin-bottom:12px; display:flex; justify-content:space-between;">Feedback Form
            ${fbForm ? `<span class="status-badge ${fbForm.is_active ? 'status-approved' : 'status-rejected'}">${fbForm.is_active ? 'Open' : 'Closed'}</span>` : ''}
          </h3>
          ${fbForm ? `
            <div style="background:var(--bg-secondary); padding:8px; border-radius:4px; font-family:monospace; font-size:0.8rem; margin-bottom:12px; word-break:break-all;${fbClosed ? 'opacity:0.5;' : ''}">
              ${window.location.origin}/?form=${fbForm.link_hash}
            </div>
            <div style="display:flex; gap:8px; margin-bottom:12px;">
              <button class="btn-outline" style="flex:1;${fbClosed ? 'opacity:0.4;pointer-events:none;' : ''}" onclick="navigator.clipboard.writeText('${window.location.origin}/?form=${fbForm.link_hash}'); showToast('Link copied!')">Copy Link</button>
              <button class="btn-outline" style="flex:1;" onclick="window.__downloadFeedbackCSV('${details.id}')"><span class="material-symbols-outlined" style="font-size:16px;">download</span> CSV</button>
            </div>
            ${fbClosed ? '<div style="padding:10px;background:var(--error-surface);border:1px solid var(--error);border-radius:var(--radius-md);text-align:center;margin-bottom:12px;font-size:0.85rem;font-weight:600;color:var(--error);">Feedback form closed</div>' : `<button class="btn-${fbForm.is_active ? 'reject' : 'primary'}" style="width:100%; margin-bottom:12px;" onclick="window.__toggleFormStatus('${details.id}', 'FEEDBACK', ${!fbForm.is_active})">${fbForm.is_active ? 'Close Feedback' : 'Open Feedback'}</button>`}
          ` : '<p style="color:var(--text-tertiary); margin-bottom:12px;">Not created yet.</p>'}
          ${!fbClosed ? `<button class="btn-outline" style="width:100%;" onclick="window.__openFormBuilder('${details.id}', 'FEEDBACK')"><span class="material-symbols-outlined">edit</span> Configure Form</button>` : ''}
        </div>
      </div>
    `;
  } else if (activeTab === 'execution') {
    const participants = await api.admin.getParticipants(details.id);
    contentHtml = `
      <div class="table-section">
        <div class="table-header">
           <div><h2>Participants</h2><p>${participants.length} registered</p></div>
        </div>
        ${participants.length > 0 ? `
          <div style="overflow-x:auto;">
            <table class="data-table">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Status</th></tr></thead>
              <tbody>
                ${participants.map(p => `
                  <tr>
                    <td><div style="font-weight:600; color:var(--text-primary);">${p.name}</div>
                        ${p.department ? `<div style="font-size:0.75rem; color:var(--text-secondary);">${p.department} ${p.year ? `(Yr ${p.year})` : ''}</div>` : ''}
                    </td>
                    <td>${p.email}</td>
                    <td>${p.phone || '—'}</td>
                    <td><span class="status-badge status-completed" style="font-size:0.75rem;"><span class="status-dot"></span> Registered</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `<div class="empty-state"><p>No participants registered yet.</p></div>`}
      </div>
    `;
  } else if (activeTab === 'media') {
    const isDrive = (u) => u && (u.includes('drive.google.com') || u.includes('docs.google.com'));
    const images = details.media.filter(m => m.type === 'IMAGE' && !isDrive(m.url));
    const videos = details.media.filter(m => m.type === 'VIDEO' && !isDrive(m.url));
    const reports = details.media.filter(m => m.type === 'REPORT_PDF' && !isDrive(m.url));
    const driveLinks = details.media.filter(m => isDrive(m.url));
    
    const mediaItem = (m, icon, iconColor, label) => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border:1px solid var(--border); border-radius:var(--radius-md); margin-bottom:8px; background:var(--surface-0);">
         <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
           <span class="material-symbols-outlined" style="color:${iconColor};font-size:22px;">${icon}</span>
           <a href="${m.url}" target="_blank" style="color:var(--text-primary); text-decoration:none; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${label}</a>
         </div>
         <div style="display:flex; gap:6px; flex-shrink:0;">
           <a href="${m.url}" target="_blank" style="color:var(--primary);cursor:pointer;" title="Open"><span class="material-symbols-outlined" style="font-size:18px;">open_in_new</span></a>
           <button onclick="window.__deleteMedia('${m.id}')" style="background:none;border:none;color:var(--error);cursor:pointer;" title="Delete"><span class="material-symbols-outlined" style="font-size:18px;">delete</span></button>
         </div>
      </div>`;

    contentHtml = `
      <div class="detail-card" style="margin-bottom:24px;">
        <h3>Upload Post-Event Media</h3>
        <p style="color:var(--text-secondary); margin-bottom:16px; font-size:0.9rem;">Upload files directly or paste web URLs (Google Drive, Imgur, etc.).</p>
        <div style="display:flex; flex-direction:column; gap:12px;">
           <div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">
               <div style="margin:0; width:150px;">
                 <label style="display:block; font-size:0.75rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px;">Type</label>
                 <select id="media-type" style="width:100%; padding:10px 14px; background:var(--surface-1); border:1px solid var(--border); border-radius:var(--radius-md); color:var(--text-primary); font-size:0.85rem;">
                   <option value="IMAGE">Image</option>
                   <option value="VIDEO">Video</option>
                   <option value="REPORT_PDF">Report (PDF)</option>
                 </select>
               </div>
               <div style="margin:0; flex:1; min-width:200px;">
                 <label style="display:block; font-size:0.75rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px;">Select File(s)</label>
                 <input type="file" id="media-file" multiple accept="image/*,video/*,application/pdf" style="width:100%; padding:8px 14px; background:var(--surface-1); border:1px solid var(--border); border-radius:var(--radius-md); color:var(--text-primary); font-size:0.85rem;" />
               </div>
               <div style="margin:0; flex:1; min-width:200px;">
                 <label style="display:block; font-size:0.75rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px;">Or Web URL(s) (Comma separated)</label>
                 <input type="text" id="media-url" placeholder="https://drive.google.com/..." style="width:100%; padding:10px 14px; background:var(--surface-1); border:1px solid var(--border); border-radius:var(--radius-md); color:var(--text-primary); font-size:0.85rem;" />
               </div>
           </div>
           <button class="btn-primary" style="align-self:flex-end;" onclick="window.__uploadMedia('${details.id}')">Add Media</button>
        </div>
      </div>
      
      <div class="detail-grid">
        <div class="detail-card">
          <h3 style="margin-bottom:16px;">📄 Reports (${reports.length})</h3>
          ${reports.length > 0 ? reports.map(r => mediaItem(r, 'picture_as_pdf', 'var(--error)', 'View Report')).join('') : '<p style="color:var(--text-tertiary);">No reports uploaded.</p>'}
        </div>
        <div class="detail-card">
          <h3 style="margin-bottom:16px;">🖼️ Images (${images.length})</h3>
          ${images.length > 0 ? images.map(i => mediaItem(i, 'image', 'var(--info)', 'View Image')).join('') : '<p style="color:var(--text-tertiary);">No images uploaded.</p>'}
        </div>
        <div class="detail-card">
          <h3 style="margin-bottom:16px;">🎥 Videos (${videos.length})</h3>
          ${videos.length > 0 ? videos.map(v => mediaItem(v, 'play_circle', 'var(--success)', 'View Video')).join('') : '<p style="color:var(--text-tertiary);">No videos uploaded.</p>'}
        </div>
        ${driveLinks.length > 0 ? `
        <div class="detail-card">
          <h3 style="margin-bottom:16px;display:flex;align-items:center;gap:8px;"><span class="material-symbols-outlined" style="color:#4285f4;">add_to_drive</span> Drive Links (${driveLinks.length})</h3>
          ${driveLinks.map(d => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:8px;background:var(--surface-0);">
              <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                <span class="material-symbols-outlined" style="color:#4285f4;font-size:22px;">add_to_drive</span>
                <a href="${d.url}" target="_blank" style="color:var(--text-primary);text-decoration:none;font-size:0.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${d.url.length > 50 ? d.url.substring(0,50) + '...' : d.url}</a>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0;">
                <a href="${d.url}" target="_blank" style="color:var(--primary);cursor:pointer;" title="Open"><span class="material-symbols-outlined" style="font-size:18px;">open_in_new</span></a>
                <button onclick="window.__deleteMedia('${d.id}')" style="background:none;border:none;color:var(--error);cursor:pointer;" title="Delete"><span class="material-symbols-outlined" style="font-size:18px;">delete</span></button>
              </div>
            </div>
          `).join('')}
        </div>` : ''}
      </div>
    `;
  }

  container.innerHTML = tabsHtml + contentHtml;
  setupTabHandler();
  document.getElementById('btn-refresh')?.addEventListener('click', loadPage);
}

// ===== PUBLIC FORM COMPONENTS =====
async function renderPublicForm(hash) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="loading-spinner"><div class="spinner"></div></div>`;
  
  try {
    const formConfig = await api.public.getFormConfig(hash);
    
    // Build fields HTML based on formConfig.fields JSON
    // Default fallback fields if formConfig.fields is empty or basic
    // In our dynamic builder, fields would be: [{name: 'email', label:'Email', type:'email', required:true}, ...]
    // Google Forms-style inline CSS
    const gfInput = 'width:100%;padding:12px 14px;font-size:0.95rem;border:1px solid #dadce0;border-radius:8px;background:#fff;color:#202124;outline:none;transition:border-color 0.2s;box-sizing:border-box;';
    const gfLabel = 'display:block;font-size:0.85rem;font-weight:500;color:#202124;margin-bottom:6px;';
    const gfCard = 'background:#fff;border:1px solid #dadce0;border-radius:12px;padding:24px;margin-bottom:16px;';
    const gfReq = 'color:#d93025;margin-left:2px;';

    if (formConfig.type === 'REGISTRATION') {
      fieldsHtml = `
        <div style="${gfCard}">
          <label style="${gfLabel}">Email Address <span style="${gfReq}">*</span></label>
          <div style="display:flex;gap:8px;">
            <input type="email" id="pf-email" required style="${gfInput}flex:1;" onfocus="this.style.borderColor='#673ab7'" onblur="this.style.borderColor='#dadce0'" />
            <button type="button" id="btn-send-otp" style="padding:10px 20px;background:#673ab7;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:0.85rem;cursor:pointer;white-space:nowrap;">Send OTP</button>
          </div>
        </div>
        <div id="otp-section" style="display:none;">
          <div style="${gfCard}">
            <label style="${gfLabel}">Enter OTP <span style="${gfReq}">*</span></label>
            <div style="display:flex;gap:8px;">
              <input type="text" id="pf-otp" maxlength="6" placeholder="6-digit code" style="${gfInput}flex:1;letter-spacing:6px;font-size:1.2rem;text-align:center;" onfocus="this.style.borderColor='#673ab7'" onblur="this.style.borderColor='#dadce0'" />
              <button type="button" id="btn-verify-otp" style="padding:10px 20px;background:#673ab7;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:0.85rem;cursor:pointer;white-space:nowrap;">Verify</button>
            </div>
            <p id="otp-status" style="font-size:0.8rem;margin-top:8px;color:#5f6368;"></p>
          </div>
        </div>
        <div id="remaining-fields" style="display:none;">
          <div style="${gfCard}border-left:4px solid #34a853;background:#f6fef6;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="material-symbols-outlined" style="color:#34a853;font-size:20px;">verified</span>
              <span style="font-size:0.9rem;font-weight:600;color:#34a853;">Email verified successfully!</span>
            </div>
          </div>
          <div style="${gfCard}"><label style="${gfLabel}">Full Name <span style="${gfReq}">*</span></label><input type="text" id="pf-name" required style="${gfInput}" onfocus="this.style.borderColor='#673ab7'" onblur="this.style.borderColor='#dadce0'" /></div>
          <div style="${gfCard}"><label style="${gfLabel}">Phone Number</label><input type="tel" id="pf-phone" style="${gfInput}" onfocus="this.style.borderColor='#673ab7'" onblur="this.style.borderColor='#dadce0'" /></div>
          <div style="display:flex;gap:16px;">
            <div style="${gfCard}flex:1;"><label style="${gfLabel}">Department</label><input type="text" id="pf-dept" style="${gfInput}" onfocus="this.style.borderColor='#673ab7'" onblur="this.style.borderColor='#dadce0'" /></div>
            <div style="${gfCard}flex:1;"><label style="${gfLabel}">Year</label><input type="text" id="pf-year" style="${gfInput}" onfocus="this.style.borderColor='#673ab7'" onblur="this.style.borderColor='#dadce0'" /></div>
          </div>
        </div>
      `;
    } else {
      fieldsHtml = `
        <div style="${gfCard}"><label style="${gfLabel}">Email Address <span style="${gfReq}">*</span></label><input type="email" id="pf-email" required placeholder="Email you registered with" style="${gfInput}" onfocus="this.style.borderColor='#673ab7'" onblur="this.style.borderColor='#dadce0'" /></div>
        <div style="${gfCard}">
          <label style="${gfLabel}">Rate this event <span style="${gfReq}">*</span></label>
          <select id="pf-rating" required style="${gfInput}cursor:pointer;">
            <option value="5">⭐⭐⭐⭐⭐ Excellent</option>
            <option value="4">⭐⭐⭐⭐ Good</option>
            <option value="3">⭐⭐⭐ Average</option>
            <option value="2">⭐⭐ Poor</option>
            <option value="1">⭐ Terrible</option>
          </select>
        </div>
        <div style="${gfCard}"><label style="${gfLabel}">What did you like?</label><textarea id="pf-quality" rows="3" style="${gfInput}resize:vertical;" onfocus="this.style.borderColor='#673ab7'" onblur="this.style.borderColor='#dadce0'"></textarea></div>
        <div style="${gfCard}"><label style="${gfLabel}">Suggestions for improvement</label><textarea id="pf-suggest" rows="3" style="${gfInput}resize:vertical;" onfocus="this.style.borderColor='#673ab7'" onblur="this.style.borderColor='#dadce0'"></textarea></div>
      `;
    }

    // Append any dynamic custom fields
    if (Array.isArray(formConfig.fields)) {
      formConfig.fields.forEach((f, idx) => {
        fieldsHtml += `
          <div style="${gfCard}${formConfig.type === 'REGISTRATION' ? 'display:none;' : ''}" ${formConfig.type === 'REGISTRATION' ? 'data-custom-field="true"' : ''}>
            <label style="${gfLabel}">${f.label} ${f.required ? `<span style="${gfReq}">*</span>` : ''}</label>
            ${f.type === 'textarea' ? `<textarea id="pf-custom-${idx}" rows="2" ${f.required ? 'required' : ''} style="${gfInput}resize:vertical;" onfocus="this.style.borderColor='#673ab7'" onblur="this.style.borderColor='#dadce0'"></textarea>` : `<input type="${f.type || 'text'}" id="pf-custom-${idx}" ${f.required ? 'required' : ''} style="${gfInput}" onfocus="this.style.borderColor='#673ab7'" onblur="this.style.borderColor='#dadce0'" />`}
          </div>
        `;
      });
    }

    const submitBtnLabel = formConfig.type === 'REGISTRATION' ? 'Submit Registration' : 'Submit Feedback';
    const isReg = formConfig.type === 'REGISTRATION';

    app.innerHTML = `
      <div style="min-height:100vh;background:#f0ebf8;font-family:'Google Sans','Inter',system-ui,sans-serif;">
        <div style="max-width:640px;margin:0 auto;padding:24px 16px 48px;">
          <!-- Header Card -->
          <div style="background:#fff;border:1px solid #dadce0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
            <div style="height:10px;background:linear-gradient(90deg,#673ab7,#9c27b0,#e91e63);"></div>
            <div style="padding:28px 24px;">
              <h1 style="font-size:1.6rem;font-weight:400;color:#202124;margin:0 0 4px;">${formConfig.event.title}</h1>
              <p style="font-size:0.9rem;color:#673ab7;font-weight:500;margin:0 0 16px;">${isReg ? 'Event Registration' : 'Event Feedback'}</p>
              <div style="display:flex;gap:20px;font-size:0.8rem;color:#5f6368;">
                <span><span class="material-symbols-outlined" style="font-size:14px;vertical-align:text-bottom;margin-right:4px;">calendar_today</span>${formatDate(formConfig.event.date)}</span>
                <span><span class="material-symbols-outlined" style="font-size:14px;vertical-align:text-bottom;margin-right:4px;">location_on</span>${formConfig.event.venue || 'TBA'}</span>
              </div>
              <p style="font-size:0.75rem;color:#d93025;margin-top:16px;margin-bottom:0;">* Indicates required question</p>
            </div>
          </div>
          <!-- Form -->
          <form id="public-form">
            ${fieldsHtml}
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
              <button type="submit" id="btn-submit-form" style="padding:12px 32px;background:#673ab7;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:0.95rem;cursor:pointer;${isReg ? 'display:none;' : ''}">${submitBtnLabel}</button>
              <span style="font-size:0.75rem;color:#5f6368;">Never submit passwords</span>
            </div>
          </form>
        </div>
      </div>
    `;

    let emailVerified = formConfig.type !== 'REGISTRATION'; // Feedback doesn't need OTP

    // OTP flow for registration forms
    if (formConfig.type === 'REGISTRATION') {
      document.getElementById('btn-send-otp').addEventListener('click', async () => {
        const email = document.getElementById('pf-email').value;
        if (!email) return alert('Please enter your email address.');
        const btn = document.getElementById('btn-send-otp');
        btn.disabled = true;
        btn.textContent = 'Sending...';
        try {
          await api.public.sendOtp(hash, email);
          document.getElementById('otp-section').style.display = 'block';
          document.getElementById('otp-status').textContent = 'OTP sent! Check your email inbox (and spam folder).';
          document.getElementById('otp-status').style.color = 'var(--success)';
          btn.textContent = 'Resend OTP';
          btn.disabled = false;
        } catch (err) {
          document.getElementById('otp-status').textContent = err.message;
          document.getElementById('otp-status').style.color = 'var(--error)';
          document.getElementById('otp-section').style.display = 'block';
          btn.textContent = 'Send OTP';
          btn.disabled = false;
        }
      });

      document.getElementById('btn-verify-otp').addEventListener('click', async () => {
        const email = document.getElementById('pf-email').value;
        const otp = document.getElementById('pf-otp').value;
        if (!otp || otp.length !== 6) return alert('Please enter the 6-digit OTP.');
        const btn = document.getElementById('btn-verify-otp');
        btn.disabled = true;
        btn.textContent = 'Verifying...';
        try {
          await api.public.verifyOtp(hash, email, otp);
          emailVerified = true;
          // Lock email field
          document.getElementById('pf-email').readOnly = true;
          document.getElementById('pf-email').style.opacity = '0.6';
          document.getElementById('btn-send-otp').style.display = 'none';
          document.getElementById('otp-section').style.display = 'none';
          // Show remaining fields
          document.getElementById('remaining-fields').style.display = 'block';
          document.getElementById('btn-submit-form').style.display = 'block';
          // Show custom fields
          document.querySelectorAll('[data-custom-field]').forEach(el => { el.style.display = 'block'; });
        } catch (err) {
          document.getElementById('otp-status').textContent = err.message;
          document.getElementById('otp-status').style.color = 'var(--error)';
          btn.textContent = 'Verify';
          btn.disabled = false;
        }
      });
    }

    // For feedback forms, show submit button immediately (already visible)

    document.getElementById('public-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!emailVerified) return alert('Please verify your email with OTP first.');
      const btn = document.getElementById('btn-submit-form');
      btn.disabled = true;
      btn.textContent = 'Submitting...';

      try {
        const payload = {};
        if (formConfig.type === 'REGISTRATION') {
          payload.name = document.getElementById('pf-name').value;
          payload.email = document.getElementById('pf-email').value;
          payload.phone = document.getElementById('pf-phone').value;
          payload.department = document.getElementById('pf-dept').value;
          payload.year = document.getElementById('pf-year').value;
        } else {
          payload.email = document.getElementById('pf-email').value;
          payload.rating = document.getElementById('pf-rating').value;
          payload.quality = document.getElementById('pf-quality').value;
          payload.suggestions = document.getElementById('pf-suggest').value;
        }

        // Catch custom fields
        if (Array.isArray(formConfig.fields)) {
          formConfig.fields.forEach((f, idx) => {
             payload[f.name || `custom_${idx}`] = document.getElementById(`pf-custom-${idx}`).value;
          });
        }

        const res = await api.public.submitForm(hash, payload);
        
        app.innerHTML = `
          <div style="min-height:100vh;background:#f0ebf8;display:flex;align-items:center;justify-content:center;padding:24px;font-family:'Google Sans','Inter',sans-serif;">
            <div style="background:#fff;border:1px solid #dadce0;border-radius:12px;padding:48px 40px;text-align:center;max-width:460px;width:100%;">
              <div style="width:64px;height:64px;border-radius:50%;background:#e8f5e9;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
                <span class="material-symbols-outlined" style="font-size:32px;color:#34a853;">check_circle</span>
              </div>
              <h2 style="font-size:1.4rem;font-weight:400;color:#202124;margin-bottom:8px;">${isReg ? 'Registration' : 'Feedback'} Submitted!</h2>
              <p style="color:#5f6368;font-size:0.9rem;line-height:1.6;">${res.message}</p>
              <p style="color:#80868b;font-size:0.8rem;margin-top:20px;">You may close this tab now.</p>
            </div>
          </div>
        `;
      } catch (err) {
        alert(err.message || 'Error submitting form');
        btn.disabled = false;
        btn.textContent = `${submitBtnLabel}`;
      }
    });

  } catch (err) {
    app.innerHTML = `
      <div style="min-height:100vh;background:#f0ebf8;display:flex;align-items:center;justify-content:center;padding:24px;font-family:'Google Sans','Inter',sans-serif;">
        <div style="background:#fff;border:1px solid #dadce0;border-radius:12px;padding:48px 40px;text-align:center;max-width:460px;width:100%;">
          <div style="width:64px;height:64px;border-radius:50%;background:#fce8e6;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
            <span class="material-symbols-outlined" style="font-size:32px;color:#d93025;">error</span>
          </div>
          <h2 style="font-size:1.4rem;font-weight:400;color:#202124;margin-bottom:8px;">Form Unavailable</h2>
          <p style="color:#5f6368;font-size:0.9rem;line-height:1.6;">${err.message}</p>
          <p style="color:#80868b;font-size:0.8rem;margin-top:20px;">Please check the link or contact the event organizer.</p>
        </div>
      </div>
    `;
  }
}


// =============================================
//       SHARED COMPONENTS
// =============================================

function metricCard(icon, value, label, badge, accentClass = '', extra = '') {
  return `
    <div class="metric-card ${accentClass}">
      <div class="metric-top">
        <div class="metric-icon"><span class="material-symbols-outlined">${icon}</span></div>
        <span class="metric-badge">${badge}</span>
      </div>
      <div>
        <div class="metric-value">${value}</div>
        <div class="metric-label">${label}</div>
      </div>
      ${extra}
    </div>`;
}

function progressBar(label, value, total, color) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return `
    <div class="progress-row">
      <div class="progress-label"><span>${label}</span><span style="color:var(--${color === 'red' ? 'error' : color === 'teal' ? 'secondary' : color === 'amber' ? 'accent' : 'primary'});">${pct}% (${value})</span></div>
      <div class="progress-bar"><div class="progress-fill ${color}" style="width:${pct}%"></div></div>
    </div>`;
}

// =============================================
//       HOD: CATEGORY SCHEDULING PAGE
// =============================================

async function renderHodScheduling(container, headerActions, user) {
  const ay = pageState.academicYear || getCurrentAcademicYear();

  headerActions.innerHTML = `<button class="btn-icon" id="btn-refresh" title="Refresh"><span class="material-symbols-outlined">refresh</span></button>`;
  document.getElementById('btn-refresh')?.addEventListener('click', loadPage);

  const [categories, schedules] = await Promise.all([
    api.hod.getCategories(),
    api.hod.getSchedules(ay),
  ]);

  // Calculate stats
  const totalScheduled = schedules.length;
  const completed = schedules.filter(s => s.computed_status === 'COMPLETED').length;
  const completedLate = schedules.filter(s => s.computed_status === 'COMPLETED_LATE').length;
  const missed = schedules.filter(s => s.computed_status === 'MISSED').length;
  const upcoming = schedules.filter(s => s.computed_status === 'UPCOMING').length;

  // Build subcategory options from categories
  const subcatOptionsMap = {};
  categories.forEach(c => {
    subcatOptionsMap[c.id] = (c.subcategories || []).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  });

  // Academic year months (Sep -> Aug): month numbers in order
  const ayMonths = [9,10,11,12,1,2,3,4,5,6,7,8];

  // Build timeline
  const timelineCells = ayMonths.map(m => {
    const monthSchedules = schedules.filter(s => s.scheduled_month === m);
    const worstStatus = monthSchedules.length === 0 ? '' :
      monthSchedules.some(s => s.computed_status === 'MISSED') ? 'MISSED' :
      monthSchedules.some(s => s.computed_status === 'COMPLETED_LATE') ? 'COMPLETED_LATE' :
      monthSchedules.some(s => s.computed_status === 'UPCOMING') ? 'UPCOMING' : 'COMPLETED';
    return `<div class="timeline-cell ${worstStatus ? getScheduleStatusClass(worstStatus) : ''}" title="${MONTH_NAMES[m-1]}: ${monthSchedules.length} scheduled">
      <div class="timeline-month">${MONTH_NAMES[m-1]}</div>
      <div class="timeline-count">${monthSchedules.length}</div>
    </div>`;
  }).join('');

  container.innerHTML = `
    <!-- Stats Cards -->
    <div class="metrics-grid">
      ${metricCard('event_repeat', totalScheduled, 'Total Scheduled', academicYearLabel(ay), '')}
      ${metricCard('check_circle', completed, 'Completed On Time', `${totalScheduled ? Math.round(completed/totalScheduled*100) : 0}%`, 'accent-teal')}
      ${metricCard('schedule', completedLate, 'Completed Late', '', '')}
      ${metricCard('cancel', missed, 'Missed', '', 'accent-red')}
    </div>

    <!-- Timeline -->
    <div class="table-section" style="margin-bottom:24px; padding:20px;">
      <h3 style="margin-bottom:16px;">
        <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px;">timeline</span>
        Academic Year Timeline — ${academicYearLabel(ay)}
      </h3>
      <div class="schedule-timeline">${timelineCells}</div>
      <div style="display:flex;gap:16px;margin-top:12px;font-size:0.7rem;color:var(--text-tertiary);">
        <span><span class="sched-dot sched-completed"></span> Completed</span>
        <span><span class="sched-dot sched-late"></span> Completed Late</span>
        <span><span class="sched-dot sched-missed"></span> Missed</span>
        <span><span class="sched-dot sched-upcoming"></span> Upcoming</span>
      </div>
    </div>

    <!-- Schedule Creator -->
    <div class="detail-card" style="margin-bottom:24px;">
      <h3><span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px;">add_circle</span> Create New Schedule</h3>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-top:16px;">
        <div class="form-group" style="margin:0;flex:1;min-width:160px;">
          <label style="color:var(--text-secondary);">Category</label>
          <select id="sched-category" style="width:100%;padding:10px 14px;background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-size:0.85rem;">
            <option value="">— Select —</option>
            ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;flex:1;min-width:160px;">
          <label style="color:var(--text-secondary);">Subcategory</label>
          <select id="sched-subcategory" style="width:100%;padding:10px 14px;background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-size:0.85rem;">
            <option value="">— Select category first —</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;min-width:120px;">
          <label style="color:var(--text-secondary);">Month</label>
          <select id="sched-month" style="width:100%;padding:10px 14px;background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-size:0.85rem;">
            ${ayMonths.map(m => `<option value="${m}">${MONTH_NAMES[m-1]}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;min-width:100px;">
          <label style="color:var(--text-secondary);">Year</label>
          <select id="sched-year" style="width:100%;padding:10px 14px;background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-size:0.85rem;">
            ${ay.split('-').map(y => `<option value="${y}">${y}</option>`).join('')}
          </select>
        </div>
        <button class="btn-primary" id="btn-add-schedule" style="height:42px;">
          <span class="material-symbols-outlined">add</span> Add Schedule
        </button>
      </div>
    </div>

    <!-- Schedule Table -->
    <div class="table-section">
      <div class="table-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div><h2>Scheduled Categories</h2><p>${schedules.length} schedules for ${academicYearLabel(ay)}</p></div>
        <div style="position:relative;"><span class="material-symbols-outlined" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);font-size:18px;pointer-events:none;">search</span><input type="text" placeholder="Search schedules..." onkeyup="window.__filterTable(this)" style="padding:8px 12px 8px 36px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-0);color:var(--text-primary);font-size:0.85rem;width:220px;" /></div>
      </div>
      ${schedules.length > 0 ? `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Category</th><th>Subcategory</th><th>Scheduled For</th><th>Status</th><th style="text-align:right;">Actions</th></tr></thead>
          <tbody>
            ${schedules.map(s => `
              <tr>
                <td><div class="event-title">${s.categories?.name || '—'}</div></td>
                <td><span class="category-tag">${s.subcategories?.name || '—'}</span></td>
                <td style="white-space:nowrap;">${MONTH_NAMES[s.scheduled_month - 1]} ${s.scheduled_year}</td>
                <td>
                  <span class="schedule-badge ${getScheduleStatusClass(s.computed_status)}">
                    <span class="material-symbols-outlined" style="font-size:14px;">${getScheduleStatusIcon(s.computed_status)}</span>
                    ${getScheduleStatusLabel(s.computed_status)}
                  </span>
                </td>
                <td style="text-align:right;">
                  <button class="btn-reject" style="font-size:0.75rem;" onclick="window.__deleteSchedule('${s.id}')">
                    <span class="material-symbols-outlined" style="font-size:14px;">delete</span> Remove
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>` : `
      <div class="empty-state">
        <span class="material-symbols-outlined">event_repeat</span>
        <p>No schedules created for ${academicYearLabel(ay)}. Use the form above to schedule categories.</p>
      </div>`}
    </div>
  `;

  // Subcategory dynamic update
  document.getElementById('sched-category').addEventListener('change', (e) => {
    const catId = e.target.value;
    const subSel = document.getElementById('sched-subcategory');
    if (catId && subcatOptionsMap[catId]) {
      subSel.innerHTML = '<option value="">— None —</option>' + subcatOptionsMap[catId];
    } else {
      subSel.innerHTML = '<option value="">— Select category first —</option>';
    }
  });

  // Add schedule handler
  document.getElementById('btn-add-schedule').addEventListener('click', async () => {
    const category_id = document.getElementById('sched-category').value;
    const subcategory_id = document.getElementById('sched-subcategory').value;
    const scheduled_month = document.getElementById('sched-month').value;
    const scheduled_year = document.getElementById('sched-year').value;

    if (!category_id) return showToast('Please select a category', 'error');
    if (!scheduled_month || !scheduled_year) return showToast('Please select month and year', 'error');

    try {
      await api.hod.createSchedule({
        category_id,
        subcategory_id: subcategory_id || null,
        scheduled_month: parseInt(scheduled_month),
        scheduled_year: parseInt(scheduled_year),
        academic_year: ay,
      });
      showToast('Schedule created!', 'success');
      loadPage();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

window.__deleteSchedule = async (id) => {
  if (!confirm('Delete this schedule?')) return;
  try {
    await api.hod.deleteSchedule(id);
    showToast('Schedule deleted', 'success');
    loadPage();
  } catch (err) { showToast(err.message, 'error'); }
};

// =============================================
//       ADMIN: HOD SCHEDULES PAGE
// =============================================

async function renderAdminSchedules(container, headerActions, user) {
  const ay = pageState.academicYear || getCurrentAcademicYear();

  headerActions.innerHTML = `<button class="btn-icon" id="btn-refresh" title="Refresh"><span class="material-symbols-outlined">refresh</span></button>`;
  document.getElementById('btn-refresh')?.addEventListener('click', loadPage);

  const schedules = await api.admin.getSchedules(ay);

  // Stats
  const totalScheduled = schedules.length;
  const completed = schedules.filter(s => s.computed_status === 'COMPLETED').length;
  const completedLate = schedules.filter(s => s.computed_status === 'COMPLETED_LATE').length;
  const missed = schedules.filter(s => s.computed_status === 'MISSED').length;
  const upcoming = schedules.filter(s => s.computed_status === 'UPCOMING').length;
  const pending = missed + upcoming;

  container.innerHTML = `
    <!-- Stats -->
    <div class="metrics-grid">
      ${metricCard('event_repeat', totalScheduled, 'HOD Schedules', academicYearLabel(ay), '')}
      ${metricCard('check_circle', completed, 'Completed On Time', '', 'accent-teal')}
      ${metricCard('schedule', completedLate, 'Completed Late', '', '')}
      ${metricCard('pending_actions', pending, 'Pending', `${missed} missed · ${upcoming} upcoming`, 'accent-amber')}
    </div>

    <!-- Schedule Table -->
    <div class="table-section">
      <div class="table-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div><h2>HOD Scheduled Categories</h2><p>${schedules.length} schedules from your HOD for ${academicYearLabel(ay)}</p></div>
        <div style="position:relative;"><span class="material-symbols-outlined" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);font-size:18px;pointer-events:none;">search</span><input type="text" placeholder="Search schedules..." onkeyup="window.__filterTable(this)" style="padding:8px 12px 8px 36px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-0);color:var(--text-primary);font-size:0.85rem;width:220px;" /></div>
      </div>
      ${schedules.length > 0 ? `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Category</th><th>Subcategory</th><th>Scheduled For</th><th>Status</th><th style="text-align:right;">Action</th></tr></thead>
          <tbody>
            ${schedules.map(s => `
              <tr>
                <td><div class="event-title">${s.categories?.name || '—'}</div></td>
                <td><span class="category-tag">${s.subcategories?.name || '—'}</span></td>
                <td style="white-space:nowrap;">${MONTH_NAMES[s.scheduled_month - 1]} ${s.scheduled_year}</td>
                <td>
                  <span class="schedule-badge ${getScheduleStatusClass(s.computed_status)}">
                    <span class="material-symbols-outlined" style="font-size:14px;">${getScheduleStatusIcon(s.computed_status)}</span>
                    ${getScheduleStatusLabel(s.computed_status)}
                  </span>
                </td>
                <td style="text-align:right;">
                  ${(s.computed_status === 'UPCOMING' || s.computed_status === 'MISSED') ? `
                    <button class="btn-primary" style="font-size:0.75rem;padding:6px 14px;" onclick="window.__createEventFromSchedule('${s.category_id}','${s.subcategory_id || ''}')">
                      <span class="material-symbols-outlined" style="font-size:14px;">add</span> Create Event
                    </button>
                  ` : `
                    <span style="font-size:0.8rem;color:var(--text-tertiary);">—</span>
                  `}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>` : `
      <div class="empty-state">
        <span class="material-symbols-outlined">event_repeat</span>
        <p>No schedules from HOD for ${academicYearLabel(ay)}.</p>
      </div>`}
    </div>
  `;
}

// Create event pre-filled from a schedule
window.__createEventFromSchedule = async (categoryId, subcategoryId) => {
  const categories = await api.admin.getCategories();
  if (categories.length === 0) return showToast('No categories available.', 'error');

  openModal(`
    <div class="modal-header">
      <div><h2>Create Event from Schedule</h2><p>Pre-filled from HOD schedule</p></div>
      <button class="modal-close" onclick="window.__closeModal()"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label>Event Title</label><input type="text" id="ev-title" required /></div>
      <div style="display:flex;gap:12px;">
        <div class="form-group" style="flex:1;"><label>Category</label><select id="ev-cat">${categories.map(c => `<option value="${c.id}" ${c.id === categoryId ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
        <div class="form-group" style="flex:1;"><label>Subcategory</label><select id="ev-subcat"></select></div>
      </div>
      <div style="display:flex;gap:12px;">
         <div class="form-group" style="flex:1;"><label>Date</label><input type="datetime-local" id="ev-date" required /></div>
         <div class="form-group" style="flex:1;"><label>Venue</label><input type="text" id="ev-venue" /></div>
      </div>
      <div style="display:flex;gap:12px;">
         <div class="form-group" style="flex:1;"><label>Target Participants</label><input type="number" id="ev-target" value="100" /></div>
         <div class="form-group" style="flex:1;"><label>Guests / Speakers</label><input type="text" id="ev-guests" /></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="window.__closeModal()">Cancel</button>
      <button class="btn-primary" id="btn-submit-ev">Create Draft</button>
    </div>
  `);

  const catSelect = document.getElementById('ev-cat');
  const subcatSelect = document.getElementById('ev-subcat');
  const updateSubcats = () => {
    const cid = catSelect.value;
    const cat = categories.find(c => c.id === cid);
    const subs = cat?.subcategories || [];
    subcatSelect.innerHTML = subs.length
      ? subs.map(s => `<option value="${s.id}" ${s.id === subcategoryId ? 'selected' : ''}>${s.name}</option>`).join('')
      : '<option value="">No subcategories</option>';
  };
  catSelect.addEventListener('change', updateSubcats);
  updateSubcats();

  document.getElementById('btn-submit-ev').addEventListener('click', async () => {
    const payload = {
      title: document.getElementById('ev-title').value.trim(),
      date: new Date(document.getElementById('ev-date').value).toISOString(),
      venue: document.getElementById('ev-venue').value.trim(),
      category_id: document.getElementById('ev-cat').value,
      subcategory_id: document.getElementById('ev-subcat').value,
      target_count: parseInt(document.getElementById('ev-target').value) || 0,
      guests: document.getElementById('ev-guests').value.trim()
    };
    try {
      await api.admin.createEvent(payload);
      showToast('Event created from schedule!', 'success');
      closeModal();
      loadPage();
    } catch(err) { showToast(err.message, 'error'); }
  });
};

// =============================================
//       PRINCIPAL: SCHEDULE OVERVIEW PAGE
// =============================================

async function renderPrincipalScheduleOverview(container, headerActions, user) {
  const ay = pageState.academicYear || getCurrentAcademicYear();
  const filterDept = pageState.filterDept || '';

  const departments = await api.principal.getDepartments();

  headerActions.innerHTML = `
    <select id="so-dept-filter" class="filter-select">
      <option value="">All Departments</option>
      ${departments.map(d => `<option value="${d.id}" ${filterDept === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
    </select>
    <button class="btn-icon" id="btn-refresh" title="Refresh"><span class="material-symbols-outlined">refresh</span></button>
  `;

  const schedules = await api.principal.getSchedules({ academic_year: ay, department_id: filterDept || undefined });

  // Stats
  const total = schedules.length;
  const completed = schedules.filter(s => s.computed_status === 'COMPLETED').length;
  const completedLate = schedules.filter(s => s.computed_status === 'COMPLETED_LATE').length;
  const missed = schedules.filter(s => s.computed_status === 'MISSED').length;
  const upcoming = schedules.filter(s => s.computed_status === 'UPCOMING').length;
  const compliancePct = total ? Math.round(((completed + completedLate) / total) * 100) : 0;

  // Group by department for summary
  const deptMap = {};
  schedules.forEach(s => {
    const dName = s.departments?.name || 'Unknown';
    if (!deptMap[dName]) deptMap[dName] = { total: 0, completed: 0, late: 0, missed: 0, upcoming: 0 };
    deptMap[dName].total++;
    if (s.computed_status === 'COMPLETED') deptMap[dName].completed++;
    else if (s.computed_status === 'COMPLETED_LATE') deptMap[dName].late++;
    else if (s.computed_status === 'MISSED') deptMap[dName].missed++;
    else deptMap[dName].upcoming++;
  });

  container.innerHTML = `
    <!-- Stats -->
    <div class="metrics-grid">
      ${metricCard('event_repeat', total, 'Total Schedules', academicYearLabel(ay), '')}
      ${metricCard('check_circle', completed, 'On Time', `${total ? Math.round(completed/total*100) : 0}%`, 'accent-teal')}
      ${metricCard('schedule', completedLate, 'Late', '', '')}
      ${metricCard('cancel', missed, 'Missed', '', 'accent-red')}
    </div>

    <!-- Compliance Bar -->
    <div class="detail-card" style="margin-bottom:24px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3><span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px;">analytics</span> Overall Compliance</h3>
        <span style="font-size:1.8rem;font-weight:800;color:${compliancePct >= 80 ? 'var(--success)' : compliancePct >= 50 ? 'var(--accent)' : 'var(--error)'};">${compliancePct}%</span>
      </div>
      <div class="progress-bar" style="height:12px;border-radius:6px;">
        <div class="progress-fill" style="width:${compliancePct}%;background:${compliancePct >= 80 ? 'var(--success)' : compliancePct >= 50 ? 'var(--accent)' : 'var(--error)'};border-radius:6px;transition:width 0.6s ease;"></div>
      </div>
    </div>

    ${Object.keys(deptMap).length > 0 ? `
    <!-- Department Compliance Table -->
    <div class="table-section" style="margin-bottom:24px;">
      <div class="table-header"><div><h2>Department-wise Compliance</h2><p>${Object.keys(deptMap).length} departments with schedules</p></div></div>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Department</th><th>Total</th><th style="color:#10b981;">On Time</th><th style="color:#3b82f6;">Late</th><th style="color:#ef4444;">Missed</th><th style="color:#f59e0b;">Upcoming</th><th>Compliance</th></tr></thead>
          <tbody>
            ${Object.entries(deptMap).map(([name, d]) => {
              const pct = d.total ? Math.round(((d.completed + d.late) / d.total) * 100) : 0;
              return `<tr>
                <td><div class="event-title">${name}</div></td>
                <td style="font-weight:700;">${d.total}</td>
                <td><span class="schedule-badge sched-completed">${d.completed}</span></td>
                <td><span class="schedule-badge sched-late">${d.late}</span></td>
                <td><span class="schedule-badge sched-missed">${d.missed}</span></td>
                <td><span class="schedule-badge sched-upcoming">${d.upcoming}</span></td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div class="progress-bar" style="flex:1;height:6px;border-radius:3px;">
                      <div class="progress-fill" style="width:${pct}%;background:${pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'};border-radius:3px;"></div>
                    </div>
                    <span style="font-weight:700;font-size:0.8rem;min-width:36px;text-align:right;">${pct}%</span>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- Full Schedule List -->
    <div class="table-section">
      <div class="table-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div><h2>All Schedules</h2><p>${schedules.length} total across departments</p></div>
        <div style="position:relative;"><span class="material-symbols-outlined" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);font-size:18px;pointer-events:none;">search</span><input type="text" placeholder="Search schedules..." onkeyup="window.__filterTable(this)" style="padding:8px 12px 8px 36px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-0);color:var(--text-primary);font-size:0.85rem;width:220px;" /></div>
      </div>
      ${schedules.length > 0 ? `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>Department</th><th>Category</th><th>Subcategory</th><th>Scheduled For</th><th>Status</th></tr></thead>
          <tbody>
            ${schedules.map(s => `
              <tr>
                <td><span class="category-tag">${s.departments?.name || '—'}</span></td>
                <td><div class="event-title">${s.categories?.name || '—'}</div></td>
                <td>${s.subcategories?.name || '—'}</td>
                <td style="white-space:nowrap;">${MONTH_NAMES[s.scheduled_month - 1]} ${s.scheduled_year}</td>
                <td>
                  <span class="schedule-badge ${getScheduleStatusClass(s.computed_status)}">
                    <span class="material-symbols-outlined" style="font-size:14px;">${getScheduleStatusIcon(s.computed_status)}</span>
                    ${getScheduleStatusLabel(s.computed_status)}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>` : `
      <div class="empty-state">
        <span class="material-symbols-outlined">event_repeat</span>
        <p>No schedules found for ${academicYearLabel(ay)}.</p>
      </div>`}
    </div>
  `;

  // Filters
  document.getElementById('so-dept-filter').addEventListener('change', () => {
    pageState.filterDept = document.getElementById('so-dept-filter').value;
    loadPage();
  });
  document.getElementById('btn-refresh')?.addEventListener('click', loadPage);
}


// =============================================
//       MODALS
// =============================================

function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

async function showCreateDepartmentModal() {
  openModal(`
    <div class="modal-header">
      <div><h2>New Department</h2><p>Add a new department to the institution</p></div>
      <button class="modal-close" onclick="window.__closeModal()"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label for="dept-name">Department Name</label>
        <input type="text" id="dept-name" placeholder="e.g. Computer Science" required />
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="window.__closeModal()">Cancel</button>
      <button class="btn-primary" id="btn-submit-dept">Create Department</button>
    </div>
  `);

  document.getElementById('btn-submit-dept').addEventListener('click', async () => {
    const name = document.getElementById('dept-name').value.trim();
    if (!name) return showToast('Please enter a department name', 'error');
    try {
      await api.principal.createDepartment(name, null);
      showToast('Department created!', 'success');
      closeModal();
      loadPage();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

async function showEditDepartmentModal(deptId, deptName, currentHodId) {
  let hods = [];
  try { hods = await api.principal.getHods(); } catch (e) {}

  openModal(`
    <div class="modal-header">
      <div><h2>Edit Department</h2><p>Update department details or assign HOD</p></div>
      <button class="modal-close" onclick="window.__closeModal()"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label for="edit-dept-name">Department Name</label>
        <input type="text" id="edit-dept-name" value="${deptName}" required />
      </div>
      <div class="form-group">
        <label for="edit-dept-hod">Assign HOD</label>
        <select id="edit-dept-hod">
          <option value="">— No HOD assigned —</option>
          ${hods.map((h) => `<option value="${h.id}" ${h.id === currentHodId ? 'selected' : ''}>${h.name} (${h.email})</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="window.__closeModal()">Cancel</button>
      <button class="btn-primary" id="btn-update-dept">Update Department</button>
    </div>
  `);

  document.getElementById('btn-update-dept').addEventListener('click', async () => {
    const name = document.getElementById('edit-dept-name').value.trim();
    const hodId = document.getElementById('edit-dept-hod').value || null;
    if (!name) return showToast('Name is required', 'error');
    try {
      await api.principal.updateDepartment(deptId, name, hodId);
      showToast('Department updated!', 'success');
      closeModal();
      loadPage();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// =============================================
//       CREATE HOD MODAL
// =============================================

async function showCreateHodModal() {
  let departments = [];
  try { departments = await api.principal.getDepartments(); } catch (e) {}

  // Filter out departments that already have an HOD assigned
  const availableDepts = departments.filter((d) => !d.hod_id);

  openModal(`
    <div class="modal-header">
      <div><h2>Create HOD Account</h2><p>Create a new Head of Department with login credentials</p></div>
      <button class="modal-close" onclick="window.__closeModal()"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label for="hod-name">Full Name</label>
        <input type="text" id="hod-name" placeholder="e.g. Dr. Sharma" required />
      </div>
      <div class="form-group">
        <label for="hod-email">Email Address</label>
        <input type="email" id="hod-email" placeholder="e.g. sharma@college.edu" required />
      </div>
      <div class="form-group">
        <label for="hod-password">Password</label>
        <div style="position:relative;width:100%;">
          <input type="password" id="hod-password" placeholder="Min 6 characters" required style="padding-right:40px;" />
          <span class="material-symbols-outlined pw-toggle" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--text-tertiary);font-size:18px;user-select:none;">visibility_off</span>
        </div>
      </div>
      <div class="form-group">
        <label for="hod-dept">Assign to Department <span style="color:var(--error);">*</span></label>
        ${availableDepts.length > 0 ? `
        <select id="hod-dept" required>
          <option value="">— Select a department —</option>
          ${availableDepts.map((d) => `<option value="${d.id}">${d.name}</option>`).join('')}
        </select>
        ` : `
        <div style="padding:12px;background:var(--accent-surface);border:1px solid var(--accent);border-radius:var(--radius-md);font-size:0.8rem;color:var(--accent);">
          <strong>No departments available.</strong> All departments already have an HOD assigned, or no departments exist. Create a new department first.
        </div>
        <select id="hod-dept" style="display:none;"></select>
        `}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="window.__closeModal()">Cancel</button>
      <button class="btn-primary" id="btn-submit-hod" ${availableDepts.length === 0 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>Create HOD Account</button>
    </div>
  `);

  document.getElementById('btn-submit-hod').addEventListener('click', async () => {
    const name = document.getElementById('hod-name').value.trim();
    const email = document.getElementById('hod-email').value.trim();
    const password = document.getElementById('hod-password').value;
    const deptId = document.getElementById('hod-dept').value;

    if (!name || !email || !password) return showToast('All fields are required', 'error');
    if (!deptId) return showToast('Please select a department. Each HOD must be assigned to a department.', 'error');
    if (password.length < 6) return showToast('Password must be at least 6 characters', 'error');

    const btn = document.getElementById('btn-submit-hod');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      await api.principal.createHod(name, email, password, deptId);
      showToast(`HOD account created! Email: ${email}`, 'success');
      closeModal();
      loadPage();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Create HOD Account';
    }
  });
}

// =============================================
//       SETTINGS PAGE
// =============================================

// ===== CATEGORY OVERVIEW (Principal) =====
async function renderCategoryOverview(container, headerActions, user) {
  const filterDept = pageState.catOverviewDept || '';
  const viewMode = pageState.catOverviewView || 'table';

  const data = await api.principal.getCategoriesOverview(filterDept ? { department_id: filterDept } : {});
  const { departments, categories, stats } = data;

  headerActions.innerHTML = `
    <button class="btn-icon" id="btn-refresh" title="Refresh"><span class="material-symbols-outlined">refresh</span></button>
  `;

  // Stat cards
  const statsHtml = `
    <div class="metrics-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom:24px;">
      ${metricCard('business', stats.total_departments, 'Departments', 'Total', '')}
      ${metricCard('category', stats.total_categories, 'Categories', 'Total', 'accent-secondary')}
      ${metricCard('account_tree', stats.total_subcategories, 'Subcategories', 'Total', 'accent-info')}
      ${metricCard('event_note', stats.total_events, 'Events', 'Total', 'accent-primary')}
    </div>
  `;

  // Department filter chips
  const chipsHtml = `
    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:24px;">
      <button class="btn-outline ${!filterDept ? 'active' : ''}" data-dept-filter="" style="${!filterDept ? 'background:var(--primary);color:#fff;border-color:var(--primary);' : ''}">
        <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">apps</span> All Departments
      </button>
      ${departments.map(d => `
        <button class="btn-outline ${filterDept === d.id ? 'active' : ''}" data-dept-filter="${d.id}" style="${filterDept === d.id ? 'background:var(--primary);color:#fff;border-color:var(--primary);' : ''}">
          ${d.name}
        </button>
      `).join('')}
    </div>
  `;

  // View toggle
  const toggleHtml = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:16px; gap:4px;">
      <button class="btn-icon" id="view-table" title="Table View" style="${viewMode === 'table' ? 'background:var(--primary);color:#fff;border-radius:var(--radius-md);' : ''}">
        <span class="material-symbols-outlined" style="font-size:18px;">table_rows</span>
      </button>
      <button class="btn-icon" id="view-grid" title="Card View" style="${viewMode === 'grid' ? 'background:var(--primary);color:#fff;border-radius:var(--radius-md);' : ''}">
        <span class="material-symbols-outlined" style="font-size:18px;">grid_view</span>
      </button>
    </div>
  `;

  let contentHtml = '';

  if (categories.length === 0) {
    contentHtml = '<div class="empty-state"><span class="material-symbols-outlined">category</span><p>No categories found.</p></div>';
  } else if (viewMode === 'table') {
    // Table view with expandable rows
    contentHtml = `
      <div class="table-section">
        <div style="overflow-x:auto;">
          <table class="data-table" id="cat-overview-table">
            <thead>
              <tr>
                <th style="width:30px;"></th>
                <th>Category</th>
                <th>Department</th>
                <th style="text-align:center;">Subcategories</th>
                <th style="text-align:center;">Events</th>
              </tr>
            </thead>
            <tbody>
              ${categories.map(cat => `
                <tr class="clickable-row cat-row" data-cat-id="${cat.id}" style="cursor:pointer;">
                  <td><span class="material-symbols-outlined cat-expand-icon" style="font-size:18px;color:var(--text-tertiary);transition:transform 0.2s;">chevron_right</span></td>
                  <td>
                    <div style="font-weight:700;color:var(--text-primary);">${cat.name}</div>
                  </td>
                  <td><span class="category-tag">${cat.department_name}</span></td>
                  <td style="text-align:center;"><span style="font-weight:600;">${cat.subcategories.length}</span></td>
                  <td style="text-align:center;"><span style="font-weight:700;font-size:1.05rem;color:${cat.event_count > 0 ? 'var(--primary)' : 'var(--text-tertiary)'};">${cat.event_count}</span></td>
                </tr>
                <tr class="cat-subcats-row" data-parent="${cat.id}" style="display:none;">
                  <td colspan="5" style="padding:0;">
                    <div style="background:var(--surface-1);padding:12px 16px 12px 48px;border-top:1px solid var(--border);">
                      ${cat.subcategories.length > 0 ? `
                        <table style="width:100%;border-collapse:collapse;">
                          <thead>
                            <tr>
                              <th style="text-align:left;font-size:0.7rem;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em;padding:6px 12px;">Subcategory</th>
                              <th style="text-align:center;font-size:0.7rem;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em;padding:6px 12px;">Events</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${cat.subcategories.map(sub => `
                              <tr>
                                <td style="padding:8px 12px;font-size:0.85rem;color:var(--text-secondary);border-bottom:1px solid var(--border);">
                                  <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:6px;color:var(--text-tertiary);">subdirectory_arrow_right</span>
                                  ${sub.name}
                                </td>
                                <td style="text-align:center;padding:8px 12px;font-weight:700;font-size:0.95rem;color:${sub.event_count > 0 ? 'var(--success)' : 'var(--text-tertiary)'};border-bottom:1px solid var(--border);">${sub.event_count}</td>
                              </tr>
                            `).join('')}
                          </tbody>
                        </table>
                      ` : '<p style="font-size:0.8rem;color:var(--text-tertiary);font-style:italic;padding:4px 0;">No subcategories</p>'}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else {
    // Grid/Card view
    contentHtml = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px;">
        ${categories.map(cat => `
          <div class="detail-card" style="position:relative;overflow:hidden;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
              <div>
                <h3 style="font-size:1rem;font-weight:800;margin-bottom:4px;">${cat.name}</h3>
                <span class="category-tag">${cat.department_name}</span>
              </div>
              <div style="text-align:center;padding:8px 14px;background:var(--primary-surface);border-radius:var(--radius-md);">
                <div style="font-size:1.4rem;font-weight:800;color:var(--primary);">${cat.event_count}</div>
                <div style="font-size:0.65rem;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;">Events</div>
              </div>
            </div>
            ${cat.subcategories.length > 0 ? `
              <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:12px;">
                <div style="font-size:0.7rem;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Subcategories (${cat.subcategories.length})</div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                  ${cat.subcategories.map(sub => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--surface-1);border-radius:var(--radius-sm);border:1px solid var(--border);">
                      <span style="font-size:0.8rem;color:var(--text-secondary);">${sub.name}</span>
                      <span style="font-size:0.85rem;font-weight:700;color:${sub.event_count > 0 ? 'var(--success)' : 'var(--text-tertiary)'};">${sub.event_count}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : '<p style="font-size:0.8rem;color:var(--text-tertiary);font-style:italic;margin-top:12px;">No subcategories created</p>'}
          </div>
        `).join('')}
      </div>
    `;
  }

  container.innerHTML = statsHtml + chipsHtml + toggleHtml + contentHtml;

  // Filter chip handlers
  container.querySelectorAll('[data-dept-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      pageState.catOverviewDept = btn.dataset.deptFilter;
      loadPage();
    });
  });

  // View toggle handlers
  document.getElementById('view-table')?.addEventListener('click', () => {
    pageState.catOverviewView = 'table';
    loadPage();
  });
  document.getElementById('view-grid')?.addEventListener('click', () => {
    pageState.catOverviewView = 'grid';
    loadPage();
  });

  // Expandable row handlers (table view)
  container.querySelectorAll('.cat-row').forEach(row => {
    row.addEventListener('click', () => {
      const catId = row.dataset.catId;
      const subcatRow = container.querySelector(`.cat-subcats-row[data-parent="${catId}"]`);
      const icon = row.querySelector('.cat-expand-icon');
      if (subcatRow.style.display === 'none') {
        subcatRow.style.display = 'table-row';
        icon.style.transform = 'rotate(90deg)';
      } else {
        subcatRow.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
      }
    });
  });

  document.getElementById('btn-refresh')?.addEventListener('click', loadPage);
}

// =============================================
//       SETTINGS
// =============================================

function renderSettings(container, headerActions, user) {
  const isDark = getCurrentTheme() === 'dark';

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:20px;max-width:800px;">
      
      <div style="display:flex;flex-direction:column;gap:20px;">
        <!-- Theme Toggle -->
        <div class="detail-card">
          <h3><span class="material-symbols-outlined" style="vertical-align:middle;margin-right:8px;">palette</span> Appearance</h3>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;">
            <div>
              <div style="font-size:0.9rem;font-weight:600;color:var(--text-primary);">Dark Mode</div>
              <div style="font-size:0.8rem;color:var(--text-tertiary);margin-top:2px;">Switch between light and dark theme</div>
            </div>
            <label class="theme-toggle">
              <input type="checkbox" id="theme-switch" ${isDark ? 'checked' : ''} />
              <span class="theme-slider"></span>
            </label>
          </div>
        </div>

        <!-- Account Info -->
        <div class="detail-card">
          <h3><span class="material-symbols-outlined" style="vertical-align:middle;margin-right:8px;">person</span> Account Info</h3>
          <div class="detail-info-grid" style="margin-top:16px;">
            <div class="detail-info-item"><span class="detail-label">Name</span><span class="detail-value">${user.name}</span></div>
            <div class="detail-info-item"><span class="detail-label">Email</span><span class="detail-value">${user.email}</span></div>
            <div class="detail-info-item"><span class="detail-label">Role</span><span class="detail-value">${user.role}</span></div>
          </div>
        </div>
      </div>

      <div>
        <!-- Change Password -->
        <div class="detail-card">
          <h3><span class="material-symbols-outlined" style="vertical-align:middle;margin-right:8px;">lock</span> Change Password</h3>
          <form id="password-form" style="margin-top:16px;">
            <div class="form-group" style="margin-bottom:14px;">
              <label for="current-pw" style="color:var(--text-secondary);">Current Password</label>
              <div style="position:relative;">
                <input type="password" id="current-pw" placeholder="Enter current password" required style="width:100%;padding:10px 14px;padding-right:40px;background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-size:0.85rem;" />
                <span class="material-symbols-outlined pw-toggle" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--text-tertiary);font-size:18px;user-select:none;">visibility_off</span>
              </div>
            </div>
            <div class="form-group" style="margin-bottom:14px;">
              <label for="new-pw" style="color:var(--text-secondary);">New Password</label>
              <div style="position:relative;">
                <input type="password" id="new-pw" placeholder="Min 6 characters" required style="width:100%;padding:10px 14px;padding-right:40px;background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-size:0.85rem;" />
                <span class="material-symbols-outlined pw-toggle" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--text-tertiary);font-size:18px;user-select:none;">visibility_off</span>
              </div>
            </div>
            <div class="form-group" style="margin-bottom:14px;">
              <label for="confirm-pw" style="color:var(--text-secondary);">Confirm New Password</label>
              <div style="position:relative;">
                <input type="password" id="confirm-pw" placeholder="Re-enter new password" required style="width:100%;padding:10px 14px;padding-right:40px;background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-size:0.85rem;" />
                <span class="material-symbols-outlined pw-toggle" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--text-tertiary);font-size:18px;user-select:none;">visibility_off</span>
              </div>
            </div>
            <button type="submit" class="btn-primary" id="btn-change-pw" style="margin-top:4px;">Update Password</button>
          </form>
        </div>
      </div>
      
    </div>
  `;

  // Theme toggle handler
  document.getElementById('theme-switch').addEventListener('change', () => {
    const newTheme = toggleTheme();
    showToast(`Switched to ${newTheme} mode`, 'info');
  });

  // Password change handler
  document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPw = document.getElementById('current-pw').value;
    const newPw = document.getElementById('new-pw').value;
    const confirmPw = document.getElementById('confirm-pw').value;

    if (newPw !== confirmPw) return showToast('Passwords do not match', 'error');
    if (newPw.length < 6) return showToast('Password must be at least 6 characters', 'error');

    const btn = document.getElementById('btn-change-pw');
    btn.disabled = true;
    btn.textContent = 'Updating...';

    try {
      await api.auth.changePassword(currentPw, newPw);
      showToast('Password changed successfully!', 'success');
      document.getElementById('password-form').reset();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Update Password';
    }
  });
}

// =============================================
//       GLOBAL HANDLERS
// =============================================

window.__downloadCategoryCsvTemplate = () => {
  const content = "Category,Subcategories (comma separated)\nAcademic,\"Workshop, Seminar, Guest Lecture\"\nTechnical,\"Hackathon, Coding Contest\"\nCultural,\"Dance, Music, Drama\"\nSports,\n";
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', 'categories_template.csv');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
window.__closeModal = closeModal;
window.__nav = (page) => navigateTo(page);
window.__drillDept = (id, name) => navigateTo('dept-drilldown', { deptId: id, deptName: name });
window.__viewEventChart = async (id, name) => {
  openModal(`Event Chart — ${name}`, '<div class="loading-spinner"><div class="spinner"></div></div>');
  try {
    const data = await api.principal.getDeptEventChart(id);
    const chart = data.chart || [];
    
    let totalEvents = 0;
    chart.forEach(c => { totalEvents += c.event_count; });

    let tableHtml = '';
    if (chart.length === 0) {
      tableHtml = '<div class="empty-state"><p>No categories created for this department yet.</p></div>';
    } else {
      tableHtml = `
        <div style="margin-bottom:16px; display:flex; align-items:center; gap:12px;">
          <span style="font-size:0.85rem; color:var(--text-secondary);">Total Categories: <strong style="color:var(--text-primary);">${chart.length}</strong></span>
          <span style="font-size:0.85rem; color:var(--text-secondary);">Total Events: <strong style="color:var(--primary);">${totalEvents}</strong></span>
        </div>
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Subcategory</th>
                <th style="text-align:center;">Events</th>
              </tr>
            </thead>
            <tbody>
              ${chart.map(cat => {
                if (cat.subcategories.length === 0) {
                  return `<tr>
                    <td><span style="font-weight:700; color:var(--text-primary);">${cat.name}</span></td>
                    <td style="color:var(--text-tertiary); font-style:italic;">No subcategories</td>
                    <td style="text-align:center;"><span style="font-weight:700; font-size:1.1rem;">${cat.event_count}</span></td>
                  </tr>`;
                }
                return cat.subcategories.map((sub, idx) => `<tr>
                  ${idx === 0 ? `<td rowspan="${cat.subcategories.length}" style="vertical-align:top; border-right:2px solid var(--primary-glow);">
                    <div style="font-weight:700; color:var(--text-primary);">${cat.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-tertiary); margin-top:2px;">${cat.event_count} total events</div>
                  </td>` : ''}
                  <td>
                    <span style="color:var(--text-secondary);">${sub.name}</span>
                  </td>
                  <td style="text-align:center;">
                    <span style="font-weight:700; font-size:1rem; color:${sub.event_count > 0 ? 'var(--success)' : 'var(--text-tertiary)'};">${sub.event_count}</span>
                  </td>
                </tr>`).join('');
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
    
    document.querySelector('.modal-body').innerHTML = tableHtml;
  } catch (err) {
    document.querySelector('.modal-body').innerHTML = `<p style="color:var(--error);">${err.message}</p>`;
  }
};
window.__viewEvent = (id) => navigateTo('event-detail', { eventId: id, backTo: currentPage });
window.__editDept = (id, name, hodId) => showEditDepartmentModal(id, name, hodId);
window.__createHod = () => showCreateHodModal();
window.__removeHod = async (id, name) => {
  if (!confirm(`Are you sure you want to permanently remove the HOD "${name}"? This action cannot be undone.`)) return;
  try {
    await api.principal.deleteHod(id);
    showToast('HOD removed successfully', 'success');
    loadPage();
  } catch (err) { showToast(err.message, 'error'); }
};
window.__hodViewEvent = (id) => navigateTo('hod-event-detail', { eventId: id, backTo: currentPage });
window.__adminViewEvent = (id) => navigateTo('admin-event-detail', { eventId: id, backTo: currentPage });
window.__submitForApproval = async (id) => {
  try {
    await api.admin.submitForApproval(id);
    showToast('Event submitted for approval!', 'success');
    loadPage();
  } catch (err) { showToast(err.message, 'error'); }
};
window.__deleteAdminEvent = async (id) => {
  try {
    await api.admin.deleteEvent(id);
    showToast('Event deleted successfully', 'success');
    if (currentPage === 'admin-event-detail') {
       window.__nav('events');
    } else {
       loadPage();
    }
  } catch(err) { showToast(err.message, 'error'); }
};
window.__markCompleted = async (id) => {
  try {
    await api.admin.markCompleted(id);
    showToast('Event marked completed!', 'success');
    loadPage();
  } catch (err) { showToast(err.message, 'error'); }
};
window.__toggleFormStatus = async (id, type, isActive) => {
  try {
    const details = await api.admin.getEventDetails(id);
    if (type === 'FEEDBACK' && isActive && details.status !== 'COMPLETED') {
      return showToast('Feedback forms can only be activated after the event is Completed.', 'error');
    }
    const form = details.forms.find(f => f.type === type);
    const fields = form ? form.fields : [];
    await api.admin.configureForm(id, type, fields, isActive);
    showToast(`${type} Form ${isActive ? 'Opened' : 'Closed'}`, 'success');
    loadPage();
  } catch(err) { showToast(err.message, 'error'); }
};
window.__toggleAttendance = async (pid, present) => {
  try {
    await api.admin.toggleAttendance(pid, present);
    // Don't completely reload the page to maintain tab state easily if we are clever, 
    // but default loadPage() works since activeTab is persisted in pageState.
    loadPage();
  } catch(err) { showToast(err.message, 'error'); }
};
window.__createAdminEventModal = async () => {
  const categories = await api.admin.getCategories();
  if (categories.length === 0) return showToast('No categories available in your department.', 'error');
  
  openModal(`
    <div class="modal-header">
      <div><h2>Create New Event</h2><p>Draft a new event in your department</p></div>
      <button class="modal-close" onclick="window.__closeModal()"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label>Event Title</label><input type="text" id="ev-title" required /></div>
      <div style="display:flex;gap:12px;">
        <div class="form-group" style="flex:1;"><label>Category</label><select id="ev-cat">${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select></div>
        <div class="form-group" style="flex:1;"><label>Subcategory</label><select id="ev-subcat"></select></div>
      </div>
      <div style="display:flex;gap:12px;">
         <div class="form-group" style="flex:1;"><label>Date</label><input type="datetime-local" id="ev-date" required /></div>
         <div class="form-group" style="flex:1;"><label>Venue</label><input type="text" id="ev-venue" /></div>
      </div>
      <div style="display:flex;gap:12px;">
         <div class="form-group" style="flex:1;"><label>Target Participants</label><input type="number" id="ev-target" value="100" /></div>
         <div class="form-group" style="flex:1;"><label>Guests / Speakers</label><input type="text" id="ev-guests" /></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="window.__closeModal()">Cancel</button>
      <button class="btn-primary" id="btn-submit-ev">Create Draft</button>
    </div>
  `);

  const catSelect = document.getElementById('ev-cat');
  const subcatSelect = document.getElementById('ev-subcat');
  const updateSubcats = () => {
    const cid = catSelect.value;
    const cat = categories.find(c => c.id === cid);
    const subs = cat?.subcategories || [];
    subcatSelect.innerHTML = subs.length 
      ? subs.map(s => `<option value="${s.id}">${s.name}</option>`).join('')
      : '<option value="">No subcategories</option>';
  };
  catSelect.addEventListener('change', updateSubcats);
  updateSubcats();

  document.getElementById('btn-submit-ev').addEventListener('click', async () => {
    const payload = {
      title: document.getElementById('ev-title').value.trim(),
      date: new Date(document.getElementById('ev-date').value).toISOString(),
      venue: document.getElementById('ev-venue').value.trim(),
      category_id: document.getElementById('ev-cat').value,
      subcategory_id: document.getElementById('ev-subcat').value,
      target_count: parseInt(document.getElementById('ev-target').value) || 0,
      guests: document.getElementById('ev-guests').value.trim()
    };
    try {
      await api.admin.createEvent(payload);
      showToast('Event created successfully!', 'success');
      closeModal();
      loadPage();
    } catch(err) { showToast(err.message, 'error'); }
  });
};

window.__editAdminEventModal = async (eventId) => {
  const details = await api.admin.getEventDetails(eventId);
  const categories = await api.admin.getCategories();
  if (categories.length === 0) return showToast('No categories available in your department.', 'error');
  
  openModal(`
    <div class="modal-header">
      <div><h2>Edit Draft Event</h2><p>Update your event details</p></div>
      <button class="modal-close" onclick="window.__closeModal()"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label>Event Title</label><input type="text" id="ev-title" value="${details.title || ''}" required /></div>
      <div style="display:flex;gap:12px;">
        <div class="form-group" style="flex:1;"><label>Category</label><select id="ev-cat">${categories.map(c => `<option value="${c.id}" ${details.category_id === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
        <div class="form-group" style="flex:1;"><label>Subcategory</label><select id="ev-subcat"></select></div>
      </div>
      <div style="display:flex;gap:12px;">
         <div class="form-group" style="flex:1;"><label>Date</label><input type="datetime-local" id="ev-date" value="${details.date ? new Date(details.date).toISOString().slice(0, 16) : ''}" required /></div>
         <div class="form-group" style="flex:1;"><label>Venue</label><input type="text" id="ev-venue" value="${details.venue || ''}" /></div>
      </div>
      <div style="display:flex;gap:12px;">
         <div class="form-group" style="flex:1;"><label>Target Participants</label><input type="number" id="ev-target" value="${details.target_count || 100}" /></div>
         <div class="form-group" style="flex:1;"><label>Guests / Speakers</label><input type="text" id="ev-guests" value="${details.guests || ''}" /></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="window.__closeModal()">Cancel</button>
      <button class="btn-primary" id="btn-submit-ev-edit">Update event</button>
    </div>
  `);

  const catSelect = document.getElementById('ev-cat');
  const subcatSelect = document.getElementById('ev-subcat');
  const updateSubcats = () => {
    const cid = catSelect.value;
    const cat = categories.find(c => c.id === cid);
    const subs = cat?.subcategories || [];
    subcatSelect.innerHTML = subs.length 
      ? subs.map(s => `<option value="${s.id}" ${details.subcategory_id === s.id ? 'selected' : ''}>${s.name}</option>`).join('')
      : '<option value="">No subcategories</option>';
  };
  catSelect.addEventListener('change', updateSubcats);
  updateSubcats();

  document.getElementById('btn-submit-ev-edit').addEventListener('click', async () => {
    const payload = {
      title: document.getElementById('ev-title').value.trim(),
      date: new Date(document.getElementById('ev-date').value).toISOString(),
      venue: document.getElementById('ev-venue').value.trim(),
      category_id: document.getElementById('ev-cat').value,
      subcategory_id: document.getElementById('ev-subcat').value,
      target_count: parseInt(document.getElementById('ev-target').value) || 0,
      guests: document.getElementById('ev-guests').value.trim()
    };
    try {
      await api.admin.updateEvent(eventId, payload);
      showToast('Event updated successfully!', 'success');
      closeModal();
      loadPage();
    } catch(err) { showToast(err.message, 'error'); }
  });
};

window.__triggerAIEval = async (eventId) => {
  const btn = document.getElementById('btn-ai-evaluate');
  const resultDiv = document.getElementById('ai-result');
  const placeholder = document.getElementById('ai-placeholder');
  
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;animation:spin 1s linear infinite;">progress_activity</span> Analyzing...';
  placeholder.style.display = 'none';

  try {
    const data = await api.admin.aiEvaluate(eventId);
    
    const ratingColor = data.overall_rating >= 4 ? '#34a853' : data.overall_rating >= 3 ? '#fbbc04' : '#ea4335';
    const ratingLabel = data.overall_rating >= 4.5 ? 'Excellent' : data.overall_rating >= 3.5 ? 'Good' : data.overall_rating >= 2.5 ? 'Average' : 'Needs Improvement';

    const formatBullets = (text) => {
      if (!text) return '<p style="color:var(--text-tertiary);">No data</p>';
      return text.split(/\n|•|●|‣|-(?=\s)/).filter(s => s.trim()).map(s => 
        `<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;">
          <span style="color:var(--primary);font-size:8px;margin-top:6px;">●</span>
          <span style="font-size:0.9rem;color:var(--text-primary);line-height:1.5;">${s.trim()}</span>
        </div>`
      ).join('');
    };

    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr;gap:20px;">
        <!-- Rating & Summary -->
        <div style="display:flex;gap:24px;align-items:center;padding:24px;background:linear-gradient(135deg,var(--primary-surface),var(--surface-1));border-radius:var(--radius-lg);border:1px solid var(--border);flex-wrap:wrap;">
          <div style="text-align:center;min-width:100px;">
            <div style="width:80px;height:80px;border-radius:50%;background:${ratingColor};display:flex;align-items:center;justify-content:center;margin:0 auto 8px;box-shadow:0 4px 16px ${ratingColor}33;">
              <span style="font-size:1.8rem;font-weight:800;color:#fff;">${data.overall_rating}</span>
            </div>
            <span style="font-size:0.75rem;font-weight:700;color:${ratingColor};text-transform:uppercase;letter-spacing:0.05em;">${ratingLabel}</span>
          </div>
          <div style="flex:1;min-width:200px;">
            <h4 style="font-size:1rem;font-weight:700;color:var(--text-primary);margin-bottom:8px;">Event Summary</h4>
            <p style="font-size:0.9rem;color:var(--text-secondary);line-height:1.6;">${data.summary}</p>
          </div>
        </div>

        <!-- Strengths & Improvements -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div style="padding:20px;background:var(--surface-0);border:1px solid var(--border);border-radius:var(--radius-lg);border-top:3px solid var(--success);">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
              <span class="material-symbols-outlined" style="color:var(--success);font-size:20px;">thumb_up</span>
              <h4 style="font-size:0.9rem;font-weight:700;color:var(--text-primary);margin:0;">Strengths</h4>
            </div>
            ${formatBullets(data.strengths)}
          </div>
          <div style="padding:20px;background:var(--surface-0);border:1px solid var(--border);border-radius:var(--radius-lg);border-top:3px solid var(--accent);">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
              <span class="material-symbols-outlined" style="color:var(--accent);font-size:20px;">lightbulb</span>
              <h4 style="font-size:0.9rem;font-weight:700;color:var(--text-primary);margin:0;">Areas for Improvement</h4>
            </div>
            ${formatBullets(data.improvements)}
          </div>
        </div>

        <!-- Insights -->
        <div style="padding:20px;background:var(--surface-0);border:1px solid var(--border);border-radius:var(--radius-lg);border-left:4px solid var(--primary);">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
            <span class="material-symbols-outlined" style="color:var(--primary);font-size:20px;">insights</span>
            <h4 style="font-size:0.9rem;font-weight:700;color:var(--text-primary);margin:0;">Key Insights & Recommendations</h4>
          </div>
          <p style="font-size:0.9rem;color:var(--text-secondary);line-height:1.6;">${data.insights}</p>
        </div>
      </div>
    `;

    btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">auto_awesome</span> Regenerate Report';
    btn.disabled = false;
  } catch(err) {
    showToast(err.message, 'error');
    placeholder.style.display = 'block';
    btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">auto_awesome</span> Generate AI Report';
    btn.disabled = false;
  }
};

window.__uploadMedia = async (eventId) => {
  const type = document.getElementById('media-type').value;
  const fileInput = document.getElementById('media-file');
  const files = fileInput ? fileInput.files : [];
  const url = document.getElementById('media-url').value.trim();

  if(files.length === 0 && !url) return showToast('Please select file(s) or provide a URL', 'error');

  try {
    if (files.length > 0) {
      const formData = new FormData();
      formData.append('type', type);
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
      if (url) formData.append('url', url);
      await api.admin.uploadMedia(eventId, formData);
    } else {
      await api.admin.uploadMediaUrl(eventId, type, url);
    }
    showToast('Media added successfully!', 'success');
    loadPage();
  } catch(err) { showToast(err.message, 'error'); }
};

window.__deleteMedia = async (mediaId) => {
  if (!confirm('Delete this media item?')) return;
  try {
    await api.admin.deleteMedia(mediaId);
    showToast('Media deleted', 'success');
    loadPage();
  } catch(err) { showToast(err.message, 'error'); }
};

window.__openFormBuilder = async (eventId, type) => {
  // Simple JSON array builder
  // We'll fetch current fields
  const details = await api.admin.getEventDetails(eventId);
  const form = details.forms.find(f => f.type === type);
  // Default to empty array if none exists
  window.__currentFormFields = form && form.fields ? [...form.fields] : [];
  window.__currentFormActive = form ? form.is_active : false;

  const renderFieldList = () => {
    let baselineHtml = '';
    if (type === 'REGISTRATION') {
      baselineHtml = `
        <div style="margin-bottom:12px; padding:12px; background:var(--bg-tertiary); border-radius:4px; border:1px dashed var(--border);">
          <strong style="display:block; margin-bottom:4px;">Standard Fields (Included Automatically)</strong>
          <span style="font-size:0.85rem; color:var(--text-secondary);">Name, Email, Phone, Department, Year</span>
        </div>
      `;
    }

    const listHtml = window.__currentFormFields.map((f, i) => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-secondary); padding:8px 12px; margin-bottom:8px; border-radius:4px; border:1px solid var(--border);">
        <div><strong>${f.label}</strong> <span style="font-size:0.75rem; color:var(--text-tertiary);">(${f.type}) ${f.required ? ' *Required' : ''}</span></div>
        <button class="btn-reject" style="padding:4px;" onclick="window.__removeFormField(${i})"><span class="material-symbols-outlined" style="font-size:16px;">delete</span></button>
      </div>
    `).join('');
    
    document.getElementById('fb-fieldsList').innerHTML = baselineHtml + (listHtml || '<p style="color:var(--text-tertiary); font-size:0.9rem;">No custom fields added yet.</p>');
  };

  openModal(`
    <div class="modal-header">
      <div><h2>Form Builder: ${type}</h2><p>Add custom questions to your form.</p></div>
      <button class="modal-close" onclick="window.__closeModal()"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="modal-body" style="display:flex; gap:24px; min-height:400px;">
      <div style="flex:1;">
        <h3 style="margin-bottom:12px;">Add Custom Field</h3>
        <div class="form-group"><label>Field Label (Question)</label><input type="text" id="fb-label" placeholder="e.g. Dietary Restrictions" /></div>
        <div class="form-group"><label>Input Type</label>
           <select id="fb-type">
             <option value="text">Short Text</option>
             <option value="textarea">Long Text (Paragraph)</option>
             <option value="number">Number</option>
             ${type === 'FEEDBACK' ? '<option value="rating">Rating (1-5 Stars)</option>' : ''}
           </select>
        </div>
        <div class="form-group" style="flex-direction:row; justify-content:flex-start; gap:8px;">
           <input type="checkbox" id="fb-req" style="width:auto;" /> <label for="fb-req" style="margin:0;">Required field</label>
        </div>
        <button class="btn-outline" style="width:100%; margin-top:12px;" onclick="window.__addFormField()"><span class="material-symbols-outlined">add</span> Add Field</button>
      </div>
      <div style="flex:1; border-left:1px solid var(--border); padding-left:24px; max-height:400px; overflow-y:auto;">
        <h3 style="margin-bottom:12px;">Current Custom Fields</h3>
        <div id="fb-fieldsList"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="window.__closeModal()">Cancel</button>
      <button class="btn-primary" onclick="window.__saveFormBuilder('${eventId}', '${type}')">Save Form Configuration</button>
    </div>
  `);

  window.__removeFormField = (idx) => {
    window.__currentFormFields.splice(idx, 1);
    renderFieldList();
  };

  window.__addFormField = () => {
    const label = document.getElementById('fb-label').value.trim();
    if (!label) return showToast('Label is required', 'error');
    window.__currentFormFields.push({
      label: label,
      name: label.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      type: document.getElementById('fb-type').value,
      required: document.getElementById('fb-req').checked
    });
    document.getElementById('fb-label').value = '';
    renderFieldList();
  };

  window.__saveFormBuilder = async (id, formType) => {
    try {
      await api.admin.configureForm(id, formType, window.__currentFormFields, window.__currentFormActive);
      showToast(`${formType} configuration saved!`, 'success');
      closeModal();
      loadPage();
    } catch(err) { showToast(err.message, 'error'); }
  };

  renderFieldList();
};

window.__downloadParticipantsCSV = async (eventId) => {
  try {
    const participants = await api.admin.getParticipants(eventId);
    if (!participants || participants.length === 0) return showToast('No participant data yet.', 'info');
    
    // Baseline headers
    const header = ['Name', 'Email', 'Phone', 'Department', 'Year', 'Registration Date'];
    const rows = participants.map(p => {
      return [
        p.name || 'N/A',
        p.email || 'N/A',
        p.phone || 'N/A',
        p.department || 'N/A',
        p.year || 'N/A',
        new Date(p.created_at).toLocaleString()
      ].map(field => `"${String(field).replace(/"/g, '""')}"`);
    });

    const csvContent = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event_${eventId.slice(0,6)}_participants.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) { showToast(err.message, 'error'); }
};

window.__downloadFeedbackCSV = async (eventId) => {
  try {
    const feedbacks = await api.admin.getFeedbacks(eventId);
    if (!feedbacks || feedbacks.length === 0) return showToast('No feedback data yet.', 'info');
    
    // Build headers: fixed columns + dynamic custom_data keys
    const fixedHeaders = ['Submission Date', 'Rating', 'What They Liked', 'Suggestions'];
    const customKeys = [];
    if (feedbacks.length > 0) {
      const keys = Object.keys(feedbacks[0].custom_data || {});
      keys.forEach(k => { if (!customKeys.includes(k)) customKeys.push(k); });
    }
    const header = [...fixedHeaders, ...customKeys];

    const rows = feedbacks.map(f => {
      const data = f.custom_data || {};
      const row = [
        new Date(f.created_at).toLocaleString(),
        f.rating || '',
        f.quality || '',
        f.suggestions || '',
      ];
      customKeys.forEach(k => row.push(data[k] || ''));
      return row.map(field => `"${String(field).replace(/"/g, '""')}"`);
    });

    const csvContent = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event_${eventId.slice(0,6)}_feedback.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) { showToast(err.message, 'error'); }
};

// Download participants CSV from pre-loaded data (for HOD/Principal)
window.__downloadParticipantsFromData = (participants, eventTitle) => {
  if (!participants || participants.length === 0) return showToast('No participants data.', 'info');
  const header = ['Name', 'Email', 'Phone', 'Department', 'Year', 'Registration Date'];
  const rows = participants.map(p => [
    p.name || 'N/A',
    p.email || 'N/A',
    p.phone || 'N/A',
    p.department || 'N/A',
    p.year || 'N/A',
    p.created_at ? new Date(p.created_at).toLocaleString() : 'N/A'
  ].map(field => `"${String(field).replace(/"/g, '""')}"`));
  const csvContent = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(eventTitle || 'event').replace(/[^a-zA-Z0-9]/g, '_')}_participants.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

window.__addSubcat = (catId, catName) => showAddSubcategoryModal(catId, catName);
window.__editCat = (id, name) => showEditCategoryModal(id, name);
window.__deleteCat = async (id, name) => {
  if (!confirm(`Delete category "${name}" and ALL its subcategories? This cannot be undone.`)) return;
  try { await api.hod.deleteCategory(id); showToast(`Category "${name}" deleted`, 'success'); loadPage(); }
  catch (err) { showToast(err.message, 'error'); }
};
window.__editSubcat = (id, name) => showEditSubcategoryModal(id, name);
window.__deleteSubcat = async (id, name) => {
  if (!confirm(`Delete subcategory "${name}"?`)) return;
  try { await api.hod.deleteSubcategory(id); showToast(`Subcategory "${name}" deleted`, 'success'); loadPage(); }
  catch (err) { showToast(err.message, 'error'); }
};

window.__approveEvent = async (id) => {
  try { await api.hod.reviewEvent(id, 'APPROVED'); showToast('Event approved!', 'success'); loadPage(); }
  catch (err) { showToast(err.message, 'error'); }
};
window.__rejectEvent = async (id) => {
  try { await api.hod.reviewEvent(id, 'REJECTED'); showToast('Event rejected', 'info'); loadPage(); }
  catch (err) { showToast(err.message, 'error'); }
};
window.__verifyEvent = async (id, action) => {
  try {
    await api.hod.verifyEvent(id, action);
    showToast(action === 'VERIFY' ? 'Event verified & completed!' : 'Event rejected & sent back to Admin', action === 'VERIFY' ? 'success' : 'info');
    loadPage();
  } catch (err) { showToast(err.message, 'error'); }
};
window.__triggerAI = async (id) => {
  showToast('Generating AI evaluation...', 'info');
  try { await api.hod.triggerAI(id); showToast('AI evaluation generated!', 'success'); }
  catch (err) { showToast(err.message, 'error'); }
};
window.__triggerAIAndRefresh = async (id) => {
  showToast('Generating AI evaluation...', 'info');
  try { await api.hod.triggerAI(id); showToast('AI evaluation generated!', 'success'); loadPage(); }
  catch (err) { showToast(err.message, 'error'); }
};
window.__deleteAdmin = async (id, name) => {
  if (!confirm(`Are you sure you want to remove admin "${name}"? This action cannot be undone.`)) return;
  try { await api.hod.deleteAdmin(id); showToast(`Admin "${name}" removed`, 'success'); loadPage(); }
  catch (err) { showToast(err.message, 'error'); }
};

// ===== START =====
init();

// Global password visibility toggle
document.addEventListener('click', (e) => {
  const toggle = e.target.closest('.pw-toggle');
  if (toggle) {
    const container = toggle.closest('div');
    const input = container.querySelector('input');
    if (input) {
      const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
      input.setAttribute('type', type);
      toggle.textContent = type === 'password' ? 'visibility_off' : 'visibility';
    }
  }
});

// Global table search filter
window.__filterTable = (input) => {
  const term = input.value.toLowerCase();
  const container = input.closest('.table-section') || input.closest('.detail-card') || input.closest('.glass-panel');
  if (!container) return;
  const table = container.querySelector('table');
  if (!table) return;
  const rows = table.querySelectorAll('tbody tr:not(.cat-subcats-row)');
  rows.forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
  });
};
