import {append,emptyBook} from './ledger.js';

export function createDemoBook(event){
 let b=emptyBook();
 const items=[['contribution','Fran',180000,0,'2026-09-02','El primer impulso'],['contribution','Yane',120000,0,'2026-09-03','Juntos desde el inicio'],['sale','Fran',95000,45000,'2026-09-08','Pedido de bienvenida'],['sale','Fran',160000,75000,'2026-09-16','Una gran semana'],['contribution','Fran',50000,0,'2026-09-20','Un impulso extra'],['sale','Fran',240000,110000,'2026-09-27','Colección de primavera'],['withdrawal','Yane',20000,0,'2026-10-01','Primeras ganancias'],['sale','Fran',310000,145000,'2026-10-05','Nuestro mejor pedido'],['sale','Fran',185000,90000,'2026-10-12','Clientes que vuelven'],['sale','Fran',260000,120000,'2026-10-18','Cerrando una buena semana']];
 for(const [kind,person,amount,cost,date,description] of items)b=append(b,event({kind,person,amount,cost,date,description}));return b;
};
