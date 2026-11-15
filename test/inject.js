import {Readable} from 'node:stream';
// Exercise Node's registered HTTP request handler without opening a TCP socket.
export async function inject(server,path,{body,cookie,origin}={}) {
 const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);
 req.url=path;req.method=body?'POST':'GET';req.socket={remoteAddress:'127.0.0.1'};
 req.headers={...(origin?{origin}:{}),...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})};
 return new Promise((resolve,reject)=>{
   const headers={};const res={statusCode:200,headersSent:false,setHeader(k,v){headers[k.toLowerCase()]=v;},writeHead(status,values){this.statusCode=status;Object.entries(values).forEach(([k,v])=>this.setHeader(k,v));this.headersSent=true;},end(value=''){const raw=value.toString();let data;try{data=JSON.parse(raw);}catch{data=raw;}resolve({status:this.statusCode,data,headers,cookie:headers['set-cookie']?.split(';')[0]});}};
   try{server.emit('request',req,res);}catch(e){reject(e);}
 });
}
