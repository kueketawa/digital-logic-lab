/* =====================================================
   Digital Logic Lab — script.js
   Sections:
     1. DATA LAYER       — state, factories, mutation helpers
     2. EVALUATION LAYER — Kahn's topological sort, gate logic
     3. RENDER LAYER     — DOM + SVG drawing
     4. INTERACTION LAYER— events: drag, wiring, select, delete
   ===================================================== */

'use strict';

/* ==========================================================
   SECTION 1 — DATA LAYER
   All mutable state lives here. No DOM queries in this section.
   ========================================================== */

/** Unique ID counter */
let _nextId = 1;
function newId() { return _nextId++; }

/** Auto-label counters */
let switchCount = 0;   // A, B, C …
let ledCount    = 0;   // F1, F2 …

/**
 * components: Array of component objects.
 * Each component: { id, type, label, x, y, value, inputs:[], outputs:[] }
 *   type: 'switch' | 'led' | 'and' | 'or' | 'not'
 *   inputs / outputs: arrays of port objects { portId, compId, index }
 *   value: 0 | 1 (last evaluated)
 */
let components = [];

/**
 * wires: Array of wire objects.
 * Each wire: { id, fromCompId, fromPortId, toCompId, toPortId, value, selected }
 */
let wires = [];

/** Smallest unused switch letter among existing switches (A, B, C, ...) */
function nextSwitchLabel() {
  const used = new Set(components.filter(c => c.type === 'switch').map(c => c.label));
  let i = 0;
  while (used.has(String.fromCharCode(65 + i))) i++;
  return String.fromCharCode(65 + i);
}

/** Smallest unused LED label among existing LEDs (F1, F2, ...) */
function nextLedLabel() {
  const used = new Set(components.filter(c => c.type === 'led').map(c => c.label));
  let n = 1;
  while (used.has('F' + n)) n++;
  return 'F' + n;
}

/** Smallest unused number for a gate type (keeps tags stable and unique) */
function nextGateNumber(type) {
  const used = new Set(components.filter(c => c.type === type).map(c => c.number));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

/** Create a new component data object (no DOM yet) */
function createComponent(type, x, y) {
  const id = newId();
  let label = '';
  let inputCount = 0;
  let outputCount = 1;

  switch (type) {
    case 'switch': label = nextSwitchLabel(); inputCount = 0; break;
    case 'led':    label = nextLedLabel();    inputCount = 1; outputCount = 0; break;                  inputCount = 1; outputCount = 0; break;
    case 'and':    label = 'AND';  inputCount = 2; break;
    case 'or':     label = 'OR';   inputCount = 2; break;
    case 'not':    label = 'NOT';  inputCount = 1; break;
    case 'nand':   label = 'NAND'; inputCount = 2; break;
    case 'nor':    label = 'NOR';  inputCount = 2; break;
    case 'xor':    label = 'XOR';  inputCount = 2; break;
    case 'xnor':   label = 'XNOR'; inputCount = 2; break;
  }

  // Build port descriptor arrays (portId is unique globally)
  const inputs  = Array.from({ length: inputCount  }, (_, i) => ({ portId: newId(), compId: id, index: i }));
  const outputs = Array.from({ length: outputCount }, (_, i) => ({ portId: newId(), compId: id, index: i }));

    const number = (type === 'switch' || type === 'led') ? null : nextGateNumber(type);
  return { id, type, label, number, x, y, value: 0, inputs, outputs };
}

/** Add a component to state */
function addComponent(type, x, y) {
  const comp = createComponent(type, x, y);
  components.push(comp);
  return comp;
}

/** Remove a component and all wires connected to it */
function removeComponent(compId) {
  wires = wires.filter(w => w.fromCompId !== compId && w.toCompId !== compId);
  components = components.filter(c => c.id !== compId);
}

/** Add a wire tentatively; returns the wire object */
function addWire(fromCompId, fromPortId, toCompId, toPortId) {
  const wire = { id: newId(), fromCompId, fromPortId, toCompId, toPortId, value: 0, selected: false };
  wires.push(wire);
  return wire;
}

/** Remove a specific wire by id */
function removeWire(wireId) {
  wires = wires.filter(w => w.id !== wireId);
}

/** Find component by id */
function findComp(id) { return components.find(c => c.id === id); }

/** Find port (input or output) across all components */
function findPort(portId) {
  for (const c of components) {
    for (const p of c.inputs)  if (p.portId === portId) return { comp: c, port: p, kind: 'input' };
    for (const p of c.outputs) if (p.portId === portId) return { comp: c, port: p, kind: 'output' };
  }
  return null;
}

/* ==========================================================
   SECTION 1b — HISTORY (UNDO / REDO)
   Deep-copy snapshots of {components, wires}. Max 50 undo steps.
   Switch values are NOT stored — they are preserved from live state on restore.
   ========================================================== */

const HISTORY_LIMIT = 50;

/** Undo stack: array of snapshots (oldest first, most-recent last) */
let undoStack = [];
/** Redo stack: array of snapshots (most-recently undone last) */
let redoStack = [];

/**
 * Deep-clone the current circuit state into a plain-object snapshot.
 * We clone every component and every port array so mutations don't alias.
 * We deliberately omit comp.value (switch state) — rule 3.
 */
function cloneState() {
  return {
    components: components.map(c => ({
      id:      c.id,
      type:    c.type,
      label:   c.label,
      number:  c.number,
      x:       c.x,
      y:       c.y,
      value:   c.value,   // kept so non-switch values survive round-trip
      inputs:  c.inputs.map(p  => ({ portId: p.portId,  compId: p.compId,  index: p.index  })),
      outputs: c.outputs.map(p => ({ portId: p.portId,  compId: p.compId,  index: p.index  })),
    })),
    wires: wires.map(w => ({
      id:          w.id,
      fromCompId:  w.fromCompId,
      fromPortId:  w.fromPortId,
      toCompId:    w.toCompId,
      toPortId:    w.toPortId,
      value:       w.value,
      selected:    false,   // never restore a selection
    })),
  };
}

/**
 * Push the CURRENT state onto the undo stack before a mutation.
 * Call this immediately before any edit action.
 * Clears the redo stack (new action invalidates forward history).
 */
function pushHistory() {
  undoStack.push(cloneState());
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack = [];
  updateHistoryButtons();
}

/** Update enabled/disabled state of Undo and Redo buttons */
function updateHistoryButtons() {
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  if (btnUndo) btnUndo.disabled = undoStack.length === 0;
  if (btnRedo) btnRedo.disabled = redoStack.length === 0;
}

/**
 * Restore a snapshot as the current circuit state.
 * Switch values are preserved from the live components that still exist
 * in the snapshot (matching by id), per rule 3.
 *
 * After restore: cancels any half-made connection, clears wire selection,
 * evaluates the circuit, and re-renders everything.
 */
function restoreSnapshot(snap) {
  // Build a map of current live switch values before we replace components
  const liveSwitchValues = new Map();
  for (const c of components) {
    if (c.type === 'switch') liveSwitchValues.set(c.id, c.value);
  }

  // --- Tear down all existing DOM / SVG nodes ---
  cancelWiring();
  deselectWire();
  for (const [id] of compNodes) removeComponentNode(id);
  for (const [id] of wireElems) removeWireElem(id);

  // --- Replace live state arrays with deep copies of the snapshot ---
  components = snap.components.map(c => {
    const live = { ...c,
      inputs:  c.inputs.map(p  => ({ ...p  })),
      outputs: c.outputs.map(p => ({ ...p  })),
    };
    // Preserve switch value from live state (rule 3)
    if (live.type === 'switch' && liveSwitchValues.has(live.id)) {
      live.value = liveSwitchValues.get(live.id);
    }
    return live;
  });

  wires = snap.wires.map(w => ({ ...w, selected: false }));

  // --- Re-evaluate and re-render ---
  evaluateCircuit();
  renderAll();
}

/* ==========================================================
   SECTION 2 — EVALUATION LAYER
   Kahn's algorithm (topological BFS) for circuit simulation.
   Gate outputs are strictly 0 or 1.
   ========================================================== */

/**
 * Check whether adding a wire from fromCompId → toCompId would create a cycle.
 * We do this by tentatively including the wire (caller adds it first),
 * then running Kahn's algorithm. If any nodes remain unprocessed, there is a cycle.
 * Returns true if a cycle exists among current wires.
 */
function hasCycle() {
  // Build adjacency: fromCompId → Set of toCompId
  const adj = new Map();  // compId → Set<compId> (who I feed into)
  const inDeg = new Map(); // compId → number of unique predecessor components

  for (const c of components) {
    if (!adj.has(c.id))   adj.set(c.id, new Set());
    if (!inDeg.has(c.id)) inDeg.set(c.id, 0);
  }

  for (const w of wires) {
    const from = w.fromCompId;
    const to   = w.toCompId;
    if (!adj.get(from).has(to)) {
      adj.get(from).add(to);
      inDeg.set(to, (inDeg.get(to) || 0) + 1);
    }
  }

  // BFS starting from all nodes with inDeg == 0
  const queue = [];
  for (const [id, deg] of inDeg) {
    if (deg === 0) queue.push(id);
  }

  let processed = 0;
  while (queue.length > 0) {
    const cur = queue.shift();
    processed++;
    for (const neighbor of (adj.get(cur) || [])) {
      const newDeg = inDeg.get(neighbor) - 1;
      inDeg.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return processed < components.length;
}

/**
 * Evaluate the entire circuit using Kahn's topological sort.
 * Unconnected inputs are treated as 0.
 * Sets comp.value and wire.value for every element.
 */
function evaluateCircuit() {
  // Map portId → computed signal value
  const portValues = new Map();

  // Build per-component in-degree (by unique predecessor component edges)
  const adj   = new Map(); // compId → Set<compId> successors
  const inDeg = new Map(); // compId → int

  for (const c of components) {
    adj.set(c.id, new Set());
    inDeg.set(c.id, 0);
  }

  // Build adjacency from wires (deduplicated by component pair)
  const seen = new Set(); // "fromId-toId"
  for (const w of wires) {
    const key = w.fromCompId + '-' + w.toCompId;
    if (!seen.has(key)) {
      seen.add(key);
      adj.get(w.fromCompId).add(w.toCompId);
      inDeg.set(w.toCompId, inDeg.get(w.toCompId) + 1);
    }
  }

  // BFS queue seeded with all zero-in-degree nodes
  const queue = [];
  for (const [id, deg] of inDeg) {
    if (deg === 0) queue.push(id);
  }

  while (queue.length > 0) {
    const compId = queue.shift();
    const comp   = findComp(compId);
    if (!comp) continue;

    // Gather input values for this component
    const inputVals = comp.inputs.map(port => {
      // Find a wire feeding this port
      const wire = wires.find(w => w.toCompId === compId && w.toPortId === port.portId);
      return wire ? portValues.get(wire.fromPortId) ?? 0 : 0;
    });

    // Compute output value — strictly 0 or 1
    let outVal = 0;
    switch (comp.type) {
      case 'switch': outVal = comp.value; break;
      case 'led':    outVal = inputVals[0] ?? 0; break;
      case 'and':    outVal = (inputVals[0] === 1 && inputVals[1] === 1) ? 1 : 0; break;
      case 'or':     outVal = (inputVals[0] === 1 || inputVals[1] === 1) ? 1 : 0; break;
      case 'not':    outVal = inputVals[0] ? 0 : 1; break;
      case 'nand':   outVal = (inputVals[0] === 1 && inputVals[1] === 1) ? 0 : 1; break;
      case 'nor':    outVal = (inputVals[0] === 1 || inputVals[1] === 1) ? 0 : 1; break;
      case 'xor':    outVal = (inputVals[0] !== inputVals[1]) ? 1 : 0; break;
      case 'xnor':   outVal = (inputVals[0] === inputVals[1]) ? 1 : 0; break;
    }

    comp.value = outVal;

    // Publish output port values
    for (const outPort of comp.outputs) {
      portValues.set(outPort.portId, outVal);
    }

    // Reduce in-degree of successors
    for (const successorId of adj.get(compId)) {
      const newDeg = inDeg.get(successorId) - 1;
      inDeg.set(successorId, newDeg);
      if (newDeg === 0) queue.push(successorId);
    }
  }

  // Update wire values based on the source output port
  for (const w of wires) {
    w.value = portValues.get(w.fromPortId) ?? 0;
  }
}

/* ==========================================================
   SECTION 3 — RENDER LAYER
   Reads state; updates DOM and SVG. Pure side-effects on UI.
   ========================================================== */

const workspace  = document.getElementById('workspace');
const canvas     = document.getElementById('canvas');
const wireSvg    = document.getElementById('wire-svg');
const hintText   = document.getElementById('hint-text');
const statusMsg  = document.getElementById('status-msg');

/* ---- Pan state ----
 * panX/panY: current translation of #canvas in pixels.
 * All SVG coordinates (wire paths) are in canvas space.
 * getPortAbsPos() converts viewport coords → canvas coords by subtracting pan.
 */
let panX = 0;
let panY = 0;

/** Apply the current pan offset to the canvas element */
function applyPan() {
  canvas.style.transform = `translate(${panX}px, ${panY}px)`;
}

/** Map: compId → DOM node */
const compNodes = new Map();

/** Map: wireId → { g: SVGGElement, vis: SVGPathElement, hit: SVGPathElement } */
const wireElems = new Map();

/** Show a temporary status message */
let statusTimer = null;
function showStatus(msg, durationMs = 3000) {
  statusMsg.textContent = msg;
  statusMsg.classList.add('visible');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusMsg.classList.remove('visible'), durationMs);
}

/**
 * Return the canvas-space center coordinates of a connection point element.
 * We use getBoundingClientRect (viewport coords) and subtract both the
 * workspace viewport origin AND the pan offset to land in canvas space,
 * which is the coordinate system used by all SVG wire paths.
 */
function getPortAbsPos(portEl) {
  const wsRect   = workspace.getBoundingClientRect();
  const portRect = portEl.getBoundingClientRect();
  return {
    x: portRect.left + portRect.width  / 2 - wsRect.left - panX,
    y: portRect.top  + portRect.height / 2 - wsRect.top  - panY,
  };
}

/**
 * Build a cubic Bezier SVG path string from (x1,y1) to (x2,y2).
 * Control points offset horizontally for smooth S-curves.
 */
function makeBezierPath(x1, y1, x2, y2) {
  const dx = Math.max(Math.abs(x2 - x1) * 0.5, 60);
  return `M ${x1},${y1} C ${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

/** Get the DOM element for a port by its portId */
function getPortEl(portId) {
  return document.querySelector(`[data-port-id="${portId}"]`);
}

/** Create or update the DOM node for a component */
function renderComponent(comp) {
  let node = compNodes.get(comp.id);

  if (!node) {
    // --- Create DOM node ---
    node = document.createElement('div');
    node.className = 'component-node';
    node.dataset.compId = comp.id;

    // Label — shown for switch and LED only; gates use gate-body as their sole label
    if (comp.type === 'switch' || comp.type === 'led') {
      const label = document.createElement('div');
      label.className = 'node-label';
      label.textContent = comp.label;
      node.appendChild(label);
    }

    // Body (switch toggle, LED circle, or gate text)
    if (comp.type === 'switch') {
      const body = document.createElement('div');
      body.className = 'switch-body';
      body.dataset.switchFor = comp.id;
      const thumb = document.createElement('div');
      thumb.className = 'switch-thumb';
      body.appendChild(thumb);
      node.appendChild(body);
      const valLabel = document.createElement('div');
      valLabel.className = 'switch-value';
      valLabel.dataset.switchVal = comp.id;
      valLabel.textContent = '0';
      node.appendChild(valLabel);
    } else if (comp.type === 'led') {
      const body = document.createElement('div');
      body.className = 'led-body';
      body.dataset.ledFor = comp.id;
      node.appendChild(body);
    } else {
      const body = document.createElement('div');
      body.className = 'gate-body';
      body.textContent = comp.label;
      node.appendChild(body);

      // Small reference tag, e.g. "#2" (gates only)
      if (comp.number != null) {
        const tag = document.createElement('span');
        tag.className = 'gate-tag';
        tag.textContent = '#' + comp.number;
        node.appendChild(tag);
      }
    }

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.title = 'Hapus komponen';
    delBtn.textContent = '×';
    delBtn.dataset.deleteComp = comp.id;
    node.appendChild(delBtn);

    // Input connection points
    comp.inputs.forEach((port, i) => {
      const pt = document.createElement('div');
      pt.className = 'conn-point input';
      pt.dataset.portId   = port.portId;
      pt.dataset.compId   = comp.id;
      pt.dataset.portKind = 'input';
      pt.dataset.portIdx  = i;
      // Vertically distribute inputs on the left edge
      const totalInputs = comp.inputs.length;
      const yPct = totalInputs === 1 ? 50 : 25 + (i / (totalInputs - 1)) * 50;
      pt.style.left = '0%';
      pt.style.top  = yPct + '%';
      node.appendChild(pt);
    });

    // Output connection points
    comp.outputs.forEach((port, i) => {
      const pt = document.createElement('div');
      pt.className = 'conn-point output';
      pt.dataset.portId   = port.portId;
      pt.dataset.compId   = comp.id;
      pt.dataset.portKind = 'output';
      pt.dataset.portIdx  = i;
      pt.style.left = '100%';
      pt.style.top  = '50%';
      node.appendChild(pt);
    });

    canvas.appendChild(node);
    compNodes.set(comp.id, node);
    attachDragListeners(node, comp.id);
  }

  // --- Update position ---
  node.style.left = comp.x + 'px';
  node.style.top  = comp.y + 'px';

  // --- Update switch visual ---
  if (comp.type === 'switch') {
    const body = node.querySelector(`[data-switch-for="${comp.id}"]`);
    const val  = node.querySelector(`[data-switch-val="${comp.id}"]`);
    body.classList.toggle('on', comp.value === 1);
    val.textContent = comp.value;
  }

  // --- Update LED visual ---
  if (comp.type === 'led') {
    const body = node.querySelector(`[data-led-for="${comp.id}"]`);
    body.classList.toggle('on', comp.value === 1);
  }
}

/** Remove the DOM node for a component */
function removeComponentNode(compId) {
  const node = compNodes.get(compId);
  if (node) { node.remove(); compNodes.delete(compId); }
}

/** Create or update SVG elements for a wire */
function renderWire(wire) {
  const fromPortEl = getPortEl(wire.fromPortId);
  const toPortEl   = getPortEl(wire.toPortId);
  if (!fromPortEl || !toPortEl) return;

  const p1 = getPortAbsPos(fromPortEl);
  const p2 = getPortAbsPos(toPortEl);
  const d  = makeBezierPath(p1.x, p1.y, p2.x, p2.y);

  let elems = wireElems.get(wire.id);

  if (!elems) {
    // Create SVG group with hit area + visible path
    const g   = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const vis = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    hit.setAttribute('class', 'wire-path-hit');
    vis.setAttribute('class', 'wire-path-vis');
    hit.dataset.wireId = wire.id;

    g.appendChild(hit);
    g.appendChild(vis);
    wireSvg.appendChild(g);
    elems = { g, hit, vis };
    wireElems.set(wire.id, elems);
  }

  elems.hit.setAttribute('d', d);
  elems.vis.setAttribute('d', d);

  // Color by signal value and selection state
  elems.vis.classList.toggle('on',       wire.value === 1);
  elems.vis.classList.toggle('selected', wire.selected === true);
}

/** Remove SVG elements for a wire */
function removeWireElem(wireId) {
  const elems = wireElems.get(wireId);
  if (elems) { elems.g.remove(); wireElems.delete(wireId); }
}

/** Full render pass: sync DOM with state */
function renderAll() {
  hintText.style.opacity = components.length === 0 ? '1' : '0';

  // Remove nodes for deleted components
  for (const [id] of compNodes) {
    if (!findComp(id)) removeComponentNode(id);
  }

  // Render all components
  for (const comp of components) {
    renderComponent(comp);
  }

  // Remove SVG for deleted wires
  for (const [id] of wireElems) {
    if (!wires.find(w => w.id === id)) removeWireElem(id);
  }

  // Render all wires
  for (const wire of wires) {
    renderWire(wire);
  }

  // Rebuild truth table (circuit structure may have changed)
  buildTruthTable();
  // Update scrollbar thumbs to reflect current pan
  updateScrollbars();
}

/* ==========================================================
   SECTION 4 — INTERACTION LAYER
   Pointer Events drag, wiring, select, delete.
   ========================================================== */

// ---- Wiring state ----
let wiringFrom = null; // { portId, compId, portKind, el } or null

// ---- Dragging state ----
let dragState = null; // { compId, startX, startY, origX, origY, moved }

// ---- Selected wire ----
let selectedWireId = null;

/** Place a new component at a smart free position in the workspace */
function getNextPosition() {
  const cols  = 4;
  const count = components.length;
  const col   = count % cols;
  const row   = Math.floor(count / cols);
  return { x: 60 + col * 180, y: 60 + row * 140 };
}

/**
 * Core: add a component to the circuit (used by both the panel buttons
 * and the mobile-aware wrapper in Section 5).
 */
function addComponentToBoard(type) {
  pushHistory();
  const { x, y } = getNextPosition();
  addComponent(type, x, y);
  evaluateCircuit();
  renderAll();
}

// ---- Panel buttons (initial binding — re-bound in Section 5 for mobile close) ----
document.querySelectorAll('.comp-btn').forEach(btn => {
  btn.addEventListener('click', () => addComponentToBoard(btn.dataset.type));
});

// ---- Clear board ----
document.getElementById('btn-clear').addEventListener('click', () => {
  if (components.length === 0 && wires.length === 0) return; // nothing to clear
  pushHistory();
  components = [];
  wires      = [];
  switchCount = 0;
  ledCount    = 0;
  // Remove all DOM nodes
  for (const [id] of compNodes) removeComponentNode(id);
  for (const [id] of wireElems) removeWireElem(id);
  cancelWiring();
  renderAll();
});

/* ---- Drag with Pointer Events ----
   We attach pointerdown on the component node.
   On pointermove we move the component; on pointerup we finish.
   A switch is toggled only if the pointer didn't move (click). */

// wireId of the wire currently highlighted as an insert target, or null
let insertTargetWireId = null;

// compId of the gate currently highlighted as a replace target, or null
let replaceTargetCompId = null;

/** Apply/remove the replace-target highlight on a component node and show hint */
function setReplaceHighlight(compId, on) {
  const node = compNodes.get(compId);
  if (node) node.classList.toggle('replace-target', on);
  if (on) showStatus('Lepas untuk mengganti gerbang.', 60000); // keep until drop
  else    statusMsg.classList.remove('visible');               // clear on leave
}

/**
 * Find a gate under the dragged gate that qualifies as a replace target.
 * Criteria: their bounding boxes overlap by more than 50% of the dragged gate's area,
 * the target must be a gate (and/or/not), and must not be the dragged gate itself.
 * Returns the target component or null.
 */
function findReplaceTargetUnderGate(dragged) {
  const GATE_TYPES = ['and', 'or', 'not', 'nand', 'nor', 'xor', 'xnor'];
  const dr = getNodeRect(dragged);
  const dragArea = dr.w * dr.h;
  if (dragArea === 0) return null;

  let bestComp  = null;
  let bestOverlap = 0;

  for (const comp of components) {
    if (comp.id === dragged.id) continue;
    if (!GATE_TYPES.includes(comp.type)) continue;

    const cr = getNodeRect(comp);

    // Intersection rectangle
    const ix = Math.max(dr.x, cr.x);
    const iy = Math.max(dr.y, cr.y);
    const iw = Math.min(dr.x + dr.w, cr.x + cr.w) - ix;
    const ih = Math.min(dr.y + dr.h, cr.y + cr.h) - iy;
    if (iw <= 0 || ih <= 0) continue;

    const overlapFraction = (iw * ih) / dragArea;
    if (overlapFraction > 0.5 && overlapFraction > bestOverlap) {
      bestOverlap = overlapFraction;
      bestComp    = comp;
    }
  }

  return bestComp;
}

/**
 * Return the canvas-space bounding box {x, y, w, h} for a component node.
 * Subtracts pan so the result matches the coordinate space of SVG wire paths.
 */
function getNodeRect(comp) {
  const node   = compNodes.get(comp.id);
  const wsRect = workspace.getBoundingClientRect();
  const nr     = node.getBoundingClientRect();
  return {
    x: nr.left - wsRect.left - panX,
    y: nr.top  - wsRect.top  - panY,
    w: nr.width,
    h: nr.height,
  };
}

/**
 * Sample a cubic Bezier at parameter t ∈ [0,1].
 * Points: P0=(x1,y1), P1=(cx1,cy1), P2=(cx2,cy2), P3=(x2,y2)
 * Using the standard formula matching makeBezierPath's control points.
 */
function sampleBezier(x1, y1, x2, y2, t) {
  const dx  = Math.max(Math.abs(x2 - x1) * 0.5, 60);
  const cx1 = x1 + dx, cy1 = y1;
  const cx2 = x2 - dx, cy2 = y2;
  const mt  = 1 - t;
  const x   = mt*mt*mt*x1 + 3*mt*mt*t*cx1 + 3*mt*t*t*cx2 + t*t*t*x2;
  const y   = mt*mt*mt*y1 + 3*mt*mt*t*cy1 + 3*mt*t*t*cy2 + t*t*t*y2;
  return { x, y };
}

/**
 * Find the wire whose Bezier path passes closest to the gate's bounding box centre,
 * considering only wires that actually intersect the box.
 * Returns the wire object or null.
 */
function findWireUnderGate(comp) {
  const rect = getNodeRect(comp);
  const cx   = rect.x + rect.w / 2;
  const cy   = rect.y + rect.h / 2;
  const SAMPLES = 30;

  let bestWire = null;
  let bestDist = Infinity;

  for (const wire of wires) {
    // Skip wires already connected to this gate (should never happen here, but be safe)
    if (wire.fromCompId === comp.id || wire.toCompId === comp.id) continue;

    const fromEl = getPortEl(wire.fromPortId);
    const toEl   = getPortEl(wire.toPortId);
    if (!fromEl || !toEl) continue;

    const p1 = getPortAbsPos(fromEl);
    const p2 = getPortAbsPos(toEl);

    // Check whether any sampled point falls inside the gate bounding box
    let minDist = Infinity;
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const pt = sampleBezier(p1.x, p1.y, p2.x, p2.y, t);
      if (pt.x >= rect.x && pt.x <= rect.x + rect.w &&
          pt.y >= rect.y && pt.y <= rect.y + rect.h) {
        // Distance of this sample point from the box centre
        const d = Math.hypot(pt.x - cx, pt.y - cy);
        if (d < minDist) minDist = d;
      }
    }

    if (minDist < Infinity && minDist < bestDist) {
      bestDist = minDist;
      bestWire = wire;
    }
  }

  return bestWire;
}

/** Apply/remove the insert-target highlight on a wire's visual SVG path */
function setInsertHighlight(wireId, on) {
  const elems = wireElems.get(wireId);
  if (elems) elems.vis.classList.toggle('insert-target', on);
}

function attachDragListeners(node, compId) {
  node.addEventListener('pointerdown', onCompPointerDown);
}

function onCompPointerDown(e) {
  // Ignore right-click, or clicks on delete button, switch area, or connection points
  if (e.button !== 0) return;
  if (e.target.classList.contains('delete-btn'))    return;
  if (e.target.closest('[data-switch-for]'))        return; // switch body + thumb
  if (e.target.classList.contains('switch-value'))  return;
  if (e.target.classList.contains('conn-point'))    return;

  const node   = e.currentTarget;
  const compId = parseInt(node.dataset.compId, 10);
  const comp   = findComp(compId);
  if (!comp) return;

  e.preventDefault();
  node.setPointerCapture(e.pointerId);

  dragState = {
    compId,
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    origX:  comp.x,
    origY:  comp.y,
    moved:   false,
    preSnap: cloneState(), // snapshot taken before any movement, for undo
  };

  node.addEventListener('pointermove', onCompPointerMove);
  node.addEventListener('pointerup',   onCompPointerUp);
}

function onCompPointerMove(e) {
  if (!dragState || dragState.pointerId !== e.pointerId) return;
  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;

  // Mark as moved only after a minimum threshold to avoid accidental drags
  if (!dragState.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
    dragState.moved = true;
  }

  if (dragState.moved) {
    const comp = findComp(dragState.compId);
    if (!comp) return;
    comp.x = Math.max(0, dragState.origX + dx);
    comp.y = Math.max(0, dragState.origY + dy);
    // Re-render only position + wires for performance
    const node = compNodes.get(comp.id);
    if (node) {
      node.style.left = comp.x + 'px';
      node.style.top  = comp.y + 'px';
    }
    // Redraw all wires connected to this component
    for (const wire of wires) {
      if (wire.fromCompId === comp.id || wire.toCompId === comp.id) {
        renderWire(wire);
      }
    }

    // --- Replace-gate and Insert-into-wire highlights ---
    // Only for gates (and, or, not) with no wires connected yet
    const GATE_TYPES = ['and', 'or', 'not', 'nand', 'nor', 'xor', 'xnor'];
    const isEligible = GATE_TYPES.includes(comp.type) &&
      !wires.some(w => w.fromCompId === comp.id || w.toCompId === comp.id);

    if (isEligible) {
      // ---- Replace check has priority over wire-insert ----
      const replaceCandidate   = findReplaceTargetUnderGate(comp);
      const replaceCandidateId = replaceCandidate ? replaceCandidate.id : null;

      if (replaceCandidateId !== replaceTargetCompId) {
        if (replaceTargetCompId !== null) setReplaceHighlight(replaceTargetCompId, false);
        replaceTargetCompId = replaceCandidateId;
        if (replaceTargetCompId !== null) setReplaceHighlight(replaceTargetCompId, true);
      }

      // While in replace mode, suppress wire-insert highlight
      if (replaceTargetCompId !== null) {
        if (insertTargetWireId !== null) {
          setInsertHighlight(insertTargetWireId, false);
          insertTargetWireId = null;
        }
      } else {
        // No replace target — check for wire insert
        const candidate   = findWireUnderGate(comp);
        const candidateId = candidate ? candidate.id : null;
        if (insertTargetWireId !== candidateId) {
          if (insertTargetWireId !== null) setInsertHighlight(insertTargetWireId, false);
          insertTargetWireId = candidateId;
          if (insertTargetWireId !== null) setInsertHighlight(insertTargetWireId, true);
        }
      }
    } else {
      // Not eligible — clear all stale highlights
      if (replaceTargetCompId !== null) {
        setReplaceHighlight(replaceTargetCompId, false);
        replaceTargetCompId = null;
      }
      if (insertTargetWireId !== null) {
        setInsertHighlight(insertTargetWireId, false);
        insertTargetWireId = null;
      }
    }
  }
}

function onCompPointerUp(e) {
  if (!dragState || dragState.pointerId !== e.pointerId) return;
  const node = e.currentTarget;
  node.removeEventListener('pointermove', onCompPointerMove);
  node.removeEventListener('pointerup',   onCompPointerUp);
  node.releasePointerCapture(e.pointerId);

  // --- Attempt gate replacement on drop (higher priority than wire insert) ---
  if (replaceTargetCompId !== null) {
    setReplaceHighlight(replaceTargetCompId, false);
    const targetCompId = replaceTargetCompId;
    replaceTargetCompId = null;

    const dragged = findComp(dragState.compId);
    dragState = null;

    if (dragged) tryReplaceGate(dragged, targetCompId);
    return;
  }

  // --- Attempt wire insertion on drop ---
  if (insertTargetWireId !== null) {
    setInsertHighlight(insertTargetWireId, false);
    const targetWireId = insertTargetWireId;
    insertTargetWireId = null;

    const comp = findComp(dragState.compId);
    dragState = null;

    if (comp) tryInsertGateIntoWire(comp, targetWireId);
    return;
  }

  // Plain move: commit the pre-move snapshot taken at pointerdown
  if (dragState.moved && dragState.preSnap) {
    undoStack.push(dragState.preSnap);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack = [];
    updateHistoryButtons();
  }

  dragState = null;
}

/**
 * Replace the target gate's type with the dragged gate's type.
 * The target keeps its position and all connected wires.
 * The dragged gate is removed from the workspace.
 * Only allowed when input counts match.
 */
function tryReplaceGate(dragged, targetCompId) {
  // Guard: dragged gate must still be wire-free
  if (wires.some(w => w.fromCompId === dragged.id || w.toCompId === dragged.id)) return;

  const target = findComp(targetCompId);
  if (!target) return;

  // Same type — nothing to do (silently leave dragged where it was)
  if (dragged.type === target.type) return;

  // Input counts must match
  if (dragged.inputs.length !== target.inputs.length) {
    showStatus(
      `Tidak dapat mengganti: jumlah input berbeda ` +
      `(${dragged.label} punya ${dragged.inputs.length}, ` +
      `${target.label} punya ${target.inputs.length}).`
    );
    return;
  }

  // Record history before mutating
  pushHistory();

  // Perform the replacement: update type and label on the target, remove the dragged gate
  target.type  = dragged.type;
  target.label = dragged.type.toUpperCase(); // AND, OR, NOT

  // Update the gate-body text in the DOM node (gates have no separate .node-label)
  const targetNode = compNodes.get(target.id);
  if (targetNode) {
    const gateBodyEl = targetNode.querySelector('.gate-body');
    if (gateBodyEl) gateBodyEl.textContent = target.label;
  }

  // Remove the dragged gate (it has no wires, so removeComponent just removes it)
  removeComponent(dragged.id);

  evaluateCircuit();
  renderAll();
}

/**
 * Try to insert a gate into a wire.
 * Splits wire (src→dst) into (src→gate.input[0]) and (gate.output→dst).
 * Rolls back completely on cycle or if the gate has acquired wires since drag started.
 */
function tryInsertGateIntoWire(comp, wireId) {
  // Guard: gate must still be wire-free
  if (wires.some(w => w.fromCompId === comp.id || w.toCompId === comp.id)) return;

  const origWire = wires.find(w => w.id === wireId);
  if (!origWire) return;

  // Gate must have at least one input and one output
  if (comp.inputs.length === 0 || comp.outputs.length === 0) return;

  const gateInputPortId  = comp.inputs[0].portId;
  const gateOutputPortId = comp.outputs[0].portId;

  // Record history before mutating
  pushHistory();

  // Remove original wire tentatively
  removeWire(origWire.id);

  // Add two replacement wires
  const w1 = addWire(origWire.fromCompId, origWire.fromPortId, comp.id,            gateInputPortId);
  const w2 = addWire(comp.id,             gateOutputPortId,    origWire.toCompId,   origWire.toPortId);

  // Cycle check — roll back everything if loop detected
  if (hasCycle()) {
    removeWire(w1.id);
    removeWire(w2.id);
    wires.push(origWire); // restore original wire
    // Also roll back the history entry we pushed speculatively
    undoStack.pop();
    updateHistoryButtons();
    return;
  }

  // Accepted — remove the original wire's SVG element and re-render
  removeWireElem(origWire.id);
  evaluateCircuit();
  renderAll();
}

/* ---- Switch toggle ----
   Triggered only on a real click (no drag) on the switch body. */
workspace.addEventListener('click', e => {
  const switchBody = e.target.closest('[data-switch-for]');
  if (switchBody) {
    const compId = parseInt(switchBody.dataset.switchFor, 10);
    const comp   = findComp(compId);
    if (comp && comp.type === 'switch') {
      comp.value = comp.value === 1 ? 0 : 1;
      evaluateCircuit();
      renderAll();
      // Highlight the row that matches current switch values (no rebuild)
      highlightTruthRow();
    }
    return;
  }
});

/* ---- Delete button ---- */
workspace.addEventListener('click', e => {
  const btn = e.target.closest('[data-delete-comp]');
  if (btn) {
    pushHistory();
    const compId = parseInt(btn.dataset.deleteComp, 10);
    removeComponent(compId);
    evaluateCircuit();
    renderAll();
  }
});

/* ---- Wiring: click on output → click on input ---- */

/** Cancel an in-progress wiring operation */
function cancelWiring() {
  if (!wiringFrom) return;
  wiringFrom = null;
  removeTempWire();
  clearWiringHighlights();
}

/** Highlight all valid input ports while wiring (occupied ports are now replaceable) */
function setWiringHighlights(sourceCompId) {
  document.querySelectorAll('.conn-point.input').forEach(el => {
    const targetCompId = parseInt(el.dataset.compId, 10);
    // Cannot connect to self
    if (targetCompId === sourceCompId) return;
    // All input ports on other components are valid targets (occupied ones get replaced)
    el.classList.add('highlight-target');
  });
}

function clearWiringHighlights() {
  document.querySelectorAll('.conn-point.input.highlight-target')
    .forEach(el => el.classList.remove('highlight-target'));
}

/** Temporary SVG path that follows the pointer while wiring */
let tempWireEl = null;
function showTempWire(x1, y1, x2, y2) {
  if (!tempWireEl) {
    tempWireEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tempWireEl.id = 'temp-wire';
    wireSvg.appendChild(tempWireEl);
  }
  tempWireEl.setAttribute('d', makeBezierPath(x1, y1, x2, y2));
}

function removeTempWire() {
  if (tempWireEl) { tempWireEl.remove(); tempWireEl = null; }
}

// Track pointer position for temp wire
workspace.addEventListener('pointermove', e => {
  if (!wiringFrom) return;
  const fromEl = getPortEl(wiringFrom.portId);
  if (!fromEl) return;
  const wsRect = workspace.getBoundingClientRect();
  const p1     = getPortAbsPos(fromEl);
  // Convert viewport pointer position to canvas space (subtract pan)
  const x2 = e.clientX - wsRect.left - panX;
  const y2 = e.clientY - wsRect.top  - panY;
  showTempWire(p1.x, p1.y, x2, y2);
});

// Click on a connection point — start or finish wiring
workspace.addEventListener('click', e => {
  const portEl = e.target.closest('.conn-point');
  if (!portEl) return;

  const portId   = parseInt(portEl.dataset.portId, 10);
  const compId   = parseInt(portEl.dataset.compId, 10);
  const portKind = portEl.dataset.portKind; // 'input' or 'output'

  // --- Starting a new wire from an OUTPUT point ---
  if (!wiringFrom) {
    if (portKind !== 'output') {
      showStatus('Mulai kabel dari titik output (kanan) sebuah komponen.');
      return;
    }
    wiringFrom = { portId, compId };
    setWiringHighlights(compId);
    return;
  }

  // --- Already wiring: complete the wire to an INPUT point ---

  // Must land on an input
  if (portKind !== 'input') {
    showStatus('Kabel harus terhubung ke titik input (kiri). Tekan Escape untuk membatalkan.');
    return;
  }

  // Cannot connect to self
  if (compId === wiringFrom.compId) {
    showStatus('Tidak dapat menghubungkan komponen ke dirinya sendiri.');
    cancelWiring();
    return;
  }

  // Record history before any mutation so undo can restore the pre-wire state
  const preWireSnap = cloneState();

  // If this input port already has a wire, snapshot it so we can restore on cycle
  const existingWire = wires.find(w => w.toPortId === portId) || null;
  if (existingWire) removeWire(existingWire.id);

  // Tentatively add the new wire
  const newWire = addWire(wiringFrom.compId, wiringFrom.portId, compId, portId);

  // Check for cycle — if detected, roll back and restore the old wire
  if (hasCycle()) {
    removeWire(newWire.id);
    if (existingWire) wires.push(existingWire); // restore snapshot
    showStatus('Koneksi ditolak: akan membentuk loop (siklus) pada sirkuit.');
    cancelWiring();
    return;
  }

  // Accepted — commit history, remove old SVG element, evaluate and render
  undoStack.push(preWireSnap);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack = [];
  updateHistoryButtons();
  if (existingWire) removeWireElem(existingWire.id);
  cancelWiring();
  evaluateCircuit();
  renderAll();
});

// Cancel wiring on Escape or click on empty workspace area
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') cancelWiring();
});

workspace.addEventListener('click', e => {
  // Cancel wiring / deselect wire when clicking the empty workspace or canvas background
  if (e.target === workspace || e.target === canvas || e.target === hintText) {
    cancelWiring();
    deselectWire();
  }
});

/* ---- Wire selection and deletion ---- */

function deselectWire() {
  if (selectedWireId !== null) {
    const w = wires.find(w => w.id === selectedWireId);
    if (w) { w.selected = false; renderWire(w); }
    selectedWireId = null;
  }
}

// Click on SVG hit area selects a wire
wireSvg.addEventListener('click', e => {
  const wireId = e.target.dataset && parseInt(e.target.dataset.wireId, 10);
  if (!wireId || isNaN(wireId)) return;
  e.stopPropagation();

  if (selectedWireId === wireId) {
    deselectWire();
    return;
  }
  deselectWire();
  const w = wires.find(w => w.id === wireId);
  if (w) {
    w.selected = true;
    selectedWireId = w.id;
    renderWire(w);
  }
});

// Delete key removes selected wire
document.addEventListener('keydown', e => {
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedWireId !== null) {
    pushHistory();
    removeWire(selectedWireId);
    removeWireElem(selectedWireId);
    selectedWireId = null;
    evaluateCircuit();
    renderAll();
  }
});

// Component click selects it visually (for the delete button) and deselects wire
workspace.addEventListener('click', e => {
  const node = e.target.closest('.component-node');
  if (node) {
    deselectWire();
    // Toggle selected class for visual feedback
    document.querySelectorAll('.component-node.selected')
      .forEach(n => { if (n !== node) n.classList.remove('selected'); });
    node.classList.toggle('selected');
  }
});

/* ==========================================================
   SECTION 5 — PANEL TOGGLE & WORKSPACE PANNING
   ========================================================== */

// ---- Panel toggle ----
const appEl        = document.getElementById('app');
const panelToggle  = document.getElementById('panel-toggle');
const panelBackdrop = document.getElementById('panel-backdrop');

const isMobile = () => window.innerWidth < 768;

// Initialise panel state: collapsed on mobile, open on desktop
function initPanelState() {
  if (isMobile()) {
    appEl.classList.add('panel-collapsed');
    panelToggle.setAttribute('aria-expanded', 'false');
  } else {
    appEl.classList.remove('panel-collapsed');
    panelToggle.setAttribute('aria-expanded', 'true');
  }
}

function togglePanel() {
  const collapsed = appEl.classList.toggle('panel-collapsed');
  panelToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  // After the CSS transition, re-render wires (viewport geometry changed)
  setTimeout(renderAll, 200);
}

panelToggle.addEventListener('click', togglePanel);

// Backdrop click closes panel on mobile
panelBackdrop.addEventListener('click', togglePanel);

// After adding a component on mobile, close the panel.
// Re-bind panel buttons so they call the mobile-aware handler.
document.querySelectorAll('.comp-btn').forEach(btn => {
  // Replace the node to drop the earlier listener, then attach the new one.
  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);
  fresh.addEventListener('click', () => {
    addComponentToBoard(fresh.dataset.type);
    if (isMobile() && !appEl.classList.contains('panel-collapsed')) {
      togglePanel();
    }
  });
});

// Re-render wires when the window is resized (viewport geometry changes)
window.addEventListener('resize', () => {
  renderAll();
});

// ---- Workspace panning ----
let panState = null; // { startX, startY, startPanX, startPanY, pointerId, moved }

workspace.addEventListener('pointerdown', e => {
  // Only pan with primary button, and only when the target is the workspace/canvas background
  if (e.button !== 0) return;
  const onBackground = e.target === workspace || e.target === canvas;
  if (!onBackground) return;
  // Don't start panning while wiring
  if (wiringFrom) return;

  e.preventDefault();
  workspace.setPointerCapture(e.pointerId);

  panState = {
    startX:    e.clientX,
    startY:    e.clientY,
    startPanX: panX,
    startPanY: panY,
    pointerId: e.pointerId,
    moved:     false,
  };
});

workspace.addEventListener('pointermove', e => {
  if (!panState || panState.pointerId !== e.pointerId) return;
  if (wiringFrom) { panState = null; return; } // abort if wiring started mid-drag

  const dx = e.clientX - panState.startX;
  const dy = e.clientY - panState.startY;

  if (!panState.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
    panState.moved = true;
    workspace.classList.add('panning');
  }

  if (panState.moved) {
    panX = panState.startPanX + dx;
    panY = panState.startPanY + dy;
    applyPan();
    // Redraw all wires so they follow the panned port positions
    for (const wire of wires) renderWire(wire);
    updateScrollbars();
  }
});

workspace.addEventListener('pointerup', e => {
  if (!panState || panState.pointerId !== e.pointerId) return;
  workspace.classList.remove('panning');
  workspace.releasePointerCapture(e.pointerId);
  panState = null;
});

workspace.addEventListener('pointercancel', e => {
  if (!panState || panState.pointerId !== e.pointerId) return;
  workspace.classList.remove('panning');
  panState = null;
});

// ---- Center-view button ----
document.getElementById('btn-center').addEventListener('click', () => {
  if (components.length === 0) {
    panX = 0;
    panY = 0;
    applyPan();
    return;
  }

  // Find bounding box of all components in canvas space
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const comp of components) {
    const node = compNodes.get(comp.id);
    if (!node) continue;
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    if (comp.x         < minX) minX = comp.x;
    if (comp.y         < minY) minY = comp.y;
    if (comp.x + w     > maxX) maxX = comp.x + w;
    if (comp.y + h     > maxY) maxY = comp.y + h;
  }

  const contentW = maxX - minX;
  const contentH = maxY - minY;
  const wsW = workspace.clientWidth;
  const wsH = workspace.clientHeight;

  // Pan so that the content centre aligns with the viewport centre
  panX = (wsW - contentW) / 2 - minX;
  panY = (wsH - contentH) / 2 - minY;

  // Clamp so we don't show excessive blank space (optional comfort limit)
  const maxPan = 2000;
  panX = Math.max(-maxPan, Math.min(maxPan, panX));
  panY = Math.max(-maxPan, Math.min(maxPan, panY));

  applyPan();
  renderAll();
  updateScrollbars();
});

/* ---- Undo / Redo button handlers ---- */
document.getElementById('btn-undo').addEventListener('click', () => {
  if (undoStack.length === 0) return;
  redoStack.push(cloneState());
  const snap = undoStack.pop();
  updateHistoryButtons();
  restoreSnapshot(snap);
});

document.getElementById('btn-redo').addEventListener('click', () => {
  if (redoStack.length === 0) return;
  undoStack.push(cloneState());
  const snap = redoStack.pop();
  updateHistoryButtons();
  restoreSnapshot(snap);
});

/* ---- Keyboard shortcuts: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z ---- */
document.addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (!ctrl) return;

  if (e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    if (undoStack.length === 0) return;
    redoStack.push(cloneState());
    const snap = undoStack.pop();
    updateHistoryButtons();
    restoreSnapshot(snap);
    return;
  }

  if (e.key === 'y' || (e.key === 'z' && e.shiftKey) || (e.key === 'Z' && e.shiftKey)) {
    e.preventDefault();
    if (redoStack.length === 0) return;
    undoStack.push(cloneState());
    const snap = redoStack.pop();
    updateHistoryButtons();
    restoreSnapshot(snap);
  }
});

/* ---- Help panel toggle ---- */
function initHelpPanel() {
  // Collapsed by default on mobile, open on wide screens
  if (isMobile()) {
    appEl.classList.add('help-collapsed');
  } else {
    appEl.classList.remove('help-collapsed');
  }
}

function toggleHelp(open) {
  if (open === undefined) {
    appEl.classList.toggle('help-collapsed');
  } else {
    appEl.classList.toggle('help-collapsed', !open);
  }
  // Viewport geometry changed — redraw wires after transition
  setTimeout(renderAll, 200);
}

document.getElementById('help-toggle').addEventListener('click', () => toggleHelp(false));
document.getElementById('help-open').addEventListener('click',   () => toggleHelp(true));

/* ==========================================================
   SECTION 6 — TRUTH TABLE & SCROLLBARS
   ========================================================== */

// ---- Truth Table ----
const truthBody   = document.getElementById('truth-body');
const truthPanel  = document.getElementById('truth-panel');
const MAX_SWITCHES = 5;

/**
 * Evaluate the circuit with a temporary switch-value overrides.
 * Does NOT modify real comp.value on switches; returns an array of LED values.
 * @param {Array} switches — ordered list of switch components
 * @param {number} row    — bitmask of input values (bit 0 = last switch)
 * @param {Array} leds    — ordered list of LED components
 */
function evalForRow(switches, row, leds) {
  // Build a temporary value map: compId → value
  const tempVals = new Map();
  switches.forEach((sw, i) => {
    // bit i corresponds to the (switches.length-1-i)-th bit so MSB is switch[0]
    const bit = (row >> (switches.length - 1 - i)) & 1;
    tempVals.set(sw.id, bit);
  });

  // Topological evaluation (Kahn's) with overridden switch values
  const portValues = new Map();
  const adj   = new Map();
  const inDeg = new Map();
  for (const c of components) { adj.set(c.id, new Set()); inDeg.set(c.id, 0); }
  const seen = new Set();
  for (const w of wires) {
    const key = w.fromCompId + '-' + w.toCompId;
    if (!seen.has(key)) {
      seen.add(key);
      adj.get(w.fromCompId).add(w.toCompId);
      inDeg.set(w.toCompId, inDeg.get(w.toCompId) + 1);
    }
  }
  const queue = [];
  for (const [id, deg] of inDeg) { if (deg === 0) queue.push(id); }

  while (queue.length > 0) {
    const compId = queue.shift();
    const comp   = findComp(compId);
    if (!comp) continue;

    const inputVals = comp.inputs.map(port => {
      const wire = wires.find(w => w.toCompId === compId && w.toPortId === port.portId);
      return wire ? portValues.get(wire.fromPortId) ?? 0 : 0;
    });

    let outVal = 0;
    switch (comp.type) {
      case 'switch': outVal = tempVals.has(comp.id) ? tempVals.get(comp.id) : comp.value; break;
      case 'led':    outVal = inputVals[0] ?? 0; break;
      case 'and':    outVal = (inputVals[0] === 1 && inputVals[1] === 1) ? 1 : 0; break;
      case 'or':     outVal = (inputVals[0] === 1 || inputVals[1] === 1) ? 1 : 0; break;
      case 'not':    outVal = inputVals[0] ? 0 : 1; break;
      case 'nand':   outVal = (inputVals[0] === 1 && inputVals[1] === 1) ? 0 : 1; break;
      case 'nor':    outVal = (inputVals[0] === 1 || inputVals[1] === 1) ? 0 : 1; break;
      case 'xor':    outVal = (inputVals[0] !== inputVals[1]) ? 1 : 0; break;
      case 'xnor':   outVal = (inputVals[0] === inputVals[1]) ? 1 : 0; break;
    }

    for (const outPort of comp.outputs) portValues.set(outPort.portId, outVal);
    for (const succId of adj.get(compId)) {
      const nd = inDeg.get(succId) - 1;
      inDeg.set(succId, nd);
      if (nd === 0) queue.push(succId);
    }
  }

  return leds.map(led => {
    // LED has no outputs; read its computed value from its input wire's source port
    const inputPort = led.inputs[0];
    if (!inputPort) return 0;
    const wire = wires.find(w => w.toPortId === inputPort.portId);
    return wire ? portValues.get(wire.fromPortId) ?? 0 : 0;
  });
}

/**
 * Rebuild the truth table from scratch.
 * Called by renderAll() whenever the circuit structure changes.
 */
function buildTruthTable() {
  if (!truthBody) return;

  const switches = components.filter(c => c.type === 'switch');
  const leds     = components.filter(c => c.type === 'led');

  // Guard conditions
  if (switches.length === 0 || leds.length === 0) {
    truthBody.innerHTML = '<p class="truth-msg">Tambahkan minimal satu Saklar dan satu LED.</p>';
    return;
  }
  if (switches.length > MAX_SWITCHES) {
    truthBody.innerHTML = '<p class="truth-msg">Terlalu banyak saklar (maksimal 5).</p>';
    return;
  }

  const rows = 1 << switches.length; // 2^n
  const frag = document.createDocumentFragment();

  // Header row
  const thead = document.createElement('tr');
  switches.forEach(sw => {
    const th = document.createElement('th'); th.textContent = sw.label; thead.appendChild(th);
  });
  leds.forEach(led => {
    const th = document.createElement('th'); th.className = 'th-led'; th.textContent = led.label; thead.appendChild(th);
  });
  const table = document.createElement('table');
  table.className = 'truth-table';
  const theadEl = document.createElement('thead');
  theadEl.appendChild(thead);
  const tbody  = document.createElement('tbody');

  for (let row = 0; row < rows; row++) {
    const tr = document.createElement('tr');
    tr.dataset.row = row;

    // Switch input cells
    switches.forEach((sw, i) => {
      const td = document.createElement('td');
      td.textContent = (row >> (switches.length - 1 - i)) & 1;
      tr.appendChild(td);
    });

    // LED output cells
    const ledVals = evalForRow(switches, row, leds);
    ledVals.forEach(v => {
      const td = document.createElement('td');
      td.textContent = v;
      td.className = v === 1 ? 'td-one' : '';
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  }

  table.appendChild(theadEl);
  table.appendChild(tbody);
  frag.appendChild(table);
  truthBody.innerHTML = '';
  truthBody.appendChild(frag);

  // Immediately highlight the active row
  highlightTruthRow();
}

/**
 * Highlight the row whose input bits match the current live switch values.
 * Called after switch toggle (no rebuild needed).
 */
function highlightTruthRow() {
  if (!truthBody) return;
  const switches = components.filter(c => c.type === 'switch');
  if (switches.length === 0 || switches.length > MAX_SWITCHES) return;

  // Compute the row index from live switch values
  let rowIdx = 0;
  switches.forEach((sw, i) => {
    rowIdx |= (sw.value << (switches.length - 1 - i));
  });

  truthBody.querySelectorAll('tr[data-row]').forEach(tr => {
    tr.classList.toggle('truth-active', parseInt(tr.dataset.row, 10) === rowIdx);
  });
}

// Truth panel open/close
const btnTruth   = document.getElementById('btn-truth');
const truthClose = document.getElementById('truth-close');

function toggleTruthPanel(open) {
  if (open === undefined) {
    appEl.classList.toggle('truth-hidden');
  } else {
    appEl.classList.toggle('truth-hidden', !open);
  }
}

btnTruth.addEventListener('click',   () => toggleTruthPanel(true));
truthClose.addEventListener('click', () => toggleTruthPanel(false));

// ---- Workspace Scrollbars ----
// The canvas is translated via panX/panY. We show two synthetic scrollbar tracks
// (horizontal + vertical) that reflect and control the same pan offset.
// The workspace itself keeps overflow:hidden so there is no competing native scroll.

const hTrack  = document.getElementById('sb-h-track');
const hThumb  = document.getElementById('sb-h-thumb');
const vTrack  = document.getElementById('sb-v-track');
const vThumb  = document.getElementById('sb-v-thumb');

const CANVAS_W = 4000;
const CANVAS_H = 3000;

/**
 * Recompute and position the scrollbar thumbs based on current panX/panY
 * and the visible workspace dimensions.
 */
function updateScrollbars() {
  if (!hTrack || !vTrack) return;

  const wsW = workspace.clientWidth;
  const wsH = workspace.clientHeight;

  // Only show scrollbars when canvas is larger than viewport
  hTrack.style.display = CANVAS_W > wsW ? 'block' : 'none';
  vTrack.style.display = CANVAS_H > wsH ? 'block' : 'none';

  // Horizontal thumb: track width × (wsW / CANVAS_W), clamped min 24px
  const hRatio  = Math.min(1, wsW / CANVAS_W);
  const hThumbW = Math.max(24, hTrack.clientWidth * hRatio);
  const hScroll = -panX; // how far we've scrolled right (0 = leftmost)
  const hMaxScroll = CANVAS_W - wsW;
  const hPos = hMaxScroll > 0
    ? (hScroll / hMaxScroll) * (hTrack.clientWidth - hThumbW)
    : 0;
  hThumb.style.width = hThumbW + 'px';
  hThumb.style.left  = Math.max(0, hPos) + 'px';

  // Vertical thumb
  const vRatio  = Math.min(1, wsH / CANVAS_H);
  const vThumbH = Math.max(24, vTrack.clientHeight * vRatio);
  const vScroll = -panY;
  const vMaxScroll = CANVAS_H - wsH;
  const vPos = vMaxScroll > 0
    ? (vScroll / vMaxScroll) * (vTrack.clientHeight - vThumbH)
    : 0;
  vThumb.style.height = vThumbH + 'px';
  vThumb.style.top    = Math.max(0, vPos) + 'px';
}

// Clicking the track (outside the thumb) jumps the view
hTrack && hTrack.addEventListener('pointerdown', e => {
  if (e.target === hThumb) return;
  const rect = hTrack.getBoundingClientRect();
  const frac = (e.clientX - rect.left) / rect.width;
  panX = -(frac * (CANVAS_W - workspace.clientWidth));
  applyPan();
  for (const wire of wires) renderWire(wire);
  updateScrollbars();
});

vTrack && vTrack.addEventListener('pointerdown', e => {
  if (e.target === vThumb) return;
  const rect = vTrack.getBoundingClientRect();
  const frac = (e.clientY - rect.top) / rect.height;
  panY = -(frac * (CANVAS_H - workspace.clientHeight));
  applyPan();
  for (const wire of wires) renderWire(wire);
  updateScrollbars();
});

// Dragging the thumb
let sbDrag = null; // { axis, startPos, startPan, pointerId }

function startThumbDrag(axis, e) {
  e.preventDefault();
  e.stopPropagation();
  const el = axis === 'h' ? hThumb : vThumb;
  el.setPointerCapture(e.pointerId);
  sbDrag = { axis, startPos: axis === 'h' ? e.clientX : e.clientY,
             startPan: axis === 'h' ? panX : panY, pointerId: e.pointerId };
}

hThumb && hThumb.addEventListener('pointerdown', e => startThumbDrag('h', e));
vThumb && vThumb.addEventListener('pointerdown', e => startThumbDrag('v', e));

document.addEventListener('pointermove', e => {
  if (!sbDrag || sbDrag.pointerId !== e.pointerId) return;
  if (sbDrag.axis === 'h') {
    const trackW  = hTrack.clientWidth;
    const wsW     = workspace.clientWidth;
    const thumbW  = hThumb.offsetWidth;
    const delta   = e.clientX - sbDrag.startPos;
    const panDelta = (delta / (trackW - thumbW)) * (CANVAS_W - wsW);
    panX = Math.min(0, Math.max(-(CANVAS_W - wsW), sbDrag.startPan - panDelta));
  } else {
    const trackH  = vTrack.clientHeight;
    const wsH     = workspace.clientHeight;
    const thumbH  = vThumb.offsetHeight;
    const delta   = e.clientY - sbDrag.startPos;
    const panDelta = (delta / (trackH - thumbH)) * (CANVAS_H - wsH);
    panY = Math.min(0, Math.max(-(CANVAS_H - wsH), sbDrag.startPan - panDelta));
  }
  applyPan();
  for (const wire of wires) renderWire(wire);
  updateScrollbars();
});

document.addEventListener('pointerup', e => {
  if (sbDrag && sbDrag.pointerId === e.pointerId) sbDrag = null;
});

/* ---- Initial setup ---- */
initPanelState();
initHelpPanel();
updateHistoryButtons();
// Start with truth panel hidden (open only on demand)
appEl.classList.add('truth-hidden');
renderAll();
