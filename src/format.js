export const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmt=n=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n).replace(/\s/g,'');
export const dateFmt=d=>new Intl.DateTimeFormat('es-CL',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(d+'T12:00:00'));
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const paths={base:'M3 10 12 4l9 6-9 6-9-6Zm0 5 9 6 9-6M3 20l9 6 9-6',history:'M4 6h16M4 12h10M4 18h7m6-3 3 3-3 3',chart:'M4 4v16h17M7 15l4-5 4 3 5-8',backup:'M5 8a7 7 0 0 1 13-2l2-2v6h-6M19 16A7 7 0 0 1 6 18l-2 2v-6h6',play:'m9 5 10 7-10 7V5Z',plus:'M12 5v14M5 12h14',book:'M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3V4Zm9 2v15',up:'M5 17 18 4M7 4h11v11',down:'M18 6 5 19m0-11v11h11',sale:'m12 3 9 9-9 9-9-9 9-9Zm0 5v8m-4-4h8',leaf:'M5 19C2 5 13 4 20 4c0 11-6 16-15 15Zm0 0 9-9',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',upload:'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',shield:'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6',pause:'M8 5v14M16 5v14',cube:'m12 3 9 5v10l-9 5-9-5V8l9-5Zm-9 5 9 5 9-5M12 13v10',check:'m5 12 5 5L20 7',info:'M12 11v6m0-10v1',search:'M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm6-2 6 6'};
export const icon=(name)=>`<svg viewBox="0 0 26 28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.base}"/></svg>`;

export function sum(object){return object.Fran+object.Yane;}
export function kindLabel(k){return {contribution:'Aporte',sale:'Venta',withdrawal:'Retiro'}[k];}
