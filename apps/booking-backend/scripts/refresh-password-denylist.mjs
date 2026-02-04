#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SOURCE_URL =
  process.env.PASSWORD_DENYLIST_URL ??
  'https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10k-most-common.txt';
const OUTPUT_PATH = resolve(
  process.cwd(),
  'apps/booking-backend/src/auth/password-denylist.txt',
);

let response;
try {
  const signal = AbortSignal.timeout(10000);
  response = await fetch(SOURCE_URL, { signal });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch denylist: ${response.status} (${SOURCE_URL})`,
    );
  }
} catch (error) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    throw new Error(`Denylist fetch timed out (${SOURCE_URL})`);
  }
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`Denylist fetch failed (${SOURCE_URL}): ${message}`);
}

const text = await response.text();
const entries = text
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith('#'));

const customEntries = [
  'Password123!',
  'Password123@',
  'Password123#',
  'Qwerty123!',
  'Qwerty123@',
  'Qwerty123#',
  'Letmein123!',
  'Letmein123@',
  'Letmein123#',
];

const uniqueEntries = Array.from(new Set([...entries, ...customEntries]));
if (uniqueEntries.length < 1000) {
  throw new Error(
    `Denylist too small (${uniqueEntries.length}); check source URL.`,
  );
}

await writeFile(OUTPUT_PATH, `${uniqueEntries.join('\n')}\n`, 'utf-8');
