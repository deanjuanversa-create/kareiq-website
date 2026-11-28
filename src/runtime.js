// Which environment this server runs in, and whether its configuration is safe to start with.
//
// APP_ENV says it explicitly: production | staging | demo | development | test.
//   - Not set: a hosted server (NODE_ENV=production, or Render/Vercel, which set RENDER / VERCEL)
//     counts as production; anything else is local development.
//   - Set to anything else (a typo, "prod", "Production "...): treated as production, so a malformed
//     value can never relax the checks below (fail closed).
//
// Demo logins (password in src/app/demo.js) are created and accepted ONLY when demo mode is on:
//   APP_DEMO=true exactly, in the demo, development or test environment. Never in production or
//   staging, never by default, never because a database is missing.
//
// validate() lists every problem that must stop the server from starting (server.js refuses to
// start when the list is not empty). It never includes the values of variables, only their names.

const ENVS = ['production', 'staging', 'demo', 'development', 'test'];
const PROD_DB = 'kareiq'; // the live MongoDB database name (src/db.js default)

function resolve(env = process.env) {
  const raw = String(env.APP_ENV || '').trim().toLowerCase();
  const hosted = env.NODE_ENV === 'production' || Boolean(env.RENDER) || Boolean(env.VERCEL);
  let name, source;
  if (raw) {
    if (ENVS.includes(raw)) { name = raw; source = 'APP_ENV'; }
    else { name = 'production'; source = 'APP_ENV (not recognised, treated as production)'; }
  } else if (hosted) {
    name = 'production'; source = 'hosting (NODE_ENV/RENDER/VERCEL) without APP_ENV';
  } else {
    name = 'development'; source = 'default (local)';
  }
  const demoAsked = String(env.APP_DEMO || '') === 'true';
  // a demo environment is a demo by definition; otherwise demo mode needs APP_DEMO=true
  const demo = name === 'demo' || (demoAsked && (name === 'development' || name === 'test'));
  return { name, source, invalid: Boolean(raw) && !ENVS.includes(raw), hosted, demo, demoAsked, shared: name === 'production' || name === 'staging' };
}

function storageOf(env = process.env) {
  if (env.MONGODB_URI) return 'mongo';
  if ((env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL) && (env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN)) return 'redis';
  return env.VERCEL ? 'temporary' : 'file';
}

// problems that must stop the server from starting (names only, never values)
function validate(env = process.env) {
  const r = resolve(env);
  const storage = storageOf(env);
  const dbName = String(env.MONGODB_DB || PROD_DB).trim();
  const problems = [];
  // a data folder on a persistent disk (a VPS, an attached volume) is a deliberate choice: it needs
  // FILE_STORAGE_CONFIRMED=true AND an explicit DATA_DIR. A missing database is never "file mode".
  const fileConfirmed = storage === 'file' && String(env.FILE_STORAGE_CONFIRMED || '') === 'true' && Boolean(String(env.DATA_DIR || '').trim());
  const persistent = storage === 'mongo' || storage === 'redis' || fileConfirmed;
  if (r.invalid) problems.push('APP_ENV is not one of ' + ENVS.join(', ') + ' (it is treated as production).');
  if (r.name === 'production' || r.name === 'staging') {
    const where = r.name === 'production' ? 'Production' : 'Staging';
    if (!persistent) problems.push(`${where} needs its database: set MONGODB_URI (this server would otherwise keep data in temporary files that are lost on every restart). A data folder on a persistent disk needs FILE_STORAGE_CONFIRMED=true and DATA_DIR.`);
    if (r.demoAsked) problems.push(`${where} must not run demo mode: remove APP_DEMO (demo logins use a published password).`);
    if (String(env.APP_STATELESS || '') === 'true') problems.push(`${where} must not use APP_STATELESS (signed-cookie demo sessions).`);
    if (String(env.SESSION_SECRET || '').length < 16) problems.push(`${where} needs SESSION_SECRET (at least 16 characters).`);
  }
  if (r.name === 'production' && storage === 'mongo' && /(demo|staging|stage|test|dev)/i.test(dbName)) {
    problems.push('Production must use the live database, not a demo, staging or test one (check MONGODB_DB).');
  }
  if (r.name === 'staging') {
    if (storage === 'mongo' && (!String(env.MONGODB_DB || '').trim() || dbName === PROD_DB)) problems.push('Staging must name its own database: set MONGODB_DB to a staging name such as kareiq-staging (never the live "kareiq").');
    if (storage === 'redis' && (!env.KV_PREFIX || env.KV_PREFIX === 'kareiq:')) problems.push('Staging on Redis must set its own KV_PREFIX (never the live "kareiq:").');
  }
  if (r.demo && storage === 'mongo' && dbName === PROD_DB) problems.push('Demo mode needs its own database: set MONGODB_DB to a demo name such as kareiq-demo (never the live "kareiq").');
  if (r.demoAsked && !r.demo && !r.shared) problems.push(`APP_DEMO=true is not allowed in the ${r.name} environment (use APP_ENV=demo for a demo server).`);
  return { env: r, storage, problems };
}

// demo logins (@demo.kareiq) are only valid while demo mode is on
const DEMO_EMAIL = /@demo\.kareiq$/i;
const isDemoAccount = (u) => Boolean(u && DEMO_EMAIL.test(String(u.email || '')));
const demoAllowed = (env = process.env) => resolve(env).demo;

module.exports = { ENVS, resolve, storageOf, validate, isDemoAccount, demoAllowed, PROD_DB };
