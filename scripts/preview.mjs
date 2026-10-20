import {preparePreview} from './prepare-preview.mjs';
import {startStaticServer,validatePreviewOrigin} from '../server.mjs';
import {build} from './build.mjs';
try{
 await build();
 await preparePreview();
 const publicOrigin=validatePreviewOrigin(process.env.CAPITAL_DUO_PREVIEW_ORIGIN);
 const server=await startStaticServer({preview:true,publicOrigin});
 console.log('Capital Dúo · SOLO DEMOSTRACIÓN · http://127.0.0.1:4174');
 console.log('Solo archivos estáticos. Sin túnel ni publicación. Ctrl+C cierra la vista previa.');
 const close=()=>{server.closeAllConnections();server.close(()=>process.exit(0));};
 process.once('SIGINT',close);process.once('SIGTERM',close);
}catch{console.error('No se pudo iniciar la vista previa. Revisa el puerto 4174 y los archivos estáticos.');process.exitCode=1;}
