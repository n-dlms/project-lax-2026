// A portable plan contains the current cash flow, not the temporary Undo history.
// Encryption and decryption run entirely on the device.
const FORMAT = 'project-lax-encrypted-backup';
const ITERATIONS = 600_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function encode64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

function decode64(value, expectedLength = 0) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('This backup file is damaged or unsupported.');
  const bytes = Uint8Array.from(atob(value), char => char.charCodeAt(0));
  if (expectedLength && bytes.length !== expectedLength) throw new Error('This backup file is damaged or unsupported.');
  return bytes;
}

const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T12:00:00Z`))
  && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const validText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const validAmount = value => Number.isSafeInteger(value) && value > 0 && value <= 100_000_000;

export function planSnapshot(input) {
  if (!input || input.version !== 1 || !Number.isSafeInteger(input.balance) || input.balance < 0 || input.balance > 100_000_000
    || !Array.isArray(input.entries) || input.entries.length > 200 || !Array.isArray(input.history) || input.history.length > 100) {
    throw new Error('This backup does not contain a valid Project LAX plan.');
  }
  const ids = new Set();
  const entries = input.entries.map(entry => {
    if (!entry || !validText(entry.id, 120) || ids.has(entry.id) || !validText(entry.label, 60)
      || !validAmount(entry.amount) || !validDate(entry.date) || !['income', 'expense'].includes(entry.kind)
      || (entry.kind === 'income' ? !['confirmed', 'possible'].includes(entry.certainty) || entry.repeat !== undefined
        : typeof entry.essential !== 'boolean' || (entry.repeat !== undefined && (entry.repeat !== 'monthly' || !entry.essential
          || !Number.isInteger(entry.anchorDay) || entry.anchorDay < 1 || entry.anchorDay > 31)))) {
      throw new Error('This backup has an invalid payment or bill.');
    }
    ids.add(entry.id);
    return entry.kind === 'income'
      ? { id: entry.id, kind: 'income', label: entry.label.trim(), amount: entry.amount, date: entry.date, certainty: entry.certainty }
      : { id: entry.id, kind: 'expense', label: entry.label.trim(), amount: entry.amount, date: entry.date, essential: entry.essential,
        ...(entry.repeat === 'monthly' ? { repeat: 'monthly', anchorDay: entry.anchorDay } : {}) };
  });
  const history = input.history.map(row => {
    if (!row || !validText(row.id, 120) || ids.has(row.id) || !validText(row.label, 60) || !validAmount(row.amount) || !validDate(row.date)) {
      throw new Error('This backup has an invalid past payment.');
    }
    ids.add(row.id);
    return { id: row.id, label: row.label.trim(), amount: row.amount, date: row.date };
  });
  const movable = new Set(entries.filter(entry => entry.kind === 'expense' && !entry.essential).map(entry => entry.id));
  const cannotMoveIds = Array.isArray(input.cannotMoveIds) ? [...new Set(input.cannotMoveIds.filter(id => movable.has(id)))] : [];
  return { version: 1, balance: input.balance, updated: validDate(input.updated) ? input.updated : new Date().toISOString().slice(0, 10), horizon: 14, entries, history, cannotMoveIds, demo: input.demo === true, activity: [] };
}

async function keyFromPassphrase(passphrase, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function createEncryptedBackup(input, passphrase, createdAt = new Date().toISOString()) {
  if (typeof passphrase !== 'string' || passphrase.length < 12) throw new Error('Use a backup passphrase of at least 12 characters.');
  const plan = planSnapshot(input);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFromPassphrase(passphrase, salt, ITERATIONS);
  const payload = encoder.encode(JSON.stringify(plan));
  const additionalData = encoder.encode(`${FORMAT}|1|${createdAt}`);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, payload));
  return JSON.stringify({ format: FORMAT, version: 1, createdAt, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS,
    cipher: 'AES-256-GCM', salt: encode64(salt), iv: encode64(iv), data: encode64(ciphertext) });
}

export async function openEncryptedBackup(fileText, passphrase) {
  if (typeof fileText !== 'string' || fileText.length > 1_000_000) throw new Error('Choose a Project LAX backup file under 1 MB.');
  let file;
  try { file = JSON.parse(fileText); } catch { throw new Error('This is not a Project LAX backup file.'); }
  if (!file || file.format !== FORMAT || file.version !== 1 || file.kdf !== 'PBKDF2-SHA256' || file.cipher !== 'AES-256-GCM'
    || file.iterations !== ITERATIONS || typeof file.createdAt !== 'string' || Number.isNaN(Date.parse(file.createdAt))) {
    throw new Error('This backup format is unsupported.');
  }
  if (typeof passphrase !== 'string' || !passphrase) throw new Error('Enter the backup passphrase.');
  const salt = decode64(file.salt, 16);
  const iv = decode64(file.iv, 12);
  const ciphertext = decode64(file.data);
  if (ciphertext.length < 17 || ciphertext.length > 750_000) throw new Error('This backup file is damaged or unsupported.');
  try {
    const key = await keyFromPassphrase(passphrase, salt, file.iterations);
    const additionalData = encoder.encode(`${FORMAT}|1|${file.createdAt}`);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData }, key, ciphertext);
    return { plan: planSnapshot(JSON.parse(decoder.decode(plain))), createdAt: file.createdAt };
  } catch {
    throw new Error('Could not open this backup. Check the file and passphrase.');
  }
}
