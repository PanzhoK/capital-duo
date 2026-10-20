import {readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const folder of ['src','scripts'])for(const file of await readdir(new URL('../'+folder+'/',import.meta.url)))if(file.endsWith('.js')||file.endsWith('.mjs'))execFileSync(process.execPath,['--check',folder+'/'+file],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,['--check','server.mjs'],{cwd:root,stdio:'inherit'});
console.log('Sintaxis JavaScript comprobada.');
