import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to anon,authenticated,service_role;
grant select on auth.users to authenticated;
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
create publication supabase_realtime;`);
const folder=new URL('../supabase/migrations/',import.meta.url);
for(const name of (await readdir(folder)).sort()) {
 await db.exec(await readFile(new URL(name,folder),'utf8'));
 console.log('Applied',name);
}
const a='00000000-0000-0000-0000-000000000001', b='00000000-0000-0000-0000-000000000002';
await db.query(`insert into auth.users values ($1,'owner@example.test'),($2,'member@example.test')`,[a,b]);
async function asUser(user,fn){
 await db.exec('set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
 try{return await fn()} finally {await db.exec('reset role')}
}
async function rpc(name,args){return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result}
const org=await asUser(a,()=>rpc('create_org',['Test','Test']));
const other=await asUser(b,()=>rpc('create_org',['Other','Other']));
await db.query("insert into org_members(org_id,user_id,role) values($1,$2,'member')",[org,b]);
let checks=0;
async function check(name,fn){await fn(); console.log('PASS',name);checks++}
async function rejects(fn,pattern){await assert.rejects(fn,pattern)}
async function stage(rows){return asUser(a,async()=>{
 const id=await rpc('begin_parcel_import',[org,rows.length]);
 for(let offset=0;offset<rows.length;offset+=500)await rpc('append_parcel_import',[id,offset,JSON.stringify(rows.slice(offset,offset+500))]);
 return id;
})}
await check('owner cannot self-upgrade',()=>asUser(a,()=>rejects(()=>db.query("update orgs set plan='franchise' where id=$1",[org]),/permission denied/)));
await check('owner may rename workspace',()=>asUser(a,()=>db.query("update orgs set name='Renamed' where id=$1",[org])));
await check('member cannot stage imports',()=>asUser(b,()=>rejects(()=>rpc('begin_parcel_import',[org,1]),/admin required/)));
const first=await stage([{parcel_number:'A',address:'1 Main'},{parcel_number:'B',address:'2 Main'}]);
await check('initial import commits',()=>asUser(a,async()=>assert.equal(await rpc('commit_parcel_import',[first]),2)));
let parcel=(await db.query("select id from parcels where parcel_number='A'")).rows[0].id;
await asUser(a,()=>rpc('patch_prospect',[org,parcel,JSON.stringify({notes:'Keep this',status:'Meeting'}),'']));
await check('member cannot delete parcels',()=>asUser(b,async()=>assert.equal((await db.query('delete from parcels where org_id=$1 returning id',[org])).rows.length,0)));
await check('member cannot move a parcel to another tenant',()=>asUser(b,()=>rejects(()=>db.query('update parcels set org_id=$1 where id=$2',[other,parcel]),/permission denied/)));
await check('cross-tenant pipeline patch rejected',()=>asUser(b,()=>rejects(()=>rpc('patch_prospect',[other,parcel,'{}']),/parcel unavailable/)));
await check('cross-tenant outcome rejected',()=>asUser(b,()=>rejects(()=>db.query(`insert into job_outcomes(org_id,parcel_id,service_mode,estimated_price,actual_price) values($1,$2,'commercial',100,100)`,[other,parcel]),/foreign key/)));
await check('notes conflict rejected',()=>asUser(a,()=>rejects(()=>rpc('patch_prospect',[org,parcel,'{"notes":"Stale"}','']),/Notes changed/)));
await check('status update preserves current notes',()=>asUser(b,async()=>{
 await rpc('patch_prospect',[org,parcel,'{"status":"Won"}']);
 assert.equal((await db.query('select notes from prospect_state where parcel_id=$1',[parcel])).rows[0].notes,'Keep this');
}));
const incomplete=await asUser(a,()=>rpc('begin_parcel_import',[org,501]));
await asUser(a,()=>rpc('append_parcel_import',[incomplete,0,JSON.stringify(Array.from({length:500},(_,i)=>({address:'X'+i})))]));
await check('partial upload cannot replace live data',()=>asUser(a,async()=>{
 await rejects(()=>rpc('commit_parcel_import',[incomplete]),/incomplete/);
 assert.equal((await db.query('select count(*)::int n from parcels where org_id=$1',[org])).rows[0].n,2);
}));
const invalid=await stage([{parcel_number:'A',address:''}]);
await check('invalid commit rolls back',()=>asUser(a,async()=>{
 await rejects(()=>rpc('commit_parcel_import',[invalid]),/address/);
 assert.equal((await db.query('select notes from prospect_state where parcel_id=$1',[parcel])).rows[0].notes,'Keep this');
}));
const replacement=await stage([{parcel_number:'A',address:'1 Updated'},{parcel_number:'C',address:'3 Main'}]);
await check('replacement preserves matching IDs and live pipeline',()=>asUser(a,async()=>{
 await rpc('commit_parcel_import',[replacement]);
 const row=(await db.query("select p.id,s.notes,s.status from parcels p join prospect_state s on s.parcel_id=p.id where p.parcel_number='A'")).rows[0];
 assert.equal(row.id,parcel);assert.equal(row.notes,'Keep this');assert.equal(row.status,'Won');
 assert.equal((await db.query("select count(*)::int n from parcels where parcel_number='B'")).rows[0].n,0);
}));
await check('commit retry is idempotent',()=>asUser(a,async()=>assert.equal(await rpc('commit_parcel_import',[replacement]),2)));
await check('authenticated owner cannot invoke billing RPC',()=>asUser(a,()=>rejects(()=>rpc('claim_billing_checkout',[org]),/permission denied/)));
await db.query("update orgs set stripe_customer_id='cus_test' where id=$1",[org]);
await check('checkout lease excludes concurrent checkout',async()=>{
 const token=await rpc('claim_billing_checkout',[org]);assert.ok(token);
 assert.equal(await rpc('claim_billing_checkout',[org]),null);
 await rpc('release_billing_checkout',[org,token,null]); assert.ok(await rpc('claim_billing_checkout',[org]));
});
await check('billing events are idempotent and reject stale downgrades',async()=>{
 await rpc('apply_billing_event',['evt_1',100,org,'cus_test','sub_new','crew']);
 await rpc('apply_billing_event',['evt_old',90,org,'cus_test','sub_old','trial']);
 await rpc('apply_billing_event',['evt_1',100,org,'cus_test','sub_new','trial']);
 assert.equal((await db.query('select plan from orgs where id=$1',[org])).rows[0].plan,'crew');
});
await check('old subscription cancellation cannot remove newer plan',async()=>{
 await rpc('apply_billing_event',['evt_cancel_old',110,org,'cus_test','sub_old','trial']);
 assert.equal((await db.query('select plan from orgs where id=$1',[org])).rows[0].plan,'crew');
});
await check('billing customer mismatch rejected',()=>rejects(()=>rpc('apply_billing_event',['evt_bad',120,org,'cus_wrong','sub_new','solo']),/customer mismatch/));
await check('ordinary owner cannot bypass invite limit via insert',()=>asUser(a,()=>rejects(()=>db.query("insert into org_invites(org_id,email) values($1,'x@example.test')",[org]),/permission denied/)));
console.log(`All ${checks} PostgreSQL safety checks passed.`);
await db.close();
