// One Worker serves every language domain. Hugo multihost builds to
// public/<lang>/, so we prefix the pathname with the host's language.
const LANG_BY_HOST = {
  'enterijer.rs': 'sr',
  'www.enterijer.rs': 'sr',
  'interior.enterijer.rs': 'en',
};

const slug = (s) =>
  s.toLowerCase()
    .replace(/[čć]/g, 'c').replace(/š/g, 's').replace(/ž/g, 'z').replace(/đ/g, 'dj')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'lead';

const seeOther = (loc) => new Response(null, { status: 303, headers: { Location: loc } });

async function handleContact(request, env, ctx) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const get = (k) => (form.get(k) || '').toString().trim();
  // single-line fields: collapse newlines (keeps YAML frontmatter valid) + cap length
  const line = (k) => get(k).replace(/\s+/g, ' ').replace(/"/g, "'").slice(0, 200);
  const name = line('name');
  const email = line('email');
  const phone = line('phone');
  const listing = line('listing');
  const message = get('message').slice(0, 5000);

  if (get('website')) return seeOther('/hvala/'); // honeypot — silent drop
  if (!name || !message || (!email && !phone)) {
    return new Response('Obavezna polja: ime, poruka i email ili telefon.', { status: 400 });
  }

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  // filename includes time — two leads with the same name/day must not collide
  // (GitHub PUT without sha on an existing path returns 422 and the lead is lost)
  const stamp = now.toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const md = [
    '---',
    `ime: "${name}"`,
    `email: "${email}"`,
    `telefon: "${phone}"`,
    `listing: "${listing}"`,
    `datum: ${now.toISOString()}`,
    'izvor: enterijer.rs',
    '---',
    '',
    message,
    '',
  ].join('\n');

  const path = ['07 - CRM', 'LEADOVI', `${stamp}-${slug(name)}.md`]
    .map(encodeURIComponent).join('/');

  try {
    const res = await fetch(`https://api.github.com/repos/${env.VAULT_REPO}/contents/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'enterijer-web-worker',
      },
      body: JSON.stringify({
        message: `Lead: ${name} (${date})`,
        content: btoa(String.fromCharCode(...new TextEncoder().encode(md))),
      }),
    });
    if (!res.ok) console.error('GitHub lead write failed:', res.status, await res.text());
  } catch (err) {
    console.error('GitHub lead write error:', err); // never lose UX over a failed write
  }

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    ctx.waitUntil(
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: `Novi lead sa enterijer.rs\n${name}\n${email || phone}${listing ? `\nListing: ${listing}` : ''}\n\n${message}`,
        }),
      }).catch((err) => console.error('Telegram notify failed:', err)),
    );
  }

  return seeOther('/hvala/');
}

// legacy WordPress URLs (pre-cutover sitemap: only /newsletter/ existed besides /)
const LEGACY_REDIRECTS = { '/newsletter/': '/kontakt/', '/newsletter': '/kontakt/' };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.hostname === 'www.enterijer.rs') {
      url.hostname = 'enterijer.rs';
      return Response.redirect(url.toString(), 301);
    }

    if (LEGACY_REDIRECTS[url.pathname]) {
      return Response.redirect(new URL(LEGACY_REDIRECTS[url.pathname], url).toString(), 301);
    }

    if (request.method === 'POST' && url.pathname === '/api/contact') {
      return handleContact(request, env, ctx);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    const lang = LANG_BY_HOST[url.hostname] || 'sr'; // unknown hosts (previews) → sr
    if (url.pathname !== `/${lang}` && !url.pathname.startsWith(`/${lang}/`)) {
      url.pathname = `/${lang}${url.pathname}`;
    }
    // 404s fall through to the language's 404.html via not_found_handling
    return env.ASSETS.fetch(new Request(url, request));
  },
};
