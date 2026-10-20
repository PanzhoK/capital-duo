import {build} from './build.mjs';
import {startStaticServer} from '../server.mjs';
try{await build();const server=await startStaticServer();console.log('Capital Dúo local: http://localhost:4173');const close=()=>{server.closeAllConnections();server.close(()=>process.exit(0));};process.once('SIGINT',close);process.once('SIGTERM',close);}
catch(error){console.error(error.message);process.exitCode=1;}
