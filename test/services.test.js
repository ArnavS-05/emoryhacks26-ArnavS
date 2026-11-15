import test from 'node:test';
import assert from 'node:assert/strict';
import {services} from '../server/services.js';
const env={GEMINI_API_KEY:'test-key',TYPESENSE_HOST:'test.typesense.net',TYPESENSE_ADMIN_KEY:'test-admin'};
test('hybrid retrieval sends normalized embeddings plus keyword query and verified filter',async()=>{
 const calls=[];const ai=services(env,async(url,options)=>{calls.push({url,options,body:JSON.parse(options.body)});return new Response(JSON.stringify(calls.length===1?{embedding:{values:Array(768).fill(1)}}:{results:[{hits:[{document:{id:'verified'}}]}]}));});
 assert.deepEqual(await ai.search('pain'),[{id:'verified'}]);assert.equal(calls[0].options.headers['x-goog-api-key'],'test-key');assert.equal(calls[1].body.searches[0].q,'pain');assert.equal(calls[1].body.searches[0].filter_by,'verified:=true');assert.match(calls[1].body.searches[0].vector_query,/alpha:0.5/);assert.equal(calls[1].body.searches[0].query_by,'title,text');
});
test('provider failures do not leak response bodies or return invented results',async()=>{const ai=services(env,async()=>new Response('SECRET upstream diagnostic',{status:401}));await assert.rejects(()=>ai.translate('hello','Spanish'),e=>e.status===503&&!e.message.includes('SECRET'));});
test('prescriptions use inline multimodal content and a clinician-review instruction',async()=>{let payload;const ai=services(env,async(_,options)=>{payload=JSON.parse(options.body);return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'DRAFT'}]}}]}));});assert.equal(await ai.analyze({history:[]},{inlineData:{mimeType:'image/png',data:'AA=='}}),'DRAFT');assert.equal(payload.contents[0].parts[1].inlineData.mimeType,'image/png');assert.match(payload.systemInstruction.parts[0].text,/do not infer/);});
test('empty model output and invalid embedding vectors fail explicitly',async()=>{const ai=services(env,async()=>new Response('{}'));await assert.rejects(()=>ai.translate('hello','Hindi'),{status:503});await assert.rejects(()=>ai.embed('hello'),{status:503});});
test('missing keys fail closed',async()=>{await assert.rejects(()=>services({}).translate('hello','Spanish'),{status:503});await assert.rejects(()=>services({}).typesense('/health'),{status:503});});
