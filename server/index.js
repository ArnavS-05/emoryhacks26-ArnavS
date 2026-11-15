import {database} from './db.js';
import {services} from './services.js';
import {createApp} from './app.js';
const env={...process.env,APP_ORIGIN:process.env.APP_ORIGIN||'http://localhost:3000'};
const db=await database(env);
const server=createApp({db,ai:services(env),env});
server.listen(Number(env.PORT||3000),'0.0.0.0',()=>console.log(`Synaphi is listening on port ${env.PORT||3000}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await db.end();process.exit(0);}));
