// Only the unfinished interaction is stored here. Financial entries live in the plan,
// while backup passphrases and selected files are never part of a workspace snapshot.
const TABS = new Set(['overview', 'coach', 'scenario', 'plan', 'money']);
const KINDS = new Set(['expense', 'income', 'history']);
const DRAFT_IDS = ['balance-input', 'focus-balance-input', 'spend-amount', 'purchase-amount', 'cushion-amount', 'guided-label', 'guided-date', 'guided-amount', 'guided-balance'];
const limited = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const amount = value => Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000 ? value : 0;

export function workspaceSnapshot(state, scrollY = 0, savedAt = new Date().toISOString()) {
  const draft = state.formDraft;
  const inputDrafts = {};
  for (const id of DRAFT_IDS) if (Object.hasOwn(state.inputDrafts || {}, id)) inputDrafts[id] = limited(state.inputDrafts[id], 32);
  return {
    version: 1, savedAt, tab: TABS.has(state.tab) ? state.tab : 'overview', guidedStart: !!state.guidedStart,
    focusOpen: !!state.focusOpen, focusedBillId: limited(state.focusedBillId, 120),
    billDateTestId: limited(state.billDateTestId, 120), billDateTestDate: limited(state.billDateTestDate, 10),
    conversationBillId: limited(state.conversationBillId, 120), conversationDraft: limited(state.conversationDraft, 1200),
    payFollowupId: limited(state.payFollowupId, 120), payFollowupDraft: limited(state.payFollowupDraft, 1200),
    cushionAmount: amount(state.cushionAmount),
    sourceInputs: Object.fromEntries(['cash', 'bank', 'other'].map(key => [key, limited(state.sourceInputs?.[key], 32)])),
    delayId: limited(state.delayId, 120), delayDays: Math.max(0, Math.min(10, Number(state.delayDays) || 0)),
    purchase: amount(state.purchase), spendAmount: amount(state.spendAmount), includePossible: !!state.includePossible,
    showForm: !!state.showForm && KINDS.has(state.formKind), formKind: KINDS.has(state.formKind) ? state.formKind : 'expense', editId: limited(state.editId, 120),
    formDraft: draft ? { kind: KINDS.has(draft.kind) ? draft.kind : 'expense', editId: limited(draft.editId, 120),
      label: limited(draft.label, 60), amount: limited(draft.amount, 32), date: limited(draft.date, 10),
      class: limited(draft.class, 16), repeat: !!draft.repeat } : null,
    inputDrafts, scrollY: Math.max(0, Math.min(100_000, Math.round(Number(scrollY) || 0)))
  };
}

export function restoreWorkspace(raw, entries = []) {
  let source;
  try { source = JSON.parse(raw); } catch { return null; }
  if (!source || source.version !== 1 || !TABS.has(source.tab)) return null;
  const clean = workspaceSnapshot(source, source.scrollY, source.savedAt);
  const ids = new Set(entries.map(entry => entry.id));
  if (!ids.has(clean.focusedBillId)) clean.focusedBillId = '';
  if (!ids.has(clean.billDateTestId) || !/^\d{4}-\d{2}-\d{2}$/.test(clean.billDateTestDate)) { clean.billDateTestId = ''; clean.billDateTestDate = ''; }
  if (!ids.has(clean.conversationBillId)) { clean.conversationBillId = ''; clean.conversationDraft = ''; }
  if (!ids.has(clean.payFollowupId)) { clean.payFollowupId = ''; clean.payFollowupDraft = ''; }
  if (!ids.has(clean.delayId)) { clean.delayId = ''; clean.delayDays = 0; }
  if (clean.editId && !ids.has(clean.editId)) { clean.editId = ''; clean.showForm = false; clean.formDraft = null; }
  if (clean.formDraft && (clean.formDraft.kind !== clean.formKind || clean.formDraft.editId !== clean.editId)) clean.formDraft = null;
  return clean;
}
