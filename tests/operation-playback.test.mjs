import {test} from 'node:test';
import assert from 'node:assert/strict';
import {append,emptyBook,parseBackup,replay,saveBookWithLock} from '../src/ledger.js';
import {createSalePlayer,lastActiveMovement,savedSaleSnapshot,saleSteps} from '../src/animation.js';

const operation=(kind,person,amount,cost=0,date='2026-10-20')=>({kind,person,amount,cost,date,description:'Prueba de reproducción'});
const event=(id,operation,action='create',target=null,reason='')=>({id,target,action,at:'2026-10-20T12:00:00.000Z',reason,operation});
const seed=()=>append(emptyBook(),event('initial-capital',operation('contribution','Fran',10)));
function memoryBook(initial){
 let raw=JSON.stringify(initial),writes=0,queue=Promise.resolve();
 const storage={getItem:()=>raw,setItem:(_key,value)=>{raw=value;writes++;}};
 const locks={request(_name,_options,callback){const result=queue.then(callback);queue=result.catch(()=>{});return result;}};
 return {storage,locks,raw:()=>raw,writes:()=>writes};
}

test('la fila persistida contiene todos los importes del recorrido sin recontabilizar el costo',async()=>{
 const initial=seed(),store=memoryBook(initial),previous=store.raw();
 const candidate=append(initial,event('saved-sale',operation('sale','Fran',20,10)));
 assert.equal(store.raw(),previous,'preparar la venta todavía no la guarda');
 const saved=await saveBookWithLock(store.locks,store.storage,'test',previous,candidate);
 const persisted=replay(parseBackup(saved)),row=persisted.rows.find(item=>item.id==='saved-sale');
 assert.deepEqual(row.before,{capital:{Fran:10,Yane:0},pending:{Fran:0,Yane:0}});
 assert.deepEqual(row.breakdown,{value:20,cost:10,reinvest:4,profit:6});
 assert.deepEqual(row.effect,{capital:{Fran:2,Yane:2},pending:{Fran:3,Yane:3}});
 assert.deepEqual(row.after,{capital:{Fran:12,Yane:2},pending:{Fran:3,Yane:3},total:14});
 assert.equal(store.writes(),1);
});

test('la animación puede usar las mitades exactas persistidas aunque sus turnos impares difieran',async()=>{
 let initial=append(emptyBook(),event('first-sale',operation('sale','Fran',3)));
 const store=memoryBook(initial),candidate=append(initial,event('second-sale',operation('sale','Fran',4)));
 const saved=await saveBookWithLock(store.locks,store.storage,'test',store.raw(),candidate);
 const state=replay(parseBackup(saved)),row=state.rows.find(item=>item.id==='second-sale');
 assert.deepEqual(row.breakdown,{value:4,cost:0,reinvest:1,profit:3});
 assert.deepEqual(row.effect.capital,{Fran:0,Yane:1},'reinversión ya alternó su peso sobrante');
 assert.deepEqual(row.effect.pending,{Fran:2,Yane:1},'el reparto de ganancias lleva un turno independiente');
 assert.equal(row.effect.capital.Fran+row.effect.capital.Yane,row.breakdown.reinvest);
 assert.equal(row.effect.pending.Fran+row.effect.pending.Yane,row.breakdown.profit);
});

test('reproducir muchas veces el libro guardado no vuelve a generar eventos ni escrituras',async()=>{
 const initial=seed(),store=memoryBook(initial);
 const saved=await saveBookWithLock(store.locks,store.storage,'test',store.raw(),append(initial,event('saved-sale',operation('sale','Fran',20,10))));
 const baseline=replay(parseBackup(saved));
 for(let i=0;i<50;i++)assert.deepEqual(replay(parseBackup(store.raw())),baseline);
 assert.equal(store.writes(),1);assert.equal(store.raw(),saved);assert.equal(parseBackup(saved).events.length,2);
 assert.equal(baseline.total,14);assert.deepEqual(baseline.pending,{Fran:3,Yane:3});
});

test('dos confirmaciones de la misma versión solo guardan una venta',async()=>{
 const initial=seed(),store=memoryBook(initial),previous=store.raw();
 const first=append(initial,event('sale-tap-one',operation('sale','Fran',20,10)));
 const second=append(initial,event('sale-tap-two',operation('sale','Fran',20,10)));
 const results=await Promise.allSettled([
  saveBookWithLock(store.locks,store.storage,'test',previous,first),
  saveBookWithLock(store.locks,store.storage,'test',previous,second),
 ]);
 assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.match(results[1].reason.message,/otra pestaña/);
 const persisted=parseBackup(store.raw()),state=replay(persisted);
 assert.equal(store.writes(),1);assert.equal(persisted.events.length,2);assert.equal(state.total,14);assert.deepEqual(state.pending,{Fran:3,Yane:3});
 assert.throws(()=>append(persisted,persisted.events.at(-1)),/Bitácora/,'reutilizar el mismo ID tampoco duplica el movimiento');
 assert.equal(parseBackup(store.raw()).events.length,2);
});

test('anular la última venta registrada conserva su original aunque su fecha sea retroactiva',async()=>{
 let initial=append(emptyBook(),event('initial-capital',operation('contribution','Fran',10,0,'2026-10-18')));
 initial=append(initial,event('later-date-capital',operation('contribution','Yane',200,0,'2026-10-20')));
 initial=append(initial,event('last-recorded-sale',operation('sale','Fran',20,10,'2026-10-19')));
 const store=memoryBook(initial),lastEvent=initial.events.at(-1),before=replay(initial);
 assert.equal(before.rows.at(-1).id,'later-date-capital','el orden contable difiere del orden de registro');
 const voidEvent=event('undo-last-sale',null,'void',lastEvent.id,'Anulación solicitada tras revisar la venta');
 const saved=await saveBookWithLock(store.locks,store.storage,'test',store.raw(),append(initial,voidEvent));
 const persisted=parseBackup(saved),after=replay(persisted),row=after.rows.find(item=>item.id===lastEvent.id);
 assert.equal(persisted.events.length,4);assert.deepEqual(persisted.events[2],lastEvent);assert.deepEqual(persisted.events[3],voidEvent);
 assert.equal(row.voided,true);assert.deepEqual(row.revisions,[voidEvent]);assert.deepEqual(row.effect,{capital:{Fran:0,Yane:0},pending:{Fran:0,Yane:0}});
 assert.deepEqual(after.capital,{Fran:10,Yane:200});assert.deepEqual(after.pending,{Fran:0,Yane:0});assert.equal(after.total,210);
 assert.equal(store.writes(),1);
});

test('los efectos de aportes y retiros describen únicamente sus saldos correspondientes',()=>{
 let initial=append(seed(),event('saved-sale',operation('sale','Fran',20,10)));
 initial=append(initial,event('contribution-yane',operation('contribution','Yane',200)));
 initial=append(initial,event('withdraw-fran',operation('withdrawal','Fran',3)));
 const state=replay(initial),contribution=state.rows.find(row=>row.id==='contribution-yane'),withdrawal=state.rows.find(row=>row.id==='withdraw-fran');
 assert.deepEqual(contribution.effect,{capital:{Fran:0,Yane:200},pending:{Fran:0,Yane:0}});
 assert.deepEqual(withdrawal.effect,{capital:{Fran:0,Yane:0},pending:{Fran:-3,Yane:0}});
 assert.equal(state.total,214);assert.deepEqual(state.pending,{Fran:0,Yane:3});
});

function fakeScheduler(){
 let sequence=0;const pending=new Map(),archive=new Map();
 return {
  schedule(callback,delay){assert.equal(delay,1850);const id=++sequence;pending.set(id,callback);archive.set(id,callback);return id;},
  cancel(id){pending.delete(id);},
  get pending(){return pending.size;},
  get lastId(){return sequence;},
  invokeOld(id){archive.get(id)();},
  flush(){let count=0;while(pending.size){assert.ok(count++<20,'el reproductor debe terminar');const [id,callback]=pending.entries().next().value;pending.delete(id);callback();}},
 };
}
const saleRow=(id='saved-sale')=>replay(append(seed(),event(id,operation('sale','Fran',20,10)))).rows.find(row=>row.id===id);

test('play de la misma venta inicia una vez y replay o skip nunca escriben otra operación',async()=>{
 const initial=seed(),store=memoryBook(initial);
 const saved=await saveBookWithLock(store.locks,store.storage,'test',store.raw(),append(initial,event('saved-sale',operation('sale','Fran',20,10))));
 const row=replay(parseBackup(saved)).rows.find(item=>item.id==='saved-sale'),clock=fakeScheduler(),steps=[],stops=[];
 const player=createSalePlayer({schedule:clock.schedule,cancel:clock.cancel,onStep:(sale,index)=>steps.push([sale.id,index]),onStop:(sale,reason)=>stops.push([sale.id,reason])});
 assert.equal(player.play(row),true);assert.equal(player.play(row),false);assert.deepEqual(steps,[['saved-sale',0]]);assert.equal(clock.pending,1);
 clock.flush();assert.deepEqual(steps.map(item=>item[1]),[0,1,2,3]);assert.deepEqual(stops,[['saved-sale','finished']]);
 assert.equal(player.replay(),true);assert.equal(steps.at(-1)[1],0);player.skip();assert.equal(clock.pending,0);assert.deepEqual(stops.at(-1),['saved-sale','skipped']);
 assert.equal(store.writes(),1);assert.equal(store.raw(),saved);assert.equal(parseBackup(store.raw()).events.length,2);assert.equal(replay(parseBackup(saved)).total,14);
});

test('el snapshot es independiente e inmutable y usa los repartos exactos del libro',()=>{
 let value=append(emptyBook(),event('first',operation('sale','Fran',3)));
 value=append(value,event('odd-sale',operation('sale','Fran',4)));
 const row=replay(value).rows.find(item=>item.id==='odd-sale'),snapshot=savedSaleSnapshot(row),steps=saleSteps(snapshot);
 assert.notEqual(snapshot.operation,row.operation);assert.notEqual(snapshot.effect.capital,row.effect.capital);
 assert.deepEqual(steps[2].shares,{Fran:0,Yane:1});assert.deepEqual(steps[3].shares,{Fran:2,Yane:1});
 assert.ok(Object.isFrozen(snapshot));assert.ok(Object.isFrozen(snapshot.operation));assert.ok(Object.isFrozen(snapshot.breakdown));assert.ok(Object.isFrozen(snapshot.effect));assert.ok(Object.isFrozen(snapshot.effect.capital));assert.ok(Object.isFrozen(snapshot.effect.pending));
 assert.throws(()=>{snapshot.operation.amount=100;},TypeError);assert.throws(()=>{snapshot.effect.capital.Fran=100;},TypeError);
 row.operation.amount=100;row.effect.pending.Fran=100;
 assert.equal(snapshot.operation.amount,4);assert.equal(snapshot.effect.pending.Fran,2);
 for(const invalid of [null,{...saleRow(),voided:true},{...saleRow(),operation:operation('contribution','Fran',1)}])assert.throws(()=>savedSaleSnapshot(invalid),/guardada y activa/);
});

test('callbacks anteriores no avanzan la venta nueva ni una reproducción reseteada',()=>{
 const clock=fakeScheduler(),steps=[],stops=[];
 const player=createSalePlayer({schedule:clock.schedule,cancel:clock.cancel,onStep:(sale,index)=>steps.push([sale.id,index]),onStop:(sale,reason)=>stops.push([sale.id,reason])});
 player.play(saleRow('first'));const stale=clock.lastId;
 player.play(saleRow('second'));const current=clock.lastId;
 clock.invokeOld(stale);assert.deepEqual(steps,[['first',0],['second',0]]);assert.equal(stops.length,0);
 player.reset();clock.invokeOld(current);assert.deepEqual(steps,[['first',0],['second',0]]);assert.equal(player.snapshot,null);assert.equal(clock.pending,0);assert.equal(player.replay(),false);assert.equal(stops.length,0);
});

test('un callback que inicia otra venta no deja avanzar ni programar el recorrido anterior',()=>{
 const clock=fakeScheduler(),steps=[],stops=[];let player;
 player=createSalePlayer({schedule:clock.schedule,cancel:clock.cancel,
  onStep(sale,index){steps.push([sale.id,index]);if(sale.id==='first')player.play(saleRow('second'));},
  onStop:(sale,reason)=>stops.push([sale.id,reason]),
 });
 player.play(saleRow('first'));assert.equal(clock.pending,1);
 clock.flush();assert.deepEqual(steps,[['first',0],['second',0],['second',1],['second',2],['second',3]]);assert.deepEqual(stops,[['second','finished']]);
 const resetClock=fakeScheduler();let resetPlayer;
 resetPlayer=createSalePlayer({schedule:resetClock.schedule,cancel:resetClock.cancel,onStep:()=>resetPlayer.reset(),onStop:()=>assert.fail('un recorrido reseteado no finaliza después')});
 resetPlayer.play(saleRow());assert.equal(resetClock.pending,0);assert.equal(resetPlayer.snapshot,null);
});

test('movimiento reducido entrega todas las etapas sin programar timers',()=>{
 const emitted=[],player=createSalePlayer({
  reducedMotion:()=>true,schedule:()=>assert.fail('movimiento reducido no programa temporizadores'),cancel:()=>assert.fail('no debe existir timer por cancelar'),
  onStep:(sale,index,steps)=>emitted.push({id:sale.id,index,steps}),onStop:()=>{},
 });
 assert.equal(player.play(saleRow()),true);assert.equal(emitted.length,1);assert.equal(emitted[0].index,-1);assert.equal(emitted[0].steps.length,4);
 assert.deepEqual(emitted[0].steps.map(step=>step.destination),['center','resources','capital','pending']);
 assert.deepEqual(emitted[0].steps.map(step=>step.amount),[20,10,4,6]);assert.equal(player.replay(),true);assert.equal(emitted.length,2);player.skip();
});

test('último movimiento activo respeta el orden de registro y omite anulaciones',()=>{
 let value=append(emptyBook(),event('later-date',operation('contribution','Yane',200,0,'2026-10-20')));
 value=append(value,event('last-created',operation('contribution','Fran',10,0,'2026-10-18')));
 assert.equal(lastActiveMovement(value,replay(value)).id,'last-created');
 value=append(value,event('correct-last',operation('contribution','Fran',12,0,'2026-10-18'),'correct','last-created','Corregir importe'));
 assert.equal(lastActiveMovement(value,replay(value)).operation.amount,12);
 value=append(value,event('void-last',null,'void','last-created','Anular registro'));
 assert.equal(lastActiveMovement(value,replay(value)).id,'later-date');
 value=append(value,event('void-remaining',null,'void','later-date','Anular registro restante'));
 assert.equal(lastActiveMovement(value,replay(value)),null);assert.equal(lastActiveMovement(emptyBook(),replay(emptyBook())),null);
});
