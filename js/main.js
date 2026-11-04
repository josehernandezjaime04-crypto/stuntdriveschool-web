(function () {
  const header = document.getElementById('siteHeader');
  const progress = document.querySelector('#scrollProgress span');
  const heroPhoto = document.getElementById('heroPhoto');
  const heroContent = document.getElementById('heroContent');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Header + barra de progreso + parallax del hero
  function onScroll() {
    const y = window.scrollY;
    header.classList.toggle('scrolled', y > 40);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
    if (heroPhoto && !reduceMotion && y < window.innerHeight) {
      heroPhoto.style.transform = 'translate3d(0,' + y * 0.25 + 'px,0)';
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Entrada del texto del hero
  if (heroContent) requestAnimationFrame(() => heroContent.classList.add('loaded'));

  // Aparición al hacer scroll (también para contenido pintado después, vía window.cfxReveal)
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  window.cfxReveal = (el) => io.observe(el);
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  // Menú móvil
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('mainNav');
  function setMenu(open) {
    nav.classList.toggle('open', open);
    toggle.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open);
    document.body.style.overflow = open ? 'hidden' : '';
  }
  toggle.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));

  // Carrusel de pósters: repite la lista hasta cubrir la pantalla y la duplica,
  // así el bucle (-50 %) cae justo al final de una copia y nunca deja huecos.
  const track = document.getElementById('postersTrack');
  if (track) {
    const group = track.querySelector('.posters-group');
    const base = group.innerHTML;
    function buildMarquee() {
      track.querySelectorAll('.posters-group').forEach((g, i) => { if (i > 0) g.remove(); });
      group.innerHTML = base;
      while (group.scrollWidth < window.innerWidth + 200) group.insertAdjacentHTML('beforeend', base);
      const clone = group.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
      track.style.setProperty('--marquee-dur', (group.scrollWidth / 50) + 's'); // ~50 px/s
    }
    let rt, lastW = window.innerWidth;
    window.addEventListener('resize', () => {
      if (window.innerWidth === lastW) return; // en móvil, ocultar la barra del navegador no debe reiniciarlo
      lastW = window.innerWidth;
      clearTimeout(rt); rt = setTimeout(buildMarquee, 200);
    });
    // espera a que carguen los pósters para medir bien el ancho
    window.addEventListener('load', buildMarquee);
  }

  // Lista de interesados: envía los datos al servicio del minipc (ver data-api del formulario)
  const form = document.getElementById('avisosForm');
  if (form) {
    const msg = document.getElementById('avisosMsg');
    const btn = form.querySelector('button[type="submit"]');
    const box = document.getElementById('avTurnstile');
    let widget = null;

    // Turnstile (antispam de Cloudflare) se carga solo cuando el formulario se acerca a pantalla
    function cargarTurnstile() {
      if (window.turnstile || document.getElementById('tsScript')) return;
      window.onTurnstileLoad = () => {
        widget = window.turnstile.render(box, { sitekey: form.dataset.sitekey, theme: 'dark', language: 'es' });
      };
      const s = document.createElement('script');
      s.id = 'tsScript';
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';
      s.async = true;
      document.head.appendChild(s);
    }
    new IntersectionObserver(([e], obs) => {
      if (e.isIntersecting) { cargarTurnstile(); obs.disconnect(); }
    }, { rootMargin: '600px 0px' }).observe(form);

    function aviso(texto, tipo) {
      msg.textContent = texto;
      msg.className = 'notify-msg' + (tipo ? ' ' + tipo : '');
    }
    function marcar(campo, mal) { campo.setAttribute('aria-invalid', mal ? 'true' : 'false'); }

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = form.elements;
      const nombre = f.nombre.value.trim();
      const email = f.email.value.trim();
      const telefono = f.telefono.value.trim();
      const nombreMal = nombre.length < 2;
      const emailMal = !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email);
      const telMal = telefono !== '' && !/^\+?[0-9 ]{6,20}$/.test(telefono);
      marcar(f.nombre, nombreMal); marcar(f.email, emailMal); marcar(f.telefono, telMal);
      if (nombreMal) { f.nombre.focus(); return aviso('Escribe tu nombre.', 'error'); }
      if (emailMal) { f.email.focus(); return aviso('Revisa el email.', 'error'); }
      if (telMal) { f.telefono.focus(); return aviso('Revisa el teléfono (solo números).', 'error'); }
      if (!f.consentimiento.checked) return aviso('Tienes que aceptar la política de privacidad.', 'error');

      const token = window.turnstile && widget !== null ? window.turnstile.getResponse(widget) : '';
      const datos = {
        nombre, email, telefono,
        intereses: [...form.querySelectorAll('input[name="intereses"]:checked')].map((i) => i.value),
        consentimiento: true,
        web: f.web.value,
        turnstile: token || ''
      };

      btn.disabled = true;
      aviso('Enviando…');
      try {
        const r = await fetch(form.dataset.api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(datos)
        });
        const res = await r.json().catch(() => ({}));
        if (r.ok && res.ok) {
          form.closest('.notify').classList.add('sent');
          aviso('¡Hecho! Te avisaremos cuando haya nuevas fechas.', 'ok');
          form.reset();
          return;
        }
        aviso(res.error || 'No se ha podido enviar. Inténtalo de nuevo.', 'error');
      } catch (e) {
        aviso('Ahora mismo no podemos guardar tu solicitud. Escríbenos por WhatsApp al 633 06 36 57.', 'error');
      } finally {
        btn.disabled = false;
        if (window.turnstile && widget !== null) window.turnstile.reset(widget);
      }
    });
  }

  document.getElementById('year').textContent = new Date().getFullYear();
})();
