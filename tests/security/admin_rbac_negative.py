#!/usr/bin/env python3
"""Negative clean-chain test. Reject schema drift and prove zero partial RBAC objects."""
import json,pathlib,shutil,subprocess,urllib.parse
ROOT=pathlib.Path(__file__).resolve().parent
DB="rbac_foundation_20260930_negative"
C="supabase_db_inmuebles-directos"
def run(args,data=None,user="postgres",db=DB):
    p=subprocess.run(args,input=data,text=True,capture_output=True)
    assert p.returncode==0,p.stderr[:600]
    return p.stdout
def sql(text,db=DB,user="postgres"):
    return run(["docker","exec","-i",C,"psql","-X","-U",user,"-d",db,"-Atq","-v","ON_ERROR_STOP=1"],text)
cfg=json.loads(run(["docker","inspect",C]))[0]
assert cfg["NetworkSettings"]["Ports"]["5432/tcp"]==[{"HostIp":"127.0.0.1","HostPort":"54322"}]
assert sql("select count(*) from pg_database where datname='"+DB+"';",db="postgres")=="0\n"
sql('create database "'+DB+'" owner postgres;',db="postgres")
sql((ROOT/"infrastructure-schema-only.sql").read_text(),user="supabase_admin")
work=ROOT/"negative"
migrations=work/"supabase"/"migrations"
migrations.mkdir(parents=True)
shutil.copy(ROOT/"supabase"/"config.toml",work/"supabase"/"config.toml")
candidate=next((ROOT/"supabase"/"migrations").glob("*admin_rbac_foundation.sql"))
for source in (ROOT/"supabase"/"migrations").glob("*.sql"):
    if source!=candidate: shutil.copy(source,migrations/source.name)
env=dict(x.split("=",1) for x in cfg["Config"]["Env"] if "=" in x)
password=env["POSTGRES_PASSWORD"]
url="postgresql://postgres:"+urllib.parse.quote(password,safe="")+"@127.0.0.1:54322/"+DB+"?sslmode=disable"
p=subprocess.run(["supabase","migration","up","--db-url",url,"--workdir",str(work),"--yes"],text=True,capture_output=True)
assert p.returncode==0,"Baseline must apply successfully"
assert sql("select count(*) from supabase_migrations.schema_migrations").strip()=="6"
sql("alter table public.profiles add column synthetic_unexpected text;")
shutil.copy(candidate,migrations/candidate.name)
p=subprocess.run(["supabase","migration","up","--db-url",url,"--workdir",str(work),"--yes"],text=True,capture_output=True)
assert p.returncode!=0 and "RBAC baseline catalog drift" in p.stderr,"Expected explicit precondition failure"
assert sql("select to_regclass('private.dashboard_admins') is null and to_regclass('public.admin_audit_log') is null").strip()=="t"
assert sql("select count(*) from supabase_migrations.schema_migrations").strip()=="6"
assert sql("select count(*) from pg_trigger where tgname in ('e0_guard_profile_system_fields','guard_property_publication_transition') and not tgisinternal").strip()=="2"
(ROOT/"negative-results.json").write_text(json.dumps({"unexpected_column":"PASS","zero_partial_objects":"PASS","history_unchanged":"PASS","E0_publication_guard_preserved":"PASS"}))
print("Negative schema drift: PASS; zero partial RBAC objects; 6 historical versions retained; E0/publication guards preserved")
