#!/usr/bin/env python3
"""Synthetic, local Docker-only RBAC security matrix. No remote DB/API accepted."""
import itertools, json, pathlib, subprocess, uuid
ROOT=pathlib.Path(__file__).resolve().parent
CONTAINER="supabase_db_inmuebles-directos"
DB="rbac_foundation_20260930_r3"
ACTORS={"FREE_A":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","FREE_B":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","AGENT":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","HISTORICAL_ADMIN_NOT_APPROVED":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","APPROVED_ADMIN":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","BACKUP_ADMIN":"ffffffff-ffff-4fff-8fff-ffffffffffff"}
A,B,G,H,E,F=ACTORS.values()
P="11111111-1111-4111-8111-111111111111"
PUB="22222222-2222-4222-8222-222222222222"
OTHER="33333333-3333-4333-8333-333333333333"
LEGACY="44444444-4444-4444-8444-444444444444"
MANAGED="55555555-5555-4555-8555-555555555555"
ROWS=[]
def run(args,input=None):
    return subprocess.run(args,input=input,text=True,capture_output=True)
def raw(sql,db=DB):
    assert db in (DB,"rbac_foundation_20260930_rollback"), "Unapproved database refused"
    sql="DO $$ BEGIN IF current_database() <> '"+db+"' THEN RAISE EXCEPTION 'Local target mismatch'; END IF; END $$; "+sql
    return run(["docker","exec","-i",CONTAINER,"psql","-X","-v","ON_ERROR_STOP=1","-U","postgres","-d",db,"-Atq"],sql)
def admin(sql):
    p=raw(sql)
    assert p.returncode==0,p.stderr[:600]
    return p.stdout.strip()
def execute(sql,actor="ANON",before="",keep=False):
    role="anon" if actor=="ANON" else "authenticated"
    claim="" if actor=="ANON" else "set local request.jwt.claim.sub='"+ACTORS[actor]+"';"
    return raw("begin; "+before+" set local role "+role+"; "+claim+" "+sql+"; "+("commit;" if keep else "rollback;"))
def record(name,expected,ok,detail=""):
    ROWS.append({"check":name,"expected":expected,"result":"PASS" if ok else "FAIL","detail":detail})
    if not ok:
        (ROOT/"rbac-security-results.json").write_text(json.dumps(ROWS,indent=2))
        raise AssertionError(name+": "+detail)
def test(name,sql,actor="ANON",want=None,deny=False,before=""):
    p=execute(sql,actor,before)
    ok=(p.returncode!=0) if deny else p.returncode==0 and (want is None or p.stdout.strip()==want)
    record(name,"DENY" if deny else (want if want is not None else "PASS"),ok,(p.stderr if p.returncode else p.stdout).strip()[:350])
    return p
def run_checks():
    info=json.loads(run(["docker","inspect",CONTAINER]).stdout)[0]
    assert info["Config"]["Labels"].get("com.supabase.cli.project")=="inmuebles-directos"
    assert info["NetworkSettings"]["Ports"]["5432/tcp"]==[{"HostIp":"127.0.0.1","HostPort":"54322"}]
    assert admin("select current_database()") == DB
    assert admin("select count(*) from auth.users")=="0","Never reuse an occupied test database"
    assert admin("select count(*) from private.dashboard_admins")=="0"
    assert admin("select count(*) from supabase_migrations.schema_migrations")=="7"
    record("isolated target and seven real CLI migration applications","PASS",True)
    # Trigger-backed Auth fixture, no PII or real identities.
    for label,uid in ACTORS.items():
        admin("insert into auth.users(id,email,raw_user_meta_data) values ('"+uid+"','"+label.lower()+"@rbac.example.invalid','{}');")
        record("signup defaults "+label,"viewer",admin("select role from public.profiles where id='"+uid+"'")=="viewer")
    for uid,role in [(G,"agent"),(H,"admin"),(E,"admin"),(F,"admin")]:
        admin("update public.profiles set role='"+role+"' where id='"+uid+"'")
    def property_insert(pid,title,status,owner,currency="PEN",agent=None):
        return ("insert into public.properties(id,title,slug,listing_type,property_type,status,price,currency,description,address,city,region,lat,lng,owner_id,agent_id) values "
                +"('"+pid+"','"+title+"','"+title+"','sale','house','"+status+"',100,'"+currency+"','Synthetic description','Synthetic address','Synthetic city','Synthetic region',-5,-80,"
                +("'"+owner+"'" if owner else "null")+","+("'"+agent+"'" if agent else "null")+");")
    for args in [(P,"draft-a","draft",A),(PUB,"published-a","published",A,"USD"),(OTHER,"draft-b","draft",B),(LEGACY,"legacy-ownerless","published",None),(MANAGED,"managed-draft","draft",G,"PEN",G)]:
        admin(property_insert(*args))
    for uid in (E,F):
        admin("select private.set_dashboard_admin('"+uid+"',true,'Synthetic isolated approval','"+str(uuid.uuid4())+"')")
    record("operator approvals audited atomically","2",admin("select count(*) from public.admin_audit_log")=="2")
    for actor in ["ANON"]+list(ACTORS):
        approved=actor in ("APPROVED_ADMIN","BACKUP_ADMIN")
        test(actor+" public published read","select count(*) from public.properties where id='"+LEGACY+"'",actor,want="1")
        test(actor+" dashboard predicate","select public.dashboard_access()",actor,want="t" if approved else "f",deny=actor=="ANON")
        for rpc in ["public.admin_dashboard_summary()","public.admin_users(50,null,null,null,null)","public.admin_properties(50,null,null,null,null,null,null,null,null,null,false,null,null,null)"]:
            test(actor+" "+rpc,"select "+rpc,actor,deny=not approved)
        test(actor+" audit visibility","select count(*) from public.admin_audit_log",actor,want="2" if approved else "0",deny=actor=="ANON")
        for op in ["insert into private.dashboard_admins(user_id,enabled,changed_by) values ('"+ACTORS.get(actor,A)+"',true,'forged')","update private.dashboard_admins set enabled=true","delete from private.dashboard_admins","select private.set_dashboard_admin('"+E+"',true,'forged','"+str(uuid.uuid4())+"')"]:
            test(actor+" membership denial "+op.split()[0]," "+op,actor,deny=True)
        test(actor+" forge audit","insert into public.admin_audit_log(action,entity_type,entity_id,request_id,before_data,after_data) values ('forged','profile','"+A+"','"+str(uuid.uuid4())+"','{}','{}')",actor,deny=True)
        test(actor+" alter audit","update public.admin_audit_log set action='forged'",actor,deny=True)
        test(actor+" delete audit","delete from public.admin_audit_log",actor,deny=True)
        test(actor+" truncate audit","truncate public.admin_audit_log",actor,deny=True)
        test(actor+" legacy finalizer closed","select public.finalize_own_property_publication('"+P+"')",actor,deny=True)
    for actor,pid,want in [("FREE_A",P,"1"),("FREE_B",P,"0"),("ANON",P,"0")]:
        test(actor+" draft read","select count(*) from public.properties where id='"+pid+"'",actor,want=want)
    test("FREE_A PR-A editing remains closed","update public.properties set title='attempt' where id='"+P+"' returning id","FREE_A",want="")
    test("FREE_B foreign editing closed","update public.properties set title='attempt' where id='"+P+"' returning id","FREE_B",want="")
    test("FREE_B foreign discard closed","delete from public.properties where id='"+P+"' returning id","FREE_B",want="")
    test("FREE_A own draft creation",property_insert(str(uuid.uuid4()),"synthetic-created","draft",A),"FREE_A")
    test("FREE_A forged ownership insert",property_insert(str(uuid.uuid4()),"synthetic-forged","draft",B),"FREE_A",deny=True)
    test("FREE_A direct published insert",property_insert(str(uuid.uuid4()),"synthetic-forged-public","published",A),"FREE_A",deny=True)
    for col,value in [("id","'99999999-9999-4999-8999-999999999999'"),("role","'admin'"),("created_at","now()+interval '1 day'")]:
        test("E0 "+col,"update public.profiles set "+col+"="+value+" where id='"+A+"'","FREE_A",deny=True)
        test("E0 broad-grant guard "+col,"update public.profiles set "+col+"="+value+" where id='"+A+"'","FREE_A",deny=True,before="grant update on public.profiles to authenticated;")
    test("E0 legitimate own name","update public.profiles set full_name='Synthetic edit' where id='"+A+"' returning full_name","FREE_A",want="Synthetic edit")
    # Exact 29-column guard matrix, with deliberate temporary test-only RLS/grant widening.
    values={"id":"'99999999-9999-4999-8999-999999999999'","code":"'changed'","title":"'changed'","slug":"'changed'","listing_type":"'rent'","property_type":"'apartment'","status":"'archived'","price":"101","currency":"'USD'","maintenance_fee":"1","area_total_m2":"1","area_built_m2":"1","bedrooms":"1","bathrooms":"1","parking_spaces":"1","floors":"1","description":"'changed'","address":"'changed'","district":"'changed'","city":"'changed'","region":"'changed'","country":"'Chile'","lat":"-6","lng":"-81","owner_id":"'"+B+"'","agent_id":"'"+G+"'","published_at":"now()","created_at":"now()+interval '1 day'","updated_at":"now()+interval '1 day'"}
    protected={"id","code","slug","status","owner_id","agent_id","published_at","created_at"}
    draft=set(values)-protected
    published={"description","price","maintenance_fee","area_total_m2","area_built_m2","bedrooms","bathrooms","parking_spaces","floors","updated_at"}
    widen="grant update on public.properties to authenticated; create policy synthetic_test_owner_update on public.properties for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());"
    for pid,state,allowed in [(P,"draft",draft),(PUB,"published",published)]:
        for col,value in values.items():
            # Values must differ: published USD fixture becomes PEN in the currency test.
            if col=="currency" and state=="published": value="'PEN'"
            test("FREE guard "+state+" "+col,"update public.properties set "+col+"="+value+" where id='"+pid+"' returning id","FREE_A",want=pid,deny=col not in allowed,before=widen)
    for actor,pid in [("AGENT",MANAGED),("HISTORICAL_ADMIN_NOT_APPROVED",P),("APPROVED_ADMIN",P)]:
        test(actor+" managed content update","update public.properties set title='Synthetic edit' where id='"+pid+"' returning id",actor,want=pid)
        for col in sorted(protected):
            changed_value="'"+B+"'" if actor=="AGENT" and col=="agent_id" else values[col]
            test(actor+" protected "+col,"update public.properties set "+col+"="+changed_value+" where id='"+pid+"'",actor,deny=True,before="grant update on public.properties to authenticated;")
    # All 6x5 direct state transitions for every ordinary actor: no admin mutation RPC in PR-A.
    states=["draft","published","reserved","sold","rented","archived"]
    for state in states:
        pid=str(uuid.uuid4())
        admin(property_insert(pid,"state-"+state,state,A))
        for destination in states:
            if state==destination: continue
            for actor in ["FREE_A","AGENT","HISTORICAL_ADMIN_NOT_APPROVED","APPROVED_ADMIN"]:
                if actor=="AGENT": # Temporarily select this managed fixture without changing persisted ownership.
                    before="grant update on public.properties to authenticated; create policy synthetic_test_agent_update on public.properties for update to authenticated using (true) with check (true);"
                else: before=widen
                test(actor+" direct "+state+" -> "+destination,"update public.properties set status='"+destination+"' where id='"+pid+"'",actor,deny=True,before=before)
    # Publication validation and idempotency integrity (stored value checked inside the same transaction).
    path=A+"/"+P+"/66666666-6666-4666-8666-666666666666.png"
    before=("insert into storage.objects(bucket_id,name,owner_id,metadata) values ('property-images-private','"+path+"','"+A+"','{\"mimetype\":\"image/png\",\"size\":799}'); "
    +"insert into public.property_images(property_id,storage_path,storage_bucket,public_url) values ('"+P+"','"+path+"','property-images-private',null);")
    test("normal private publication preserves owner and returns slug","select public.finalize_private_property_publication('"+P+"'); select status||':'||owner_id::text from public.properties where id='"+P+"'","FREE_A",want="draft-a\npublished:"+A,before=before)
    test("foreign private finalization denied","select public.finalize_private_property_publication('"+P+"')","FREE_B",deny=True,before=before)
    test("zero-image finalization denied","select public.finalize_private_property_publication('"+P+"')","FREE_A",deny=True)
    for bad in ["{\"mimetype\":\"text/plain\",\"size\":799}","{\"mimetype\":\"image/png\",\"size\":0}","{\"mimetype\":\"image/png\",\"size\":5242881}"]:
        test("B2 finalization rejects "+bad,"select public.finalize_private_property_publication('"+P+"')","FREE_A",deny=True,before=before.replace('{\"mimetype\":\"image/png\",\"size\":799}',bad))
    test("Phase B public draft metadata denied","insert into public.property_images(property_id,storage_path,public_url,storage_bucket) values ('"+P+"','"+path+"','http://127.0.0.1/synthetic','property-images')","FREE_A",deny=True)
    record("Phase B private bucket is private","false",admin("select public from storage.buckets where id='property-images-private'")=="f")
    record("stored draft unchanged after denied/rolled-back finalization","draft",admin("select status from public.properties where id='"+P+"'")=="draft")
    # Authoritative RPC DTO and KPI, no secret DTO fields.
    dto=json.loads(execute("select public.admin_users(50,null,null,null,null)","APPROVED_ADMIN").stdout)
    record("Auth DTO allowlist", "explicit fields only", all(set(x)=={"profile_id","full_name","phone","role","profile_created_at","email","auth_created_at","last_sign_in_at","email_confirmed_at","property_count","published_count","draft_count"} for x in dto))
    for rpc in ["public.admin_users(51,null,null,null,null)","public.admin_users(1,now(),null,null,null)","public.admin_properties(51,null,null,null,null,null,null,null,null,null,false,null,null,null)"]:
        test("pagination fails closed "+rpc,"select "+rpc,"APPROVED_ADMIN",deny=True)
    summary=json.loads(execute("select public.admin_dashboard_summary()","APPROVED_ADMIN").stdout)
    record("KPI profiles/auth counts", "6/6", summary["profiles_total"]==6 and summary["auth_users_total"]==6)
    record("KPI currency segmentation", "PEN and USD distinct", {x["currency"] for x in summary["by_market"]}=={"PEN","USD"})
    record("KPI today bounded Lima time", "count matches SQL", summary["today"]==int(admin("select count(*) from public.properties where created_at >= date_trunc('day',now() at time zone 'America/Lima') at time zone 'America/Lima' and created_at<=now()")))
    # Revoke/retry/last-admin safety and audit transaction rollback.
    request=str(uuid.uuid4())
    admin("select private.set_dashboard_admin('"+E+"',false,'Synthetic revoke','"+request+"')")
    test("revocation immediately observed","select public.dashboard_access()","APPROVED_ADMIN",want="f")
    audit_count=admin("select count(*) from public.admin_audit_log")
    admin("select private.set_dashboard_admin('"+E+"',false,'Synthetic revoke retry','"+request+"')")
    record("membership retry has no duplicate audit","unchanged",admin("select count(*) from public.admin_audit_log")==audit_count)
    p=raw("select private.set_dashboard_admin('"+F+"',false,'Last administrator','"+str(uuid.uuid4())+"')")
    record("last effective admin protected","DENY",p.returncode!=0)
    admin("select private.set_dashboard_admin('"+E+"',true,'Synthetic restore','"+str(uuid.uuid4())+"')")
    p=raw("begin; create function private.synthetic_fail_audit() returns trigger language plpgsql as $$ begin raise exception 'synthetic audit failure'; end $$; create trigger synthetic_fail_audit before insert on public.admin_audit_log for each row execute function private.synthetic_fail_audit(); select private.set_dashboard_admin('"+E+"',false,'Atomic failure','"+str(uuid.uuid4())+"'); commit;")
    record("forced audit failure aborts membership mutation","DENY",p.returncode!=0)
    record("membership remains after audit failure","true",admin("select enabled from private.dashboard_admins where user_id='"+E+"'")=="t")
    p=raw("update public.admin_audit_log set action='corrupt'")
    record("audit append-only against trusted operator","DENY",p.returncode!=0)
    # Public functional data regressions, rolled back per attempt.
    test("anon public features","select count(*) from public.property_features","ANON",want="0")
    test("anon lead insert","insert into public.leads(property_id,full_name) values ('"+LEGACY+"','Synthetic Lead'); reset role; select full_name from public.leads where full_name='Synthetic Lead'","ANON",want="Synthetic Lead")
    test("anon view insert","insert into public.property_views(property_id,session_id) values ('"+LEGACY+"','synthetic-session'); reset role; select session_id from public.property_views where session_id='synthetic-session'","ANON",want="synthetic-session")
    test("own favorites","insert into public.favorites(user_id,property_id) values ('"+A+"','"+LEGACY+"') returning user_id","FREE_A",want=A)
    test("forged favorites","insert into public.favorites(user_id,property_id) values ('"+B+"','"+LEGACY+"')","FREE_A",deny=True)
    (ROOT/"rbac-security-results.json").write_text(json.dumps(ROWS,indent=2))
    print("SQL security matrix:",len(ROWS),"PASS; 0 FAIL")

if __name__=="__main__":
    run_checks()
