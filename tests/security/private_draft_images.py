#!/usr/bin/env python3
"""Disposable, loopback-only Storage/RLS integration proof for private drafts.

The test rebuilds the isolated Supabase lab from synthetic fixtures and never
uses a linked project, production URL, production credentials or user data.
"""

from __future__ import annotations

import json
import pathlib
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

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


def expect_private_listing(client: local.LocalClient, path: str, token: str | None, visible: bool) -> None:
    status, data = storage(client, "POST", "object/list/property-images-private", token,
                           json.dumps({"prefix": "", "limit": 100}).encode())
    if status not in (200, 400, 401, 403):
        raise AssertionError(f"private listing unexpected HTTP {status}")
    if status == 200:
        encoded = data.decode("utf-8", errors="replace")
        # A bucket-root listing can return only the owner prefix. Check the
        # precise property folder too, without treating listing as the proof.
        _, data = storage(client, "POST", "object/list/property-images-private", token,
                          json.dumps({"prefix": "/".join(path.split("/")[:2]), "limit": 100}).encode())
        encoded += data.decode("utf-8", errors="replace")
        if (path.split("/")[-1] in encoded) != visible:
            raise AssertionError("private object listing did not match role")


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
        # Legacy public URL and external URL remain valid representational
        # fixtures. No legacy object is copied or moved by the migration.
        if master.sql("select count(*) from public.property_images where storage_bucket='property-images-private'") != "1":
            raise AssertionError("private metadata missing after publication")
        print("PASS: isolated exact-path owner/other/anon matrix; private listing; owner-only finalization; published downloads; legacy bucket unchanged")
    finally:
        # Reset to the same synthetic migration state with no users, properties
        # or Storage objects. Do not leave QA data in the shared lab.
        try:
            local.reset_local_database(root)
            print("CLEANUP: isolated lab rebuilt with zero synthetic users and properties")
        finally:
            shutil.rmtree(root)


if __name__ == "__main__":
    try:
        run()
    except (AssertionError, RuntimeError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
