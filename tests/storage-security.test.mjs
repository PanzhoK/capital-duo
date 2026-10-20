import {test} from 'node:test';
import assert from 'node:assert/strict';
import {append,emptyBook,parseBackup,replay,saveBookWithLock} from '../src/ledger.js';
import {readBook} from '../src/storage.js';

const key='capital-duo.preview.v1';
const contribution=(id,amount,person='Fran')=>({id,target:null,action:'create',at:'2026-10-20T12:00:00.000Z',reason:'',operation:{kind:'contribution',person,amount,cost:0,date:'2026-10-20',description:'Demostración de prueba'}});
const seed=()=>append(emptyBook(),contribution('seed',10));
const locks={request:async(name,options,callback)=>{assert.equal(name,'capital-duo.write.'+key);assert.deepEqual(options,{mode:'exclusive'});return callback();}};

test('la demostración comienza solo en memoria y su primer movimiento persiste bajo bloqueo',async()=>{
 let stored=null,writes=0;
 const storage={getItem:()=>stored,setItem:(_key,value)=>{stored=value;writes++;}};
 const loaded=readBook(storage,key,true,seed);
 assert.equal(loaded.raw,null);assert.equal(loaded.state.total,10);assert.equal(loaded.storageBlocked,false);assert.equal(stored,null);assert.equal(writes,0);
 const next=append(loaded.book,contribution('first-user-movement',7,'Yane'));
 const saved=await saveBookWithLock(locks,storage,key,loaded.raw,next);
 assert.equal(stored,saved);assert.equal(writes,1);assert.equal(parseBackup(saved).events.length,2);assert.deepEqual(replay(parseBackup(saved)).capital,{Fran:10,Yane:7});
 const reloaded=readBook(storage,key,true,()=>assert.fail('un libro existente no debe generar otra demo'));
 assert.equal(reloaded.raw,saved);assert.equal(reloaded.state.total,17);assert.equal(writes,1);
});

test('una carga lenta de demo no sobrescribe el libro guardado por otra pestaña',async()=>{
 const otherRaw=JSON.stringify(append(emptyBook(),contribution('other-tab',999)));let stored=null,writes=0;
 const storage={getItem:()=>stored,setItem:(_key,value)=>{stored=value;writes++;}};
 const loaded=readBook(storage,key,true,()=>{
  // Another tab finishes initialization and saves a real demo edit after our read.
  stored=otherRaw;return seed();
 });
 assert.equal(loaded.raw,null);assert.equal(loaded.state.total,10);assert.equal(writes,0);assert.equal(stored,otherRaw);
 const staleCandidate=append(loaded.book,contribution('stale-local-edit',7,'Yane'));
 await assert.rejects(saveBookWithLock(locks,storage,key,loaded.raw,staleCandidate),/otra pestaña/);
 assert.equal(writes,0);assert.equal(stored,otherRaw);assert.equal(replay(parseBackup(stored)).total,999);
 const reloaded=readBook(storage,key,true,()=>assert.fail('el libro ajeno ya existe'));
 assert.equal(reloaded.raw,otherRaw);assert.equal(reloaded.state.total,999);
});

test('leer libros existentes o inválidos no escribe ni reemplaza registros',()=>{
 const valid=JSON.stringify(seed());let stored=valid;
 const storage={getItem:()=>stored,setItem:()=>assert.fail('leer un libro no debe escribir')};
 const loaded=readBook(storage,key,true,()=>assert.fail('no se debe recrear la demo'));
 assert.equal(loaded.raw,valid);assert.equal(loaded.state.total,10);assert.equal(loaded.storageBlocked,false);
 stored='{"schema":1,"events":[null]}';const broken=readBook(storage,key,true,()=>assert.fail('no se debe recrear un libro inválido'));
 assert.equal(broken.raw,stored);assert.equal(broken.storageBlocked,true);assert.equal(broken.state.total,0);assert.match(broken.loadError,/No sobrescribiremos/);
});
