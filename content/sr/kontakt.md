---
title: "Kontakt"
description: "Pišite nam — pitanja o uređenju prostora, saradnji ili oglašavanju."
---

Imate pitanje o uređenju prostora, predlog za saradnju ili želite da se oglasite? Popunite formu ispod — odgovaramo u roku od 48 sati.

<form class="contact-form" method="post" action="/api/contact">
  <div>
    <label for="name">Ime i prezime *</label>
    <input type="text" id="name" name="name" required>
  </div>
  <div>
    <label for="email">Email</label>
    <input type="email" id="email" name="email">
  </div>
  <div>
    <label for="phone">Telefon</label>
    <input type="tel" id="phone" name="phone">
  </div>
  <div>
    <label for="message">Poruka *</label>
    <textarea id="message" name="message" rows="6" required></textarea>
  </div>
  <div style="position:absolute;left:-9999px" aria-hidden="true">
    <label for="website">Website</label>
    <input type="text" id="website" name="website" tabindex="-1" autocomplete="off">
  </div>
  <p style="color:var(--muted);font-size:.85rem;margin:0">* obavezna polja. Unesite email ili telefon da bismo mogli da vam odgovorimo.</p>
  {{< turnstile >}}
  <div><button type="submit" class="btn">Pošalji poruku</button></div>
</form>
