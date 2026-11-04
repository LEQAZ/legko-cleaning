// Desktop-only optional navigation. Ordinary links remain the primary accessible control.
export function setupPageDrag({ beforeNavigate = () => {} } = {}) {
  const links = [...document.querySelectorAll('.property-tabs a')];
  const currentIndex = links.findIndex(link => link.getAttribute('aria-current') === 'page');
  if (links.length < 2 || currentIndex < 0) return;

  const indicator = document.createElement('div');
  indicator.className = 'page-drag-indicator';
  indicator.hidden = true;
  indicator.setAttribute('role', 'status');
  const arrow = document.createElement('span'); arrow.className = 'page-drag-arrow'; arrow.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  const progress = document.createElement('span'); progress.className = 'page-drag-progress'; progress.setAttribute('aria-hidden', 'true');
  indicator.append(arrow, label, progress);
  document.body.append(indicator);

  const blocked = 'a,button,input,textarea,select,label,summary,details,dialog,nav,form,fieldset,article,img,svg,video,audio,canvas,[contenteditable],h1,h2,h3,h4,p,li,dt,dd,legend,small,span,strong,em,.header,.footer,.hero-visual,.service-card,.estimate-card,.calculator-controls,.request-section,[data-no-page-drag]';
  let gesture = null;
  const destination = (dx) => links[(currentIndex + (dx < 0 ? 1 : -1) + links.length) % links.length];
  const cancel = () => {
    const old = gesture;
    gesture = null;
    indicator.hidden = true;
    document.body.classList.remove('is-page-dragging');
    if (old && document.documentElement.hasPointerCapture(old.id)) document.documentElement.releasePointerCapture(old.id);
  };

  document.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.buttons !== 1 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    if (document.querySelector('dialog[open]') || !window.getSelection()?.isCollapsed) return;
    if (event.clientX >= document.documentElement.clientWidth) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest(blocked)) return;
    // Shadow-root overlays belong to extensions/widgets, never to the page background.
    if (event.composedPath().some(node => node instanceof ShadowRoot || (node instanceof Element && node.shadowRoot))) return;
    if ([...target.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, active: false,
      threshold: Math.min(150, Math.max(100, innerWidth * 0.1)), message: '' };
    event.preventDefault();
    document.documentElement.setPointerCapture(event.pointerId);
  });

  document.addEventListener('pointermove', (event) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (event.buttons !== 1) { cancel(); return; }
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) * 0.7) { cancel(); return; }
    if (Math.abs(dx) < 16 && !gesture.active) return;
    gesture.active = true;
    event.preventDefault();
    document.body.classList.add('is-page-dragging');
    const target = destination(dx);
    const ready = Math.abs(dx) >= gesture.threshold && Math.abs(dx) > Math.abs(dy) * 1.5;
    const message = ready ? `Отпустите — «${target.textContent.trim()}»` : `Потяните дальше — «${target.textContent.trim()}»`;
    if (message !== gesture.message) { label.textContent = message; gesture.message = message; }
    arrow.textContent = dx < 0 ? '←' : '→';
    indicator.style.setProperty('--drag-progress', String(Math.min(1, Math.abs(dx) / gesture.threshold)));
    indicator.classList.toggle('is-ready', ready);
    indicator.hidden = false;
  }, { passive: false });

  document.addEventListener('pointerup', (event) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const ready = gesture.active && Math.abs(dx) >= gesture.threshold && Math.abs(dx) > Math.abs(dy) * 1.5;
    const target = ready ? destination(dx).href : null;
    cancel();
    if (target) { beforeNavigate(target); location.assign(target); }
  });
  document.addEventListener('pointercancel', cancel);
  document.documentElement.addEventListener('lostpointercapture', cancel);
  window.addEventListener('blur', cancel);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') cancel(); });
}
