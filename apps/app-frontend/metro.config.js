// Gradle supplies entry paths relative to this workspace.
process.env.EXPO_NO_METRO_WORKSPACE_ROOT ??= '1';
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
const workspace = path.resolve(__dirname,'../..');
config.watchFolders = [...new Set([...config.watchFolders,workspace])];

const entries = {
  'expo-font':require.resolve('expo-font'),
  '@pharmalert/shared':path.join(workspace,'packages/shared/index.ts'),
  '@pharmalert/data-services':path.join(workspace,'packages/data-services/index.ts'),
  '@pharmalert/interaction-engine':path.join(workspace,'packages/interaction-engine/index.ts'),
};
config.resolver.resolveRequest = (context, moduleName, platform) =>
  context.resolveRequest(context,Object.hasOwn(entries,moduleName) ? entries[moduleName] : moduleName,platform);

module.exports = config;
