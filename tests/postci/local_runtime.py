from pathlib import Path
import json
import os
import re
import secrets
import subprocess

root = Path(os.environ["RUNNER_TEMP"])
state = json.loads((root / "lab-status.json").read_text())
assert state["API_URL"] == "http://127.0.0.1:54321"
for name in ("db", "kong", "inbucket"):
    container = "supabase_" + name + "_sec01-postci-ci"
    state_info = subprocess.run(["docker", "inspect", container], check=False,
                                capture_output=True, text=True)
    if name == "inbucket" and state_info.returncode:
        container = "supabase_mailpit_sec01-postci-ci"
        state_info = subprocess.run(["docker", "inspect", container], check=True,
                                    capture_output=True, text=True)
    assert state_info.returncode == 0, name
    cfg = json.loads(state_info.stdout)[0]
    assert cfg["State"]["Running"] and "sec01-postci-net" in cfg["NetworkSettings"]["Networks"]
    assert all(b["HostIp"] == "127.0.0.1" for values in cfg["NetworkSettings"]["Ports"].values()
               for b in (values or []))
hmac = secrets.token_hex(32)
assert re.fullmatch(r"[0-9a-f]{64}", hmac)
query = f"select vault.create_secret('{hmac}','PUBLICATION_BOUNDARY_HMAC_KEY:postci-synthetic');"
p = subprocess.run(["docker", "exec", "-i", "supabase_db_sec01-postci-ci", "psql", "-X", "-U",
                    "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"],
                   input=query, capture_output=True, text=True)
assert p.returncode == 0, "Vault fixture setup failed"
values = {"LAB_ANON": state["ANON_KEY"], "LAB_SERVICE": state["SERVICE_ROLE_KEY"], "LAB_HMAC": hmac}
for value in values.values():
    assert re.fullmatch(r"[\w.-]+", value)
    print("::add-mask::" + value)
with open(os.environ["GITHUB_ENV"], "a") as env:
    for key, value in values.items():
        env.write(f"{key}={value}\n")
print("LAB_READY_LOCAL_ONLY")
