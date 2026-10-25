import { billFocus, cents, inferIncome, project, todayZA } from './engine.js';

export function billDateTest(data, billId, proposedDate, today = todayZA()) {
  const bill = data.entries.find(entry => entry.id === billId && entry.kind === 'expense' && entry.essential);
  if (!bill) throw new Error('Choose an essential bill to test.');
  const end = project(data, {}, today).end;
  if (bill.date < today) throw new Error('Update this overdue bill before testing a later date.');
  if (bill.date > end) throw new Error('This bill is outside the next 14 days.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(proposedDate) || Number.isNaN(Date.parse(`${proposedDate}T12:00:00Z`))
    || new Date(`${proposedDate}T12:00:00Z`).toISOString().slice(0, 10) !== proposedDate
    || proposedDate <= bill.date || proposedDate > end) throw new Error('Choose a later date within the next 14 days.');
  const original = billFocus(data, billId, today);
  const changed = { ...data, entries: data.entries.map(entry => entry.id === billId ? { ...entry, date: proposedDate } : entry) };
  const simulated = billFocus(changed, billId, today);
  return { original, simulated, originalForecast: project(data, {}, today), simulatedForecast: project(changed, {}, today) };
}

// These helpers make the existing cash-flow model useful for a next action.
// They never count a pattern estimate as confirmed money or change the plan.
export function billRunway(data, today = todayZA()) {
  const forecast = project(data, {}, today);
  return data.entries.filter(entry => entry.kind === 'expense' && entry.essential && entry.date <= forecast.end)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(entry => ({ entry, focus: billFocus(data, entry.id, today) }));
}

export function cushionScenario(data, keepAside, today = todayZA()) {
  if (!Number.isSafeInteger(keepAside) || keepAside < 0 || keepAside > data.balance) {
    throw new Error('Choose an amount no higher than the money on hand.');
  }
  return { usual: project(data, {}, today), withCushion: project({ ...data, balance: data.balance - keepAside }, {}, today) };
}

export function sourceTally(values) {
  const parts = ['cash', 'bank', 'other'].map(key => cents(values[key] || 0));
  const total = parts.reduce((sum, value) => sum + value, 0);
  if (total > 100_000_000) throw new Error('The total money on hand cannot exceed R1,000,000.');
  return total;
}

export function dueIncome(data, today = todayZA()) {
  return data.entries.filter(entry => entry.kind === 'income' && entry.certainty === 'confirmed' && entry.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function incomeFollowupMessage(entry) {
  if (!entry || entry.kind !== 'income' || entry.certainty !== 'confirmed') throw new Error('Choose a confirmed payment.');
  const date = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${entry.date}T12:00:00Z`));
  const amount = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(entry.amount / 100);
  return `Hello. I am following up on the ${amount} payment for ${entry.label} expected on ${date}. Could you please confirm its status and the date I should now expect it? Thank you.`;
}

export function patternCandidates(data, today = todayZA()) {
  const existing = new Set(data.entries.filter(entry => entry.kind === 'income')
    .map(entry => `${entry.label.trim().toLocaleLowerCase()}|${entry.date}|${entry.amount}`));
  return inferIncome(data.history, today).filter(pattern => pattern.date >= today
    && !existing.has(`${pattern.label.trim().toLocaleLowerCase()}|${pattern.date}|${pattern.amount}`));
}

// A payday view of today's money, using only entered essentials and confirmed pay.
// This is a planning split, not money reserved in an account or a spend limit.
export function paydayMap(data, today = todayZA()) {
  const end = project(data, {}, today).end;
  const essentials = data.entries.filter(entry => entry.kind === 'expense' && entry.essential && entry.date <= end);
  if (!essentials.length) return { status: 'needs-bill', essentials: [], neededToday: 0, protectedNow: 0, gap: 0, remainder: 0 };
  const essentialOnly = {
    ...data,
    entries: data.entries.filter(entry => entry.kind === 'income' ? entry.certainty === 'confirmed' : entry.essential)
  };
  const forecast = project(essentialOnly, {}, today);
  const neededToday = Math.max(0, data.balance - forecast.min);
  return {
    status: essentials.some(entry => entry.date < today) ? 'needs-update' : 'ready',
    essentials: essentials.sort((a, b) => a.date.localeCompare(b.date)),
    neededToday,
    protectedNow: Math.min(data.balance, neededToday),
    gap: Math.max(0, neededToday - data.balance),
    remainder: Math.max(0, data.balance - neededToday)
  };
}

// Find one useful stress test without treating a late payment as a prediction.
export function latePayRadar(data, today = todayZA()) {
  const baseline = project(data, {}, today);
  const confirmed = data.entries.filter(entry => entry.kind === 'income' && entry.certainty === 'confirmed'
    && entry.date >= today && entry.date <= baseline.end);
  if (!confirmed.length) return { status: 'needs-income' };
  const results = confirmed.map(entry => {
    const delayed = project(data, { delayId: entry.id, delayDays: 3 }, today);
    return { entry, gapIncrease: Math.max(0, delayed.gap - baseline.gap), delayedGap: delayed.gap };
  }).sort((a, b) => b.gapIncrease - a.gapIncrease || a.entry.date.localeCompare(b.entry.date));
  return results[0].gapIncrease ? { status: 'sensitive', ...results[0] } : { status: 'no-extra-gap', entry: results[0].entry, baselineGap: baseline.gap };
}
