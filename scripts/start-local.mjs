import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../',import.meta.url);
const processes = [
  spawn(process.execPath,['--experimental-transform-types','--env-file-if-exists=.env','backend/index.ts'],{cwd:root,stdio:'inherit'}),
  spawn(process.execPath,[fileURLToPath(new URL('node_modules/vite/bin/vite.js',root)),'--strictPort'],{cwd:new URL('apps/web-frontend/',root),stdio:'inherit'}),
];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) if (child.exitCode === null) child.kill();
  process.exitCode = code;
}
for (const child of processes) {
  child.once('error',error=>{console.error(error.message);stop(1);});
  child.once('exit',code=>stop(code ?? 1));
}
process.once('SIGINT',()=>stop(0));
process.once('SIGTERM',()=>stop(0));
