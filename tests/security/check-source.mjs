import { readdir,readFile } from 'node:fs/promises';
import { join } from 'node:path';
const roots=['apps','backend','datasets','packages','scripts','.github'];
const skipped=new Set(['node_modules','dist','build','.expo','.gradle','.kotlin','.cxx']);
const signatures=[
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:ghp_|gho_|github_pat_)[A-Za-z0-9_]{30,}\b/,
  /\b(?:sk_live_|sb_secret_)[A-Za-z0-9_-]{16,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{35,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}\b/,
];
const findings=[];
async function scan(dir){
  for(const item of await readdir(dir,{withFileTypes:true})){
    const file=join(dir,item.name);
    if(item.isDirectory()&&!skipped.has(item.name))await scan(file);
    if(item.isFile()&&/\.(?:ts|tsx|mjs|js|json|md|ya?ml|example|gradle|kt|xml)$/.test(item.name)){
      const content=await readFile(file,'utf8');
      if(signatures.some(pattern=>pattern.test(content)))findings.push(file);
    }
  }
}
for(const root of roots)await scan(root);
if(findings.length){console.error('Potential credential in '+findings.join(', '));process.exitCode=1;}
else console.log('No credential signatures matched in source files.');
