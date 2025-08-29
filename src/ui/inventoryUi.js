// /src/ui/inventoryUi.js — Soulslike Inventory (compact version)
/**
 * Compatto: niente gold, niente slot extra/split/drop, close solo a destra.
 * Include: overlay animato, card elegante, griglia equip (head/weapon/shield), griglia zaino,
 * hint tasti, gestione pointer lock, API di bridge (setInventorySlot/setEquipment).
 */

let _state = { inited: false, root: null, els: {} };
let _wasPointerLocked = false;

function _canvasEl() {
  return document.getElementById('three-canvas') || document.querySelector('canvas');
}

export function initInventoryUI(options = {}) {
  if (_state.inited) return _state.els;

  const {
    parent = document.body,
    gridCols = 8,
    gridRows = 6,
    title = 'Inventory',
    equipmentTitle = 'Equipment',
  } = options;

  // Overlay + container
  const overlay = el('div', { className: 'inv-overlay', 'data-role': 'overlay' });
  overlay.addEventListener('click', () => closeInventory());

  const wrap = el('div', { className: 'inv-wrap' });
  wrap.style.display = 'none'; // togglata via open/close

  const panel = el('div', {
    className: 'inv-panel',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Inventory',
  });

  // ----- LEFT: Equipment -----
  const colLeft = el('section', { className: 'inv-col' });

  // header sinistro SENZA pulsante close
  const headLeft = headerRow(equipmentTitle, { showClose: false });
  colLeft.appendChild(headLeft.row);

  const equipGrid = el('div', { className: 'equip-grid' });
  // Layout compatto a 3 slot
  equipGrid.style.gridTemplateAreas = `"head head" "weapon shield"`;

  const slots = [
    ['head',   'Head'],
    ['weapon', 'Weapon'],
    ['shield', 'Shield'],
  ];

  const equipEls = {};
  for (const [key, label] of slots) {
    const slot = el('div', { className: 'equip-slot', 'data-slot': key });
    slot.style.gridArea = key;
    const ico  = el('div', { className: 'equip-ico', 'aria-hidden':'true' }, '—');
    const meta = el('div', { className: 'equip-meta' });
    const name = el('div', { className: 'equip-name' }, `Empty ${label}`);
    const type = el('div', { className: 'equip-type' }, label);
    meta.append(name, type);
    slot.append(ico, meta);
    equipGrid.appendChild(slot);
    equipEls[key] = { slot, ico, name, type };
  }
  colLeft.appendChild(equipGrid);

  // ----- RIGHT: Inventory -----
  const colRight = el('section', { className: 'inv-col' });

  // header destro CON unico pulsante close
  const headRight = headerRow(title, { showClose: true });
  colRight.appendChild(headRight.row);

  const invGrid = el('div', { className: 'inv-grid' });
  invGrid.style.gridTemplateColumns = `repeat(${gridCols}, minmax(56px,1fr))`;

  for (let i = 0; i < gridCols * gridRows; i++) {
    const slot = el('div', { className: 'inv-slot', 'data-idx': String(i), tabindex: '0' });
    invGrid.appendChild(slot);
  }
  colRight.appendChild(invGrid);

  // ----- Hints -----
  const hints = el('div', { className: 'inv-hints' });
  hints.append(
    spanHint('Toggle', 'G'),
    spanHint('Equip/Use', 'Enter'),
    spanHint('Close', 'Esc'),
  );
  colRight.appendChild(hints);

  // Compose
  panel.append(colLeft, colRight);
  wrap.appendChild(panel);
  parent.append(overlay, wrap);

  // Close solo a destra
  headRight.closeBtn.addEventListener('click', () => closeInventory());

  // ESC chiude
  const onKey = (e) => { if (e.key === 'Escape') closeInventory(); };
  window.addEventListener('keydown', onKey);

  // State
  _state.inited = true;
  _state.root = wrap;
  _state.els = {
    overlay,
    wrap,
    panel,
    invGrid,
    equipEls,
    closeBtns: [headRight.closeBtn],
  };

  return _state.els;
}

// ---------- Helpers ----------
function el(tag, attrs = {}, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k in n) n[k] = v; else n.setAttribute(k, v);
  }
  if (text !== undefined) n.textContent = text;
  return n;
}

function headerRow(title, { showClose = true } = {}) {
  const row = el('div', { className: 'inv-header' });
  const h   = el('div', { className: 'inv-title' }, title);

  const right = el('div', { className: 'inv-header-right' });

  let closeBtn = null;
  if (showClose) {
    closeBtn = el('button', { className: 'inv-close', type: 'button', title: 'Close (Esc)' }, 'Close');
    right.appendChild(closeBtn);
  }

  row.append(h, right);
  return { row, closeBtn };
}

function spanHint(label, key) {
  const wrap = document.createElement('span');
  wrap.className = 'inv-hint';
  wrap.innerHTML = `${label}: <span class="kbd">${key}</span>`;
  return wrap;
}

function ensureInit() {
  if (!_state.inited) initInventoryUI();
}

// ---------- API ----------
export function openInventory() {
  ensureInit();
  _wasPointerLocked = (document.pointerLockElement === _canvasEl());
  if (document.exitPointerLock) try { document.exitPointerLock(); } catch {}

  _state.els.overlay.classList.add('is-open');
  _state.root.classList.add('is-open');
  _state.root.style.display = 'grid';
  // Piccolo ritardo per trigger animazione CSS
  requestAnimationFrame(() => _state.els.panel?.classList.add('show'));
}

export function closeInventory() {
  ensureInit();
  _state.els.overlay.classList.remove('is-open');
  _state.root.classList.remove('is-open');
  _state.els.panel?.classList.remove('show');

  // aspetta la fine della transizione prima di nascondere
  setTimeout(() => {
    _state.root.style.display = 'none';
  }, 250);

  if (_wasPointerLocked) _canvasEl()?.requestPointerLock?.();
}

export function toggleInventory() {
  ensureInit();
  const isOpen = isInventoryOpen();
  if (isOpen) closeInventory(); else openInventory();
}

export function getInventoryEls() {
  ensureInit();
  return _state.els;
}

export function isInventoryOpen() {
  ensureInit();
  const showing   = _state.root.style.display !== 'none' && _state.root.style.display !== '';
  const overlayOn = _state.els.overlay.classList.contains('is-open');
  return showing && overlayOn;
}

// --- API usate dal bridge (ripristinate) ---

export function setInventorySlot(index, item) {
  ensureInit();
  const grid = _state.els.invGrid;
  if (!grid) return;

  const slot = grid.querySelector(`.inv-slot[data-idx="${index}"]`);
  if (!slot) return;

  slot.innerHTML = '';

  if (!item) {
    delete slot.dataset.itemId;
    slot.classList.remove('has-item');
    return;
  }

  slot.dataset.itemId = item.id ?? '';
  slot.classList.add('has-item');

  const box = el('div', { className: 'inv-item', title: item.name || '' }, item.iconText ?? '•');
  const qty = item.qty > 1 ? el('div', { className: 'inv-qty' }, String(item.qty)) : null;
  slot.append(box);
  if (qty) slot.append(qty);
}

export function setEquipment(slotKey, equip) {
  ensureInit();
  const s = _state.els.equipEls?.[slotKey];
  if (!s) return; // slot non presente (es. chest/boots/legs/accessory rimossi)

  if (!equip) {
    s.ico.textContent = '—';
    s.name.textContent = `Empty ${capitalize(slotKey)}`;
    s.type.textContent = capitalize(slotKey);
    s.slot.classList.remove('has-item');
    return;
  }
  s.ico.textContent  = equip.iconText ?? '●';
  s.name.textContent = equip.name ?? 'Unknown';
  s.type.textContent = equip.type ?? capitalize(slotKey);
  s.slot.classList.add('has-item');
}

function capitalize(x='') { return x.charAt(0).toUpperCase() + x.slice(1); }
