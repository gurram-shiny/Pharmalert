const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = config => withAppBuildGradle(config, result => {
  if (process.platform !== 'win32' || result.modResults.language !== 'groovy') return result;
  const marker = '// PharmAlert Windows CMake paths';
  if (!result.modResults.contents.includes(marker)) {
    result.modResults.contents += '\n' + marker + '\n' + [
      'android {',
      '  externalNativeBuild.cmake.buildStagingDirectory = new File(System.getProperty("java.io.tmpdir"), "pa-" + project.projectDir.absolutePath.hashCode())',
      '  defaultConfig.externalNativeBuild.cmake.arguments "-DCMAKE_OBJECT_PATH_MAX=250"',
      '}',
      '',
    ].join('\n');
  }
  return result;
});
