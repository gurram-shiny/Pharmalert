import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../../scripts/ci-suite-report.mjs', import.meta.url));

async function runReport(reportRows, result) {
  const root = await mkdtemp(path.join(tmpdir(), 'pharmalert-ci-report-'));
  const evidence = path.join(root, 'reports', 'evidence');
  const summary = path.join(root, 'step-summary.md');
  await mkdir(evidence, { recursive: true });
  if (reportRows) await writeFile(path.join(evidence, 'selenium.json'), JSON.stringify(reportRows));
  execFileSync(process.execPath, [script], {
    cwd: root,
    env: { ...process.env, CI_SUITE: 'selenium', SELENIUM_RESULT: result, GITHUB_STEP_SUMMARY: summary },
  });
  return {
    root,
    report: JSON.parse(await readFile(path.join(evidence, 'ci-results-selenium.json'), 'utf8')),
    summary: await readFile(summary, 'utf8'),
  };
}

test('publishes per-case counts and a graph to the suite summary', async () => {
  const result = await runReport([
    { id: 'W01', description: 'Loads dashboard', expected: 'Visible', actual: 'Visible', status: 'PASS' },
    { id: 'W02', description: 'Creates account', expected: 'Created', actual: 'Timed out', status: 'FAIL' },
  ], 'failure');
  try {
    assert.equal(result.report.overall, 'FAIL');
    assert.deepEqual(result.report.summaryRows[0], {
      file: 'selenium.json',
      name: 'Selenium browser cases',
      status: 'FAIL',
      passed: 1,
      failed: 1,
      details: '2 structured result rows.',
    });
    assert.match(result.summary, /Individual file and gate results/);
    assert.match(result.summary, /Results graph/);
    assert.match(result.summary, /1 passed, 1 failed/);
  } finally {
    await rm(result.root, { recursive: true, force: true });
  }
});

test('marks a missing result file instead of reporting a pass', async () => {
  const result = await runReport(null, 'success');
  try {
    assert.equal(result.report.overall, 'FAIL');
    assert.equal(result.report.summaryRows[0].status, 'MISSING');
    assert.match(result.summary, /MISSING/);
  } finally {
    await rm(result.root, { recursive: true, force: true });
  }
});

test('marks an empty successful result file as an explicit failure', async () => {
  const result = await runReport([], 'success');
  try {
    assert.equal(result.report.overall, 'FAIL');
    assert.equal(result.report.summaryRows[0].status, 'EMPTY');
    assert.match(result.summary, /No structured result rows/);
  } finally {
    await rm(result.root, { recursive: true, force: true });
  }
});
