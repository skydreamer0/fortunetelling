import {expect,test} from 'vitest';
import {createLifeEventStore} from '../src/lib/lifeEvents';
import {createLifeEventSession} from '../src/lib/lifeEventSession';
const event=(id:string)=>({id,date:'2026-06',category:'other' as const,domains:['career' as const],confidence:'certain' as const});
function fixture(data:unknown){let value=JSON.stringify(data);let denied=false;let readsDenied=false;let writes=0;const storage={getItem:()=>{if(readsDenied)throw Error('read');return value;},setItem:(_k:string,v:string)=>{if(denied)throw Error('quota');writes++;value=v;},removeItem:()=>{if(denied)throw Error('quota');writes++;value='';}};return {store:createLifeEventStore(storage),raw:()=>value,deny:(x:boolean)=>denied=x,denyRead:(x:boolean)=>readsDenied=x,writes:()=>writes};}
test('automatic migration must not discard opaque source/target profile metadata',()=>{
 const f=fixture({version:1,profiles:{old:{events:[event('old')],extra:{opaque:'source'}},new:{events:[event('new')],extra:{opaque:'target'}}}});
 const raw=f.raw(); const ok=f.store.migrate('old','new');
 if(!ok){expect(f.raw()).toBe(raw);return;}
 expect(f.raw()).toContain('source');expect(f.raw()).toContain('target');
});
test('automatic migration exceeding capacity must refuse rather than lose stored events',()=>{
 const f=fixture({version:1,profiles:{old:{events:[event('old1'),event('old2')]},new:{events:Array.from({length:199},(_,i)=>event('new'+i))}}});
 const raw=f.raw();expect(f.store.migrate('old','new')).toBe(false);expect(f.raw()).toBe(raw);
});
test('explicit one-id removal cannot drop extra stored valid events past display cap',()=>{
 const f=fixture({version:1,profiles:{p:{events:Array.from({length:201},(_,i)=>event('event-'+i.toString().padStart(3,'0')))}}});
 const raw=f.raw();const ok=f.store.remove('p','event-000');
 if(!ok){expect(f.raw()).toBe(raw);return;}
 expect(JSON.parse(f.raw()).profiles.p.events).toHaveLength(200);
 expect(JSON.parse(f.raw()).profiles.p.events.at(-1).id).toBe('event-200');
});
test('readable invalid containers block mutations and preserve original bytes',()=>{
 for(const profiles of [[],{p:null},{p:{events:{}}}]){const f=fixture({version:1,profiles});const raw=f.raw();expect(f.store.upsert('p',event('x'))).toBe(false);expect(f.store.clearProfile('p')).toBe(false);expect(f.raw()).toBe(raw);expect(f.writes()).toBe(0);}
});
test('read denial then recovery preserves stored and transient records across fresh reopen',()=>{
 const f=fixture({version:1,profiles:{p:{events:[event('saved')]},q:{events:[event('q')]}}});
 f.denyRead(true);const s=createLifeEventSession(f.store,'p');expect(s.submit(event('new'))).toBe('pending');f.denyRead(false);expect(s.retry()).toBe(true);expect(s.list().map(e=>e.id)).toEqual(['new','saved']);expect(f.store.list('q').map(e=>e.id)).toEqual(['q']);
});

test('boundary migration accepts all 200 unique records, preserving raw per-event fields',()=>{
 const extra={...event('old'), extra:{keep:true}};
 const f=fixture({version:1,profiles:{old:{events:[extra]},new:{events:Array.from({length:199},(_,i)=>event('new'+i))}}});
 expect(f.store.migrate('old','new')).toBe(true);
 const data=JSON.parse(f.raw());expect(data.profiles.old).toBeUndefined();expect(data.profiles.new.events).toHaveLength(200);
 expect(data.profiles.new.events.find((e:any)=>e.id==='old')).toEqual(extra);
});
test('one-id removal retains malformed and opaque survivors and empty-profile metadata',()=>{
 const opaque={...event('keep'), schemaVersion:99, metadata:{keep:true}};
 const f=fixture({version:1,root:'keep',profiles:{p:{events:[event('remove'),null,opaque],metadata:'keep'}}});
 expect(f.store.remove('p','remove')).toBe(true);
 expect(JSON.parse(f.raw()).profiles.p).toEqual({events:[null,opaque],metadata:'keep'});
 const empty=fixture({version:1,profiles:{p:{events:[event('remove')],metadata:'keep'}}});
 expect(empty.store.remove('p','remove')).toBe(true);expect(JSON.parse(empty.raw()).profiles.p).toEqual({events:[],metadata:'keep'});
});
