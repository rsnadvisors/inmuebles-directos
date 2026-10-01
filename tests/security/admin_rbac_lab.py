#!/usr/bin/env python3
"""Reproducible RBAC replay on an already authorized, empty, loopback-only local lab."""
import hashlib,json,pathlib,shutil,subprocess,sys,urllib.parse
SOURCE=pathlib.Path(__file__).resolve().parents[2]
DB="rbac_foundation_20260930_r3"
CONTAINER="supabase_db_inmuebles-directos"
EXPECTED="e26f6d035ff07ea3bac523692afbcfb3049713cf3dab3abbe9086e547575098e"
def command(args,data=None):
    p=subprocess.run(args,input=data,text=True,capture_output=True)
    if p.returncode: raise RuntimeError("Local command failed: "+p.stderr[:500])
    return p.stdout
def sql(text,db="postgres",user="postgres"):
    assert db in ("postgres",DB)
    prefix="DO $$ BEGIN IF current_database() <> '"+db+"' THEN RAISE EXCEPTION 'Target mismatch'; END IF; END $$;"
    return command(["docker","exec","-i",CONTAINER,"psql","-X","-U",user,"-d",db,"-Atq","-v","ON_ERROR_STOP=1"],prefix+text)
def main():
    assert len(sys.argv)==2, "Usage: python3 tests/security/admin_rbac_lab.py /root/inmuebles-admin-rbac-replay"
    work=pathlib.Path(sys.argv[1]).resolve()
    assert work.parent==pathlib.Path("/root") and work.name.startswith("inmuebles-admin-rbac-")
    assert not work.exists(),"Fresh directory required"
    context=json.loads(command(["docker","context","inspect"]))[0]
    assert context["Endpoints"]["docker"]["Host"]=="unix:///var/run/docker.sock","Remote Docker refused"
    cfg=json.loads(command(["docker","inspect",CONTAINER]))[0]
    assert cfg["Config"]["Labels"].get("com.supabase.cli.project")=="inmuebles-directos"
    assert cfg["NetworkSettings"]["Ports"]["5432/tcp"]==[{"HostIp":"127.0.0.1","HostPort":"54322"}]
    assert sql("select count(*) from auth.users; select count(*) from storage.objects;").strip()=="0\n0"
    assert sql("select count(*) from pg_database where datname='"+DB+"'").strip()=="0","Do not overwrite any lab"
    work.mkdir(mode=0o700)
    migrations=work/"supabase"/"migrations"
    migrations.mkdir(parents=True)
    shutil.copy(SOURCE/"supabase"/"config.toml",work/"supabase"/"config.toml")
    baseline=(SOURCE/"tests"/"security"/"fixtures"/"admin_rbac_baseline.sql").read_text()
    (migrations/"20260909040437_baseline_RECONSTRUCTION_TEST_ONLY.sql").write_text(baseline)
    for p in sorted((SOURCE/"supabase"/"migrations").glob("*.sql")):
        (migrations/p.name).write_text(p.read_text())  # Git/Linux LF, same SQL.
    candidate=next(migrations.glob("*admin_rbac_foundation.sql"))
    assert hashlib.sha256(candidate.read_bytes()).hexdigest()==EXPECTED,"Candidate checksum mismatch"
    ddl=command(["docker","exec",CONTAINER,"pg_dump","-U","postgres","-d","postgres","--schema-only","--schema=auth","--schema=storage","--schema=extensions","--no-comments"])
    import re
    ddl=re.sub(r"CREATE TRIGGER on_auth_user_created.*?;\n","",ddl,flags=re.S)
    ddl=re.sub(r"CREATE POLICY .*?;\n","",ddl,flags=re.S)
    (work/"infrastructure-schema-only.sql").write_text(ddl)
    sql('CREATE DATABASE "'+DB+'" OWNER postgres;')
    sql(ddl,DB,"supabase_admin")
    env=dict(x.split("=",1) for x in cfg["Config"]["Env"] if "=" in x)
    password=env["POSTGRES_PASSWORD"]
    url="postgresql://postgres:"+urllib.parse.quote(password,safe="")+"@127.0.0.1:54322/"+DB+"?sslmode=disable"
    result=subprocess.run(["supabase","migration","up","--db-url",url,"--workdir",str(work),"--yes"],text=True,capture_output=True)
    (work/"migration-up.log").write_text((result.stdout+result.stderr).replace(url,"[LOCAL DB URL]").replace(password,"[LOCAL CREDENTIAL]"))
    assert result.returncode==0,"Clean chain must apply with unmodified preconditions"
    assert sql("select count(*) from supabase_migrations.schema_migrations",DB).strip()=="7"
    modules=["admin_rbac.py","admin_rbac_http.py","admin_rbac_extra.py","admin_rbac_negative.py","admin_rbac_api_lab.py"]
    for name in modules: shutil.copy(SOURCE/"tests"/"security"/name,work/name)
    shutil.copy(SOURCE/"tests"/"security"/"fixtures"/"admin_rbac_rollback.sql",work/"rollback.sql")
    for name in ["admin_rbac.py","admin_rbac_api_lab.py","admin_rbac_http.py","admin_rbac_extra.py","admin_rbac_negative.py"]:
        print(command(["python3",str(work/name)]).strip(),flush=True)
    print("Evidence directory:",work)
if __name__=="__main__": main()
