/* Load the browser modules (plain <script> files, globals on `window`) into a
 * Node vm context so their pure functions can be tested without a browser. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..', '..');

export function createSandbox(extra = {}) {
  const listeners = [];
  const sandbox = {
    console,
    URLSearchParams,
    Date,
    Math,
    JSON,
    Promise,
    Map,
    Set,
    Number,
    String,
    Object,
    Array,
    JSON,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: () => Promise.reject(new Error('network disabled in tests')),
    localStorage: {
      store: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; },
      setItem(k, v) { this.store[k] = String(v); },
      removeItem(k) { delete this.store[k]; },
      key(i) { return Object.keys(this.store)[i]; },
      get length() { return Object.keys(this.store).length; },
    },
    location: { search: '', href: 'https://example.test/' },
    document: {
      addEventListener(type, fn) { listeners.push({ type, fn }); },
      dispatchEvent(ev) {
        listeners.filter((l) => l.type === ev.type).forEach((l) => l.fn(ev));
      },
      getElementById() { return null; },
      querySelectorAll() { return []; },
    },
    ...extra,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return vm.createContext(sandbox);
}

export function loadScripts(context, files) {
  for (const file of files) {
    const abs = path.isAbsolute(file) ? file : path.join(REPO_ROOT, file);
    const code = fs.readFileSync(abs, 'utf8');
    vm.runInContext(code, context, { filename: abs });
  }
}

export function readFixture(name) {
  const abs = path.join(REPO_ROOT, 'tools', 'fixtures', name);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}
