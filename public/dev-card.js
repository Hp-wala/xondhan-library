// Developer business card: click the "XN" logo -> it grows, flips, and shows the card.
// Self-contained (HTML + CSS + JS in this one file). Put your photo at public/ritul.jpg
(() => {
  'use strict';

  const CSS = `
.brand-mark { cursor: pointer; transition: transform .2s; }
.brand-mark:hover { transform: scale(1.08); }
.dc-overlay {
  position: fixed; inset: 0; z-index: 3000; display: flex; align-items: center; justify-content: center;
  background: rgba(20, 15, 30, 0); perspective: 1200px; transition: background .5s;
}
.dc-overlay[hidden] { display: none; }
.dc-overlay.open { background: rgba(20, 15, 30, .7); }
.dc-overlay.bursting { background: rgba(20, 15, 30, .48); }
.dc-card { width: min(380px, 92vw); height: 230px; transform: scale(.14); transition: transform .9s cubic-bezier(.2, .8, .2, 1); }
.dc-overlay.open .dc-card { transform: scale(1); }
.dc-inner { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; transition: transform .9s cubic-bezier(.2, .8, .2, 1); }
.dc-overlay.open .dc-inner { transform: rotateY(180deg); }
.dc-face {
  position: absolute; inset: 0; border-radius: 18px; box-shadow: 0 20px 60px rgba(0, 0, 0, .4);
  backface-visibility: hidden; -webkit-backface-visibility: hidden;
}
.dc-front { position: relative; overflow: visible; background: linear-gradient(135deg, #833ab4, #c13584 60%, #e1306c); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 96px; font-weight: 800; letter-spacing: 2px; }
.dc-front-label { position: relative; z-index: 1; }
.dc-particles { position: absolute; inset: 0; pointer-events: none; }
.dc-particle { position: absolute; left: 50%; top: 50%; width: 24px; height: 22px; margin: -11px 0 0 -12px; opacity: 0; background: linear-gradient(135deg, #feda75, #fa7e1e 38%, #d62976 68%, #4f5bd5); }
.dc-piece-1 { clip-path: polygon(0 0, 100% 8%, 38% 100%); --burst-x: -138px; --burst-y: -86px; --burst-rotate: -88deg; }
.dc-piece-2 { clip-path: polygon(4% 0, 100% 0, 74% 100%); --burst-x: -82px; --burst-y: -138px; --burst-rotate: 64deg; }
.dc-piece-3 { clip-path: polygon(0 12%, 100% 0, 45% 100%); --burst-x: 8px; --burst-y: -154px; --burst-rotate: -52deg; }
.dc-piece-4 { clip-path: polygon(0 0, 90% 20%, 100% 100%); --burst-x: 98px; --burst-y: -118px; --burst-rotate: 92deg; }
.dc-piece-5 { clip-path: polygon(0 0, 100% 30%, 64% 100%); --burst-x: 148px; --burst-y: -28px; --burst-rotate: -75deg; }
.dc-piece-6 { clip-path: polygon(0 0, 76% 0, 100% 100%); --burst-x: 126px; --burst-y: 88px; --burst-rotate: 80deg; }
.dc-piece-7 { clip-path: polygon(14% 0, 100% 0, 46% 100%); --burst-x: 32px; --burst-y: 148px; --burst-rotate: -96deg; }
.dc-piece-8 { clip-path: polygon(0 0, 100% 0, 76% 100%); --burst-x: -88px; --burst-y: 124px; --burst-rotate: 72deg; }
.dc-overlay.bursting .dc-particle { animation: dc-burst .68s cubic-bezier(.18, .7, .25, 1) forwards; }
.dc-overlay.bursting .dc-piece-2, .dc-overlay.bursting .dc-piece-6 { animation-delay: .035s; }
.dc-overlay.bursting .dc-piece-3, .dc-overlay.bursting .dc-piece-7 { animation-delay: .07s; }
.dc-overlay.bursting .dc-piece-4, .dc-overlay.bursting .dc-piece-8 { animation-delay: .105s; }
@keyframes dc-burst {
  0% { opacity: 0; transform: translate3d(0, 0, 0) scale(.3) rotate(0); }
  12% { opacity: 1; }
  100% { opacity: 0; transform: translate3d(var(--burst-x), var(--burst-y), 0) scale(5) rotate(var(--burst-rotate)); }
}
.dc-back { transform: rotateY(180deg); background: #fff; display: flex; align-items: center; gap: 18px; padding: 22px; border-top: 6px solid #833ab4; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
.dc-photo {
  width: 96px; height: 96px; border-radius: 50%; overflow: hidden; flex-shrink: 0; border: 3px solid #833ab4;
  background: linear-gradient(135deg, #833ab4, #c13584); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 28px;
}
.dc-photo img { width: 100%; height: 100%; object-fit: cover; }
.dc-photo [hidden] { display: none; }
.dc-info h3 { font-size: 20px; margin: 0; color: #1f1f28; }
.dc-info p { font-size: 13px; color: #6b6b7b; margin: 4px 0 0; word-break: break-all; }
.dc-info .dc-role { color: #833ab4; font-weight: 600; }
.dc-info .dc-tag { margin-top: 10px; font-weight: 700; letter-spacing: 1px; color: #c13584; }
.dc-close { position: absolute; top: 6px; right: 12px; background: none; border: 0; font-size: 26px; cursor: pointer; color: #6b6b7b; }
@media (prefers-reduced-motion: reduce) { .dc-card, .dc-inner, .dc-overlay { transition-duration: .01s; } .dc-particle { animation: none !important; } }
`;

  // Edit these details as you like
  const HTML = `
<div class="dc-card" role="dialog" aria-modal="true" aria-label="Developer business card">
  <div class="dc-inner">
    <div class="dc-face dc-front">
      <span class="dc-front-label">XN</span>
      <span class="dc-particles" aria-hidden="true">
        <i class="dc-particle dc-piece-1"></i><i class="dc-particle dc-piece-2"></i>
        <i class="dc-particle dc-piece-3"></i><i class="dc-particle dc-piece-4"></i>
        <i class="dc-particle dc-piece-5"></i><i class="dc-particle dc-piece-6"></i>
        <i class="dc-particle dc-piece-7"></i><i class="dc-particle dc-piece-8"></i>
      </span>
    </div>
    <div class="dc-face dc-back">
      <button class="dc-close" type="button" aria-label="Close">&times;</button>
      <div class="dc-photo">
        <img class="dc-img" src="ritul.jpg" alt="Ritul Das">
        <span class="dc-initials" hidden>RD</span>
      </div>
      <div class="dc-info">
        <h3>Ritul Das</h3>
        <p class="dc-role">Developer, Architect &amp; Designer</p>
        <p>✉ rituldas340@gmail.com</p>
        <p>☎ +91 9365733141</p>
        <p class="dc-tag">Xondhan</p>
      </div>
    </div>
  </div>
</div>`;

  function init() {
    // Styles via CSSOM (works with the strict CSP; no inline <style>)
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    } catch (e) {
      console.warn('Developer card: this browser does not support constructed stylesheets.');
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'dc-overlay';
    overlay.hidden = true;
    overlay.innerHTML = HTML; // static trusted markup defined above
    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector('.dc-close');
    const img = overlay.querySelector('.dc-img');
    const initials = overlay.querySelector('.dc-initials');
    let timer, burstTimer;

    function open() {
      clearTimeout(timer);
      clearTimeout(burstTimer);
      overlay.classList.remove('open', 'bursting');
      overlay.hidden = false;
      void overlay.offsetWidth; // restart transition
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        requestAnimationFrame(() => overlay.classList.add('open'));
      } else {
        requestAnimationFrame(() => overlay.classList.add('bursting'));
        burstTimer = setTimeout(() => {
          overlay.classList.remove('bursting');
          overlay.classList.add('open');
        }, 700);
      }
      closeBtn.focus();
    }
    function close() {
      clearTimeout(burstTimer);
      overlay.classList.remove('bursting');
      overlay.classList.remove('open');
      timer = setTimeout(() => { overlay.hidden = true; }, 900);
    }

    document.querySelectorAll('.brand-mark').forEach((m) => {
      m.setAttribute('role', 'button');
      m.setAttribute('tabindex', '0');
      m.setAttribute('aria-label', 'About the developer');
      m.addEventListener('click', open);
      m.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) close(); });

    const noPhoto = () => { img.hidden = true; initials.hidden = false; };
    img.addEventListener('error', noPhoto);
    if (img.complete && img.naturalWidth === 0) noPhoto();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
