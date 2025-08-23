

let _state = { inited: false, root: null, els: {} };

export function initInventoryUI(options = {}) {
  if (_state.inited) return _state.els;
  const {
    parent = document.body,
    gridCols = 8,
    gridRows = 6,
    title = 'Inventory',
    equipmentTitle = 'Equipment',
  } = options;

  // ---------- CSS (iniettato una volta) ----------
  const css = `
  :root {
    --inv-bg: rgba(20,22,28,0.92);
    --inv-panel: rgba(28,30,38,0.96);
    --inv-accent: #7bdcf3;
    --inv-line: rgba(255,255,255,0.08);
    --inv-text: #e7eef5;
    --inv-muted: #9fb1c1;
    --inv-danger: #ff7676;
    --inv-shadow: 0 10px 30px rgba(0,0,0,0.5);
    --inv-radius: 14px;
  }
  /* overlay */
  .inv-overlay {
    position: fixed; inset: 0; z-index: 9998; display: none;
    background: radial-gradient(60% 60% at 50% 50%, rgba(0,0,0,0.35), rgba(0,0,0,0.75));
    backdrop-filter: blur(2px);
  }
  .inv-overlay.is-open { display: block; }

  /* container */
  .inv-wrap {
    position: fixed; inset: 0; z-index: 9999; pointer-events: none;
    display: grid; place-items: center;
  }
  .inv-panel {
    pointer-events: all;
    width: min(1100px, 92vw);
    max-height: min(86vh, 900px);
    display: grid; grid-template-columns: 360px 1fr; gap: 16px;
    background: var(--inv-panel);
    border: 1px solid var(--inv-line);
    border-radius: var(--inv-radius);
    box-shadow: var(--inv-shadow);
    padding: 14px;
  }
  .inv-col {
    background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0));
    border: 1px solid var(--inv-line);
    border-radius: 12px; padding: 12px;
  }
  .inv-header {
    display:flex; align-items:center; justify-content:space-between; gap:8px;
    margin-bottom: 10px;
  }
  .inv-title {
    color: var(--inv-text); font-weight: 700; letter-spacing: .4px;
    text-transform: uppercase; font-size: 14px;
  }
  .inv-gold {
    color: var(--inv-accent); font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .inv-close {
    margin-left:auto; border:1px solid var(--inv-line); background: transparent; color: var(--inv-muted);
    padding: 6px 10px; border-radius: 8px; cursor: pointer; transition: 120ms ease;
  }
  .inv-close:hover { color: var(--inv-text); border-color: rgba(255,255,255,0.18); }

  /* equipment */
  .equip-grid {
    display: grid;
    grid-template-areas:
      "head   head"
      "weapon shield"
      "chest  chest"
      "legs   boots"
      "acc    acc";
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .equip-slot {
    display:flex; align-items:center; gap:10px;
    background: rgba(255,255,255,0.02);
    border: 1px dashed rgba(255,255,255,0.18);
    border-radius: 10px; padding: 10px;
    min-height: 56px;
  }
  .equip-slot[data-slot="head"]   { grid-area: head;  }
  .equip-slot[data-slot="weapon"] { grid-area: weapon;}
  .equip-slot[data-slot="shield"] { grid-area: shield;}
  .equip-slot[data-slot="chest"]  { grid-area: chest; }
  .equip-slot[data-slot="legs"]   { grid-area: legs;  }
  .equip-slot[data-slot="boots"]  { grid-area: boots; }
  .equip-slot[data-slot="accessory"]{ grid-area: acc; }

  .equip-ico {
    width: 42px; height: 42px; border-radius: 8px;
    background: rgba(0,0,0,0.25); display:grid; place-items:center;
    border:1px solid var(--inv-line); flex: none;
    font-size: 18px; color: var(--inv-muted);
    user-select:none;
  }
  .equip-meta { display:flex; flex-direction:column; min-width:0; }
  .equip-name { color: var(--inv-text); font-weight:600; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .equip-type { color: var(--inv-muted); font-size:11px; }

  /* inventory grid */
  .inv-grid {
    display: grid;
    grid-template-columns: repeat(${/* safe */gridCols}, minmax(56px, 1fr));
    grid-auto-rows: 56px;
    gap: 8px;
    padding: 6px;
    background: rgba(255,255,255,0.02);
    border: 1px solid var(--inv-line);
    border-radius: 10px;
    overflow: auto;
    max-height: calc(76vh);
  }
  .inv-slot {
    position: relative;
    border-radius: 10px;
    background: rgba(0,0,0,0.25);
    border: 1px solid var(--inv-line);
    display:grid; place-items:center;
    user-select: none;
  }
  .inv-slot.is-hover { outline: 2px solid var(--inv-accent); outline-offset: -2px; }
  .inv-item {
    width: 42px; height: 42px; border-radius: 8px;
    display:grid; place-items:center; text-align:center;
    border:1px solid rgba(255,255,255,0.18);
    background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.2));
    color: var(--inv-text); font-size: 12px; padding: 4px;
  }
  .inv-qty {
    position: absolute; right: 6px; bottom: 4px; font-size: 11px; font-weight:700;
    color: var(--inv-accent); text-shadow: 0 1px 2px rgba(0,0,0,0.6);
  }

  /* hint bar */
  .inv-hints { margin-top: 10px; color: var(--inv-muted); font-size: 12px; display:flex; gap:14px; flex-wrap:wrap;}
  .kbd {
    display:inline-grid; place-items:center;
    min-width: 22px; height: 22px; padding: 0 6px; border-radius: 6px;
    border:1px solid var(--inv-line); background: rgba(255,255,255,0.03);
    font-size: 12px; color: var(--inv-text);
  }
  `;

  const style = document.createElement('style');
  style.id = 'inventory-ui-style';
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- Overlay + Panel ----------
  const overlay = el('div', { className: 'inv-overlay', 'data-role': 'overlay' });
  overlay.addEventListener('click', () => closeInventory());

  const wrap = el('div', { className: 'inv-wrap' });

  const panel = el('div', { className: 'inv-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Inventory' });

  // ----- LEFT: Equipment -----
  const colLeft = el('section', { className: 'inv-col' });

  const headLeft = headerRow(equipmentTitle);
  colLeft.appendChild(headLeft.row);

  const equipGrid = el('div', { className: 'equip-grid' });
  const slots = [
    ['head','Head'],
    ['weapon','Weapon'],
    ['shield','Shield'],
    ['chest','Chest'],
    ['legs','Legs'],
    ['boots','Boots'],
    ['accessory','Accessory'],
  ];
  const equipEls = {};
  for (const [key, label] of slots) {
    const slot = el('div', { className: 'equip-slot', 'data-slot': key });
    const ico = el('div', { className: 'equip-ico', 'aria-hidden':'true' }, '—');
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
  const headRight = headerRow(title, /*withGold*/ true);
  colRight.appendChild(headRight.row);

  const invGrid = el('div', { className: 'inv-grid' });
  // Pre-crea gli slot vuoti (gridRows*gridCols)
  for (let i = 0; i < gridCols * gridRows; i++) {
    const slot = el('div', { className: 'inv-slot', 'data-idx': String(i) });
    invGrid.appendChild(slot);
  }
  colRight.appendChild(invGrid);

  // ----- Hints -----
  const hints = el('div', { className: 'inv-hints' });
  hints.append(
    spanHint('Toggle', 'G'),
    spanHint('Equip/Use', 'Enter'),
    spanHint('Split stack', 'Shift'),
    spanHint('Drop', 'Del')
  );
  colRight.appendChild(hints);

  // ----- Compose -----
  panel.append(colLeft, colRight);
  wrap.appendChild(panel);
  parent.append(overlay, wrap);

  // Close button (in entrambi gli header, quello di destra comanda)
  headLeft.closeBtn.addEventListener('click', () => closeInventory());
  headRight.closeBtn.addEventListener('click', () => closeInventory());

  // ESC chiude
  const onKey = (e) => { if (e.key === 'Escape') closeInventory(); };
  window.addEventListener('keydown', onKey);

  // Salva riferimenti
  _state.inited = true;
  _state.root = wrap;
  _state.els = {
    overlay,
    wrap,
    panel,
    invGrid,
    equipEls,
    goldEl: headRight.goldEl,
    closeBtns: [headLeft.closeBtn, headRight.closeBtn],
  };
  return _state.els;
}

// Helpers DOM
function el(tag, attrs = {}, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k in n) n[k] = v; else n.setAttribute(k, v);
  }
  if (text !== undefined) n.textContent = text;
  return n;
}
function headerRow(title, withGold = false) {
  const row = el('div', { className: 'inv-header' });
  const h = el('div', { className: 'inv-title' }, title);
  const right = el('div', { style: 'display:flex; align-items:center; gap:8px; margin-left:auto;' });
  let goldEl = null;
  if (withGold) {
    goldEl = el('div', { className: 'inv-gold', title: 'Gold' }, 'Gold: 0');
    right.appendChild(goldEl);
  }
  const btn = el('button', { className: 'inv-close', type: 'button', title: 'Close (Esc)' }, 'Close');
  right.appendChild(btn);
  row.append(h, right);
  return { row, closeBtn: btn, goldEl };
}
function spanHint(label, key) {
  const wrap = document.createElement('span');
  wrap.innerHTML = `${label}: <span class="kbd">${key}</span>`;
  return wrap;
}

// ---------- API visibilità ----------
export function openInventory() {
  console.log('Opening inventory');
  ensureInit();
  _state.els.overlay.classList.add('is-open');
  _state.root.style.display = 'grid';
}
export function closeInventory() {
  ensureInit();
  _state.els.overlay.classList.remove('is-open');
  _state.root.style.display = 'none';
}
export function toggleInventory() {
  ensureInit();
  const isOpen = _state.root.style.display !== 'none' && _state.root.style.display !== '';
  if (isOpen) closeInventory(); else openInventory();
}
export function getInventoryEls() {
  ensureInit();
  return _state.els;
}
function ensureInit() {
  if (!_state.inited) initInventoryUI();
}

// ---------- API di comodo per aggiornare UI ----------
/** Aggiorna il contatore dell’oro (numero intero o stringa) */
export function setGold(value) {
  ensureInit();
  _state.els.goldEl.textContent = `Gold: ${value}`;
}

/** Inserisce/aggiorna item in uno slot della griglia inventario
 * item = { id, name, qty, iconText }
 */
export function setInventorySlot(index, item) {
  ensureInit();
  const slot = _state.els.invGrid.querySelector(`.inv-slot[data-idx="${index}"]`);
  if (!slot) return;
  slot.innerHTML = '';

  if (!item) {
    delete slot.dataset.itemId;
    return;
  }

  slot.dataset.itemId = item.id ?? '';
  const box = el('div', { className: 'inv-item', title: item.name || '' }, item.iconText ?? '•');
  const qty = item.qty > 1 ? el('div', { className: 'inv-qty' }, String(item.qty)) : null;
  slot.append(box);
  if (qty) slot.append(qty);
}

/** Aggiorna una slot di equipaggiamento
 * equip = { name, type, iconText }
 */
export function setEquipment(slotKey, equip) {
  ensureInit();
  const s = _state.els.equipEls[slotKey];
  if (!s) return;
  if (!equip) {
    s.ico.textContent = '—';
    s.name.textContent = `Empty ${capitalize(slotKey)}`;
    s.type.textContent = capitalize(slotKey);
    return;
  }
  s.ico.textContent = equip.iconText ?? '●';
  s.name.textContent = equip.name ?? 'Unknown';
  s.type.textContent = equip.type ?? capitalize(slotKey);
}

function capitalize(x='') { return x.charAt(0).toUpperCase() + x.slice(1); }
