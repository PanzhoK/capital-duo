import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {readdir,readFile} from 'node:fs/promises';
import {preparePreview} from '../scripts/prepare-preview.mjs';
import {startStaticServer,createStaticServer,PUBLIC_FILES,CSP,validatePreviewOrigin,EXTERNAL_PREVIEW_BLOCK_REASON} from '../server.mjs';

let server,port;
before(async()=>{await preparePreview();server=await startStaticServer({preview:true,port:0});port=server.address().port;});
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
function request(path='/',{method='GET',headers={}}={}){
 return new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port,path,method,headers,agent:false},res=>{let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});
  req.on('error',reject);req.end();
 });
}
function rawRequest(message){return new Promise((resolve,reject)=>{const socket=net.connect(port,'127.0.0.1',()=>socket.write(message));let result='';socket.setEncoding('utf8');socket.setTimeout(2000,()=>socket.destroy(new Error('Timed out')));socket.on('data',data=>result+=data);socket.on('end',()=>resolve(result));socket.on('error',reject);});}

test('preview solo sirve los trece recursos compilados conocidos, en loopback',async()=>{
 assert.equal(server.address().address,'127.0.0.1');
 const expected=['index.html','app.js','ledger.js','style.css','runtime.js','format.js','storage.js','demo.js','views.js','game-ui.js','animation.js','sound.js','scene.js'];
 assert.deepEqual([...PUBLIC_FILES].sort(),[...expected].sort());
 const names=await readdir(new URL('../.preview-dist/',import.meta.url));assert.deepEqual(names.sort(),[...expected].sort());
 assert.equal((await request('/')).status,200);
 for(const file of expected){
  const response=await request('/'+file);
  assert.equal(response.status,200,file);
  const bytes=Buffer.byteLength(response.body);
  assert.equal(Number(response.headers['content-length']),bytes,file);
  assert.ok(bytes<=(file==='scene.js'?1_500_000:256_000),file+' must stay within its specific static-asset limit');
 }
 assert.equal((await request('/runtime.js')).body.trim(),'export const PREVIEW_ONLY = true;');
 assert.equal((await readFile(new URL('../dist/runtime.js',import.meta.url),'utf8')).trim(),'export const PREVIEW_ONLY = false;','preview build must preserve real entry');
 const head=await request('/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.body,'');assert.ok(Number(head.headers['content-length'])>0);
});
test('el bundle local de Three está autorizado, conserva su tipo y coincide con el artefacto compilado',async()=>{
 const response=await request('/scene.js');
 assert.equal(response.status,200);
 assert.equal(response.headers['content-type'],'text/javascript; charset=utf-8');
 assert.equal(response.body,await readFile(new URL('../dist/scene.js',import.meta.url),'utf8'));
 assert.match(response.body,/export\s*\{[^}]*\bcreateWorld\b/);
 assert.equal(response.headers['access-control-allow-origin'],undefined);
});
test('archivos sensibles, recorridos y rutas administrativas no están expuestos',async()=>{
 const blocked=['/.env','/.env.local','/.git/config','/.openai/hosting.json','/README.md','/package.json','/server.mjs','/tests/example-backup.json','/capital-duo-desktop.png','/dist/index.html','/../README.md','/%2e%2e/README.md','/..%2f..%2fWindows/win.ini','/%2e%2e%5c..%5cWindows%5cwin.ini','/C:/Windows/win.ini','/app.js/../../.git/config','/__proto__','/constructor','/toString','/api','/api/movements','/api/export','/admin','/debug','/json/version','/@vite/client','/__vite_ping','/node_modules','/runtime.js.map','/backup.json','/src/scene.ts','/scene.ts','/src/app.js','/src/ledger.js','/node_modules/three/build/three.module.js','/scene.js.map','/scripts/build.mjs','/package-lock.json',
  '/app.js;.env','/.%2e/.env','/%252e%252e%252f.env','/%00.env','/%ef%bc%8eenv','/App.js','/APP.JS','/index.html::$DATA','/index.html%3a%3a$DATA','/style.css/','/favicon.ico','/security-test-output/','/.preview-dist/runtime.js'];
 for(const path of blocked){const response=await request(path);assert.equal(response.status,404,path);assert.equal(response.body,'No encontrado.');}
});
test('Host y origen son estrictos, sin confiar en encabezados de proxy',async()=>{
 for(const host of ['attacker.invalid',`attacker.invalid:${port}`,`localhost:${port}.attacker.invalid`,`user@127.0.0.1:${port}`,'localhost',`127.0.0.1:${port+1}`])assert.equal((await request('/',{headers:{Host:host}})).status,421,host);
 assert.equal((await request('/',{headers:{Host:`localhost:${port}`}})).status,200);
 assert.equal((await request('/',{headers:{Host:'attacker.invalid','X-Forwarded-Host':`localhost:${port}`}})).status,421);
 assert.equal((await request('/',{headers:{'X-Forwarded-Host':'attacker.invalid','X-Forwarded-Port':'22'}})).status,200,'forwarded values never expand asset or port access');
 const runtime=await request('/runtime.js');
 for(const headers of [{'Forwarded':'host=attacker.invalid;proto=https'},{'X-Original-URL':'/.env'},{'X-Rewrite-URL':'/.env'},{'X-Forwarded-Proto':'http','X-Forwarded-Port':'22'}]){
  const response=await request('/runtime.js',{headers});assert.equal(response.status,200);assert.equal(response.body,runtime.body,'proxy metadata cannot change the requested asset');
  assert.equal((await request('/.env',{headers})).status,404,'proxy metadata cannot authorize a blocked path');
 }
 assert.equal((await request('/',{headers:{Origin:'https://attacker.invalid'}})).status,403);
 assert.equal((await request('/',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
 const duplicate=await rawRequest(`GET / HTTP/1.1\r\nHost: localhost:${port}\r\nHost: attacker.invalid\r\nConnection: close\r\n\r\n`);assert.match(duplicate,/HTTP\/1\.1 (400|421)/);
 const missing=await rawRequest('GET / HTTP/1.1\r\nConnection: close\r\n\r\n');assert.match(missing,/HTTP\/1\.1 (400|421)/);
});
test('rutas malformadas no derriban el servidor ni reflejan entrada',async()=>{
 for(const path of ['http://[','http://attacker.invalid/','//attacker.invalid/','/app.js#fragment','/..\\README.md'])assert.equal((await request(path)).status,400,path);
 assert.equal((await request('/'+'a'.repeat(2048))).status,400);
 const response=await request('/?description=%3Cimg%20onerror=alert(1)%3E');assert.equal(response.status,200);assert.equal(response.body.includes('onerror=alert(1)'),false);
 assert.equal((await request('/')).status,200,'service remains healthy');
});
test('métodos de escritura, cuerpos, CORS y WebSocket no están disponibles',async()=>{
 for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS','CONNECT']){
  // CONNECT has separate Node handling and never receives an application response.
  if(method==='CONNECT')continue;
  const response=await request('/',{method});assert.equal(response.status,405,method);assert.equal(response.headers.allow,'GET, HEAD');assert.equal(response.headers['access-control-allow-origin'],undefined);
 }
 const ws=await request('/',{headers:{Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Key':'dGVzdA==','Sec-WebSocket-Version':'13'}});assert.equal(ws.status,400);assert.equal(ws.headers['sec-websocket-accept'],undefined);
 const body=await rawRequest(`GET / HTTP/1.1\r\nHost: localhost:${port}\r\nContent-Length: 1\r\nConnection: close\r\n\r\nx`);assert.match(body,/HTTP\/1\.1 400/);
 const connect=await rawRequest(`CONNECT localhost:22 HTTP/1.1\r\nHost: localhost:${port}\r\nConnection: close\r\n\r\n`);assert.equal(connect.includes('200 Connection'),false,'no HTTP proxy to other ports');
});
test('el parser limita encabezados y rechaza cuerpos chunked o framing ambiguo',async()=>{
 const oversized=await rawRequest(`GET / HTTP/1.1\r\nHost: localhost:${port}\r\nX-Test: ${'x'.repeat(8500)}\r\nConnection: close\r\n\r\n`);assert.match(oversized,/HTTP\/1\.1 431/);
 const chunked=await rawRequest(`GET / HTTP/1.1\r\nHost: localhost:${port}\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n0\r\n\r\n`);assert.match(chunked,/HTTP\/1\.1 400/);
 const ambiguous=await rawRequest(`GET / HTTP/1.1\r\nHost: localhost:${port}\r\nTransfer-Encoding: chunked\r\nContent-Length: 0\r\nConnection: close\r\n\r\n0\r\n\r\n`);assert.match(ambiguous,/HTTP\/1\.1 400/);
 const absolute=await rawRequest(`GET http://127.0.0.1:22/ HTTP/1.1\r\nHost: localhost:${port}\r\nConnection: close\r\n\r\n`);assert.match(absolute,/HTTP\/1\.1 400/);
 assert.equal((await request('/')).status,200,'the local server remains available after rejected requests');
});

test('el límite de cantidad rechaza encabezados truncados antes de confiar en el framing',async()=>{
 assert.equal(server.maxHeadersCount,100);
 const start='GET /runtime.js HTTP/1.1\r\nHost: localhost:'+port+'\r\n';
 const truncated=start+'a:\r\n'.repeat(1999)+'Content-Length: 1\r\nConnection: close\r\n\r\nx';
 assert.ok(Buffer.byteLength(truncated)<8192,'the regression must exercise the count limit below the byte limit');
 const blocked=await rawRequest(truncated);assert.match(blocked,/HTTP\/1\.1 431/);assert.equal(blocked.includes('export const PREVIEW_ONLY'),false,'an incomplete header list must never reach static assets');
 const atLimit=await rawRequest(start+'a:\r\n'.repeat(98)+'Connection: close\r\n\r\n');assert.match(atLimit,/HTTP\/1\.1 431/,'reaching the exposed-header limit fails closed even without a body');
 const belowLimit=await rawRequest(start+'a:\r\n'.repeat(97)+'Connection: close\r\n\r\n');assert.match(belowLimit,/HTTP\/1\.1 200/,'normal requests below the explicit count limit remain supported');
});

test('encabezados bloquean enmarcado, conexiones y permisos innecesarios',async()=>{
 for(const path of ['/','/app.js','/scene.js','/.env']){
  const response=await request(path),h=response.headers;
  assert.equal(h['content-security-policy'],CSP);assert.match(CSP,/frame-ancestors 'none'/);assert.match(CSP,/connect-src 'none'/);assert.match(CSP,/script-src 'self'/);
  assert.equal(h['x-frame-options'],'DENY');assert.equal(h['x-content-type-options'],'nosniff');assert.equal(h['cache-control'],'no-store');assert.equal(h['referrer-policy'],'no-referrer');assert.equal(h['cross-origin-resource-policy'],'same-origin');assert.match(h['permissions-policy'],/camera=\(\)/);assert.equal(h['access-control-allow-origin'],undefined);
 }
 assert.equal(server.maxConnections,50);assert.equal(server.headersTimeout,10_000);assert.equal(server.requestTimeout,10_000);
});
test('configuración futura valida un único origen HTTPS exacto sin ampliar Host ni puertos',async()=>{
 assert.equal(validatePreviewOrigin(undefined),null);
 assert.equal(validatePreviewOrigin('https://preview.example'),'https://preview.example');
 for(const value of ['*','https://*.example','http://preview.example','https://preview.example:4173','https://user:secret@preview.example','https://preview.example/api','https://preview.example?port=22','https://preview.example#hash','https://a.example,https://b.example','https://a.example https://b.example'])assert.throws(()=>validatePreviewOrigin(value));
 await assert.rejects(startStaticServer({publicOrigin:'https://preview.example',port:0}),/demostración/);
});
test('un origen público permanece bloqueado antes de crear un listener mientras falta revisar Node',async()=>{
 const blocked=error=>error.message===EXTERNAL_PREVIEW_BLOCK_REASON;
 assert.throws(()=>createStaticServer(new Map(),{publicOrigin:'https://preview.example'}),blocked);
 await assert.rejects(startStaticServer({preview:true,port:0,publicOrigin:'https://preview.example'}),blocked);
 assert.equal((await request('/runtime.js')).status,200,'the isolated local demo remains available');
 assert.equal((await request('/runtime.js',{headers:{Origin:'https://preview.example'}})).status,403);
});
