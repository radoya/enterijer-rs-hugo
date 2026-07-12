// N2 — sistem recenzija: Turnstile → KV rate-limit → magic-link (D1) → JWT cookie → pending review.
// Aditivno na postojeći Worker; /api/contact i serviranje statike su netaknuti.
// D1 = SAMO efemerno stanje; odobrene recenzije ide u vault (reviews.js admin approve → GitHub Contents).

const enc = new TextEncoder();
const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const seeOther = (loc) => new Response(null, { status: 303, headers: { Location: loc } });

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const randToken = () =>
  [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');

// ── base64url + HS256 JWT ──────────────────────────────────────────────
const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlStr = (s) => b64url(enc.encode(s));
const b64urlDecode = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(s + '='.repeat((4 - (s.length % 4)) % 4));
};

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function jwtSign(payload, secret) {
  const head = b64urlStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64urlStr(JSON.stringify(payload));
  const data = `${head}.${body}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data));
  return `${data}.${b64url(sig)}`;
}
async function jwtVerify(token, secret) {
  const parts = (token || '').split('.');
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const sig = Uint8Array.from(b64urlDecode(parts[2]), (c) => c.charCodeAt(0));
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), sig, enc.encode(data));
  if (!ok) return null;
  let payload;
  try { payload = JSON.parse(b64urlDecode(parts[1])); } catch { return null; }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// ── Turnstile ──────────────────────────────────────────────────────────
async function turnstileOK(token, secret, ip) {
  if (!secret) return false;
  const fd = new FormData();
  fd.append('secret', secret);
  fd.append('response', token || '');
  if (ip) fd.append('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: fd });
    const d = await r.json();
    return !!d.success;
  } catch { return false; }
}

// ── KV rate limit (best-effort; nije atomsko ali dovoljno za anti-spam) ──
async function rateLimited(kv, key, max, windowSec) {
  if (!kv) return false;
  const cur = parseInt((await kv.get(key)) || '0', 10);
  if (cur >= max) return true;
  await kv.put(key, String(cur + 1), { expirationTtl: windowSec });
  return false;
}

const clientIP = (request) => request.headers.get('CF-Connecting-IP') || '';
const isSlug = (s) => /^[a-z0-9-]{1,80}$/.test(s || '');

// ── Resend email ────────────────────────────────────────────────────────
async function sendMagicEmail(env, email, link) {
  if (!env.RESEND_API_KEY) { console.error('RESEND_API_KEY nije postavljen'); return; }
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.REVIEW_FROM || 'Enterijer.rs <recenzije@enterijer.rs>',
        to: [email],
        subject: 'Potvrda recenzije — Enterijer.rs',
        text: `Da objavite recenziju, potvrdite klikom (link važi 15 min):\n\n${link}\n\nAko niste tražili ovo, ignorišite poruku.`,
      }),
    });
  } catch (err) { console.error('Resend send error:', err); }
}

// ── vault MD upis (approve) — isti GitHub Contents pattern kao leadovi ──
async function writeVaultReview(env, r) {
  const fm = [
    '---',
    'status: approved',
    `listing: ${r.subjekt_slug}`,
    `autor: "${(r.autor || 'Anonimno').replace(/"/g, "'")}"`,
    `ocena: ${r.ocena}`,
    `datum: ${new Date(r.created_at * 1000).toISOString()}`,
    `id: REV-${r.id}`,
    `d1_id: ${r.id}`,
    `email_hash: ${r.email_hash}`,
    `jezik: ${r.jezik || 'sr'}`,
    `moderisao: ${r.moderisao || 'nenad'}`,
    '---',
    '',
    (r.tekst || '').slice(0, 5000),
    '',
  ].join('\n');
  const path = ['07 - CRM', 'RECENZIJE', `REV-${r.id}.md`].map(encodeURIComponent).join('/');
  const res = await fetch(`https://api.github.com/repos/${env.VAULT_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'enterijer-web-worker',
    },
    body: JSON.stringify({
      message: `Review approved: REV-${r.id} (${r.subjekt_slug})`,
      content: btoa(String.fromCharCode(...enc.encode(fm))),
    }),
  });
  if (!res.ok) throw new Error(`GitHub review write ${res.status}: ${await res.text()}`);
}

// ── Router. Vraća Response za /api/review/* i /api/admin/reviews*, inače null. ──
export async function handleReview(request, env, ctx, url) {
  const p = url.pathname;
  const m = request.method;

  // 1) Zahtev za magic-link
  if (m === 'POST' && p === '/api/review/request-link') {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false }, 400); }
    const email = (body.email || '').toString().trim().toLowerCase().slice(0, 200);
    const subjekt = (body.subjekt || '').toString().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !isSlug(subjekt)) return json({ ok: true }); // ne odaj
    if (!(await turnstileOK(body['cf-turnstile-response'], env.TURNSTILE_SECRET, clientIP(request))))
      return json({ ok: true }); // ne odaj razlog
    const ipH = await sha256hex(clientIP(request) || 'noip');
    const emH = await sha256hex(email);
    if ((await rateLimited(env.RATE_KV, `rl:ip:${ipH}`, 3, 600)) ||
        (await rateLimited(env.RATE_KV, `rl:em:${emH}`, 3, 600))) return json({ ok: true });

    const token = randToken();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      'INSERT INTO magic_links (token_hash, email, subjekt, created_at, expires_at, used) VALUES (?,?,?,?,?,0)'
    ).bind(await sha256hex(token), email, subjekt, now, now + 900).run();
    const link = `${url.origin}/api/review/verify?token=${token}`;
    ctx.waitUntil(sendMagicEmail(env, email, link));
    return json({ ok: true }); // uvek 200 — bez enumeracije naloga
  }

  // 2) Verifikacija magic-linka → JWT cookie
  if (m === 'GET' && p === '/api/review/verify') {
    const token = url.searchParams.get('token') || '';
    const now = Math.floor(Date.now() / 1000);
    const th = await sha256hex(token);
    const row = await env.DB.prepare(
      'SELECT email, subjekt FROM magic_links WHERE token_hash=? AND used=0 AND expires_at>?'
    ).bind(th, now).first();
    if (!row) return Response.redirect(`${url.origin}/recenzija/?greska=link`, 302);
    // atomski označi iskorišćen
    const upd = await env.DB.prepare('UPDATE magic_links SET used=1 WHERE token_hash=? AND used=0').bind(th).run();
    if (!upd.meta || upd.meta.changes !== 1) return Response.redirect(`${url.origin}/recenzija/?greska=link`, 302);
    const jwt = await jwtSign(
      { eh: await sha256hex(row.email), subjekt: row.subjekt, exp: now + 7200 }, env.JWT_SECRET
    );
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${url.origin}/recenzija/?ok=1&subjekt=${encodeURIComponent(row.subjekt)}`,
        'Set-Cookie': `ent_rev=${jwt}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7200`,
      },
    });
  }

  // 3) Slanje recenzije (traži JWT)
  if (m === 'POST' && p === '/api/review/submit') {
    const cookie = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)ent_rev=([^;]+)/);
    const claims = cookie ? await jwtVerify(cookie[1], env.JWT_SECRET) : null;
    if (!claims) return json({ ok: false, greska: 'auth' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ ok: false }, 400); }
    const ocena = parseInt(body.ocena, 10);
    const tekst = (body.tekst || '').toString().trim().slice(0, 2000);
    const autor = (body.autor || 'Anonimno').toString().trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!(ocena >= 1 && ocena <= 5) || tekst.length < 3 || !isSlug(claims.subjekt))
      return json({ ok: false, greska: 'validacija' }, 400);
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      'INSERT INTO reviews (email_hash, subjekt_slug, ocena, tekst, autor, jezik, status, created_at, ip_hash) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(claims.eh, claims.subjekt, ocena, tekst, autor, 'sr', 'pending', now, await sha256hex(clientIP(request) || 'noip')).run();
    if (env.TELEGRAM_BOT_TOKEN && env.REVIEW_CHAT_ID) {
      ctx.waitUntil(fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: env.REVIEW_CHAT_ID, text: `Nova recenzija (pending): ${claims.subjekt} — ${ocena}★ — ${autor}` }),
      }).catch(() => {}));
    }
    return json({ ok: true });
  }

  // 4) Admin (Bearer ADMIN_TOKEN) — zove SAMO Pro moderation cron
  if (p === '/api/admin/reviews' || p.startsWith('/api/admin/reviews/')) {
    const auth = request.headers.get('Authorization') || '';
    if (auth !== `Bearer ${env.ADMIN_TOKEN}`) return json({ ok: false }, 403);

    if (m === 'GET' && p === '/api/admin/reviews') {
      const status = url.searchParams.get('status') || 'pending';
      const { results } = await env.DB.prepare(
        'SELECT id, email_hash, subjekt_slug, ocena, tekst, autor, jezik, status, created_at FROM reviews WHERE status=? ORDER BY created_at ASC LIMIT 50'
      ).bind(status).all();
      return json({ ok: true, reviews: results || [] });
    }

    const idm = p.match(/^\/api\/admin\/reviews\/(\d+)$/);
    if (m === 'POST' && idm) {
      const id = parseInt(idm[1], 10);
      let body; try { body = await request.json(); } catch { body = {}; }
      const action = body.action;
      const row = await env.DB.prepare('SELECT * FROM reviews WHERE id=?').bind(id).first();
      if (!row) return json({ ok: false, greska: 'nema' }, 404);
      const now = Math.floor(Date.now() / 1000);
      if (action === 'approve') {
        row.moderisao = body.moderator || 'nenad';
        try { await writeVaultReview(env, row); } catch (e) { return json({ ok: false, greska: String(e) }, 502); }
        await env.DB.prepare('UPDATE reviews SET status=?, moderated_at=?, moderisao=? WHERE id=?')
          .bind('approved', now, row.moderisao, id).run();
        return json({ ok: true, status: 'approved' });
      }
      if (action === 'reject') {
        await env.DB.prepare('UPDATE reviews SET status=?, moderated_at=?, moderisao=? WHERE id=?')
          .bind('rejected', now, body.moderator || 'nenad', id).run();
        return json({ ok: true, status: 'rejected' });
      }
      return json({ ok: false, greska: 'akcija' }, 400);
    }
    return json({ ok: false }, 405);
  }

  return null; // nije review ruta
}
