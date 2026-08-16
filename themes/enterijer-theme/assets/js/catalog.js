/* Katalog: filtriranje, sortiranje i paginacija na klijentu.
   Bez zavisnosti. SSR grid ostaje izvor istine dok se filter ne dodirne — do tada
   ova skripta ne dira DOM, pa /proizvodi/ i /proizvodi/page/2/ ostaju crawlable.
   Kartica se renderuje istim redosledom polja kao partials/listing-card.html;
   ako se tamo nešto promeni, promeni i ovde (kartica() niže). */
(function () {
  var root = document.querySelector('[data-catalog]');
  if (!root) return;

  var DIMS = ['k', 'c', 'b', 's', 'g'];
  var grid = root.querySelector('[data-catalog-grid]');
  var count = root.querySelector('[data-catalog-count]');
  var empty = root.querySelector('[data-catalog-empty]');
  var pager = root.querySelector('[data-catalog-pager]');
  var ssr = root.querySelector('[data-catalog-ssr]');
  var aktivni = root.querySelector('[data-active-filters]');
  var pageSize = parseInt(root.getAttribute('data-page-size'), 10) || 24;
  var scope = JSON.parse(root.getAttribute('data-scope') || '{}');
  var hijerarhija = JSON.parse(root.getAttribute('data-kat') || '{}');
  var i18n = JSON.parse(root.getAttribute('data-i18n') || '{}');
  var podaci = null, ucitavanje = null, aktivan = false;

  function stanje() {
    var q = new URLSearchParams(location.search), s = { page: parseInt(q.get('page'), 10) || 1 };
    DIMS.forEach(function (d) { s[d] = (q.get(d) || '').split(',').filter(Boolean); });
    s.min = q.get('min') || ''; s.max = q.get('max') || '';
    s.q = q.get('q') || ''; s.sort = q.get('sort') || '';
    return s;
  }
  function prazno(s) {
    return !DIMS.some(function (d) { return s[d].length; }) && !s.min && !s.max && !s.q && !s.sort;
  }
  function upisi(s, push) {
    var q = new URLSearchParams();
    DIMS.forEach(function (d) { if (s[d].length) q.set(d, s[d].join(',')); });
    ['min', 'max', 'q', 'sort'].forEach(function (k) { if (s[k]) q.set(k, s[k]); });
    if (s.page > 1) q.set('page', s.page);
    var url = location.pathname + (q.toString() ? '?' + q : '');
    if (push) history.pushState(null, '', url); else history.replaceState(null, '', url);
  }

  function ucitaj() {
    if (podaci) return Promise.resolve(podaci);
    if (!ucitavanje) {
      ucitavanje = fetch(root.getAttribute('data-index'))
        .then(function (r) { return r.json(); })
        .then(function (d) { podaci = d; return d; });
    }
    return ucitavanje;
  }

  function uOpsegu(x, s) {
    if (s.min && (!x.p || x.p < +s.min)) return false;
    if (s.max && (!x.p || x.p > +s.max)) return false;
    if (s.q && x.t.toLowerCase().indexOf(s.q.toLowerCase()) < 0) return false;
    return DIMS.every(function (d) {
      var trazeno = (scope[d] || []).concat(s[d]);
      if (!trazeno.length) return true;
      var ima = x[d] == null ? [] : (Array.isArray(x[d]) ? x[d] : [x[d]]);
      return trazeno.some(function (v) { return ima.indexOf(v) > -1; });
    });
  }

  function sortiraj(niz, kako) {
    var c = niz.slice();
    if (kako === 'price-asc' || kako === 'price-desc') {
      // proizvod bez cene nikad ne ide prvi — "Cena na upit" na vrhu izgleda kao greška
      c.sort(function (a, b) {
        if (!a.p !== !b.p) return a.p ? -1 : 1;
        return kako === 'price-asc' ? a.p - b.p : b.p - a.p;
      });
    } else if (kako === 'newest') {
      c.sort(function (a, b) { return (b.d || '').localeCompare(a.d || ''); });
    } else {
      c.sort(function (a, b) { return a.t.localeCompare(b.t, 'sr'); });
    }
    return c;
  }

  function cena(p) {
    return p ? p.toLocaleString('sr-RS') + ' RSD' : (i18n.upit || 'Cena na upit');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function kartica(x) {
    return '<article class="card">' +
      '<a href="' + esc(x.u) + '">' +
      '<span class="card-arrow" aria-hidden="true">↗</span>' +
      (x.i ? '<img src="' + esc(x.i) + '" alt="' + esc(x.t) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '') +
      '<div class="card-body">' +
      '<h3>' + esc(x.t) + '</h3>' +
      '<p>' + esc(x.de || '') + '</p>' +
      '<p class="card-price' + (x.p ? '' : ' card-price--upit') + '">' + esc(cena(x.p)) + '</p>' +
      '<div class="meta">' +
      (x.sn ? '<span class="card-store">' + esc(x.sn) + '</span>' : '') +
      (x.r ? '<span class="card-ocena">★ ' + esc(x.r) + ' (' + esc(x.n) + ')</span>' : '') +
      '</div></div></a></article>';
  }

  function crtajPager(s, strana) {
    if (!pager) return;
    if (strana <= 1) { pager.innerHTML = ''; return; }
    var h = '', i;
    for (i = 1; i <= strana; i++) {
      if (i === 1 || i === strana || Math.abs(i - s.page) <= 2) {
        h += '<button type="button" class="pager-btn' + (i === s.page ? ' is-active' : '') + '" data-page="' + i + '">' + i + '</button>';
      } else if (i === 2 || i === strana - 1) {
        h += '<span class="pager-gap">…</span>';
      }
    }
    pager.innerHTML = h;
  }

  function crtajAktivne(s) {
    if (!aktivni) return;
    var h = '';
    DIMS.forEach(function (d) {
      s[d].forEach(function (v) {
        h += '<button type="button" class="tag is-active" data-off="' + d + '" data-val="' + esc(v) + '">' + esc(v) + ' ✕</button>';
      });
    });
    if (s.min || s.max) h += '<button type="button" class="tag is-active" data-off="cena">' + esc(s.min || '0') + '–' + esc(s.max || '∞') + ' ✕</button>';
    if (s.q) h += '<button type="button" class="tag is-active" data-off="q">„' + esc(s.q) + '" ✕</button>';
    if (h) h += '<button type="button" class="tag" data-clear-all>' + esc(i18n.clear || 'Obriši sve') + '</button>';
    aktivni.innerHTML = h;
  }

  function zavisnePotkategorije(s) {
    var dozvoljene = null;
    var roditelji = (scope.k || []).concat(s.k);
    if (roditelji.length) {
      dozvoljene = {};
      roditelji.forEach(function (p) {
        (hijerarhija[p] || []).forEach(function (c) { dozvoljene[c] = 1; });
      });
    }
    root.querySelectorAll('input[data-dim="c"]').forEach(function (i) {
      var vidljiv = !dozvoljene || dozvoljene[i.value];
      i.closest('label').hidden = !vidljiv;
      if (!vidljiv) i.checked = false;
    });
  }

  function crtaj(push) {
    var s = stanje();
    ucitaj().then(function (d) {
      var lista = sortiraj(d.filter(function (x) { return uOpsegu(x, s); }), s.sort);
      var strana = Math.max(1, Math.ceil(lista.length / pageSize));
      if (s.page > strana) s.page = strana;
      grid.innerHTML = lista.slice((s.page - 1) * pageSize, s.page * pageSize).map(kartica).join('');
      if (count) count.textContent = lista.length;
      if (empty) empty.hidden = lista.length > 0;
      if (ssr) ssr.hidden = true;
      crtajPager(s, strana);
      crtajAktivne(s);
      zavisnePotkategorije(s);
      upisi(s, push);
    });
  }

  function izStanjaUFormu() {
    var s = stanje();
    root.querySelectorAll('input[data-dim]').forEach(function (i) {
      i.checked = s[i.getAttribute('data-dim')].indexOf(i.value) > -1;
    });
    var min = root.querySelector('[data-min]'), max = root.querySelector('[data-max]');
    var q = root.querySelector('[data-q]'), sort = root.querySelector('[data-sort]');
    if (min) min.value = s.min; if (max) max.value = s.max;
    if (q) q.value = s.q; if (sort) sort.value = s.sort;
  }

  function promena() {
    var s = stanje();
    DIMS.forEach(function (d) {
      s[d] = Array.prototype.map.call(
        root.querySelectorAll('input[data-dim="' + d + '"]:checked'), function (i) { return i.value; });
    });
    var min = root.querySelector('[data-min]'), max = root.querySelector('[data-max]');
    var q = root.querySelector('[data-q]'), sort = root.querySelector('[data-sort]');
    s.min = min ? min.value : ''; s.max = max ? max.value : '';
    s.q = q ? q.value.trim() : ''; s.sort = sort ? sort.value : '';
    s.page = 1;
    upisi(s, true);
    aktivan = true;
    crtaj(false);
  }

  root.addEventListener('change', function (e) {
    if (e.target.matches('input[data-dim], [data-sort], [data-min], [data-max]')) promena();
  });
  var tajmer;
  root.addEventListener('input', function (e) {
    if (!e.target.matches('[data-q]')) return;
    clearTimeout(tajmer);
    tajmer = setTimeout(promena, 250);
  });
  root.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-page')) {
      var s = stanje(); s.page = parseInt(b.getAttribute('data-page'), 10);
      upisi(s, true); crtaj(false);
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (b.hasAttribute('data-clear-all')) {
      history.pushState(null, '', location.pathname);
      izStanjaUFormu(); crtaj(false);
    } else if (b.hasAttribute('data-off')) {
      var dim = b.getAttribute('data-off'), st = stanje();
      if (dim === 'cena') { st.min = ''; st.max = ''; }
      else if (dim === 'q') { st.q = ''; }
      else st[dim] = st[dim].filter(function (v) { return v !== b.getAttribute('data-val'); });
      st.page = 1; upisi(st, true); izStanjaUFormu(); crtaj(false);
    }
  });
  window.addEventListener('popstate', function () {
    izStanjaUFormu();
    if (aktivan || !prazno(stanje())) crtaj(false);
  });

  // deljiv link sa filterima: renderuj odmah; inače ostavi SSR netaknut
  if (!prazno(stanje())) { aktivan = true; izStanjaUFormu(); crtaj(false); }
  else { zavisnePotkategorije(stanje()); }
})();
