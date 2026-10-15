(() => {
  'use strict';

  const SHOWCASE_BOOK_COUNT_OVERRIDE = null;
  const SHOWCASE_BORROWER_COUNT_OVERRIDE = null;
  const CARD_COUNT = 5;
  const CONTACT_PHONE = '919365733141';
  const CONTACT_EMAIL = 'rituldas340@gmail.com';
  const WHATSAPP_MESSAGE = 'Hi Ritul, I saw Xondhan and I want a similar system for my business. Can we talk?';
  const EMAIL_SUBJECT = 'Xondhan inquiry';
  const EMAIL_BODY = 'Hi Ritul, I saw Xondhan and I want a similar system for my business.';

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  function createAccountShowcase({ books = [], transactions = [] } = {}) {
    const totalCopies = books.reduce((sum, book) => sum + (Number(book.total_copies) || 0), 0);
    const borrowerNames = new Set(transactions
      .map((transaction) => String(transaction.student_name || '').trim().toLowerCase())
      .filter(Boolean));
    const booksTracked = SHOWCASE_BOOK_COUNT_OVERRIDE ?? totalCopies;
    const borrowersManaged = SHOWCASE_BORROWER_COUNT_OVERRIDE ?? borrowerNames.size;
    const cards = [
      { title: 'XONDHAN', lines: ['One screen runs the whole library.', 'Founder & CEO: Ritul Das', 'Designed, built and launched by one person.'], hero: true },
      { title: 'What it does', lines: ['Issue books. Track returns. Catch overdue. Manage stock. See full history. All in one place, right from your phone.'] },
      { title: 'Proof', lines: [`${booksTracked} books tracked · ${borrowersManaged} borrowers managed · 0 paper registers`] },
      { title: 'Built by Ritul Das', lines: ['Batch 2024-27 · Department of English', 'Second subject: Education'] },
      { title: 'Want a system like this?', lines: ["Let's build one for your business."], contact: true }
    ];

    const root = element('section', 'card account-showcase');
    const collapsed = element('div', 'showcase-collapsed');
    collapsed.append(element('p', 'showcase-prompt', 'One library, one screen. See how.'));
    const startButton = element('button', 'btn btn-primary showcase-button', 'Check it out');
    startButton.type = 'button';
    collapsed.append(startButton);

    const stage = element('div', 'showcase-stage');
    stage.hidden = true;
    stage.tabIndex = -1;
    stage.setAttribute('aria-label', 'Xondhan library introduction');

    const shuffle = element('div', 'showcase-shuffle');
    shuffle.setAttribute('role', 'status');
    shuffle.setAttribute('aria-label', 'Shuffling cards');
    const pile = element('div', 'showcase-pile');
    for (let index = 0; index < 3; index++) {
      pile.append(element('div', `showcase-shuffle-card shuffle-card-${index + 1}`, 'XN'));
    }
    shuffle.append(pile);

    const viewer = element('div', 'showcase-viewer');
    viewer.hidden = true;
    viewer.setAttribute('aria-live', 'polite');
    viewer.setAttribute('aria-atomic', 'true');
    const slideHost = element('div', 'showcase-slide-host');
    viewer.append(slideHost);

    const footer = element('div', 'showcase-footer');
    const closeButton = element('button', 'btn btn-ghost showcase-button', 'Close');
    closeButton.type = 'button';
    const progress = element('div', 'showcase-progress');
    progress.setAttribute('role', 'group');
    progress.setAttribute('aria-label', `Card 1 of ${CARD_COUNT}`);
    const dots = [];
    for (let index = 0; index < CARD_COUNT; index++) {
      const dot = element('span', 'showcase-dot');
      dot.setAttribute('aria-hidden', 'true');
      dots.push(dot);
      progress.append(dot);
    }
    const nextButton = element('button', 'btn btn-primary showcase-button', 'Next');
    nextButton.type = 'button';
    footer.append(closeButton, progress, nextButton);
    stage.append(shuffle, viewer, footer);
    root.append(collapsed, stage);

    let currentCard = 0;
    let shuffleTimer = 0;
    let touchStartX = null;
    let ignoreSwipeClick = false;
    let swipeClickTimer = 0;

    function clearSwipeClickGuard() {
      ignoreSwipeClick = false;
      window.clearTimeout(swipeClickTimer);
      swipeClickTimer = 0;
    }

    function addContactLinks(slide) {
      const links = element('div', 'showcase-contact-links');
      const whatsapp = element('a', 'btn btn-primary showcase-button', 'Build my system');
      whatsapp.href = `https://wa.me/${CONTACT_PHONE}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;
      whatsapp.target = '_blank';
      whatsapp.rel = 'noopener';
      const email = element('a', 'btn btn-ghost showcase-button', 'Email me');
      const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(EMAIL_SUBJECT)}&body=${encodeURIComponent(EMAIL_BODY)}`;
      const gmailCompose = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(CONTACT_EMAIL)}&su=${encodeURIComponent(EMAIL_SUBJECT)}&body=${encodeURIComponent(EMAIL_BODY)}`;
      const desktopPointer = navigator.maxTouchPoints === 0 && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      email.href = desktopPointer ? gmailCompose : mailto;
      if (desktopPointer) {
        email.target = '_blank';
        email.rel = 'noopener';
      }
      links.append(whatsapp, email);
      slide.append(links);
    }

    function showCard(index) {
      currentCard = index;
      shuffle.hidden = true;
      viewer.hidden = false;
      progress.setAttribute('aria-label', `Card ${index + 1} of ${CARD_COUNT}`);
      dots.forEach((dot, dotIndex) => dot.classList.toggle('is-current', dotIndex === index));
      const card = cards[index];
      const slide = element('article', `showcase-slide${card.hero ? ' showcase-slide-hero' : ''}`);
      slide.setAttribute('role', 'button');
      slide.setAttribute('tabindex', '0');
      slide.setAttribute('aria-label', 'Next card');
      slide.append(element(card.hero ? 'h2' : 'h3', 'showcase-title', card.title));
      card.lines.forEach((line, lineIndex) => {
        slide.append(element(card.hero && lineIndex === 0 ? 'p' : 'p', lineIndex === 0 ? 'showcase-lead' : 'showcase-copy', line));
      });
      if (index === 0) slide.append(element('p', 'showcase-hint', 'Tap card to continue'));
      if (card.contact) addContactLinks(slide);
      slide.addEventListener('click', (event) => {
        if (ignoreSwipeClick) {
          clearSwipeClickGuard();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (event.detail === 0 || currentCard >= CARD_COUNT - 1) return;
        if (event.target.closest('a, button, input, select, textarea, .showcase-progress')) return;
        moveCard(1);
      });
      slide.addEventListener('keydown', (event) => {
        if (event.target !== slide || currentCard >= CARD_COUNT - 1) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        moveCard(1);
      });
      slideHost.replaceChildren(slide);
      nextButton.textContent = index === CARD_COUNT - 1 ? 'Done' : 'Next';
      requestAnimationFrame(() => slide.classList.add('is-visible'));
      nextButton.focus({ preventScroll: true });
    }

    function closeShowcase() {
      window.clearTimeout(shuffleTimer);
      shuffleTimer = 0;
      stage.hidden = true;
      collapsed.hidden = false;
      root.classList.remove('is-active');
      shuffle.classList.remove('is-shuffling');
      viewer.hidden = true;
      slideHost.replaceChildren();
      startButton.focus({ preventScroll: true });
    }

    function startShowcase() {
      if (!stage.hidden) return;
      currentCard = 0;
      collapsed.hidden = true;
      stage.hidden = false;
      viewer.hidden = true;
      shuffle.hidden = false;
      root.classList.add('is-active');
      shuffle.classList.remove('is-shuffling');
      void shuffle.offsetWidth;
      shuffle.classList.add('is-shuffling');
      stage.focus({ preventScroll: true });
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      shuffleTimer = window.setTimeout(() => showCard(0), reducedMotion ? 0 : 1000);
    }

    function moveCard(direction) {
      const next = currentCard + direction;
      if (next < 0) return;
      if (next >= CARD_COUNT) closeShowcase();
      else showCard(next);
    }

    startButton.addEventListener('click', startShowcase);
    closeButton.addEventListener('click', closeShowcase);
    nextButton.addEventListener('click', () => moveCard(1));
    stage.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !stage.hidden) {
        event.preventDefault();
        closeShowcase();
      }
    });
    viewer.addEventListener('touchstart', (event) => {
      clearSwipeClickGuard();
      if (event.touches.length === 1) touchStartX = event.touches[0].clientX;
    }, { passive: true });
    viewer.addEventListener('touchend', (event) => {
      if (touchStartX == null || event.changedTouches.length !== 1) return;
      const delta = event.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(delta) >= 50) {
        ignoreSwipeClick = true;
        window.clearTimeout(swipeClickTimer);
        swipeClickTimer = window.setTimeout(clearSwipeClickGuard, 500);
        moveCard(delta < 0 ? 1 : -1);
      }
    }, { passive: true });

    return root;
  }

  window.createAccountShowcase = createAccountShowcase;
})();
