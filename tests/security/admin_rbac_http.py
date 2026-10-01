#!/usr/bin/env python3
"""Real loopback HTTP checks against a separate synthetic DB and private volume."""
import base64,hashlib,hmac,json,pathlib,subprocess,time,urllib.error,urllib.request,uuid
from admin_rbac import ACTORS,A,B,H,E,P,LEGACY,DB,CONTAINER,raw
ROOT=pathlib.Path(__file__).resolve().parent
def inspect(name):
    return json.loads(subprocess.check_output(["docker","inspect",name]))[0]
cfg=inspect("inmuebles_admin_rbac_storage")
assert cfg["NetworkSettings"]["Ports"]["5000/tcp"]==[{"HostIp":"127.0.0.1","HostPort":"54402"}]
env=dict(s.split("=",1) for s in cfg["Config"]["Env"] if "=" in s)
assert DB in env["DATABASE_URL"] and ".supabase.co" not in env["DATABASE_URL"]
rest=inspect("inmuebles_admin_rbac_rest")
assert rest["NetworkSettings"]["Ports"]["3000/tcp"]==[{"HostIp":"127.0.0.1","HostPort":"54401"}]
restenv=dict(s.split("=",1) for s in rest["Config"]["Env"] if "=" in s)
assert DB in restenv["PGRST_DB_URI"] and ".supabase.co" not in restenv["PGRST_DB_URI"]
secret=env.get("JWT_SECRET") or env.get("AUTH_JWT_SECRET")
anon=env.get("ANON_KEY")
assert secret and anon,"Active local credentials unavailable"
def enc(data): return base64.urlsafe_b64encode(data).rstrip(b"=").decode()
def token(actor):
    if actor=="ANON": return anon
    uid=ACTORS[actor]
    body={"sub":uid,"role":"authenticated","aud":"authenticated","iat":int(time.time()),"exp":int(time.time())+1200,"app_metadata":{"role":"admin"}}
    msg=enc(b'{"alg":"HS256","typ":"JWT"}')+"."+enc(json.dumps(body).encode())
    return msg+"."+enc(hmac.new(secret.encode(),msg.encode(),hashlib.sha256).digest())
ROWS=[]
def http(method,path,actor="ANON",data=None,kind="application/json",port=54402):
    url="http://127.0.0.1:"+str(port)+"/"+path
    req=urllib.request.Request(url,data=data,method=method,headers={"Authorization":"Bearer "+token(actor),"apikey":anon,"Content-Type":kind})
    try:
        with urllib.request.urlopen(req,timeout=15) as r:return r.status,r.read()
    except urllib.error.HTTPError as e:return e.code,e.read()
def check(name,status,ok):
    ROWS.append({"check":name,"status":status,"result":"PASS" if ok else "FAIL"})
    if not ok:
        (ROOT/"rbac-http-results.json").write_text(json.dumps(ROWS,indent=2))
        raise AssertionError(name+": HTTP "+str(status))
def run_checks():
    png=base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=")
    path=A+"/"+P+"/"+str(uuid.uuid4())+".png"
    status,_=http("POST","object/property-images-private/"+path,"FREE_A",png,"image/png")
    check("owner uploads real private draft bytes",status,status==200)
    p=raw("insert into public.property_images(property_id,storage_path,storage_bucket,public_url) values ('"+P+"','"+path+"','property-images-private',null);")
    assert p.returncode==0,p.stderr
    for actor in ["ANON","FREE_B","AGENT","HISTORICAL_ADMIN_NOT_APPROVED","FREE_A","APPROVED_ADMIN"]:
        expected=actor in ("FREE_A","APPROVED_ADMIN")
        for endpoint in ["object/authenticated/property-images-private/"+path,"object/info/authenticated/property-images-private/"+path]:
            status,data=http("GET",endpoint,actor)
            check(actor+" exact draft "+endpoint.split("/")[1],status,(status==200)==expected and status<500)
            if expected and "info" not in endpoint: assert data==png,"Bytes differ"
        status,data=http("POST","object/list/property-images-private",actor,json.dumps({"prefix":A+"/"+P,"limit":100}).encode())
        # Own scoped inspection already existed; new admin policy must not enable enumeration.
        listed=path.split("/")[-1].encode() in data
        check(actor+" private folder enumeration",status,status<500 and listed==(actor=="FREE_A"))
        if actor!="FREE_A":
            assert A.encode() not in data and P.encode() not in data,"Other-user prefix disclosed"
    status,_=http("GET","object/public/property-images-private/"+path)
    check("public URL cannot deliver draft",status,status>=400 and status<500)
    status,_=http("POST","object/sign/property-images-private/"+path,"APPROVED_ADMIN",b'{"expiresIn":60}')
    check("admin approval does not enable signed URL",status,status>=400 and status<500)
    for actor in ["ANON","FREE_A","AGENT","HISTORICAL_ADMIN_NOT_APPROVED","APPROVED_ADMIN"]:
        for rpc,body in [("admin_dashboard_summary",{}),("admin_users",{"p_limit":50,"p_before":None,"p_before_id":None,"p_search":None,"p_user":None})]:
            status,data=http("POST","rpc/"+rpc,actor,json.dumps(body).encode(),port=54401)
            check(actor+" real REST "+rpc,status,(status==200)==(actor=="APPROVED_ADMIN") and status<500)
            if actor!="APPROVED_ADMIN":
                assert b"@rbac.example.invalid" not in data,"Auth DTO exposed"
    status,data=http("POST","rpc/finalize_private_property_publication","FREE_A",json.dumps({"p_property_id":P}).encode(),port=54401)
    check("real private finalization",status,status==200 and json.loads(data)=="draft-a")
    for actor in ["ANON","FREE_B","HISTORICAL_ADMIN_NOT_APPROVED","APPROVED_ADMIN"]:
        status,data=http("GET","object/authenticated/property-images-private/"+path,actor)
        check(actor+" published delivery",status,status==200 and data==png)
    status,_=http("POST","rpc/finalize_private_property_publication","FREE_A",json.dumps({"p_property_id":P}).encode(),port=54401)
    check("repeat finalization safely denies already-published state",status,status>=400 and status<500)
    status,data=http("GET","properties?id=eq."+P+"&select=id,status,owner_id","FREE_A",port=54401)
    row=json.loads(data)
    check("lost-confirmation recovery by SELECT",status,status==200 and len(row)==1 and row[0]["status"]=="published" and row[0]["owner_id"]==A)
    # Revocation is reflected in real Storage, without refreshing/reissuing the actor token.
    p=raw("select private.set_dashboard_admin('"+E+"',false,'HTTP revocation check','"+str(uuid.uuid4())+"');")
    assert p.returncode==0,p.stderr
    # Published reads remain public, so use a second draft to isolate capability revocation.
    draft=str(uuid.uuid4())
    p=raw("insert into public.properties(id,title,slug,listing_type,property_type,status,price,currency,lat,lng,owner_id) values ('"+draft+"','HTTP draft','http-draft','sale','house','draft',1,'PEN',-5,-80,'"+A+"');")
    assert p.returncode==0,p.stderr
    newpath=A+"/"+draft+"/"+str(uuid.uuid4())+".png"
    status,_=http("POST","object/property-images-private/"+newpath,"FREE_A",png,"image/png")
    check("second private upload",status,status==200)
    p=raw("insert into public.property_images(property_id,storage_path,storage_bucket,public_url) values ('"+draft+"','"+newpath+"','property-images-private',null);")
    assert p.returncode==0,p.stderr
    status,_=http("GET","object/authenticated/property-images-private/"+newpath,"APPROVED_ADMIN")
    check("revoked admin loses draft bytes immediately",status,status>=400 and status<500)
    p=raw("select private.set_dashboard_admin('"+E+"',true,'HTTP restore','"+str(uuid.uuid4())+"');")
    assert p.returncode==0,p.stderr
    status,data=http("GET","object/authenticated/property-images-private/"+newpath,"APPROVED_ADMIN")
    check("reapproval restores exact bytes",status,status==200 and data==png)
    (ROOT/"rbac-http-results.json").write_text(json.dumps(ROWS,indent=2))
    (ROOT/"storage-synthetic-paths.json").write_text(json.dumps([path,newpath]))
    print("Real REST/Storage:",len(ROWS),"PASS; 0 FAIL")

if __name__=="__main__":
    run_checks()
