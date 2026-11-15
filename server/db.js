export async function database(env=process.env) {
  if(!env.DATABASE_URL) return {query:async()=>{throw new Error('Database is not configured');},end:async()=>{}};
  const {default:pg}=await import('pg');
  const url=new URL(env.DATABASE_URL);
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(key);
  return new pg.Pool({connectionString:url.toString(),ssl:{rejectUnauthorized:true,...(env.DATABASE_CA?{ca:env.DATABASE_CA.replaceAll('\\n','\n')}:{})},max:10,connectionTimeoutMillis:8000,statement_timeout:15000});
}
