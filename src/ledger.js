export const PEOPLE=['Fran','Yane'];
export const MAX_AMOUNT=1_000_000_000_000;
const fail=m=>{throw new Error(m)};
const validateBackupSize=text=>{if(typeof text!=='string'||text.length>5_000_000||new TextEncoder().encode(text).byteLength>5_000_000)fail('El respaldo excede 5 MB.');};
const exact=(o,keys)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).sort().join(',')!==keys.sort().join(','))fail('Formato de respaldo inválido.');};
const str=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const isoDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const timestamp=v=>{
 if(typeof v!=='string'||v.length>40)return false;
 const parts=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(v);
 return !!parts&&isoDate(parts[1])&&Number(parts[2])<24&&Number(parts[3])<60&&Number(parts[4])<60&&Number.isFinite(Date.parse(v));
};
const money=(v,zero=false)=>{if(!Number.isSafeInteger(v)||v<(zero?0:1)||v>MAX_AMOUNT)fail('Ingresa pesos enteros válidos, hasta $1.000.000.000.000.');};
const add=(a,b)=>{const n=a+b;if(!Number.isSafeInteger(n))fail('El saldo supera el límite de precisión permitido.');return n;};
export function validateOperation(o){
 exact(o,['kind','person','amount','cost','date','description']);
 if(!['contribution','sale','withdrawal'].includes(o.kind))fail('Tipo de movimiento inválido.');
 if(!PEOPLE.includes(o.person))fail('Persona inválida.');
 money(o.amount);money(o.cost,true);
 if(o.kind!=='sale'&&o.cost!==0)fail('Solo las ventas tienen costo.');
 if(!str(o.description,160))fail('Escribe una descripción de hasta 160 caracteres.');
 if(!isoDate(o.date))fail('Fecha inválida.');
 return o;
}
export function saleBreakdown(value,cost){
 money(value);money(cost,true);
 // Integer arithmetic: nearest peso, half up. No fractional monetary state.
 const reinvest=Number((BigInt(value)+2n)/5n);
 return {value,cost,reinvest,profit:value-cost-reinvest};
}
export function emptyBook(){return {schema:1,events:[]};}
export function validateBook(book){
 exact(book,['schema','events']);if(book.schema!==1||!Array.isArray(book.events)||book.events.length>5000)fail('Versión o tamaño de respaldo no compatible (máximo 5.000 eventos).');
 const ids=new Set(),roots=new Set();
 for(const e of book.events){
  exact(e,['id','target','action','at','reason','operation']);
  if(!str(e.id,80)||ids.has(e.id)||!timestamp(e.at))fail('Bitácora inválida.');
  if(!['create','correct','void'].includes(e.action)||typeof e.reason!=='string'||e.reason.length>240)fail('Acción inválida.');
  if(e.action==='create'){if(e.target!==null||e.reason!=='')fail('Creación inválida.');roots.add(e.id);}
  else if(!roots.has(e.target)||!e.reason.trim())fail('Una corrección o anulación requiere origen y motivo.');
  if(e.action==='void'){if(e.operation!==null)fail('Anulación inválida.');}else validateOperation(e.operation);
  ids.add(e.id);
 }
 return book;
}
export function replay(book){
 validateBook(book);
 const map=new Map();
 for(const [index,e] of book.events.entries()){
  if(e.action==='create')map.set(e.id,{id:e.id,index,operation:e.operation,voided:false,revisions:[]});
  else {const row=map.get(e.target);row.revisions.push(e);if(e.action==='void')row.voided=true;else{row.operation=e.operation;row.voided=false;}}
 }
 const rows=[...map.values()].sort((a,b)=>a.operation.date.localeCompare(b.operation.date)||a.index-b.index);
 const state={capital:{Fran:0,Yane:0},pending:{Fran:0,Yane:0},contributions:{Fran:0,Yane:0},reinvest:{Fran:0,Yane:0},generated:{Fran:0,Yane:0},withdrawn:{Fran:0,Yane:0},points:[],rows,total:0};
 let rTurn=0,gTurn=0;
 const split=(n,turn)=>({Fran:Math.floor(n/2)+(n%2&&turn%2===0?1:0),Yane:Math.floor(n/2)+(n%2&&turn%2===1?1:0)});
 for(const row of rows){
  const o=row.operation;row.before={capital:{...state.capital},pending:{...state.pending}};row.effect={capital:{Fran:0,Yane:0},pending:{Fran:0,Yane:0}};
  if(!row.voided){
   if(o.kind==='contribution'){state.capital[o.person]=add(state.capital[o.person],o.amount);state.contributions[o.person]=add(state.contributions[o.person],o.amount);row.effect.capital[o.person]=o.amount;}
   if(o.kind==='withdrawal'){if(o.amount>state.pending[o.person])fail(`Retiro «${o.description}»: supera las ganancias pendientes de ${o.person}.`);state.pending[o.person]-=o.amount;state.withdrawn[o.person]=add(state.withdrawn[o.person],o.amount);row.effect.pending[o.person]=-o.amount;}
   if(o.kind==='sale'){
    const b=saleBreakdown(o.amount,o.cost);row.breakdown=b;
    if(o.cost>add(state.capital.Fran,state.capital.Yane))fail(`Venta «${o.description}»: capital insuficiente para financiar el costo.`);
    if(b.profit<0)fail(`Déficit de $${-b.profit}: definan quién lo absorbe antes de contabilizar esta venta.`);
    const rs=split(b.reinvest,rTurn),gs=split(b.profit,gTurn);if(b.reinvest%2)rTurn++;if(b.profit%2)gTurn++;
    for(const p of PEOPLE){state.capital[p]=add(state.capital[p],rs[p]);state.reinvest[p]=add(state.reinvest[p],rs[p]);state.pending[p]=add(state.pending[p],gs[p]);state.generated[p]=add(state.generated[p],gs[p]);row.effect.capital[p]=rs[p];row.effect.pending[p]=gs[p];}
   }
  }
  state.total=add(state.capital.Fran,state.capital.Yane);add(state.pending.Fran,state.pending.Yane);add(state.contributions.Fran,state.contributions.Yane);add(state.generated.Fran,state.generated.Yane);add(state.withdrawn.Fran,state.withdrawn.Yane);add(state.reinvest.Fran,state.reinvest.Yane);
  row.after={capital:{...state.capital},pending:{...state.pending},total:state.total};if(!row.voided)state.points.push({date:o.date,value:state.total});
 }
 return state;
}
export function append(book,event){const candidate={schema:1,events:[...book.events,event]};replay(candidate);return candidate;}
export function parseBackup(text){validateBackupSize(text);const book=JSON.parse(text);replay(book);return book;}
export function saveBook(storage,key,previous,next){
 const current=storage.getItem(key);
 if(current!==previous)fail('Los datos cambiaron en otra pestaña. Recarga antes de guardar.');
 replay(next);const raw=JSON.stringify(next);validateBackupSize(raw);storage.setItem(key,raw);return raw;
}
export async function saveBookWithLock(locks,storage,key,previous,next){
 if(!locks||typeof locks.request!=='function')fail('Este navegador no admite el bloqueo seguro entre pestañas. Usa un navegador compatible para guardar.');
 return locks.request('capital-duo.write.'+key,{mode:'exclusive'},()=>saveBook(storage,key,previous,next));
}
