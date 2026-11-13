/* Idiomas de la web (ca / es / en), sin dependencias.
 *
 * - Textos fijos de la página: data-i18n="clave" (texto), data-i18n-html="clave" (HTML del propio
 *   diccionario) y data-i18n-attr="atributo:clave;otro:clave".
 * - Lo que escribe el panel (bloques <!-- contenido:* --> de index.html y las páginas cursos/*) no puede
 *   llevar atributos porque el panel lo regenera. Se traduce buscando el texto en castellano:
 *     · textos fijos de contenido.py → data/i18n/es.json (sección "generado", admite {variables});
 *     · lo que escribe Oriol en el panel → data/i18n/contenido.json.
 *   Si no hay traducción para un texto, se queda en castellano.
 * - Idioma: ?lang=xx en la URL, si no el guardado en localStorage, si no el del navegador; por defecto es.
 * - Se carga en <head> (index, privacidad) para ocultar la página hasta traducirla y evitar el parpadeo.
 *   Las páginas de curso lo cargan desde main.js.
 */
(function () {
  'use strict';
  if (window.SDSi18n) return;

  const IDIOMAS = ['ca', 'es', 'en'];
  const BASE = 'es';
  const CLAVE = 'sds-idioma';
  const LOCALES = { ca: 'ca-ES', es: 'es-ES', en: 'en-GB' };
  const NOMBRES = { ca: 'Català', es: 'Castellano', en: 'English' };
  const html = document.documentElement;
  const yo = document.currentScript;
  const raiz = new URL('..', yo && yo.src ? yo.src : location.href).href; // js/i18n.js → raíz de la web

  const valido = (l) => (IDIOMAS.includes(l) ? l : null);

  function detectar() {
    let l = null;
    try {
      l = valido(new URLSearchParams(location.search).get('lang'));
      if (l) localStorage.setItem(CLAVE, l);
      else l = valido(localStorage.getItem(CLAVE));
    } catch (e) { /* sin localStorage (modo privado estricto): se detecta cada vez */ }
    if (!l) {
      const nav = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
      for (const x of nav) { l = valido(String(x).toLowerCase().split('-')[0]); if (l) break; }
    }
    return l || BASE;
  }

  let actual = detectar();
  html.lang = actual;

  // Mientras llega el diccionario, la página no se ve (como mucho 2,5 s): así no parpadea el castellano
  function mostrar() { html.classList.remove('i18n-cargando'); }
  if (actual !== BASE) {
    html.classList.add('i18n-cargando');
    setTimeout(mostrar, 2500);
  }

  // ---------- Carga de diccionarios ----------
  const cache = {};
  function cargar(ruta) {
    if (!cache[ruta]) {
      cache[ruta] = fetch(raiz + ruta).then((r) => {
        if (!r.ok) throw new Error(ruta + ': ' + r.status);
        return r.json();
      });
    }
    return cache[ruta];
  }
  const D = {};                 // idioma → diccionario
  let inverso = null;           // texto en castellano (normalizado) → clave
  let plantillas = [];          // textos con {variables}
  let contenido = null;         // texto del panel (normalizado) → { ca, en }
  let curso = null;             // fecha de esta página de curso (data/contenido.json), si lo es

  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  const valor = (obj, clave) => clave.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const rellenar = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
  const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function indexar(es) {
    inverso = Object.create(null);
    plantillas = [];
    (function rec(o, pre) {
      for (const k of Object.keys(o)) {
        if (k.charAt(0) === '_') continue;
        const v = o[k], clave = pre + k;
        if (Array.isArray(v)) v.forEach((x, i) => { if (!inverso[norm(x)]) inverso[norm(x)] = clave + '.' + i; });
        else if (v && typeof v === 'object') rec(v, clave + '.');
        else if (typeof v === 'string' && /\{\w+\}/.test(v)) {
          const nombres = [];
          const patron = norm(v).split(/(\{\w+\})/).map((p) => {
            const m = p.match(/^\{(\w+)\}$/);
            if (!m) return escapar(p);
            nombres.push(m[1]);
            return '(.+?)';
          }).join('');
          plantillas.push({ re: new RegExp('^' + patron + '$'), clave, nombres });
        } else if (typeof v === 'string' && !inverso[norm(v)]) inverso[norm(v)] = clave;
      }
    })(es, '');
  }

  function prepararContenido(c) {
    contenido = Object.create(null);
    const textos = (c && c.textos) || {};
    for (const k of Object.keys(textos)) contenido[norm(k)] = textos[k] || {};
  }

  function cargarCurso() {
    const m = location.pathname.match(/\/cursos\/([a-z0-9-]+)\/(?:index\.html)?$/);
    if (!m || !document.querySelector('.curso-pag')) return Promise.resolve();
    return cargar('data/contenido.json').then((c) => {
      curso = ((c && c.fechas) || []).find((f) => f.slug === m[1]) || null;
    }).catch(() => {});
  }

  function preparar(l) {
    if (l === BASE) return Promise.resolve();
    return Promise.all([
      cargar('data/i18n/' + BASE + '.json').then((d) => { D[BASE] = d; if (!inverso) indexar(d); }),
      cargar('data/i18n/' + l + '.json').then((d) => { D[l] = d; }),
      cargar('data/i18n/contenido.json').then(prepararContenido, () => prepararContenido(null)),
      cargarCurso()
    ]);
  }

  // ---------- Traducción de un texto en castellano ----------
  function buscar(n, l) {
    if (!n) return null;
    if (contenido && contenido[n]) return contenido[n][l] || null; // falta el idioma → castellano
    if (inverso && inverso[n]) {
      const v = valor(D[l], inverso[n]);
      return typeof v === 'string' ? v : null;
    }
    for (const p of plantillas) {
      const m = p.re.exec(n);
      if (!m) continue;
      const t = valor(D[l], p.clave);
      if (typeof t !== 'string') return null;
      const vars = {};
      p.nombres.forEach((nombre, i) => { vars[nombre] = buscar(m[i + 1], l) || m[i + 1]; });
      return rellenar(t, vars);
    }
    // "Ene–Feb" (caja de fechas que cruzan de mes)
    if (n.indexOf('–') > 0) {
      const partes = n.split('–').map((x) => buscar(x, l));
      if (partes.every(Boolean)) return partes.join('–');
    }
    return null;
  }

  function texto(s, l) {
    l = l || actual;
    if (l === BASE || s == null || !inverso) return s;
    const t = buscar(norm(s), l);
    if (t == null) return s;
    const m = String(s).match(/^(\s*)[\s\S]*?(\s*)$/);
    return m[1] + t + m[2];
  }

  // ---------- Fechas con el formato de cada idioma ----------
  function dias(f) {
    if (!f || !f.fecha) return [];
    return [f.fecha].concat(f.dias_extra || []).map((iso) => {
      const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
      return new Date(Date.UTC(a, m - 1, d));
    });
  }
  function fechaLarga(ds, l) {
    const loc = LOCALES[l || actual];
    const f = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    if (ds.length === 1) return f.format(ds[0]);
    const ultimo = ds[ds.length - 1];
    if (Math.round((ultimo - ds[0]) / 864e5) === ds.length - 1 && f.formatRange) return f.formatRange(ds[0], ultimo);
    const lista = new Intl.ListFormat(loc, { type: 'conjunction' });
    // mismo mes: "4, 11 i 18 de novembre del 2026"; si no, cada día con su mes
    if (ds.every((d) => d.getUTCMonth() === ds[0].getUTCMonth() && d.getUTCFullYear() === ds[0].getUTCFullYear())) {
      return lista.format(ds.slice(0, -1).map((d) => String(d.getUTCDate())).concat(f.format(ultimo)));
    }
    return lista.format(ds.map((d) => f.format(d)));
  }

  // ---------- Pintar la página ----------
  const originales = new WeakMap();   // nodo o elemento → texto original (castellano)
  const attrsOriginales = new WeakMap();
  const IGNORAR = '[data-i18n],[data-i18n-html],script,style,noscript,.lang-switch';

  function guardado(nodo, actualValor) {
    if (!originales.has(nodo)) originales.set(nodo, actualValor);
    return originales.get(nodo);
  }
  function attrOriginal(el, a) {
    let m = attrsOriginales.get(el);
    if (!m) { m = {}; attrsOriginales.set(el, m); }
    if (!(a in m)) m[a] = el.getAttribute(a);
    return m[a];
  }

  function pintar(l) {
    const d = D[l];
    const de = (clave) => { const v = l === BASE || !d ? null : valor(d, clave); return typeof v === 'string' ? v : null; };

    // 1) textos fijos con clave
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const orig = guardado(el, el.textContent);
      el.textContent = de(el.dataset.i18n) ?? orig;
    });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const orig = guardado(el, el.innerHTML);
      el.innerHTML = de(el.dataset.i18nHtml) ?? orig;
    });
    document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      el.dataset.i18nAttr.split(';').forEach((par) => {
        const [a, clave] = par.split(':').map((x) => x.trim());
        if (!a || !clave) return;
        const orig = attrOriginal(el, a);
        el.setAttribute(a, de(clave) ?? orig);
      });
    });

    // 2) lo que escribe el panel: textos y atributos sin clave, buscando el castellano
    if (document.body) {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement && n.parentElement.closest(IGNORAR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
      });
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = texto(guardado(n, n.nodeValue), l);
        if (n.nodeValue !== t) n.nodeValue = t;
      }
      document.body.querySelectorAll('[alt],[aria-label],[title]').forEach((el) => {
        if (el.hasAttribute('data-i18n-attr') || el.closest('.lang-switch')) return;
        for (const a of ['alt', 'aria-label', 'title']) {
          if (el.hasAttribute(a)) el.setAttribute(a, texto(attrOriginal(el, a), l));
        }
      });
    }

    // 3) <title> y descripción de las páginas generadas (no llevan clave)
    const titulo = document.querySelector('title');
    if (titulo && !titulo.hasAttribute('data-i18n')) {
      document.title = texto(guardado(titulo, document.title), l);
    }
    const desc = document.querySelector('meta[name="description"]');
    if (desc && !desc.hasAttribute('data-i18n-attr')) desc.setAttribute('content', texto(attrOriginal(desc, 'content'), l));

    // 4) página de curso: fecha larga y mensaje de WhatsApp en el idioma elegido
    if (curso) {
      const ds = dias(curso);
      const dd = document.querySelector('.curso-datos dd');
      const nodo = dd && dd.firstChild && dd.firstChild.nodeType === 3 ? dd.firstChild : null;
      if (nodo && ds.length) {
        const orig = guardado(nodo, nodo.nodeValue);
        nodo.nodeValue = l === BASE ? orig : fechaLarga(ds, l) + (orig.match(/\s*$/) || [''])[0];
      }
      document.querySelectorAll('a[href^="https://wa.me/"]').forEach((a) => {
        const orig = attrOriginal(a, 'href');
        const plantilla = de('generado.curso.whatsapp');
        if (!plantilla) { a.setAttribute('href', orig); return; }
        const u = new URL(orig);
        if (!u.searchParams.has('text')) return;
        let msg = rellenar(plantilla, { curso: texto(curso.titulo, l) });
        if (ds.length) msg += ' (' + fechaLarga(ds, l) + ')';
        a.setAttribute('href', u.origin + u.pathname + '?text=' + encodeURIComponent(msg)); // %20, como el panel
      });
    }

    // 5) selector
    html.lang = l;
    document.querySelectorAll('.lang-switch [data-lang]').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.lang === l ? 'true' : 'false');
    });
    document.dispatchEvent(new CustomEvent('sds:idioma', { detail: { idioma: l } }));
  }

  function aplicar(l) {
    return preparar(l)
      .then(() => { if (l === actual) pintar(l); })
      .catch((e) => {
        console.warn('Idiomas: no se ha podido cargar el diccionario', e);
        if (l !== BASE && l === actual) { actual = BASE; pintar(BASE); }
      })
      .finally(mostrar);
  }

  function cambiar(l) {
    l = valido(l) || BASE;
    try { localStorage.setItem(CLAVE, l); } catch (e) { /* nada */ }
    // si se entró con ?lang=xx, se quita para que al recargar mande la elección guardada
    try {
      const u = new URL(location.href);
      if (u.searchParams.has('lang')) { u.searchParams.delete('lang'); history.replaceState(history.state, '', u.href); }
    } catch (e) { /* nada */ }
    if (l === actual) return Promise.resolve();
    actual = l;
    return aplicar(l);
  }

  function montarSelector() {
    let sw = document.querySelector('.lang-switch');
    if (!sw) { // páginas generadas por el panel: se añade a la cabecera
      const cont = document.querySelector('.site-header .header-actions') || document.querySelector('.site-header .header-inner');
      if (!cont) return;
      sw = document.createElement('div');
      sw.className = 'lang-switch';
      sw.setAttribute('role', 'group');
      sw.setAttribute('aria-label', 'Idioma');
      sw.setAttribute('data-i18n-attr', 'aria-label:comun.idioma');
      sw.innerHTML = IDIOMAS.map((x) => '<button type="button" data-lang="' + x + '" lang="' + x + '" title="' + NOMBRES[x] + '">' + x.toUpperCase() + '</button>').join('');
      cont.insertBefore(sw, cont.firstChild);
    }
    sw.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-lang]');
      if (b) cambiar(b.dataset.lang);
    });
  }

  // Empieza a descargar ya, antes de que termine de cargar la página
  const listo = preparar(actual).catch(() => {});

  function iniciar() {
    montarSelector();
    if (actual === BASE) { pintar(BASE); mostrar(); return; }
    listo.then(() => aplicar(actual));
  }

  window.SDSi18n = {
    get idioma() { return actual; },
    locale: () => LOCALES[actual],
    /** Texto de una clave en el idioma actual (null si no hay diccionario cargado). */
    t(clave, vars) {
      const v = actual === BASE && !D[BASE] ? null : valor(D[actual], clave);
      return typeof v === 'string' ? rellenar(v, vars) : null;
    },
    /** Traduce un texto en castellano conocido (p. ej. un error del servidor). */
    texto: (s) => texto(s, actual),
    fechaLarga: (isoDias, l) => fechaLarga(dias({ fecha: isoDias[0], dias_extra: isoDias.slice(1) }), l),
    cambiar
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
