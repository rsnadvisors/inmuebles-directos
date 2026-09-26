#!/usr/bin/env python3
"""Isolated RLS regression for E0 + master ownership; never connects remotely."""

from __future__ import annotations

import pathlib
import shutil
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid

import profile_authorization as local

ROOT = pathlib.Path(__file__).resolve().parents[2]
A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
PROPERTY_A = "11111111-1111-4111-8111-111111111111"
PROPERTY_B = "22222222-2222-4222-8222-222222222222"


def sql(statement: str, *, role: str | None = None, user: str | None = None, succeeds: bool = True) -> str:
    if role:
        statement = (
            "begin; set local role " + role + "; "
            + ("set local request.jwt.claim.sub = '" + user + "'; " if user else "")
            + statement + "; rollback;"
        )
    result = local.run([
        "docker", "exec", local.db_container(), "psql", "-v", "ON_ERROR_STOP=1",
        "-U", "postgres", "-d", "postgres", "-Atq", "-c", statement,
    ], check=False)
    if (result.returncode == 0) != succeeds:
        raise AssertionError(
            f"SQL expectation mismatch (expected success={succeeds}): "
            + (result.stderr or result.stdout)[:500]
        )
    return result.stdout.strip()


def prepare() -> pathlib.Path:
    local.assert_static_target_safety(ROOT)
    root = pathlib.Path(tempfile.mkdtemp(prefix="inmuebles-master-ownership-"))
    migrations = root / "supabase" / "migrations"
    migrations.mkdir(parents=True)
    shutil.copy2(ROOT / "supabase" / "config.toml", root / "supabase" / "config.toml")
    for filename, source in (
        ("20260921140000_profiles_baseline_TEST_ONLY.sql", ROOT / "tests/security/fixtures/profiles_baseline.sql"),
        ("20260921140100_property_baseline_TEST_ONLY.sql", ROOT / "tests/security/fixtures/property_baseline.sql"),
        ("20260921140457_harden_profile_authorization.sql", ROOT / "supabase/migrations/20260921140457_harden_profile_authorization.sql"),
        ("20260922185044_master_auth_ownership.sql", ROOT / "supabase/migrations/20260922185044_master_auth_ownership.sql"),
    ):
        shutil.copy2(source, migrations / filename)
    local.assert_static_target_safety(root)
    return root


def run_checks() -> None:
    # Synthetic users; no Auth production account or real data is used.
    sql("set session_replication_role=replica; "
        "insert into public.profiles(id,full_name,role) values "
        f"('{A}','User A','viewer'),('{B}','User B','viewer'); "
        "set session_replication_role=origin; "
        "insert into public.properties(id,title,slug,listing_type,property_type,status,price,currency,lat,lng,owner_id) values "
        f"('{PROPERTY_A}','A','synthetic-a','sale','house','published',100,'PEN',-5,-80,'{A}'),"
        f"('{PROPERTY_B}','B','synthetic-b','sale','house','published',200,'USD',-5,-80,'{B}')")
    # Anonymous publication routes are gone, while published SELECT remains.
    assert "published" in sql("select status from public.properties where id='" + PROPERTY_A + "'", role="anon")
    sql("insert into public.properties(title,slug,listing_type,property_type,status,price,lat,lng) "
        "values ('Anon','anon','sale','house','published',1,-5,-80)", role="anon", succeeds=False)
    sql("insert into public.property_images(property_id,storage_path,public_url) "
        f"values ('{PROPERTY_A}','public/a.jpg','a')", role="anon", succeeds=False)
    sql("insert into storage.objects(bucket_id,name,metadata) values "
        "('property-images','public/a.jpg','{\"mimetype\":\"image/png\",\"size\":1}')", role="anon", succeeds=False)
    # E0 stops a viewer from gaining agent/admin authorization.
    for elevated in ("agent", "admin"):
        sql(f"update public.profiles set role='{elevated}' where id='{A}'", role="authenticated", user=A, succeeds=False)
    assert sql(f"select role from public.profiles where id='{A}'") == "viewer"
    # The old authenticated REST bypass must fail, including privileged status
    # spoofing and assigning another user's UUID. A draft remains non-public.
    for status in ("published", "approved", "reserved", "sold"):
        sql("insert into public.properties(title,slug,listing_type,property_type,status,price,lat,lng,owner_id) "
            f"values ('Spoof','spoof-{status}','sale','land','{status}',300,-5,-80,'{A}')",
            role="authenticated", user=A, succeeds=False)
    sql("insert into public.properties(title,slug,listing_type,property_type,status,price,lat,lng,owner_id) "
        f"values ('A2','synthetic-a2','sale','land','draft',300,-5,-80,'{A}')",
        role="authenticated", user=A)
    sql("insert into public.properties(title,slug,listing_type,property_type,status,price,lat,lng,owner_id) "
        f"values ('B2','synthetic-b2','sale','land','draft',300,-5,-80,'{B}')",
        role="authenticated", user=A, succeeds=False)
    sql("insert into public.properties(title,slug,listing_type,property_type,status,price,lat,lng,owner_id) "
        f"values ('Draft','synthetic-draft','sale','house','draft',300,-5,-80,'{A}')")
    assert not sql("select slug from public.properties where slug='synthetic-draft'", role="anon")
    assert "synthetic-draft" in sql("select slug from public.properties where slug='synthetic-draft'", role="authenticated", user=A)
    assert not sql("update public.properties set status='published' where slug='synthetic-draft' returning id",
                   role="authenticated", user=A)
    sql(f"select public.finalize_own_property_publication(id) from public.properties where slug='synthetic-draft'",
        role="authenticated", user=A, succeeds=False)
    # Even the legacy agent branch must not provide a second direct public
    # creation or draft-to-published transition path.
    sql(f"update public.profiles set role='agent' where id='{B}'")
    sql("insert into public.properties(title,slug,listing_type,property_type,status,price,lat,lng,owner_id,agent_id) "
        f"values ('Agent public','agent-public','sale','house','published',300,-5,-80,'{B}','{B}')",
        role="authenticated", user=B, succeeds=False)
    sql("insert into public.properties(title,slug,listing_type,property_type,status,price,lat,lng,owner_id,agent_id) "
        f"values ('Agent draft','agent-draft','sale','house','draft',300,-5,-80,'{B}','{B}')")
    sql("update public.properties set status='published' where slug='agent-draft' returning id",
        role="authenticated", user=B, succeeds=False)
    assert sql("select status from public.properties where slug='agent-draft'") == "draft"
    assert PROPERTY_B not in sql(f"update public.properties set title='stolen' where id='{PROPERTY_B}' returning id", role="authenticated", user=A)
    assert sql(f"select title from public.properties where id='{PROPERTY_B}'") == "B"
    # Metadata and Storage belong only to an unfinished owner/property pair.
    sql("insert into public.property_images(property_id,storage_path,public_url) "
        f"values ('{PROPERTY_A}','{A}/{PROPERTY_A}/a.png','a')", role="authenticated", user=A, succeeds=False)
    draft_id = sql("select id from public.properties where slug='synthetic-draft'")
    draft_path = f"{A}/{draft_id}/a.png"
    sql("insert into public.property_images(property_id,storage_path,public_url) "
        f"values ('{draft_id}','{draft_path}','http://localhost/storage/v1/object/public/property-images/{draft_path}')",
        role="authenticated", user=A)
    sql("insert into public.property_images(property_id,storage_path,public_url) "
        f"values ('{PROPERTY_B}','{A}/{PROPERTY_B}/b.png','b')", role="authenticated", user=A, succeeds=False)
    valid = '{"mimetype":"image/png","size":128}'
    for name, metadata, succeeds in (
        (f"{A}/{PROPERTY_A}/a.png", valid, False),
        (draft_path, valid, True),
        (f"{A}/{PROPERTY_B}/b.png", valid, False),
        (f"{B}/{PROPERTY_A}/c.png", valid, False),
        (f"{A}/{PROPERTY_A}/d.exe", '{"mimetype":"application/x-msdownload","size":128}', False),
    ):
        sql("insert into storage.objects(bucket_id,name,owner_id,metadata) values "
            f"('property-images','{name}','{A}','{metadata}')", role="authenticated", user=A, succeeds=succeeds)
    # Cleanup is available only for one's own unfinished draft, not a published
    # or foreign object's metadata. No Storage overwrite/move policy remains.
    sql("insert into public.property_images(property_id,storage_path,public_url) values "
        f"('{draft_id}','{draft_path}','http://localhost/storage/v1/object/public/property-images/{draft_path}'),"
        f"('{PROPERTY_A}','{A}/{PROPERTY_A}/published.png','http://localhost/published.png'),"
        f"('{PROPERTY_B}','{B}/{PROPERTY_B}/foreign.png','http://localhost/foreign.png')")
    sql("insert into storage.objects(bucket_id,name,owner_id,metadata) values "
        f"('property-images','{draft_path}','{A}','{valid}'),"
        f"('property-images','{A}/{PROPERTY_A}/published.png','{A}','{valid}'),"
        f"('property-images','{B}/{PROPERTY_B}/foreign.png','{B}','{valid}')")
    assert draft_path in sql(f"delete from public.property_images where storage_path='{draft_path}' "
                             "returning storage_path", role="authenticated", user=A)
    assert not sql("delete from public.property_images where property_id='" + PROPERTY_A + "' returning id",
                   role="authenticated", user=A)
    assert not sql("delete from public.property_images where property_id='" + PROPERTY_B + "' returning id",
                   role="authenticated", user=A)
    assert not sql(f"update public.property_images set storage_path='{A}/{draft_id}/changed.png' "
                   f"where property_id='{draft_id}' returning id", role="authenticated", user=A)
    assert not sql(f"update public.property_images set property_id='{draft_id}' "
                   f"where property_id='{PROPERTY_B}' returning id", role="authenticated", user=A)
    # storage.protect_delete() rejects direct table DELETE even for a valid
    # policy. Storage operations must be exercised through the Storage API.
    assert sql("select file_size_limit from storage.buckets where id='property-images'") == "5242880"
    # Legacy Storage UPDATE and DELETE policies have been deliberately removed;
    # cleanup permissions are limited to own draft objects.
    assert sql("select count(*) from pg_policies where schemaname='storage' and tablename='objects' "
               "and policyname in ('property_images_update_own','property_images_delete_own')") == "0"
    assert sql("select count(*) from pg_policies where schemaname='storage' and tablename='objects' "
               "and cmd='UPDATE' and policyname like 'owners %'") == "0"
    print("PASS: direct published/status/owner spoof denied; draft hidden; incomplete finalization denied; legacy Storage UPDATE/DELETE removed")


def run_auth_publication_checks(root: pathlib.Path) -> None:
    status = local.local_status(root)
    client = local.LocalClient(status["api_url"], status["anon_key"])
    nonce = uuid.uuid4().hex
    email = f"master-owner-{nonce}@example.invalid"
    password = f"Master-local-{nonce}!Aa9"
    signup_status, signup = client.request(
        "POST", "/auth/v1/signup",
        payload={"email": email, "password": password, "data": {"full_name": "Local Owner"}},
    )
    if signup_status not in (200, 201) or not isinstance(signup, dict) or not signup.get("access_token"):
        raise AssertionError(f"local signup failed: HTTP {signup_status}")
    user_id = signup["user"]["id"]
    if client.profile({"id": user_id, "token": signup["access_token"]})["role"] != "viewer":
        raise AssertionError("signup did not create a viewer profile")
    login_status, login = client.request(
        "POST", "/auth/v1/token?grant_type=password",
        payload={"email": email, "password": password},
    )
    if login_status != 200 or not isinstance(login, dict) or not login.get("access_token"):
        raise AssertionError(f"local password login failed: HTTP {login_status}")
    token = login["access_token"]
    user_status, current_user = client.request("GET", "/auth/v1/user", token=token)
    if user_status != 200 or current_user.get("id") != user_id:
        raise AssertionError("authenticated session does not resolve to its user")
    other = client.signup("other-owner")
    if client.profile(other)["role"] != "viewer":
        raise AssertionError("second local user is not a viewer")

    slug = f"local-owner-{nonce}"
    payload = {
        "title": "Local owner property", "slug": slug, "listing_type": "sale",
        "property_type": "house", "status": "published", "price": 100,
        "currency": "PEN", "lat": -5, "lng": -80, "owner_id": user_id,
        "description": "Synthetic local listing", "address": "Test address",
        "city": "Piura", "region": "Piura", "country": "Peru",
    }
    anon_status, _ = client.request("POST", "/rest/v1/properties", payload=payload)
    if anon_status < 400:
        raise AssertionError("anonymous REST publication unexpectedly succeeded")
    bypass_status, _ = client.request("POST", "/rest/v1/properties", token=token, payload=payload)
    if bypass_status < 400:
        raise AssertionError("authenticated direct published REST bypass succeeded")
    for spoof in ("reserved", "sold", "approved"):
        spoof_status, _ = client.request("POST", "/rest/v1/properties", token=token,
                                         payload={**payload, "slug": f"{slug}-{spoof}", "status": spoof})
        if spoof_status < 400:
            raise AssertionError(f"authenticated status spoof succeeded: {spoof}")
    foreign_status, _ = client.request("POST", "/rest/v1/properties", token=token,
                                       payload={**payload, "slug": f"{slug}-foreign", "status": "draft", "owner_id": B})
    if foreign_status < 400:
        raise AssertionError("authenticated owner spoof succeeded")
    insert_status, _ = client.request("POST", "/rest/v1/properties", token=token,
                                      payload={**payload, "status": "draft"})
    if insert_status not in (200, 201):
        raise AssertionError(f"authenticated owner draft REST insert failed: HTTP {insert_status}")
    query = urllib.parse.urlencode({"slug": f"eq.{slug}", "select": "id,owner_id,status"})
    read_status, rows = client.request("GET", f"/rest/v1/properties?{query}", token=token)
    if read_status != 200 or not isinstance(rows, list) or len(rows) != 1:
        raise AssertionError("owner cannot read newly created draft")
    property_id = rows[0]["id"]
    if rows[0]["owner_id"] != user_id or rows[0]["status"] != "draft":
        raise AssertionError("draft lost its verified owner/status")
    public_status, public_rows = client.request("GET", f"/rest/v1/properties?{query}")
    if public_status != 200 or public_rows != []:
        raise AssertionError("unfinished draft became publicly visible")
    by_id = urllib.parse.urlencode({"id": f"eq.{property_id}", "select": "id,status"})
    for label, path in (("id", by_id), ("slug", query)):
        anon_status, anon_rows = client.request("GET", f"/rest/v1/properties?{path}")
        other_status, other_rows = client.request("GET", f"/rest/v1/properties?{path}", token=other["token"])
        if anon_status != 200 or anon_rows != [] or other_status != 200 or other_rows != []:
            raise AssertionError(f"draft exposed by {label} to anon or another viewer")
    published_query = urllib.parse.urlencode({"slug": f"eq.{slug}", "status": "eq.published", "select": "id"})
    filtered_status, filtered_rows = client.request("GET", f"/rest/v1/properties?{published_query}")
    if filtered_status != 200 or filtered_rows != []:
        raise AssertionError("draft appeared in Home/canonical public query")
    premature_status, _ = client.request("POST", "/rest/v1/rpc/finalize_own_property_publication",
                                         token=token, payload={"p_property_id": property_id})
    if premature_status < 400:
        raise AssertionError("draft without completed image pipeline was finalized")
    update_filter = urllib.parse.urlencode({"id": f"eq.{property_id}"})
    update_status, update_rows = client.request("PATCH", f"/rest/v1/properties?{update_filter}",
                                                token=token, payload={"status": "published"})
    if update_status < 400 and update_rows not in ([], None):
        raise AssertionError("direct authenticated REST status UPDATE returned a published row")
    if sql("select status from public.properties where id='" + property_id + "'") != "draft":
        raise AssertionError("direct status UPDATE bypassed the controlled transition")

    # Exercise the real local Storage HTTP path in addition to SQL RLS checks.
    image = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
                          "0000000b49444154789c636000020000050001a5f645400000000049454e44ae426082")
    def upload(path: str, content_type: str, *, allowed: bool, body: bytes = image) -> None:
        url = f"{status['api_url']}/storage/v1/object/property-images/{path}"
        local.reject_remote_value("Storage upload URL", url)
        request = urllib.request.Request(url, data=body, method="POST", headers={
            "apikey": status["anon_key"], "Authorization": f"Bearer {token}",
            "Content-Type": content_type,
        })
        detail = ""
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                code = response.status
        except urllib.error.HTTPError as error:
            code = error.code
            detail = error.read(300).decode("utf-8", errors="replace")
        if (code < 400) != allowed:
            raise AssertionError(f"local Storage upload expectation failed: HTTP {code} {detail}")
    def remove(path: str, *, allowed: bool) -> None:
        url = f"{status['api_url']}/storage/v1/object/property-images/{path}"
        local.reject_remote_value("Storage delete URL", url)
        request = urllib.request.Request(url, method="DELETE", headers={
            "apikey": status["anon_key"], "Authorization": f"Bearer {token}",
        })
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                code = response.status
        except urllib.error.HTTPError as error:
            code = error.code
        if (code < 400) != allowed:
            raise AssertionError(f"local Storage delete expectation failed: HTTP {code}")
    upload(f"{user_id}/{property_id}/valid.png", "image/png", allowed=True)
    path = f"{user_id}/{property_id}/valid.png"
    public_url = f"{status['api_url']}/storage/v1/object/public/property-images/{path}"
    local.reject_remote_value("public draft image URL", public_url)
    with urllib.request.urlopen(public_url, timeout=15) as response:
        if response.status != 200 or response.read() != image:
            raise AssertionError("known public-bucket draft image URL did not return the uploaded bytes")
    if sql("select status from public.properties where id='" + property_id + "'") != "draft":
        raise AssertionError("Storage upload changed the draft state")
    filtered_status, filtered_rows = client.request("GET", f"/rest/v1/properties?{published_query}")
    if filtered_status != 200 or filtered_rows != []:
        raise AssertionError("draft appeared in public query after Storage upload")
    cleanup_path = f"{user_id}/{property_id}/cleanup.png"
    upload(cleanup_path, "image/png", allowed=True)
    remove(cleanup_path, allowed=True)
    upload(f"{user_id}/{property_id}/invalid.txt", "text/plain", allowed=False)
    upload(f"{user_id}/{PROPERTY_B}/foreign.png", "image/png", allowed=False)
    upload(f"{user_id}/{property_id}/oversize.png", "image/png", allowed=False,
           body=image + b"x" * (5242881 - len(image)))

    metadata_status, _ = client.request("POST", "/rest/v1/property_images", token=token,
        payload={"property_id": property_id, "storage_path": path,
                 "public_url": public_url,
                 "sort_order": 0, "is_cover": True})
    if metadata_status not in (200, 201):
        raise AssertionError(f"local image metadata insert failed: HTTP {metadata_status}")
    image_query = urllib.parse.urlencode({"property_id": f"eq.{property_id}", "select": "id"})
    for label, actor in (("anon", None), ("other", other["token"])):
        image_status, image_rows = client.request("GET", f"/rest/v1/property_images?{image_query}", token=actor)
        if image_status != 200 or image_rows != []:
            raise AssertionError(f"draft image metadata exposed to {label}")
    owner_image_status, owner_images = client.request("GET", f"/rest/v1/property_images?{image_query}", token=token)
    if owner_image_status != 200 or len(owner_images) != 1:
        raise AssertionError("owner cannot read their draft image metadata")
    other_finalize, _ = client.request("POST", "/rest/v1/rpc/finalize_own_property_publication",
        token=other["token"], payload={"p_property_id": property_id})
    if other_finalize < 400 or sql("select status from public.properties where id='" + property_id + "'") != "draft":
        raise AssertionError("another viewer finalized the owner's draft")
    finalize_status, finalized_slug = client.request("POST", "/rest/v1/rpc/finalize_own_property_publication",
        token=token, payload={"p_property_id": property_id})
    if finalize_status != 200 or finalized_slug != slug:
        raise AssertionError(f"controlled finalization failed: HTTP {finalize_status}")
    remove(path, allowed=False)
    public_status, public_rows = client.request("GET", f"/rest/v1/properties?{query}")
    if public_status != 200 or len(public_rows) != 1 or public_rows[0]["status"] != "published":
        raise AssertionError("completed listing did not become publicly visible")
    filtered_status, filtered_rows = client.request("GET", f"/rest/v1/properties?{published_query}")
    public_image_status, public_images = client.request("GET", f"/rest/v1/property_images?{image_query}")
    if filtered_status != 200 or len(filtered_rows) != 1 or public_image_status != 200 or len(public_images) != 1:
        raise AssertionError("finalized property or image is absent from the public query")
    foreign_finalize, _ = client.request("POST", "/rest/v1/rpc/finalize_own_property_publication",
        token=token, payload={"p_property_id": PROPERTY_B})
    if foreign_finalize < 400:
        raise AssertionError("foreign property finalization was accepted")

    logout_status, _ = client.request("POST", "/auth/v1/logout", token=token)
    if logout_status not in (200, 204):
        raise AssertionError(f"local logout failed: HTTP {logout_status}")
    print("PASS: local Auth; direct published REST denied; draft hidden; Storage HTTP upload; controlled finalization")


def verify_unknown_policy_fails_closed() -> None:
    root = prepare()
    try:
        (root / "supabase" / "migrations" / "20260922180000_unknown_storage_policy_TEST_ONLY.sql").write_text(
            "create policy security_test_unreviewed_update on storage.objects "
            "for update to authenticated using (bucket_id='property-images');\n",
            encoding="utf-8",
        )
        result = local.reset_local_database(root, check=False)
        if result.returncode == 0 or "unreviewed policy" not in (result.stdout + result.stderr):
            raise AssertionError("unknown Storage UPDATE policy did not fail the master preflight")
        if sql("select count(*) from pg_policies where schemaname='storage' and tablename='objects' "
               "and policyname='property_images_update_own'") != "1":
            raise AssertionError("failed migration partially removed the known legacy Storage policy")
        if sql("select count(*) from pg_policies where schemaname='public' and tablename='properties' "
               "and policyname='owners publish own properties'") != "0":
            raise AssertionError("failed migration partially added owner publication permissions")
        print("PASS: unknown Storage UPDATE policy fails before any master mutation")
    finally:
        shutil.rmtree(root)


def main() -> None:
    root = prepare()
    try:
        local.reset_local_database(root)
        run_checks()
        run_auth_publication_checks(root)
        verify_unknown_policy_fails_closed()
    finally:
        shutil.rmtree(root)


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, RuntimeError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
