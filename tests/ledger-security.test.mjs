import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBackup,replay,saveBook,saveBookWithLock,MAX_AMOUNT} from '../src/ledger.js';

const operation=()=>({kind:'contribution',person:'Fran',amount:10,cost:0,date:'2026-10-20',description:'Prueba local'});
const event=()=>({id:'test-event',target:null,action:'create',at:'2026-10-20T12:00:00.000Z',reason:'',operation:operation()});
const book=()=>({schema:1,events:[event()]});
const parse=value=>parseBackup(JSON.stringify(value));
function oversizedUnicodeBook(){
 const value=book(),rootId='界'.repeat(80);
 value.events[0].id=rootId;value.events[0].operation.description='界'.repeat(160);
 for(let i=1;i<5000;i++)value.events.push({...event(),id:'界'.repeat(70)+String(i).padStart(10,'0'),target:rootId,action:'correct',reason:'界'.repeat(240),operation:{...operation(),description:'界'.repeat(160)}});
 return value;
}

test('la bitácora valida fechas y horas reales y conserva timestamps ISO válidos',()=>{
 for(const at of ['2026-02-30T12:00:00.000Z','2026-04-31T12:00:00Z','2026-10-20T24:00:00Z','2026-10-20T12:60:00Z','2026-10-20T12:00:60Z','2026-10-20T12:00:00','2026-10-20T12:00:00+25:00']){
  const value=book();value.events[0].at=at;assert.throws(()=>parse(value),/Bitácora/,at);
 }
 for(const at of ['2026-10-20T12:00:00.000Z','2026-10-20T12:00:00Z','2026-10-20T12:00:00.1Z','2026-10-20T12:00:00.123456789Z','2026-10-20T09:00:00-03:00','2028-02-29T12:00:00Z']){
  const value=book();value.events[0].at=at;assert.equal(parse(value).events[0].at,at);
 }
});

test('el límite de 5 MB cuenta bytes UTF-8, incluidos los textos multibyte',()=>{
 const raw=JSON.stringify(oversizedUnicodeBook());assert.ok(raw.length<5_000_000);assert.ok(Buffer.byteLength(raw,'utf8')>5_000_000);assert.throws(()=>parseBackup(raw),/5 MB/);
 const small=book();small.events[0].operation.description='界🙂'.repeat(30);assert.equal(replay(parse(small)).total,10);
 assert.throws(()=>parseBackup(' '.repeat(5_000_001)),/5 MB/);
});

test('guardar rechaza respaldos UTF-8 mayores de 5 MB antes de tocar los datos previos',()=>{
 const original=JSON.stringify(book());let stored=original,writes=0;
 const storage={getItem:()=>stored,setItem:(_key,value)=>{writes++;stored=value;}},value=oversizedUnicodeBook();
 assert.equal(replay(value).total,10,'el libro es contablemente válido');
 assert.throws(()=>saveBook(storage,'real',original,value),/5 MB/);
 assert.equal(writes,0);assert.equal(stored,original);assert.equal(replay(parseBackup(stored)).total,10);
});

test('rechaza estructuras profundas, campos inesperados y propiedades de prototipo',()=>{
 assert.throws(()=>parseBackup('{"schema":'+ '['.repeat(20_000)+'1'+']'.repeat(20_000)+',"events":[]}'),/Versión/);
 for(const path of ['book','event','operation'])for(const key of ['__proto__','constructor','prototype','unexpected']){
  const value=book(),target=path==='book'?value:path==='event'?value.events[0]:value.events[0].operation;
  Object.defineProperty(target,key,{value:{polluted:true},enumerable:true});assert.throws(()=>parse(value),/Formato/);
 }
 assert.equal({}.polluted,undefined);
 const value=book();value.events[0].id='__proto__';assert.equal(replay(parse(value)).total,10);
});

test('rechaza tipos y montos manipulados antes de escribir almacenamiento',()=>{
 const invalid=[null,true,false,'10',[],{},1.5,-1,0,MAX_AMOUNT+1,Number.MAX_SAFE_INTEGER+1];
 const records=new Map([['real',JSON.stringify(book())]]),before=records.get('real');
 const storage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value)};
 for(const amount of invalid){const value=book();value.events[0].operation.amount=amount;assert.throws(()=>saveBook(storage,'real',before,value));assert.equal(records.get('real'),before);}
 for(const value of [null,[],1,'text',{}, {schema:1,events:[null]}, {schema:1,events:Array(5001).fill(event())}])assert.throws(()=>parse(value));
 for(const date of ['2026-02-30','2026-13-01','2026-10-20<script>','20-10-2026']){const value=book();value.events[0].operation.date=date;assert.throws(()=>parse(value),/Fecha/);}
});

test('las descripciones maliciosas permanecen texto sin ejecutar y los errores no guardan',()=>{
 const value=book(),payload='<img src=x onerror=globalThis.ledgerProbe=true>';
 value.events[0].operation.description=payload;const parsed=parse(value);assert.equal(parsed.events[0].operation.description,payload);assert.equal(globalThis.ledgerProbe,undefined);
 const storage={getItem:()=>null,setItem:()=>assert.fail('No se debe escribir un respaldo contablemente inválido')};
 for(const change of [{kind:'withdrawal',amount:1},{kind:'sale',amount:20,cost:10},{kind:'sale',amount:20,cost:17}]){
  const invalid=book();invalid.events[0].operation={...operation(),...change};assert.throws(()=>saveBook(storage,'real',null,invalid));
 }
});

// This test double follows LockManager's exclusive queue and releases on rejection.
function exclusiveLocks(){
 let tail=Promise.resolve(),active=0;
 return {request(name,options,callback){
  assert.equal(name,'capital-duo.write.real');assert.deepEqual(options,{mode:'exclusive'});
  const result=tail.then(async()=>{
   assert.equal(active,0);active++;
   try{return await callback();}finally{active--;}
  });
  tail=result.catch(()=>{});return result;
 }};
}

test('el bloqueo serializa escritores simultáneos y rechaza la versión desactualizada',async()=>{
 const records=new Map(),storage={getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value)},locks=exclusiveLocks();
 const first=book(),second=book();second.events[0].operation.amount=200;
 const outcomes=await Promise.allSettled([saveBookWithLock(locks,storage,'real',null,first),saveBookWithLock(locks,storage,'real',null,second)]);
 assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
 assert.equal(outcomes.filter(result=>result.status==='rejected').length,1);
 assert.match(outcomes[1].reason.message,/otra pestaña/);
 assert.equal(records.get('real'),JSON.stringify(first));assert.equal(replay(parseBackup(records.get('real'))).total,10);
});

test('un almacenamiento lleno libera el bloqueo y conserva los datos previos',async()=>{
 const original=JSON.stringify(book()),locks=exclusiveLocks();let stored=original,full=true;
 const storage={getItem:()=>stored,setItem:(_key,value)=>{if(full)throw new Error('Quota exceeded');stored=value;}};
 const next=book();next.events[0].operation.amount=25;
 await assert.rejects(saveBookWithLock(locks,storage,'real',original,next),/Quota exceeded/);assert.equal(stored,original);
 full=false;const saved=await saveBookWithLock(locks,storage,'real',original,next);assert.equal(stored,saved);assert.equal(replay(parseBackup(saved)).total,25);
});

test('sin LockManager se rechaza guardar sin recurrir a escritura insegura',async()=>{
 const storage={getItem:()=>assert.fail('No se deben leer los datos sin bloqueo'),setItem:()=>assert.fail('No se debe escribir sin bloqueo')};
 for(const locks of [undefined,null,{}, {request:false}])await assert.rejects(saveBookWithLock(locks,storage,'real',null,book()),/bloqueo seguro entre pestañas/);
});
