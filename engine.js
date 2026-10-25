export const DAY = 86_400_000;

export function todayZA(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function nextMonthlyDate(date, anchorDay = Number(date.slice(8))) {
  const [year, month] = date.split('-').map(Number);
  if (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) throw new Error('The monthly bill day is invalid.');
  const first = new Date(Date.UTC(year, month, 1, 12));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12)).getUTCDate();
  first.setUTCDate(Math.min(anchorDay, lastDay));
  return first.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);
}

export function cents(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new Error('Enter an amount from R0 to R1,000,000.');
  return Math.round(n * 100);
}

export function money(amount) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: Math.abs(amount) % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(amount / 100);
}

export function sampleData(today = todayZA()) {
  return {
    version: 1,
    demo: true,
    balance: 120000,
    updated: today,
    horizon: 14,
    entries: [
      { id: 'sample-gig', kind: 'income', label: 'Cleaning job payment', amount: 65000, date: addDays(today, 7), certainty: 'confirmed' },
      { id: 'sample-weekend', kind: 'income', label: 'Weekend work', amount: 40000, date: addDays(today, 11), certainty: 'possible' },
      { id: 'sample-outing', kind: 'expense', label: 'Weekend outing', amount: 22000, date: addDays(today, 2), essential: false },
      { id: 'sample-takeaway', kind: 'expense', label: 'Takeaway & airtime', amount: 18000, date: addDays(today, 4), essential: false },
      { id: 'sample-rent', kind: 'expense', label: 'Rent', amount: 95000, date: addDays(today, 5), essential: true, repeat: 'monthly', anchorDay: Number(addDays(today, 5).slice(8)) },
      { id: 'sample-data', kind: 'expense', label: 'Extra data bundle', amount: 15000, date: addDays(today, 6), essential: false },
      { id: 'sample-electricity', kind: 'expense', label: 'Electricity', amount: 30000, date: addDays(today, 8), essential: true },
      { id: 'sample-food', kind: 'expense', label: 'Groceries', amount: 25000, date: addDays(today, 10), essential: true }
    ],
    history: [
      { id: 'h1', label: 'Cleaning work', amount: 54000, date: addDays(today, -22) },
      { id: 'h2', label: 'Cleaning work', amount: 63000, date: addDays(today, -15) },
      { id: 'h3', label: 'Cleaning work', amount: 58000, date: addDays(today, -8) },
      { id: 'h4', label: 'Cleaning work', amount: 65000, date: addDays(today, -1) }
    ]
  };
}

export function settleEntry(data, id, settledAt = todayZA(), nextId = globalThis.crypto?.randomUUID?.()) {
  const entry = data.entries.find(row => row.id === id);
  if (!entry) throw new Error('This entry is no longer in your forecast.');
  const change = entry.kind === 'income' ? entry.amount : -entry.amount;
  if (data.balance + change < 0) throw new Error('This payment exceeds the money on hand. Update your balance first.');
  if (!Number.isSafeInteger(data.balance + change) || data.balance + change > 100_000_000) throw new Error('Money on hand cannot exceed R1,000,000 in this version.');
  const nextEntry = entry.kind === 'expense' && entry.essential && entry.repeat === 'monthly'
    ? { ...entry, id: nextId, date: nextMonthlyDate(entry.date, entry.anchorDay || Number(entry.date.slice(8))) } : null;
  if (nextEntry && (!nextId || data.entries.some(row => row.id === nextId))) throw new Error('Could not create the next monthly bill.');
  const action = { id: entry.id, entry, index: data.entries.findIndex(row => row.id === id), change, settledAt, balanceAfter: data.balance + change, ...(nextEntry ? { nextEntry } : {}) };
  return { ...data, balance: action.balanceAfter, entries: [...data.entries.filter(row => row.id !== id), ...(nextEntry ? [nextEntry] : [])], activity: [action, ...(data.activity || [])].slice(0, 20) };
}

export function undoSettlement(data) {
  const [action, ...activity] = data.activity || [];
  if (!action) throw new Error('There is no check-in to undo.');
  if (data.balance !== action.balanceAfter) throw new Error('The balance has changed since this check-in. Enter a correction instead.');
  if (data.entries.some(row => row.id === action.id)) throw new Error('This entry is already in your forecast.');
  if (action.nextEntry && !data.entries.some(row => row.id === action.nextEntry.id && JSON.stringify(row) === JSON.stringify(action.nextEntry))) {
    throw new Error('The next monthly bill has changed. Enter a correction instead.');
  }
  const entries = data.entries.filter(row => row.id !== action.nextEntry?.id);
  entries.splice(Math.min(action.index, entries.length), 0, action.entry);
  return { ...data, balance: data.balance - action.change, entries, activity };
}

export function recordPurchase(data, amount, id, date = todayZA()) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Enter a purchase amount above R0.');
  if (!id || data.entries.some(entry => entry.id === id)) throw new Error('Could not create a unique purchase record.');
  const entry = { id, kind: 'expense', label: 'Purchase', amount, date, essential: false };
  return settleEntry({ ...data, entries: [...data.entries, entry] }, id, date);
}

export function project(data, { delayId = '', delayDays = 0, purchase = 0, purchaseDate = '', includePossible = false, omitIds = [] } = {}, today = todayZA()) {
  const horizon = data.horizon ?? 14;
  const end = addDays(today, horizon);
  const omitted = new Set(omitIds);
  const entries = data.entries.filter(e => !omitted.has(e.id) && (e.kind === 'expense' || e.certainty === 'confirmed' || includePossible))
    .map(e => ({ ...e, date: e.id === delayId && e.kind === 'income' ? addDays(e.date, delayDays) : e.date }))
    .map(e => e.kind === 'expense' && e.essential && e.date < today ? { ...e, date: today, overdue: true } : e)
    .filter(e => e.date >= today && e.date <= end);
  if (purchase > 0 && !omitted.has('scenario-purchase')) entries.push({ id: 'scenario-purchase', kind: 'expense', label: 'What-if purchase', amount: purchase, date: purchaseDate || today, essential: false });
  const rows = [];
  let balance = data.balance;
  let min = balance;
  let firstRisk = null;
  for (let i = 0; i <= horizon; i++) {
    const date = addDays(today, i);
    const todays = entries.filter(e => e.date === date);
    // An expected payment has no known time of arrival. Check bills and spending
    // before counting income on the same date, then retain the end-of-day balance.
    for (const e of todays) if (e.kind === 'expense') balance -= e.amount;
    const lowBalance = balance;
    for (const e of todays) if (e.kind === 'income') balance += e.amount;
    min = Math.min(min, lowBalance, balance);
    if (!firstRisk && lowBalance < 0) firstRisk = { date, amount: -lowBalance, bills: todays.filter(e => e.kind === 'expense' && e.essential).map(e => e.label) };
    rows.push({ date, balance, lowBalance, entries: todays });
  }
  return { rows, min, firstRisk, safeToSpend: Math.max(0, min), gap: Math.max(0, -min), end };
}

export function purchaseDecision(data, amount, today = todayZA()) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Enter a purchase amount above R0.');
  const baseline = project(data, {}, today);
  const after = project(data, { purchase: amount }, today);
  const essentialBills = data.entries.filter(entry => entry.kind === 'expense' && entry.essential && entry.date >= today && entry.date <= baseline.end);
  const overdueBills = data.entries.filter(entry => entry.kind === 'expense' && entry.essential && entry.date < today);
  const affected = after.rows.find(row => row.lowBalance < 0 && row.entries.some(entry => entry.kind === 'expense' && entry.essential));
  const affectedBill = affected?.entries.find(entry => entry.kind === 'expense' && entry.essential) || null;
  let waitDate = null;
  if (essentialBills.length && baseline.gap === 0 && after.gap > 0) {
    for (let day = 1; day < baseline.rows.length; day++) {
      const date = baseline.rows[day].date;
      const later = project(data, { purchase: amount, purchaseDate: date }, today);
      if (later.gap === 0 && later.rows[day].lowBalance >= 0) { waitDate = date; break; }
    }
  }
  const status = overdueBills.length ? 'needs-update' : !essentialBills.length ? 'incomplete' : amount > data.balance ? 'not-on-hand' : baseline.gap > 0 ? 'existing-gap' : after.gap > 0 ? 'creates-gap' : 'covered';
  return { status, baseline, after, affectedBill, affectedDate: affected?.date || null, overdueBills, addedGap: after.gap - baseline.gap, waitDate };
}

export function billFocus(data, billId, today = todayZA(), scenario = {}) {
  const bill = data.entries.find(entry => entry.id === billId && entry.kind === 'expense' && entry.essential);
  if (!bill) return null;
  const dueDate = bill.date < today ? today : bill.date;
  const forecast = project(data, scenario, today);
  if (dueDate > forecast.end) return { bill, dueDate, status: 'outside-window', gap: null };
  const throughDue = forecast.rows.filter(row => row.date <= dueDate);
  const lowest = Math.min(data.balance, ...throughDue.map(row => row.lowBalance));
  const gap = Math.max(0, -lowest);
  return { bill, dueDate, status: bill.date < today ? 'overdue' : gap ? 'gap' : 'covered', gap, balanceOnDueDate: throughDue[throughDue.length - 1].balance };
}

export function nextAttention(data, today = todayZA()) {
  const essential = data.entries.filter(entry => entry.kind === 'expense' && entry.essential).sort((a, b) => a.date.localeCompare(b.date));
  const overdue = essential.find(entry => entry.date < today);
  if (overdue) return { type: 'overdue-bill', entry: overdue };
  const dueIncome = data.entries.filter(entry => entry.kind === 'income' && entry.certainty === 'confirmed' && entry.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (dueIncome) return { type: 'due-income', entry: dueIncome };
  if (essential.length) return { type: 'upcoming-bill', entry: essential[0] };
  return { type: 'add-bill', entry: null };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function inferIncome(history, today = todayZA()) {
  const bySource = new Map();
  for (const row of history) {
    if (!row.label || !Number.isSafeInteger(row.amount) || row.amount <= 0 || row.date > today) continue;
    const key = row.label.trim().toLocaleLowerCase();
    bySource.set(key, [...(bySource.get(key) || []), row]);
  }
  return [...bySource.values()].filter(rows => rows.length >= 3).map(rows => {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const gaps = sorted.slice(1).map((e, i) => daysBetween(sorted[i].date, e.date));
    const distinctGaps = gaps.filter(days => days > 0);
    if (distinctGaps.length < 2) return null;
    const cadence = median(distinctGaps);
    const latest = sorted[sorted.length - 1];
    if (daysBetween(latest.date, today) > Math.max(45, cadence * 3)) return null;
    const spread = Math.max(...distinctGaps) - Math.min(...distinctGaps);
    const amounts = sorted.map(e => e.amount);
    let next = addDays(latest.date, cadence);
    if (next < today) next = addDays(next, Math.ceil(daysBetween(next, today) / cadence) * cadence);
    return { label: latest.label, amount: median(amounts), date: next, cadence, sampleSize: rows.length, confidence: rows.length >= 4 && distinctGaps.length === gaps.length && spread <= 2 ? 'steady pattern' : 'rough pattern' };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
}

export function rescuePlan(data, scenario = {}, today = todayZA()) {
  const safeScenario = { ...scenario, includePossible: false };
  const baseline = project(data, safeScenario, today);
  if (!baseline.gap) return { entries: [], remaining: 0, result: baseline, possible: true };
  const cannotMove = new Set(data.cannotMoveIds || []);
  const candidates = data.entries.filter(e => e.kind === 'expense' && e.essential === false && !cannotMove.has(e.id) && e.date >= today && e.date <= baseline.end);
  if (safeScenario.purchase > 0 && !cannotMove.has('scenario-purchase')) candidates.unshift({ id: 'scenario-purchase', kind: 'expense', label: 'What-if purchase', amount: safeScenario.purchase, date: safeScenario.purchaseDate || today, essential: false });
  const truncated = candidates.length > 14;
  candidates.length = Math.min(candidates.length, 14);
  let best = null;
  for (let mask = 1; mask < 2 ** candidates.length; mask++) {
    const selected = [];
    const savedOnDay = new Int32Array(baseline.rows.length);
    for (let i = 0; i < candidates.length; i++) {
      if (mask & (1 << i)) {
        selected.push(candidates[i]);
        savedOnDay[daysBetween(today, candidates[i].date)] += candidates[i].amount;
      }
    }
    const moved = selected.reduce((sum, e) => sum + e.amount, 0);
    if (best && (moved > best.moved || (moved === best.moved && selected.length >= best.entries.length))) continue;
    let saved = 0;
    let coversAllDays = true;
    for (let day = 0; day < baseline.rows.length; day++) {
      saved += savedOnDay[day];
      if (baseline.rows[day].lowBalance + saved < 0) { coversAllDays = false; break; }
    }
    if (coversAllDays) best = { entries: selected, moved };
  }
  if (best) {
    const result = project(data, { ...safeScenario, omitIds: best.entries.map(e => e.id) }, today);
    return { ...best, result, remaining: 0, possible: true, truncated };
  }
  const all = project(data, { ...safeScenario, omitIds: candidates.map(e => e.id) }, today);
  return { entries: candidates, remaining: all.gap, result: all, possible: false, truncated };
}
