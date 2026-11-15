export function createFocusView({ container, label, kind, buttonLabel = 'Focus view' }) {
  const document = container.ownerDocument;
  const host = document.createElement('div');
  host.className = 'focus-host';

  const dialog = document.createElement('dialog');
  dialog.id = `focus-view-${kind}`;
  dialog.className = 'focus-view';
  dialog.dataset.focusKind = kind;
  dialog.setAttribute('aria-label', label);
  dialog.setAttribute('role', 'region');
  dialog.open = true;

  const header = document.createElement('div');
  header.className = 'focus-view-header';
  const title = document.createElement('h2');
  title.textContent = label;
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'focus-view-control';
  dismiss.textContent = 'Close';
  header.append(title, dismiss);

  const body = document.createElement('div');
  body.className = 'focus-body';
  dialog.append(header, body);
  host.append(dialog);
  container.append(host);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'focus-view-control focus-view-launch';
  button.textContent = buttonLabel;
  button.setAttribute('aria-label', `${buttonLabel} · ${label}`);
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-controls', dialog.id);

  let focused = false;

  function announceChange() {
    document.defaultView.dispatchEvent(new CustomEvent('focusview:change', {
      detail: { kind, open: focused }
    }));
  }

  function open() {
    if (!dialog.isConnected || document.querySelector('.focus-view:modal')) return;

    host.style.minBlockSize = `${host.getBoundingClientRect().height}px`;
    // Promote the same dialog so live media remains attached to the document.
    dialog.close();
    dialog.removeAttribute('role');
    dismiss.autofocus = true;
    dialog.showModal();
    focused = true;
    announceChange();
  }

  function restoreInline() {
    focused = false;
    dismiss.autofocus = false;
    dialog.setAttribute('role', 'region');
    dialog.open = true;
    host.style.removeProperty('min-block-size');
    button.focus({ preventScroll: true });
    announceChange();
  }

  function close() {
    if (!focused) return;
    dialog.close();
    restoreInline();
  }

  button.addEventListener('click', open);
  dismiss.addEventListener('click', close);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('close', () => {
    // The close event from inline promotion can arrive after showModal().
    if (focused && !dialog.open) restoreInline();
  });

  return { body, dialog, button, open, close, isFocused: () => focused };
}
