import {mkdir,readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {PUBLIC_FILES} from '../server.mjs';
import {build} from './build.mjs';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
export async function preparePreview(){
 const source=resolve(projectRoot,'dist'),target=resolve(projectRoot,'.preview-dist');
 await mkdir(target,{recursive:true});
 if((await lstat(target)).isSymbolicLink()||!(await lstat(target)).isDirectory()||(await lstat(source)).isSymbolicLink())throw new Error('No se permiten enlaces en la compilación de vista previa.');
 const canonicalSource=await realpath(source),canonicalTarget=await realpath(target);
 for(const file of PUBLIC_FILES){
  const from=resolve(source,file),to=resolve(target,file),input=await lstat(from);
  if(!input.isFile()||input.isSymbolicLink()||dirname(await realpath(from))!==canonicalSource)throw new Error('Fuente estática inválida.');
  try{const existing=await lstat(to);if(!existing.isFile()||existing.isSymbolicLink()||dirname(await realpath(to))!==canonicalTarget)throw new Error('Destino estático inválido.');}catch(e){if(e.code!=='ENOENT')throw e;}
  const content=file==='runtime.js'?'export const PREVIEW_ONLY = true;\n':await readFile(from);
  await writeFile(to,content,{flag:'w'});
 }
 return target;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))build().then(preparePreview).then(()=>console.log('Vista previa estática preparada: .preview-dist (solo demostración).')).catch(()=>{console.error('No se pudo preparar la vista previa.');process.exitCode=1;});
