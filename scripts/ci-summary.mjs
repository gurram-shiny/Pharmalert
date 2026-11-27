import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const evidence = 'reports/evidence';
await mkdir(evidence, { recursive: true });
const env = process.env;
const read = async (file) => {
  try { return await readFile(`${evidence}/${file}`, 'utf8'); }
  catch { return ''; }
};
const tapCounts = (text) => {
  const number = (name) => Number(text.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1] ?? 0);
  return { passed: number('pass'), failed: number('fail') };
};
const jsonRows = async (file, result) => {
  if (!['success', 'failure'].includes(result)) return { passed: 0, failed: 0 };
  try {
    const rows = JSON.parse(await readFile(`${evidence}/${file}`, 'utf8'));
    if (!Array.isArray(rows)) return { passed: 0, failed: 0 };
    return {
      passed: rows.filter((row) => row.status === 'PASS').length,
      failed: rows.filter((row) => row.status === 'FAIL').length,
    };
  } catch { return { passed: 0, failed: 0 }; }
};
const gateCount = (result) => result === 'success' ? { passed: 1, failed: 0 } : result === 'failure' ? { passed: 0, failed: 1 } : { passed: 0, failed: 0 };
const tests = [
  ['Unit tests', ['success', 'failure'].includes(env.UNIT_RESULT) ? tapCounts(await read('unit.tap')) : { passed: 0, failed: 0 }, env.UNIT_RESULT],
  ['Backend tests', ['success', 'failure'].includes(env.BACKEND_RESULT) ? tapCounts(await read('backend.tap')) : { passed: 0, failed: 0 }, env.BACKEND_RESULT],
  ['Selenium', await jsonRows('selenium.json', env.SELENIUM_RESULT), env.SELENIUM_RESULT],
  ['Appium', await jsonRows('appium.json', env.APPIUM_RESULT), env.APPIUM_RESULT],
  ['Security source scan', gateCount(env.SECURITY_RESULT), env.SECURITY_RESULT],
  ['Dependency audit', gateCount(env.AUDIT_RESULT), env.AUDIT_RESULT],
  ['Dataset evidence validation', gateCount(env.DATASET_RESULT), env.DATASET_RESULT],
  ['Performance thresholds', gateCount(env.PERFORMANCE_RESULT), env.PERFORMANCE_RESULT],
];
const gates = [
  ['TypeScript check', env.TYPECHECK_RESULT], ['Web and Android bundle build', env.BUILD_RESULT],
  ['Android prebuild', env.PREBUILD_RESULT], ['Android APK build', env.ANDROID_BUILD_RESULT],
  ['Appium setup', env.APPIUM_INSTALL_RESULT],
];
const bar = ({ passed, failed }) => {
  const total = passed + failed;
  if (!total) return 'no test report';
  const width = 20;
  const green = Math.round(width * passed / total);
  return `${'🟩'.repeat(green)}${'🟥'.repeat(width - green)} ${passed} passed / ${failed} failed`;
};
const table = tests.map(([name, counts, result]) => `| ${name} | ${result ?? 'not run'} | ${counts.passed} | ${counts.failed} | ${bar(counts)} |`).join('\n');
const gateTable = gates.map(([name, result]) => `| ${name} | ${result ?? 'not run'} |`).join('\n');
let performanceNote = '';
try {
  const data = JSON.parse(await read('k6.json'));
  const checks = data.metrics?.checks?.values;
  if (checks && ['success', 'failure'].includes(env.PERFORMANCE_RESULT)) performanceNote = `\n\nk6 observed ${checks.passes} passing checks and ${checks.fails} failing checks. See the attached k6 JSON for measured latency and threshold values.`;
} catch { /* Missing report is shown by the suite result above. */ }
let clinicalEvidence = 'Dataset verification report was not produced; clinical evidence status is unknown for this run.';
try {
  if (!['success', 'failure'].includes(env.DATASET_RESULT)) throw new Error('Dataset check did not run.');
  const report = JSON.parse(await read('dataset-validation.json'));
  const verified = report.results?.filter((row) => row.status === 'VERIFIED').length ?? 0;
  const unverified = report.results?.filter((row) => row.status === 'UNVERIFIED').length ?? 0;
  clinicalEvidence = `Source audit: ${verified} interaction rules verified against their recorded label passages; ${unverified} marked UNVERIFIED and must not be presented as confirmed interactions. This source check does not constitute pharmacist or clinical validation.`;
} catch { /* Keep explicit unknown status when no clean JSON report exists. */ }
const summary = `# PharmAlert full quality gate\n\n` +
  `Commit: \`${env.GITHUB_SHA ?? 'local run'}\`\n\n` +
  `## Test graph and counts\n\n| Suite | Execution | Passed | Failed | Graph (green = passed, red = failed) |\n|---|---:|---:|---:|---|\n${table}\n\n` +
  `## Build and setup gates\n\n| Gate | Execution |\n|---|---|\n${gateTable}\n\n` +
  `## Clinical evidence status\n\n${clinicalEvidence}\n\n` +
  `Counts come from this run's TAP or structured test reports. A missing report is recorded as zero tests and must not be interpreted as a pass. Detailed logs, screenshots and structured results are attached as the workflow artifact.${performanceNote}\n`;
await writeFile(`${evidence}/workflow-summary.md`, summary);
if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, summary);
else process.stdout.write(summary);
