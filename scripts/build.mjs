import {build as bundle} from 'esbuild';
import {mkdir,readFile,writeFile,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {PUBLIC_FILES} from '../server.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));

async function safeDestination(path){
 try{const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('El destino de compilación no es un archivo regular.');}
 catch(error){if(error.code!=='ENOENT')throw error;}
}
export async function build(){
 const output=resolve(root,'dist'),source=resolve(root,'src');await mkdir(output,{recursive:true});
 if((await lstat(output)).isSymbolicLink()||(await lstat(source)).isSymbolicLink())throw new Error('No se permiten enlaces en la compilación.');
 for(const file of PUBLIC_FILES){
  const target=resolve(output,file);await safeDestination(target);
  if(file==='scene.js'){
   const result=await bundle({entryPoints:[resolve(source,'scene.ts')],bundle:true,write:false,format:'esm',platform:'browser',target:['es2020'],minify:true,legalComments:'eof',sourcemap:false});
   await writeFile(target,result.outputFiles[0].contents);
  }else{
   const path=resolve(source,file),stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Fuente de compilación inválida.');
   await writeFile(target,await readFile(path));
  }
 }
 return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))build().then(()=>console.log('Capital Dúo compilado en dist · recursos locales.')).catch(error=>{console.error(error.message);process.exitCode=1;});
