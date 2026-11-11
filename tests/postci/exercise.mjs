import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { openSync, closeSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const work = process.env.RUNNER_TEMP;
const candidate = path.join(work, "candidate");
const rollback = path.join(work, "rollback");
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(work, "browser/node_modules/playwright"));
const sharp = require(path.join(candidate, "node_modules/sharp"));
const api = "http://127.0.0.1:54321";
const app = "http://127.0.0.1:3101";
const mail = "http://127.0.0.1:54324";
const anonymous = process.env.LAB_ANON;
const service = process.env.LAB_SERVICE;
const hmac = process.env.LAB_HMAC;
assert(anonymous && service && /^[0-9a-f]{64}$/.test(hmac));
let stage = "initialize";

async function eventually(action, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const result = await action(); if (result) return result; } catch {}
    await delay(750);
  }
  throw new Error("timeout");
}

async function start(dir) {
  const log = openSync(path.join(work, path.basename(dir) + "-next.log"), "a");
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-H", "127.0.0.1", "-p", "3101"], {
    cwd: dir, detached: true, stdio: ["ignore", log, log],
    env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: "true", NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_SUPABASE_URL: api, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonymous,
      PUBLICATION_BOUNDARY_HMAC_KEY: hmac, PUBLICATION_BOUNDARY_HMAC_KEY_ID: "postci-synthetic" },
  });
  closeSync(log);
  try {
    await eventually(async () => child.exitCode === null && (await fetch(app + "/login")).ok, 90000);
    return child;
  } catch (error) {
    await stop(child);
    throw error;
  }
}

async function stop(child) {
  if (!child) return;
  try { process.kill(-child.pid, "SIGTERM"); } catch {}
  await eventually(async () => {
    try { process.kill(-child.pid, 0); return false; } catch { return true; }
  }, 10000).catch(() => {
    try { process.kill(-child.pid, "SIGKILL"); } catch {}
  });
  await eventually(async () => {
    try { const r = await fetch(app + "/login", { signal: AbortSignal.timeout(750) }); await r.body?.cancel(); return false; }
    catch { return true; }
  }, 10000);
}

async function account(purpose) {
  const email = "sec01-" + purpose + "-" + randomBytes(5).toString("hex") + "@example.com";
  const password = "Lab!" + randomBytes(16).toString("hex");
  const r = await fetch(api + "/auth/v1/admin/users", { method: "POST",
    headers: { apikey: service, authorization: "Bearer " + service, "content-type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: "SEC01 Synthetic Owner" } }),
  });
  if (!r.ok) throw new Error("admin synthetic user HTTP " + r.status);
  return { email, password };
}

async function context(browser) {
  const ctx = await browser.newContext();
  await ctx.route("**/*", route => {
    const url = new URL(route.request().url());
    return [app, api, mail].includes(url.origin) ? route.continue() : route.abort();
  });
  return ctx;
}

async function login(page, user) {
  await page.goto(app + "/login?returnTo=%2Fcuenta");
  await page.locator("input[name=email]").fill(user.email);
  await page.locator("input[name=password]").fill(user.password);
  const result = page.waitForResponse(r => r.url().startsWith(api + "/auth/v1/token") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  assert.equal((await result).status(), 200);
  await page.waitForURL(app + "/cuenta");
}

async function recovery(browser) {
  stage = "G3 create synthetic account";
  const user = await account("recovery");
  const ctx = await context(browser);
  try {
    const page = await ctx.newPage();
    stage = "G3 request recovery";
    await page.goto(app + "/recuperar-password");
    await page.locator("input[name=email]").fill(user.email);
    const requested = page.waitForResponse(r => r.url().startsWith(api + "/auth/v1/recover") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    assert((await requested).ok());
    stage = "G3 receive Mailpit message";
    const message = await eventually(async () => {
      const r = await fetch(mail + "/api/v1/messages");
      if (!r.ok) return null;
      const body = await r.json();
      return body.messages?.find(m => m.To?.some(t => t.Address === user.email));
    }, 45000);
    const detail = await (await fetch(mail + "/api/v1/message/" + encodeURIComponent(message.ID))).json();
    const hrefs = [...(detail.HTML || "").matchAll(/href=["']([^"']+)["']/gi)].map(x => x[1].replaceAll("&amp;", "&"));
    const link = hrefs.map(x => new URL(x)).find(x => x.origin === api && x.pathname === "/auth/v1/verify" &&
      x.searchParams.get("type") === "recovery");
    assert(link, "Expected local recovery link");
    stage = "G3 same-browser PKCE callback";
    const callback = page.waitForRequest(r => r.url().startsWith(app + "/auth/callback?") && new URL(r.url()).searchParams.has("code"));
    await page.goto(link.href);
    await callback;
    await page.waitForURL(app + "/restablecer-password");
    stage = "G3 update password and end recovery session";
    const next = "LabChanged!" + randomBytes(16).toString("hex");
    await page.locator("input[name=password]").fill(next);
    await page.locator("input[name=confirm_password]").fill(next);
    const updated = page.waitForResponse(r => r.url() === api + "/auth/v1/user" && r.request().method() === "PUT");
    await page.getByRole("button", { name: "Actualizar contraseña" }).click();
    assert((await updated).ok());
    await page.waitForURL(app + "/login?status=password-updated");
    stage = "G3 new session with changed password";
    await login(page, { ...user, password: next });
    console.log("G3_PASS request, mail, link, callback, password update, new login");
  } finally { await ctx.close(); }
}

function sql(query) {
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_sec01-postci-ci", "psql", "-X",
    "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], { input: query, encoding: "utf8", timeout: 15000 });
  assert.equal(result.status, 0, "local PostgreSQL check failed");
  return JSON.parse(result.stdout.trim());
}

const digest = data => createHash("sha256").update(data).digest("hex");
const legacy = "public.finalize_private_property_publication(uuid)";

function permissions() {
  return sql("select jsonb_build_object(" +
    "'expand',(select count(*) from supabase_migrations.schema_migrations where version='20261004012121')," +
    "'contract',(select count(*) from supabase_migrations.schema_migrations where version='20261004012123')," +
    "'legacy',has_function_privilege('authenticated','" + legacy + "','execute')," +
    "'anon_legacy',has_function_privilege('anon','" + legacy + "','execute')," +
    "'routines',(select jsonb_agg(jsonb_build_array(p.oid,p.proacl) order by p.oid) from pg_proc p " +
      "where p.oid='" + legacy + "'::regprocedure or p.proname like '%publication%')," +
    "'acl',(select jsonb_agg(jsonb_build_array(c.oid,c.relacl,c.relrowsecurity) order by c.oid) from pg_class c " +
      "where c.oid in ('public.properties'::regclass,'public.property_images'::regclass,'storage.objects'::regclass))," +
    "'policies',(select jsonb_agg(to_jsonb(p) order by p.schemaname,p.tablename,p.policyname) from pg_policies p " +
      "where (p.schemaname,p.tablename) in (('public','properties'),('public','property_images'),('storage','objects'))));");
}

function record(slug) {
  assert.match(slug, /^[a-z0-9-]+$/);
  return sql("select jsonb_build_object('property',to_jsonb(p)," +
    "'images',(select jsonb_agg(to_jsonb(i) order by i.id) from public.property_images i where i.property_id=p.id)," +
    "'objects',(select jsonb_agg(to_jsonb(o) order by o.id) from storage.objects o join public.property_images i " +
      "on o.bucket_id=i.storage_bucket and o.name=i.storage_path where i.property_id=p.id)) " +
    "from public.properties p where p.slug='" + slug + "';");
}

async function publish(ctx, title, image, useRequestId) {
  const headers = { origin: app, "sec-fetch-site": "same-origin" };
  if (useRequestId) headers["x-publication-request-id"] = randomUUID();
  const response = await ctx.request.post(app + "/api/publicar", { headers, multipart: {
    title, description: "Fixture de publicación aislada", address: "Dirección sintética", city: "Piura", region: "Piura",
    type: "Casas", operation: "Vender", price: "72000", currency: "PEN", latitude: "-5.19449",
    longitude: "-80.63282", coordinatesConfirmed: "true", contact_phone: "900000000",
    images: { name: "synthetic.png", mimeType: "image/png", buffer: image },
  } });
  const result = await response.json();
  if (!response.ok() || !result.ok || !result.slug) {
    const code = /^[A-Z_]{2,60}$/.test(result.code) ? result.code : "UNKNOWN";
    console.log("SYNTHETIC_PUBLICATION_HTTP=" + response.status() + " CODE=" + code);
    throw new Error("publication failed");
  }
  return result.slug;
}

async function imageBytes(ctx, id) {
  assert.match(id, /^[a-f0-9-]+$/);
  const r = await ctx.request.get(app + "/api/property-images/" + id);
  assert.equal(r.status(), 200);
  return r.body();
}

async function rollbackTest(browser, firstProcess) {
  let child = firstProcess;
  const ctx = await context(browser);
  try {
    stage = "G4 assert Expand and legacy permission";
    const before = permissions();
    assert.equal(before.expand, 1);
    assert.equal(before.contract, 0);
    assert.equal(before.legacy, true);
    assert.equal(before.anon_legacy, false);
    const user = await account("rollback");
    const page = await ctx.newPage();
    stage = "G4 candidate sign-in and publish";
    await login(page, user);
    const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#18713b" } }).png().toBuffer();
    const slug = await publish(ctx, "SEC01 candidato " + randomBytes(4).toString("hex"), image, true);
    const original = record(slug);
    assert.equal(original.property.status, "published");
    assert.equal(original.images.length, 1);
    assert.equal(original.objects.length, 1);
    const originalBytes = await imageBytes(ctx, original.images[0].id);
    assert.deepEqual(originalBytes, image);
    stage = "G4 swap application to exact rollback commit";
    await stop(child);
    child = await start(rollback);
    stage = "G4 rollback reads original card and image";
    const card = await page.goto(app + "/inmueble/" + slug);
    assert.equal(card.status(), 200);
    await page.getByRole("heading", { name: original.property.title, exact: true }).waitFor();
    assert.deepEqual(await imageBytes(ctx, original.images[0].id), originalBytes);
    stage = "G4 publish through legacy finalizer";
    const newSlug = await publish(ctx, "SEC01 reversión " + randomBytes(4).toString("hex"), image, false);
    const latest = record(newSlug);
    assert.equal(latest.property.status, "published");
    assert.equal(latest.images.length, 1);
    assert.deepEqual(await imageBytes(ctx, latest.images[0].id), image);
    stage = "G4 verify original rows and ACL after rollback";
    assert.deepEqual(record(slug), original);
    assert.deepEqual(permissions(), before);
    console.log("G4_PASS candidate=" + process.env.CANDIDATE_SHA + " rollback=" + process.env.ROLLBACK_SHA +
      " expand=20261004012121 contract=absent original_sha256=" + digest(JSON.stringify(original)) +
      " image_sha256=" + digest(image) + " permissions_sha256=" + digest(JSON.stringify(before)));
  } finally {
    await ctx.close();
    await stop(child);
  }
}

let browser, child;
try {
  stage = "start candidate";
  child = await start(candidate);
  browser = await chromium.launch({ headless: true, args: ["--disable-background-networking"] });
  if (process.argv[2] === "recovery") await recovery(browser);
  else {
    assert.equal(process.argv[2], "rollback");
    await rollbackTest(browser, child);
    child = null;
  }
} catch (error) {
  console.error(stage + " FAILED (" + error.name + ")");
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (child) await stop(child);
}
