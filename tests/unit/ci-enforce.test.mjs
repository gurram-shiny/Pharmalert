import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../../scripts/ci-enforce.mjs', import.meta.url));

function enforce(env) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, ...env, CI_REQUIRED_GATES: 'SELENIUM_RESULT' },
  });
}

test('scoped gate enforcement passes when its required suite passes', () => {
  const result = enforce({ SELENIUM_RESULT: 'success', APPIUM_RESULT: 'failure' });
  assert.equal(result.status, 0, result.stderr);
});

test('scoped gate enforcement fails when its required suite fails', () => {
  const result = enforce({ SELENIUM_RESULT: 'failure' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SELENIUM_RESULT: failure/);
});
