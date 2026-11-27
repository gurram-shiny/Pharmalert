import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const evidence = path.join('reports', 'evidence');
const env = process.env;
const suiteNames = {
  baseline: 'Baseline, security and build',
  selenium: 'Selenium browser suite',
  appium: 'Android Appium suite',
  performance: 'k6 performance suite',
};

if (!suiteNames[env.CI_SUITE]) throw new Error(`Unknown CI_SUITE: ${env.CI_SUITE ?? '(unset)'}`);
await mkdir(evidence, { recursive: true });

async function readText(file) {
  try {
    return await readFile(path.join(evidence, file), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function readJson(file) {
  const contents = await readText(file);
  if (contents === null) return null;
  try {
    return JSON.parse(contents);
  } catch (error) {
    if (error instanceof SyntaxError) return { parseError: error.message };
    throw error;
  }
}

function outcome(value) {
  if (value === 'success') return 'PASS';
  if (value === 'failure') return 'FAIL';
  return 'NOT RUN';
}

function countStatus(rows) {
  return {
    passed: rows.filter((row) => row.status === 'PASS').length,
    failed: rows.filter((row) => row.status === 'FAIL').length,
  };
}

const summaryRows = [];
const caseRows = [];
function addGate(name, file, result, details = '') {
  const status = outcome(result);
  summaryRows.push({
    file,
    name,
    status,
    passed: status === 'PASS' ? 1 : 0,
    failed: status === 'FAIL' ? 1 : 0,
    details: details || `Execution result: ${result ?? 'not run'}.`,
  });
}

function addJsonCases(file, name, result, items) {
  if (items === null) {
    const status = outcome(result) === 'NOT RUN' ? 'NOT RUN' : 'MISSING';
    summaryRows.push({
      file,
      name,
      status,
      passed: 0,
      failed: status === 'MISSING' ? 1 : 0,
      details: `Expected structured result file ${file} was not produced.`,
    });
    return;
  }
  if (items.parseError || !Array.isArray(items)) {
    summaryRows.push({
      file,
      name,
      status: 'MALFORMED',
      passed: 0,
      failed: 1,
      details: items.parseError ?? `Expected an array of structured results in ${file}.`,
    });
    return;
  }
  if (!items.length) {
    summaryRows.push({
      file,
      name,
      status: 'EMPTY',
      passed: 0,
      failed: 1,
      details: `No structured result rows were found in ${file}.`,
    });
    return;
  }

  const normalized = items.map((item) => {
    const status = item.status === 'PASS' || item.status === 'VERIFIED' ? 'PASS'
      : item.status === 'FAIL' ? 'FAIL'
        : item.status === 'UNVERIFIED' ? 'UNVERIFIED'
        : 'NOT RUN';
    return {
      file,
      id: item.id ?? '',
      description: item.description ?? item.name ?? item.title ?? '',
      expected: item.expected ?? '',
      actual: item.actual ?? item.message ?? '',
      status,
      timestamp: item.timestamp ?? '',
      evidence: item.evidence ?? file,
    };
  });
  caseRows.push(...normalized);
  summaryRows.push({
    file,
    name,
    status: outcome(result),
    ...countStatus(normalized),
    details: `${normalized.length} structured result rows.`,
  });
}

async function addTap(file, name, result) {
  const text = await readText(file);
  if (text === null) {
    const status = outcome(result) === 'NOT RUN' ? 'NOT RUN' : 'MISSING';
    summaryRows.push({
      file,
      name,
      status,
      passed: 0,
      failed: status === 'MISSING' ? 1 : 0,
      details: `Expected TAP result file ${file} was not produced.`,
    });
    return;
  }

  const number = (label) => Number(text.match(new RegExp(`^# ${label} (\\d+)$`, 'm'))?.[1] ?? 0);
  const testRows = [...text.matchAll(/^\s*(not ok|ok)\s+\d+(?:\s+-\s+(.+))?$/gm)]
    .map((match, index) => ({
      file,
      id: String(index + 1),
      description: match[2] ?? `${name} test ${index + 1}`,
      expected: 'Test passes.',
      actual: match[1] === 'ok' ? 'Passed.' : 'Failed.',
      status: match[1] === 'ok' ? 'PASS' : 'FAIL',
      timestamp: '',
      evidence: file,
    }));
  const counts = { passed: number('pass'), failed: number('fail') };
  caseRows.push(...testRows);
  summaryRows.push({
    file,
    name,
    status: outcome(result),
    ...counts,
    details: `${testRows.length} named TAP results captured.`,
  });
}

async function addDataset(result) {
  const file = 'dataset-validation.json';
  const report = await readJson(file);
  if (!report) {
    const status = outcome(result) === 'NOT RUN' ? 'NOT RUN' : 'MISSING';
    summaryRows.push({
      file,
      name: 'Dataset source verification',
      status,
      passed: 0,
      failed: status === 'MISSING' ? 1 : 0,
      details: `Expected dataset validation file ${file} was not produced.`,
    });
    return;
  }
  if (report.parseError) {
    summaryRows.push({
      file,
      name: 'Dataset source verification',
      status: 'MALFORMED',
      passed: 0,
      failed: 1,
      details: report.parseError,
    });
    return;
  }
  if (!Array.isArray(report.results)) {
    summaryRows.push({
      file,
      name: 'Dataset source verification',
      status: 'MALFORMED',
      passed: 0,
      failed: 1,
      details: `Expected a results array in ${file}.`,
    });
    return;
  }
  addJsonCases(file, 'Dataset source verification', result, report.results);
}

async function addPerformance(result) {
  const file = 'k6.json';
  const report = await readJson(file);
  if (report?.parseError) {
    summaryRows.push({
      file,
      name: 'k6 performance results',
      status: 'MALFORMED',
      passed: 0,
      failed: 1,
      details: report.parseError,
    });
    return;
  }
  const checks = report?.metrics?.checks?.values;
  if (!report || !checks || !Number.isFinite(checks.passes) || !Number.isFinite(checks.fails)) {
    const status = outcome(result) === 'NOT RUN' ? 'NOT RUN' : 'MISSING';
    summaryRows.push({
      file,
      name: 'k6 performance results',
      status,
      passed: 0,
      failed: status === 'MISSING' ? 1 : 0,
      details: `Expected k6 checks in ${file} were not produced.`,
    });
    return;
  }
  summaryRows.push({
    file,
    name: 'k6 performance results',
    status: outcome(result),
    passed: Number(checks.passes ?? 0),
    failed: Number(checks.fails ?? 0),
    details: 'Threshold and request metrics are recorded in the attached k6 JSON.',
  });
  caseRows.push({
    file,
    id: 'k6-checks',
    description: 'k6 performance checks',
    expected: 'All configured performance thresholds pass.',
    actual: `${checks.passes ?? 0} passed; ${checks.fails ?? 0} failed.`,
    status: Number(checks.fails ?? 0) === 0 && outcome(result) === 'PASS' ? 'PASS' : 'FAIL',
    timestamp: '',
    evidence: file,
  });
}

if (env.CI_SUITE === 'baseline') {
  addGate('TypeScript check', 'TypeScript check', env.TYPECHECK_RESULT);
  await addTap('unit.tap', 'Unit tests', env.UNIT_RESULT);
  await addTap('backend.tap', 'Backend tests', env.BACKEND_RESULT);
  await addDataset(env.DATASET_RESULT);
  addGate('Web frontend build', 'Web frontend build', env.WEB_BUILD_RESULT);
  addGate('Android bundle export', 'Android bundle export', env.BUNDLE_EXPORT_RESULT);
  addGate('Security source baseline', 'Security source baseline', env.SECURITY_RESULT);
  const audit = await readJson('npm-audit.json');
  const vulnerabilities = audit?.metadata?.vulnerabilities;
  if (audit?.parseError || (env.AUDIT_RESULT === 'success' && !vulnerabilities)) {
    summaryRows.push({
      file: 'npm-audit.json',
      name: 'Dependency vulnerability audit',
      status: 'MALFORMED',
      passed: 0,
      failed: 1,
      details: audit?.parseError ?? 'Successful audit did not include vulnerability counts.',
    });
  } else {
    addGate(
      'Dependency vulnerability audit',
      'npm-audit.json',
      env.AUDIT_RESULT,
      vulnerabilities
        ? `${vulnerabilities.critical} critical, ${vulnerabilities.high} high, ${vulnerabilities.moderate} moderate, ${vulnerabilities.low} low advisories.`
        : 'Audit report contains no vulnerability counts.',
    );
  }
} else if (env.CI_SUITE === 'selenium') {
  addJsonCases('selenium.json', 'Selenium browser cases', env.SELENIUM_RESULT, await readJson('selenium.json'));
} else if (env.CI_SUITE === 'appium') {
  addGate('Android native prebuild', 'Android prebuild', env.PREBUILD_RESULT);
  addGate('Android APK build', 'Android APK build', env.ANDROID_BUILD_RESULT);
  addGate('Appium and UiAutomator2 setup', 'Appium setup', env.APPIUM_INSTALL_RESULT);
  addJsonCases('appium.json', 'Appium native cases', env.APPIUM_RESULT, await readJson('appium.json'));
} else {
  await addPerformance(env.PERFORMANCE_RESULT);
}

const allCounts = summaryRows.reduce((total, row) => ({
  passed: total.passed + row.passed,
  failed: total.failed + row.failed,
}), { passed: 0, failed: 0 });
const hasFailure = allCounts.failed > 0
  || summaryRows.some((row) => ['FAIL', 'MISSING', 'MALFORMED', 'EMPTY'].includes(row.status));
const overall = hasFailure ? 'FAIL'
  : summaryRows.every((row) => row.status === 'PASS') ? 'PASS' : 'NOT RUN';
const total = allCounts.passed + allCounts.failed;
const graphWidth = 30;
const passedWidth = total ? Math.round(graphWidth * allCounts.passed / total) : 0;
const graph = total
  ? `Passed  [${'#'.repeat(passedWidth)}${'-'.repeat(graphWidth - passedWidth)}] ${allCounts.passed}\nFailed  [${'#'.repeat(Math.round(graphWidth * allCounts.failed / total))}${'-'.repeat(graphWidth - Math.round(graphWidth * allCounts.failed / total))}] ${allCounts.failed}`
  : 'No test results were reported.';
const markdownCell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
const table = summaryRows.map((row) =>
  `| ${markdownCell(row.file)} | ${markdownCell(row.name)} | ${row.status} | ${row.passed} | ${row.failed} | ${markdownCell(row.details)} |`,
).join('\n');
const markdown = `# ${suiteNames[env.CI_SUITE]}\n\n` +
  `Commit: \`${env.GITHUB_SHA ?? 'local run'}\`  \n` +
  `Overall: **${overall}** — ${allCounts.passed} passed, ${allCounts.failed} failed.\n\n` +
  `## Individual file and gate results\n\n| Evidence file / gate | Check | Result | Passed | Failed | Details |\n|---|---|---:|---:|---:|---|\n${table}\n\n` +
  `## Results graph\n\n\`\`\`text\n${graph}\n\`\`\`\n`;

const report = {
  suite: suiteNames[env.CI_SUITE],
  overall,
  summaryRows,
  caseRows,
};
await writeFile(path.join(evidence, `ci-results-${env.CI_SUITE}.json`), JSON.stringify(report, null, 2));
if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, markdown);
else process.stdout.write(markdown);
