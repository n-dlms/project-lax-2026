import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreWorkspace, workspaceSnapshot } from '../workspace.js';

test('a workspace restores an unfinished bill without storing backup secrets', () => {
  const state = {
    tab: 'money', focusOpen: false, focusedBillId: '', delayId: '', delayDays: 0,
    purchase: 0, spendAmount: 0, includePossible: false, showForm: true, formKind: 'expense', editId: '',
    formDraft: { kind: 'expense', editId: '', label: 'Electricity', amount: '240', date: '2026-10-28', class: 'essential', repeat: true },
    inputDrafts: { 'balance-input': '1200' }, backupMode: 'export', backupPassphrase: 'do-not-store-this'
  };
  const json = JSON.stringify(workspaceSnapshot(state, 418));
  assert.ok(!json.includes('do-not-store-this'));
  assert.ok(!json.includes('backupMode'));
  const restored = restoreWorkspace(json);
  assert.equal(restored.tab, 'money');
  assert.equal(restored.showForm, true);
  assert.equal(restored.formDraft.label, 'Electricity');
  assert.equal(restored.formDraft.repeat, true);
  assert.equal(restored.inputDrafts['balance-input'], '1200');
  assert.equal(restored.scrollY, 418);
});

test('stale and invalid workspace references cannot reopen an unrelated edit', () => {
  const state = { tab: 'money', showForm: true, formKind: 'expense', editId: 'deleted-bill',
    formDraft: { kind: 'expense', editId: 'deleted-bill', label: 'Old', amount: '10', date: '2026-10-28' }, inputDrafts: {}, delayId: 'old-pay', delayDays: 5 };
  const restored = restoreWorkspace(JSON.stringify(workspaceSnapshot(state)), []);
  assert.equal(restored.showForm, false);
  assert.equal(restored.formDraft, null);
  assert.equal(restored.delayId, '');
  assert.equal(restored.delayDays, 0);
  assert.equal(restoreWorkspace('{bad'), null);
});

test('a bill conversation draft resumes only for its original bill', () => {
  const state = { tab: 'overview', focusOpen: true, focusedBillId: 'rent', conversationBillId: 'rent',
    conversationDraft: 'I can speak on Tuesday. Please explain the options.', inputDrafts: {} };
  const saved = JSON.stringify(workspaceSnapshot(state));
  const matching = restoreWorkspace(saved, [{ id: 'rent' }]);
  assert.equal(matching.conversationDraft, state.conversationDraft);
  const deleted = restoreWorkspace(saved, [{ id: 'electricity' }]);
  assert.equal(deleted.conversationBillId, '');
  assert.equal(deleted.conversationDraft, '');
});

test('a proposed bill date resumes only while its bill remains in the plan', () => {
  const state = { tab: 'overview', focusOpen: true, focusedBillId: 'rent', billDateTestId: 'rent', billDateTestDate: '2026-10-31', inputDrafts: {} };
  const saved = JSON.stringify(workspaceSnapshot(state));
  const active = restoreWorkspace(saved, [{ id: 'rent' }]);
  assert.equal(active.billDateTestDate, '2026-10-31');
  const removed = restoreWorkspace(saved, []);
  assert.equal(removed.billDateTestId, '');
  assert.equal(removed.billDateTestDate, '');
});

test('coach worksheets and a payment follow-up resume after a reload', () => {
  const state = { tab: 'coach', inputDrafts: { 'cushion-amount': '125.50' }, cushionAmount: 10000,
    sourceInputs: { cash: '80', bank: '235.25', other: '' },
    payFollowupId: 'invoice', payFollowupDraft: 'Please confirm the revised date.' };
  const saved = JSON.stringify(workspaceSnapshot(state, 900));
  const restored = restoreWorkspace(saved, [{ id: 'invoice' }]);
  assert.equal(restored.tab, 'coach');
  assert.equal(restored.inputDrafts['cushion-amount'], '125.50');
  assert.deepEqual(restored.sourceInputs, state.sourceInputs);
  assert.equal(restored.payFollowupDraft, state.payFollowupDraft);
  assert.equal(restored.scrollY, 900);
  const stale = restoreWorkspace(saved, []);
  assert.equal(stale.payFollowupId, '');
  assert.equal(stale.payFollowupDraft, '');
});

test('a guided first bill resumes with blank money fields and no sample values', () => {
  const state = { tab: 'overview', guidedStart: true, inputDrafts: {
    'guided-label': 'Rent', 'guided-date': '2026-10-29', 'guided-amount': '', 'guided-balance': ''
  } };
  const restored = restoreWorkspace(JSON.stringify(workspaceSnapshot(state)), []);
  assert.equal(restored.guidedStart, true);
  assert.equal(restored.inputDrafts['guided-label'], 'Rent');
  assert.equal(restored.inputDrafts['guided-amount'], '');
  assert.equal(restored.inputDrafts['guided-balance'], '');
});
