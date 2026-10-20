import {emptyBook,parseBackup,replay} from './ledger.js';

export const bookKey=(preview,demo)=>preview?'capital-duo.preview.v1':demo?'capital-duo.demo.v1':'capital-duo.real.v1';
export const settingKey=(preview,name)=>`capital-duo.${preview?'preview.':''}${name}`;

export function readBook(storage,key,demo,makeDemo){
 let raw=null;
 try{
  raw=storage.getItem(key);
  const book=raw?parseBackup(raw):demo?makeDemo():emptyBook();
  return {book,raw,state:replay(book),storageBlocked:false,loadError:''};
 }catch(error){
  const book=emptyBook();
  return {book,raw,state:replay(book),storageBlocked:true,loadError:'No pudimos abrir el almacenamiento. No sobrescribiremos los registros existentes. '+error.message+' Puedes exportar el archivo local desde Respaldos para revisarlo.'};
 }
}

export function readSettings(storage,key){
 try{return {lite:storage.getItem(key('lite'))==='true',motion:storage.getItem(key('motion'))!=='false',mode:storage.getItem(key('mode'))==='party'?'party':'calm'};}
 catch{return {lite:false,motion:true,mode:'calm'};}
}
