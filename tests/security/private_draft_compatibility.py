#!/usr/bin/env python3
"""Real old/new Next publication against disposable baseline/expand/contract DB.

OLD_APP_URL and NEW_APP_URL must point to locally served immutable checkouts.
Only synthetic lab users and images are created. Every scenario resets the lab.
"""

from __future__ import annotations

import base64
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
    """An unfinished legacy draft must abort Contract with zero policy changes."""
    root = master.prepare()
    try:
        shutil.copy2(private.EXPAND, root / "supabase/migrations" / private.EXPAND.name)
        local.reset_local_database(root)
        status = local.local_status(root)
        client = local.LocalClient(status["api_url"], status["anon_key"])
        owner = client.signup("contract-" + uuid.uuid4().hex[:8], {"full_name": "Synthetic Owner"})
        client.profile(owner)
        slug = "synthetic-pending-" + uuid.uuid4().hex
        created, _ = client.request("POST", "/rest/v1/properties", token=owner["token"],
            payload={"title": "Synthetic pending", "slug": slug, "listing_type": "sale",
                     "property_type": "house", "status": "draft", "price": 100,
                     "currency": "PEN", "lat": -5, "lng": -80, "owner_id": owner["id"]})
        if created not in (200, 201):
            raise AssertionError("negative fixture draft creation failed")
        property_id = private.rows(client, "properties", {"slug": "eq." + slug}, owner["token"])[0]["id"]
        path = f"{owner['id']}/{property_id}/{uuid.uuid4()}.png"
        code, _ = private.storage(client, "POST", "object/property-images/" + path,
                                  owner["token"], private.PNG, "image/png")
        if code not in (200, 201):
            raise AssertionError("negative fixture legacy upload failed")
        metadata, _ = client.request("POST", "/rest/v1/property_images", token=owner["token"],
            payload={"property_id": property_id, "storage_path": path,
                     "public_url": client.api_url + "/storage/v1/object/public/property-images/" + path})
        if metadata not in (200, 201):
            raise AssertionError("negative fixture legacy metadata failed")
        attempt = subprocess.run(["docker", "exec", "-i", local.db_container(), "psql",
            "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-Atq"],
            input=private.CONTRACT.read_text(), text=True, capture_output=True, timeout=30)
        if attempt.returncode == 0 or "unfinished legacy draft exists" not in attempt.stderr:
            raise AssertionError("Contract did not fail closed on unfinished legacy draft")
        if master.sql("select count(*) from pg_policies where schemaname='storage' and "
                      "tablename='objects' and policyname='owners upload own property images'") != "1":
            raise AssertionError("failed Contract partially changed policies")
        if len(private.rows(client, "property_images", {"property_id": "eq." + property_id}, owner["token"])) != 1:
            raise AssertionError("failed Contract changed legacy metadata")
        print("PASS Contract precondition: unfinished legacy draft aborts with zero partial mutation")
    finally:
        try:
            local.reset_local_database(root)
            if master.sql("select (select count(*) from auth.users), (select count(*) from public.properties), "
                          "(select count(*) from public.property_images), (select count(*) from storage.objects "
                          "where bucket_id in ('property-images','property-images-private'))") != "0|0|0|0":
                raise AssertionError("negative fixture cleanup incomplete")
        finally:
            shutil.rmtree(root)


def run() -> None:
    local.assert_static_target_safety(ROOT)
    if os.environ.get("COMPAT_ONLY") == "contract-precondition":
        contract_precondition()
        return
    old_url, new_url = os.environ["OLD_APP_URL"], os.environ["NEW_APP_URL"]
    for url in (old_url, new_url):
        local.reject_remote_value("application URL", url)
    scenarios = (("old", "baseline"), ("old", "A"), ("new", "A"), ("new", "B"))
    only = os.environ.get("COMPAT_ONLY")
    if only:
        scenarios = tuple((app, phase) for app, phase in scenarios if f"{app}+{phase}" == only)
        if len(scenarios) != 1:
            raise AssertionError("COMPAT_ONLY must identify one known local scenario")
    for app, phase in scenarios:
        run_scenario(old_url if app == "old" else new_url, app, phase)
    print(f"CLEANUP: {len(scenarios)} scenario(s) left zero synthetic users, properties, images and objects")


if __name__ == "__main__":
    try:
        run()
    except (AssertionError, RuntimeError, KeyError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
