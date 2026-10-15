(() => {
  'use strict';

  const CONSENT_KEY = 'xondhan_terms_agreed_v1';
  const TERMS_TEXT = `TERMS AND CONDITIONS

Xondhan Library Management
Founded by Ritul Das | Under the Brand Name Xondhan

Xondhan Library Management is an educational project founded by Ritul Das under the brand name Xondhan, under the guidance of Ms. Babita Das, Head of the Education Department. The project aims to make library work easier, faster, and more organised through technology. It demonstrates how digital tools can help manage books, maintain stock records, and track book issues and returns effectively.

Xondhan Library Management has been developed for educational and learning purposes only. It is not intended for sale or commercial use. The system helps users manage books, check stock availability, record book issues and returns, and organise library information. Users are expected to use the system properly and enter accurate information.

The client or institution using Xondhan Library Management is responsible for maintaining, protecting, and backing up all library data. Therefore, the client should keep copies of important records and take reasonable steps to prevent data loss. The developer, Ritul Das, will not be responsible for lost, deleted, or missing records or related problems, to the extent permitted by applicable law.

Although the system is designed to work properly, technical errors, service interruptions, or unexpected problems may occur. Therefore, uninterrupted service, error-free operation, and complete data security cannot be guaranteed. The client or institution should maintain alternative records when necessary to protect important library information.

Since Xondhan Library Management is an educational project, the developer shall not automatically be held personally responsible for every technical problem, data loss, or service interruption that occurs while using the system. The client or institution is responsible for managing its data and using the system carefully. However, any legal responsibility will depend on the facts of the situation and applicable law. These terms do not remove any legal responsibility that cannot lawfully be excluded.

The Xondhan brand, source code, and original design of Xondhan Library Management remain under the ownership and control of the developer, Ritul Das, except where otherwise agreed in writing or required by law. The source code will remain with the developer and will not be provided to any person or institution without the developer's permission. If the developer decides to share or transfer the source code in the future, that decision will be voluntary and subject to applicable law and any existing agreements. No person or institution may demand the source code or claim ownership of it without a valid legal or contractual basis. Similarly, copying, reselling, redistributing, or claiming the original software or design as one's own is not permitted without proper authorisation, except where permitted by law. Any future arrangement involving the source code, official institutional use, commercial use, or transfer of ownership must be agreed upon separately in writing, where applicable.

By using Xondhan Library Management, users acknowledge that the system is an educational project and agree to these Terms and Conditions. The client or institution accepts responsibility for maintaining and protecting its library data, while the developer's responsibilities remain subject to applicable law and any written agreement between the parties. These terms aim to make the project's purpose, data responsibilities, and ownership rights clear and encourage the responsible use of Xondhan Library Management.

Founder and Developer: Ritul Das
Brand Name: Xondhan
Project Guidance: Ms. Babita Das, Head of the Education Department
Email: rituldas340@gmail.com
Contact Number: 9365733141

Xondhan Library Management — An Educational Project by Xondhan.`;

  const CSS = `
.xt-terms-dialog {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100dvh;
  max-width: none;
  max-height: none;
  display: grid;
  place-items: center;
  margin: 0;
  padding: 0;
  border: 0;
  overflow: visible;
  background: transparent;
  color: #182d2b;
}
.xt-terms-dialog::backdrop { background: rgba(18, 32, 30, .62); }
html.xt-terms-active, html.xt-terms-active body { overflow: hidden !important; }
.xt-terms-panel {
  width: min(740px, calc(100vw - 28px));
  max-height: min(82dvh, 760px);
  margin: 0;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  border: 1px solid #dce8e4;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 20px 60px rgba(0, 0, 0, .24);
}
.xt-terms-title { margin: 0; color: #173f39; font: 700 24px/1.2 Georgia, "Times New Roman", serif; }
.xt-terms-intro { margin: 0; color: #647773; }
.xt-terms-content {
  flex: 1 1 0;
  min-height: 180px;
  max-height: 58vh;
  padding: 14px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  border: 1px solid #dce8e4;
  border-radius: 8px;
  background: #f7faf9;
  color: #263b38;
  line-height: 1.65;
  white-space: pre-line;
  overscroll-behavior: contain;
}
.xt-terms-agree, .xt-terms-close {
  min-height: 46px;
  padding: 11px 18px;
  border: 0;
  border-radius: 8px;
  font: 700 15px/1.2 "Trebuchet MS", "Segoe UI", sans-serif;
  cursor: pointer;
}
.xt-terms-agree { background: #087f72; color: #fff; }
.xt-terms-agree:hover { background: #06675d; }
.xt-terms-close { background: #087f72; color: #fff; }
.xt-terms-close:hover { background: #06675d; }
.xt-terms-agree:focus-visible, .xt-terms-close:focus-visible { outline: 3px solid #f0a34a; outline-offset: 2px; }
.xt-terms-reader .xt-terms-panel {
  width: min(820px, calc(100vw - 22px));
  max-height: min(84dvh, 820px);
}
.xt-terms-reader .xt-terms-content { max-height: min(62vh, 620px); }
.xt-terms-reader .xt-terms-close { align-self: flex-end; min-width: 96px; }
@media (max-width: 420px) {
  .xt-terms-panel { padding: 18px; gap: 12px; }
  .xt-terms-title { font-size: 22px; }
  .xt-terms-content { padding: 12px; max-height: min(56vh, 420px); }
  .xt-terms-agree { width: 100%; }
}
`;

  function addStyles() {
    try {
      if (!('adoptedStyleSheets' in document) || !window.CSSStyleSheet) return;
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    } catch (_) {
      // The consent flow remains usable if constructed stylesheets are unavailable.
    }
  }

  function hasAgreed() {
    try {
      return window.localStorage.getItem(CONSENT_KEY) === 'yes';
    } catch (_) {
      return false;
    }
  }

  function saveAgreement() {
    try {
      window.localStorage.setItem(CONSENT_KEY, 'yes');
    } catch (_) {
      // Keep this visit usable even when browser storage is unavailable.
    }
  }

  function makeTermsContent() {
    const content = document.createElement('div');
    content.className = 'xt-terms-content';
    content.textContent = TERMS_TEXT;
    return content;
  }

  function makePanel(titleText, introText, buttonText, buttonClass) {
    const panel = document.createElement('section');
    panel.className = 'xt-terms-panel';
    const title = document.createElement('h2');
    title.className = 'xt-terms-title';
    title.textContent = titleText;
    title.id = 'xondhan-terms-title';
    panel.setAttribute('aria-labelledby', title.id);
    panel.append(title);
    if (introText) {
      const intro = document.createElement('p');
      intro.className = 'xt-terms-intro';
      intro.textContent = introText;
      panel.append(intro);
    }
    panel.append(makeTermsContent());
    const button = document.createElement('button');
    button.className = buttonClass;
    button.type = 'button';
    button.textContent = buttonText;
    panel.append(button);
    return { panel, button };
  }

  function showModal(dialog) {
    document.body.append(dialog);
    try {
      dialog.showModal();
    } catch (_) {
      dialog.setAttribute('open', '');
      dialog.setAttribute('aria-modal', 'true');
      document.querySelector('#appView')?.setAttribute('inert', '');
      document.querySelector('#loginView')?.setAttribute('inert', '');
      document.documentElement.style.overflow = 'hidden';
    }
  }

  function closeModal(dialog) {
    if (dialog && typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else if (dialog) {
      dialog.removeAttribute('open');
    }
    document.documentElement.classList.remove('xt-terms-active');
    document.querySelector('#appView')?.removeAttribute('inert');
    document.querySelector('#loginView')?.removeAttribute('inert');
    document.documentElement.style.overflow = '';
    if (dialog && dialog.parentNode) {
      dialog.parentNode.removeChild(dialog);
    }
  }

  function showAgreementGate() {
    const dialog = document.createElement('dialog');
    dialog.className = 'xt-terms-dialog xt-terms-gate';
    document.documentElement.classList.add('xt-terms-active');
    const { panel, button } = makePanel(
      'Terms & Conditions',
      'Please read these terms before using Xondhan Library.',
      'I Agree',
      'xt-terms-agree'
    );
    dialog.append(panel);
    dialog.addEventListener('cancel', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      saveAgreement();
      closeModal(dialog);
    });
    showModal(dialog);
    button.focus();
  }

  function createAccountTermsButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-ghost';
    button.textContent = 'Terms & Conditions dekhein';
    button.addEventListener('click', () => {
      const dialog = document.createElement('dialog');
      dialog.className = 'xt-terms-dialog xt-terms-reader';
      const { panel, button: closeButton } = makePanel(
        'Terms & Conditions',
        'Xondhan Library usage terms',
        'Close',
        'xt-terms-close'
      );
      dialog.append(panel);
      closeButton.addEventListener('click', () => closeModal(dialog));
      dialog.addEventListener('close', () => dialog.remove(), { once: true });
      showModal(dialog);
      closeButton.focus();
    });
    return button;
  }

  addStyles();
  window.createAccountTermsButton = createAccountTermsButton;
  if (!hasAgreed()) showAgreementGate();
})();
