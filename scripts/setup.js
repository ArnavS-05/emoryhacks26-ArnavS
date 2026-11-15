import {readFile} from 'node:fs/promises';
import {database} from '../server/db.js';
import {services} from '../server/services.js';
const required=['DATABASE_URL','GEMINI_API_KEY','TYPESENSE_HOST','TYPESENSE_ADMIN_KEY'];
if(required.some(k=>!process.env[k])){console.error('Missing configuration: '+required.filter(k=>!process.env[k]).join(', '));process.exit(1);}
const db=await database();const ai=services();
try {
 await db.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
 const schema={name:ai.collection,fields:[{name:'title',type:'string'},{name:'text',type:'string'},{name:'kind',type:'string',facet:true},{name:'verified',type:'bool',facet:true},{name:'source_url',type:'string'},{name:'reviewed_at',type:'string'},{name:'embedding',type:'float[]',num_dim:768}]};
 const collections=await ai.typesense('/collections');
 if(!collections.some(c=>c.name===ai.collection))await ai.typesense('/collections','POST',schema);
 const docs=JSON.parse(await readFile(new URL('../data/context.json',import.meta.url),'utf8'));
 for(const doc of docs){const embedding=await ai.embed(doc.title+' '+doc.text,'RETRIEVAL_DOCUMENT');await ai.typesense(`/collections/${encodeURIComponent(ai.collection)}/documents?action=upsert`,'POST',{...doc,embedding});}
 console.log(`Schema ready; ${docs.length} source-backed context and communication entries indexed.`);
}catch{console.error('Setup failed. Check service configuration, permissions, model availability and connectivity. No credentials were logged.');process.exitCode=1;}finally{await db.end();}
