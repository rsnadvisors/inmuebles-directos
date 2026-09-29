#!/usr/bin/env python3
"""Real old/new Next publication against disposable baseline/expand/contract DB.

OLD_APP_URL and NEW_APP_URL must point to locally served immutable checkouts.
Only synthetic lab users and images are created. Every scenario resets the lab.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import master_ownership as master
import private_draft_images as private
import profile_authorization as local

ROOT = pathlib.Path(__file__).resolve().parents[2]
HISTORICAL = ROOT / "tests/security/fixtures/20260909040437_remote_history_TEST_ONLY.sql"


def publish(app_url: str, token: str) -> tuple[int, dict]:
    local.reject_remote_value("application URL", app_url)
    boundary = "synthetic-" + uuid.uuid4().hex
    fields = {
        "title": "Synthetic compatibility house", "description": "Synthetic isolated publication",
        "address": "Synthetic address", "city": "Piura", "region": "Piura",
        "operation": "Vender", "type": "Casas", "price": "100", "currency": "PEN",
        "latitude": "-5.19", "longitude": "-80.63", "coordinatesConfirmed": "true",
    }
    body = bytearray()
    for name, value in fields.items():
        body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
    body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"images\"; filename=\"synthetic.png\"\r\nContent-Type: image/png\r\n\r\n".encode())
    body.extend(private.PNG)
    body.extend(f"\r\n--{boundary}--\r\n".encode())
    session = {"access_token": token, "refresh_token": "synthetic-unused",
               "token_type": "bearer", "expires_at": int(time.time()) + 3600, "expires_in": 3600}
    cookie = base64.urlsafe_b64encode(json.dumps(session).encode()).decode().rstrip("=")
    request = urllib.request.Request(app_url.rstrip("/") + "/api/publicar", data=bytes(body), method="POST",
        # Next dev normalizes its request URL to localhost even when the SSH
        # reverse tunnel is addressed as 127.0.0.1 from the isolated host.
        headers={"Origin": app_url.rstrip("/").replace("127.0.0.1", "localhost"),
                 "Cookie": "sb-127-auth-token=base64-" + cookie,
                 "Content-Type": "multipart/form-data; boundary=" + boundary})
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def run_scenario(app_url: str, app: str, phase: str) -> None:
    root = master.prepare()
    try:
        if phase in ("A", "B"):
            shutil.copy2(private.EXPAND, root / "supabase/migrations" / private.EXPAND.name)
        if phase == "B":
            shutil.copy2(private.CONTRACT, root / "supabase/migrations" / private.CONTRACT.name)
        local.assert_static_target_safety(root)
        local.reset_local_database(root)
        status = local.local_status(root)
        client = local.LocalClient(status["api_url"], status["anon_key"])
        if master.sql("select count(*) from auth.users") != "0":
            raise AssertionError("lab was not clean before scenario")
        owner = client.signup("compat-" + uuid.uuid4().hex[:8], {"full_name": "Synthetic Owner"})
        client.profile(owner)
        http, result = publish(app_url, owner["token"])
        if http != 200 or not result.get("ok") or result.get("status") != "published":
            raise AssertionError(f"{app}+{phase} publication failed HTTP {http}: {str(result)[:350]}")
        slug = result["slug"]
        properties = private.rows(client, "properties", {"slug": "eq." + slug})
        if len(properties) != 1 or properties[0]["status"] != "published":
            raise AssertionError(f"{app}+{phase} published property not readable")
        images = private.rows(client, "property_images", {"property_id": "eq." + properties[0]["id"]})
        if len(images) != 1:
            raise AssertionError(f"{app}+{phase} image metadata missing")
        image = images[0]
        expected_bucket = "property-images" if app == "old" else "property-images-private"
        if phase != "baseline" and image["storage_bucket"] != expected_bucket:
            raise AssertionError(f"{app}+{phase} image bucket mismatch")
        if app == "old":
            if not image["public_url"] or "/object/public/property-images/" not in image["public_url"]:
                raise AssertionError("legacy public URL missing")
            code, data = private.storage(client, "GET", "object/public/property-images/" + image["storage_path"])
        else:
            if image["public_url"] is not None:
                raise AssertionError("private image has public URL")
            code, data = private.storage(client, "GET", "object/authenticated/property-images-private/" + image["storage_path"])
            private.expect_private_listing(client, image["storage_path"], None, False)
        if code != 200 or data != private.PNG:
            raise AssertionError(f"{app}+{phase} published image unreadable: HTTP {code}")
        if app == "new":
            code, data, _ = private.app_get(app_url, "/api/property-images/" + image["id"])
            if code != 200 or data != private.PNG:
                raise AssertionError(f"new+{phase} application delivery failed: HTTP {code}")
        if phase == "B":
            draft_slug = "synthetic-contract-" + uuid.uuid4().hex
            draft = {"title": "Synthetic contract check", "slug": draft_slug,
                     "listing_type": "sale", "property_type": "house", "status": "draft",
                     "price": 100, "currency": "PEN", "lat": -5, "lng": -80,
                     "owner_id": owner["id"]}
            created, _ = client.request("POST", "/rest/v1/properties", token=owner["token"], payload=draft)
            if created not in (200, 201):
                raise AssertionError("contract draft creation failed")
            draft_id = private.rows(client, "properties", {"slug": "eq." + draft_slug}, owner["token"])[0]["id"]
            legacy_path = f"{owner['id']}/{draft_id}/{uuid.uuid4()}.png"
            code, _ = private.storage(client, "POST", "object/property-images/" + legacy_path,
                                      owner["token"], private.PNG, "image/png")
            if code < 400:
                raise AssertionError("contract still permits legacy public draft upload")
            metadata, _ = client.request("POST", "/rest/v1/property_images", token=owner["token"],
                payload={"property_id": draft_id, "storage_bucket": "property-images",
                         "storage_path": legacy_path, "public_url": "https://example.invalid/legacy.png"})
            if metadata < 400:
                raise AssertionError("contract still permits legacy public draft metadata")
            finalize, _ = client.request("POST", "/rest/v1/rpc/finalize_own_property_publication",
                                         token=owner["token"], payload={"p_property_id": draft_id})
            if finalize < 400:
                raise AssertionError("contract still permits legacy finalization RPC")
            print("PASS contract: legacy public draft upload, metadata and RPC denied")
        print(f"PASS {app}+{phase}: real application create/upload/metadata/finalize/read")
    finally:
        try:
            local.reset_local_database(root)
            counts = master.sql("select (select count(*) from auth.users), "
                "(select count(*) from public.properties), "
                "(select count(*) from public.property_images), "
                "(select count(*) from storage.objects where bucket_id in "
                "('property-images','property-images-private'))")
            if counts != "0|0|0|0":
                raise AssertionError(f"synthetic cleanup incomplete: {counts}")
        finally:
            shutil.rmtree(root)


def contract_precondition() -> None:
    """Every in-flight draft shape must abort Contract without partial lockdown."""
    root = master.prepare()
    try:
        shutil.copy2(private.EXPAND, root / "supabase/migrations" / private.EXPAND.name)
        migration = root / "supabase/migrations" / private.CONTRACT.name
        for shape in ("zero-image", "object-only", "metadata-only", "full", "multiple"):
            local.reset_local_database(root)
            status = local.local_status(root)
            client = local.LocalClient(status["api_url"], status["anon_key"])
            owner = client.signup("contract-" + uuid.uuid4().hex[:8], {"full_name": "Synthetic Owner"})
            client.profile(owner)

            def draft() -> tuple[str, str]:
                slug = "synthetic-pending-" + uuid.uuid4().hex
                created, _ = client.request("POST", "/rest/v1/properties", token=owner["token"],
                    payload={"title": "Synthetic pending", "slug": slug, "listing_type": "sale",
                             "property_type": "house", "status": "draft", "price": 100,
                             "currency": "PEN", "lat": -5, "lng": -80, "owner_id": owner["id"]})
                if created not in (200, 201):
                    raise AssertionError("negative fixture draft creation failed")
                property_id = private.rows(client, "properties", {"slug": "eq." + slug}, owner["token"])[0]["id"]
                return property_id, f"{owner['id']}/{property_id}/{uuid.uuid4()}.png"

            property_id, path = draft()
            if shape == "multiple":
                second_id, second_path = draft()
                add_legacy_image(client, owner["token"], second_id, second_path, True, True)
            if shape in ("object-only", "full"):
                add_legacy_image(client, owner["token"], property_id, path, True, False)
            if shape in ("metadata-only", "full"):
                add_legacy_image(client, owner["token"], property_id, path, False, True)
            if shape == "zero-image":
                if master.sql("select (select count(*) from public.property_images where property_id='"
                              + property_id + "'),(select count(*) from storage.objects where bucket_id="
                              "'property-images' and name like '%/" + property_id + "/%')") != "0|0":
                    raise AssertionError("zero-image race was not reproduced")
                # This is the exact predicate used by the original Contract.
                if master.sql("select exists (select 1 from public.property_images i join "
                              "public.properties p on p.id=i.property_id where p.status='draft' "
                              "and i.storage_bucket='property-images') or exists "
                              "(select 1 from storage.objects o join public.properties p "
                              "on p.id::text=(storage.foldername(o.name))[2] where "
                              "o.bucket_id='property-images' and p.status='draft')") != "f":
                    raise AssertionError("original zero-image preflight unexpectedly detected the draft")
                print("PASS old Contract reproduction: draft exists, images=0, objects=0, old predicate=false")

            before = contract_state()
            shutil.copy2(private.CONTRACT, migration)
            attempt = subprocess.run(["supabase", "migration", "up", "--local",
                "--workdir", str(root)], text=True, capture_output=True, timeout=90)
            if attempt.returncode == 0 or "unsafe legacy drafts exist" not in attempt.stderr + attempt.stdout:
                raise AssertionError("Contract did not reject " + shape + ": " + attempt.stderr[-400:])
            after = contract_state()
            if after != before:
                raise AssertionError("rejected Contract changed policy, grant, RPC, bucket or migration history")
            if master.sql("select has_function_privilege('authenticated',"
                          "'public.finalize_own_property_publication(uuid)','EXECUTE')") != "t":
                raise AssertionError("rejected Contract revoked old RPC")
            print("PASS Contract rejects " + shape + ": catalogs and migration history unchanged")
            if shape == "zero-image" and os.environ.get("OLD_APP_URL"):
                old_url = os.environ["OLD_APP_URL"]
                local.reject_remote_value("old application URL", old_url)
                http, result = publish(old_url, owner["token"])
                if http != 200 or result.get("status") != "published":
                    raise AssertionError("R5 failed: old publisher cannot complete after rejected Contract")
                print("PASS R5: old application still publishes after rejected Contract")
            migration.unlink()

        # The failed attempt is retryable: remove only synthetic users/data by
        # resetting the disposable lab, then apply Contract exactly once.
        local.reset_local_database(root)
        if master.sql("select count(*) from public.properties where status='draft'") != "0":
            raise AssertionError("unsafe fixture survived local cleanup")
        shutil.copy2(private.CONTRACT, migration)
        applied = subprocess.run(["supabase", "migration", "up", "--local",
            "--workdir", str(root)], text=True, capture_output=True, timeout=90)
        if applied.returncode != 0:
            raise AssertionError("Contract failed after fixture cleanup: " + applied.stderr[-400:])
        if master.sql("select count(*) from supabase_migrations.schema_migrations "
                      "where version='20260927153000'") != "1":
            raise AssertionError("successful Contract was not recorded exactly once")
        again = subprocess.run(["supabase", "migration", "up", "--local",
            "--workdir", str(root)], text=True, capture_output=True, timeout=90)
        if again.returncode != 0 or master.sql(
                "select count(*) from supabase_migrations.schema_migrations "
                "where version='20260927153000'") != "1":
            raise AssertionError("Contract reattempt was not idempotent")
        print("PASS Contract after cleanup: A retained, B applied once, second up no-op")
    finally:
        try:
            local.reset_local_database(root)
            if master.sql("select (select count(*) from auth.users), (select count(*) from public.properties), "
                          "(select count(*) from public.property_images), (select count(*) from storage.objects "
                          "where bucket_id in ('property-images','property-images-private'))") != "0|0|0|0":
                raise AssertionError("negative fixture cleanup incomplete")
        finally:
            shutil.rmtree(root)


def add_legacy_image(client: local.LocalClient, token: str, property_id: str, path: str,
                     object_present: bool, metadata_present: bool) -> None:
    if object_present:
        code, _ = private.storage(client, "POST", "object/property-images/" + path,
                                  token, private.PNG, "image/png")
        if code not in (200, 201):
            raise AssertionError("negative fixture legacy upload failed")
    if metadata_present:
        code, _ = client.request("POST", "/rest/v1/property_images", token=token,
            payload={"property_id": property_id, "storage_path": path,
                     "public_url": client.api_url + "/storage/v1/object/public/property-images/" + path})
        if code not in (200, 201):
            raise AssertionError("negative fixture legacy metadata failed")


def contract_state() -> str:
    """Stable catalog fingerprint, including rollback-relevant permissions."""
    return master.sql("""
      select jsonb_build_object(
        'policies', (select coalesce(jsonb_agg(to_jsonb(p) order by p.schemaname,p.tablename,p.policyname),
          '[]'::jsonb) from pg_policies p where
          (p.schemaname='storage' and p.tablename='objects') or
          (p.schemaname='public' and p.tablename='property_images')),
        'table_grants', (select coalesce(jsonb_agg(to_jsonb(g) order by g.table_schema,g.table_name,
          g.grantee,g.privilege_type),'[]'::jsonb) from information_schema.role_table_grants g
          where (g.table_schema='storage' and g.table_name='objects') or
                (g.table_schema='public' and g.table_name in ('properties','property_images'))),
        'rpc_acls', (select coalesce(jsonb_agg(
          jsonb_build_object('name',p.proname,'acl',p.proacl) order by p.proname),'[]'::jsonb)
          from pg_proc p where p.oid in (
            'public.finalize_own_property_publication(uuid)'::regprocedure,
            'public.finalize_private_property_publication(uuid)'::regprocedure)),
        'buckets', (select coalesce(jsonb_agg(to_jsonb(b) order by b.id),'[]'::jsonb)
          from storage.buckets b where id in ('property-images','property-images-private')),
        'history', (select coalesce(jsonb_agg(version order by version),'[]'::jsonb)
          from supabase_migrations.schema_migrations)
      )::text
    """)


def old_contract_lockdown(old_url: str) -> None:
    """The immutable old publisher must fail after Contract closes its path."""
    root = master.prepare()
    try:
        for migration in (private.EXPAND, private.CONTRACT):
            shutil.copy2(migration, root / "supabase/migrations" / migration.name)
        local.reset_local_database(root)
        status = local.local_status(root)
        client = local.LocalClient(status["api_url"], status["anon_key"])
        owner = client.signup("old-contract-" + uuid.uuid4().hex[:8],
                              {"full_name": "Synthetic Owner"})
        client.profile(owner)
        http, result = publish(old_url, owner["token"])
        if http < 400 or result.get("ok") or result.get("status") == "published":
            raise AssertionError("old publisher unexpectedly completed after Contract")
        if master.sql("select count(*) from public.properties where status='published'") != "0":
            raise AssertionError("old publisher left a published row after Contract")
        print(f"PASS old+B: publication rejected at legacy upload (HTTP {http})")
    finally:
        try:
            local.reset_local_database(root)
            if master.sql("select (select count(*) from auth.users), "
                          "(select count(*) from public.properties), "
                          "(select count(*) from public.property_images), "
                          "(select count(*) from storage.objects where bucket_id in "
                          "('property-images','property-images-private'))") != "0|0|0|0":
                raise AssertionError("old+B synthetic cleanup incomplete")
        finally:
            shutil.rmtree(root)


def selective_migration_rehearsal() -> None:
    """Prove A and B are the sole pending files in an unlinked local workspace."""
    root = master.prepare()
    historical_copy = root / "supabase/migrations/20260909040437_remote_history.sql"
    try:
        local.reset_local_database(root)
        local.assert_static_target_safety(root)
        if hashlib.md5(HISTORICAL.read_bytes().rstrip(b"\n")).hexdigest() != (
                "c92a8fc9c03fcdd0dfa20a442c628232"):
            raise AssertionError("historical SQL fixture differs from production migration history")
        # Production has this older remote-only version. Model only its history
        # in the disposable local database. The file is an exact read-only
        # capture of its stored statement, never invented or executed here.
        master.sql("insert into supabase_migrations.schema_migrations(version,name) "
                   "values ('20260909040437','historical_remote_only')")
        shutil.copy2(HISTORICAL, historical_copy)
        before = master.sql("select version from supabase_migrations.schema_migrations "
                            "order by version")
        if "20260909040437" not in before:
            raise AssertionError("remote-only history marker absent in isolated database")

        for source, expected in ((private.EXPAND, "20260926200632"),
                                 (private.CONTRACT, "20260927153000")):
            shutil.copy2(source, root / "supabase/migrations" / source.name)
            local.assert_static_target_safety(root)
            command = ["supabase", "db", "push", "--local", "--skip-vault",
                       "--workdir", str(root)]
            dry = subprocess.run(command + ["--dry-run"], text=True,
                                 capture_output=True, timeout=90)
            dry_text = dry.stdout + dry.stderr
            if dry.returncode != 0 or dry_text.count(expected) != 1:
                raise AssertionError("selective dry-run failed for " + expected + ": "
                                     + dry_text[-500:])
            other = "20260927153000" if expected == "20260926200632" else "20260926200632"
            if other in dry_text or "20260909040437" in dry_text:
                raise AssertionError("selective dry-run includes an unexpected migration")
            print("PASS selective dry-run: only " + expected + " pending")
            applied = subprocess.run(command + ["--yes"], text=True,
                                     capture_output=True, timeout=120)
            if applied.returncode != 0:
                raise AssertionError("selective apply failed for " + expected + ": "
                                     + (applied.stdout + applied.stderr)[-500:])
            after = master.sql("select version from supabase_migrations.schema_migrations "
                               "order by version")
            if after.splitlines() != before.splitlines() + [expected]:
                raise AssertionError("selective apply changed unexpected migration history")
            before = after
            print("PASS selective apply: exactly " + expected + " recorded")
        print("PASS selective history: remote-only version retained; A and B each once")
    finally:
        try:
            # A fresh reset must never execute the historical remote-only
            # statement: the fixture exists solely to match applied history.
            historical_copy.unlink(missing_ok=True)
            local.reset_local_database(root)
            if master.sql("select (select count(*) from auth.users), "
                          "(select count(*) from public.properties), "
                          "(select count(*) from public.property_images), "
                          "(select count(*) from storage.objects where bucket_id in "
                          "('property-images','property-images-private'))") != "0|0|0|0":
                raise AssertionError("selective rehearsal cleanup incomplete")
        finally:
            shutil.rmtree(root)


def run() -> None:
    local.assert_static_target_safety(ROOT)
    if os.environ.get("COMPAT_ONLY") == "contract-precondition":
        contract_precondition()
        return
    if os.environ.get("COMPAT_ONLY") == "selective-migrations":
        selective_migration_rehearsal()
        return
    old_url, new_url = os.environ["OLD_APP_URL"], os.environ["NEW_APP_URL"]
    for url in (old_url, new_url):
        local.reject_remote_value("application URL", url)
    scenarios = (("old", "baseline"), ("old", "A"), ("new", "A"), ("new", "B"))
    only = os.environ.get("COMPAT_ONLY")
    if only == "old+B":
        scenarios = ()
    elif only:
        scenarios = tuple((app, phase) for app, phase in scenarios if f"{app}+{phase}" == only)
        if len(scenarios) != 1:
            raise AssertionError("COMPAT_ONLY must identify one known local scenario")
    for app, phase in scenarios:
        run_scenario(old_url if app == "old" else new_url, app, phase)
    if not only:
        old_contract_lockdown(old_url)
    elif only == "old+B":
        old_contract_lockdown(old_url)
    print(f"CLEANUP: {len(scenarios)} scenario(s) left zero synthetic users, properties, images and objects")


if __name__ == "__main__":
    try:
        run()
    except (AssertionError, RuntimeError, KeyError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
