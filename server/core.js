import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export function same(a, b) {return timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));}
export class HttpError extends Error {constructor(status, message) {super(message); this.status = status;}}
export function text(value, max=4000) {if(typeof value !== 'string' || !value.trim() || value.length > max) throw new HttpError(400, 'Invalid or missing text'); return value.trim();}
export function uuid(value) {if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '')) throw new HttpError(400,'Invalid identifier'); return value;}
export const languages = ['English','Spanish','Hindi','French','Mandarin','Arabic'];
export function language(value) {if(!languages.includes(value)) throw new HttpError(400,'Unsupported language'); return value;}
export function settings(value) {
  if(!value || typeof value !== 'object') throw new HttpError(400,'Invalid settings');
  if(!['touch','dwell','scan','voice'].includes(value.mode)) throw new HttpError(400,'Invalid control mode');
  if(!Number.isInteger(value.dwellMs)||value.dwellMs<600||value.dwellMs>5000) throw new HttpError(400,'Dwell must be 600–5000 ms');
  return {mode:value.mode,dwellMs:value.dwellMs,speak:!!value.speak,largeText:!!value.largeText};
}
export function authorize(auth, session, clinicianOnly=false) {
  if(!auth) throw new HttpError(401,'Sign in or pair this device');
  if(clinicianOnly && auth.role!=='clinician') throw new HttpError(403,'Clinician access required');
  if(auth.role==='patient' && auth.session_id!==session) throw new HttpError(403,'This device belongs to another session');
}
