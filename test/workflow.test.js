import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/app.js';
import {inject} from './inject.js';
// Test-only adapters exercise real HTTP routes. Production has no fake-data path.
function fixture(){
 const patients=[],sessions=[],auth=[],pairings=[],messages=[],insights=[],events=[];
 const db={async query(sql,v=[]){let rows=[];
 if(sql.startsWith('INSERT INTO auth_sessions')){auth.push({token_hash:v[0],role:sql.includes("'clinician'")?'clinician':'patient',session_id:v[1]});}
 else if(sql.startsWith('SELECT role,session_id FROM auth_sessions'))rows=auth.filter(x=>x.token_hash===v[0]);
 else if(sql.startsWith('DELETE FROM auth_sessions')){const i=auth.findIndex(x=>x.token_hash===v[0]);if(i>=0)auth.splice(i,1);}
 else if(sql.startsWith('INSERT INTO patients'))patients.push({id:v[0],name:v[1],language:v[2],notes:v[3],settings:{mode:'touch',dwellMs:1500,speak:false}});
 else if(sql.startsWith('SELECT id FROM patients'))rows=patients.filter(p=>p.id===v[0]);
 else if(sql.startsWith('SELECT * FROM patients'))rows=patients;
 else if(sql.startsWith('INSERT INTO sessions'))sessions.push({id:v[0],patient_id:v[1],active:true});
 else if(sql.startsWith('SELECT s.*,p.name,p.language,p.notes'))rows=sessions.filter(s=>s.id===v[0]).map(s=>({...patients.find(p=>p.id===s.patient_id),...s}));
 else if(sql.startsWith('INSERT INTO pairings'))pairings.push({token_hash:v[0],session_id:v[1]});
 else if(sql.startsWith('DELETE FROM pairings')){const i=pairings.findIndex(p=>p.token_hash===v[0]);if(i>=0)rows=pairings.splice(i,1);}
 else if(sql.startsWith('INSERT INTO messages')){if(!messages.some(m=>m.session_id===v[0]&&m.request_id===v[3])){const m={id:messages.length+1,session_id:v[0],role:v[1],body:v[2],request_id:v[3],translation_status:'pending'};messages.push(m);rows=[m];}}
 else if(sql.startsWith('UPDATE messages SET translation=')){const m=messages.find(m=>m.id===v[1]);m.translation=v[0];m.translation_status='complete';}
 else if(sql.startsWith("UPDATE messages SET translation_status='failed'")){messages.find(m=>m.id===v[0]).translation_status='failed';}
 else if(sql.startsWith('SELECT * FROM (SELECT * FROM messages'))rows=messages.filter(m=>m.session_id===v[0]);
 else if(sql.startsWith('SELECT role,body FROM messages'))rows=messages.filter(m=>m.session_id===v[0]).slice().reverse();
 else if(sql.startsWith('INSERT INTO insights'))insights.push({id:v[0],session_id:v[1],kind:v[2],body:v[3],status:'pending'});
 else if(sql.startsWith('SELECT * FROM insights'))rows=insights.filter(i=>i.session_id===v[0]);
 else if(sql.startsWith('UPDATE insights')){const i=insights.find(i=>i.id===v[1]&&i.session_id===v[2]&&i.status==='pending');if(i){i.status=v[0];rows=[i];}}
 else if(sql.startsWith('UPDATE patients SET settings'))patients.find(p=>p.id===v[1]).settings=v[0];
 else if(sql.startsWith('INSERT INTO interaction_events'))events.push({session_id:v[0],method:v[1],action:v[2],duration_ms:v[3]});
 else if(sql.startsWith('SELECT method,count'))rows=events.filter(e=>e.session_id===v[0]);
 else if(sql.startsWith('UPDATE sessions SET active'))sessions.find(s=>s.id===v[0]).active=false;
 else throw new Error('Unhandled test query: '+sql);
 return {rows};}};
 let fail=false;
 const ai={translate:async()=>{if(fail)throw new Error('offline');return 'translated fixture';},search:async()=>[{id:'source',verified:true}],analyze:async()=> 'Draft fixture for review'};
 return {db,ai,messages,failTranslation:()=>{fail=true;}};
}
test('HTTP workflow: pairing, conversation, preferences, analytics, review and revocation',async t=>{
 const f=fixture();const env={APP_ORIGIN:'http://synaphi.test',CLINICIAN_PASSWORD:'test-password-at-least-16'};const server=createApp({...f,env});
 async function req(path,body,cookie,origin=env.APP_ORIGIN){return inject(server,'/api'+path,{body,cookie,origin});}
 assert.equal((await req('/patients')).status,401);
 assert.equal((await req('/login',{password:env.CLINICIAN_PASSWORD},null,'https://evil.test')).status,403);
 const login=await req('/login',{password:env.CLINICIAN_PASSWORD});assert.equal(login.status,200);const doctor=login.cookie;
 const patient=(await req('/patients',{name:'Synthetic patient',language:'Spanish',notes:'Private clinician note'},doctor)).data;
 const session=(await req('/sessions',{patientId:patient.id},doctor)).data;const path='/sessions/'+session.id;
 const pairing=(await req(path+'/pair',{},doctor)).data.url.split('#')[1];
 const paired=await req('/pair',{token:pairing});assert.equal(paired.status,200);const patientCookie=paired.cookie;
 assert.equal((await req('/pair',{token:pairing})).status,401);
 assert.equal((await req('/patients',undefined,patientCookie)).status,403);
 assert.equal((await req('/sessions/'+randomUUID(),undefined,patientCookie)).status,403);
 const requestId=randomUUID();assert.equal((await req(path+'/messages',{text:'Where does it hurt?',requestId},doctor)).status,200);
 await req(path+'/messages',{text:'Where does it hurt?',requestId},doctor);assert.equal(f.messages.length,1);
 await req(path+'/messages',{text:'Mi brazo',requestId:randomUUID()},patientCookie);
 let view=(await req(path,undefined,patientCookie)).data;assert.equal(view.messages.length,2);assert.equal(view.messages[1].role,'patient');assert.equal(view.session.notes,undefined);
 assert.equal((await req(path+'/settings',{mode:'dwell',dwellMs:1800,speak:true,largeText:true},patientCookie)).status,200);
 assert.equal((await req(path+'/events',{method:'dwell',action:'confirmed',durationMs:1800},patientCookie)).status,200);
 assert.equal((await req(path+'/analytics',undefined,doctor)).data.length,1);
 assert.equal((await req(path+'/insights',{},patientCookie)).status,403);
 const insight=(await req(path+'/insights',{},doctor)).data;
 assert.equal((await req(path,undefined,patientCookie)).data.insights.length,0);
 assert.equal((await req(path+'/review',{id:insight.id,status:'approved'},doctor)).status,200);
 assert.equal((await req(path+'/review',{id:insight.id,status:'rejected'},doctor)).status,409);
 f.failTranslation();const delivered=await req(path+'/messages',{text:'Help',requestId:randomUUID()},patientCookie);assert.match(delivered.data.warning,/delivered/);assert.equal(f.messages.at(-1).body,'Help');assert.equal(f.messages.at(-1).translation_status,'failed');
 await req(path+'/end',{},doctor);assert.equal((await req(path,undefined,patientCookie)).status,410);
 await req('/logout',{},doctor);assert.equal((await req('/patients',undefined,doctor)).status,401);
});
test('unauthenticated static UI is served without secrets and unknown paths are rejected',async()=>{const server=createApp({...fixture(),env:{}});const res=await inject(server,'/');assert.equal(res.status,200);assert.match(res.data,/Synaphi/);assert.match(res.headers['content-security-policy'],/frame-ancestors 'none'/);assert.equal((await inject(server,'/.env')).status,404);});
