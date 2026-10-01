#!/usr/bin/env python3
"""Adversarial HTTP checks, temporal KPI, keysets and isolated rollback rehearsal."""
import json,pathlib,subprocess,uuid
from admin_rbac import A,E,P,DB,CONTAINER,raw,execute,ACTORS
from admin_rbac_http import http,ROWS,check
ROOT=pathlib.Path(__file__).resolve().parent
def admin(sql,db=DB):
    p=raw(sql,db)
    assert p.returncode==0,p.stderr[:500]
    return p.stdout.strip()
def run_checks():
    path=json.loads((ROOT/"storage-synthetic-paths.json").read_text())[1]
    pid=path.split("/")[1]
    initial=admin("select row_to_json(i) from public.property_images i where storage_path='"+path+"'")
    image=json.loads(initial)
    for status_value in ["draft","published","reserved","sold","rented","archived"]:
        admin("update public.properties set status='"+status_value+"' where id='"+pid+"'")
        for endpoint in ["object/authenticated/","object/info/authenticated/"]:
            status,_=http("GET",endpoint+"property-images-private/"+path,"APPROVED_ADMIN")
            check("approved exact "+status_value+" "+endpoint,status,status==200)
        status,_=http("GET","object/authenticated/property-images-private/"+path,"ANON")
        check("anon bytes "+status_value,status,(status==200)==(status_value=="published") and status<500)
    admin("update public.properties set status='draft' where id='"+pid+"'")
    # Change one persisted invariant at a time and restore in finally. No exploit touches production.
    for label,mutation,restore in [
        ("wrong stored owner","update storage.objects set owner_id='"+ACTORS["FREE_B"]+"'","update storage.objects set owner_id='"+A+"'"),
        ("wrong MIME","update storage.objects set metadata=jsonb_set(metadata,'{mimetype}','\"text/plain\"')","update storage.objects set metadata=jsonb_set(metadata,'{mimetype}','\"image/png\"')"),
        ("MIME extension mismatch","update storage.objects set metadata=jsonb_set(metadata,'{mimetype}','\"image/jpeg\"')","update storage.objects set metadata=jsonb_set(metadata,'{mimetype}','\"image/png\"')"),
    ]:
        admin(mutation+" where bucket_id='property-images-private' and name='"+path+"'")
        try:
            status,_=http("GET","object/info/authenticated/property-images-private/"+path,"APPROVED_ADMIN")
            check("B2 "+label,status,status>=400 and status<500)
        finally: admin(restore+" where bucket_id='property-images-private' and name='"+path+"'")
    admin("delete from public.property_images where id='"+image["id"]+"'")
    try:
        status,_=http("GET","object/info/authenticated/property-images-private/"+path,"APPROVED_ADMIN")
        check("B2 orphan exact object denied",status,status>=400 and status<500)
    finally:
        admin("insert into public.property_images(id,property_id,storage_path,public_url,alt_text,sort_order,is_cover,created_at,storage_bucket) select id,property_id,storage_path,public_url,alt_text,sort_order,is_cover,created_at,storage_bucket from jsonb_populate_record(null::public.property_images,'"+initial.replace("'","''")+"')")
    base=json.loads(execute("select public.admin_dashboard_summary()","APPROVED_ADMIN").stdout)
    start="(date_trunc('day',now() at time zone 'America/Lima') at time zone 'America/Lima')"
    times=[start+"-interval '1 second'",start,start+"-interval '6 days'",start+"-interval '6 days 1 second'",start+"-interval '29 days'",start+"-interval '29 days 1 second'",start+"+interval '2 days'"]
    setup=""
    for n,timestamp in enumerate(times):
        setup+="insert into public.properties(title,slug,listing_type,property_type,status,price,currency,lat,lng,created_at) values ('Synthetic boundary','boundary-"+str(n)+"','rent','office','draft',1,'USD',-5,-80,"+timestamp+");"
    result=execute("select public.admin_dashboard_summary()","APPROVED_ADMIN",before=setup)
    assert result.returncode==0,result.stderr[:400]
    data=json.loads(result.stdout)
    for key,delta in [("today",1),("7d",3),("30d",5)]:
        check("Lima boundary "+key,200,data[key]-base[key]==delta)
    check("future timestamp excluded from time counts",200,data["today"]-base["today"]==1)
    # Keyset carries both timestamp and UUID, no duplicate/missing users.
    seen=[]; before=None; before_id=None
    for n in range(4):
        body={"p_limit":2,"p_before":before,"p_before_id":before_id,"p_search":None,"p_user":None}
        status,bytes_=http("POST","rpc/admin_users","APPROVED_ADMIN",json.dumps(body).encode(),port=54401)
        check("keyset page "+str(n),status,status==200)
        rows=json.loads(bytes_)
        if not rows: break
        seen += [x["profile_id"] for x in rows]
        before,before_id=rows[-1]["profile_created_at"],rows[-1]["profile_id"]
    check("keyset exactly six users no repetition",200,len(seen)==6 and len(set(seen))==6)
    # Rehearse emergency capability rollback on a restore clone of ONLY synthetic lab data.
    clone="rbac_foundation_20260930_rollback"
    assert admin("select count(*) from pg_database where datname='"+clone+"'")=="0","Do not overwrite a lab"
    assert admin("select count(*) from auth.users where email not like '%@rbac.example.invalid'")=="0","Non-synthetic user refused"
    dump=subprocess.run(["docker","exec",CONTAINER,"pg_dump","-U","supabase_admin","-d",DB,"--clean","--if-exists","--no-comments"],text=True,capture_output=True)
    assert dump.returncode==0
    admin('create database "'+clone+'" owner postgres')
    p=subprocess.run(["docker","exec","-i",CONTAINER,"psql","-X","-U","supabase_admin","-d",clone,"-v","ON_ERROR_STOP=1"],input=dump.stdout,text=True,capture_output=True)
    assert p.returncode==0,p.stderr[:600]
    counts_sql="select jsonb_build_array((select count(*) from auth.users),(select count(*) from public.profiles),(select count(*) from public.properties),(select count(*) from public.property_images),(select count(*) from storage.objects),(select count(*) from public.admin_audit_log),(select count(*) from private.dashboard_admins));"
    old=admin(counts_sql,clone)
    rollback=(ROOT/"rollback.sql").read_text()
    admin(rollback,clone)
    check("rollback preserves users/properties/images/Storage/audit/memberships",200,admin(counts_sql,clone)==old)
    claim="begin; set local role authenticated; set local request.jwt.claim.sub='"+E+"';"
    check("rollback disables dashboard access",200,admin(claim+" select public.dashboard_access(); rollback;",clone)=="f")
    p=raw(claim+" select public.admin_dashboard_summary(); rollback;",clone)
    check("rollback revokes admin summary",403,p.returncode!=0)
    check("rollback retains E0 and property guards",200,admin("select count(*) from pg_trigger where tgname in ('e0_guard_profile_system_fields','zz_guard_property_system_fields','guard_property_publication_transition') and not tgisinternal",clone)=="3")
    check("rollback retains closed legacy finalizer",200,admin("select has_function_privilege('authenticated','public.finalize_own_property_publication(uuid)','EXECUTE')",clone)=="f")
    (ROOT/"rbac-extra-results.json").write_text(json.dumps(ROWS,indent=2))
    print("Adversarial/temporal/keyset/rollback:",len(ROWS),"PASS; 0 FAIL")

if __name__=="__main__":
    run_checks()
