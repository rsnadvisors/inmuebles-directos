#!/usr/bin/env python3
"""Fresh synthetic-only DB, REST and Storage; never reset/overwrite an existing lab.

Usage in an ephemeral GitHub runner: python3 -B tests/security/publication_boundary_lab.py
  "$RUNNER_TEMP/inmuebles-publication-boundary-$PUBLICATION_LAB_RUN"
No application data is copied. Only infrastructure DDL is reconstructed.
"""
import hashlib, json, os, pathlib, re, subprocess, sys, time, urllib.parse, urllib.request
import http.client

ROOT=pathlib.Path(__file__).resolve().parents[2]
CONTAINER="supabase_db_inmuebles-directos"
RUN=os.environ.get('PUBLICATION_LAB_RUN','')
assert re.fullmatch(r'[0-9]{1,20}_[0-9]{1,3}',RUN), 'Explicit CI run/attempt required'
DB="publication_boundary_"+RUN
REST="inmuebles_publication_boundary_rest_"+RUN
STORAGE="inmuebles_publication_boundary_storage_"+RUN
VOLUME="inmuebles_publication_boundary_bytes_"+RUN
REST_PORT=int(os.environ.get('PUBLICATION_TEST_REST_PORT','0'))
STORAGE_PORT=int(os.environ.get('PUBLICATION_TEST_STORAGE_PORT','0'))
WORK=pathlib.Path(os.environ['RUNNER_TEMP']).resolve()/('inmuebles-publication-boundary-'+RUN)
CONTRACT=ROOT/'supabase/proposed/20261004012123_publication_boundary_contract.sql'
SECRETS=[]
PROCESS_ENV={k:os.environ[k] for k in ('PATH','HOME','LANG','RUNNER_TEMP','GITHUB_ACTIONS',
    'GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','PUBLICATION_LAB_CI','PUBLICATION_LAB_RUN') if k in os.environ}
PROCESS_ENV.update(PYTHONDONTWRITEBYTECODE='1', NODE_DISABLE_COMPILE_CACHE='1')

def redact(text):
    for secret in sorted(set(SECRETS),key=len,reverse=True):
        if secret: text=text.replace(secret,'[LOCAL SECRET]')
    return text

def assert_ci_context():
    assert os.environ.get('PUBLICATION_LAB_CI')=='1' and os.environ.get('GITHUB_ACTIONS')=='true', 'Ephemeral CI only'
    assert RUN==os.environ.get('GITHUB_RUN_ID','')+'_'+os.environ.get('GITHUB_RUN_ATTEMPT','')
    assert not any(os.environ.get(k) for k in ('DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH',
        'SUPABASE_ACCESS_TOKEN','DATABASE_URL','SUPABASE_SERVICE_ROLE_KEY','PUBLICATION_BOUNDARY_HMAC_KEY'))
    assert not (ROOT/'supabase/.temp/project-ref').exists(), 'Linked project refused'

def assert_work(path):
    assert path==WORK and path.parent==pathlib.Path(os.environ['RUNNER_TEMP']).resolve()
    assert not path.is_symlink() and not path.is_relative_to(ROOT), 'Evidence must stay outside checkout'
def run(args,data=None,check=True):
    p=subprocess.run(args,input=data,text=True,capture_output=True,env=PROCESS_ENV,timeout=180)
    if check and p.returncode:
        raise RuntimeError('Isolated command failed: '+redact(p.stderr[-2000:]))
    return p.stdout if check else p
def config(name): return json.loads(run(["docker","inspect",name]))[0]
def sql(text,db=DB,user="postgres"):
    assert db in (DB,"postgres")
    guard="DO $$ BEGIN IF current_database()<>'"+db+"' THEN RAISE EXCEPTION 'Target mismatch'; END IF; END $$;\n"
    if db==DB:
        guard+="DO $$ BEGIN IF shobj_description((select oid from pg_database where datname=current_database()),'pg_database') IS DISTINCT FROM 'synthetic-publication:"+RUN+"' THEN RAISE EXCEPTION 'Unowned database'; END IF; END $$;\n"
    return run(["docker","exec","-i",CONTAINER,"psql","-X","-U",user,"-d",db,"-Atq","-v","ON_ERROR_STOP=1"],guard+text)

def migrate():
    cfg=config(CONTAINER)
    password=dict(v.split('=',1) for v in cfg['Config']['Env'] if '=' in v)['POSTGRES_PASSWORD']
    url='postgresql://postgres:'+urllib.parse.quote(password,safe='')+'@127.0.0.1:54322/'+DB+'?sslmode=disable'
    SECRETS.extend([password,urllib.parse.quote(password,safe=''),url])
    p=run(['supabase','migration','up','--db-url',url,'--workdir',str(WORK),'--yes'],check=False)
    with (WORK/'migration-up.log').open('a',encoding='utf-8') as log:
        log.write(redact(p.stdout+p.stderr))
    return p.returncode,redact(p.stdout+p.stderr)

def apply_contract(succeeds=True):
    target=WORK/'supabase/migrations'/CONTRACT.name
    if not target.exists():
        with target.open('xb') as f: f.write(CONTRACT.read_bytes())
    assert target.read_bytes()==CONTRACT.read_bytes(), 'Contract identity changed'
    code,output=migrate()
    assert (code==0)==succeeds, 'Unexpected Contract migration outcome: '+output[-1200:]
    return output

def catalog_snapshot():
    ddl=run(['docker','exec',CONTAINER,'pg_dump','-U','postgres','-d',DB,'--schema-only','--no-comments'])
    # Recent pg_dump versions randomize their psql restrict token on each dump.
    ddl=re.sub(r'^\\(?:un)?restrict .*\n','',ddl,flags=re.M)
    history=sql('select to_jsonb(m)::text from supabase_migrations.schema_migrations m order by version;')
    rows=[]
    for table in ('public.properties','public.property_images','storage.objects',
        'private.publication_quotas','private.publication_attempts','private.publication_slots'):
        rows.append(sql('select to_jsonb(t)::text from '+table+' t order by to_jsonb(t)::text;'))
    return hashlib.sha256((ddl+history+'\n'.join(rows)).encode()).hexdigest()
def main():
    global REST_PORT,STORAGE_PORT
    assert_ci_context()
    assert len(sys.argv)==2
    work=pathlib.Path(sys.argv[1]).resolve()
    assert_work(work)
    assert not work.exists(), 'Never reuse an evidence directory'
    assert json.loads(run(['docker','context','inspect']))[0]['Endpoints']['docker']['Host']=='unix:///var/run/docker.sock'
    network=json.loads(run(['docker','network','inspect','e0-local-network']))[0]
    assert network['Driver']=='bridge' and network['Labels'].get('inmuebles.synthetic-run')==RUN
    assert network['Options'].get('com.docker.network.bridge.host_binding_ipv4')=='127.0.0.1'
    cfg=config(CONTAINER)
    assert cfg['NetworkSettings']['Ports']['5432/tcp']==[{'HostIp':'127.0.0.1','HostPort':'54322'}]
    assert cfg['Config']['Labels'].get('com.supabase.cli.project')=='inmuebles-directos'
    assert sql("select count(*) from pg_database where datname='"+DB+"';",'postgres').strip()=='0',"Never overwrite a database"
    known=run(['docker','ps','-a','--format','{{.Names}}']).splitlines()
    assert REST not in known and STORAGE not in known,"Never replace containers"
    assert VOLUME not in run(['docker','volume','ls','--format','{{.Name}}']).splitlines(),"Fresh binary volume required"
    templates=[config('supabase_rest_inmuebles-directos'),config('supabase_storage_inmuebles-directos')]
    for c in [cfg,*templates]:
        assert c['State']['Running'] and c['Config']['Labels'].get('com.supabase.cli.project')=='inmuebles-directos'
        assert 'e0-local-network' in c['NetworkSettings']['Networks']
    for t in templates:
        for v in t['Config']['Env']:
            assert '.supabase.co' not in v.lower(),"Production endpoint refused"
    assert sql('select (select count(*) from auth.users),(select count(*) from public.properties),'
        '(select count(*) from public.property_images),(select count(*) from storage.objects);','postgres').strip()=='0|0|0|0', 'Synthetic source must be empty'
    work.mkdir(mode=0o700)
    ddl=run(['docker','exec',CONTAINER,'pg_dump','-U','postgres','-d','postgres','--schema-only','--schema=auth','--schema=storage','--schema=extensions','--schema=vault','--no-comments'])
    ddl=re.sub(r'CREATE TRIGGER on_auth_user_created.*?;\n','',ddl,flags=re.S)
    ddl=re.sub(r'CREATE POLICY .*?;\n','',ddl,flags=re.S)
    # DDL only; no production/user rows, passwords or objects are dumped.
    sql('CREATE DATABASE "'+DB+'" OWNER postgres;','postgres')
    sql("COMMENT ON DATABASE \""+DB+"\" IS 'synthetic-publication:"+RUN+"';",'postgres')
    sql(ddl,user='supabase_admin')
    # pg_dump with explicit schema filters excludes extension installation commands.
    # Install the already-available local extensions; copy no Vault secrets/data.
    sql('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions; CREATE EXTENSION IF NOT EXISTS supabase_vault;',user='supabase_admin')
    migrations=sorted((ROOT/'supabase/migrations').glob('*.sql'))
    hashes=[]
    migration_dir=work/'supabase/migrations'; migration_dir.mkdir(parents=True)
    (work/'supabase/config.toml').write_text((ROOT/'supabase/config.toml').read_text())
    (migration_dir/'20260909040437_baseline_RECONSTRUCTION_TEST_ONLY.sql').write_text((ROOT/'tests/security/fixtures/admin_rbac_baseline.sql').read_text())
    for m in migrations:
        if m.name.endswith('_publication_boundary_contract.sql'): continue
        (migration_dir/m.name).write_text(m.read_text())
        hashes.append({'file':m.name,'sha256':hashlib.sha256(m.read_bytes()).hexdigest()})
    code,output=migrate()
    assert code==0, 'Synthetic Expand migration failed: '+output[-1200:]
    key=os.urandom(32).hex(); SECRETS.append(key)
    sql("select vault.create_secret('"+key+"','PUBLICATION_BOUNDARY_HMAC_KEY:synthetic-lab');")
    contract=CONTRACT
    hashes.append({'file':contract.name,'sha256':hashlib.sha256(contract.read_bytes()).hexdigest()})
    source_files=('publication-boundary-server','publication','contact-phone','property-images','property-image-source')
    evidence={'database':DB,'run':RUN,'migrations':hashes,'services':[],
        'server_sources':{name:hashlib.sha256((ROOT/'app/lib'/(name+'.ts')).read_bytes()).hexdigest() for name in source_files}}
    for t,name,internal in [(templates[0],REST,3000),(templates[1],STORAGE,5000)]:
        env=dict(v.split('=',1) for v in t['Config']['Env'] if '=' in v)
        for k,v in list(env.items()):
            if k in ('DATABASE_URL','PGRST_DB_URI'):
                u=urllib.parse.urlsplit(v); assert u.hostname in (CONTAINER,'db')
                assert u.path=='/postgres', 'Unexpected template database'
                env[k]=urllib.parse.urlunsplit((u.scheme,u.netloc,'/'+DB,u.query,u.fragment))
                if u.password: SECRETS.append(u.password)
            if k=='POSTGREST_URL': env[k]='http://'+REST+':3000'
            if k=='PGRST_DB_SCHEMAS': env[k]='public'
        if internal==5000:
            assert env.get('STORAGE_BACKEND')=='file', 'Only a fresh local file backend is allowed'
            env['FILE_STORAGE_BACKEND_PATH']='/mnt'
            run(['docker','volume','create','--label','inmuebles.publication-lab='+RUN,VOLUME])
            volume=json.loads(run(['docker','volume','inspect',VOLUME]))[0]
            assert volume['Labels'].get('inmuebles.publication-lab')==RUN
        assert ('PGRST_DB_URI' if internal==3000 else 'DATABASE_URL') in env
        SECRETS.extend(v for k,v in env.items() if any(s in k.upper() for s in ('KEY','SECRET','PASSWORD','TOKEN')))
        envfile=work/(name+'.local-env')
        with os.fdopen(os.open(envfile,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as f:
            f.write('\n'.join(k+'='+v for k,v in env.items()))
        args=['docker','run','-d','--name',name,'--label','inmuebles.publication-lab='+RUN,
            '--network','e0-local-network','--env-file',str(envfile),'-p','127.0.0.1::'+str(internal)]
        if internal==5000: args+=['-v',VOLUME+':/mnt']
        try: run(args+[t['Config']['Image']])
        finally: envfile.unlink()
        c=config(name)
        bindings=c['NetworkSettings']['Ports'][str(internal)+'/tcp']
        assert len(bindings)==1 and bindings[0]['HostIp']=='127.0.0.1'
        port=int(bindings[0]['HostPort']); assert 0<port<65536
        assert c['Config']['Labels'].get('inmuebles.publication-lab')==RUN
        if internal==3000: REST_PORT=port
        else: STORAGE_PORT=port
        img=json.loads(run(['docker','image','inspect',c['Config']['Image']]))[0]
        evidence['services'].append({'name':name,'image':c['Config']['Image'],'image_id':img['Id'],'digests':img['RepoDigests'],'host':'127.0.0.1','port':port})
    for port,path in [(REST_PORT,'/'),(STORAGE_PORT,'/status')]:
        deadline=time.monotonic()+30
        while True:
            try:
                connection=http.client.HTTPConnection('127.0.0.1',port,timeout=5)
                try:
                    connection.request('GET',path)
                    response=connection.getresponse()
                    assert response.status==200  # No proxy or automatic redirect.
                    response.read()
                finally: connection.close()
                break
            except Exception:
                if time.monotonic()>deadline: raise RuntimeError('Isolated HTTP health failed')
                time.sleep(.5)
    (work/'environment.json').write_text(json.dumps(evidence,indent=2))
    # Key is supplied only to the synthetic test process, never written to evidence/logs.
    env={**PROCESS_ENV,'PUBLICATION_TEST_HMAC_KEY':key,'PUBLICATION_TEST_EVIDENCE_DIR':str(work),
        'PUBLICATION_TEST_REST_PORT':str(REST_PORT),'PUBLICATION_TEST_STORAGE_PORT':str(STORAGE_PORT)}
    p=subprocess.run(['python3','-B',str(ROOT/'tests/security/publication_boundary.py')],env=env,text=True,capture_output=True,timeout=600)
    out=redact(p.stdout+p.stderr)
    (work/'test-output.log').write_text(out); print(out.strip())
    assert p.returncode==0,'Isolated publication validation failed'
    print('Synthetic environment and evidence:',work)
if __name__=='__main__':
    try: main()
    except Exception as error:
        print(redact(str(error)),file=sys.stderr)
        sys.exit(1)
