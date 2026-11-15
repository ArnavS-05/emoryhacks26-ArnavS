import {database} from '../server/db.js';
import {services} from '../server/services.js';
import {createApp} from '../server/app.js';
import {randomUUID} from 'node:crypto';
const required=['DATABASE_URL','GEMINI_API_KEY','TYPESENSE_HOST','TYPESENSE_ADMIN_KEY','CLINICIAN_PASSWORD'];
const missing=required.filter(k=>!process.env[k]);
if(missing.length){console.error('Live verification blocked: '+missing.join(', '));process.exit(2);}
const db=await database();const ai=services();const env={...process.env,APP_ORIGIN:'http://127.0.0.1:4199',NODE_ENV:'test'};
const server=createApp({db,ai,env});await new Promise(r=>server.listen(4199,'127.0.0.1',r));
let patientId,sessionId,doctorCookie,patientCookie;
async function request(path,body,cookie){const res=await fetch(env.APP_ORIGIN+'/api'+path,{headers:{Origin:env.APP_ORIGIN,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const data=await res.json();if(!res.ok)throw new Error(path);return {data,cookie:res.headers.get('set-cookie')?.split(';')[0]};}
try{
 await db.query('SELECT 1');console.log('PASS Tiger Data TLS connection');
 doctorCookie=(await request('/login',{password:process.env.CLINICIAN_PASSWORD})).cookie;
 patientId=(await request('/patients',{name:'SYNTHETIC LIVE TEST '+randomUUID(),language:'Spanish',notes:'Synthetic test only.'},doctorCookie)).data.id;
 sessionId=(await request('/sessions',{patientId},doctorCookie)).data.id;const base='/sessions/'+sessionId;
 const pairing=(await request(base+'/pair',{},doctorCookie)).data.url.split('#')[1];patientCookie=(await request('/pair',{token:pairing})).cookie;
 await request(base+'/messages',{text:'Where does it hurt?',requestId:randomUUID()},doctorCookie);
 await request(base+'/messages',{text:'Me duele el brazo.',requestId:randomUUID()},patientCookie);
 const data=(await request(base,undefined,doctorCookie)).data;if(data.messages.length!==2||data.messages.some(x=>x.translation_status!=='complete'))throw new Error('Translation failed');console.log('PASS two-device conversation and Gemini translations');
 await request(base+'/settings',{mode:'dwell',dwellMs:1600,speak:true,largeText:true},patientCookie);
 await request(base+'/events',{method:'dwell',action:'confirmed',durationMs:1600},patientCookie);
 if(!(await request(base+'/analytics',undefined,doctorCookie)).data.length)throw new Error('Analytics failed');console.log('PASS preferences and Timescale interaction analytics');
 if(!(await request(base+'/search',{query:'help expressing pain'},doctorCookie)).data.length)throw new Error('Search empty');console.log('PASS Typesense hybrid search with real Gemini embeddings');
 const insight=(await request(base+'/insights',{},doctorCookie)).data;await request(base+'/review',{id:insight.id,status:'approved'},doctorCookie);console.log('PASS Gemini insight and clinician approval');
 if((await request(base,undefined,patientCookie)).data.insights.length)throw new Error('Patient saw private insights');
 console.log('LIVE WORKFLOW PASSED. Prescription file interpretation still requires a manual fixture review.');
}catch{console.error('LIVE WORKFLOW FAILED. Verify configuration, setup, provider access and quota. Secrets and patient text are not logged.');process.exitCode=1;}
finally{
 if(sessionId){for(const table of ['interaction_events','insights','messages','pairings','auth_sessions'])await db.query(`DELETE FROM ${table} WHERE session_id=$1`,[sessionId]).catch(()=>{});await db.query('DELETE FROM sessions WHERE id=$1',[sessionId]).catch(()=>{});}
 if(patientId)await db.query('DELETE FROM patients WHERE id=$1',[patientId]).catch(()=>{});
 if(doctorCookie)await request('/logout',{},doctorCookie).catch(()=>{});
 await new Promise(r=>server.close(r));await db.end();
}
