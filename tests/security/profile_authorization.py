#!/usr/bin/env python3
"""Reproducible, fail-closed E0 profile authorization tests for local Supabase only."""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
import uuid

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
CONFIG = REPO_ROOT / "supabase" / "config.toml"
FIXTURE = REPO_ROOT / "tests" / "security" / "fixtures" / "profiles_baseline.sql"
MIGRATIONS = sorted((REPO_ROOT / "supabase" / "migrations").glob("*_harden_profile_authorization.sql"))
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
PROJECT_ID = "inmuebles-directos"


def run(command: list[str], *, cwd: pathlib.Path | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    if check and result.returncode != 0:
        safe_stdout = result.stdout.replace("postgres:postgres@", "postgres:[local-password]@")
        safe_stderr = result.stderr.replace("postgres:postgres@", "postgres:[local-password]@")
        raise RuntimeError(
            f"command failed ({result.returncode}): {command[0]} {command[1] if len(command) > 1 else ''}\n"
            f"stdout:\n{safe_stdout}\nstderr:\n{safe_stderr}"
        )
    return result


def reject_remote_value(label: str, value: str) -> None:
    lowered = value.lower()
    if "supabase.co" in lowered:
        raise RuntimeError(f"unsafe remote target in {label}")
    parsed = urllib.parse.urlparse(value)
    if parsed.hostname and parsed.hostname not in LOCAL_HOSTS:
        raise RuntimeError(f"non-local host in {label}: {parsed.hostname}")


def assert_static_target_safety(workdir: pathlib.Path) -> None:
    if len(MIGRATIONS) != 1:
        raise RuntimeError(f"expected one E0 migration, found {len(MIGRATIONS)}")
    if not CONFIG.is_file() or not FIXTURE.is_file():
        raise RuntimeError("versioned config or test fixture is missing")
    config_text = CONFIG.read_text(encoding="utf-8")
    if f'project_id = "{PROJECT_ID}"' not in config_text:
        raise RuntimeError("unexpected local project_id")
    active_config = "\n".join(line.split("#", 1)[0] for line in config_text.splitlines())
    if "supabase.co" in active_config.lower():
        raise RuntimeError("remote Supabase URL found in active local config")
    project_ref = workdir / "supabase" / ".temp" / "project-ref"
    if project_ref.exists():
        value = project_ref.read_text(encoding="utf-8").strip()
        if value:
            raise RuntimeError("linked project-ref detected; local reset aborted")
    for key in ("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "DATABASE_URL", "POSTGRES_URL", "DB_URL"):
        value = os.environ.get(key)
        if value:
            reject_remote_value(f"environment variable {key}", value)


def local_status(workdir: pathlib.Path) -> dict[str, str]:
    result = run(["supabase", "status", "--output", "json", "--workdir", str(workdir)])
    status = json.loads(result.stdout)
    api_url = status.get("API_URL") or status.get("api_url")
    db_url = status.get("DB_URL") or status.get("db_url")
    anon_key = status.get("ANON_KEY") or status.get("anon_key")
    if not api_url or not db_url or not anon_key:
        raise RuntimeError("Supabase local status omitted API_URL, DB_URL, or ANON_KEY")
    reject_remote_value("API_URL", api_url)
    reject_remote_value("DB_URL", db_url)
    return {"api_url": api_url.rstrip("/"), "db_url": db_url, "anon_key": anon_key}


def db_container() -> str:
    result = run(["docker", "ps", "--format", "{{.Names}}"])
    matches = [name for name in result.stdout.splitlines() if name == f"supabase_db_{PROJECT_ID}"]
    if len(matches) != 1:
        raise RuntimeError(f"expected one local database container, found {matches}")
    return matches[0]


def admin_sql(sql: str) -> str:
    result = run([
        "docker", "exec", db_container(), "psql", "-v", "ON_ERROR_STOP=1",
        "-U", "postgres", "-d", "postgres", "-Atq", "-c", sql,
    ])
    return result.stdout.strip()


def build_fresh_local_database() -> tuple[pathlib.Path, dict[str, str], float]:
    assert_static_target_safety(REPO_ROOT)
    temp_root = pathlib.Path(tempfile.mkdtemp(prefix="inmuebles-e0-security-"))
    temp_supabase = temp_root / "supabase"
    migrations_dir = temp_supabase / "migrations"
    migrations_dir.mkdir(parents=True)
    shutil.copy2(CONFIG, temp_supabase / "config.toml")
    shutil.copy2(FIXTURE, migrations_dir / "20260921140000_profiles_baseline_TEST_ONLY.sql")
    shutil.copy2(MIGRATIONS[0], migrations_dir / MIGRATIONS[0].name)
    (temp_root / "TEST_ONLY_LOCAL_REBUILD").write_text(
        "This temporary workdir reconstructs the local security fixture only.\n", encoding="utf-8"
    )
    assert_static_target_safety(temp_root)
    before = local_status(REPO_ROOT)
    print(f"SAFETY api_host={urllib.parse.urlparse(before['api_url']).hostname} "
          f"db_host={urllib.parse.urlparse(before['db_url']).hostname} linked_project_ref=absent")
    started = time.monotonic()
    result = run([
        "supabase", "db", "reset", "--local", "--no-seed", "--network-id", "e0-local-network", "--workdir", str(temp_root)
    ])
    elapsed = time.monotonic() - started
    status = local_status(temp_root)
    history = admin_sql(
        "select version from supabase_migrations.schema_migrations "
        "where version in ('20260921140000','20260921140457') order by version;"
    ).splitlines()
    if history != ["20260921140000", "20260921140457"]:
        raise RuntimeError(f"unexpected migration history: {history}")
    print(f"REBUILD reset_exit={result.returncode} migrations={','.join(history)} elapsed={elapsed:.2f}s")
    return temp_root, status, elapsed


class LocalClient:
    def __init__(self, api_url: str, anon_key: str):
        self.api_url = api_url
        self.anon_key = anon_key

    def request(self, method: str, path: str, *, token: str | None = None, payload: dict | None = None):
        url = self.api_url + path
        reject_remote_value("request URL", url)
        headers = {"apikey": self.anon_key, "Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if method == "PATCH":
            headers["Prefer"] = "return=representation"
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                body = response.read().decode("utf-8")
                return response.status, json.loads(body) if body else None
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8")
            try:
                parsed = json.loads(body)
            except json.JSONDecodeError:
                parsed = {"message": body}
            return error.code, parsed

    def signup(self, label: str, metadata: dict | None = None) -> dict:
        nonce = uuid.uuid4().hex
        status, body = self.request(
            "POST", "/auth/v1/signup",
            payload={
                "email": f"e0-{label}-{nonce}@example.invalid",
                "password": f"E0-local-{nonce}!Aa9",
                "data": metadata or {},
            },
        )
        if status not in (200, 201) or not isinstance(body, dict) or not body.get("access_token"):
            raise AssertionError(f"local signup failed with status {status}")
        return {"id": body["user"]["id"], "token": body["access_token"]}

    def profile(self, user: dict) -> dict:
        path = "/rest/v1/profiles?" + urllib.parse.urlencode({"id": f"eq.{user['id']}", "select": "*"})
        for _ in range(20):
            status, body = self.request("GET", path, token=user["token"])
            if status == 200 and isinstance(body, list) and len(body) == 1:
                return body[0]
            time.sleep(0.1)
        raise AssertionError(f"profile unavailable for local user; last status {status}")

    def patch(self, actor: dict, target_id: str, values: dict):
        path = "/rest/v1/profiles?" + urllib.parse.urlencode({"id": f"eq.{target_id}"})
        return self.request("PATCH", path, token=actor["token"], payload=values)


CLIENT: LocalClient
USERS: dict[str, dict]


def auth_semantics(user_id: str) -> tuple[bool, bool]:
    def invoke(function_name: str) -> bool:
        safe_id = str(uuid.UUID(user_id))
        sql = (
            "begin; set local role authenticated; "
            f"select (set_config('request.jwt.claim.sub','{safe_id}',true) is not null) "
            f"and private.{function_name}(); rollback;"
        )
        lines = [line for line in admin_sql(sql).splitlines() if line in ("t", "f")]
        if lines != ["t"] and lines != ["f"]:
            raise AssertionError(f"unexpected {function_name} result")
        return lines[0] == "t"
    return invoke("is_agent"), invoke("is_admin")


def expect_denied(testcase: unittest.TestCase, actor: dict, target_id: str, values: dict) -> None:
    before = CLIENT.profile(actor) if actor["id"] == target_id else None
    status, body = CLIENT.patch(actor, target_id, values)
    if status < 400:
        testcase.assertEqual(body, [], "unauthorized update unexpectedly affected a row")
    if before is not None:
        after = CLIENT.profile(actor)
        for key in values:
            testcase.assertEqual(after.get(key), before.get(key), f"protected field {key} changed")


class ProfileAuthorizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        global USERS
        USERS = {
            "a": CLIENT.signup("a", {"full_name": "Viewer A"}),
            "b": CLIENT.signup("b", {"full_name": "Viewer B"}),
            "metadata": CLIENT.signup("metadata", {"full_name": "Metadata User", "role": "admin"}),
            "agent": CLIENT.signup("agent", {"full_name": "Legitimate Agent"}),
            "admin": CLIENT.signup("admin", {"full_name": "Legitimate Admin"}),
        }

    def test_01_signup_creates_profile(self):
        profile = CLIENT.profile(USERS["a"])
        self.assertEqual(profile["role"], "viewer")
        self.assertEqual(profile["full_name"], "Viewer A")

    def test_02_signup_metadata_cannot_assign_admin(self):
        self.assertEqual(CLIENT.profile(USERS["metadata"])["role"], "viewer")

    def test_03_own_full_name_update_allowed(self):
        status, body = CLIENT.patch(USERS["a"], USERS["a"]["id"], {"full_name": "Viewer A Updated"})
        self.assertEqual(status, 200)
        self.assertEqual(body[0]["full_name"], "Viewer A Updated")

    def test_04_own_phone_update_allowed(self):
        status, body = CLIENT.patch(USERS["a"], USERS["a"]["id"], {"phone": "+51 999 000 111"})
        self.assertEqual(status, 200)
        self.assertEqual(body[0]["phone"], "+51 999 000 111")

    def test_05_own_avatar_url_update_allowed(self):
        status, body = CLIENT.patch(USERS["a"], USERS["a"]["id"], {"avatar_url": "https://example.invalid/avatar.png"})
        self.assertEqual(status, 200)
        self.assertEqual(body[0]["avatar_url"], "https://example.invalid/avatar.png")

    def test_06_cross_user_update_denied(self):
        before = CLIENT.profile(USERS["b"])["full_name"]
        status, body = CLIENT.patch(USERS["a"], USERS["b"]["id"], {"full_name": "Cross User Mutation"})
        self.assertEqual(status, 200)
        self.assertEqual(body, [])
        self.assertEqual(CLIENT.profile(USERS["b"])["full_name"], before)

    def test_07_own_id_update_denied(self):
        expect_denied(self, USERS["a"], USERS["a"]["id"], {"id": str(uuid.uuid4())})

    def test_08_own_created_at_update_denied(self):
        expect_denied(self, USERS["a"], USERS["a"]["id"], {"created_at": "2000-01-01T00:00:00Z"})

    def test_09_own_role_agent_denied(self):
        expect_denied(self, USERS["a"], USERS["a"]["id"], {"role": "agent"})

    def test_10_own_role_admin_denied(self):
        expect_denied(self, USERS["a"], USERS["a"]["id"], {"role": "admin"})

    def test_11_viewer_is_agent_false(self):
        self.assertEqual(auth_semantics(USERS["a"]["id"])[0], False)

    def test_12_viewer_is_admin_false(self):
        self.assertEqual(auth_semantics(USERS["a"]["id"])[1], False)

    def test_13_legitimate_agent_semantics(self):
        admin_sql(f"update public.profiles set role='agent' where id='{uuid.UUID(USERS['agent']['id'])}';")
        self.assertEqual(auth_semantics(USERS["agent"]["id"]), (True, False))

    def test_14_legitimate_admin_semantics(self):
        admin_sql(f"update public.profiles set role='admin' where id='{uuid.UUID(USERS['admin']['id'])}';")
        self.assertEqual(auth_semantics(USERS["admin"]["id"]), (True, True))

    def test_15_defense_in_depth_and_privilege_restore(self):
        try:
            admin_sql("grant update on table public.profiles to authenticated;")
            status, _ = CLIENT.patch(USERS["a"], USERS["a"]["id"], {"role": "admin"})
            self.assertGreaterEqual(status, 400, "defensive trigger did not block role mutation")
            self.assertEqual(CLIENT.profile(USERS["a"])["role"], "viewer")
        finally:
            admin_sql("revoke update on table public.profiles from authenticated; grant update (full_name, phone, avatar_url) on table public.profiles to authenticated;")
        grants = admin_sql(
            "select has_table_privilege('authenticated','public.profiles','UPDATE'),"
            "has_column_privilege('authenticated','public.profiles','role','UPDATE'),"
            "has_column_privilege('authenticated','public.profiles','created_at','UPDATE'),"
            "has_column_privilege('authenticated','public.profiles','full_name','UPDATE'),"
            "has_column_privilege('authenticated','public.profiles','phone','UPDATE'),"
            "has_column_privilege('authenticated','public.profiles','avatar_url','UPDATE'),"
            "has_table_privilege('anon','public.profiles','UPDATE');"
        )
        self.assertEqual(grants, "f|f|f|t|t|t|f")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rebuild", action="store_true", help="reset only the local DB and apply fixture then E0")
    parser.add_argument("--keep-workdir", action="store_true", help="retain temporary local-only workdir for diagnosis")
    args = parser.parse_args()
    if not args.rebuild:
        parser.error("--rebuild is required so tests cannot depend on mutable prior lab state")

    temp_root: pathlib.Path | None = None
    try:
        temp_root, status, _ = build_fresh_local_database()
        global CLIENT
        CLIENT = LocalClient(status["api_url"], status["anon_key"])
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(ProfileAuthorizationTests)
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        print(f"RESULT tests={result.testsRun} failures={len(result.failures)} errors={len(result.errors)}")
        return 0 if result.wasSuccessful() else 1
    finally:
        if temp_root and not args.keep_workdir:
            shutil.rmtree(temp_root, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
