import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyBook,append,replay,saleBreakdown,parseBackup,saveBook,MAX_AMOUNT} from '../dist/ledger.js';
let i=0;
const op=(kind,person,amount,cost=0,date='2026-10-19')=>({kind,person,amount,cost,date,description:'Movimiento '+(++i)});
const event=(operation,action='create',target=null,reason='')=>({id:'event-'+(++i),target,action,at:'2026-10-19T12:00:00.000Z',reason,operation});
const add=(b,o)=>append(b,event(o));
test('ejemplo obligatorio: aportes, venta y aporte desigual',()=>{
 let b=add(emptyBook(),op('contribution','Fran',10));b=add(b,op('sale','Fran',20,10));
 let s=replay(b);assert.deepEqual(s.capital,{Fran:12,Yane:2});assert.equal(s.total,14);assert.deepEqual(s.pending,{Fran:3,Yane:3});assert.equal(s.contributions.Fran,10);
 b=add(b,op('contribution','Yane',200));s=replay(b);assert.deepEqual(s.capital,{Fran:12,Yane:202});assert.equal(s.total,214);assert.deepEqual(s.pending,{Fran:3,Yane:3});
});
test('retiros solo reducen pendientes; rechaza sobregiros',()=>{
 let b=add(emptyBook(),op('contribution','Fran',10));b=add(b,op('sale','Fran',20,10));b=add(b,op('withdrawal','Fran',3));const s=replay(b);assert.deepEqual(s.capital,{Fran:12,Yane:2});assert.deepEqual(s.pending,{Fran:0,Yane:3});assert.equal(s.withdrawn.Fran,3);assert.throws(()=>add(b,op('withdrawal','Fran',1)),/supera/);
});
test('costo financiado con capital, no con ganancias pendientes',()=>{
 let b=add(emptyBook(),op('contribution','Fran',10));b=add(b,op('sale','Fran',100,10));assert.throws(()=>add(b,op('sale','Fran',100,31)),/insuficiente/);assert.equal(replay(b).total,30);
});
test('déficit bloqueado; ganancias cero son válidas',()=>{
 const b=add(emptyBook(),op('contribution','Yane',100));assert.throws(()=>add(b,op('sale','Fran',20,17)),/Déficit/);const s=replay(add(b,op('sale','Fran',20,16)));assert.equal(s.total,104);assert.equal(s.pending.Fran,0);assert.deepEqual(saleBreakdown(20,10),{value:20,cost:10,reinvest:4,profit:6});
});
test('redondeo entero y conservación para miles de valores',()=>{
 for(let v=1;v<=5000;v++){const b=saleBreakdown(v,0);assert.equal(b.reinvest,Math.round(v/5));assert.equal(b.cost+b.reinvest+b.profit,v);assert.ok(Number.isInteger(b.profit));}
 let b=emptyBook();for(let j=0;j<4;j++)b=add(b,op('sale','Fran',5,0));const s=replay(b);assert.deepEqual(s.capital,{Fran:2,Yane:2});assert.deepEqual(s.pending,{Fran:8,Yane:8});
 b=emptyBook();for(let j=0;j<4;j++)b=add(b,op('sale','Fran',4,0));assert.deepEqual(replay(b).pending,{Fran:6,Yane:6});
});
test('corregir recalcula posteriores y conserva originales',()=>{
 let b=add(emptyBook(),op('contribution','Fran',10));const root=b.events[0];b=add(b,op('sale','Fran',20,10));b=append(b,event({...root.operation,amount:100},'correct',root.id,'Aporte incompleto'));const s=replay(b);assert.equal(s.total,104);assert.equal(b.events[0].operation.amount,10);assert.equal(s.rows[0].revisions.length,1);
 assert.throws(()=>append(b,event({...root.operation,amount:1},'correct',root.id,'Monto corregido')),/insuficiente/);
 assert.throws(()=>append(b,event(null,'void',root.id,'Aporte duplicado')),/insuficiente/);
});
test('anulación y restauración trazables',()=>{
 let b=add(emptyBook(),op('contribution','Fran',100));const root=b.events[0];b=append(b,event(null,'void',root.id,'Duplicado'));assert.equal(replay(b).total,0);assert.equal(replay(b).rows.length,1);b=append(b,event({...root.operation,amount:200},'correct',root.id,'Restaurar aporte correcto'));assert.equal(replay(b).total,200);assert.equal(replay(b).rows[0].revisions.length,2);
});
test('orden por fecha y validación retroactiva',()=>{
 let b=add(emptyBook(),op('contribution','Fran',10,0,'2026-10-18'));assert.throws(()=>add(b,op('sale','Fran',20,10,'2026-10-17')),/insuficiente/);b=add(b,op('sale','Fran',20,10,'2026-10-19'));assert.equal(replay(b).total,14);
});
test('persistencia, ida y vuelta, separación demo y carreras entre pestañas',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};const b=add(emptyBook(),op('contribution','Yane',200));const raw=saveBook(storage,'real',null,b);assert.equal(replay(parseBackup(storage.getItem('real'))).total,200);saveBook(storage,'demo',null,emptyBook());assert.equal(storage.getItem('real'),raw);assert.throws(()=>saveBook(storage,'real',null,emptyBook()),/otra pestaña/);assert.equal(storage.getItem('real'),raw);
 const broken={getItem:()=>null,setItem:()=>{throw new Error('Quota exceeded');}};assert.throws(()=>saveBook(broken,'real',null,b),/Quota/);
});
test('rechaza respaldos inválidos sin ejecutar ni alterar campos',()=>{
 const b=add(emptyBook(),op('contribution','Fran',10));for(const value of [1.5,-1,0,Infinity,MAX_AMOUNT+1])assert.throws(()=>add(b,op('contribution','Yane',value)));
 assert.throws(()=>parseBackup('{"schema":1,"events":[],"__proto__":{"x":1}}'),/Formato/);assert.throws(()=>parseBackup('{"schema":2,"events":[]}'),/Versión/);assert.throws(()=>parseBackup(JSON.stringify({...b,events:[...b.events,...b.events]})),/Bitácora/);assert.throws(()=>add(b,{...op('contribution','Fran',1),date:'2026-02-30'}),/Fecha/);assert.throws(()=>append(b,event(null,'void','missing','Motivo')),/origen/);assert.throws(()=>append(b,event(b.events[0].operation,'correct',b.events[0].id,'')),/motivo/);
});
test('acumula sin pérdida de precisión hasta el límite de eventos',()=>{
 let b=emptyBook();for(let j=0;j<4503;j++)b.events.push(event(op('contribution',j%2?'Yane':'Fran',MAX_AMOUNT)));assert.equal(replay(b).total,4_503_000_000_000_000);
 const lots=emptyBook();for(let j=0;j<5000;j++)lots.events.push(event(op('sale','Fran',MAX_AMOUNT,0)));assert.ok(Number.isSafeInteger(replay(lots).total));
 assert.throws(()=>add(lots,op('contribution','Fran',1)),/tamaño/);
});
