import http from 'node:http';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const projectRoot=fileURLToPath(new URL('./',import.meta.url));
export const PUBLIC_FILES=Object.freeze(['index.html','app.js','ledger.js','style.css','runtime.js','format.js','storage.js','demo.js','views.js','game-ui.js','animation.js','sound.js','scene.js']);
export const CSP="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; worker-src 'none'; manifest-src 'none'";
export const EXTERNAL_PREVIEW_BLOCK_REASON='Acceso externo bloqueado: actualizar y revisar el runtime Node y sus avisos de seguridad antes de habilitar un origen público.';
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'};
const MAX_REQUEST_HEADERS=100;

// Read an explicit set of build assets once; requests never determine filesystem paths.
export async function readStaticAssets(preview=false){
 const directory=resolve(projectRoot,preview?'.preview-dist':'dist');
 const rootStat=await lstat(directory);
 if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw new Error('La carpeta estática debe ser un directorio local, sin enlaces.');
 const canonicalRoot=await realpath(directory),assets=new Map();
 for(const file of PUBLIC_FILES){
  const path=resolve(directory,file),stat=await lstat(path);
  const sizeLimit=file==='scene.js'?1_500_000:256_000;
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>sizeLimit||dirname(await realpath(path))!==canonicalRoot)throw new Error('Archivo estático no permitido.');
  assets.set('/'+file,{body:await readFile(path),type:types[file.split('.').at(-1)]});
 }
 assets.set('/',assets.get('/index.html'));
 const runtime=assets.get('/runtime.js').body.toString('utf8');
 if(preview&&runtime.trim()!=='export const PREVIEW_ONLY = true;')throw new Error('La vista previa requiere demostración forzada.');
 return assets;
}

export function validatePreviewOrigin(value){
 if(value===undefined||value===null||value==='')return null;
 try{
  const parsed=new URL(value);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||parsed.search||parsed.hash||parsed.pathname!=='/'||!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(parsed.hostname)||(value!==parsed.origin&&value!==parsed.origin+'/'))throw new Error();
  return parsed.origin;
 }catch{throw new Error('El origen de vista previa debe ser un único origen HTTPS exacto, sin comodines, credenciales ni rutas.');}
}

export function createStaticServer(assets,{publicOrigin=null}={}){
 const exactPublicOrigin=validatePreviewOrigin(publicOrigin);
 // Keep the local demo available while runtime security clearance is pending.
 if(exactPublicOrigin)throw new Error(EXTERNAL_PREVIEW_BLOCK_REASON);
 const server=http.createServer({maxHeaderSize:8192},(req,res)=>{
  res.setHeader('Content-Security-Policy',CSP);
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Cache-Control','no-store');
  const reject=(status,message)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Connection':'close'});res.end(req.method==='HEAD'?undefined:message);};
  // Node may truncate exposed headers at this limit. Reject before trusting an incomplete list.
  if(req.rawHeaders.length>=MAX_REQUEST_HEADERS*2)return reject(431,'Demasiados encabezados.');
  const address=server.address(),port=address&&typeof address==='object'?address.port:0;
  const allowedHosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
  const hostHeaders=req.rawHeaders.filter((_,i)=>i%2===0).filter(name=>name.toLowerCase()==='host');
  if(hostHeaders.length!==1||!allowedHosts.has(req.headers.host?.toLowerCase()))return reject(421,'Host no permitido.');
  if(req.headers.upgrade)return reject(400,'Protocolos adicionales no permitidos.');
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return reject(405,'Método no permitido.');}
  if(req.headers['transfer-encoding']||(req.headers['content-length']&&req.headers['content-length']!=='0'))return reject(400,'No se permiten cuerpos de solicitud.');
  // Origin and Fetch Metadata restrict browsers; they are not authentication.
  const allowedOrigins=new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`]);
  if(req.headers.origin&&!allowedOrigins.has(req.headers.origin))return reject(403,'Origen no permitido.');
  if(req.headers['sec-fetch-site']==='cross-site')return reject(403,'Solicitud entre sitios no permitida.');
  const target=req.url;
  if(typeof target!=='string'||target.length>2048||!target.startsWith('/')||target.startsWith('//')||/[\\#\x00-\x20\x7f]/.test(target))return reject(400,'Ruta inválida.');
  const path=target.split('?')[0],asset=assets.get(path);
  if(!asset)return reject(404,'No encontrado.');
  res.writeHead(200,{'Content-Type':asset.type,'Content-Length':asset.body.length});
  res.end(req.method==='HEAD'?undefined:asset.body);
 });
 server.headersTimeout=10_000;
 server.maxHeadersCount=MAX_REQUEST_HEADERS;
 server.requestTimeout=10_000;
 server.keepAliveTimeout=5_000;
 server.maxRequestsPerSocket=100;
 server.maxConnections=50;
 return server;
}

export async function startStaticServer({preview=false,port=preview?4174:4173,publicOrigin=null}={}){
 if(!preview&&publicOrigin)throw new Error('Un origen externo solo se admite en demostración.');
 const server=createStaticServer(await readStaticAssets(preview),{publicOrigin});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return server;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 startStaticServer().then(()=>console.log('Capital Dúo local: http://127.0.0.1:4173')).catch(()=>{console.error('No se pudo iniciar Capital Dúo. Revisa los archivos estáticos y el puerto.');process.exitCode=1;});
}
