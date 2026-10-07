"""Read-only JWT/HEAD count proof using existing synthetic fixtures; no DDL/DML/Storage."""
import json,subprocess,urllib.parse,urllib.request,base64,hashlib,hmac,time
REST="inmuebles_publication_boundary_rest_20261004_k"
cfg=json.loads(subprocess.check_output(["docker","inspect",REST]))[0]
assert cfg["NetworkSettings"]["Ports"]["3000/tcp"]==[{"HostIp":"127.0.0.1","HostPort":"54601"}]
env=dict(s.split("=",1) for s in cfg["Config"]["Env"] if "=" in s)
uri=urllib.parse.urlparse(env["PGRST_DB_URI"]); DB=uri.path.lstrip("/")
assert DB=="publication_boundary_20261004_k" and ".supabase.co" not in env["PGRST_DB_URI"]
db_cfg=json.loads(subprocess.check_output(["docker","inspect","supabase_db_inmuebles-directos"]))[0]
assert db_cfg["NetworkSettings"]["Ports"]["5432/tcp"]==[{"HostIp":"127.0.0.1","HostPort":"54322"}]
local_hosts={"supabase_db_inmuebles-directos","127.0.0.1","localhost"}
for network in db_cfg["NetworkSettings"]["Networks"].values():
 local_hosts.update(network.get("Aliases") or []); local_hosts.add(network.get("IPAddress"))
assert uri.hostname in local_hosts,"REST is not connected to the audited local DB"
secret=env["PGRST_JWT_SECRET"]
if secret.startswith("{"):
 jwks=json.loads(secret); key=next(k for k in jwks.get("keys",[jwks]) if k.get("kty")=="oct")
 secret=base64.urlsafe_b64decode(key["k"]+"="*(-len(key["k"])%4))
else: secret=secret.encode()
CONTAINER="supabase_db_inmuebles-directos"
def sql(q):
 r=subprocess.run(["docker","exec","-i",CONTAINER,"psql","-X","-Atq","-v","ON_ERROR_STOP=1","-U","postgres","-d",DB],input="BEGIN READ ONLY; SET LOCAL statement_timeout='8s'; "+q+"; COMMIT;",text=True,capture_output=True)
 assert r.returncode==0,"Local SELECT failed"
 return r.stdout.strip()
actors=json.loads(sql("select json_agg(id) from public.profiles")); assert len(actors)>=2
def enc(x):return base64.urlsafe_b64encode(x).rstrip(b"=").decode()
def jwt(actor=None):
 body={"role":"authenticated" if actor else "anon","aud":"authenticated","iat":int(time.time()),"exp":int(time.time())+300}
 if actor:body["sub"]=actor
 msg=enc(b'{"alg":"HS256","typ":"JWT"}')+"."+enc(json.dumps(body).encode())
 return msg+"."+enc(hmac.new(secret,msg.encode(),hashlib.sha256).digest())
ROWS=[]
def count(actor,filters,images=False):
 p={"select":"id,property_images()" if images else "id",**filters}
 if images:p["property_images"]="not.is.null"
 req=urllib.request.Request("http://127.0.0.1:54601/properties?"+urllib.parse.urlencode(p),method="HEAD",headers={"Authorization":"Bearer "+jwt(actor),"Prefer":"count=exact"})
 with urllib.request.urlopen(req,timeout=10) as r:
  assert r.status in (200,206) and not r.read()
  return int(r.headers["Content-Range"].rsplit("/",1)[1])
def check(label,actual,expected):
 assert actual==expected,label
 ROWS.append({"check":label,"result":"PASS"})
for uid in actors:
 own={"owner_id":"eq."+uid}
 expected=int(sql("SELECT count(*) FROM public.properties WHERE owner_id='"+uid+"'"))
 check("JWT own exact parent count",count(uid,own),expected)
 expected_images=int(sql("SELECT count(*) FROM public.properties p WHERE owner_id='"+uid+"' AND EXISTS(SELECT 1 FROM public.property_images i WHERE i.property_id=p.id)"))
 check("JWT own image EXISTS HEAD count",count(uid,own,True),expected_images)
 for status in ["draft","published","archived","reserved","sold","rented"]:
  exp=int(sql("SELECT count(*) FROM public.properties WHERE owner_id='"+uid+"' AND status='"+status+"'"))
  check("JWT own status "+status,count(uid,{**own,"status":"eq."+status}),exp)
 for column,values in [("property_type",["house","apartment","land","office","commercial"]),("listing_type",["sale","rent"]),("currency",["PEN","USD"])]:
  for value in values:
   exp=int(sql("SELECT count(*) FROM public.properties WHERE owner_id='"+uid+"' AND "+column+"='"+value+"'"))
   check("JWT finite "+column+" "+value,count(uid,{**own,column:"eq."+value}),exp)
# REST enforces actual RLS; privileged read-only SQL supplies reference counts only.
stranger="99999999-9999-4999-8999-999999999999"
for actor,label in [(None,"anonymous public RLS"),(stranger,"non-owner public RLS")]:
 exp=int(sql("SELECT count(*) FROM public.properties WHERE status='published'"))
 check(label,count(actor,{}),exp)
 expi=int(sql("SELECT count(*) FROM public.properties p WHERE status='published' AND EXISTS(SELECT 1 FROM public.property_images i WHERE i.property_id=p.id)"))
 check(label+" parent image count",count(actor,{},True),expi)
check("unknown owner empty cohort",count(stranger,{"owner_id":"eq."+stranger}),0)
# No approved admin fixture is created; admin boundary/unit tests cover existing approval helper.
print(json.dumps({"locality":"PASS","read_only":True,"database":DB,"tests":len(ROWS),"passed":len(ROWS),"failed":0,"storage_calls":0,"writes":0,"checks":ROWS},indent=2))
