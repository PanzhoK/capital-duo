// Read-only playback. Only the application controller can persist a movement.
export function savedSaleSnapshot(row){
 if(!row||row.voided||row.operation?.kind!=='sale'||!row.breakdown||!row.effect)throw new Error('La animación requiere una venta guardada y activa.');
 const snapshot=structuredClone({id:row.id,operation:row.operation,breakdown:row.breakdown,effect:row.effect});
 Object.freeze(snapshot.operation);Object.freeze(snapshot.breakdown);
 for(const effect of Object.values(snapshot.effect))Object.freeze(effect);
 Object.freeze(snapshot.effect);return Object.freeze(snapshot);
}

export function saleSteps(sale){
 return [
  {title:'La venta llega a nuestro negocio',amount:sale.operation.amount,detail:'Total recibido · Venta ya guardada',destination:'center'},
  {title:'Recuperamos el costo',amount:sale.breakdown.cost,detail:'Vuelve a los recursos. Ya formaba parte del capital.',destination:'resources'},
  {title:'El 20% se convierte en capital',amount:sale.breakdown.reinvest,detail:'Reinversión de la venta, compartida entre ambos.',destination:'capital',shares:sale.effect.capital},
  {title:'La ganancia queda por retirar',amount:sale.breakdown.profit,detail:'Separada del capital. Retírala cuando lo decidas.',destination:'pending',shares:sale.effect.pending},
 ];
}

export function createSalePlayer({onStep,onStop,reducedMotion=()=>false,schedule=setTimeout,cancel=clearTimeout}){
 let current=null,timer=null,generation=0;
 const seen=new Set();
 const clear=()=>{generation++;if(timer!==null)cancel(timer);timer=null;};
 function run(){
  clear();let index=0;const version=generation,sale=current;
  if(reducedMotion()){onStep(sale,-1,saleSteps(sale));return;}
  const next=()=>{
   if(version!==generation||!current)return;
   if(index===4){timer=null;onStop(sale,'finished');return;}
   onStep(sale,index,saleSteps(sale));
   if(version!==generation||!current)return;
   index++;
   timer=schedule(next,1850);
  };
  next();
 }
 return {
  play(row){const snapshot=savedSaleSnapshot(row);if(seen.has(snapshot.id))return false;seen.add(snapshot.id);if(seen.size>64)seen.delete(seen.values().next().value);current=snapshot;run();return true;},
  replay(){if(!current)return false;run();return true;},
  skip(){clear();if(current)onStop(current,'skipped');},
  reset(){clear();current=null;seen.clear();},
  get snapshot(){return current;},
 };
}

export function lastActiveMovement(book,state){
 const active=new Map(state.rows.filter(row=>!row.voided).map(row=>[row.id,row]));
 for(let index=book.events.length-1;index>=0;index--){const item=book.events[index];if(item.action==='create'&&active.has(item.id))return active.get(item.id);}
 return null;
}
