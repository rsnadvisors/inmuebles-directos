#!/usr/bin/env python3
"""Isolated RLS regression for E0 + master ownership; never connects remotely."""

from __future__ import annotations

import pathlib
import shutil
import sys
import tempfile

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
            + ("select set_config('request.jwt.claim.sub','" + user + "',true); " if user else "")
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
    # Owner A can insert for A; cannot assign ownership to B or manage B's row.
    sql("insert into public.properties(title,slug,listing_type,property_type,status,price,lat,lng,owner_id) "
        f"values ('A2','synthetic-a2','sale','land','published',300,-5,-80,'{A}')",
        role="authenticated", user=A)
    sql("insert into public.properties(title,slug,listing_type,property_type,status,price,lat,lng,owner_id) "
        f"values ('B2','synthetic-b2','sale','land','published',300,-5,-80,'{B}')",
        role="authenticated", user=A, succeeds=False)
    assert PROPERTY_B not in sql(f"update public.properties set title='stolen' where id='{PROPERTY_B}' returning id", role="authenticated", user=A)
    assert sql(f"select title from public.properties where id='{PROPERTY_B}'") == "B"
    # Metadata and Storage belong only to the synthetic owner/property pair.
    sql("insert into public.property_images(property_id,storage_path,public_url) "
        f"values ('{PROPERTY_A}','{A}/{PROPERTY_A}/a.png','a')", role="authenticated", user=A)
    sql("insert into public.property_images(property_id,storage_path,public_url) "
        f"values ('{PROPERTY_B}','{A}/{PROPERTY_B}/b.png','b')", role="authenticated", user=A, succeeds=False)
    valid = '{"mimetype":"image/png","size":128}'
    for name, metadata, succeeds in (
        (f"{A}/{PROPERTY_A}/a.png", valid, True),
        (f"{A}/{PROPERTY_B}/b.png", valid, False),
        (f"{B}/{PROPERTY_A}/c.png", valid, False),
        (f"{A}/{PROPERTY_A}/d.exe", '{"mimetype":"application/x-msdownload","size":128}', False),
        (f"{A}/{PROPERTY_A}/large.png", '{"mimetype":"image/png","size":5242881}', False),
    ):
        sql("insert into storage.objects(bucket_id,name,owner_id,metadata) values "
            f"('property-images','{name}','{A}','{metadata}')", role="authenticated", user=A, succeeds=succeeds)
    assert sql("select file_size_limit from storage.buckets where id='property-images'") == "5242880"
    print("PASS: anonymous bypass closed; public read; E0 role guard; owner isolation; image and Storage policies")


def main() -> None:
    root = prepare()
    try:
        local.reset_local_database(root)
        run_checks()
    finally:
        shutil.rmtree(root)


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, RuntimeError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
