import test from 'node:test';
import assert from 'node:assert/strict';
import { readLaunch, readSound, saveLaunch, saveSound } from '../experience.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('a new visitor resumes the guide step after an interrupted launch', () => {
  const storage = memoryStorage();
  assert.deepEqual(readLaunch(storage), { phase: 'film', step: 0 });
  saveLaunch(storage, '2');
  assert.deepEqual(readLaunch(storage), { phase: 'guide', step: 2 });
  saveLaunch(storage, 'done');
  assert.deepEqual(readLaunch(storage), { phase: '', step: 0 });
});

test('an updated app shows the opening once and sound is on by default', () => {
  const storage = memoryStorage();
  assert.deepEqual(readLaunch(storage), { phase: 'film', step: 0 });
  assert.equal(readSound(storage), true);
  saveSound(storage, false);
  assert.equal(readSound(storage), false);
  saveLaunch(storage, 'done');
  assert.deepEqual(readLaunch(storage), { phase: '', step: 0 });
});
