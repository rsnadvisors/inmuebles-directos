from pathlib import Path
import hashlib
import os
import re
import shutil
import tomllib

candidate = Path(os.environ["RUNNER_TEMP"]) / "candidate"
target = Path(os.environ["LAB_DIR"]) / "supabase"
config = (candidate / "supabase/config.toml").read_text()
config = re.sub(r'(?m)^project_id = .+$', 'project_id = "sec01-postci-ci"', config)
config = re.sub(r'(?m)^site_url = .+$', 'site_url = "http://127.0.0.1:3101"', config)
config = re.sub(r'(?m)^additional_redirect_urls = .+$',
                'additional_redirect_urls = ["http://127.0.0.1:3101/auth/callback**"]', config)
config = re.sub(r"(?ms)(^\[db\.seed\]\n.*?)^enabled = true$", r"\g<1>enabled = false", config, count=1)
parsed = tomllib.loads(config)
assert parsed["db"]["seed"]["enabled"] is False
assert parsed["local_smtp"]["enabled"] and parsed["local_smtp"]["port"] == 54324
(target / "config.toml").write_text(config)
source = candidate / "supabase/migrations"
migrations = sorted(source.glob("*.sql"))
assert migrations[-1].name == "20261004012121_publication_boundary_expand.sql"
assert not any(p.name.startswith("20261004012123") for p in migrations)
shutil.copyfile(candidate / "tests/security/fixtures/admin_rbac_baseline.sql",
                target / "migrations/20260909040437_baseline_RECONSTRUCTION_TEST_ONLY.sql")
for migration in migrations:
    shutil.copyfile(migration, target / "migrations" / migration.name)
print("EXPAND_SHA256=" + hashlib.sha256(migrations[-1].read_bytes()).hexdigest())
