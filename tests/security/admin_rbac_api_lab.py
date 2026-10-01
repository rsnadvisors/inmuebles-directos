#!/usr/bin/env python3
"""Start dedicated loopback REST/Storage for the synthetic RBAC database."""
import json,pathlib,re,subprocess,time,urllib.parse,urllib.request
ROOT=pathlib.Path(__file__).resolve().parent
DB="rbac_foundation_20260930_r3"
def run(args):
    p=subprocess.run(args,text=True,capture_output=True)
    assert p.returncode==0, "Local Docker command failed"
    return p.stdout
def config(name):
    return json.loads(run(["docker","inspect",name]))[0]
db=config("supabase_db_inmuebles-directos")
assert db["NetworkSettings"]["Ports"]["5432/tcp"]==[{"HostIp":"127.0.0.1","HostPort":"54322"}]
assert run(["docker","exec","supabase_db_inmuebles-directos","psql","-U","postgres","-d",DB,"-Atq","-c","select current_database();"]).strip()==DB
for source,target,port,internal in [("supabase_rest_inmuebles-directos","inmuebles_admin_rbac_rest",54401,3000),("supabase_storage_pr11_compat","inmuebles_admin_rbac_storage",54402,5000)]:
    original=config(source)
    env=dict(x.split("=",1) for x in original["Config"]["Env"] if "=" in x)
    for key,value in list(env.items()):
        assert ".supabase.co" not in value and "vosijgnyyyjvqpzbhtuh" not in value, "Production target refused"
        if key in ("DATABASE_URL","PGRST_DB_URI"):
            u=urllib.parse.urlsplit(value)
            assert u.hostname in ("supabase_db_inmuebles-directos","db"), "Unexpected DB host"
            env[key]=urllib.parse.urlunsplit((u.scheme,u.netloc,"/"+DB,u.query,u.fragment))
        elif key=="POSTGREST_URL":
            env[key]="http://inmuebles_admin_rbac_rest:3000"
    if internal==3000: env["PGRST_DB_SCHEMAS"]="public"
    envfile=ROOT/(target+".local-env")
    envfile.write_text("\n".join(k+"="+v for k,v in env.items()))
    envfile.chmod(0o600)
    args=["docker","run","-d","--name",target,"--network","e0-local-network","--env-file",str(envfile),"-p","127.0.0.1:"+str(port)+":"+str(internal)]
    if internal==5000: args += ["-v","inmuebles_admin_rbac_storage_20260930:/mnt"]
    args += [original["Config"]["Image"]]
    run(args)
    envfile.unlink()
    effective=config(target)["NetworkSettings"]["Ports"][str(internal)+"/tcp"]
    assert effective==[{"HostIp":"127.0.0.1","HostPort":str(port)}]
    print(target,"loopback",port,"database",DB)
for url in ["http://127.0.0.1:54401/","http://127.0.0.1:54402/status"]:
    deadline=time.monotonic()+30
    while True:
        try:
            with urllib.request.urlopen(url,timeout=5) as r:
                assert r.status==200
                print("local health",r.status)
                break
        except Exception:
            if time.monotonic()>=deadline: raise RuntimeError("Isolated API health failed")
            time.sleep(0.5)
