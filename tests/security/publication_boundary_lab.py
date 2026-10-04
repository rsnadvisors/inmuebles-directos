#!/usr/bin/env python3
"""Fresh synthetic-only DB, REST and Storage; never reset/overwrite an existing lab.

Usage: python3 tests/security/publication_boundary_lab.py /root/inmuebles-publication-boundary-<unique>
No application data is copied. Only infrastructure DDL is reconstructed.
"""
import hashlib, json, os, pathlib, re, subprocess, sys, time, urllib.parse, urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[2]
CONTAINER="supabase_db_inmuebles-directos"
RUN=os.environ.get('PUBLICATION_LAB_RUN','20261004_a')
assert re.fullmatch(r'[0-9]{8}_[a-z]',RUN)
DB="publication_boundary_"+RUN
REST="inmuebles_publication_boundary_rest_"+RUN
STORAGE="inmuebles_publication_boundary_storage_"+RUN
VOLUME="inmuebles_publication_boundary_bytes_"+RUN
REST_PORT=54501+10*(ord(RUN[-1])-ord('a'))
STORAGE_PORT=REST_PORT+1
SECRETS=[]
def run(args,data=None):
    p=subprocess.run(args,input=data,text=True,capture_output=True)
    if p.returncode:
        error=p.stderr[-2000:]
        for secret in SECRETS:
            if secret: error=error.replace(secret,"[LOCAL SECRET]")
        raise RuntimeError("Isolated command failed: "+error)
    return p.stdout
def config(name): return json.loads(run(["docker","inspect",name]))[0]
def sql(text,db=DB,user="postgres"):
    assert db in (DB,"postgres")
    guard="DO $$ BEGIN IF current_database()<>'"+db+"' THEN RAISE EXCEPTION 'Target mismatch'; END IF; END $$;\n"
    return run(["docker","exec","-i",CONTAINER,"psql","-X","-U",user,"-d",db,"-Atq","-v","ON_ERROR_STOP=1"],guard+text)
def main():
    assert len(sys.argv)==2
    work=pathlib.Path(sys.argv[1]).resolve()
    assert work.parent==pathlib.Path('/root') and work.name.startswith('inmuebles-publication-boundary-') and not work.exists()
    assert not (ROOT/'supabase/.temp/project-ref').exists(),"Linked project refused"
    assert json.loads(run(['docker','context','inspect']))[0]['Endpoints']['docker']['Host']=='unix:///var/run/docker.sock'
    cfg=config(CONTAINER)
    assert cfg['NetworkSettings']['Ports']['5432/tcp']==[{'HostIp':'127.0.0.1','HostPort':'54322'}]
    assert cfg['Config']['Labels'].get('com.supabase.cli.project')=='inmuebles-directos'
    assert sql("select count(*) from pg_database where datname='"+DB+"';",'postgres').strip()=='0',"Never overwrite a database"
    known=run(['docker','ps','-a','--format','{{.Names}}']).splitlines()
    assert REST not in known and STORAGE not in known,"Never replace containers"
    assert VOLUME not in run(['docker','volume','ls','--format','{{.Name}}']).splitlines(),"Fresh binary volume required"
    templates=[config('supabase_rest_inmuebles-directos'),config('supabase_storage_pr11_compat')]
    for t in templates:
        for v in t['Config']['Env']:
            assert '.supabase.co' not in v.lower(),"Production endpoint refused"
    work.mkdir(mode=0o700)
    ddl=run(['docker','exec',CONTAINER,'pg_dump','-U','postgres','-d','postgres','--schema-only','--schema=auth','--schema=storage','--schema=extensions','--schema=vault','--no-comments'])
    ddl=re.sub(r'CREATE TRIGGER on_auth_user_created.*?;\n','',ddl,flags=re.S)
    ddl=re.sub(r'CREATE POLICY .*?;\n','',ddl,flags=re.S)
    # DDL only; no production/user rows, passwords or objects are dumped.
    sql('CREATE DATABASE "'+DB+'" OWNER postgres;','postgres')
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
    db_env=dict(v.split('=',1) for v in cfg['Config']['Env'] if '=' in v)
    password=db_env['POSTGRES_PASSWORD']; SECRETS.append(password)
    url='postgresql://postgres:'+urllib.parse.quote(password,safe='')+'@127.0.0.1:54322/'+DB+'?sslmode=disable'
    output=run(['supabase','migration','up','--db-url',url,'--workdir',str(work),'--yes'])
    for secret in [url,*SECRETS]: output=output.replace(secret,'[LOCAL SECRET]')
    (work/'migration-up.log').write_text(output)
    key=os.urandom(32).hex(); SECRETS.append(key)
    sql("select vault.create_secret('"+key+"','PUBLICATION_BOUNDARY_HMAC_KEY:synthetic-lab');")
    contract=next(m for m in migrations if m.name.endswith('_publication_boundary_contract.sql'))
    hashes.append({'file':contract.name,'sha256':hashlib.sha256(contract.read_bytes()).hexdigest()})
    evidence={'database':DB,'migrations':hashes,'services':[],'production_mutations':0}
    for t,name,port,internal in [(templates[0],REST,REST_PORT,3000),(templates[1],STORAGE,STORAGE_PORT,5000)]:
        env=dict(v.split('=',1) for v in t['Config']['Env'] if '=' in v)
        for k,v in list(env.items()):
            if k in ('DATABASE_URL','PGRST_DB_URI'):
                u=urllib.parse.urlsplit(v); assert u.hostname in (CONTAINER,'db')
                env[k]=urllib.parse.urlunsplit((u.scheme,u.netloc,'/'+DB,u.query,u.fragment))
                if u.password: SECRETS.append(u.password)
            if k=='POSTGREST_URL': env[k]='http://'+REST+':3000'
            if k=='PGRST_DB_SCHEMAS': env[k]='public'
        envfile=work/(name+'.local-env'); envfile.write_text('\n'.join(k+'='+v for k,v in env.items())); envfile.chmod(0o600)
        args=['docker','run','-d','--name',name,'--network','e0-local-network','--env-file',str(envfile),'-p','127.0.0.1:'+str(port)+':'+str(internal)]
        if internal==5000: args+=['-v',VOLUME+':/mnt']
        run(args+[t['Config']['Image']]); envfile.unlink()
        c=config(name); assert c['NetworkSettings']['Ports'][str(internal)+'/tcp']==[{'HostIp':'127.0.0.1','HostPort':str(port)}]
        img=json.loads(run(['docker','image','inspect',c['Config']['Image']]))[0]
        evidence['services'].append({'name':name,'image':c['Config']['Image'],'image_id':img['Id'],'digests':img['RepoDigests'],'host':'127.0.0.1','port':port})
    for port,path in [(REST_PORT,'/'),(STORAGE_PORT,'/status')]:
        deadline=time.monotonic()+30
        while True:
            try:
                with urllib.request.urlopen('http://127.0.0.1:'+str(port)+path,timeout=5) as r: assert r.status==200
                break
            except Exception:
                if time.monotonic()>deadline: raise RuntimeError('Isolated HTTP health failed')
                time.sleep(.5)
    (work/'environment.json').write_text(json.dumps(evidence,indent=2))
    # Key is supplied only to the synthetic test process, never written to evidence/logs.
    env=os.environ.copy(); env['PUBLICATION_TEST_HMAC_KEY']=key; env['PUBLICATION_TEST_EVIDENCE_DIR']=str(work)
    p=subprocess.run(['python3',str(ROOT/'tests/security/publication_boundary.py')],env=env,text=True,capture_output=True)
    out=p.stdout+p.stderr
    for secret in SECRETS: out=out.replace(secret,'[LOCAL SECRET]')
    (work/'test-output.log').write_text(out); print(out.strip())
    assert p.returncode==0,'Isolated publication validation failed'
    print('Synthetic environment and evidence:',work)
if __name__=='__main__': main()
