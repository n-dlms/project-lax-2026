import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, billFocus, cents, inferIncome, money, nextAttention, nextMonthlyDate, project, purchaseDecision, recordPurchase, rescuePlan, sampleData, settleEntry, todayZA, undoSettlement } from '../engine.js';

const today = '2026-10-23';

test('sample shows a dated shortfall and a real flexible-spend remedy', () => {
  const data = sampleData(today);
  const forecast = project(data, {}, today);
  const plan = rescuePlan(data, {}, today);
  assert.equal(forecast.firstRisk.date, addDays(today, 5));
  assert.ok(forecast.gap > 0);
  assert.equal(plan.possible, true);
  assert.equal(plan.result.gap, 0);
  assert.ok(plan.entries.every(e => !e.essential));
});

test('one-bill view measures the gap through its due date using confirmed money', () => {
  const data = sampleData(today);
  const focus = billFocus(data, 'sample-rent', today);
  assert.equal(focus.status, 'gap');
  assert.equal(focus.gap, 15000);
  assert.equal(focus.dueDate, addDays(today, 5));
  assert.equal(billFocus(data, 'missing', today), null);
  data.entries.push({ id: 'hope-early', kind: 'income', label: 'Possible gift', amount: 100000, date: addDays(today, 1), certainty: 'possible' });
  assert.equal(billFocus(data, 'sample-rent', today).gap, 15000);
  assert.equal(billFocus({ ...data, balance: 150000 }, 'sample-rent', today).status, 'covered');
});

test('one-bill view flags overdue and distant bills before giving coverage', () => {
  const data = sampleData(today);
  data.entries.push({ id: 'old', kind: 'expense', label: 'Old bill', amount: 1000, date: addDays(today, -1), essential: true });
  data.entries.push({ id: 'later', kind: 'expense', label: 'Later bill', amount: 1000, date: addDays(today, 20), essential: true });
  assert.equal(billFocus(data, 'old', today).status, 'overdue');
  assert.equal(billFocus(data, 'later', today).status, 'outside-window');
});

test('a bill due today uses only today when searching a focused rescue move', () => {
  const data = { version: 1, balance: 5000, horizon: 14, entries: [
    { id: 'bill', kind: 'expense', label: 'Bill', amount: 10000, date: today, essential: true },
    { id: 'later', kind: 'expense', label: 'Later outing', amount: 5000, date: addDays(today, 1), essential: false }
  ], history: [] };
  assert.equal(billFocus(data, 'bill', today).gap, 5000);
  const todayOnly = rescuePlan({ ...data, horizon: 0 }, {}, today);
  assert.equal(todayOnly.result.end, today);
  assert.equal(todayOnly.possible, false);
  assert.deepEqual(todayOnly.entries, []);
});

test('unconfirmed income never counts without an explicit optimistic scenario', () => {
  const data = sampleData(today);
  const conservative = project(data, {}, today);
  const optimistic = project(data, { includePossible: true }, today);
  assert.ok(optimistic.rows.at(-1).balance > conservative.rows.at(-1).balance);
  assert.equal(optimistic.firstRisk.date, conservative.firstRisk.date, 'later possible pay must not fix an earlier bill');
  assert.equal(data.entries.find(e => e.id === 'sample-weekend').certainty, 'possible');
});

test('late confirmed income can expose an earlier essential bill', () => {
  const data = { version: 1, balance: 10000, horizon: 14, entries: [
    { id: 'pay', kind: 'income', label: 'Pay', amount: 20000, date: addDays(today, 2), certainty: 'confirmed' },
    { id: 'rent', kind: 'expense', label: 'Rent', amount: 25000, date: addDays(today, 3), essential: true }
  ], history: [] };
  assert.equal(project(data, {}, today).gap, 0);
  const late = project(data, { delayId: 'pay', delayDays: 3 }, today);
  assert.equal(late.gap, 15000);
  assert.equal(late.firstRisk.date, addDays(today, 3));
  assert.deepEqual(late.firstRisk.bills, ['Rent']);
});

test('a purchase can be removed from a rescue plan without inventing money', () => {
  const data = { version: 1, balance: 10000, horizon: 14, entries: [
    { id: 'bill', kind: 'expense', label: 'Bill', amount: 10000, date: addDays(today, 2), essential: true }
  ], history: [] };
  const plan = rescuePlan(data, { purchase: 8000 }, today);
  assert.equal(plan.possible, true);
  assert.deepEqual(plan.entries.map(e => e.id), ['scenario-purchase']);
  assert.equal(plan.result.gap, 0);
});

test('an impossible rescue states the uncovered gap', () => {
  const data = { version: 1, balance: 10000, horizon: 14, entries: [
    { id: 'bill', kind: 'expense', label: 'Bill', amount: 20000, date: addDays(today, 2), essential: true },
    { id: 'coffee', kind: 'expense', label: 'Coffee', amount: 2000, date: addDays(today, 1), essential: false }
  ], history: [] };
  const plan = rescuePlan(data, {}, today);
  assert.equal(plan.possible, false);
  assert.equal(plan.remaining, 10000);
});

test('rescue respects a cost the user cannot move and restores options when unlocked', () => {
  const data = sampleData(today);
  const baseline = project(data, {}, today);
  const first = rescuePlan(data, {}, today);
  const locked = { ...data, cannotMoveIds: first.entries.map(e => e.id) };
  const revised = rescuePlan(locked, {}, today);
  assert.ok(revised.entries.every(e => !locked.cannotMoveIds.includes(e.id)));
  assert.equal(project(locked, {}, today).gap, baseline.gap, 'locked costs remain in the forecast');
  assert.equal(revised.possible, false);
  assert.ok(revised.remaining > 0);
  assert.deepEqual(rescuePlan({ ...locked, cannotMoveIds: [] }, {}, today).entries.map(e => e.id), first.entries.map(e => e.id));
});

test('rescue never treats possible income as bill cover', () => {
  const data = { version: 1, balance: 5000, horizon: 14, entries: [
    { id: 'bill', kind: 'expense', label: 'Bill', amount: 10000, date: addDays(today, 2), essential: true },
    { id: 'hope', kind: 'income', label: 'Possible work', amount: 20000, date: addDays(today, 1), certainty: 'possible' }
  ], history: [] };
  assert.equal(project(data, { includePossible: true }, today).gap, 0);
  assert.equal(rescuePlan(data, { includePossible: true }, today).remaining, 5000);
});

test('same-day expected income cannot make an earlier bill or purchase look covered', () => {
  const data = { version: 1, balance: 10000, horizon: 14, entries: [
    { id: 'rent', kind: 'expense', label: 'Rent', amount: 10000, date: today, essential: true },
    { id: 'pay', kind: 'income', label: 'Pay', amount: 10000, date: today, certainty: 'confirmed' }
  ], history: [] };
  const forecast = project(data, {}, today);
  assert.equal(forecast.rows[0].balance, 10000, 'end-of-day balance includes the pay');
  assert.equal(forecast.rows[0].lowBalance, 0, 'bill is checked before unreceived pay');
  assert.equal(purchaseDecision(data, 5000, today).status, 'creates-gap');
  assert.equal(billFocus({ ...data, balance: 5000 }, 'rent', today).gap, 5000);
  const withFlexible = { ...data, balance: 5000, entries: [...data.entries,
    { id: 'extra', kind: 'expense', label: 'Extra', amount: 5000, date: today, essential: false }] };
  const rescue = rescuePlan(withFlexible, {}, today);
  assert.equal(rescue.possible, false, 'moving an unrelated cost still cannot cover rent before pay arrives');
  assert.equal(rescue.remaining, 5000);
});

test('rescue respects due dates when choosing flexible spending', () => {
  const data = { version: 1, balance: 10000, horizon: 14, entries: [
    { id: 'a', kind: 'expense', label: 'A', amount: 2000, date: addDays(today, 1), essential: false },
    { id: 'b', kind: 'expense', label: 'B', amount: 3000, date: addDays(today, 1), essential: false },
    { id: 'bill', kind: 'expense', label: 'Bill', amount: 10000, date: addDays(today, 2), essential: true },
    { id: 'late', kind: 'expense', label: 'Later', amount: 4000, date: addDays(today, 3), essential: false }
  ], history: [] };
  const plan = rescuePlan(data, {}, today);
  assert.deepEqual(plan.entries.map(e => e.id), ['a', 'b', 'late']);
  assert.equal(plan.result.gap, 0);
});

test('income pattern uses median amount and cadence, never future items', () => {
  const data = sampleData(today);
  const pattern = inferIncome(data.history, today);
  assert.equal(pattern.length, 1);
  assert.equal(pattern[0].amount, 60500);
  assert.equal(pattern[0].date, addDays(today, 6));
  assert.equal(pattern[0].confidence, 'steady pattern');
});

test('income clues reject repeated same-day and stale historical payments', () => {
  const onOneDay = [1, 2, 3].map(n => ({ id: `same-${n}`, label: 'Old gig', amount: 10000, date: '1900-01-01' }));
  assert.deepEqual(inferIncome(onOneDay, today), []);
  const oldDaily = [1, 2, 3].map(n => ({ id: `old-${n}`, label: 'Old gig', amount: 10000, date: `1900-01-0${n}` }));
  assert.deepEqual(inferIncome(oldDaily, today), [], 'a century-old cadence is not a useful current clue');
});

test('money amounts convert to integer cents and reject negatives', () => {
  assert.equal(cents('80.25'), 8025);
  assert.throws(() => cents(-1));
  assert.ok(money(50).includes('0,50'), '50 cents must not render as zero rand');
});

test('check-in updates cash once, removes the scheduled payment, and can be undone', () => {
  const original = sampleData(today);
  const received = settleEntry(original, 'sample-gig', today);
  assert.equal(received.balance, original.balance + 65000);
  assert.ok(!received.entries.some(row => row.id === 'sample-gig'));
  assert.equal(project(received, {}, today).rows.at(-1).balance, project(original, {}, today).rows.at(-1).balance);
  assert.equal(received.activity[0].settledAt, today);
  const restored = undoSettlement(received);
  assert.equal(restored.balance, original.balance);
  assert.deepEqual(restored.entries, original.entries);
});

test('check-in refuses an unaffordable payment and preserves a later balance edit', () => {
  const original = sampleData(today);
  assert.throws(() => settleEntry({ ...original, balance: 1000 }, 'sample-rent', today), /exceeds/);
  const paid = settleEntry(original, 'sample-outing', today);
  assert.equal(paid.balance, original.balance - 22000);
  assert.throws(() => undoSettlement({ ...paid, balance: paid.balance + 1000 }), /changed/);
});

test('check-in cannot create a balance that a backup would reject', () => {
  const data = { version: 1, balance: 99_990_000, horizon: 14, entries: [
    { id: 'pay', kind: 'income', label: 'Pay', amount: 20_000, date: today, certainty: 'confirmed' }
  ], history: [] };
  assert.throws(() => settleEntry(data, 'pay', today, 'next'), /cannot exceed R1,000,000/);
});

test('monthly bills continue from their chosen day, including short months, and Undo removes the new bill', () => {
  assert.equal(nextMonthlyDate('2026-01-31', 31), '2026-02-28');
  assert.equal(nextMonthlyDate('2026-02-28', 31), '2026-03-31');
  assert.equal(nextMonthlyDate('2026-12-31', 31), '2027-01-31');
  const original = { version: 1, balance: 50000, horizon: 14, entries: [
    { id: 'rent', kind: 'expense', label: 'Rent', amount: 10000, date: '2026-01-31', essential: true, repeat: 'monthly', anchorDay: 31 }
  ], history: [] };
  const paid = settleEntry(original, 'rent', '2026-01-31', 'next-rent');
  assert.equal(paid.balance, 40000);
  assert.deepEqual(paid.entries.map(row => row.date), ['2026-02-28']);
  assert.equal(paid.entries[0].anchorDay, 31);
  assert.deepEqual(undoSettlement(paid).entries, original.entries);
  assert.throws(() => undoSettlement({ ...paid, entries: [{ ...paid.entries[0], amount: 11000 }] }), /changed/);
});

test('next check-in prioritises overdue bills, arrived income, then the next bill', () => {
  const bill = { id: 'rent', kind: 'expense', label: 'Rent', amount: 10000, date: addDays(today, 2), essential: true };
  const pay = { id: 'pay', kind: 'income', label: 'Pay', amount: 12000, date: today, certainty: 'confirmed' };
  const base = { entries: [bill, pay] };
  assert.deepEqual(nextAttention(base, today), { type: 'due-income', entry: pay });
  assert.deepEqual(nextAttention({ entries: [bill] }, today), { type: 'upcoming-bill', entry: bill });
  assert.equal(nextAttention({ entries: [{ ...bill, date: addDays(today, -1) }, pay] }, today).type, 'overdue-bill');
  assert.equal(nextAttention({ entries: [] }, today).type, 'add-bill');
});

test('spend check names the threatened bill and finds the first covered date', () => {
  const data = { version: 1, balance: 10000, horizon: 14, entries: [
    { id: 'rent', kind: 'expense', label: 'Rent', amount: 9000, date: addDays(today, 2), essential: true },
    { id: 'pay', kind: 'income', label: 'Confirmed pay', amount: 5000, date: addDays(today, 3), certainty: 'confirmed' }
  ], history: [] };
  const decision = purchaseDecision(data, 2000, today);
  assert.equal(decision.status, 'creates-gap');
  assert.equal(decision.affectedBill.label, 'Rent');
  assert.equal(decision.after.gap, 1000);
  assert.equal(decision.waitDate, addDays(today, 4), 'wait until after unreceived same-day pay');
  assert.equal(purchaseDecision(data, 500, today).status, 'covered');
});

test('spend check exposes existing gaps and does not invent cover from possible pay', () => {
  const sample = sampleData(today);
  const decision = purchaseDecision(sample, 8000, today);
  assert.equal(decision.status, 'existing-gap');
  assert.equal(decision.addedGap, 8000);
  assert.equal(decision.affectedBill.label, 'Rent');
  assert.equal(decision.waitDate, null);
  assert.equal(purchaseDecision({ ...sample, entries: sample.entries.filter(e => !e.essential) }, 8000, today).status, 'incomplete');
});

test('the welcome demo keeps the numbers it promises a first visitor', () => {
  const sample = sampleData(today);
  const rent = billFocus(sample, 'sample-rent', today);
  const rentAfter = billFocus(sample, 'sample-rent', today, { purchase: 8000 });
  const decision = purchaseDecision(sample, 8000, today);
  const plan = rescuePlan(sample, {}, today);
  assert.equal(rent.gap, 15000);
  assert.equal(rentAfter.gap, 23000);
  assert.equal(decision.baseline.gap, 30000);
  assert.equal(decision.after.gap, 38000);
  assert.deepEqual(plan.entries.map(entry => [entry.label, entry.amount]), [
    ['Takeaway & airtime', 18000],
    ['Extra data bundle', 15000]
  ]);
  assert.equal(plan.entries.reduce((total, entry) => total + entry.amount, 0), 33000);
});

test('recorded purchase lowers on-hand cash once and remains undoable', () => {
  const original = sampleData(today);
  const recorded = recordPurchase(original, 8000, 'purchase-1', today);
  assert.equal(recorded.balance, original.balance - 8000);
  assert.ok(!recorded.entries.some(entry => entry.id === 'purchase-1'));
  assert.equal(recorded.activity[0].entry.label, 'Purchase');
  assert.equal(undoSettlement(recorded).balance, original.balance);
  assert.throws(() => recordPurchase({ ...original, balance: 1000 }, 8000, 'purchase-2', today), /exceeds/);
});

test('spend check refuses a covered verdict while an essential bill is overdue', () => {
  const data = sampleData(today);
  data.entries.push({ id: 'old-bill', kind: 'expense', label: 'Old rent', amount: 1000, date: addDays(today, -1), essential: true });
  const decision = purchaseDecision(data, 100, today);
  assert.equal(decision.status, 'needs-update');
  assert.equal(decision.overdueBills[0].label, 'Old rent');
  assert.equal(project(data, {}, today).rows[0].entries.find(entry => entry.id === 'old-bill').date, today);
});

test('forecast date follows the South African calendar at UTC midnight', () => {
  assert.equal(todayZA(new Date('2026-10-23T22:10:00Z')), '2026-10-24');
});
