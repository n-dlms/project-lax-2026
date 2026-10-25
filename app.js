import { addDays, billFocus, cents, daysBetween, inferIncome, money, nextAttention, project, purchaseDecision, recordPurchase, rescuePlan, sampleData, settleEntry, todayZA, undoSettlement } from './engine.js';
import { icon } from './icons.js';
import { createEncryptedBackup, openEncryptedBackup, planSnapshot } from './backup.js';
import { restoreWorkspace, workspaceSnapshot } from './workspace.js';
import { billDateTest, billRunway, cushionScenario, dueIncome, incomeFollowupMessage, latePayRadar, patternCandidates, paydayMap, sourceTally } from './coach.js';
import { LAST_GUIDE_STEP, playCue, readLaunch, readSound, saveLaunch, saveSound } from './experience.js';
const nativeBackup = Boolean(window.Capacitor?.isNativePlatform?.());

const KEY = 'project-lax-money-confidence-v1';
const WORK_KEY = 'project-lax-workspace-v1';
const DEMO_PURCHASE_CENTS = 8000;
let today = todayZA();
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dateLabel = date => new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const amountInput = amount => (amount / 100).toFixed(2);
const uid = () => globalThis.crypto?.randomUUID?.() || `lax-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let data;
let unreadablePlan = false;
try {
  const raw = localStorage.getItem(KEY);
  const stored = JSON.parse(raw);
  planSnapshot(stored);
  const validAction = action => {
    if (!action || !Number.isSafeInteger(action.change) || !Number.isSafeInteger(action.balanceAfter)
      || action.balanceAfter < 0 || action.balanceAfter > 100_000_000 || !Number.isInteger(action.index)
      || action.index < 0 || action.index > 200 || action.id !== action.entry?.id
      || action.change !== (action.entry?.kind === 'income' ? action.entry?.amount : -action.entry?.amount)
      || typeof action.settledAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(action.settledAt)
      || Number.isNaN(Date.parse(`${action.settledAt}T12:00:00Z`))
      || new Date(`${action.settledAt}T12:00:00Z`).toISOString().slice(0, 10) !== action.settledAt) return false;
    try { planSnapshot({ version: 1, balance: 0, entries: [action.entry, ...(action.nextEntry ? [action.nextEntry] : [])], history: [] }); return true; }
    catch { return false; }
  };
  stored.activity = Array.isArray(stored.activity) ? stored.activity.filter(validAction).slice(0, 20) : [];
  data = stored;
} catch { try { unreadablePlan = !!localStorage.getItem(KEY); } catch { unreadablePlan = false; } }
const firstVisit = !data;
if (firstVisit) data = sampleData(today);
// The browser opens on Home. Android keeps its first-run film and guide;
// browser visitors can still choose "Watch the opening and guide" in Menu.
const initialLaunch = nativeBackup ? readLaunch(localStorage) : { phase: '', step: 0 };
if (initialLaunch.phase === 'film' && matchMedia('(prefers-reduced-motion: reduce)').matches) initialLaunch.phase = 'guide';
let soundEnabled = readSound(localStorage);
const clonePlan = plan => JSON.parse(JSON.stringify(plan));
let persistedData = firstVisit ? null : clonePlan(data);
let savedWorkspace = null;
try { if (!firstVisit) savedWorkspace = restoreWorkspace(localStorage.getItem(WORK_KEY), data.entries); } catch { /* start at overview */ }
const resumed = !!savedWorkspace && (savedWorkspace.guidedStart || savedWorkspace.tab !== 'overview' || savedWorkspace.focusOpen || savedWorkspace.showForm
  || savedWorkspace.purchase || savedWorkspace.spendAmount || savedWorkspace.scrollY > 200 || Object.keys(savedWorkspace.inputDrafts).length > 0);
const state = { storageFailure: false, tab: 'overview', guidedStart: false, focusOpen: false, focusedBillId: '', billDateTestId: '', billDateTestDate: '', conversationBillId: '', conversationDraft: '', payFollowupId: '', payFollowupDraft: '', cushionAmount: 0, sourceInputs: { cash: '', bank: '', other: '' }, delayId: '', delayDays: 0, purchase: 0, spendAmount: 0, includePossible: false, toast: '', showForm: false, formKind: 'expense', editId: '', formDraft: null, inputDrafts: {}, backupMode: '', restoreCandidate: null, restoreCreatedAt: '', ...(savedWorkspace || {}), welcome: true, menuOpen: false, resumeNotice: resumed, launchPhase: initialLaunch.phase, guideStep: initialLaunch.step };
let filmFallback = 0;
const isExample = () => data.demo === true || data.entries.some(entry => entry.id.startsWith('sample-'));
const hasSavedPlan = () => !!persistedData;
const blankPlan = () => ({ version: 1, demo: false, balance: 0, updated: today, horizon: 14, entries: [], history: [], cannotMoveIds: [], activity: [] });
const freshCoachDrafts = () => ({ payFollowupId: '', payFollowupDraft: '', cushionAmount: 0, sourceInputs: { cash: '', bank: '', other: '' } });

function beginOwnPlan() {
  data = blankPlan();
  Object.assign(state, { welcome: false, guidedStart: true, tab: 'overview', focusOpen: false, focusedBillId: '', delayId: '', delayDays: 0, purchase: 0, spendAmount: 0, includePossible: false, showForm: false, editId: '', formDraft: null, inputDrafts: {}, resumeNotice: false, ...freshCoachDrafts() });
  save();
  render('navigate');
  scrollTo({ top: 0, behavior: 'instant' });
  document.getElementById('guided-label')?.focus();
}

function continueSavedPlan() {
  if (!hasSavedPlan()) return;
  let resumeY = 0;
  try { resumeY = restoreWorkspace(localStorage.getItem(WORK_KEY), data.entries)?.scrollY || 0; } catch { /* open at the top */ }
  state.welcome = false;
  state.menuOpen = false;
  render('navigate');
  requestAnimationFrame(() => { scrollTo({ top: resumeY, behavior: 'instant' }); saveWorkspace(); });
  if (!resumeY) (document.getElementById(state.guidedStart ? 'guided-label' : 'spend-check') || document.querySelector('main'))?.focus({ preventScroll: true });
}

function saveWorkspace() {
  if (state.welcome || state.welcomeRestore) return;
  try { localStorage.setItem(WORK_KEY, JSON.stringify(workspaceSnapshot(state, window.scrollY))); } catch { /* plan and UI still work when optional draft storage is unavailable */ }
}

function captureFormDraft() {
  const form = document.getElementById('entry-form');
  if (!form) return;
  const fields = new FormData(form);
  state.formDraft = { kind: state.formKind, editId: state.editId, label: String(fields.get('label') || ''),
    amount: String(fields.get('amount') || ''), date: String(fields.get('date') || ''),
    class: String(fields.get('class') || ''), repeat: fields.get('repeat') === 'monthly' };
  saveWorkspace();
}

function save() {
  data.updated = todayZA();
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    persistedData = clonePlan(data);
    state.storageFailure = false;
  } catch {
    data = persistedData ? clonePlan(persistedData) : sampleData(today);
    if (!persistedData) state.welcome = true;
    state.storageFailure = true;
    state.toast = 'Your change was not saved. Browser storage may be full or unavailable. Download a backup if you have a plan here.';
    render('update');
    throw new Error(state.toast);
  }
}

function notify(message) {
  state.toast = message;
  render('update');
  setTimeout(() => { if (state.toast === message) { state.toast = ''; document.querySelector('.toast')?.remove(); } }, 4000);
}

function entryRow(entry, editable = false) {
  const income = entry.kind === 'income';
  const tag = income ? (entry.certainty === 'confirmed' ? 'Confirmed income' : 'Possible income') : (entry.essential ? entry.date < today ? 'Overdue essential bill' : entry.repeat === 'monthly' ? 'Monthly essential bill' : 'Essential bill' : 'Flexible spend');
  return `<div class="entry-row"><span class="entry-icon ${income ? 'positive' : entry.essential ? 'critical' : 'neutral'}">${income ? icon('arrow-down-left') : entry.essential ? icon('calendar-due') : icon('arrow-up-right')}</span><span class="entry-main"><strong>${esc(entry.label)}</strong><small>${dateLabel(entry.date)} · ${tag}</small></span><strong class="entry-amount ${income ? 'in' : ''}">${income ? '+' : '−'}${money(entry.amount)}</strong>${editable ? `<span class="entry-actions"><button class="settle-button" data-settle="${esc(entry.id)}" aria-label="Mark ${esc(entry.label)} ${income ? 'received' : 'paid'}">${income ? 'Received' : 'Paid'}</button><button class="edit-button" data-edit="${esc(entry.id)}" aria-label="Edit ${esc(entry.label)}">Edit</button><button class="icon-button" data-delete="${esc(entry.id)}" aria-label="Remove ${esc(entry.label)}">×</button></span>` : ''}</div>`;
}

function menuView() {
  return `<div class="menu-shell"><button type="button" class="menu-toggle" id="menu-toggle" aria-expanded="${state.menuOpen}" aria-controls="app-menu" aria-label="Project LAX menu"><span class="menu-lines" aria-hidden="true">☰</span> Menu</button><div class="app-menu" id="app-menu" ${state.menuOpen ? '' : 'hidden'}><span class="menu-label">EXPLORE</span><button type="button" data-home>Home</button><button type="button" data-tab="overview">Overview</button><button type="button" data-tab="coach">Money coach</button><button type="button" data-tab="scenario">What if ?</button><button type="button" data-tab="plan">Rescue plan</button><button type="button" data-tab="money">My money</button><span class="menu-label">EXPERIENCE</span><button type="button" data-replay-intro>Watch the opening and guide</button><button type="button" data-toggle-sound aria-pressed="${soundEnabled}">Sounds: ${soundEnabled ? 'On' : 'Off'}</button><span class="menu-label">YOUR PLAN</span><button type="button" data-backup-mode="export">${nativeBackup ? 'Share encrypted backup' : 'Download encrypted backup'}</button><button type="button" data-backup-mode="import">Restore a backup</button><button type="button" id="clear-workspace">Start a fresh view</button><button type="button" class="menu-danger" id="erase-plan">Erase my data from this ${nativeBackup ? 'app' : 'browser'}</button><p>Unfinished entries stay on this device. ${nativeBackup ? 'Share' : 'Download'} an encrypted backup to move your plan to another device.</p></div></div>`;
}

function welcomeMenuView() {
  const saved = hasSavedPlan();
  return `<div class="menu-shell welcome-menu-shell"><button type="button" class="menu-toggle" id="menu-toggle" aria-expanded="${state.menuOpen}" aria-controls="app-menu" aria-label="Project LAX menu"><span class="menu-lines" aria-hidden="true">☰</span> Menu</button><div class="app-menu" id="app-menu" ${state.menuOpen ? '' : 'hidden'}><span class="menu-label">GET STARTED</span>${saved ? `<button type="button" data-continue-plan>Continue ${isExample() ? 'example' : 'my plan'}</button>` : ''}<button type="button" data-welcome-example>Try the R80 decision</button><button type="button" data-welcome-own>${saved ? 'Start a new plan' : 'Start with my own bill'}</button><button type="button" data-replay-intro>Watch the opening and guide</button><button type="button" data-toggle-sound aria-pressed="${soundEnabled}">Sounds: ${soundEnabled ? 'On' : 'Off'}</button><span class="menu-label">YOUR PLAN</span><button type="button" id="welcome-restore">Restore an encrypted backup</button><p>The example is fictional. Your own entries stay on this device unless you choose to share a backup.</p></div></div>`;
}

function filmView() {
  return `<div class="launch-film"><div class="film-top"><span class="film-label">PROJECT LAX / WELCOME</span><button type="button" id="film-skip" aria-label="Skip opening video">Skip intro →</button></div><div class="film-frame"><video id="launch-video" autoplay muted playsinline preload="auto" poster="./assets/intro/project-lax-poster.webp" aria-label="Project LAX opening film: add a bill, test a purchase, and choose a move"><source src="./assets/intro/project-lax-intro.mp4" type="video/mp4"></video></div><p>Enter a bill. Test a choice. Update when money moves.</p><button type="button" class="film-continue" id="film-continue">Continue to guide →</button></div>`;
}

const guidePages = [
  { number: '01', eyebrow: 'START WITH THE FACTS', title: 'Add money and due dates.', copy: 'Enter what you can use now and when each essential bill is due. LAX checks the next 14 days in date order and finds the first shortfall.', visual: `<div class="guide-visual guide-timeline"><span>TODAY <b>Money on hand</b></span><i></i><span>NEXT <b>Essential bill</b></span><strong>Find the first gap.</strong></div>` },
  { number: '02', eyebrow: 'BEFORE YOU SPEND', title: 'Test a purchase.', copy: 'Type an amount before paying. LAX compares your plan before and after, names the bill affected, and shows how much its gap changes.', visual: `<div class="guide-visual guide-decision"><span>DEMO DATA</span><strong>R80 <i>→</i> next bill</strong><p>Compare before and after.</p></div>` },
  { number: '03', eyebrow: 'WHEN THERE IS A GAP', title: 'Choose what can move.', copy: 'Mark flexible costs you can delay and costs you must keep. LAX tests dated options, then shows a possible fix or the amount still uncovered.', visual: `<div class="guide-visual guide-bill"><span>RESCUE OPTIONS</span><div><b>Flexible cost</b><i>Can move</i></div><div><b>Protected cost</b><i>Keep</i></div></div>` },
  { number: '04', eyebrow: 'ALL SET', title: 'Check in when money moves.', copy: 'Mark pay received or a bill paid; LAX updates the balance once and recalculates. Your plan stays here, with an encrypted backup you can export.', visual: `<div class="guide-visual guide-ready"><span class="guide-ready-mark">L<span>/</span>X</span><strong>UPDATE THE PLAN AS YOU GO.</strong><small>Mark paid · Recalculate · Back up</small></div>` },
];

function guideView() {
  const page = guidePages[state.guideStep] || guidePages[0];
  return `<div class="launch-guide"><header class="guide-header"><span class="brand-mark">L<span class="brand-slash">/</span>X</span><span>PROJECT LAX</span><button type="button" id="guide-skip">Skip guide</button></header><main class="guide-layout"><div class="guide-copy"><span class="eyebrow">${page.eyebrow} · ${page.number} / 04</span><h1 id="guide-title" tabindex="-1">${page.title}</h1><p>${page.copy}</p><div class="guide-progress" aria-label="Guide step ${state.guideStep + 1} of 4">${guidePages.map((_, index) => `<span class="${index <= state.guideStep ? 'is-active' : ''}"></span>`).join('')}</div><div class="guide-controls">${state.guideStep ? '<button type="button" id="guide-prev">← Back</button>' : ''}<button type="button" id="guide-next">${state.guideStep === LAST_GUIDE_STEP ? 'All set · open LAX' : 'Next →'}</button></div>${state.guideStep === LAST_GUIDE_STEP ? `<button type="button" class="guide-sound" data-toggle-sound aria-pressed="${soundEnabled}">♪ Sound effects: ${soundEnabled ? 'On' : 'Off'} <span>Optional</span></button>` : ''}</div>${page.visual}</main></div>`;
}

function openGuide() {
  clearTimeout(filmFallback);
  if (!state.welcome) saveWorkspace();
  state.launchPhase = 'guide';
  state.guideStep = 0;
  state.menuOpen = false;
  saveLaunch(localStorage, '0');
  render();
  document.getElementById('guide-title')?.focus();
}

function replayIntro() {
  if (!state.welcome) saveWorkspace();
  state.menuOpen = false;
  state.launchPhase = 'film';
  render();
}

function finishGuide() {
  clearTimeout(filmFallback);
  state.launchPhase = '';
  state.menuOpen = false;
  saveLaunch(localStorage, 'done');
  playCue(soundEnabled, 'complete');
  render();
  (document.getElementById('welcome-continue') || document.getElementById('welcome-example') || document.getElementById('menu-toggle'))?.focus();
}

function nav() {
  return `<header class="site-header"><div class="wrap header-inner"><a class="brand" href="#overview" aria-label="Project LAX home"><span class="brand-mark">L<span class="brand-slash">/</span>X</span><span class="brand-name">PROJECT LAX<small>BE AHEAD OF THE BILL.</small></span></a><div class="header-right"><span class="header-location">SOUTH AFRICA · ZAR</span>${menuView()}</div></div></header><nav class="tab-nav wrap" aria-label="Main navigation"><button data-tab="overview" class="${state.tab === 'overview' ? 'selected' : ''}">Overview</button><button data-tab="coach" class="${state.tab === 'coach' ? 'selected' : ''}">Money coach</button><button data-tab="scenario" class="${state.tab === 'scenario' ? 'selected' : ''}">What if ?</button><button data-tab="plan" class="${state.tab === 'plan' ? 'selected' : ''}">Rescue plan</button><button data-tab="money" class="${state.tab === 'money' ? 'selected' : ''}">My money</button></nav>`;
}

function resumeBanner() {
  return state.resumeNotice ? `<div class="resume-banner" role="status"><div><strong>You're back where you left off.</strong><span>Your last view and any unfinished input were restored from this device.</span></div><button type="button" id="dismiss-resume" aria-label="Dismiss resume message">Got it ×</button></div>` : '';
}

function welcomeView() {
  const saved = hasSavedPlan();
  const personal = saved && !isExample();
  const demo = sampleData(today);
  const preview = purchaseDecision(demo, DEMO_PURCHASE_CENTS, today);
  const firstBill = demo.entries.find(entry => entry.kind === 'expense' && entry.essential);
  const focus = firstBill ? billFocus(demo, firstBill.id, today) : null;
  const focusAfter = firstBill ? billFocus(demo, firstBill.id, today, { purchase: DEMO_PURCHASE_CENTS }) : null;
  const gap = focus?.gap ?? preview.baseline.gap;
  const billLabel = focus?.bill.label ?? 'The first bill';
  const dueCopy = focus ? ` by ${dateLabel(focus.dueDate)}` : '';
  const nextBill = personal ? data.entries.filter(entry => entry.kind === 'expense' && entry.essential).sort((a, b) => a.date.localeCompare(b.date))[0] : null;
  const previewView = personal
    ? `<div class="welcome-preview" aria-label="Your saved plan"><span>YOUR SAVED PLAN</span><strong>${nextBill ? `${esc(nextBill.label)} · ${money(nextBill.amount)}` : 'Your first bill is ready to finish.'}</strong><p>${nextBill ? `${nextBill.date < today ? 'Was due' : 'Due'} ${dateLabel(nextBill.date)}. Continue to see it beside your other entries.` : 'Continue to add or finish a bill before checking coverage.'}</p></div>`
    : `<div class="welcome-preview" aria-label="Fictional example preview"><span>DEMO DATA · EARLY WARNING</span><strong>${esc(billLabel)} is projected ${money(gap)} short${dueCopy}.</strong><p>An R80 choice would make it ${money(focusAfter?.gap ?? preview.after.gap)}. Across the next 14 days, the largest shortfall would grow from ${money(preview.baseline.gap)} to ${money(preview.after.gap)}.</p></div>`;
  const actions = saved
    ? `<button type="button" id="welcome-continue">${personal ? state.guidedStart ? 'Continue my first bill' : 'Continue my plan' : 'Continue the example'} <span>↗</span></button><button type="button" id="welcome-own">${personal ? 'Start a new plan' : 'Make my own plan'} <span>↗</span></button>`
    : `<button type="button" id="welcome-example">Try the R80 decision <span>↗</span></button><button type="button" id="welcome-own">Start with my own bill <span>↗</span></button>`;
  return `<div class="welcome-page"><header class="welcome-header wrap"><span class="brand-mark">L<span class="brand-slash">/</span>X</span><span>PROJECT LAX</span>${welcomeMenuView()}</header><main class="wrap welcome-main"><div class="welcome-photo" aria-hidden="true"></div><div class="welcome-copy"><span class="eyebrow">${personal ? 'WELCOME BACK · YOUR PLAN' : 'YOUR MONEY · YOUR DUE DATES'}</span><h1>${personal ? 'Pick up your<br>money plan.' : 'Know what a<br>choice changes.'}</h1><p>${personal ? 'Your entries and unfinished answers are still here. Continue to test a purchase, update a payment, or review the next bill.' : 'Add money you can use and the dates bills are due. LAX checks the next 14 days, then shows which bill a purchase affects and what could close the gap.'}</p>${previewView}${unreadablePlan ? '<p role="alert">Your saved plan on this device could not be read. Starting a plan or example will replace it. If you have an encrypted backup, choose Restore an encrypted backup from the Menu.</p>' : ''}${state.storageFailure ? '<p role="alert">Browser storage is unavailable. Your plan cannot be saved on this device right now.</p>' : ''}<div class="welcome-actions">${actions}</div><button type="button" class="welcome-film" data-replay-intro>▶ Watch the opening film</button><small>No bank login. Your money entries stay on this device. An encrypted backup leaves only when you choose to share it.</small></div></main></div>`;
}

function exampleBanner() {
  return isExample() ? '<div class="example-banner"><strong>DEMO DATA</strong><span>Fictional numbers. Nothing here changes an account or moves money.</span><button type="button" id="start-own-money">Make my plan ↗</button></div>' : '';
}

function guidedStartView() {
  return `<section class="guided-start panel" aria-labelledby="guided-title"><button type="button" class="guided-back" id="guided-back">← Back to main page</button><span class="eyebrow small">YOUR NUMBERS · START HERE</span><h1 id="guided-title">One bill. One clear starting point.</h1><p>Tell LAX about one essential bill and money you can use today. Amounts stay blank until you enter them.</p><form id="guided-form"><div class="guided-field"><label for="guided-label">Which bill is coming?</label><div class="guided-chips">${['Rent', 'Electricity', 'Groceries', 'School fees', 'Transport'].map(label => `<button type="button" data-guided-bill="${label}">${label}</button>`).join('')}</div><input id="guided-label" name="label" maxlength="60" placeholder="Name your bill" required></div><div class="guided-field"><label for="guided-date">When is it due?</label><div class="guided-chips">${[['Tomorrow',1],['In 3 days',3],['Next week',7]].map(([label, days]) => `<button type="button" data-guided-days="${days}">${label}</button>`).join('')}</div><input id="guided-date" name="date" type="date" min="${today}" max="${addDays(today, 365)}" required><small class="guided-hint">LAX checks the next 14 days. A later bill is saved and checked closer to its date.</small></div><div class="guided-numbers"><div class="guided-field"><label for="guided-amount">Bill amount (R)</label><input id="guided-amount" name="amount" type="number" inputmode="decimal" min="0.01" max="1000000" step="0.01" placeholder="Enter the amount" required></div><div class="guided-field"><label for="guided-balance">Money you can use now (R)</label><input id="guided-balance" name="balance" type="number" inputmode="decimal" min="0" max="1000000" step="0.01" placeholder="Enter what is available" required></div></div><p class="guided-honesty">Not sure of a number? Your unfinished answers stay on this device. LAX waits for it before showing bill coverage.</p><p id="guided-status" class="guided-status" role="status"></p><p id="guided-error" class="form-error" role="alert"></p><button class="primary-button" type="submit">Check this bill ↗</button></form><button type="button" class="text-button" id="guided-later">I'm not sure yet · keep my draft</button></section>`;
}

function backupPanel() {
  return `<section class="panel backup-panel" aria-labelledby="backup-title"><div><div class="eyebrow small">KEEP YOUR PLAN</div><h2 id="backup-title">Take your numbers with you.</h2><p>Save an encrypted file that you can restore on another device. Only you know the passphrase; LAX cannot recover it. A backup includes your current entries and balance, but not the Undo history.</p></div><div class="backup-actions"><button type="button" id="open-backup">Download encrypted backup <span>↗</span></button><button type="button" id="open-restore">Restore from a file <span>↗</span></button></div></section>`;
}

function backupModal() {
  if (!state.backupMode) return '';
  const exportMode = state.backupMode === 'export';
  const preview = state.restoreCandidate;
  const bills = preview?.entries.filter(entry => entry.kind === 'expense' && entry.essential).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3) || [];
  return `<div class="modal-backdrop" id="backup-backdrop"><div class="modal backup-modal" role="dialog" aria-modal="true" aria-labelledby="backup-modal-title"><button type="button" class="modal-close" id="close-backup" aria-label="Close">×</button><div class="eyebrow small">${exportMode ? 'SAVE A COPY' : 'BRING BACK YOUR PLAN'}</div><h2 id="backup-modal-title">${exportMode ? 'Encrypted backup' : preview ? 'Check before restoring' : 'Restore a backup'}</h2>${exportMode ? `<p class="backup-help">Choose a passphrase you can remember. ${nativeBackup ? 'The file you share contains encrypted entries' : 'The downloaded file contains encrypted entries'}; the passphrase is never saved here.</p><form id="backup-export-form"><label class="field-label" for="backup-passphrase">Passphrase (at least 12 characters)</label><input id="backup-passphrase" type="password" autocomplete="new-password" minlength="12" required><label class="field-label" for="backup-confirm">Repeat passphrase</label><input id="backup-confirm" type="password" autocomplete="new-password" minlength="12" required><p class="form-error" id="backup-error" role="alert"></p><button class="primary-button full" type="submit">${nativeBackup ? 'Share backup' : 'Download backup'} <span>↗</span></button></form>` : preview ? `<div class="restore-preview"><div><span>Backup created</span><strong>${esc(new Date(state.restoreCreatedAt).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short' }))}</strong></div><div><span>Money on hand</span><strong>${money(preview.balance)}</strong></div><div><span>Upcoming entries</span><strong>${preview.entries.length}</strong></div><div><span>Past income entries</span><strong>${preview.history.length}</strong></div>${bills.length ? `<p><strong>Essential bills:</strong> ${bills.map(entry => esc(entry.label)).join(', ')}</p>` : '<p>No essential bills are in this backup.</p>'}</div><p class="backup-help">Restoring replaces every entry and the current balance on this device. ${nativeBackup ? 'Share' : 'Download'} a backup first if you want a copy.</p><p class="form-error" id="backup-error" role="alert"></p><div class="restore-actions"><button type="button" id="confirm-restore" class="primary-button">Replace my current plan</button><button type="button" id="cancel-restore" class="secondary-button">Cancel</button></div>` : `<p class="backup-help">Choose a Project LAX backup file and enter its passphrase. Nothing changes until you review the preview and confirm.</p><form id="backup-import-form"><label class="field-label" for="backup-file">Encrypted backup file</label><input id="backup-file" type="file" accept="${nativeBackup ? '*/*' : '.laxbackup,application/json'}" required><label class="field-label" for="restore-passphrase">Passphrase</label><input id="restore-passphrase" type="password" autocomplete="current-password" required><p class="form-error" id="backup-error" role="alert"></p><button class="primary-button full" type="submit">Preview backup <span>↗</span></button></form>`}</div></div>`;
}

function chart(rows) {
  const values = rows.map(r => r.lowBalance);
  const low = Math.min(0, ...values), high = Math.max(10000, ...values);
  const w = 660, h = 154, pad = 18;
  const x = i => pad + i * (w - pad * 2) / Math.max(1, values.length - 1);
  const y = v => h - pad - (v - low) / (high - low || 1) * (h - pad * 2);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const risk = values.findIndex(v => v < 0);
  return `<div class="chart-wrap" role="img" aria-label="14 day projected lowest daily cash balance, lowest ${esc(money(Math.min(...values)))}"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#84d6ae" stop-opacity=".35"/><stop offset="1" stop-color="#84d6ae" stop-opacity="0"/></linearGradient></defs><line x1="${pad}" y1="${y(0)}" x2="${w-pad}" y2="${y(0)}" stroke="#cbd4cd" stroke-dasharray="5 5"/><polygon class="chart-fill" points="${pad},${h-pad} ${points} ${w-pad},${h-pad}" fill="url(#area)"/><polyline class="chart-line" pathLength="1" points="${points}" fill="none" stroke="#146b57" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${risk >= 0 ? `<circle class="chart-risk" cx="${x(risk)}" cy="${y(values[risk])}" r="6" fill="#e0644a" stroke="white" stroke-width="3"/>` : ''}</svg><div class="chart-labels"><span>Today</span><span>Day 7</span><span>Day 14</span></div></div>`;
}

function spendCheck() {
  const decision = state.spendAmount ? purchaseDecision(data, state.spendAmount, today) : null;
  const bill = decision?.affectedBill;
  const name = bill ? esc(bill.label) : '';
  let title = '', detail = '', next = '';
  if (decision?.status === 'incomplete') {
    title = 'Add a bill to check against';
    detail = 'LAX needs at least one essential bill in the next 14 days before it can check this purchase.';
    next = 'Add an essential bill in My money, then try again.';
  } else if (decision?.status === 'needs-update') {
    title = 'Check an overdue bill first';
    detail = `${esc(decision.overdueBills[0].label)} was due ${dateLabel(decision.overdueBills[0].date)} and is still listed. LAX cannot call this purchase covered until you update that bill.`;
    next = 'In My money, mark it paid if you paid it, or change your entries.';
  } else if (decision?.status === 'not-on-hand') {
    title = 'That amount is not on hand today';
    detail = `You entered ${money(data.balance)} as usable money today. This purchase is ${money(state.spendAmount)}.`;
    next = decision.waitDate ? `Based on confirmed entries, try checking again on ${dateLabel(decision.waitDate)}.` : 'Avoid counting expected or possible pay as cash until it arrives.';
  } else if (decision?.status === 'existing-gap') {
    title = name ? `${name} needs attention already` : 'Your cash flow needs attention already';
    const focused = decision.affectedBill ? billFocus(data, decision.affectedBill.id, today) : null;
    const focusedAfter = decision.affectedBill ? billFocus(data, decision.affectedBill.id, today, { purchase: state.spendAmount }) : null;
    detail = focused?.gap ? `${name} is projected ${money(focused.gap)} short on ${dateLabel(focused.dueDate)} before this purchase, and ${money(focusedAfter?.gap ?? decision.after.gap)} short with it. The largest 14-day gap changes from ${money(decision.baseline.gap)} to ${money(decision.after.gap)}.` : `The largest 14-day gap changes from ${money(decision.baseline.gap)} to ${money(decision.after.gap)} with this purchase.`;
    next = 'Open the rescue plan to see which flexible costs could move.';
  } else if (decision?.status === 'creates-gap') {
    title = name ? `This could put ${name} at risk` : 'This would put your cash flow below zero';
    detail = `Buying today creates a ${money(decision.after.gap)} shortfall in your listed 14-day cash flow${decision.affectedDate ? ` by ${dateLabel(decision.affectedDate)}` : ''}.`;
    next = decision.waitDate ? `The earliest covered date to try this purchase is ${dateLabel(decision.waitDate)}, if the listed payments arrive as confirmed.` : 'No covered purchase date appears in the next 14 days. Adjust your plan first.';
  } else if (decision?.status === 'covered') {
    title = 'Your listed bills remain covered';
    detail = `${money(decision.after.safeToSpend)} is the lowest projected balance after buying this today.`;
    next = 'Check that every bill and payment is entered. Expected pay is checked after same-day bills because its arrival time is unknown. This is a planning estimate, not a guarantee.';
  }
  const demoNote = isExample() ? '<p class="demo-note" role="note"><strong>DEMO DATA</strong> Fictional numbers. This check uses no account and moves no money.</p>' : '';
  const rescueLabel = isExample() ? 'See what could close the original gap ↗' : 'See a rescue option ↗';
  const makePlan = isExample() ? '<button type="button" data-make-plan>Make my plan ↗</button>' : '';
  const actions = decision ? `<div class="verdict-actions">${['incomplete', 'needs-update'].includes(decision.status) ? '<button type="button" data-tab="money">Update my bills ↗</button>' : decision.status !== 'covered' ? `<button type="button" ${isExample() ? 'data-tab="plan"' : 'data-plan-spend'}>${rescueLabel}</button>` : ''}${makePlan}${!isExample() && !['incomplete', 'needs-update'].includes(decision.status) && state.spendAmount <= data.balance ? '<button type="button" data-record-spend>I bought it · update cash ↗</button>' : ''}</div>` : '';
  const baselineOption = decision && isExample() && decision.status === 'existing-gap' ? rescuePlan(data, {}, today) : null;
  const optionText = baselineOption?.possible && baselineOption.entries.length ? `<p class="demo-option"><strong>This rescue is for the original gap, before the ${money(state.spendAmount)} check.</strong> Moving ${money(baselineOption.entries.reduce((sum, entry) => sum + entry.amount, 0))} in flexible costs (${baselineOption.entries.map(entry => esc(entry.label)).join(' and ')}) could close the ${money(decision.baseline.gap)} shortfall, if those costs can really wait. Nothing has moved yet.</p>` : '';
  return `<section class="spend-check panel" id="spend-check" tabindex="-1"><div class="spend-intro"><div class="eyebrow small">A DECISION BEFORE YOU SPEND</div><h2>Can I buy this <em>today?</em></h2><p>See what a purchase does to the bills you entered. LAX counts confirmed pay, not hoped-for money.</p>${demoNote}</div><div class="spend-work"><form id="spend-form"><label for="spend-amount">What would it cost?</label><div class="spend-controls"><span>R</span><input id="spend-amount" type="number" inputmode="decimal" min="0.01" max="1000000" step="0.01" value="${state.spendAmount ? amountInput(state.spendAmount) : ''}" placeholder="e.g. 80.00" required><button type="submit">Check impact <span>↗</span></button></div></form><button class="example-button" id="try-80" type="button">Try a R80 purchase →</button>${decision ? `<div class="spend-verdict ${decision.status === 'covered' ? 'good' : ['incomplete', 'needs-update'].includes(decision.status) ? 'unknown' : 'caution'}" role="status"><span class="verdict-icon">${icon(decision.status === 'covered' ? 'circle-check' : 'alert-circle')}</span><div><strong>${title}</strong><p>${detail}</p>${optionText}<small>${next}</small>${actions}</div></div>` : '<p class="spend-hint">One quick check before spending can make the next bill easier to protect.</p>'}<p class="spend-disclaimer">Uses your entries on this device. No bank balance is checked and no money is reserved.</p></div></section>`;
}

function calmEntry() {
  return `<section class="calm-entry" aria-label="Choose where to start"><div><span class="calm-kicker">START WHERE YOU ARE</span><strong>What would help right now?</strong></div><div class="calm-actions"><button type="button" id="open-bill-focus" aria-expanded="${state.focusOpen}" aria-controls="bill-focus">One bill worries me <span>↗</span></button><button type="button" data-scroll="spend-check">Can I spend this? <span>↗</span></button><button type="button" data-tab="coach">Help me plan <span>↗</span></button><button type="button" data-scroll="forecast">Show the full picture <span>↗</span></button></div></section>`;
}

function nextMoveCard() {
  const attention = nextAttention(data, today);
  const entry = attention.entry;
  let title, detail, action;
  if (attention.type === 'overdue-bill') {
    title = `Check ${esc(entry.label)}`;
    detail = `It was due ${dateLabel(entry.date)}. If you paid it, update LAX now; otherwise look at your options for this bill.`;
    action = entry.amount <= data.balance
      ? `<button type="button" data-settle="${esc(entry.id)}">I paid it ↗</button><button type="button" data-focus-bill="${esc(entry.id)}">Check this bill</button>`
      : `<button type="button" data-focus-bill="${esc(entry.id)}">Check this bill ↗</button>`;
  } else if (attention.type === 'due-income') {
    title = `Did ${esc(entry.label)} arrive?`;
    detail = `You expected ${money(entry.amount)} by ${dateLabel(entry.date)}. Count it only after it reaches you.`;
    action = `<button type="button" data-settle="${esc(entry.id)}">Yes, I received it ↗</button><button type="button" data-tab="money">Update payment</button>`;
  } else if (attention.type === 'upcoming-bill') {
    const days = daysBetween(today, entry.date);
    title = `${esc(entry.label)} ${days === 0 ? 'is due today' : days === 1 ? 'is due tomorrow' : `is due ${dateLabel(entry.date)}`}`;
    detail = days > (data.horizon ?? 14)
      ? `${money(entry.amount)} is saved for next month. Check its amount now; the coverage check opens when it enters your 14-day view.`
      : `${money(entry.amount)} is listed. Check what your confirmed money can cover before it is due${entry.repeat === 'monthly' ? '; next month’s bill will appear after you mark this one paid' : ''}.`;
    action = days > (data.horizon ?? 14) ? '<button type="button" data-tab="money">Review my bills ↗</button>'
      : `<button type="button" data-focus-bill="${esc(entry.id)}">Check this bill ↗</button>${days === 0 && entry.amount <= data.balance ? `<button type="button" data-settle="${esc(entry.id)}">I paid it</button>` : ''}`;
  } else {
    title = 'Start with the bill that matters most.';
    detail = 'Add one amount and due date. You can build the rest of your picture later.';
    action = '<button type="button" data-add-kind="expense">Add a bill ↗</button>';
  }
  return `<section class="next-move panel" aria-label="Your next money check-in"><div class="next-move-copy"><span class="eyebrow small">ONE USEFUL STEP TODAY</span><h2>${title}</h2><p>${detail}</p></div><div class="next-move-actions">${action}</div></section>`;
}

function billFocusView() {
  const bills = data.entries.filter(e => e.kind === 'expense' && e.essential).sort((a, b) => a.date.localeCompare(b.date));
  const selected = bills.find(e => e.id === state.focusedBillId) || bills[0];
  if (selected) state.focusedBillId = selected.id;
  const focus = selected ? billFocus(data, selected.id, today) : null;
  let title = '', detail = '', next = '';
  if (!focus) {
    title = 'Start with one bill';
    detail = 'Add its amount and due date. You can begin with only this bill and money you can use today.';
    next = '<button type="button" class="focus-link" data-add-kind="expense">+ Add a bill</button>';
  } else if (focus.status === 'outside-window') {
    title = `${esc(selected.label)} is beyond this 14-day check`;
    detail = `It is listed for ${dateLabel(selected.date)}. LAX checks the next 14 days, so come back closer to its due date or use the full picture to prepare.`;
  } else if (focus.status === 'overdue') {
    title = `First, check ${esc(selected.label)}`;
    detail = `It was listed for ${dateLabel(selected.date)}. The forecast treats it as due today, but its status needs updating before you rely on an answer.`;
    next = `<button type="button" class="focus-link" data-tab="money">Mark it paid or change its date ↗</button>`;
  } else if (focus.status === 'covered') {
    title = `${esc(selected.label)} looks covered`;
    detail = `Based on the bills and confirmed income you entered, the projected balance stays at or above R0 through ${dateLabel(focus.dueDate)}. Check for any missing costs.`;
    next = `<button type="button" class="focus-link" data-tab="money">Check my entries ↗</button>`;
  } else {
    const focusedData = { ...data, horizon: daysBetween(today, focus.dueDate) };
    const option = rescuePlan(focusedData, {}, today);
    title = `${money(focus.gap)} needs attention by ${dateLabel(focus.dueDate)}`;
    detail = `Your listed cash flow falls below R0 before or on ${esc(selected.label)}'s due date. Only confirmed income counts here.`;
    next = option.possible && option.entries.length
      ? `<span>One option: ${option.entries.map(e => `move ${esc(e.label)} (${money(e.amount)})`).join(' and ')}. Only do this if those costs can wait.</span><button type="button" class="focus-link" data-tab="plan">See the full rescue plan ↗</button>`
      : `<span>The listed flexible costs do not close this gap. Contact the bill provider early about your options, or update any confirmed income you have left out.</span><button type="button" class="focus-link" data-tab="money">Update my entries ↗</button>`;
  }
  let dateTest = '';
  if (focus?.status === 'gap' && selected.date < addDays(today, data.horizon ?? 14)) {
    let result = null;
    if (state.billDateTestId === selected.id && state.billDateTestDate) {
      try { result = billDateTest(data, selected.id, state.billDateTestDate, today); }
      catch { state.billDateTestId = ''; state.billDateTestDate = ''; }
    }
    const candidates = Array.from({ length: daysBetween(selected.date, addDays(today, data.horizon ?? 14)) }, (_, index) => addDays(selected.date, index + 1));
    const suggested = candidates.find(date => billDateTest(data, selected.id, date, today).simulated.gap < focus.gap)
      || candidates[Math.min(2, candidates.length - 1)];
    const resultText = result ? result.simulated.gap === 0
      ? `If ${esc(selected.label)} were due ${dateLabel(state.billDateTestDate)}, its gap through that date would be R0 instead of ${money(result.original.gap)}. ${result.simulatedForecast.gap ? `The full 14-day plan would still have a ${money(result.simulatedForecast.gap)} gap elsewhere.` : 'The full 14-day plan would have no projected gap from your listed entries.'}`
      : `If ${esc(selected.label)} were due ${dateLabel(state.billDateTestDate)}, its gap through that date would be ${money(result.simulated.gap)} instead of ${money(result.original.gap)}. ${result.simulatedForecast.gap ? `The full 14-day plan would still have a ${money(result.simulatedForecast.gap)} gap.` : ''}` : '';
    dateTest = `<section class="date-test" aria-labelledby="date-test-title"><span class="calm-kicker">TEST AN OPTION</span><h3 id="date-test-title">Would a later due date help?</h3><p>${esc(selected.label)} is listed for ${dateLabel(selected.date)}. Compare a date you could ask the provider about. This does not change your bill.</p><form id="bill-date-form"><label for="bill-date-input">Date to test</label><div class="date-test-controls"><input id="bill-date-input" type="date" min="${addDays(selected.date, 1)}" max="${addDays(today, data.horizon ?? 14)}" value="${esc(result ? state.billDateTestDate : suggested)}" required><button type="submit">Compare dates ↗</button></div></form>${result ? `<div class="date-test-result" role="status"><strong>${result.simulated.gap < result.original.gap ? 'A later date could reduce this gap.' : 'This date does not reduce this bill’s gap.'}</strong><p>${resultText}</p><small>This is a simulation. Your original due date remains ${dateLabel(selected.date)} until the provider confirms a change and you update it here. Confirmed pay may arrive later than listed; same-day bills are checked before pay.</small><button type="button" id="ask-date-change">Prepare a request for this date ↗</button></div>` : '<small>Only dates within LAX’s 14-day check can be compared here. Ask about any fees or consequences before agreeing.</small>'}</section>`;
  }
  const conversation = focus && ['gap', 'overdue'].includes(focus.status) ? `<details class="bill-conversation" id="bill-conversation"><summary>Prepare a conversation about this bill <span>↗</span></summary><div class="conversation-body"><p>Contact the provider through a number or channel you trust. Ask what is possible before agreeing to a change.</p><label for="conversation-draft">A starting message you can edit</label><textarea id="conversation-draft" rows="6">${esc(state.conversationBillId === selected.id ? state.conversationDraft : billConversation(selected))}</textarea><button type="button" id="copy-conversation">Copy my message</button><small>LAX does not contact the provider or change the bill. An arrangement only exists after the provider agrees. If this is a credit repayment and you cannot meet your obligations, the <a href="https://www.ncr.org.za/" target="_blank" rel="noopener noreferrer">National Credit Regulator</a> explains debt counselling and registered help.</small><div class="conversation-followup"><strong>Did the provider confirm a change?</strong><p>Update the due date or amount only after they agree, then LAX will check your plan again.</p><button type="button" data-edit="${esc(selected.id)}">Update this bill ↗</button></div></div></details>` : '';
  const oneBillNext = selected && data.entries.length === 1 && !data.entries.some(entry => entry.kind === 'income') ? `<div class="focus-next-step"><strong>One bill is a start.</strong><p>Add the payment you are waiting for, or another essential bill, to see whether the dates work together.</p><div><button type="button" data-add-kind="income">+ Add expected pay</button><button type="button" data-add-kind="expense">+ Add another bill</button></div></div>` : '';
  return `<section class="bill-focus panel" id="bill-focus" tabindex="-1" aria-label="One bill at a time"><div class="focus-top"><div><span class="calm-kicker">ONE BILL AT A TIME</span><h2>Take one small step.</h2><p>You can look at one bill without sorting out everything today.</p></div><button type="button" id="close-bill-focus" aria-label="Close one bill view">Close ×</button></div><div class="focus-grid"><div class="focus-inputs">${selected ? `<label for="focus-bill-select">Which bill is on your mind?</label><select id="focus-bill-select">${bills.map(e => `<option value="${esc(e.id)}" ${e.id === selected.id ? 'selected' : ''}>${esc(e.label)} · ${money(e.amount)} · ${dateLabel(e.date)}</option>`).join('')}</select><button type="button" class="focus-add" data-add-kind="expense">+ Add another bill</button>` : '<p>No essential bills entered yet.</p>'}<form id="focus-balance-form"><label for="focus-balance-input">Money I can use today</label><div class="focus-money"><span>R</span><input id="focus-balance-input" type="number" inputmode="decimal" min="0" max="1000000" step="0.01" value="${amountInput(data.balance)}" required><button type="submit">Update</button></div></form><small>Include usable cash and bank money. Leave out expected pay until it arrives.</small></div><div class="focus-answer ${focus?.status === 'covered' ? 'covered' : ''}" role="status"><span class="calm-kicker">WHAT YOUR ENTRIES SAY</span><h3>${title}</h3><p>${detail}</p>${selected && data.entries.length === 1 ? '<small class="focus-scope">This answer covers only the bill you entered. Other bills and expected pay will change it.</small>' : ''}<div class="focus-next">${next}</div></div></div>${oneBillNext}${dateTest}${conversation}</section>`;
}

function billConversation(bill) {
  if (bill.date < today) return `Hello. My records show a ${bill.label} payment of ${money(bill.amount)} due ${dateLabel(bill.date)}. Could you please confirm its status? If it remains due, what options are available? Please explain any fees, interest, or other consequences, and how an agreed arrangement would be confirmed in writing. Thank you.`;
  return `Hello. I am contacting you about my ${bill.label} payment of ${money(bill.amount)} due ${dateLabel(bill.date)}. I may have difficulty paying the full amount on that date. What options are available? Please explain any fees, interest, or other consequences, and how an agreed arrangement would be confirmed in writing. Thank you.`;
}

function overview(baseline, predicted) {
  const risk = baseline.firstRisk;
  const possible = data.entries.filter(e => e.kind === 'income' && e.certainty === 'possible' && e.date >= today && e.date <= baseline.end).reduce((n, e) => n + e.amount, 0);
  const bills = data.entries.filter(e => e.kind === 'expense' && e.essential && e.date <= baseline.end).sort((a, b) => a.date.localeCompare(b.date));
  const overdueBills = data.entries.filter(e => e.kind === 'expense' && e.essential && e.date < today);
  const missingBills = bills.length === 0;
  const needsUpdate = missingBills || overdueBills.length > 0;
  return `${calmEntry()}${nextMoveCard()}${state.focusOpen ? billFocusView() : `<section class="hero-grid"><div class="hero-copy"><div class="eyebrow"><span class="eyebrow-line"></span> YOUR NEXT 14 DAYS</div><h1>Know before<br><em>money gets tight.</em></h1><p>See whether your essentials are covered, even when income comes in pieces. Change a date. Try a decision. Make a plan.</p><div class="hero-actions"><button class="primary-button" data-scroll="spend-check">Check a purchase <span>↘</span></button><button class="hero-secondary" data-tab="scenario">Test a late payment or purchase ↗</button></div><div class="privacy-note">${icon('shield-lock')} &nbsp; No bank connection. Entries stay in this browser; make a backup in My money.</div></div><div class="hero-stage"><div class="hero-photo" aria-hidden="true"></div><div class="status-card"><div class="card-top"><span>THE EARLY WARNING</span><span class="card-dots">● ● ●</span></div><div class="status-body"><div class="status-icon ${risk || needsUpdate ? 'risk' : 'clear'}">${risk || needsUpdate ? icon('alert-circle') : icon('circle-check')}</div><div><span class="status-kicker">${risk ? 'SHORTFALL AHEAD' : overdueBills.length ? 'OVERDUE BILL NEEDS UPDATE' : missingBills ? 'PLAN INCOMPLETE' : 'ESSENTIALS COVERED'}</span><strong>${risk ? `${money(baseline.gap)} at risk` : overdueBills.length ? `Update ${esc(overdueBills[0].label)}` : missingBills ? 'Add essential bills' : 'On track for now'}</strong><p>${risk ? overdueBills.length ? `This forecast treats overdue ${esc(overdueBills[0].label)} as due now. Mark it paid or edit its date.` : `First below zero ${dateLabel(risk.date)}. ${risk.bills.length ? `${esc(risk.bills.join(' and '))} is due that day.` : 'Money runs below zero that day.'}` : overdueBills.length ? `This bill was due ${dateLabel(overdueBills[0].date)}. Mark it paid or edit its date before trusting the forecast.` : missingBills ? 'We cannot assess bill coverage until you add at least one essential payment.' : 'With the confirmed money and expenses you entered.'}</p></div></div><div class="status-footer"><span>Money on hand <strong>${money(data.balance)}</strong></span><span>Estimated room <strong>${needsUpdate ? '—' : money(baseline.safeToSpend)}</strong></span></div></div></div></section>`}${spendCheck()}<section class="dashboard-grid" id="forecast"><article class="panel forecast-panel"><div class="panel-heading"><div><div class="eyebrow small">CASH FLOW FORECAST</div><h2>See the pressure before it arrives.</h2></div><span class="live-indicator"><span></span> UPDATES WITH YOUR ENTRIES</span></div>${chart(baseline.rows)}<p class="panel-footnote">Only confirmed income counts. Same-day bills are checked before expected pay. Possible income (${money(possible)}) and pattern estimates stay outside your safe balance.</p></article><article class="panel bills-panel"><div class="panel-heading"><div><div class="eyebrow small">COMING UP</div><h2>Essential bills</h2></div><span class="count-pill">${bills.length} bills</span></div>${bills.length ? bills.map(e => entryRow(e)).join('') : '<p class="empty">Add a bill to see it here.</p>'}<button class="text-button" data-tab="money">Edit money & bills <span>↗</span></button></article></section><section class="insight-strip"><div class="insight-icon">${icon('sparkles')}</div><div><strong>${predicted.length ? 'There is a pattern. It is still only a clue.' : 'No income pattern yet.'}</strong><p>${predicted.length ? `Your ${esc(predicted[0].label)} entries suggest about ${money(predicted[0].amount)} around ${dateLabel(predicted[0].date)} (${predicted[0].confidence}). We do not count it until you confirm it.` : 'Add at least three recent payments on separate dates from one source to reveal a pattern. Predictions never count as confirmed money.'}</p></div><button data-tab="money">View history ↗</button></section>`;
}

function scenarioView(baseline, current, confirmed) {
  const change = current.min - baseline.min;
  const hasEssential = data.entries.some(entry => entry.kind === 'expense' && entry.essential && entry.date <= current.end);
  const hasOverdue = data.entries.some(entry => entry.kind === 'expense' && entry.essential && entry.date < today);
  return `<section class="section-heading photo-heading scenario-heading"><div class="eyebrow"><span class="eyebrow-line"></span> TRY A CHANGE</div><h1>Test a change.<br><em>See the consequence.</em></h1><p>Nothing here changes your real accounts. These controls recalculate your 14-day forecast using your entries.</p></section><div class="two-column"><article class="panel form-panel"><div class="panel-heading"><div><div class="eyebrow small">01 / MONEY ARRIVING LATE</div><h2>What if payday moves?</h2></div></div><label class="field-label" for="income-select">Choose a confirmed payment</label><select id="income-select"><option value="">No delay</option>${confirmed.map(e => `<option value="${esc(e.id)}" ${state.delayId === e.id ? 'selected' : ''}>${esc(e.label)} · ${money(e.amount)} · ${dateLabel(e.date)}</option>`).join('')}</select><div class="range-heading"><label for="delay-range">Days late</label><strong>${state.delayDays} ${state.delayDays === 1 ? 'day' : 'days'}</strong></div><input id="delay-range" type="range" min="0" max="10" step="1" value="${state.delayDays}" ${state.delayId ? '' : 'disabled'}><div class="divider"></div><div class="eyebrow small">02 / A PURCHASE TODAY</div><h2>Can I still afford this?</h2><label class="field-label" for="purchase-amount">Purchase amount (rand)</label><div class="money-input"><span>R</span><input id="purchase-amount" type="number" inputmode="decimal" min="0" max="1000000" step="0.01" value="${state.purchase ? amountInput(state.purchase) : ''}" placeholder="e.g. 80.00"></div><label class="check-row"><input id="include-possible" type="checkbox" ${state.includePossible ? 'checked' : ''}><span>Show the optimistic case with possible income <small>For comparison only. It is not guaranteed.</small></span></label></article><article class="panel result-panel"><div class="eyebrow small">YOUR NEW OUTLOOK</div><div class="result-number ${current.gap ? 'warning' : ''}">${current.gap ? money(current.gap) : money(current.safeToSpend)}</div><div class="result-caption">${state.includePossible ? (current.gap ? 'optimistic shortfall, including possible income' : 'optimistic room, including possible income — not safe to spend') : (current.gap ? 'largest shortfall in the next 14 days' : !hasEssential ? 'plan incomplete — add an essential bill' : hasOverdue ? 'overdue bill needs update — room not verified' : 'estimated room to spend after listed bills')}</div><div class="comparison ${change < 0 ? 'down' : 'up'}">${change === 0 ? 'No change from your starting forecast' : `${change < 0 ? '↓' : '↑'} ${money(Math.abs(change))} ${change < 0 ? 'less cover' : 'more cover'} than your starting forecast`}</div>${chart(current.rows)}<p class="panel-footnote">This estimate is only as complete as your entries. The rescue plan uses confirmed income only.</p><button class="primary-button full" data-tab="plan">Build my rescue plan <span>↗</span></button></article></div>`;
}

function planView(current, plan) {
  const risk = current.firstRisk;
  const overdue = data.entries.filter(entry => entry.kind === 'expense' && entry.essential && entry.date < today);
  const hasEssential = data.entries.some(entry => entry.kind === 'expense' && entry.essential && entry.date <= current.end);
  const projected = current.rows.flatMap(row => row.entries);
  const income = projected.filter(e => e.kind === 'income').reduce((sum, e) => sum + e.amount, 0);
  const expenses = projected.filter(e => e.kind === 'expense').reduce((sum, e) => sum + e.amount, 0);
  const steps = plan.entries.map((e, i) => {
    const purchase = e.id === 'scenario-purchase';
    return `<div class="plan-step" style="--step:${i}"><span class="step-number">${String(i + 1).padStart(2, '0')}</span><div><strong>${purchase ? 'Skip this what-if purchase' : `Move ${esc(e.label)} to after ${dateLabel(current.end)}`}</strong><p>${purchase ? `Keeping ${money(e.amount)} today would cover more of your bills.` : `That keeps ${money(e.amount)} available for bills. Check if this cost can really wait.`}</p><button type="button" class="cannot-move-button" data-cannot-move="${esc(e.id)}">I can’t move this</button></div></div>`;
  }).join('');
  const locked = (data.cannotMoveIds || []).map(id => id === 'scenario-purchase' ? state.purchase > 0 ? { id, label: 'What-if purchase' } : null : data.entries.find(e => e.id === id && e.kind === 'expense' && !e.essential)).filter(Boolean);
  const demoPlanNote = isExample() ? `<p class="plan-demo-note" role="note"><strong>DEMO DATA</strong> This rescue uses the fictional example${state.spendAmount ? ` and addresses the original gap, before the ${money(state.spendAmount)} check` : ''}. Nothing has moved.</p>` : '';
  const movableTotal = plan.entries.reduce((sum, entry) => sum + entry.amount, 0);
  const planTotal = plan.possible && plan.entries.length ? `<p class="plan-total">${money(movableTotal)} in suggested changes could close the ${money(current.gap)} projected gap, if you can make those changes.</p>` : '';
  return `<section class="section-heading photo-heading plan-heading"><div class="eyebrow"><span class="eyebrow-line"></span> YOUR RESCUE PLAN</div><h1>Small moves.<br><em>More breathing room.</em></h1><p>${isExample() ? 'A plan using fictional example numbers.' : 'A plan grounded in the numbers you entered.'} LAX never moves money or cancels a payment for you. Possible income is excluded, even if you explored the optimistic scenario.</p></section><div class="plan-grid"><article class="panel plan-main">${demoPlanNote}<div class="plan-banner ${risk || overdue.length || !hasEssential ? 'at-risk' : 'all-clear'}"><span class="plan-symbol">${risk || overdue.length || !hasEssential ? icon('alert-circle') : icon('circle-check')}</span><div><span class="eyebrow small">${risk || overdue.length || !hasEssential ? 'ACTION NEEDED' : 'LOOKING STEADY'}</span><h2>${risk ? `${money(current.gap)} gap to close` : overdue.length ? 'Update an overdue bill' : !hasEssential ? 'Add an essential bill' : 'No projected shortfall'}</h2><p>${risk ? `Your balance first dips below zero ${dateLabel(risk.date)}.` : overdue.length ? `${esc(overdue[0].label)} is treated as due now until you mark it paid or edit its date.` : !hasEssential ? 'Without an essential bill in this 14-day view, LAX cannot assess coverage.' : 'Your listed essentials are covered under this scenario.'}</p></div></div>${risk ? `<div class="steps-title">${plan.possible ? 'One workable option' : 'What you can change now'}</div>${steps || '<p class="empty">No other flexible costs are available to move before the shortfall.</p>'}${planTotal}${locked.length ? `<div class="locked-costs"><strong>Costs you said cannot move</strong>${locked.map(e => `<div><span>${esc(e.label)} stays in your forecast.</span><button type="button" data-can-move="${esc(e.id)}">I can move this after all</button></div>`).join('')}</div>` : ''}<div class="plan-outcome ${plan.possible ? 'solved' : 'unsolved'}"><strong>${plan.possible ? 'Projected gap if you move these: R0' : `${money(plan.remaining)} still uncovered`}</strong><span>${plan.possible ? 'This is a simulation. You choose whether to change the spending.' : plan.truncated ? 'LAX checked the first 14 flexible expenses; review the rest too. Contact the bill provider early or confirm additional income.' : 'The listed flexible changes do not close the gap. Contact the bill provider early or confirm additional income. Do not assume a loan is the answer.'}</span></div>` : `<div class="steps-title">Keep it current</div><p class="calm-copy">${overdue.length ? 'Your balance covers the listed bills if this overdue amount is still due. Update its status before relying on this plan.' : !hasEssential ? 'Add a bill and due date to test whether your money covers it.' : 'Your entered essentials are covered. Add any missing bill or delayed payment, then test a change again.'}</p>`}${isExample() ? '<button class="primary-button" data-make-plan>Make my plan with my numbers <span>↗</span></button>' : '<button class="secondary-button" data-tab="money">Update my entries <span>↗</span></button>'}</article><aside class="panel method-panel"><div class="eyebrow small">SHOW THE MATH</div><h2>How LAX works</h2><div class="math-line"><span>Money available now</span><strong>${money(data.balance)}</strong></div><div class="math-line"><span>Confirmed incoming in 14 days</span><strong>+${money(income)}</strong></div><div class="math-line"><span>Listed expenses in 14 days</span><strong>−${money(expenses)}</strong></div><div class="math-note">We check the lowest balance each day. If a bill and expected pay share a date, we check the bill first because the pay may arrive later. Enough money by day 14 may still arrive too late for rent. The values above reflect any late-pay or purchase scenario you have set. A rescue option is a simulation until you change your entries.</div><div class="trust-box"><span>${icon('shield-lock')}</span><p>Predicted income is a signal, not cash. This is a planning tool, not a payment service or financial advice.</p></div></aside></div>`;
}

function paydayView(baseline) {
  const map = paydayMap(data, today);
  const radar = latePayRadar(data, today);
  const protectedPercent = data.balance ? Math.round(map.protectedNow / data.balance * 100) : 0;
  const firstBill = map.essentials[0];
  const mapDetail = map.status === 'needs-bill' ? 'Add an essential bill before LAX can work out what today’s money needs to cover.'
    : map.status === 'needs-update' ? `${esc(firstBill.label)} is overdue. Update its status before relying on this split.`
      : map.gap ? `Even if all money on hand goes toward essentials, ${money(map.gap)} is still missing in this 14-day plan.`
        : `${money(map.remainder)} remains after the essential-bill need, before other spending. The full forecast ${baseline.gap ? `still has a ${money(baseline.gap)} gap` : 'has no listed gap'}.`;
  const radarDetail = radar.status === 'sensitive'
    ? `If ${esc(radar.entry.label)} arrives three days late, the largest listed gap grows by ${money(radar.gapIncrease)} to ${money(radar.delayedGap)}.`
    : radar.status === 'no-extra-gap' ? `A three-day delay to the listed confirmed payments adds no further gap in this 14-day test${radar.baselineGap ? `; your current plan already has a ${money(radar.baselineGap)} gap` : ''}. This is not a promise that pay will arrive.`
      : 'Add a dated confirmed payment to see what a three-day delay would change. Possible income is never counted as bill cover.';
  return `<section class="payday-map panel" aria-labelledby="payday-title"><div class="payday-main"><span class="eyebrow small">TODAY’S MONEY SPLIT</span><h2 id="payday-title">What needs today’s money first?</h2><p>After marking pay received, this view recalculates from your actual money on hand. It plans; it does not move or reserve money.</p><div class="payday-number"><span>Money needed on hand now for listed essentials</span><strong>${map.status === 'needs-bill' ? 'Add a bill first' : money(map.neededToday)}</strong></div>${map.status !== 'needs-bill' ? `<div class="payday-track" role="img" aria-label="${protectedPercent}% of money on hand needed for listed essential bills"><span style="width:${protectedPercent}%"></span></div>` : ''}<p class="payday-detail">${mapDetail}</p><div class="payday-actions"><button type="button" ${map.status === 'needs-bill' ? 'data-add-kind="expense"' : 'data-tab="money"'}>${map.status === 'needs-bill' ? 'Add an essential bill' : 'Mark money received'} ↗</button><button type="button" data-scroll="coach-runway">Check each bill ↗</button></div></div><aside class="payday-radar"><span class="eyebrow small">A QUICK WHAT-IF</span><h3>What if pay is late?</h3><p>${radarDetail}</p>${radar.entry ? `<button type="button" data-try-delay="${esc(radar.entry.id)}">Try the three-day delay ↗</button>` : '<button type="button" data-tab="money">Add expected pay ↗</button>'}<small>This is a what-if test, not a prediction of anyone’s payment behaviour.</small></aside></section>`;
}

function coachView(baseline) {
  const runway = billRunway(data, today);
  const overdueBill = runway.find(({ focus }) => focus.status === 'overdue')?.entry;
  const arrived = dueIncome(data, today);
  const pay = arrived.find(entry => entry.id === state.payFollowupId) || arrived[0];
  const patterns = patternCandidates(data, today);
  const keepAside = Math.min(state.cushionAmount, data.balance);
  const cushion = cushionScenario(data, keepAside, today);
  let sourceTotal = 0, sourceError = '';
  try { sourceTotal = sourceTally(state.sourceInputs); } catch (error) { sourceError = error.message; }
  const sourceStarted = Object.values(state.sourceInputs).some(value => value !== '');
  const activity = (data.activity || []).slice(0, 5);
  const leadTitle = baseline.gap ? `${money(baseline.gap)} needs a plan` : overdueBill ? `Update ${esc(overdueBill.label)} first` : runway.length ? 'Your listed bills have cover' : 'Add a bill to check your cover';
  const leadDetail = baseline.gap ? `Your first projected shortfall is ${dateLabel(baseline.firstRisk.date)}. The tools below help you check what can change.` : overdueBill ? 'An overdue bill is still listed. Mark it paid or update its date before relying on a coverage answer.' : runway.length ? 'This depends on complete entries and confirmed payments arriving as listed.' : 'There is no essential bill in your next 14 days. Add one to see when money may run short.';
  return `<section class="section-heading photo-heading coach-heading"><div class="eyebrow"><span class="eyebrow-line"></span> YOUR MONEY COACH</div><h1>One clear move<br><em>at a time.</em></h1><p>Start with the numbers you know. Try a choice, check the consequence, and decide what to do next.</p></section><div class="coach-lead panel"><div><span class="eyebrow small">YOUR NEXT 14 DAYS</span><h2>${leadTitle}</h2><p>${leadDetail}</p></div><button type="button" data-tab="money">Check my entries ↗</button></div>${paydayView(baseline)}
  <div class="coach-grid">
  <article class="panel coach-card coach-runway" id="coach-runway"><div class="coach-card-head"><span>01 / BILL RUNWAY</span><h2>Which bill needs attention first?</h2><p>Each answer uses confirmed money and the lowest balance through that bill's due date.</p></div><div class="runway-list">${runway.length ? runway.map(({ entry, focus }) => `<div class="runway-row"><div><small>${dateLabel(entry.date)} · ${money(entry.amount)}</small><strong>${esc(entry.label)}</strong></div><span class="runway-status ${focus.status === 'covered' ? 'clear' : 'risk'}">${focus.status === 'covered' ? 'Covered in this plan' : focus.status === 'overdue' ? 'Update overdue bill' : `${money(focus.gap)} gap through due date`}</span><button type="button" data-focus-bill="${esc(entry.id)}">Check ↗</button></div>`).join('') : '<p class="empty">No essential bills are listed in the next 14 days. Add one to see its runway.</p>'}</div><button type="button" class="text-button" data-add-kind="expense">+ Add an essential bill</button></article>
  <article class="panel coach-card coach-cushion"><div class="coach-card-head"><span>02 / KEEP-ASIDE TEST</span><h2>Could I keep a small cushion?</h2><p>Try holding back part of today's money. This is a simulation; no money is moved.</p></div><form id="cushion-form"><label for="cushion-amount">Amount to keep aside</label><div class="coach-money-field"><div class="coach-amount-input"><span aria-hidden="true">R</span><input id="cushion-amount" type="number" inputmode="decimal" min="0" max="${amountInput(data.balance)}" step="0.01" value="${esc(state.inputDrafts['cushion-amount'] ?? amountInput(state.cushionAmount))}" required></div><button type="submit">Test it</button></div></form><div class="cushion-result" role="status"><strong>${state.cushionAmount > data.balance ? 'Recheck your cushion amount' : keepAside ? `With ${money(keepAside)} kept aside` : 'Start with an amount you can spare'}</strong><p>${state.cushionAmount > data.balance ? 'Your last amount is above money on hand. Enter a smaller amount to test again.' : !runway.length ? 'Add an essential bill before treating this as bill cover.' : overdueBill ? 'Update the overdue bill before relying on a cushion result.' : keepAside ? cushion.withCushion.gap ? `The largest projected bill gap becomes ${money(cushion.withCushion.gap)} (${money(cushion.withCushion.gap - cushion.usual.gap)} more than your current plan). Keep essentials in view first.` : `Your listed bills still have cover. The lowest projected balance outside the cushion is ${money(cushion.withCushion.safeToSpend)}.` : 'LAX will compare the bill forecast with and without that cushion.'}</p></div></article>
  <article class="panel coach-card coach-sources"><div class="coach-card-head"><span>03 / MONEY IN DIFFERENT PLACES</span><h2>Bring cash and accounts together.</h2><p>Use a one-time tally to set money on hand. Recheck it after money moves.</p></div><form id="source-form"><div class="source-fields"><label>Cash you can use<input name="cash" type="number" inputmode="decimal" min="0" max="1000000" step="0.01" value="${esc(state.sourceInputs.cash)}" placeholder="0.00"></label><label>Bank money you can use<input name="bank" type="number" inputmode="decimal" min="0" max="1000000" step="0.01" value="${esc(state.sourceInputs.bank)}" placeholder="0.00"></label><label>Other usable money<input name="other" type="number" inputmode="decimal" min="0" max="1000000" step="0.01" value="${esc(state.sourceInputs.other)}" placeholder="0.00"></label></div><div class="source-total"><span>Worksheet total</span><strong id="source-total">${sourceError ? 'Check amounts' : money(sourceTotal)}</strong></div><p class="source-note" id="source-note">${sourceError ? esc(sourceError) : sourceStarted && sourceTotal !== data.balance ? `Your current money-on-hand figure is ${money(data.balance)}. Use the total only if this fresh tally is correct.` : 'Expected payments belong in income entries, not here.'}</p><button type="submit" class="coach-action">Use this total as money on hand ↗</button></form></article>
  <article class="panel coach-card coach-pay"><div class="coach-card-head"><span>04 / INCOME FOLLOW-UP</span><h2>What if expected pay has not arrived?</h2><p>Ask for a new date, then edit the payment. Count it as cash only after it arrives.</p></div>${pay ? `<label for="pay-followup-select">Payment still listed as expected</label><select id="pay-followup-select">${arrived.map(entry => `<option value="${esc(entry.id)}" ${entry.id === pay.id ? 'selected' : ''}>${esc(entry.label)} · ${money(entry.amount)} · ${dateLabel(entry.date)}</option>`).join('')}</select><label for="pay-followup-draft">Message you can edit and send yourself</label><textarea id="pay-followup-draft" rows="5">${esc(state.payFollowupId === pay.id ? state.payFollowupDraft : incomeFollowupMessage(pay))}</textarea><div class="coach-button-row"><button type="button" id="copy-pay-followup">Copy message</button><button type="button" data-edit="${esc(pay.id)}">Update expected date ↗</button><button type="button" data-settle="${esc(pay.id)}">I received it</button></div>` : '<p class="empty">No confirmed payment is due yet. When one reaches its expected date and remains listed, you can follow up here.</p><button type="button" class="text-button" data-tab="money">Review expected payments ↗</button>'}<small class="coach-fine">No message is sent by LAX. Do not mark a payment received before it reaches you.</small></article>
  <article class="panel coach-card coach-pattern"><div class="coach-card-head"><span>05 / INCOME CLUES</span><h2>Turn a pattern into a reviewed plan.</h2><p>A past pattern may suggest a payment. Check that it is separate from income already listed. It never becomes confirmed cash automatically.</p></div>${patterns.length ? patterns.map((pattern, index) => `<div class="coach-pattern-row"><div><strong>${esc(pattern.label)} · around ${money(pattern.amount)}</strong><small>About ${dateLabel(pattern.date)} · ${esc(pattern.confidence)} · ${pattern.sampleSize} past payments</small></div><button type="button" data-promote-pattern="${index}">Review as possible income ↗</button></div>`).join('') : '<p class="empty">Add three recent actual payments on separate dates with the same source name to see a clue. An identical future payment already entered will not be suggested again.</p>'}<button type="button" class="text-button" data-add-kind="history">+ Add past income</button></article>
  <article class="panel coach-card coach-activity"><div class="coach-card-head"><span>06 / WHAT CHANGED</span><h2>See your recent check-ins.</h2><p>Keep a short record of what you marked received or paid on this device.</p></div>${activity.length ? `<div class="coach-activity-list">${activity.map((action, index) => `<div><span>${esc(action.entry.label)} · ${dateLabel(action.settledAt)}${index === 0 ? ' · latest' : ''}</span><strong class="${action.change > 0 ? 'positive' : ''}">${action.change > 0 ? '+' : '−'}${money(Math.abs(action.change))}</strong></div>`).join('')}</div><button type="button" class="text-button" id="undo-checkin">Undo latest check-in ↶</button>` : '<p class="empty">Your received and paid check-ins will appear here. Start in My money.</p><button type="button" class="text-button" data-tab="money">Open My money ↗</button>'}<small class="coach-fine">This local activity list is not a bank statement. Encrypted backups keep the plan but not the Undo history.</small></article>
  </div>`;
}

function moneyView(predicted) {
  const upcoming = [...data.entries].sort((a, b) => a.date.localeCompare(b.date));
  const latest = data.activity?.[0];
  return `<section class="section-heading photo-heading money-heading"><div class="eyebrow"><span class="eyebrow-line"></span> YOUR MONEY, YOUR INPUTS</div><h1>Start with<br><em>what you know.</em></h1><p>Enter cash, bank money, bills and expected payments. Your entries are saved in this browser only.</p></section><div class="money-grid"><article class="panel balance-panel"><div class="eyebrow small">MONEY ON HAND TODAY</div><div class="balance-edit"><span>R</span><input id="balance-input" type="number" inputmode="decimal" min="0" max="1000000" step="0.01" value="${amountInput(data.balance)}" aria-label="Money available today in rand"></div><p>Include cash and bank money you can actually use. Do not include expected pay here.</p><button class="secondary-button" id="save-balance">Save balance <span>↗</span></button><div class="balance-rule"></div><strong class="list-title">Income pattern</strong><p class="small-copy">Three or more recent payments on separate dates with the same source name may suggest a next date and amount.</p>${predicted.length ? predicted.map(p => `<div class="prediction"><span>${icon('sparkles')}</span><div><strong>${esc(p.label)}: around ${money(p.amount)}</strong><small>About ${dateLabel(p.date)} · ${p.confidence} · ${p.sampleSize} entries</small></div></div>`).join('') : '<div class="prediction muted">No pattern yet. Add past payments below.</div>'}<button class="text-button" data-add-kind="history">+ Add past income</button></article><article class="panel entries-panel"><div class="panel-heading"><div><div class="eyebrow small">COMING CASH FLOW</div><h2>Your entries</h2></div><span class="count-pill">${upcoming.length} entries</span></div><p class="checkin-explainer">When money actually arrives or a bill is paid, mark it here. LAX adjusts money on hand and removes the scheduled item so it is counted once.</p><div class="action-pair"><button class="secondary-button" data-add-kind="expense">+ Add expense</button><button class="secondary-button" data-add-kind="income">+ Add income</button></div><div class="entry-list">${upcoming.length ? upcoming.map(e => entryRow(e, true)).join('') : '<p class="empty">No entries yet. Add a bill or a payment to build your forecast.</p>'}</div>${latest ? `<div class="checkin-activity"><span>Last check-in: <strong>${esc(latest.entry.label)}</strong> ${latest.change > 0 ? 'received' : 'paid'} ${money(Math.abs(latest.change))}</span><button id="undo-checkin">Undo ↶</button></div>` : ''}<div class="history-section"><strong class="list-title">Past income used for patterns</strong>${data.history.map(h => `<div class="history-row"><span>${esc(h.label)} · ${dateLabel(h.date)}</span><strong>${money(h.amount)}</strong><button class="icon-button" data-delete-history="${esc(h.id)}" aria-label="Remove past income">×</button></div>`).join('') || '<p class="empty">No past income entered.</p>'}</div></article></div>${backupPanel()}<button class="reset-button" id="reset-sample">↺ Restore example data</button>`;
}

function formModal() {
  if (!state.showForm) return '';
  const historical = state.formKind === 'history';
  const income = state.formKind === 'income';
  const entry = state.editId ? data.entries.find(row => row.id === state.editId) : null;
  const editing = !!entry;
  const title = editing ? `Edit ${income ? 'income' : 'expense'}` : historical ? 'Add past income' : income ? 'Add upcoming income' : 'Add an expense';
  const date = entry?.date || (historical ? addDays(today, -7) : addDays(today, 7));
  const category = historical ? '<p class="small-copy">Only actual past payments belong here.</p>' : `<label class="field-label" for="entry-class">${income ? 'How certain is this payment?' : 'Can this expense wait?'}</label><select id="entry-class" name="class"><option value="${income ? 'confirmed' : 'essential'}" ${(income ? entry?.certainty === 'confirmed' : entry?.essential) ? 'selected' : ''}>${income ? 'Confirmed — amount and date agreed' : 'Essential — must be paid'}</option><option value="${income ? 'possible' : 'flexible'}" ${(income ? entry?.certainty === 'possible' : entry?.essential === false) ? 'selected' : ''}>${income ? 'Possible — not guaranteed' : 'Flexible — could move'}</option></select>`;
  const repeatField = !historical && !income ? `<label class="repeat-row" id="repeat-row" ${entry && !entry.essential ? 'hidden' : ''}><input type="checkbox" name="repeat" value="monthly" ${entry?.repeat === 'monthly' ? 'checked' : ''}><span><strong>Add next month’s bill after I mark this paid</strong><small>Only for essential bills. You can change or stop it any time.</small></span></label>` : '';
  return `<div class="modal-backdrop" id="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close" id="close-modal" aria-label="Close">×</button><div class="eyebrow small">${editing ? 'UPDATE YOUR FORECAST' : 'ADD TO YOUR FORECAST'}</div><h2 id="modal-title">${title}</h2><form id="entry-form"><label class="field-label" for="entry-label">${historical ? 'Source name (use the same name for each payment)' : 'What is it?'}</label><input id="entry-label" name="label" required maxlength="60" value="${esc(entry?.label || '')}" placeholder="${historical ? 'e.g. Cleaning work' : income ? 'e.g. Catering payment' : 'e.g. Electricity'}"><label class="field-label" for="entry-amount">Amount in rand</label><input id="entry-amount" name="amount" required type="number" inputmode="decimal" min="0.01" max="1000000" step="0.01" value="${entry ? amountInput(entry.amount) : ''}" placeholder="0.00"><label class="field-label" for="entry-date">${historical ? 'Date received' : 'Date due'}</label><input id="entry-date" name="date" required type="date" value="${date}" ${historical ? `max="${today}"` : `min="${today}"`}>${category}${repeatField}<p id="form-error" class="form-error" role="alert"></p><button class="primary-button full" type="submit">${editing ? 'Save changes' : 'Save entry'} <span>↗</span></button></form></div></div>`;
}

let chartObserver;

function applyDrafts() {
  for (const [id, value] of Object.entries(state.inputDrafts || {})) {
    const field = document.getElementById(id);
    if (field) field.value = value;
  }
  const draft = state.formDraft;
  if (!state.showForm || !draft || draft.kind !== state.formKind || draft.editId !== state.editId) return;
  for (const [id, value] of [['entry-label', draft.label], ['entry-amount', draft.amount], ['entry-date', draft.date], ['entry-class', draft.class]]) {
    const field = document.getElementById(id);
    if (field) field.value = value;
  }
  const repeat = document.querySelector('#repeat-row input');
  if (repeat) { repeat.checked = draft.repeat; document.getElementById('repeat-row').hidden = draft.class === 'flexible'; }
}

function render(mode = '') {
  today = todayZA();
  if (state.launchPhase === 'film') {
    document.getElementById('app').innerHTML = filmView();
    const video = document.getElementById('launch-video');
    const leaveFilm = () => { if (state.launchPhase === 'film') openGuide(); };
    video.addEventListener('ended', leaveFilm, { once: true });
    video.addEventListener('error', leaveFilm, { once: true });
    video.play().catch(leaveFilm);
    clearTimeout(filmFallback);
    filmFallback = setTimeout(() => { if (state.launchPhase === 'film') openGuide(); }, 7500);
    return;
  }
  if (state.launchPhase === 'guide') { document.getElementById('app').innerHTML = guideView(); return; }
  if (state.welcome) { document.getElementById('app').innerHTML = welcomeView(); return; }
  if (state.guidedStart) { document.getElementById('app').innerHTML = `<div class="guided-shell">${nav()}<main class="wrap">${guidedStartView()}</main></div>${state.toast ? `<div class="toast" role="status">${esc(state.toast)}</div>` : ''}`; applyDrafts(); saveWorkspace(); return; }
  const baseline = project(data, {}, today);
  const scenario = { delayId: state.delayId, delayDays: state.delayDays, purchase: state.purchase, includePossible: state.includePossible };
  const current = project(data, scenario, today);
  const conservativeScenario = { ...scenario, includePossible: false };
  const planCurrent = project(data, conservativeScenario, today);
  const plan = state.tab === 'plan' ? rescuePlan(data, conservativeScenario, today) : null;
  const predicted = ['overview', 'money'].includes(state.tab) ? inferIncome(data.history, today) : [];
  const confirmed = data.entries.filter(e => e.kind === 'income' && e.certainty === 'confirmed' && e.date >= today);
  document.getElementById('app').innerHTML = `${nav()}<main class="wrap ${mode === 'navigate' ? 'page-enter' : mode === 'update' ? 'data-updated' : ''}">${resumeBanner()}${exampleBanner()}${state.tab === 'overview' ? overview(baseline, predicted) : state.tab === 'coach' ? coachView(baseline) : state.tab === 'scenario' ? scenarioView(baseline, current, confirmed) : state.tab === 'plan' ? planView(planCurrent, plan) : moneyView(predicted)}</main><footer class="site-footer"><div class="wrap footer-inner"><strong>PROJECT LAX<span> / </span>2026</strong><span>Early warning for everyday money.</span><span>Your entries stay in this browser</span></div></footer>${formModal()}${backupModal()}${state.toast ? `<div class="toast" role="status">${esc(state.toast)}</div>` : ''}`;
  const modal = document.querySelector('.modal-backdrop');
  for (const section of document.getElementById('app').children) if (section !== modal) section.inert = !!modal;
  applyDrafts();
  saveWorkspace();
  chartObserver?.disconnect();
  const charts = document.querySelectorAll('.chart-wrap');
  if (charts.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('chart-play');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.25 });
    chartObserver = observer;
    charts.forEach(chart => observer.observe(chart));
  } else charts.forEach(chart => chart.classList.add('chart-play'));
}

document.addEventListener('click', event => {
  if (event.target.closest('button') && !event.target.closest('[data-toggle-sound]')) playCue(soundEnabled);
  if (event.target.closest('#film-skip, #film-continue')) { openGuide(); return; }
  if (event.target.closest('#guide-next')) {
    if (state.guideStep === LAST_GUIDE_STEP) finishGuide();
    else { state.guideStep++; saveLaunch(localStorage, String(state.guideStep)); render(); document.getElementById('guide-title')?.focus(); }
    return;
  }
  if (event.target.closest('#guide-prev')) { state.guideStep = Math.max(0, state.guideStep - 1); saveLaunch(localStorage, String(state.guideStep)); render(); document.getElementById('guide-title')?.focus(); return; }
  if (event.target.closest('#guide-skip')) { finishGuide(); return; }
  if (event.target.closest('[data-replay-intro]')) { replayIntro(); return; }
  if (event.target.closest('[data-toggle-sound]')) { soundEnabled = !soundEnabled; saveSound(localStorage, soundEnabled); if (soundEnabled) playCue(true, 'complete'); render(); document.querySelector('[data-toggle-sound]')?.focus(); return; }
  if (event.target.id === 'copy-pay-followup') {
    const draft = document.getElementById('pay-followup-draft');
    if (!draft) return;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(draft.value).then(() => { event.target.textContent = 'Copied ✓'; }, () => { draft.focus(); draft.select(); event.target.textContent = 'Select and copy highlighted text'; });
    else { draft.focus(); draft.select(); event.target.textContent = 'Select and copy highlighted text'; }
    return;
  }
  if (event.target.id === 'copy-conversation') {
    const draft = document.getElementById('conversation-draft');
    if (!draft) return;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(draft.value).then(() => { event.target.textContent = 'Copied ✓'; }, () => { draft.focus(); draft.select(); event.target.textContent = 'Select and copy the highlighted text'; });
    else { draft.focus(); draft.select(); event.target.textContent = 'Select and copy the highlighted text'; }
    return;
  }
  if (event.target.id === 'ask-date-change') {
    const bill = data.entries.find(entry => entry.id === state.billDateTestId);
    if (!bill) return;
    state.conversationBillId = bill.id;
    state.conversationDraft = `Hello. I am contacting you about my ${bill.label} payment of ${money(bill.amount)} due ${dateLabel(bill.date)}. Would it be possible to move this due date to ${dateLabel(state.billDateTestDate)}? Please explain any fees, interest, or other consequences, and confirm any agreed change in writing. Thank you.`;
    const details = document.getElementById('bill-conversation');
    if (details) { details.open = true; document.getElementById('conversation-draft').value = state.conversationDraft; details.scrollIntoView({ block: 'nearest' }); document.getElementById('conversation-draft').focus(); }
    saveWorkspace();
    return;
  }
  if (event.target.closest('#menu-toggle')) { state.menuOpen = !state.menuOpen; document.getElementById('app-menu').hidden = !state.menuOpen; document.getElementById('menu-toggle').setAttribute('aria-expanded', String(state.menuOpen)); return; }
  if (event.target.closest('#dismiss-resume')) { state.resumeNotice = false; render(); return; }
  if (event.target.closest('#clear-workspace')) { localStorage.removeItem(WORK_KEY); Object.assign(state, { tab: 'overview', focusOpen: false, focusedBillId: '', delayId: '', delayDays: 0, purchase: 0, spendAmount: 0, includePossible: false, showForm: false, editId: '', formDraft: null, inputDrafts: {}, menuOpen: false, resumeNotice: false, ...freshCoachDrafts() }); scrollTo({ top: 0, behavior: 'instant' }); notify('Fresh view ready. Your saved money and bills are still here.'); return; }
  if (event.target.closest('#erase-plan')) { if (confirm('Erase all LAX entries and unfinished work from this device? This cannot be undone. Download a backup first if you need your plan.')) { localStorage.removeItem(KEY); localStorage.removeItem(WORK_KEY); persistedData = null; data = sampleData(today); Object.assign(state, { welcome: true, tab: 'overview', focusOpen: false, focusedBillId: '', delayId: '', delayDays: 0, purchase: 0, spendAmount: 0, includePossible: false, showForm: false, editId: '', formDraft: null, inputDrafts: {}, backupMode: '', menuOpen: false, resumeNotice: false, toast: '', ...freshCoachDrafts() }); scrollTo({ top: 0, behavior: 'instant' }); render(); } return; }
  if (event.target.closest('[data-home]')) { saveWorkspace(); Object.assign(state, { welcome: true, menuOpen: false }); render(); scrollTo({ top: 0, behavior: 'instant' }); (document.getElementById('welcome-continue') || document.getElementById('welcome-example'))?.focus(); return; }
  if (event.target.closest('#welcome-continue, [data-continue-plan]')) { continueSavedPlan(); return; }
  if (event.target.closest('#welcome-own, [data-welcome-own]')) { if (hasSavedPlan() && !isExample() && !confirm('Start a new plan and replace the saved one on this device? Export an encrypted backup first if you need a copy.')) return; beginOwnPlan(); return; }
  if (state.guidedStart && event.target.closest('#guided-back')) { saveWorkspace(); state.welcome = true; render(); scrollTo({ top: 0, behavior: 'instant' }); return; }
  if (event.target.closest('#welcome-example, [data-welcome-example]')) { if (hasSavedPlan() && !isExample() && !confirm('Replace your saved plan on this device with the fictional example? Export an encrypted backup first if you need a copy.')) return; data = sampleData(today); Object.assign(state, { welcome: false, guidedStart: false, tab: 'overview', spendAmount: DEMO_PURCHASE_CENTS, menuOpen: false }); save(); render('navigate'); const target = document.getElementById('spend-check'); target?.scrollIntoView({ block: 'start' }); target?.focus({ preventScroll: true }); return; }
  if (event.target.closest('#welcome-restore')) { Object.assign(state, { welcomeGuidedBeforeRestore: state.guidedStart, welcome: false, guidedStart: false, backupMode: 'import', welcomeRestore: true, menuOpen: false }); render(); document.getElementById('backup-file')?.focus(); return; }
  const guidedBill = event.target.closest('[data-guided-bill]');
  if (guidedBill) { const field = document.getElementById('guided-label'); field.value = guidedBill.dataset.guidedBill; state.inputDrafts[field.id] = field.value; saveWorkspace(); field.focus(); return; }
  const guidedDays = event.target.closest('[data-guided-days]');
  if (guidedDays) { const field = document.getElementById('guided-date'); field.value = addDays(today, Number(guidedDays.dataset.guidedDays)); state.inputDrafts[field.id] = field.value; saveWorkspace(); field.focus(); return; }
  if (event.target.id === 'guided-later') { const status = document.getElementById('guided-status'); if (status) status.textContent = 'Your draft is saved here. Add the unknown amounts when you have them; LAX has not checked coverage yet.'; saveWorkspace(); return; }
  if (event.target.closest('#open-backup')) { state.backupMode = 'export'; state.restoreCandidate = null; render(); document.getElementById('backup-passphrase')?.focus(); return; }
  if (event.target.closest('#open-restore')) { state.backupMode = 'import'; state.restoreCandidate = null; render(); document.getElementById('backup-file')?.focus(); return; }
  const backupAction = event.target.closest('[data-backup-mode]');
  if (backupAction) { state.backupMode = backupAction.dataset.backupMode; state.restoreCandidate = null; state.menuOpen = false; render(); document.getElementById(state.backupMode === 'export' ? 'backup-passphrase' : 'backup-file')?.focus(); return; }
  if (event.target.id === 'close-backup' || event.target.id === 'backup-backdrop') { state.backupMode = ''; state.restoreCandidate = null; if (state.welcomeRestore) { state.welcome = true; state.welcomeRestore = false; state.guidedStart = !!state.welcomeGuidedBeforeRestore; state.welcomeGuidedBeforeRestore = false; } render(); document.getElementById('menu-toggle')?.focus(); return; }
  if (event.target.id === 'cancel-restore') { state.restoreCandidate = null; render(); document.getElementById('backup-file')?.focus(); return; }
  if (event.target.id === 'confirm-restore') { if (!state.restoreCandidate) return; data = state.restoreCandidate; state.restoreCandidate = null; state.backupMode = ''; Object.assign(state, { welcomeRestore: false, welcomeGuidedBeforeRestore: false, guidedStart: false, tab: 'overview', focusOpen: false, focusedBillId: '', delayId: '', delayDays: 0, purchase: 0, spendAmount: 0, includePossible: false, showForm: false, formDraft: null, inputDrafts: {}, resumeNotice: false, ...freshCoachDrafts() }); save(); notify('Backup restored. Check your entries before relying on the forecast.'); scrollTo({ top: 0 }); return; }
  if (event.target.closest('#open-bill-focus')) { state.focusOpen = true; state.tab = 'overview'; render('navigate'); document.getElementById('focus-bill-select')?.focus(); document.getElementById('bill-focus')?.scrollIntoView({ block: 'start' }); return; }
  const focusBill = event.target.closest('[data-focus-bill]');
  if (focusBill) { state.focusedBillId = focusBill.dataset.focusBill; state.focusOpen = true; state.tab = 'overview'; render('navigate'); document.getElementById('bill-focus')?.scrollIntoView({ block: 'start' }); return; }
  if (event.target.closest('#close-bill-focus')) { state.focusOpen = false; render('navigate'); document.getElementById('open-bill-focus')?.focus(); return; }
  if (event.target.closest('#start-own-money, [data-make-plan]')) { if (confirm('Leave the fictional example and start a new plan with your own numbers? No example amounts will be copied.')) beginOwnPlan(); return; }
  const promote = event.target.closest('[data-promote-pattern]');
  if (promote) {
    const pattern = patternCandidates(data, today)[Number(promote.dataset.promotePattern)];
    if (!pattern) { notify('This pattern changed. Review your income history first.'); return; }
    state.formKind = 'income'; state.editId = ''; state.showForm = true;
    state.formDraft = { kind: 'income', editId: '', label: pattern.label, amount: amountInput(pattern.amount), date: pattern.date, class: 'possible', repeat: false };
    render(); document.getElementById('entry-label')?.focus(); return;
  }
  const cannotMove = event.target.closest('[data-cannot-move]');
  if (cannotMove) { data.cannotMoveIds = [...new Set([...(data.cannotMoveIds || []), cannotMove.dataset.cannotMove])]; save(); notify('Kept this cost in your forecast. Your plan has been recalculated.'); return; }
  const canMove = event.target.closest('[data-can-move]');
  if (canMove) { data.cannotMoveIds = (data.cannotMoveIds || []).filter(id => id !== canMove.dataset.canMove); save(); notify('This cost can move again. Your plan has been recalculated.'); return; }
  const tryDelay = event.target.closest('[data-try-delay]');
  if (tryDelay) { state.delayId = tryDelay.dataset.tryDelay; state.delayDays = 3; state.tab = 'scenario'; render('navigate'); scrollTo({ top: 0, behavior: 'instant' }); return; }
  const scroll = event.target.closest('[data-scroll]');
  if (scroll) { document.getElementById(scroll.dataset.scroll)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); return; }
  if (event.target.closest('a.brand')) { event.preventDefault(); saveWorkspace(); state.welcome = true; state.menuOpen = false; render('navigate'); scrollTo({ top: 0, behavior: 'instant' }); return; }
  const tab = event.target.closest('[data-tab]');
  if (tab) { if (state.guidedStart) { document.getElementById('guided-error').textContent = 'Finish this first bill before viewing a forecast. Your unfinished answers are saved here.'; return; } state.tab = tab.dataset.tab; state.menuOpen = false; render('navigate'); scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); return; }
  const add = event.target.closest('[data-add-kind]');
  if (add) { state.formKind = add.dataset.addKind; state.editId = ''; state.formDraft = null; state.showForm = true; render(); document.getElementById('entry-label').focus(); return; }
  const edit = event.target.closest('[data-edit]');
  if (edit) { const entry = data.entries.find(row => row.id === edit.dataset.edit); if (entry) { state.formKind = entry.kind; state.editId = entry.id; state.formDraft = null; state.showForm = true; render(); document.getElementById('entry-label').focus(); } return; }
  const del = event.target.closest('[data-delete]');
  if (del) { data.entries = data.entries.filter(e => e.id !== del.dataset.delete); data.cannotMoveIds = (data.cannotMoveIds || []).filter(id => id !== del.dataset.delete); if (state.delayId === del.dataset.delete) state.delayId = ''; save(); notify('Entry removed. Forecast updated.'); return; }
  const delHistory = event.target.closest('[data-delete-history]');
  if (delHistory) { data.history = data.history.filter(e => e.id !== delHistory.dataset.deleteHistory); save(); notify('Past income removed. Pattern updated.'); return; }
  if (event.target.id === 'try-80') { state.spendAmount = DEMO_PURCHASE_CENTS; render('update'); return; }
  if (event.target.closest('[data-plan-spend]')) { if (state.purchase !== state.spendAmount) data.cannotMoveIds = (data.cannotMoveIds || []).filter(id => id !== 'scenario-purchase'); state.purchase = state.spendAmount; state.tab = 'plan'; save(); render('navigate'); scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); return; }
  if (event.target.closest('[data-record-spend]')) { try { data = recordPurchase(data, state.spendAmount, uid(), todayZA()); state.spendAmount = 0; state.purchase = 0; save(); notify('Purchase recorded. Your balance and forecast are updated. Undo is in My money.'); } catch (error) { notify(error.message); } return; }
  const settle = event.target.closest('[data-settle]');
  if (settle) { try { const entry = data.entries.find(row => row.id === settle.dataset.settle); data = settleEntry(data, settle.dataset.settle, todayZA(), uid()); if (state.payFollowupId === settle.dataset.settle) { state.payFollowupId = ''; state.payFollowupDraft = ''; } save(); notify(entry?.repeat === 'monthly' ? 'Payment saved. Next month’s bill is in your plan. Undo is in My money.' : 'Check-in saved. Your forecast is updated. Undo is in My money.'); } catch (error) { notify(error.message); } return; }
  if (event.target.id === 'undo-checkin') { try { data = undoSettlement(data); save(); notify('Check-in undone. Your forecast is restored.'); } catch (error) { notify(error.message); } return; }
  if (event.target.id === 'save-balance') { try { data.balance = cents(document.getElementById('balance-input').value); delete state.inputDrafts['balance-input']; save(); notify('Balance saved. Forecast updated.'); } catch (error) { notify(error.message); } return; }
  if (event.target.id === 'reset-sample') { if (confirm('Restore the sample and replace your entries on this device?')) { data = sampleData(today); Object.assign(state, { delayId: '', delayDays: 0, purchase: 0, spendAmount: 0, includePossible: false, editId: '', showForm: false, formDraft: null, inputDrafts: {}, resumeNotice: false, ...freshCoachDrafts() }); save(); notify('Sample restored.'); } return; }
  if (event.target.id === 'close-modal' || event.target.id === 'modal-backdrop') { const kind = state.formKind; state.showForm = false; state.editId = ''; state.formDraft = null; render(); (document.querySelector(`[data-add-kind="${kind}"]`) || document.querySelector('.tab-nav .selected'))?.focus(); }
});

document.addEventListener('pointerdown', event => {
  if (!state.menuOpen || event.target.closest('#app-menu, #menu-toggle')) return;
  state.menuOpen = false;
  const menu = document.getElementById('app-menu');
  if (menu) menu.hidden = true;
  document.getElementById('menu-toggle')?.setAttribute('aria-expanded', 'false');
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.launchPhase === 'film') { openGuide(); return; }
  if (event.key === 'Escape' && state.launchPhase === 'guide') { if (state.guideStep) document.getElementById('guide-prev')?.click(); else finishGuide(); return; }
  const modal = document.querySelector('.modal-backdrop .modal');
  if (modal && event.key === 'Tab') {
    const controls = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')]
      .filter(control => !control.closest('[hidden]'));
    if (!controls.length) { event.preventDefault(); return; }
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    return;
  }
  if (event.key !== 'Escape') return;
  if (state.backupMode) { state.backupMode = ''; state.restoreCandidate = null; if (state.welcomeRestore) { state.welcome = true; state.welcomeRestore = false; state.guidedStart = !!state.welcomeGuidedBeforeRestore; state.welcomeGuidedBeforeRestore = false; } render(); document.getElementById('menu-toggle')?.focus(); return; }
  if (state.showForm) { const kind = state.formKind; state.showForm = false; state.editId = ''; state.formDraft = null; render(); (document.querySelector(`[data-add-kind="${kind}"]`) || document.querySelector('.tab-nav .selected'))?.focus(); return; }
  if (!state.menuOpen) return;
  state.menuOpen = false;
  document.getElementById('app-menu').hidden = true;
  document.getElementById('menu-toggle').setAttribute('aria-expanded', 'false');
  document.getElementById('menu-toggle').focus();
});

document.addEventListener('change', event => {
  if (event.target.closest('#entry-form')) {
    if (event.target.id === 'entry-class') { const repeat = document.getElementById('repeat-row'); if (repeat) { repeat.hidden = event.target.value !== 'essential'; if (repeat.hidden) repeat.querySelector('input').checked = false; } }
    captureFormDraft(); return;
  }
  if (event.target.id === 'focus-bill-select') { state.focusedBillId = event.target.value; state.billDateTestId = ''; state.billDateTestDate = ''; render('update'); document.getElementById('focus-bill-select')?.focus(); return; }
  if (event.target.id === 'pay-followup-select') { state.payFollowupId = event.target.value; state.payFollowupDraft = incomeFollowupMessage(data.entries.find(entry => entry.id === state.payFollowupId)); render('update'); document.getElementById('pay-followup-select')?.focus(); return; }
  if (event.target.id === 'income-select') { state.delayId = event.target.value; if (!state.delayId) state.delayDays = 0; render('update'); }
  if (event.target.id === 'delay-range') { state.delayDays = Number(event.target.value); render('update'); }
  if (event.target.id === 'purchase-amount') { try { const amount = event.target.value ? cents(event.target.value) : 0; if (amount !== state.purchase) { data.cannotMoveIds = (data.cannotMoveIds || []).filter(id => id !== 'scenario-purchase'); save(); } state.purchase = amount; delete state.inputDrafts['purchase-amount']; render('update'); } catch { /* no change until valid */ } }
  if (event.target.id === 'include-possible') { state.includePossible = event.target.checked; render('update'); }
});

document.addEventListener('input', event => {
  if (event.target.closest('#guided-form')) { state.inputDrafts[event.target.id] = event.target.value; saveWorkspace(); return; }
  if (event.target.closest('#entry-form')) { captureFormDraft(); return; }
  if (event.target.id === 'conversation-draft') { state.conversationBillId = state.focusedBillId; state.conversationDraft = event.target.value; saveWorkspace(); return; }
  if (event.target.id === 'pay-followup-draft') { state.payFollowupId = document.getElementById('pay-followup-select')?.value || ''; state.payFollowupDraft = event.target.value; saveWorkspace(); return; }
  if (event.target.closest('#source-form') && event.target.name in state.sourceInputs) {
    state.sourceInputs[event.target.name] = event.target.value;
    try { document.getElementById('source-total').textContent = money(sourceTally(state.sourceInputs)); document.getElementById('source-note').textContent = 'This worksheet changes your forecast only when you save the total.'; }
    catch (error) { document.getElementById('source-total').textContent = 'Check amounts'; document.getElementById('source-note').textContent = error.message; }
    saveWorkspace(); return;
  }
  if (event.target.id === 'delay-range') { state.delayDays = Number(event.target.value); saveWorkspace(); return; }
  if (['balance-input', 'focus-balance-input', 'spend-amount', 'purchase-amount', 'cushion-amount'].includes(event.target.id)) {
    state.inputDrafts[event.target.id] = event.target.value;
    saveWorkspace();
  }
});

document.addEventListener('submit', async event => {
  if (event.target.id === 'guided-form') {
    event.preventDefault();
    const values = new FormData(event.target);
    const label = String(values.get('label') || '').trim();
    const date = String(values.get('date') || '');
    try {
      const amount = cents(values.get('amount'));
      const balance = cents(values.get('balance'));
      if (!label || !amount || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > addDays(today, 365)) throw new Error('Enter a bill name, positive amount, and due date within the next year.');
      data = blankPlan(); data.balance = balance;
      data.entries.push({ id: uid(), kind: 'expense', label, amount, date, essential: true });
      state.guidedStart = false; state.focusOpen = true; state.focusedBillId = data.entries[0].id; state.inputDrafts = {};
      save(); render('navigate');
      const target = document.getElementById('bill-focus');
      target?.scrollIntoView({ block: 'start' });
      target?.focus({ preventScroll: true });
    } catch (error) { document.getElementById('guided-error').textContent = error.message; }
    return;
  }
  if (event.target.id === 'cushion-form') {
    event.preventDefault();
    try { const value = cents(document.getElementById('cushion-amount').value); cushionScenario(data, value, today); state.cushionAmount = value; delete state.inputDrafts['cushion-amount']; render('update'); }
    catch (error) { notify(error.message); }
    return;
  }
  if (event.target.id === 'source-form') {
    event.preventDefault();
    try {
      if (!Object.values(state.sourceInputs).some(value => value !== '')) throw new Error('Enter at least one amount from your own money.');
      data.balance = sourceTally(state.sourceInputs); save(); notify('Money on hand updated from your tally. Check it again after money moves.');
    } catch (error) { notify(error.message); }
    return;
  }
  if (event.target.id === 'backup-export-form') {
    event.preventDefault();
    const form = event.target;
    const error = document.getElementById('backup-error');
    const passphrase = document.getElementById('backup-passphrase').value;
    const repeated = document.getElementById('backup-confirm').value;
    if (passphrase !== repeated) { error.textContent = 'The passphrases do not match.'; return; }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = 'Encrypting your plan…';
    try {
      const encrypted = await createEncryptedBackup(data, passphrase);
      if (nativeBackup) await (await import('./native-backup.js')).shareEncryptedBackup(encrypted);
      else {
        const url = URL.createObjectURL(new Blob([encrypted], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `project-lax-${today}.laxbackup`;
        document.body.append(link);
        link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      state.backupMode = '';
      notify(nativeBackup ? 'Encrypted backup shared. Keep the file and passphrase somewhere you can find them.' : 'Encrypted backup prepared. Keep the file and passphrase somewhere you can find them.');
    } catch (cause) { error.textContent = cause.message; button.disabled = false; button.textContent = nativeBackup ? 'Share backup ↗' : 'Download backup ↗'; }
    return;
  }
  if (event.target.id === 'backup-import-form') {
    event.preventDefault();
    const form = event.target;
    const error = document.getElementById('backup-error');
    const file = document.getElementById('backup-file').files[0];
    const passphrase = document.getElementById('restore-passphrase').value;
    if (!file || file.size > 1_000_000) { error.textContent = 'Choose a Project LAX backup file under 1 MB.'; return; }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = 'Opening backup…';
    try {
      const restored = await openEncryptedBackup(await file.text(), passphrase);
      state.restoreCandidate = restored.plan;
      state.restoreCreatedAt = restored.createdAt;
      render();
      document.getElementById('confirm-restore')?.focus();
    } catch (cause) { error.textContent = cause.message; button.disabled = false; button.textContent = 'Preview backup ↗'; }
    return;
  }
  if (event.target.id === 'focus-balance-form') { event.preventDefault(); try { data.balance = cents(document.getElementById('focus-balance-input').value); delete state.inputDrafts['focus-balance-input']; save(); notify('Money on hand updated. This bill has been checked again.'); } catch (error) { notify(error.message); } return; }
  if (event.target.id === 'bill-date-form') {
    event.preventDefault();
    const proposedDate = document.getElementById('bill-date-input').value;
    try { billDateTest(data, state.focusedBillId, proposedDate, today); state.billDateTestId = state.focusedBillId; state.billDateTestDate = proposedDate; render('update'); document.getElementById('date-test-title')?.scrollIntoView({ block: 'nearest' }); }
    catch (error) { notify(error.message); }
    return;
  }
  if (event.target.id === 'spend-form') {
    event.preventDefault();
    try {
      const amount = cents(document.getElementById('spend-amount').value);
      if (!amount) throw new Error('Enter a purchase amount above R0.');
      state.spendAmount = amount;
      delete state.inputDrafts['spend-amount'];
      render('update');
    } catch (error) { notify(error.message); }
    return;
  }
  if (event.target.id !== 'entry-form') return;
  event.preventDefault();
  const values = new FormData(event.target);
  const label = String(values.get('label') || '').trim();
  const date = String(values.get('date') || '');
  const historical = state.formKind === 'history';
  const error = document.getElementById('form-error');
  try {
    const amount = cents(values.get('amount'));
    if (!label || !amount || !/^\d{4}-\d{2}-\d{2}$/.test(date) || (historical ? date > today : date < today)) throw new Error('Enter a name, positive amount, and valid date.');
    if (historical) data.history.push({ id: uid(), label, amount, date });
    else {
      const previous = data.entries.find(row => row.id === state.editId);
      const monthly = state.formKind === 'expense' && values.get('class') === 'essential' && values.get('repeat') === 'monthly';
      const edited = { id: state.editId || uid(), kind: state.formKind, label, amount, date, ...(state.formKind === 'income' ? { certainty: values.get('class') } : { essential: values.get('class') === 'essential', ...(monthly ? { repeat: 'monthly', anchorDay: previous?.repeat === 'monthly' && previous.date === date ? previous.anchorDay || Number(date.slice(8)) : Number(date.slice(8)) } : {}) }) };
      if (state.editId) { data.entries = data.entries.map(row => row.id === state.editId ? edited : row); if (edited.kind !== 'expense' || edited.essential) data.cannotMoveIds = (data.cannotMoveIds || []).filter(id => id !== edited.id); if (state.conversationBillId === edited.id) { state.conversationBillId = ''; state.conversationDraft = ''; } if (state.payFollowupId === edited.id) { state.payFollowupId = ''; state.payFollowupDraft = ''; } }
      else data.entries.push(edited);
    }
    save(); state.showForm = false; state.editId = ''; state.formDraft = null; notify('Entry saved. Your forecast is updated.');
  } catch (e) { error.textContent = e.message; }
});

render();
// Android Back follows the visible app layer before leaving the activity.
window.laxHandleAndroidBack = () => {
  if (state.launchPhase === 'film') { openGuide(); return true; }
  if (state.launchPhase === 'guide') { if (state.guideStep) document.getElementById('guide-prev')?.click(); else finishGuide(); return true; }
  if (state.menuOpen) { document.getElementById('menu-toggle')?.click(); return true; }
  if (state.backupMode) { document.getElementById('close-backup')?.click(); return true; }
  if (state.showForm) { document.getElementById('close-modal')?.click(); return true; }
  if (state.guidedStart) { document.getElementById('guided-back')?.click(); return true; }
  if (state.focusOpen) { document.getElementById('close-bill-focus')?.click(); return true; }
  if (!state.welcome && state.tab !== 'overview') {
    state.tab = 'overview'; render('navigate'); scrollTo({ top: 0, behavior: 'instant' }); return true;
  }
  if (!state.welcome) { saveWorkspace(); Object.assign(state, { welcome: true, menuOpen: false }); render(); scrollTo({ top: 0, behavior: 'instant' }); return true; }
  return false;
};
if ('serviceWorker' in navigator) {
  if (nativeBackup) {
    // Android packages its assets. A web service worker can serve old assets
    // after an APK update, so remove registrations left by earlier builds.
    window.addEventListener('load', () => {
      navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.map(registration => registration.unregister()))).catch(() => {});
      if ('caches' in window) caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('project-lax-')).map(key => caches.delete(key)))).catch(() => {});
    });
  } else {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {
      // The web app remains usable online if offline installation is unavailable.
    }));
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) saveWorkspace(); else if (today !== todayZA()) render('update'); });
window.addEventListener('pagehide', saveWorkspace);
let scrollSaveTimer = 0;
window.addEventListener('scroll', () => { clearTimeout(scrollSaveTimer); scrollSaveTimer = setTimeout(saveWorkspace, 220); }, { passive: true });

// The pointer streak stays outside #app so forecast re-renders never restart it.
const pointerStage = document.getElementById('pointer-stage');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
if (pointerStage) {
  let pointerFrame = 0;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let positioned = false;
  // A mouse can be present even when a touch screen is the primary pointer.
  const enabled = event => event.pointerType === 'mouse' && !motionPreference.matches;
  const followPointer = () => {
    currentX += (targetX - currentX) * .23;
    currentY += (targetY - currentY) * .23;
    pointerStage.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    if (Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > .4) {
      pointerFrame = requestAnimationFrame(followPointer);
    } else {
      pointerFrame = 0;
    }
  };
  document.addEventListener('pointermove', event => {
    if (!enabled(event)) return;
    const dx = event.clientX - targetX;
    const dy = event.clientY - targetY;
    if (positioned && Math.hypot(dx, dy) > 3) pointerStage.style.setProperty('--heading', `${Math.atan2(dy, dx)}rad`);
    targetX = event.clientX;
    targetY = event.clientY;
    if (!positioned) { currentX = targetX; currentY = targetY; positioned = true; }
    pointerStage.classList.add('is-visible');
    pointerStage.classList.toggle('is-action', Boolean(event.target.closest('button, a, input, select, textarea, summary')));
    if (!pointerFrame) pointerFrame = requestAnimationFrame(followPointer);
  }, { passive: true });
  document.addEventListener('pointerout', event => {
    if (event.relatedTarget) return;
    pointerStage.classList.remove('is-visible', 'is-action');
    positioned = false;
  }, { passive: true });
  document.addEventListener('pointerdown', event => {
    if (!enabled(event) || !event.target.closest('button, a, input, select, textarea, summary')) return;
    const flare = document.createElement('span');
    flare.className = 'pointer-flare';
    flare.style.left = `${event.clientX}px`;
    flare.style.top = `${event.clientY}px`;
    flare.addEventListener('animationend', () => flare.remove(), { once: true });
    document.body.append(flare);
  }, { passive: true });
  motionPreference.addEventListener('change', () => {
    if (motionPreference.matches) pointerStage.classList.remove('is-visible', 'is-action');
  });
}
