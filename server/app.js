import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {HttpError,text,uuid,language,settings,authorize,token,hash,same} from './core.js';
const publicRoot=new URL('../public/',import.meta.url);
export function createApp({db,ai,env=process.env}) {
  const attempts=new Map();
  const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
  const one=async(sql,args=[]) => (await q(sql,args))[0];
  const cookie=(res,value,max=43200)=>res.setHeader('Set-Cookie',`synaphi=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${max}${env.NODE_ENV==='production'?'; Secure':''}`);
  return createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    try {
      const url=new URL(req.url,'http://local'); const path=url.pathname;
      if(!path.startsWith('/api/')) {
        const files={'/':'index.html','/patient':'index.html','/app.js':'app.js','/style.css':'style.css'};
        if(!files[path]) throw new HttpError(404,'Not found');
        const name=files[path]; res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'); return res.end(await readFile(new URL(name,publicRoot)));
      }
      res.setHeader('Cache-Control','no-store');
      if(req.method!=='GET' && req.headers.origin!==env.APP_ORIGIN) throw new HttpError(403,'Origin rejected');
      let body={};
      if(req.method!=='GET') {
        if(!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415,'JSON required');
        const chunks=[];let bytes=0;
        for await(const chunk of req){bytes+=chunk.length;if(bytes>8*1024*1024)throw new HttpError(413,'Upload too large');chunks.push(chunk);}
        try{body=JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw new HttpError(400,'Invalid JSON');}
      }
      if(path==='/api/health') return send({configured:{gemini:!!env.GEMINI_API_KEY,typesense:!!(env.TYPESENSE_HOST&&env.TYPESENSE_ADMIN_KEY),database:!!env.DATABASE_URL,login:!!env.CLINICIAN_PASSWORD}});
      if(path==='/api/login'&&req.method==='POST') {
        const ip=req.socket.remoteAddress;const now=Date.now();
        for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);
        const attempt=attempts.get(ip)||{count:0,until:now+900000};
        if(++attempt.count>10)throw new HttpError(429,'Too many attempts. Try again in 15 minutes');attempts.set(ip,attempt);
        if(!env.CLINICIAN_PASSWORD||env.CLINICIAN_PASSWORD.length<16)throw new HttpError(503,'Configure a clinician password of at least 16 characters');
        if(!same(text(body.password,256),env.CLINICIAN_PASSWORD))throw new HttpError(401,'Incorrect password');
        const t=token();await q("INSERT INTO auth_sessions(token_hash,role,expires_at) VALUES($1,'clinician',now()+interval '12 hours')",[hash(t)]);cookie(res,t);return send({ok:true});
      }
      if(path==='/api/pair'&&req.method==='POST') {
        const pairing=await one('DELETE FROM pairings WHERE token_hash=$1 AND expires_at>now() AND session_id IN (SELECT id FROM sessions WHERE active) RETURNING session_id',[hash(text(body.token,100))]);
        if(!pairing)throw new HttpError(401,'Pairing link expired or already used');
        const t=token();await q("INSERT INTO auth_sessions(token_hash,role,session_id,expires_at) VALUES($1,'patient',$2,now()+interval '12 hours')",[hash(t),pairing.session_id]);cookie(res,t);return send({ok:true});
      }
      const raw=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('synaphi='))?.slice(8);
      const auth=raw?await one('SELECT role,session_id FROM auth_sessions WHERE token_hash=$1 AND expires_at>now()',[hash(raw)]):null;
      if(!auth)throw new HttpError(401,'Sign in or pair this device');
      if(path==='/api/me') return send(auth);
      if(path==='/api/logout'&&req.method==='POST'){await q('DELETE FROM auth_sessions WHERE token_hash=$1',[hash(raw)]);cookie(res,'',0);return send({ok:true});}
      if(path==='/api/patients') {
        authorize(auth,null,true);
        if(req.method==='GET')return send(await q('SELECT * FROM patients ORDER BY created_at DESC LIMIT 100'));
        if(req.method==='POST'){const id=randomUUID();await q('INSERT INTO patients(id,name,language,notes) VALUES($1,$2,$3,$4)',[id,text(body.name,100),language(body.language),typeof body.notes==='string'?body.notes.slice(0,4000):'']);return send({id},201);}
      }
      if(path==='/api/sessions') {
        authorize(auth,null,true);
        if(req.method==='GET')return send(await q('SELECT s.*,p.name,p.language FROM sessions s JOIN patients p ON p.id=s.patient_id WHERE active ORDER BY s.created_at DESC LIMIT 100'));
        if(req.method==='POST'){const id=randomUUID();const patient=await one('SELECT id FROM patients WHERE id=$1',[uuid(body.patientId)]);if(!patient)throw new HttpError(404,'Patient not found');await q('INSERT INTO sessions(id,patient_id) VALUES($1,$2)',[id,patient.id]);return send({id},201);}
      }
      const match=path.match(/^\/api\/sessions\/([a-f0-9-]+)(?:\/(\w+))?$/);
      if(!match)throw new HttpError(404,'Not found');
      const id=uuid(match[1]),action=match[2]||'state';authorize(auth,id);
      const session=await one('SELECT s.*,p.name,p.language,p.notes,p.settings FROM sessions s JOIN patients p ON p.id=s.patient_id WHERE s.id=$1',[id]);
      if(!session)throw new HttpError(404,'Session not found');
      if(!session.active)throw new HttpError(410,'Session has ended');
      if(action==='state'&&req.method==='GET') {
        const messages=await q('SELECT * FROM (SELECT * FROM messages WHERE session_id=$1 ORDER BY id DESC LIMIT 200) m ORDER BY id',[id]);
        const insights=auth.role==='clinician'?await q('SELECT * FROM insights WHERE session_id=$1 ORDER BY created_at DESC LIMIT 30',[id]):[];
        return send({session:{id,name:session.name,language:session.language,settings:session.settings,...(auth.role==='clinician'?{notes:session.notes}:{})},messages,insights});
      }
      if(action==='pair'&&req.method==='POST'){authorize(auth,id,true);const t=token();await q("INSERT INTO pairings VALUES($1,$2,now()+interval '10 minutes')",[hash(t),id]);return send({url:`${env.APP_ORIGIN}/patient#${t}`});}
      if(action==='end'&&req.method==='POST'){authorize(auth,id,true);await q('UPDATE sessions SET active=false WHERE id=$1',[id]);return send({ok:true});}
      if(action==='settings'&&req.method==='POST'){const value=settings(body);await q('UPDATE patients SET settings=$1 WHERE id=$2',[value,session.patient_id]);return send(value);}
      if(action==='messages'&&req.method==='POST') {
        const value=text(body.text),requestId=uuid(body.requestId);
        const inserted=await one('INSERT INTO messages(session_id,role,body,request_id) VALUES($1,$2,$3,$4) ON CONFLICT(session_id,request_id) DO NOTHING RETURNING *',[id,auth.role,value,requestId]);
        if(!inserted)return send({ok:true,duplicate:true});
        try{const translated=await ai.translate(value,auth.role==='clinician'?session.language:'English');await q("UPDATE messages SET translation=$1,translation_status='complete' WHERE id=$2",[translated,inserted.id]);return send({ok:true});}
        catch{await q("UPDATE messages SET translation_status='failed' WHERE id=$1",[inserted.id]);return send({ok:true,warning:'Message delivered. Translation unavailable.'});}
      }
      if(action==='translate'&&req.method==='POST') {
        const message=await one('SELECT * FROM messages WHERE id=$1 AND session_id=$2',[String(body.messageId),id]);if(!message)throw new HttpError(404,'Message not found');
        const result=await ai.translate(message.body,message.role==='clinician'?session.language:'English');await q("UPDATE messages SET translation=$1,translation_status='complete' WHERE id=$2",[result,message.id]);return send({ok:true});
      }
      if(action==='search'&&req.method==='POST'){return send(await ai.search(text(body.query,500)));}
      if(action==='events'&&req.method==='POST') {
        if(!['touch','dwell','scan','voice','keyboard'].includes(body.method)||!['selected','confirmed','cancelled'].includes(body.action)||!Number.isInteger(body.durationMs)||body.durationMs<0||body.durationMs>600000)throw new HttpError(400,'Invalid interaction event');
        await q('INSERT INTO interaction_events(session_id,method,action,duration_ms) VALUES($1,$2,$3,$4)',[id,body.method,body.action,body.durationMs]);return send({ok:true});
      }
      authorize(auth,id,true);
      if(action==='analytics'&&req.method==='GET')return send(await q("SELECT method,count(*)::int AS interactions,count(*) FILTER(WHERE action='confirmed')::int AS confirmed,round(avg(duration_ms))::int AS average_ms FROM interaction_events WHERE session_id=$1 GROUP BY method",[id]));
      if(action==='insights'&&req.method==='POST') {
        let prescription;
        if(body.file){if(!['image/png','image/jpeg','application/pdf'].includes(body.file.mimeType)||typeof body.file.data!=='string'||body.file.data.length>7000000||! /^[A-Za-z0-9+/]+={0,2}$/.test(body.file.data))throw new HttpError(400,'Use PNG, JPEG or PDF, at most 5 MB');prescription={inlineData:{mimeType:body.file.mimeType,data:body.file.data}};}
        const history=await q('SELECT role,body FROM messages WHERE session_id=$1 ORDER BY id DESC LIMIT 50',[id]);history.reverse();
        const refs=await ai.search(history.at(-1)?.body||'patient communication preferences');
        const result=await ai.analyze({notes:session.notes,history,verifiedContext:refs},prescription);const insightId=randomUUID();
        await q('INSERT INTO insights(id,session_id,kind,body) VALUES($1,$2,$3,$4)',[insightId,id,prescription?'prescription':'conversation',result]);return send({id:insightId});
      }
      if(action==='review'&&req.method==='POST') {
        if(!['approved','rejected'].includes(body.status))throw new HttpError(400,'Invalid review');
        const result=await one("UPDATE insights SET status=$1,reviewed_by='clinician',reviewed_at=now() WHERE id=$2 AND session_id=$3 AND status='pending' RETURNING id",[body.status,uuid(body.id),id]);if(!result)throw new HttpError(409,'Draft already reviewed or not found');return send({ok:true});
      }
      throw new HttpError(404,'Not found');
    }catch(error){if(!res.headersSent)send({error:error instanceof HttpError?error.message:'Service unavailable. Check server configuration and retry.'},error.status||503);else res.end();}
  });
}
