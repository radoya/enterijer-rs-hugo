---
title: "Ostavi recenziju"
description: "Podeli iskustvo sa majstorom ili firmom — recenzija ide na moderaciju pre objave."
slug: "recenzija"
draft: false
---

<div id="rev-app" data-sitekey="0x4AAAAAAD0TkMvjZSBU4pSQ">
  <noscript>Za slanje recenzije potreban je JavaScript.</noscript>

  <!-- Faza 1: traži magic-link -->
  <form id="rev-link-form" style="max-width:32rem">
    <p>Unesi email da potvrdimo recenziju (bez lozinke — dobićeš link na 15 min).</p>
    <input type="hidden" id="rev-subjekt" name="subjekt" value="">
    <label>Email<br><input type="email" id="rev-email" required style="width:100%"></label>
    <div class="cf-turnstile" data-sitekey="0x4AAAAAAD0TkMvjZSBU4pSQ" style="margin:.75rem 0"></div>
    <button type="submit">Pošalji link za potvrdu</button>
    <p id="rev-link-msg"></p>
  </form>

  <!-- Faza 2: unos recenzije (prikazuje se posle verifikacije, ?ok=1) -->
  <form id="rev-submit-form" style="max-width:32rem;display:none">
    <p>Email potvrđen. Ostavi ocenu i komentar — ide na moderaciju pre objave.</p>
    <label>Ocena<br>
      <select id="rev-ocena" required>
        <option value="5">5 ★</option><option value="4">4 ★</option>
        <option value="3">3 ★</option><option value="2">2 ★</option><option value="1">1 ★</option>
      </select></label><br>
    <label>Prikazano ime<br><input type="text" id="rev-autor" maxlength="60" placeholder="npr. Marko iz Beograda" style="width:100%"></label><br>
    <label>Recenzija<br><textarea id="rev-tekst" required maxlength="2000" rows="6" style="width:100%"></textarea></label><br>
    <button type="submit">Pošalji recenziju</button>
    <p id="rev-submit-msg"></p>
  </form>
</div>

<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<script>
(function () {
  var qs = new URLSearchParams(location.search);
  var subj = (qs.get('subjekt') || '').replace(/[^a-z0-9-]/g, '');
  document.getElementById('rev-subjekt').value = subj;

  var linkForm = document.getElementById('rev-link-form');
  var subForm = document.getElementById('rev-submit-form');

  // Posle verifikacije (?ok=1) prikaži formu za recenziju
  if (qs.get('ok') === '1') { linkForm.style.display = 'none'; subForm.style.display = ''; }
  if (qs.get('greska') === 'link') {
    document.getElementById('rev-link-msg').textContent = 'Link je istekao ili je već iskorišćen. Zatraži novi.';
  }

  linkForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var msg = document.getElementById('rev-link-msg');
    var token = (document.querySelector('[name="cf-turnstile-response"]') || {}).value || '';
    msg.textContent = 'Šaljem…';
    try {
      await fetch('/api/review/request-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: document.getElementById('rev-email').value,
          subjekt: subj,
          'cf-turnstile-response': token
        })
      });
      msg.textContent = 'Ako je email ispravan, stiže link za potvrdu (proveri i spam).';
    } catch (_) { msg.textContent = 'Greška u slanju, pokušaj ponovo.'; }
  });

  subForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var msg = document.getElementById('rev-submit-msg');
    msg.textContent = 'Šaljem…';
    try {
      var r = await fetch('/api/review/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ocena: parseInt(document.getElementById('rev-ocena').value, 10),
          tekst: document.getElementById('rev-tekst').value,
          autor: document.getElementById('rev-autor').value
        })
      });
      var d = await r.json();
      msg.textContent = d.ok ? 'Hvala! Recenzija je poslata na moderaciju.' : 'Greška: ' + (d.greska || 'pokušaj ponovo');
      if (d.ok) subForm.querySelector('button').disabled = true;
    } catch (_) { msg.textContent = 'Greška u slanju, pokušaj ponovo.'; }
  });
})();
</script>
