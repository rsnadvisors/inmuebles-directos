#!/usr/bin/env python3
"""Actual loopback REST + Storage proof for durable publication, synthetic only.

The harness refuses remote URLs, linked projects, non-loopback service bindings,
an occupied fresh database, and the absence of its synthetic-only test key.
No credential, JWT, proof, application row or binary is printed in evidence.
"""
import base64, concurrent.futures, hashlib, hmac, json, os, pathlib, subprocess, threading, time, urllib.error, urllib.request, uuid
import http.client as http_client
import publication_boundary_lab as lab

ROOT=pathlib.Path(__file__).resolve().parents[2]
WORK=pathlib.Path(os.environ['PUBLICATION_TEST_EVIDENCE_DIR']).resolve()
lab.assert_ci_context()
lab.assert_work(WORK)
KEY=os.environ['PUBLICATION_TEST_HMAC_KEY']; assert len(KEY)==64
lab.SECRETS.append(KEY)
ROWS=[]
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; G='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
def record(name,ok,**evidence):
    ROWS.append({'check':name,'result':'PASS' if ok else 'FAIL',**evidence})
    (WORK/'security-results.json').write_text(json.dumps(ROWS,indent=2))
    assert ok,name
def admin(s): return lab.sql(s).strip()
def enc(b): return base64.urlsafe_b64encode(b).rstrip(b'=').decode()
ST=lab.config(lab.STORAGE); RT=lab.config(lab.REST)
for c,port,internal in [(ST,lab.STORAGE_PORT,5000),(RT,lab.REST_PORT,3000)]:
    assert c['Config']['Labels'].get('inmuebles.publication-lab')==lab.RUN
    assert c['NetworkSettings']['Ports'][str(internal)+'/tcp']==[{'HostIp':'127.0.0.1','HostPort':str(port)}]
    for e in c['Config']['Env']: assert '.supabase.co' not in e.lower()
env=dict(e.split('=',1) for e in ST['Config']['Env'] if '=' in e)
assert lab.DB in env['DATABASE_URL']
JWT_SECRET=env.get('JWT_SECRET') or env.get('AUTH_JWT_SECRET'); ANON=env.get('ANON_KEY'); assert JWT_SECRET and ANON
lab.SECRETS.extend([JWT_SECRET,ANON])
def token(uid=A):
    if uid is None: return ANON
    msg=enc(b'{"alg":"HS256","typ":"JWT"}')+'.'+enc(json.dumps({'sub':uid,'role':'authenticated','aud':'authenticated','iat':int(time.time()),'exp':int(time.time())+1800}).encode())
    return msg+'.'+enc(hmac.new(JWT_SECRET.encode(),msg.encode(),hashlib.sha256).digest())
def http(method,path,uid=A,body=None,mime='application/json',storage=False,headers=None):
    port=lab.STORAGE_PORT if storage else lab.REST_PORT
    url='http://127.0.0.1:'+str(port)+'/'+path
    assert url.startswith('http://127.0.0.1:')
    h={'Authorization':'Bearer '+token(uid),'apikey':ANON,'Content-Type':mime}; h.update(headers or {})
    connection=http_client.HTTPConnection('127.0.0.1',port,timeout=30)
    try:
        try: connection.request(method,'/'+path,body=body,headers=h)
        except BrokenPipeError: pass  # server can reject Content-Length before reading all bytes
        response=connection.getresponse()
        return response.status,response.read()
    finally: connection.close()
def proof(uid,rid,fp,purpose,**details):
    e={**details,'uid':uid,'request_id':rid,'fingerprint':fp,'version':1,'audience':'inmuebles-publication','purpose':purpose,'key_id':'synthetic-lab','issued_at':int(time.time()),'expires_at':int(time.time())+300}
    text=json.dumps(e,ensure_ascii=False,separators=(',',':'))
    return {'p_envelope':text,'p_mac':hmac.new(bytes.fromhex(KEY),text.encode(),hashlib.sha256).hexdigest()}
def rpc(name,p,uid=A):
    status,body=http('POST','rpc/'+name,uid,json.dumps(p).encode())
    try: data=json.loads(body)
    except ValueError: data=None
    return status,data
def expect_rpc(name,p,uid=A):
    status,data=rpc(name,p,uid)
    if status!=200: raise AssertionError(name+' failed HTTP '+str(status))
    return data
def fields():
    return {'title':'Synthetic QA Perú','description':'Synthetic test only','address':'Synthetic address','district':None,
      'city':'Synthetic city','region':'Synthetic region','contact_phone':'+51900000001','listing_type':'sale','property_type':'house',
      'price':1,'currency':'PEN','area_total_m2':None,'area_built_m2':None,'bedrooms':None,'bathrooms':None,'parking_spaces':0,'floors':0,'maintenance_fee':0,'lat':-5,'lng':-80}
def make(uid=A,n=1,content=PNG):
    rid=str(uuid.uuid4()); f=fields(); digest=hashlib.sha256(content).hexdigest()
    images=[{'type':'image/png','digest':digest} for _ in range(n)]
    fp=hashlib.sha256(json.dumps({'fields':f,'images':images},ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
    manifest=[{'imageId':str(uuid.uuid4()),'mime':'image/png','size':len(content),'digest':digest} for _ in range(n)]
    p=proof(uid,rid,fp,'prepare',fields=f,manifest=manifest)
    return rid,fp,p
def prepare(uid=A,n=1,content=PNG):
    rid,fp,p=make(uid,n,content); plan=expect_rpc('prepare_publication_attempt',p,uid)
    return plan,p
def inspect(plan,uid=A):
    return expect_rpc('reconcile_publication_attempt',proof(uid,plan['requestId'],plan['fingerprint'],'reconcile',action='inspect',revision=0),uid)
def begin(plan,uid=A):
    return expect_rpc('reconcile_publication_attempt',proof(uid,plan['requestId'],plan['fingerprint'],'reconcile',action='begin_cancel',revision=plan['revision']),uid)
def close(plan,uid=A):
    return rpc('reconcile_publication_attempt',proof(uid,plan['requestId'],plan['fingerprint'],'reconcile',action='close_cancel',revision=plan['revision'],cleanup_confirmed=True),uid)
def upload(plan,index=0,uid=A,content=PNG,headers=None,mime='image/png',path=None):
    return http('POST','object/property-images-private/'+(path or plan['slots'][index]['path']),uid,content,mime,True,headers)
def remove(plan,uid=A):
    return http('DELETE','object/property-images-private',uid,json.dumps({'prefixes':[s['path'] for s in plan['slots']]}).encode(),storage=True)
def cancel(plan,uid=A):
    frozen=begin(inspect(plan,uid),uid); status,_=remove(frozen,uid); assert status==200
    status,done=close(frozen,uid); assert status==200; return done
def finalize(plan,uid=A):
    return rpc('finalize_publication_attempt',proof(uid,plan['requestId'],plan['fingerprint'],'finalize',revision=plan['revision']),uid)
def deny_http(name,status): record(name,400<=status<500,http=status)
def sql_client(s,uid=A):
    guard="DO $$ BEGIN IF current_database()<>'"+lab.DB+"' THEN RAISE EXCEPTION 'Target mismatch'; END IF; END $$;"
    lab.sql('select 1;')  # Also verify the synthetic database ownership marker.
    p=subprocess.run(['docker','exec','-i',lab.CONTAINER,'psql','-X','-U','postgres','-d',lab.DB,'-Atq','-v','ON_ERROR_STOP=1'],input=guard+"begin; set local role authenticated; set local request.jwt.claim.sub='"+uid+"'; "+s+'; rollback;',text=True,capture_output=True,env=lab.PROCESS_ENV,timeout=30)
    return p.returncode,p.stdout.strip()

def server_code(phase):
    """Execute the actual TS boundary and SDK; only URL routing is adapted.

    No Next server, browser, Auth mock or RPC/Storage response mock is involved.
    The server-only marker is stubbed solely for this server-side Node process.
    """
    script=r'''
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const data = JSON.parse(fs.readFileSync(0, 'utf8'));
const rootRequire = createRequire(path.join(data.root, 'package.json'));
const ts = rootRequire('typescript');
const out = path.join(data.work, 'server-code-' + data.phase);
fs.mkdirSync(out, { recursive: false });
fs.mkdirSync(path.join(out, 'node_modules/server-only'), { recursive: true });
fs.writeFileSync(path.join(out, 'node_modules/server-only/index.js'), '', { flag: 'wx' });
for (const name of ['publication-boundary-server', 'publication', 'contact-phone', 'property-images', 'property-image-source']) {
  const source = fs.readFileSync(path.join(data.root, 'app/lib', name + '.ts'), 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    sourceMap: false, declaration: false, incremental: false
  }});
  fs.writeFileSync(path.join(out, name + '.js'), result.outputText, { flag: 'wx' });
}
const sdk = rootRequire('@supabase/supabase-js');
const boundary = require(path.join(out, 'publication-boundary-server.js'));
function client(jwt) {
  return sdk.createClient('http://127.0.0.1:' + data.rest, data.anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: 'Bearer ' + jwt }, fetch: async (input, init) => {
      const url = new URL(input.toString());
      assert.equal(url.hostname, '127.0.0.1');
      assert.equal(url.port, String(data.rest));
      assert.equal(url.protocol, 'http:');
      assert.equal(url.username + url.password, '');
      if (url.pathname.startsWith('/rest/v1/')) url.pathname = url.pathname.slice('/rest/v1'.length);
      else if (url.pathname.startsWith('/storage/v1/')) {
        url.pathname = url.pathname.slice('/storage/v1'.length); url.port = String(data.storage);
      } else throw new Error('Non-laboratory SDK route refused');
      return fetch(url, { ...init, redirect: 'error' });
    }}
  });
}
(async () => {
  const a = client(data.ownerToken), b = client(data.otherToken);
  const file = new File([Buffer.from(data.png, 'base64')], 'synthetic.png', { type: 'image/png' });
  const input = { ...data.fields, files: [file] };
  const id = require('node:crypto').randomUUID();
  const plan = await boundary.preparePublication(a, data.owner, id, input);
  const replay = await boundary.preparePublication(a, data.owner, id, input);
  assert.deepEqual(replay.slots, plan.slots);
  await assert.rejects(() => boundary.inspectPublication(b, data.other, id), e => e.code === 'PUBLICATION_NOT_FOUND');
  const upload = await a.storage.from('property-images-private').upload(plan.slots[0].path, file, { upsert: false });
  assert.equal(upload.error, null);
  const observed = await boundary.inspectPublication(a, data.owner, id);
  assert.equal(observed.slots[0].observation, 'PRESENT');
  const done = await boundary.finalizePublication(a, data.owner, observed);
  assert.equal(done.state, 'FINALIZED');
  assert.equal((await boundary.inspectPublication(a, data.owner, id)).state, 'FINALIZED');
  await assert.rejects(() => boundary.cancelPublication(a, data.owner, id, 'cancel'), e => e.code === 'PUBLICATION_ALREADY_FINALIZED');
  const next = require('node:crypto').randomUUID();
  const pending = await boundary.preparePublication(b, data.other, next, input);
  assert.equal((await b.storage.from('property-images-private').upload(pending.slots[0].path, file, { upsert: false })).error, null);
  assert.equal((await boundary.cancelPublication(b, data.other, next, 'reconcile')).state, 'ACTIVE');
  const cancelled = await boundary.cancelPublication(b, data.other, next, 'cancel');
  assert.equal(cancelled.state, 'CANCELLED');
  assert.equal(cancelled.slots[0].state, 'RETIRED');
  assert.equal(cancelled.slots[0].observation, 'ABSENT');
  await assert.rejects(() => boundary.preparePublication(b, data.other, next, input), e => e.code === 'PUBLICATION_CANCELLED');
  process.stdout.write(JSON.stringify({ publication: true, recovery: true, cancellation: true, identity: true, idempotency: true }));
})().catch(() => { process.stderr.write('Actual server boundary integration failed'); process.exitCode = 1; });
'''
    payload={'root':str(ROOT),'work':str(WORK),'phase':phase,'rest':lab.REST_PORT,'storage':lab.STORAGE_PORT,
        'anon':ANON,'owner':A,'other':B,'ownerToken':token(A),'otherToken':token(B),
        'fields':fields(),'png':base64.b64encode(PNG).decode()}
    node_env={**lab.PROCESS_ENV,'NODE_PATH':str(ROOT/'node_modules'),
        'PUBLICATION_BOUNDARY_HMAC_KEY':KEY,'PUBLICATION_BOUNDARY_HMAC_KEY_ID':'synthetic-lab'}
    p=subprocess.run(['node','-e',script],input=json.dumps(payload),env=node_env,text=True,capture_output=True,timeout=120)
    record('actual server module plus '+phase,p.returncode==0)
    observed=json.loads(p.stdout)
    for check in ('publication','recovery','cancellation','identity','idempotency'):
        record('actual server '+phase+' '+check,observed.get(check) is True)

def main():
    record('fresh synthetic database',admin('select current_database();')==lab.DB and admin('select count(*) from auth.users;')=='0')
    record('new Expand applied once before Contract',admin("select count(*) filter (where version='20261004012121'),"
        "count(*) filter (where version='20261004012123') from supabase_migrations.schema_migrations;")=='1|0')
    for uid,label in [(A,'a'),(B,'b'),(G,'agent')]:
        admin("insert into auth.users(id,email,raw_user_meta_data) values ('"+uid+"','"+label+"@publication.example.invalid','{}');")
    admin("update public.profiles set role='agent' where id='"+G+"';")
    # Compatibility window: old draft creation/upload/metadata/finalize still works with Expand.
    rid=str(uuid.uuid4()); f={**fields(),'id':rid,'slug':'legacy-expand-'+rid,'owner_id':A,'agent_id':None,'status':'draft','country':'Peru'}
    status,_=http('POST','properties',A,json.dumps(f).encode()); record('old publisher plus Expand draft creation',status==201,http=status)
    oldpath=A+'/'+rid+'/'+str(uuid.uuid4())+'.png'
    status,_=http('POST','object/property-images-private/'+oldpath,A,PNG,'image/png',True); record('old publisher plus Expand Storage upload',status==200,http=status)
    status,_=http('POST','property_images',A,json.dumps({'property_id':rid,'storage_bucket':'property-images-private','storage_path':oldpath,'public_url':None,'is_cover':True,'sort_order':0}).encode()); record('old publisher plus Expand metadata',status==201,http=status)
    status,_=rpc('finalize_private_property_publication',{'p_property_id':rid}); record('old publisher plus Expand finalize',status==200,http=status)
    # New foundation also works before Contract, alongside the compatibility path.
    p,_=prepare(B); status,_=upload(p,uid=B); assert status==200
    status,published=finalize(inspect(p,B),B); record('new publisher plus Expand',status==200 and published['state']=='FINALIZED')
    server_code('Expand')
    # New Contract must reject even a zero-image legacy draft, atomically.
    legacy=str(uuid.uuid4())
    status,_=http('POST','properties',A,json.dumps({**f,'id':legacy,'slug':'legacy-blocks-'+legacy}).encode())
    record('unresolved legacy draft exists before new Contract',status==201)
    before=lab.catalog_snapshot()
    output=lab.apply_contract(succeeds=False)
    record('new Contract rejects unresolved legacy draft',
        'Legacy drafts require explicit reconciliation before Contract' in output)
    record('rejected new Contract leaves catalogs ACL synthetic rows and history unchanged',lab.catalog_snapshot()==before)
    # Delete only this test's own, image-free fixture through the owner's REST API.
    status,_=http('DELETE','properties?id=eq.'+legacy,A)
    record('explicit synthetic legacy reconciliation',status in (200,204) and
        admin("select count(*) from public.properties where id='"+legacy+"';")=='0')
    lab.apply_contract()
    time.sleep(.5)
    record('Contract applied only in synthetic DB',admin("select count(*) from pg_policies where policyname='publication exact private slot admission';")=='1')
    record('new Contract migration recorded exactly once',admin(
        "select count(*) from supabase_migrations.schema_migrations where version='20261004012123';")=='1')
    server_code('Contract')
    for uid,label in [(A,'owner'),(G,'agent')]:
        direct={**f,'id':str(uuid.uuid4()),'slug':'blocked-'+str(uuid.uuid4()),'owner_id':uid}
        status,_=http('POST','properties',uid,json.dumps(direct).encode()); deny_http(label+' direct draft INSERT denied',status)
        rc,_=sql_client("insert into private.publication_quotas(owner_id) values ('"+uid+"')",uid); record(label+' direct quota DML denied',rc!=0)
        rc,_=sql_client("insert into private.publication_slots(image_id,request_id,owner_id,storage_path,mime,size,digest,sort_order) values ('"+str(uuid.uuid4())+"','"+rid+"','"+uid+"','forged','image/png',1,'"+'0'*64+"',0)",uid); record(label+' direct slot creation denied',rc!=0)
    for oldrpc in ['finalize_private_property_publication','finalize_own_property_publication']:
        status,_=rpc(oldrpc,{'p_property_id':rid}); deny_http('legacy finalizer revoked '+oldrpc,status)
    candidate,binding=prepare(A,5)
    record('atomic five slots and precreated metadata',len(candidate['slots'])==5 and all(s['metadataValid'] for s in candidate['slots']))
    status,_=upload(candidate,path=A+'/'+candidate['requestId']+'/'+str(uuid.uuid4())+'.png'); deny_http('sixth/arbitrary path denied',status)
    status,_=upload(candidate,uid=B); deny_http('cross-owner upload denied',status)
    status,_=upload(candidate,path=A+'/'+str(uuid.uuid4())+'/'+candidate['slots'][0]['imageId']+'.png'); deny_http('cross-property upload denied',status)
    status,_=upload(candidate,mime='image/gif'); deny_http('unsupported MIME denied',status)
    status,_=upload(candidate,content=b'x'*(5242880+1)); deny_http('oversized payload denied',status)
    status,_=finalize(candidate); deny_http('missing objects cannot finalize',status)
    for slot in candidate['slots']:
        status,_=upload(candidate,path=slot['path']); record('exact reserved path upload '+str(slot['sortOrder']),status==200,http=status)
        status,data=http('GET','object/authenticated/property-images-private/'+slot['path'],A,storage=True)
        record('actual committed bytes '+str(slot['sortOrder']),status==200 and data==PNG)
    committed=inspect(candidate); record('Storage commit relationships',all(s['observation']=='PRESENT' and s['metadataValid'] for s in committed['slots']))
    replay=expect_rpc('prepare_publication_attempt',binding); record('retry lost response reuses IDs and paths',replay['slots']==committed['slots'])
    status,_=upload(candidate); deny_http('same-path no-upsert conflict',status)
    status,_=upload(candidate,headers={'x-upsert':'true'}); deny_http('upsert replacement denied',status)
    status,_=http('POST','object/copy',A,json.dumps({'bucketId':'property-images-private','sourceKey':candidate['slots'][0]['path'],'destinationKey':A+'/'+candidate['requestId']+'/'+str(uuid.uuid4())+'.png'}).encode(),storage=True); deny_http('copy cannot mint arbitrary destination',status)
    status,_=http('POST','object/move',A,json.dumps({'bucketId':'property-images-private','sourceKey':candidate['slots'][0]['path'],'destinationKey':A+'/'+candidate['requestId']+'/'+str(uuid.uuid4())+'.png'}).encode(),storage=True); deny_http('move cannot retarget private path',status)
    status,_=http('POST','property_images',A,json.dumps({'property_id':candidate['requestId'],'storage_bucket':'property-images-private','storage_path':candidate['slots'][0]['path'],'public_url':None}).encode()); deny_http('client metadata INSERT denied',status)
    status,_=http('PATCH','property_images?id=eq.'+candidate['slots'][0]['imageId'],G,json.dumps({'storage_path':'forged'}).encode())
    record('foreign agent UPDATE cannot rebind (including zero-row response)',status<500 and admin("select storage_path from public.property_images where id='"+candidate['slots'][0]['imageId']+"';")==candidate['slots'][0]['path'],http=status)
    managed,_=prepare(G)
    status,_=http('PATCH','property_images?id=eq.'+managed['slots'][0]['imageId'],G,json.dumps({'storage_path':'forged'}).encode())
    record('own managed agent cannot rebind prepared metadata',status<500 and admin("select storage_path from public.property_images where id='"+managed['slots'][0]['imageId']+"';")==managed['slots'][0]['path'],http=status)
    cancel(managed,G)
    # Deleting bytes does not release Q, and the SAME authorized path remains retryable.
    status,_=http('DELETE','object/property-images-private',A,json.dumps({'prefixes':[candidate['slots'][0]['path']]}).encode(),storage=True); assert status==200
    missing=inspect(candidate); record('authorized ABSENT does not release slots',missing['slots'][0]['observation']=='ABSENT' and len(missing['slots'])==5)
    status,_=upload(candidate); record('failed/deleted upload same-slot retry',status==200)
    extra=make(A); status,_=rpc('prepare_publication_attempt',extra[2]); deny_http('pending attempt prevents alternative request',status)
    wrong=dict(binding); wrong['p_mac']='0'*64; before=admin('select count(*) from private.publication_attempts;')
    status,_=rpc('prepare_publication_attempt',wrong); deny_http('invalid MAC denied',status)
    record('invalid proof zero partial mutation',admin('select count(*) from private.publication_attempts;')==before)
    # Exact-byte MAC, lifetime and phase bindings are checked inside the DB,
    # independently of the application signer and the exposed RPC facade.
    for label,change in [('wrong audience',{'audience':'other'}),('wrong purpose',{'purpose':'finalize'}),
        ('expired proof',{'issued_at':int(time.time())-900,'expires_at':int(time.time())-600}),
        ('excessive lifetime',{'expires_at':int(time.time())+1000}),('wrong key id',{'key_id':'other'})]:
        altered=json.loads(binding['p_envelope']); altered.update(change)
        raw=json.dumps(altered,ensure_ascii=False,separators=(',',':'))
        signed={'p_envelope':raw,'p_mac':hmac.new(bytes.fromhex(KEY),raw.encode(),hashlib.sha256).hexdigest()}
        status,_=rpc('prepare_publication_attempt',signed); deny_http(label+' independently denied',status)
    whitespace={**binding,'p_envelope':binding['p_envelope']+' '}
    status,_=rpc('prepare_publication_attempt',whitespace); deny_http('MAC rejects altered exact UTF-8 bytes',status)
    record('invalid binding matrix creates no partial mutation',admin('select count(*) from private.publication_attempts;')==before)
    status,_=rpc('finalize_publication_attempt',{'p_envelope':'{}','p_mac':'0'*64}); deny_http('direct finalization without server proof denied',status)
    status,_=rpc('reconcile_publication_attempt',{'p_envelope':'{}','p_mac':'0'*64}); deny_http('direct quota release without proof denied',status)
    status,_=rpc('reconcile_publication_attempt',proof(B,candidate['requestId'],candidate['fingerprint'],'reconcile',action='inspect',revision=0),B); deny_http('cross-owner reconciliation denied',status)
    status,_=http('GET','object/authenticated/property-images-private/'+candidate['slots'][0]['path'],None,storage=True); deny_http('anonymous draft bytes denied',status)
    status,done=finalize(inspect(candidate)); record('legitimate full finalization',status==200 and done['state']=='FINALIZED' and all(s['state']=='FINALIZED' for s in done['slots']))
    record('null zero and contact preserved',admin("select contact_phone||':'||parking_spaces||':'||floors||':'||maintenance_fee from public.properties where id='"+candidate['requestId']+"';")=='+51900000001:0:0:0')
    status,data=http('GET','object/authenticated/property-images-private/'+candidate['slots'][0]['path'],None,storage=True); record('published private delivery retained',status==200 and data==PNG)
    status,_=upload(candidate); deny_http('post-finalization upload denied',status)
    status,_=rpc('reconcile_publication_attempt',proof(A,done['requestId'],done['fingerprint'],'reconcile',action='begin_cancel',revision=done['revision'])); deny_http('published cannot cancel',status)
    record('finalized releases P but retains Q',admin("select count(*) from private.publication_slots where request_id='"+done['requestId']+"';")=='5')
    lifecycle,_=prepare(A)
    status,_=upload(lifecycle); record('cancellation fixture has real committed bytes',status==200)
    frozen=begin(lifecycle)
    record('cancel freezes all slots and retains pending quota',frozen['state']=='CANCEL_PENDING' and all(s['state']=='RETIRED' for s in frozen['slots']))
    status,_=upload(lifecycle); deny_http('tombstone denies new admission',status)
    status,_=rpc('prepare_publication_attempt',make(A)[2]); deny_http('CANCEL_PENDING still consumes P',status)
    badclose=proof(A,frozen['requestId'],frozen['fingerprint'],'reconcile',action='close_cancel',revision=frozen['revision'],cleanup_confirmed=False)
    status,_=rpc('reconcile_publication_attempt',badclose); deny_http('unconfirmed cleanup never releases P',status)
    status,_=close(frozen); deny_http('claimed cleanup cannot release while exact bytes exist',status)
    record('failed cleanup retains actual pending quota and retired slot',inspect(frozen)['state']=='CANCEL_PENDING'
      and admin("select count(*) from private.publication_slots where request_id='"+frozen['requestId']+"';")=='1')
    status,_=remove(frozen); assert status==200
    status,cancelled=close(frozen); record('confirmed absence closes whole attempt',status==200 and cancelled['state']=='CANCELLED')
    status,_=upload(cancelled); deny_http('terminal tombstone stays denied',status)
    status,_=rpc('prepare_publication_attempt',proof(A,cancelled['requestId'],cancelled['fingerprint'],'prepare',fields=fields(),manifest=[{'imageId':cancelled['slots'][0]['imageId'],'mime':'image/png','size':len(PNG),'digest':hashlib.sha256(PNG).hexdigest()}])); deny_http('cancelled request never reactivates',status)
    record('cancellation lifetime Q retained',admin("select count(*) from private.publication_slots where request_id='"+cancelled['requestId']+"';")=='1')
    # Two distinct requests race for one owner quota; database locking, not application count.
    jobs=[make(A),make(A)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda j:rpc('prepare_publication_attempt',j[2]),jobs))
    record('concurrent prepare cannot overflow pending quota',sorted(s for s,_ in results)==[200,409] or (sum(s==200 for s,_ in results)==1 and all(s in (200,400,409) for s,_ in results)),http=[s for s,_ in results])
    winner=next(p for s,p in results if s==200)
    record('quota race actual persisted P is one',admin("select count(*) from private.publication_attempts where owner_id='"+A+"' and state in ('ACTIVE','CANCEL_PENDING');")=='1')
    # Delete public rows: replay must not recreate metadata/draft and slot reservation survives.
    status,_=http('DELETE','properties?id=eq.'+winner['requestId'],A); record('owner public draft deletion remains allowed',status in (200,204))
    replay=expect_rpc('prepare_publication_attempt',jobs[next(i for i,r in enumerate(results) if r[0]==200)][2]); record('deleted parent replay does not recreate',not replay['parentValid'] and not any(s['metadataValid'] for s in replay['slots']))
    status,_=finalize(replay); deny_http('deleted parent cannot finalize',status)
    cancel(replay)
    # Actual in-flight transfer: pause once a synthetic backend file proves admission.
    race_test()
    # ACL / private-key isolation and immutable trigger policies.
    for target in ['private.publication_attempts','private.publication_slots','private.publication_quotas','vault.decrypted_secrets']:
        rc,_=sql_client('select * from '+target); record('direct private read denied '+target,rc!=0)
    record('new helpers have empty search_path',admin("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'publication_%' and not coalesce(p.proconfig @> array['search_path=\"\"'],false);")=='0')
    record('no anonymous function grants',admin("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname like '%publication%' and n.nspname in ('private','public') and has_function_privilege('anon',p.oid,'EXECUTE');")=='0')
    counts={result:sum(r['result']==result for r in ROWS) for result in ('PASS','FAIL','NOT REPRODUCIBLE')}
    print('Real isolated publication REST/Storage:',json.dumps(counts,sort_keys=True))

def race_test():
    content=PNG+b'\0'*(1024*1024-len(PNG)); plan,_=prepare(A,content=content)
    slot=plan['slots'][0]; connection=http_client.HTTPConnection('127.0.0.1',lab.STORAGE_PORT,timeout=40)
    connection.putrequest('POST','/object/property-images-private/'+slot['path'])
    for k,v in {'Authorization':'Bearer '+token(A),'apikey':ANON,'Content-Type':'image/png','Content-Length':str(len(content))}.items(): connection.putheader(k,v)
    connection.endheaders(); connection.send(content[:65536])
    admitted=False; deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        listing=lab.run(['docker','exec',lab.STORAGE,'find','/mnt','-type','f'])
        if slot['imageId'] in listing: admitted=True; break
        time.sleep(.2)
    if not admitted:
        connection.send(content[65536:]); response=connection.getresponse(); response.read(); connection.close(); cancel(plan)
        ROWS.append({'check':'late commit deterministic pause','result':'NOT REPRODUCIBLE','reason':'No backend file observed before complete body; no claim of race PASS.'})
        (WORK/'security-results.json').write_text(json.dumps(ROWS,indent=2)); return
    missing=inspect(plan); status,_=finalize(missing); deny_http('finalize refuses object still in actual transfer',status)
    frozen=begin(missing); status,_=remove(frozen); assert status==200
    status,closed=close(frozen); record('logical cancellation can close before admitted commit without reauthorization',status==200 and closed['state']=='CANCELLED')
    connection.send(content[65536:]); response=connection.getresponse(); status=response.status; response.read(); connection.close()
    record('previously admitted late commit accounted for',status in (200,400,409),http=status)
    observed=inspect(closed)
    record('late transfer does not create slot/quota/metadata authority',observed['state']=='CANCELLED' and observed['slots'][0]['state']=='RETIRED'
      and admin("select count(*) from private.publication_slots where request_id='"+closed['requestId']+"';")=='1')
    status,_=upload(closed,content=content); deny_http('late commit tombstone cannot be newly admitted',status)
    if observed['slots'][0]['observation']=='PRESENT':
        status,data=http('GET','object/authenticated/property-images-private/'+slot['path'],A,storage=True); record('own orphan readable without parent for cleanup',status==200 and data==content)
        status,_=http('GET','object/authenticated/property-images-private/'+slot['path'],B,storage=True); deny_http('foreign orphan read denied',status)
        status,_=remove(closed,B); remaining=inspect(closed); record('foreign orphan deletion does not remove bytes',remaining['slots'][0]['observation']=='PRESENT')
        status,_=remove(closed); record('own exact tombstone cleanup without parent',status==200 and inspect(closed)['slots'][0]['observation']=='ABSENT')

if __name__=='__main__':
    try: main()
    except Exception as error:
        print(lab.redact(str(error)),file=sys.stderr)
        sys.exit(1)
