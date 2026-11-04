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

  document.getElementById('year').textContent = new Date().getFullYear();
})();
