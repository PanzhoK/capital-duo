import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import * as ledger from '../src/ledger.js';
import * as format from '../src/format.js';
import * as views from '../src/views.js';
import * as storage from '../src/storage.js';
import * as demo from '../src/demo.js';
import * as gameUI from '../src/game-ui.js';
import * as animation from '../src/animation.js';
import * as sound from '../src/sound.js';

const helpers={...format,...views,...storage,...demo,...gameUI,...animation,...sound};

// This checks the application's actual HTML generation with an in-memory DOM
// facade. It never opens a browser, reads browser storage or writes a real book.
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8')
 .replace(/^import\s+[^\n]*;\s*$/gm,'');
const payload='</textarea><img src=x onerror=alert(1)><svg onload=alert(2)>';
const attributePayload='\"><img src=x onerror=alert(3)>';
const operation=(amount=10)=>({kind:'contribution',person:'Fran',amount,cost:0,date:'2026-10-20',description:payload});
const hostileBook=(amount=10)=>({schema:1,events:[
 {id:attributePayload,target:null,action:'create',at:'2026-10-20T12:00:00Z',reason:'',operation:operation(amount)},
 {id:'correction',target:attributePayload,action:'correct',at:'2026-10-20T13:00:00Z',reason:payload,operation:operation(amount)}
]});

function harness({preview=false,data=new Map(),locks=true,storageDenied=false}={}){
 const elements=new Map(),accesses=[],downloads=[];
 const element=id=>{
  if(!elements.has(id))elements.set(id,{
   innerHTML:'',textContent:'',hidden:false,open:false,value:'',dataset:{},disabled:false,
   listeners:new Map(),classList:{toggle(){},remove(){},add(){}},setAttribute(){},addEventListener(type,listener){this.listeners.set(type,listener);},focus(){},select(){},reset(){},
   showModal(){this.open=true;},close(){this.open=false;},
  });
  return elements.get(id);
 };
 const localStorage={
  getItem(key){accesses.push({action:'get',key});return data.get(key)??null;},
  setItem(key,value){accesses.push({action:'set',key});data.set(key,String(value));},
 };
 const context=vm.createContext({
  ledger,helpers,PREVIEW_ONLY:preview,
  document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){},title:'',body:element('body'),
   createElement:()=>({click(){downloads.push(this.download);}})},
  window:{addEventListener(){},scrollTo(){}},
  crypto:{randomUUID},localStorage,Intl,Date,Blob,
  navigator:locks?{locks:typeof locks==='object'?locks:{request:async(name,...args)=>args.at(-1)({name,mode:'exclusive'})}}:{},
  URL:{createObjectURL:()=> 'blob:in-memory-test',revokeObjectURL(){}},
  setTimeout:()=>0,clearTimeout(){},console,
 });
 if(storageDenied)vm.runInContext("Object.defineProperty(globalThis,'localStorage',{get(){throw new Error('Storage access denied');},configurable:true});",context);
 vm.runInContext('const {PEOPLE,emptyBook,replay,append,saleBreakdown,parseBackup,saveBook,saveBookWithLock,MAX_AMOUNT}=ledger;',context);
 vm.runInContext('const {esc,fmt,dateFmt,today,icon,sum,kindLabel,table,historyView,growthView,backupView,readBook,readSettings,bookKey,settingKey,createDemoBook,gameView,personView,playbackView,createSalePlayer,lastActiveMovement,createSound}=helpers;',context);
 vm.runInContext(source,context,{filename:'app.js'});
 return {element,data,accesses,downloads,set:(name,value)=>{context[name]=value;},run:code=>vm.runInContext(code,context)};
}

function assertEscaped(markup){
 assert.equal(markup.includes('<img'),false,'HTML image payload must remain text');
 assert.equal(markup.includes('<svg onload='),false,'SVG event payload must remain text');
 assert.match(markup,/&lt;img/);
}

test('descripciones, motivos e IDs importados no crean marcado en historial o detalle',()=>{
 const sample=hostileBook();
 ledger.parseBackup(JSON.stringify(sample));
 const app=harness({data:new Map([['capital-duo.real.v1',JSON.stringify(sample)]])});
 app.run("changeView('history')");
 assertEscaped(app.element('#content').innerHTML);
 assert.match(app.element('#content').innerHTML,/data-detail="&quot;&gt;&lt;img/);
 app.run('detail(book.events[0].id)');
 const detail=app.element('#info-body').innerHTML;
 assertEscaped(detail);
 assert.match(detail,/&lt;\/textarea&gt;/);
 assert.equal((detail.match(/&lt;svg onload=/g)??[]).length,4,'description and audit reason remain escaped');
});

test('exportación y respaldo previo a importar impiden salir de su textarea',async()=>{
 const initial=JSON.stringify(hostileBook());
 const data=new Map([['capital-duo.real.v1',initial]]);
 const app=harness({data});
 app.run('exportBook()');
 const exported=app.element('#info-body').innerHTML;
 assertEscaped(exported);
 assert.equal((exported.match(/<\/textarea>/g)??[]).length,1);
 assert.match(exported,/&lt;\/textarea&gt;/);

 const importedText=JSON.stringify(hostileBook(22));
 app.set('testFile',{size:Buffer.byteLength(importedText),text:async()=>importedText});
 await app.run('importFile(testFile)');
 assert.equal(data.get('capital-duo.real.v1'),initial,'opening an import never replaces storage');
 const preview=app.element('#info-body').innerHTML;
 assertEscaped(preview);
 assert.equal((preview.match(/<\/textarea>/g)??[]).length,1);
 app.element('#pre-import-export').onclick();
 assert.equal(app.downloads.length,1,'current data can be backed up before replacement');
 await app.element('#confirm-import').onclick();
 assert.equal(ledger.replay(ledger.parseBackup(data.get('capital-duo.real.v1'))).total,22);
 app.run('detail(book.events[0].id)');
 assertEscaped(app.element('#info-body').innerHTML);
});

test('cambiar de modo mientras se lee un respaldo cancela la importación sin escribir libros',async()=>{
 const real=JSON.stringify(hostileBook(777));
 const demo=JSON.stringify(hostileBook(333));
 const data=new Map([['capital-duo.real.v1',real],['capital-duo.demo.v1',demo]]);
 const app=harness({data});
 const importedText=JSON.stringify(hostileBook(22));
 let finishRead,readStarted=false;
 const pendingText=new Promise(resolve=>{finishRead=resolve;});
 app.set('testFile',{size:Buffer.byteLength(importedText),text:()=>{readStarted=true;return pendingText;}});
 const pendingImport=app.run('importFile(testFile)');
 assert.equal(readStarted,true);
 app.run('switchDemo()');
 assert.equal(app.run('demo'),true);
 finishRead(importedText);
 await pendingImport;
 assert.equal(app.element('#info-title').textContent,'No se pudo importar');
 assert.match(app.element('#info-body').innerHTML,/Los datos cambiaron mientras se leía el archivo/);
 assert.equal(app.element('#confirm-import').onclick,undefined,'a stale file must never reach confirmation');
 assert.equal(data.get('capital-duo.real.v1'),real);
 assert.equal(data.get('capital-duo.demo.v1'),demo);
 assert.equal(app.accesses.filter(access=>access.action==='set').length,0);
 assert.equal(app.run('state.total'),333);
});

test('vista previa solo usa su libro demo, conserva datos reales y persiste aislada',async()=>{
 const real=JSON.stringify(hostileBook(777));
 const demo=JSON.stringify(hostileBook(333));
 const data=new Map([['capital-duo.real.v1',real],['capital-duo.demo.v1',demo]]);
 const app=harness({preview:true,data});
 assert.equal(app.run('demo'),true);
 assert.equal(app.run('key()'),'capital-duo.preview.v1');
 assert.equal(app.element('#demo-banner').hidden,false);
 const before=app.run('state.total');
 app.run('switchDemo(); switchDemo(); load();');
 assert.equal(app.run('demo'),true,'preview cannot switch into real mode');
 await app.run("commit(append(book,event({kind:'contribution',person:'Yane',amount:7,cost:0,date:'2026-10-20',description:'Prueba aislada'})))");
 assert.equal(app.run('state.total'),before+7);
 const reloaded=harness({preview:true,data});
 assert.equal(reloaded.run('state.total'),before+7,'preview changes survive reload in their own namespace');
 assert.equal(data.get('capital-duo.real.v1'),real);
 assert.equal(data.get('capital-duo.demo.v1'),demo);
 const forbidden=new Set(['capital-duo.real.v1','capital-duo.demo.v1']);
 for(const access of [...app.accesses,...reloaded.accesses])assert.equal(forbidden.has(access.key),false,'preview must not even read real or ordinary demo books');
});

test('sin bloqueo entre pestañas se rechaza guardar y se conservan los registros',async()=>{
 const real=JSON.stringify(hostileBook(777));
 const data=new Map([['capital-duo.real.v1',real]]);
 const app=harness({data,locks:false});
 await assert.rejects(async()=>app.run("commit(append(book,event({kind:'contribution',person:'Yane',amount:7,cost:0,date:'2026-10-20',description:'No se debe guardar'})))"));
 assert.equal(data.get('capital-duo.real.v1'),real);
 assert.equal(app.accesses.filter(access=>access.action==='set').length,0);
 assert.equal(app.run('state.total'),777);
});

test('denegar el acceso a localStorage no impide iniciar la interfaz en modo restringido',async()=>{
 const real=JSON.stringify(hostileBook(777));
 const data=new Map([['capital-duo.real.v1',real]]);
 const app=harness({data,storageDenied:true});
 assert.equal(app.run('storageBlocked'),true);
 assert.notEqual(app.element('#storage-alert').textContent,'');
 assert.notEqual(app.element('#content').innerHTML,'');
 assert.equal(app.run('raw'),null);
 assert.equal(app.run('state.total'),0);
 await assert.rejects(async()=>app.run("commit(append(book,event({kind:'contribution',person:'Fran',amount:7,cost:0,date:'2026-10-20',description:'Guardado bloqueado'})))"),/almacenamiento/);
 app.run("openMovement('contribution')");
 assert.equal(app.element('#movement-dialog').open,false);
 app.run("changeView('backup'); exportBook();");
 assert.match(app.element('#info-body').innerHTML,/respaldo/i);
 assert.equal(data.get('capital-duo.real.v1'),real);
 assert.equal(app.accesses.length,0);
});

test('un guardado en curso bloquea cambios de modo y segundos envíos',async()=>{
 const real=JSON.stringify(hostileBook(777));
 const demo=JSON.stringify(hostileBook(333));
 const data=new Map([['capital-duo.real.v1',real],['capital-duo.demo.v1',demo]]);
 let release;
 const locks={request(name,...args){
  const callback=args.at(-1);
  return new Promise((resolve,reject)=>{release=()=>Promise.resolve().then(()=>callback({name,mode:'exclusive'})).then(resolve,reject);});
 }};
 const app=harness({data,locks});
 const firstSave=app.run("commit(append(book,event({kind:'contribution',person:'Yane',amount:7,cost:0,date:'2026-10-20',description:'Primer envío'})))");
 assert.equal(typeof release,'function','the first save must be waiting for its lock');
 app.run('switchDemo()');
 assert.equal(app.run('demo'),false,'the pending save must keep its original mode');
 await assert.rejects(async()=>app.run("commit(append(book,event({kind:'contribution',person:'Yane',amount:9,cost:0,date:'2026-10-20',description:'Segundo envío'})))"),/curso/);
 assert.equal(data.get('capital-duo.real.v1'),real,'no write occurs before the lock is acquired');
 await release();
 await firstSave;
 assert.equal(app.run('demo'),false);
 assert.equal(app.run('state.total'),784);
 assert.equal(ledger.replay(ledger.parseBackup(data.get('capital-duo.real.v1'))).total,784);
 assert.equal(data.get('capital-duo.demo.v1'),demo);
 const writes=app.accesses.filter(access=>access.action==='set');
 assert.equal(writes.length,1);
 assert.equal(writes[0].key,'capital-duo.real.v1');
});

test('modo local conserva la separación existente entre libro real y demostración',()=>{
 const real=JSON.stringify(hostileBook(777));
 const demo=JSON.stringify(hostileBook(333));
 const data=new Map([['capital-duo.real.v1',real],['capital-duo.demo.v1',demo]]);
 const app=harness({data});
 assert.equal(app.run('demo'),false);
 assert.equal(app.run('state.total'),777);
 app.run('switchDemo()');
 assert.equal(app.run('state.total'),333);
 app.run('switchDemo()');
 assert.equal(app.run('state.total'),777);
 assert.equal(data.get('capital-duo.real.v1'),real);
 assert.equal(data.get('capital-duo.demo.v1'),demo);
});

test('un fallo visual después de guardar no ofrece reenviar ni duplica una venta',async()=>{
 const initial=JSON.stringify(hostileBook(10));
 const app=harness({data:new Map([['capital-duo.real.v1',initial]])});
 app.run("openMovement('sale')");
 app.element('#amount').value='20';app.element('#cost').value='10';
 Object.defineProperty(app.element('#sale-player'),'innerHTML',{get(){return '';},set(){throw new Error('Fallo visual de prueba');}});
 const submit=app.element('#movement-form').listeners.get('submit');
 await submit({preventDefault(){}});
 assert.equal(app.run('state.total'),14,'the saved sale keeps its exact financial result');
 assert.equal(app.element('#movement-dialog').open,false);
 assert.match(app.element('#toast').textContent,/Movimiento guardado/);
 assert.equal(app.element('#form-error').textContent,'');
 await submit({preventDefault(){}});
 const writes=app.accesses.filter(access=>access.action==='set');
 assert.equal(writes.length,1,'a second tap after the persisted sale cannot submit it again');
 assert.equal(ledger.parseBackup(app.data.get('capital-duo.real.v1')).events.length,3);
});
