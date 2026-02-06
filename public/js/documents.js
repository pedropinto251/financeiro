(() => {
  const links = document.querySelectorAll('.doc-link');
  if (!links.length) return;

  const overlay = document.createElement('div');
  overlay.className = 'doc-overlay';
  overlay.innerHTML = `
    <div class="doc-modal">
      <button class="doc-close" type="button">Fechar</button>
      <iframe class="doc-frame" title="Documento"></iframe>
    </div>
  `;
  document.body.appendChild(overlay);

  const frame = overlay.querySelector('.doc-frame');
  const closeBtn = overlay.querySelector('.doc-close');

  function openDoc(url) {
    frame.src = url;
    overlay.classList.add('open');
  }

  function closeDoc() {
    overlay.classList.remove('open');
    frame.src = '';
  }

  links.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openDoc(link.href);
    });
  });

  closeBtn.addEventListener('click', closeDoc);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDoc();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDoc();
  });
})();
