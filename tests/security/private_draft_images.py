#!/usr/bin/env python3
"""Disposable, loopback-only Storage/RLS integration proof for private drafts.

The test rebuilds the isolated Supabase lab from synthetic fixtures and never
uses a linked project, production URL, production credentials or user data.
"""

from __future__ import annotations

import json
import base64
import os
import pathlib
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
import time

import master_ownership as master
import profile_authorization as local


ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20260926200632_private_draft_image_storage.sql"
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000b49444154789c636000020000050001a5f645400000000049454e44ae426082"
)


def storage(client: local.LocalClient, method: str, suffix: str, token: str | None = None,
            body: bytes | None = None, content_type: str = "application/json") -> tuple[int, bytes]:
    url = client.api_url + "/storage/v1/" + suffix
    local.reject_remote_value("Storage URL", url)
    headers = {"apikey": client.anon_key,
               "Authorization": "Bearer " + (token or client.anon_key),
               "Content-Type": content_type}
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def rows(client: local.LocalClient, table: str, filters: dict[str, str], token: str | None = None):
    path = "/rest/v1/" + table + "?" + urllib.parse.urlencode({**filters, "select": "*"})
    status, data = client.request("GET", path, token=token)
    if status != 200 or not isinstance(data, list):
        raise AssertionError(f"{table} SELECT failed with HTTP {status}")
    return data


def app_get(app_url: str, path: str, token: str | None = None) -> tuple[int, bytes, dict[str, str]]:
    local.reject_remote_value("application URL", app_url)
    headers: dict[str, str] = {}
    if token:
        # The local Supabase URL is 127.0.0.1, so its default SSR storage key
        # is sb-127-auth-token. This cookie exists only for synthetic lab users.
        session = {"access_token": token, "refresh_token": "synthetic-unused",
                   "token_type": "bearer", "expires_at": int(time.time()) + 3600,
                   "expires_in": 3600}
        encoded = base64.urlsafe_b64encode(json.dumps(session).encode()).decode().rstrip("=")
        headers["Cookie"] = "sb-127-auth-token=base64-" + encoded
    request = urllib.request.Request(app_url.rstrip("/") + path, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.read(), {key.lower(): value for key, value in response.headers.items()}
    except urllib.error.HTTPError as error:
        return error.code, error.read(), {key.lower(): value for key, value in error.headers.items()}


def browser_smoke(app_url: str, slug: str, image_id: str, owner_token: str, mode: str) -> None:
    script = os.environ.get("LOCAL_BROWSER_QA_SCRIPT")
    if not script:
        return
    local.reject_remote_value("browser application URL", app_url)
    browser_env = os.environ.copy()
    browser_env["LOCAL_QA_OWNER_TOKEN"] = owner_token
    browser_env["LOCAL_QA_IMAGE_ID"] = image_id
    result = subprocess.run(["node", script, app_url, slug, mode],
                            env=browser_env, capture_output=True, text=True, timeout=180)
    if result.returncode != 0:
        raise AssertionError("isolated browser smoke failed: " + result.stdout[-2000:] + result.stderr[-2000:])
    print(result.stdout.strip())


def expect_private_listing(client: local.LocalClient, path: str, token: str | None, visible: bool) -> None:
    status, data = storage(client, "POST", "object/list/property-images-private", token,
                           json.dumps({"prefix": "", "limit": 100}).encode())
    if status not in (200, 400, 401, 403):
        raise AssertionError(f"private listing unexpected HTTP {status}")
    if visible and status != 200:
        raise AssertionError("owner cannot list own private draft folder")
    if status == 200:
        encoded = data.decode("utf-8", errors="replace")
        # A bucket-root listing can return only the owner prefix. Check the
        # precise property folder too, without treating listing as the proof.
        folder_status, data = storage(client, "POST", "object/list/property-images-private", token,
                                      json.dumps({"prefix": "/".join(path.split("/")[:2]), "limit": 100}).encode())
        if folder_status not in (200, 400, 401, 403):
            raise AssertionError(f"private folder listing unexpected HTTP {folder_status}")
        if folder_status == 200:
            encoded += data.decode("utf-8", errors="replace")
        if visible and path.split("/")[-1] not in encoded:
            raise AssertionError("private object listing did not match role")
        if not visible and any(segment in encoded for segment in
                               (path, path.split("/")[0], path.split("/")[1], path.split("/")[2])):
            raise AssertionError("private object path or filename exposed in listing")


def run() -> None:
    local.assert_static_target_safety(ROOT)
    if not MIGRATION.is_file():
        raise AssertionError("versioned private-image migration missing")
    root = master.prepare()
    shutil.copy2(MIGRATION, root / "supabase/migrations" / MIGRATION.name)
    local.assert_static_target_safety(root)
    try:
        local.reset_local_database(root)
        status = local.local_status(root)
        client = local.LocalClient(status["api_url"], status["anon_key"])
        if master.sql("select count(*) from auth.users") != "0":
            raise AssertionError("lab has unexpected Auth users after reset")
        if master.sql("select public from storage.buckets where id='property-images-private'") != "f":
            raise AssertionError("new bucket is not private")
        if master.sql("select public from storage.buckets where id='property-images'") != "t":
            raise AssertionError("legacy public bucket changed")
        if master.sql("select count(*) from pg_policies where schemaname='storage' and tablename='objects' "
                      "and policyname='owners upload own property images'") != "0":
            raise AssertionError("old public draft upload policy survived")

        owner = client.signup("draft-owner", {"full_name": "Synthetic Owner"})
        other = client.signup("draft-other", {"full_name": "Synthetic Other"})
        for user in (owner, other):
            client.profile(user)
        slug = "private-test-" + uuid.uuid4().hex
        draft = {"title": "Synthetic local house", "slug": slug, "listing_type": "sale",
                 "property_type": "house", "status": "draft", "price": 100, "currency": "PEN",
                 "lat": -5, "lng": -80, "owner_id": owner["id"],
                 "description": "Synthetic local description", "address": "Synthetic local address",
                 "city": "Piura", "region": "Piura", "country": "Peru"}
        created, _ = client.request("POST", "/rest/v1/properties", token=owner["token"], payload=draft)
        if created not in (200, 201):
            raise AssertionError(f"owner draft creation failed: HTTP {created}")
        property_id = rows(client, "properties", {"slug": "eq." + slug}, owner["token"])[0]["id"]
        without_image, _ = client.request("POST", "/rest/v1/rpc/finalize_own_property_publication",
                                          token=owner["token"], payload={"p_property_id": property_id})
        if without_image < 400:
            raise AssertionError("owner finalized a draft without an image")
        path = f"{owner['id']}/{property_id}/{uuid.uuid4()}.png"
        image_suffix = "object/authenticated/property-images-private/" + path
        upload_suffix = "object/property-images-private/" + path
        public_upload = "object/property-images/" + path

        for actor, label in ((None, "anon"), (other["token"], "other")):
            if rows(client, "properties", {"id": "eq." + property_id}, actor):
                raise AssertionError(f"{label} read another user's draft")
            code, _ = storage(client, "POST", upload_suffix, actor, PNG, "image/png")
            if code < 400:
                raise AssertionError(f"{label} uploaded to owner private path")
        code, _ = storage(client, "POST", public_upload, owner["token"], PNG, "image/png")
        if code < 400:
            raise AssertionError("owner uploaded draft bytes to legacy public bucket")
        code, _ = storage(client, "POST", upload_suffix, owner["token"], PNG, "image/png")
        if code not in (200, 201):
            raise AssertionError(f"owner private upload failed: HTTP {code}")
        image_row = {"property_id": property_id, "storage_bucket": "property-images-private",
                     "storage_path": path, "public_url": None, "sort_order": 0, "is_cover": True}
        inserted, _ = client.request("POST", "/rest/v1/property_images", token=owner["token"], payload=image_row)
        if inserted not in (200, 201):
            raise AssertionError(f"owner image metadata insert failed: HTTP {inserted}")
        image = rows(client, "property_images", {"property_id": "eq." + property_id}, owner["token"])[0]
        if image["storage_bucket"] != "property-images-private" or image["public_url"] is not None:
            raise AssertionError("new image source metadata incorrect")

        app_url = os.environ.get("LOCAL_APP_URL")
        if app_url:
            for token, expected in ((None, 404), (owner["token"], 404), (other["token"], 404)):
                code, _, _ = app_get(app_url, "/api/property-images/" + image["id"], token)
                if code != expected:
                    raise AssertionError(f"draft public application delivery returned HTTP {code}")
            for token, expected in ((None, 401), (owner["token"], 200), (other["token"], 404)):
                code, body, headers = app_get(app_url, "/api/property-images/" + image["id"] + "/preview", token)
                if code != expected:
                    raise AssertionError(f"draft preview returned HTTP {code}, expected {expected}")
                if code == 200:
                    cache = headers.get("cache-control", "")
                    if body != PNG or "no-store" not in cache or "private" not in cache:
                        raise AssertionError(
                            f"owner preview bytes/cache differ: length {len(body)}/{len(PNG)}, "
                            f"cache={cache!r}"
                        )
            browser_smoke(app_url, slug, image["id"], owner["token"], "draft")

        for actor, label in ((None, "anon"), (other["token"], "other")):
            if rows(client, "property_images", {"id": "eq." + image["id"]}, actor):
                raise AssertionError(f"{label} read draft image metadata")
            code, _ = storage(client, "GET", image_suffix, actor)
            if code < 400:
                raise AssertionError(f"{label} downloaded exact private draft path")
            expect_private_listing(client, path, actor, False)
            finalized, _ = client.request("POST", "/rest/v1/rpc/finalize_own_property_publication",
                                          token=actor, payload={"p_property_id": property_id})
            if finalized < 400:
                raise AssertionError(f"{label} finalized owner draft")
        code, data = storage(client, "GET", image_suffix, owner["token"])
        if code != 200 or data != PNG:
            raise AssertionError(f"owner exact-path private draft download failed: HTTP {code}")
        expect_private_listing(client, path, owner["token"], True)
        published, published_slug = client.request("POST", "/rest/v1/rpc/finalize_own_property_publication",
                                                   token=owner["token"], payload={"p_property_id": property_id})
        if published != 200 or published_slug != slug:
            raise AssertionError(f"owner finalization failed: HTTP {published}")
        for actor, label in ((None, "anon"), (owner["token"], "owner"), (other["token"], "other")):
            if len(rows(client, "properties", {"id": "eq." + property_id}, actor)) != 1:
                raise AssertionError(f"{label} cannot read published property")
            code, data = storage(client, "GET", image_suffix, actor)
            if code != 200 or data != PNG:
                raise AssertionError(f"{label} cannot download published private-backed image: HTTP {code}")
            if app_url:
                code, body, headers = app_get(app_url, "/api/property-images/" + image["id"], actor)
                if code != 200 or body != PNG or "no-store" not in headers.get("cache-control", ""):
                    raise AssertionError(f"{label} application delivery failed: HTTP {code}")
        expect_private_listing(client, path, None, False)
        expect_private_listing(client, path, other["token"], False)
        if app_url:
            for token, expected in ((None, 401), (owner["token"], 404), (other["token"], 404)):
                code, _, _ = app_get(app_url, "/api/property-images/" + image["id"] + "/preview", token)
                if code != expected:
                    raise AssertionError(f"published image draft preview returned HTTP {code}, expected {expected}")
        print("PASS: published private image remains directly downloadable, but anon/other listing exposes no path")
        # Local service credentials are used only to construct a synthetic
        # legacy object; the application never receives this credential.
        local_status = json.loads(local.run([
            "supabase", "status", "--output", "json", "--workdir", str(root),
        ]).stdout)
        service_key = local_status.get("SERVICE_ROLE_KEY") or local_status.get("service_role_key")
        if not service_key:
            raise AssertionError("local fixture credential unavailable")
        legacy_path = "synthetic/" + uuid.uuid4().hex + ".png"
        code, _ = storage(client, "POST", "object/property-images/" + legacy_path,
                          service_key, PNG, "image/png")
        if code not in (200, 201):
            raise AssertionError(f"synthetic legacy public upload failed: HTTP {code}")
        public_url = client.api_url + "/storage/v1/object/public/property-images/" + legacy_path
        external_url = "https://example.invalid/synthetic-external.png"
        master.sql("insert into public.property_images(property_id,storage_bucket,storage_path,public_url,is_cover,sort_order) values "
                   f"('{property_id}','property-images','{legacy_path}','{public_url}',false,1),"
                   f"('{property_id}','property-images','synthetic/external.png','{external_url}',false,2)")
        code, data = storage(client, "GET", "object/public/property-images/" + legacy_path)
        if code != 200 or data != PNG:
            raise AssertionError(f"legacy public bucket delivery failed: HTTP {code}")
        if app_url:
            code, html, _ = app_get(app_url, "/inmueble/" + slug)
            page = html.decode("utf-8", errors="replace")
            for label, expected in (("private", "/api/property-images/" + image["id"]),
                                    ("legacy public", public_url), ("legacy external", external_url)):
                if expected not in page:
                    raise AssertionError(f"canonical page omitted {label} image source (HTTP {code})")
            if code != 200:
                raise AssertionError(f"canonical page failed: HTTP {code}")
            code, _, _ = app_get(app_url, "/")
            if code != 200:
                raise AssertionError(f"Home failed: HTTP {code}")
            browser_smoke(app_url, slug, image["id"], owner["token"], "published")
        if master.sql("select count(*) from public.property_images where storage_bucket='property-images-private'") != "1":
            raise AssertionError("private metadata missing after publication")
        print("PASS: isolated exact-path owner/other/anon matrix; private listing; owner-only finalization; published downloads; synthetic legacy delivery")
        if app_url:
            print("PASS: local application draft preview/public delivery, canonical three-source rendering, Home")
    finally:
        # Reset to the same synthetic migration state with no users, properties
        # or Storage objects. Do not leave QA data in the shared lab.
        try:
            local.reset_local_database(root)
            if master.sql("select count(*) from auth.users") != "0" or \
               master.sql("select count(*) from public.properties") != "0" or \
               master.sql("select count(*) from public.property_images") != "0" or \
               master.sql("select count(*) from storage.objects where bucket_id in ('property-images', 'property-images-private')") != "0":
                raise AssertionError("isolated lab cleanup left synthetic data")
            print("CLEANUP: isolated lab rebuilt with zero synthetic users and properties")
        finally:
            shutil.rmtree(root)


if __name__ == "__main__":
    try:
        run()
    except (AssertionError, RuntimeError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
