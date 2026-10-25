import test from 'node:test';
import assert from 'node:assert/strict';
import { createEncryptedBackup, openEncryptedBackup, planSnapshot } from '../backup.js';
import { sampleData } from '../engine.js';

const today = '2026-10-23';

test('encrypted backup restores cash flow and constraints without keeping Undo history', async () => {
  const original = sampleData(today);
  original.cannotMoveIds = ['sample-takeaway'];
  original.activity = [{ id: 'old-action' }];
  const file = await createEncryptedBackup(original, 'a long private phrase', '2026-10-23T14:00:00.000Z');
  assert.ok(!file.includes('Cleaning job payment'), 'bill and income details must not appear in the downloaded file');
  const restored = await openEncryptedBackup(file, 'a long private phrase');
  assert.equal(restored.createdAt, '2026-10-23T14:00:00.000Z');
  assert.deepEqual(restored.plan.entries, original.entries);
  assert.deepEqual(restored.plan.cannotMoveIds, ['sample-takeaway']);
  assert.deepEqual(restored.plan.activity, []);
  assert.equal(restored.plan.balance, original.balance);
});

test('wrong passphrase, changed metadata, and invalid plan never produce a restore candidate', async () => {
  const file = await createEncryptedBackup(sampleData(today), 'a long private phrase');
  await assert.rejects(openEncryptedBackup(file, 'another long phrase'), /Could not open/);
  const altered = JSON.parse(file);
  altered.createdAt = '2026-10-24T14:00:00.000Z';
  await assert.rejects(openEncryptedBackup(JSON.stringify(altered), 'a long private phrase'), /Could not open/);
  assert.throws(() => planSnapshot({ ...sampleData(today), entries: [{ id: 'bad', kind: 'expense', label: '<script>', amount: -1, date: today, essential: true }] }), /invalid payment/);
});
