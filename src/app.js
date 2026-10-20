import {PEOPLE,emptyBook,replay,append,saleBreakdown,parseBackup,saveBookWithLock,MAX_AMOUNT} from './ledger.js';
import {PREVIEW_ONLY} from './runtime.js';

import {esc,fmt,dateFmt,today,icon,kindLabel} from './format.js';
import {table,historyView,growthView,backupView} from './views.js';
import {readBook,readSettings,bookKey,settingKey} from './storage.js';
import {createDemoBook} from './demo.js';
import {gameView,personView,playbackView} from './game-ui.js';
import {createSalePlayer,lastActiveMovement} from './animation.js';
import {createSound} from './sound.js';
const $=s=>document.querySelector(s);
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));

let demo=PREVIEW_ONLY,view='base',book=emptyBook(),raw=null,loadError='',storageBlocked=false,editing=null,kind='contribution',lite=false,motion=true,mode='calm';
let state=replay(book),toastTimer,saving=false,formSubmitting=false,world=null,worldGeneration=0,lastPlayback=null;
const key=()=>bookKey(PREVIEW_ONLY,demo);
const preferenceKey=name=>settingKey(PREVIEW_ONLY,name);
const event=(operation,action='create',target=null,reason='')=>({id:crypto.randomUUID(),target,action,at:new Date().toISOString(),reason,operation});
const sound=createSound();
const reducedQuery=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
const reducedMotion=()=>!motion||!!reducedQuery?.matches;
const player=createSalePlayer({
 reducedMotion,
 onStep(sale,index,steps){
  lastPlayback={sale,index,steps,reduced:index===-1};renderPlayback();
  if(index>=0){try{world?.playStep(index,sale);sound.play(index);}catch{notify('Venta guardada. El efecto visual no está disponible.');}}
 },
 onStop(sale){stopWorldEffects();if(lastPlayback?.sale.id===sale.id){lastPlayback.complete=true;renderPlayback();}},
});

function load(){
 try{
  const storage=localStorage;
  ({raw,book,state,loadError,storageBlocked}=readBook(storage,key(),demo,()=>createDemoBook(event)));
  ({lite,motion,mode}=readSettings(storage,preferenceKey));
 }catch{
  raw=null;book=emptyBook();state=replay(book);storageBlocked=true;
  loadError='El navegador bloqueó el acceso al almacenamiento local. Tus registros existentes no se leerán ni modificarán. Habilita el almacenamiento de este sitio y recarga para recuperar o exportar tus respaldos.';
  lite=false;motion=true;mode='calm';
 }
}
async function commit(next){
 if(storageBlocked)throw new Error('El almacenamiento no está disponible. Exporta tus registros antes de continuar.');
 if(saving)throw new Error('Ya hay un guardado en curso. Espera a que termine.');
 const targetKey=key(),expectedRaw=raw;saving=true;
 try{
  const saved=await saveBookWithLock(globalThis.navigator?.locks,localStorage,targetKey,expectedRaw,next);
  if(key()!==targetKey){load();return;}
  raw=saved;book=next;state=replay(book);$('#save-status').textContent='Guardado ahora · En este navegador';
 }finally{saving=false;}
}
function notify(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}

function render(){
 worldGeneration++;world?.dispose();world=null;
 document.title='Capital Dúo · '+({base:'Nuestra base',history:'Movimientos',growth:'Evolución',backup:'Respaldos'}[view]);
 $('#page-name').textContent={base:'Nuestra base',history:'Movimientos',growth:'Evolución',backup:'Respaldos'}[view];
 $('.page-heading').hidden=view==='base';$('#new-movement').hidden=view==='base';
 $('#heading').textContent={base:'Nuestro pequeño gran mundo.',history:'El cuaderno de nuestro negocio.',growth:'Cada paso nos hace crecer.',backup:'Nuestra historia, bien cuidada.'}[view];
 $('#subheading').textContent={base:'Tu capital tiene un lugar. Y cada peso, un propósito.',history:'Aportes, ventas y ganancias. Todo claro, todo en su lugar.',growth:'El progreso se construye movimiento a movimiento.',backup:'Tus registros, siempre en tus manos.'}[view];
 $('#demo-banner').hidden=!demo;$('#demo-toggle').innerHTML=icon('play')+`<span>${demo?'Volver a mis datos':'Explorar demo'}</span>`;
 $('#demo-toggle').hidden=PREVIEW_ONLY;$('#exit-demo').hidden=PREVIEW_ONLY;
 if(PREVIEW_ONLY)$('#demo-banner span').textContent='VISTA PREVIA AISLADA · Solo demostración. No ingreses información real ni sensible.';
 $('#storage-alert').textContent=loadError;
 document.querySelectorAll('[data-view]').forEach(el=>{el.classList.toggle('selected',el.dataset.view===view);el.setAttribute('aria-current',el.dataset.view===view?'page':'false');});
 $('#content').innerHTML=view==='base'?gameView(state,{lite,mode,motion,sound:sound.enabled,last:lastActiveMovement(book,state)}):view==='history'?historyView(state):view==='growth'?growthView(state):backupView({demo,loadError});
 $('#save-status').textContent=storageBlocked?'Almacenamiento no disponible':`${PREVIEW_ONLY?'Vista previa aislada':demo?'Demostración':'Registros reales'} · Local, sin sincronización`;
 if(view==='base')mountWorld(worldGeneration);
}

async function mountWorld(generation){
 const host=$('#scene-host');if(lite||host?.isConnected!==true)return;
 try{
  const {createWorld}=await import('./scene.js');
  if(generation!==worldGeneration||!host.isConnected)return;
  const instance=await createWorld(host,{onPerson:openPerson,onUnavailable:()=>{if(generation===worldGeneration){lite=true;render();notify('Vista liviana activada. Todas las funciones siguen disponibles.');}},reducedMotion:reducedMotion(),mode});
  if(generation!==worldGeneration){instance.dispose();return;}
  world=instance;host.querySelector('.scene-loading')?.remove();
  if(lastPlayback&&!lastPlayback.complete&&lastPlayback.index>=0)world.playStep(lastPlayback.index,lastPlayback.sale);
 }catch{
  if(generation!==worldGeneration)return;
  lite=true;render();notify('Vista liviana activada para este dispositivo.');
 }
}

function renderPlayback(){
 const panel=$('#sale-player');panel.hidden=!lastPlayback;
 if(!lastPlayback)return;
 panel.classList.toggle('compact',!!lastPlayback.complete);
 panel.innerHTML=playbackView(lastPlayback.sale,lastPlayback.index,lastPlayback.steps,lastPlayback);
}
function stopWorldEffects(){try{world?.stopEffects();}catch{notify('Los saldos están guardados. El efecto visual no está disponible.');}}
function clearPlayback(){player.reset();stopWorldEffects();lastPlayback=null;$('#sale-player').hidden=true;}
function openPerson(person){if(PEOPLE.includes(person))info('La bóveda de '+person,personView(person,state));}
async function undoLatest(){
 if(saving)return;
 const row=lastActiveMovement(book,state);if(!row)return;
 try{await commit(append(book,event(null,'void',row.id,'Deshacer el último movimiento desde la isla')));clearPlayback();render();notify('Movimiento anulado. El original sigue en la bitácora.');}
 catch(error){notify('No se pudo deshacer: '+error.message);}
}

function rules(){info('El dinero, sin enredos.',`<p class="explain">Los aportes son de cada persona. Las ganancias y la reinversión se comparten por mitades, aunque los aportes sean desiguales.</p><div class="flow"><span>Venta<b>V</b></span>−<span>Costo recuperado<b>C</b></span>−<span>Reinversión<b>V × 20%</b></span>=<span>Ganancia<b>G</b></span></div><ol class="info-list"><li>El costo se financia con el capital existente. Recuperarlo conserva ese capital: no se vuelve a sumar.</li><li>El 20% de la venta aumenta el capital de ambos por mitades.</li><li>Las ganancias positivas quedan pendientes de retiro, separadas del capital. Retirarlas no reduce el capital.</li><li>Un déficit bloquea el registro. Antes de contabilizarlo, Fran y Yane deben acordar quién lo absorbe; la aplicación no inventa esa regla.</li></ol><div class="rule-example"><strong>El ejemplo de Fran y Yane</strong><br>Fran aporta $10. Venta: $20, costo: $10.<br>Recuperación: $10 · Reinversión: $4 · Ganancia: $6.<br>Capital: Fran $12 + Yane $2 = <strong>$14</strong>.<br>Pendiente: $3 para cada uno.<br>Si Yane aporta $200: Fran $12 + Yane $202 = <strong>$214</strong>. Los pendientes siguen en $3 por persona.</div><p class="explain">Redondeo: pesos enteros, 20% al peso más cercano. Los pesos impares de cada mitad se alternan entre socios (primero Fran), con turnos independientes para reinversión y ganancias. No usamos decimales para contabilizar dinero.</p><p class="explain">Esta herramienta lleva capital y ganancias. No estima el efectivo físico disponible ni administra inventario, deudas o cuentas bancarias.</p>`);}
function info(title,html){$('#info-title').textContent=title;$('#info-body').innerHTML=html;if(!$('#info-dialog').open)$('#info-dialog').showModal();}
function fieldAmount(id,zero=false){const v=$(id).value.trim();if(!/^\d{1,13}$/.test(v))throw new Error('Ingresa montos en pesos enteros, sin puntos, comas ni decimales.');const n=Number(v);if(!Number.isSafeInteger(n)||n<(zero?0:1)||n>MAX_AMOUNT)throw new Error('El monto debe ser '+(zero?'cero o mayor':'mayor que cero')+' y no superar $1.000.000.000.000.');return n;}
function formOperation(){const person=$('#person').value;return {kind,person,amount:fieldAmount('#amount'),cost:kind==='sale'?fieldAmount('#cost',true):0,date:$('#date').value,description:$('#description').value.trim()||{sale:'Venta',contribution:'Aporte de '+person,withdrawal:'Retiro de '+person}[kind]};}
function buildCandidate(op){return append(book,event(op,editing?'correct':'create',editing?.id??null,editing?$('#reason').value.trim():''));}
function setKind(next){if(saving)return;kind=next;document.querySelectorAll('[data-kind]').forEach(b=>{b.classList.toggle('active',b.dataset.kind===kind);b.setAttribute('aria-pressed',String(b.dataset.kind===kind));});$('#person-field').hidden=kind==='sale';$('#cost-field').hidden=kind!=='sale';$('#amount-label').textContent={contribution:'¿Cuánto quieres aportar?',sale:'Total recibido por la venta',withdrawal:'Ganancia a retirar'}[kind];updatePreview();}
function openMovement(next='contribution',row=null){
 if(saving){notify('Hay un guardado en curso. Espera a que termine.');return;}
 if(storageBlocked){notify('El almacenamiento no está disponible. Revisa Respaldos.');return;}
 editing=row;$('#movement-form').reset();$('#date').value=row?.operation.date??today();$('#cost').value=row?.operation.cost??'0';$('#person').value=row?.operation.person??'Fran';$('#amount').value=row?.operation.amount??'';$('#description').value=row?.operation.description??'';$('#reason-field').hidden=!row;$('#movement-extra').open=!!row;$('#form-error').textContent='';$('#movement-title').textContent=row?'Corregir movimiento':{contribution:'Un aporte al negocio',sale:'Registremos una venta',withdrawal:'Retirar mis ganancias'}[next];$('#confirm-movement').textContent=row?'Guardar corrección →':'Confirmar y guardar →';setKind(row?.operation.kind??next);$('#movement-dialog').showModal();
}
function updatePreview(){
 $('#form-error').textContent='';$('#confirm-movement').disabled=true;
 if(!$('#amount').value){$('#preview').innerHTML='<p class="preview-note">Ingresa un monto para simular el efecto antes de confirmar.</p>';return;}
 try{
  const op=formOperation();
  if(kind==='sale'){
   const b=saleBreakdown(op.amount,op.cost);
   if(b.profit<0){$('#preview').innerHTML=`<div class="error-box">Esta venta presenta un déficit.<strong>${fmt(-b.profit)}</strong>Venta ${fmt(b.value)} − costo ${fmt(b.cost)} − reinversión ${fmt(b.reinvest)}. Definan quién absorbe el déficit antes de contabilizarlo. No hay ganancias para repartir.</div>`;return;}
  }
  // Validate using a placeholder description/reason while the user is completing the form.
  const candidate=append(book,event({...op,description:op.description||'Simulación'},editing?'correct':'create',editing?.id??null,editing?($('#reason').value.trim()||'Simulación de corrección'):''));
  const projected=replay(candidate);const row=projected.rows.find(r=>r.id===(editing?.id??candidate.events.at(-1).id));
  let html='<div class="preview-box"><div class="preview-title">ASÍ SE MOVERÁ EL DINERO</div>';
  if(kind==='sale'){const b=row.breakdown;html+=`<div class="preview-row"><span>Costo recuperado · ya es capital</span><strong>${fmt(b.cost)}</strong></div><div class="preview-row"><span>Reinversión · 20% de la venta</span><strong>+${fmt(b.reinvest)}</strong></div><div class="preview-row total"><span>Ganancias para repartir</span><strong>${fmt(b.profit)}</strong></div><div class="preview-persons">${PEOPLE.map(p=>`<div><b>${p}</b>+${fmt(row.effect.capital[p])} a capital<br>+${fmt(row.effect.pending[p])} por retirar</div>`).join('')}</div>`;}
  else if(kind==='contribution')html+=`<div class="preview-row"><span>Aporte al capital de ${op.person}</span><strong>+${fmt(op.amount)}</strong></div><p class="preview-note">La ganancia sigue siendo 50 / 50. Los pendientes no cambian.</p>`;
  else html+=`<div class="preview-row"><span>Retiro de ${op.person}</span><strong>−${fmt(op.amount)}</strong></div><div class="preview-row"><span>Le queda pendiente</span><strong>${fmt(row.after.pending[op.person])}</strong></div><p class="preview-note">El capital invertido se mantiene intacto.</p>`;
  html+=`<div class="preview-row total"><span>Capital total después de ${editing?'recalcular':'registrar'}</span><strong>${fmt(projected.total)}</strong></div></div>`;
  if(editing)html+='<p class="preview-note">Se conservan los valores anteriores en la bitácora. Todos los movimientos posteriores se recalculan.</p>';
  $('#preview').innerHTML=html;$('#confirm-movement').disabled=!op.description||!!editing&&!$('#reason').value.trim();
 }catch(e){$('#preview').innerHTML=`<p class="error">${esc(e.message)}</p>`;}
}
function detail(id){const row=state.rows.find(r=>r.id===id);if(!row)return;const o=row.operation,original=book.events.find(e=>e.id===id);
 const operationSummary=op=>`${kindLabel(op.kind)} · ${op.person} · ${fmt(op.amount)}${op.kind==='sale'?' · Costo '+fmt(op.cost):''} · ${dateFmt(op.date)} · ${esc(op.description)}`;
 info(row.voided?'Movimiento anulado':'Detalle del movimiento',`<p class="explain">${esc(o.description)}<br>${kindLabel(o.kind)} · ${esc(dateFmt(o.date))}${o.kind==='sale'?'':' · '+o.person}</p>${row.voided?'<div class="compare-box">Anulado: este movimiento no afecta los saldos actuales.</div>':`<div class="detail-balance">${PEOPLE.map(p=>`<div>${p} · Efecto en capital<strong>+${fmt(row.effect.capital[p])}</strong><p class="explain">Pendientes: ${row.effect.pending[p]>=0?'+':'−'}${fmt(Math.abs(row.effect.pending[p]))}<br>Capital después: ${fmt(row.after.capital[p])}<br>Pendientes después: ${fmt(row.after.pending[p])}</p></div>`).join('')}</div>${row.breakdown?`<div class="compare-box">Venta ${fmt(o.amount)} − costo ${fmt(o.cost)} − reinversión ${fmt(row.breakdown.reinvest)} = ${fmt(row.breakdown.profit)} de ganancia.</div>`:''}`}
 <h3 class="detail-section-title">BITÁCORA · VALORES CONSERVADOS</h3><div class="audit-item"><b>Registrado</b><small>${esc(new Date(original.at).toLocaleString('es-CL'))}</small><p>${operationSummary(original.operation)}</p></div>${row.revisions.map(e=>`<div class="audit-item"><b>${e.action==='void'?'Anulado':'Corregido'}</b><small>${esc(new Date(e.at).toLocaleString('es-CL'))}</small><p>${esc(e.reason)}</p>${e.operation?`<p>${operationSummary(e.operation)}</p>`:''}</div>`).join('')}<p class="explain">Los saldos corresponden al orden contable actual y consideran todas las correcciones.</p><div class="detail-actions"><button class="button secondary" data-edit="${esc(id)}">${row.voided?'Restaurar / corregir':'Corregir movimiento'}</button>${!row.voided?`<button class="button danger-outline" data-void="${esc(id)}">Anular</button>`:''}</div>`);
}
function voidPrompt(id){const row=state.rows.find(r=>r.id===id);info('Anular movimiento',`<p class="explain">Se conservará «${esc(row.operation.description)}» y su bitácora. Recalcularemos los posteriores; si alguno queda sin fondos, bloquearemos la anulación.</p><form id="void-form"><label>Motivo de anulación<input id="void-reason" maxlength="240" required placeholder="¿Por qué anulamos este movimiento?"></label><p class="error" id="void-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button secondary" data-close>Cancelar</button><button class="button danger" type="submit">Confirmar anulación</button></div></form>`);$('#void-form').addEventListener('submit',async e=>{e.preventDefault();try{await commit(append(book,event(null,'void',id,$('#void-reason').value.trim())));clearPlayback();$('#info-dialog').close();render();notify('Movimiento anulado. Saldos recalculados.');}catch(error){$('#void-error').textContent=error.message;}});}
function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportBook(){const text=JSON.stringify(book),name=`capital-duo-${demo?'DEMO':'real'}-${today()}.json`;info('Tu respaldo está listo.',`<p class="explain">${demo?'Datos de demostración':'Registros reales'} · ${state.rows.length} movimientos · Capital ${fmt(state.total)}. Conserva este archivo en un lugar privado.</p><button class="button primary" id="download-backup">Descargar archivo JSON ${icon('download')}</button><details class="backup-text-fallback"><summary>¿No puedes descargar? Copia el respaldo.</summary><p class="explain">Copia todo el contenido a un archivo de texto con extensión .json. Podrás importarlo después desde Respaldos.</p><textarea id="export-text" readonly spellcheck="false" aria-label="Contenido JSON del respaldo">${esc(text)}</textarea><button class="button secondary small" id="select-backup">Seleccionar contenido</button></details>`);$('#download-backup').onclick=()=>{download(text,name);notify('Se solicitó la descarga. También puedes copiar el contenido.');};$('#select-backup').onclick=()=>{$('#export-text').focus();$('#export-text').select();};}
async function importFile(file){
 if(!file)return;
 const importRaw=raw,importMode=demo;
 try{
  if(file.size>5_000_000)throw new Error('El respaldo supera el máximo de 5 MB.');
  const candidate=parseBackup(await file.text()),imported=replay(candidate);
  if(importMode!==demo||raw!==importRaw)throw new Error('Los datos cambiaron mientras se leía el archivo. Selecciona nuevamente el respaldo.');
  info('Revisar respaldo',`<p class="explain">Este respaldo reemplazará los datos de ${demo?'la demostración':'tus registros reales'} en este navegador. Revisa los totales antes de continuar.</p><div class="detail-balance"><div>Movimientos actuales<strong>${state.rows.length}</strong>Capital ${fmt(state.total)}</div><div>Movimientos del respaldo<strong>${imported.rows.length}</strong>Capital ${fmt(imported.total)}</div></div><p class="explain">El archivo incluye ${candidate.events.length} eventos de bitácora.<br>Fran: capital ${fmt(imported.capital.Fran)}, pendiente ${fmt(imported.pending.Fran)}.<br>Yane: capital ${fmt(imported.capital.Yane)}, pendiente ${fmt(imported.pending.Yane)}.</p><button class="button secondary" id="pre-import-export">1. Descargar datos actuales</button><p class="preview-note">Conserva el archivo descargado antes de reemplazar. Si tu navegador bloquea la descarga, copia el contenido que aparecerá debajo.</p><div id="pre-import-copy" hidden><textarea readonly spellcheck="false" aria-label="Respaldo de datos actuales">${esc(raw??JSON.stringify(book,null,2))}</textarea></div><p id="import-error" class="error" role="alert"></p><div class="dialog-actions"><button class="button secondary" data-close>Cancelar</button><button id="confirm-import" class="button primary" disabled>2. Reemplazar con este respaldo</button></div>`);
  $('#pre-import-export').onclick=()=>{download(raw??JSON.stringify(book,null,2),`capital-duo-antes-de-importar-${today()}.json`);$('#pre-import-copy').hidden=false;$('#confirm-import').disabled=false;};
  $('#confirm-import').onclick=async()=>{try{if(importMode!==demo||raw!==importRaw)throw new Error('Los datos cambiaron; selecciona nuevamente el respaldo.');if(storageBlocked)throw new Error('No se reemplazarán datos cuando el almacenamiento no esté disponible.');await commit(candidate);clearPlayback();$('#info-dialog').close();render();notify('Respaldo importado. Saldos verificados y recalculados.');}catch(e){$('#import-error').textContent=e.message;}};
 }catch(e){info('No se pudo importar',`<p class="error">${esc(e.message)}</p><p class="explain">Tus registros actuales no se modificaron.</p>`);}
}
function changeView(next){if(!['base','history','growth','backup'].includes(next))return;view=next;render();window.scrollTo({top:0,behavior:'instant'});}

function switchDemo(){if(PREVIEW_ONLY||saving)return;clearPlayback();demo=!demo;load();render();notify(demo?'Modo demostración. Tus registros reales están separados.':'De vuelta en tus registros reales.');}

document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-close')){b.closest('dialog').close();return;}
 if(b.dataset.view)changeView(b.dataset.view);
 if(b.dataset.go)changeView(b.dataset.go);
 if(b.dataset.new)openMovement(b.dataset.new);
 if(b.dataset.person)openPerson(b.dataset.person);
 if(b.dataset.personAction&&PEOPLE.includes(b.dataset.owner)){ $('#info-dialog').close();openMovement(b.dataset.personAction);$('#person').value=b.dataset.owner;updatePreview();}
 if(b.dataset.kind)setKind(b.dataset.kind);
 if(b.hasAttribute('data-rules'))rules();
 if(b.dataset.detail)detail(b.dataset.detail);
 if(b.dataset.edit){$('#info-dialog').close();openMovement('contribution',state.rows.find(r=>r.id===b.dataset.edit));}
 if(b.dataset.void)voidPrompt(b.dataset.void);
 if(b.id==='export')exportBook();
 if(b.id==='export-raw'){try{download(localStorage.getItem(key())??'','capital-duo-recuperacion.json');}catch(error){notify(error.message);}}
 if(b.id==='import')$('#backup-file').click();
 if(b.id==='undo-last')await undoLatest();
 if(b.id==='skip-sale')player.skip();
 if(b.id==='replay-sale')player.replay();
 if(b.id==='close-playback')clearPlayback();
 if(b.id==='sound-toggle'){try{await sound.toggle();render();}catch(error){notify(error.message);}}
 if(b.dataset.mood&&['calm','party'].includes(b.dataset.mood)){mode=b.dataset.mood;try{localStorage.setItem(preferenceKey('mode'),mode);}catch{notify('No pudimos guardar esta preferencia.');}render();}
 if(b.id==='motion-toggle'||b.id==='lite-toggle'){if(b.id==='motion-toggle'){motion=!motion;if(!motion)player.skip();}else lite=!lite;try{localStorage.setItem(preferenceKey('motion'),String(motion));localStorage.setItem(preferenceKey('lite'),String(lite));}catch{notify('No pudimos guardar esta preferencia.');}render();}
});
document.addEventListener('input',e=>{
 if(e.target.closest('#movement-form'))updatePreview();
 if(e.target.id==='search')filterHistory();
});
document.addEventListener('change',e=>{if(e.target.id==='filter-kind')filterHistory();if(e.target.id==='backup-file')importFile(e.target.files[0]);});
function filterHistory(){const q=$('#search').value.toLocaleLowerCase('es'),type=$('#filter-kind').value;const rows=[...state.rows].reverse().filter(r=>(type==='all'||r.operation.kind===type)&&(r.operation.description+' '+r.operation.person).toLocaleLowerCase('es').includes(q));$('#history-table').innerHTML=rows.length?table(rows,true):'<div class="empty-state"><p>No hay movimientos que coincidan con la búsqueda.</p></div>';}
$('#new-movement').onclick=()=>openMovement();$('#rules-button').onclick=rules;$('#demo-toggle').onclick=switchDemo;$('#exit-demo').onclick=switchDemo;
$('.brand').onclick=e=>{e.preventDefault();changeView('base');};
$('#movement-form').addEventListener('submit',async e=>{
 e.preventDefault();if(formSubmitting||!$('#movement-dialog').open)return;
 formSubmitting=true;$('#confirm-movement').disabled=true;
 let savedOperation;
 try{
  const op=formOperation(),wasEditing=!!editing,next=buildCandidate(op),recordId=editing?.id??next.events.at(-1).id;
  await commit(next);savedOperation={op,wasEditing,recordId};
 }catch(error){$('#form-error').textContent=error.message;$('#confirm-movement').disabled=false;}
 finally{formSubmitting=false;}
 if(!savedOperation)return;
 const {op,wasEditing,recordId}=savedOperation;
 $('#movement-dialog').close();
 try{
  if(wasEditing)clearPlayback();
  if(op.kind==='sale'&&!wasEditing)view='base';
  render();
  notify(wasEditing?'Corrección guardada. Saldos recalculados.':'Movimiento guardado. Cada peso en su lugar.');
  if(op.kind==='sale'&&!wasEditing)player.play(state.rows.find(row=>row.id===recordId));
 }catch{notify('Movimiento guardado. La presentación visual no está disponible; puedes revisar los saldos en Movimientos.');}
});
window.addEventListener('storage',e=>{if(e.key===key()||e.key===null){clearPlayback();if($('#movement-dialog').open){$('#form-error').textContent='Los datos cambiaron en otra pestaña. Cierra este formulario y recarga para continuar.';$('#confirm-movement').disabled=true;}else{load();render();notify('Se actualizaron los datos desde otra pestaña.');}}});
reducedQuery?.addEventListener?.('change',()=>{world?.update({reducedMotion:reducedMotion()});if(reducedMotion())player.skip();});
window.addEventListener('pagehide',()=>{worldGeneration++;world?.dispose();player.reset();sound.dispose();});
$('#today-label').textContent=new Intl.DateTimeFormat('es-CL',{weekday:'long',day:'numeric',month:'long',timeZone:'America/Santiago'}).format(new Date()).toLocaleUpperCase('es');
load();render();
