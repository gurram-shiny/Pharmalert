const defaultRequired = [
  'TYPECHECK_RESULT', 'UNIT_RESULT', 'BACKEND_RESULT', 'DATASET_RESULT', 'WEB_BUILD_RESULT', 'BUNDLE_EXPORT_RESULT',
  'SELENIUM_RESULT', 'SECURITY_RESULT', 'AUDIT_RESULT', 'PERFORMANCE_RESULT', 'PREBUILD_RESULT',
  'ANDROID_BUILD_RESULT', 'APPIUM_INSTALL_RESULT', 'APPIUM_RESULT',
];
const required = process.env.CI_REQUIRED_GATES
  ? process.env.CI_REQUIRED_GATES.split(',').map((key) => key.trim()).filter(Boolean)
  : defaultRequired;
const failures = required.filter((key) => process.env[key] !== 'success');
if (failures.length) {
  console.error('Required quality gates failed or did not run:');
  for (const key of failures) console.error(`- ${key}: ${process.env[key] ?? 'not run'}`);
  process.exitCode = 1;
} else {
  console.log('All required quality gates completed successfully.');
}
