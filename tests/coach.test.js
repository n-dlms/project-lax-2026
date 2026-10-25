import test from 'node:test';
import assert from 'node:assert/strict';
import { billDateTest, billRunway, cushionScenario, dueIncome, incomeFollowupMessage, latePayRadar, patternCandidates, paydayMap, sourceTally } from '../coach.js';
import { addDays, sampleData } from '../engine.js';

const today = '2026-10-23';

test('bill runway checks each essential through its own due date', () => {
  const rows = billRunway(sampleData(today), today);
  assert.equal(rows[0].entry.label, 'Rent');
  assert.equal(rows[0].focus.gap, 15000);
  assert.ok(rows.every(row => row.entry.essential));
});

test('later bill date is a non-mutating, conservative forecast comparison', () => {
  const data = sampleData(today);
  const before = JSON.stringify(data);
  const result = billDateTest(data, 'sample-rent', addDays(today, 8), today);
  assert.equal(result.original.gap, 15000);
  assert.equal(result.simulated.gap, 0);
  assert.equal(result.originalForecast.gap, 30000);
  assert.equal(result.simulatedForecast.gap, 20000, 'other bills can still leave a gap');
  assert.equal(billDateTest(data, 'sample-rent', addDays(today, 7), today).simulated.gap, 30000, 'same-day pay is counted after the bill');
  assert.equal(JSON.stringify(data), before);
  assert.throws(() => billDateTest(data, 'sample-rent', addDays(today, 5), today), /later date/);
  assert.throws(() => billDateTest(data, 'sample-rent', addDays(today, 15), today), /14 days/);
  assert.throws(() => billDateTest(data, 'sample-rent', '2026-10-32', today), /later date/);
  data.entries.find(entry => entry.id === 'sample-rent').date = addDays(today, -1);
  assert.throws(() => billDateTest(data, 'sample-rent', addDays(today, 7), today), /overdue/);
});

test('a cushion is only a simulation and cannot exceed money on hand', () => {
  const data = sampleData(today);
  const before = data.balance;
  const result = cushionScenario(data, 10000, today);
  assert.equal(data.balance, before);
  assert.equal(result.withCushion.gap, result.usual.gap + 10000);
  assert.throws(() => cushionScenario(data, before + 1, today), /no higher/);
});

test('cash source tally accepts usable money and rejects an excessive total', () => {
  assert.equal(sourceTally({ cash: '100', bank: '200.50', other: '49.50' }), 35000);
  assert.throws(() => sourceTally({ cash: '600000', bank: '600000', other: '' }), /cannot exceed/);
  assert.throws(() => sourceTally({ cash: '-2', bank: '', other: '' }));
});

test('due income follow-up uses the actual confirmed entry', () => {
  const data = sampleData(today);
  const pay = data.entries.find(entry => entry.id === 'sample-gig');
  pay.date = today;
  assert.deepEqual(dueIncome(data, today).map(entry => entry.id), ['sample-gig']);
  const message = incomeFollowupMessage(pay);
  assert.match(message, /R\s*650/);
  assert.match(message, /23 Oct 2026/);
  assert.throws(() => incomeFollowupMessage(data.entries.find(entry => entry.id === 'sample-weekend')));
});

test('a pattern becomes only a review candidate and hides an identical listed payment', () => {
  const data = sampleData(today);
  const [candidate] = patternCandidates(data, today);
  assert.equal(candidate.label, 'Cleaning work');
  assert.equal(candidate.date, addDays(today, 6));
  data.entries.push({ id: 'already-listed', kind: 'income', label: candidate.label, amount: candidate.amount, date: candidate.date, certainty: 'possible' });
  assert.deepEqual(patternCandidates(data, today), []);
});

test('payday map protects only dated essentials and never spends possible income', () => {
  const data = sampleData(today);
  const before = JSON.stringify(data);
  const map = paydayMap(data, today);
  assert.equal(map.status, 'ready');
  assert.equal(map.neededToday, 95000);
  assert.equal(map.protectedNow, 95000);
  assert.equal(map.remainder, 25000);
  assert.equal(map.gap, 0);
  assert.equal(JSON.stringify(data), before);
  data.entries = data.entries.filter(entry => entry.kind !== 'income' || entry.certainty !== 'confirmed');
  assert.equal(paydayMap(data, today).neededToday, 150000);
  assert.equal(paydayMap(data, today).gap, 30000);
  data.entries = data.entries.filter(entry => !entry.essential);
  assert.equal(paydayMap(data, today).status, 'needs-bill');
});

test('payday map treats same-day bills before unreceived pay and flags overdue bills', () => {
  const data = sampleData(today);
  data.balance = 0;
  data.entries = [
    { id: 'bill', kind: 'expense', label: 'Electricity', amount: 30000, date: today, essential: true },
    { id: 'pay', kind: 'income', label: 'Shift', amount: 30000, date: today, certainty: 'confirmed' }
  ];
  assert.equal(paydayMap(data, today).neededToday, 30000);
  assert.equal(paydayMap(data, today).gap, 30000);
  data.entries[0].date = addDays(today, -1);
  assert.equal(paydayMap(data, today).status, 'needs-update');
});

test('late-pay radar explains added gap as a what-if without changing the plan', () => {
  const data = sampleData(today);
  const before = JSON.stringify(data);
  const radar = latePayRadar(data, today);
  assert.equal(radar.status, 'sensitive');
  assert.equal(radar.entry.id, 'sample-gig');
  assert.equal(radar.gapIncrease, 55000);
  assert.equal(JSON.stringify(data), before);
  data.entries = data.entries.filter(entry => entry.kind !== 'income' || entry.certainty !== 'confirmed');
  assert.equal(latePayRadar(data, today).status, 'needs-income');
});
