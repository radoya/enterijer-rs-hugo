---
title: "Contact"
description: "Get in touch — questions about interior design, partnerships, or advertising."
draft: true
---

Have a question about interior design, a partnership proposal, or want to advertise? Fill in the form below — we reply within 48 hours.

<form class="contact-form" method="post" action="/api/contact">
  <div>
    <label for="name">Full name *</label>
    <input type="text" id="name" name="name" required>
  </div>
  <div>
    <label for="email">Email</label>
    <input type="email" id="email" name="email">
  </div>
  <div>
    <label for="phone">Phone</label>
    <input type="tel" id="phone" name="phone">
  </div>
  <div>
    <label for="message">Message *</label>
    <textarea id="message" name="message" rows="6" required></textarea>
  </div>
  <div style="position:absolute;left:-9999px" aria-hidden="true">
    <label for="website">Website</label>
    <input type="text" id="website" name="website" tabindex="-1" autocomplete="off">
  </div>
  <p style="color:var(--muted);font-size:.85rem;margin:0">* required fields. Please provide an email or phone number so we can reply.</p>
  <div><button type="submit" class="btn">Send message</button></div>
</form>
