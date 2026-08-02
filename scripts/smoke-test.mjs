import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const files = ['since-clock.js', 'studio.js'];
const context = {
  document: { querySelectorAll() { return []; } },
  matchMedia() { return { matches: false, addEventListener() {} }; },
  window: {},
  console,
  setTimeout,
  clearTimeout,
};

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const script = new vm.Script(source, { filename: file });
  assert.doesNotThrow(() => script.runInNewContext(context), `${file} should load without DOM regressions`);
}

console.log('since-clock smoke: both browser scripts parse and load with an empty DOM');
