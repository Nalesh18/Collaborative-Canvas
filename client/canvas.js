// client/canvas.js
// 
// This file includes the critical bug fix for the "drawing offset"
// (the DPR scaling issue).
//

const baseCanvas = document.getElementById('baseCanvas');
const overlayCanvas = document.getElementById('overlayCanvas');
const usersList = document.getElementById('usersList');
const fpsEl = document.getElementById('fps');
const latencyEl = document.getElementById('latency');

const sizeInput = document.getElementById('size');
const colorPicker = document.getElementById('colorPicker');
const brushBtn = document.getElementById('brushBtn');
const eraserBtn = document.getElementById('eraserBtn');
const rectBtn = document.getElementById('rectBtn');
const circleBtn = document.getElementById('circleBtn');
const lineBtn = document.getElementById('lineBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const clearBtn = document.getElementById('clearBtn');
const saveBtn = document.getElementById('saveBtn');

let dpr = window.devicePixelRatio || 1;
let baseCtx = baseCanvas.getContext('2d');
let overlayCtx = overlayCanvas.getContext('2d');

const buffer = document.createElement('canvas');
const bufferCtx = buffer.getContext('2d');

let username = null;
let userColor = '#e63946';
let userId = null;
let tool = 'brush';
let size = Number(sizeInput.value);
let color = colorPicker.value;
let drawing = false;
let pts = [];
let shapeStart = null;
let history = [];
let cursors = {};
const seenOpIds = new Set();

let frames = 0, lastFpsTs = performance.now();

// --- Helper Functions ---

function throttle(fn, wait) {
  let last = 0;
  return function(...args) {
    const now = Date.now();
    if (now - last >= wait) { last = now; fn(...args); }
  };
}

// This function is key for responsive canvas
function resizeCanvases(){
  dpr = window.devicePixelRatio || 1;
  
  const width = baseCanvas.clientWidth;
  const height = baseCanvas.clientHeight;
  
  if (width === 0 || height === 0) {
    // Canvas is not visible, don't resize
    return;
  }
  
  const w = Math.floor(width * dpr);
  const h = Math.floor(height * dpr);

  if (baseCanvas.width !== w || baseCanvas.height !== h) {
    baseCanvas.width = w; baseCanvas.height = h;
    overlayCanvas.width = w; overlayCanvas.height = h;
    buffer.width = w; buffer.height = h;
    
    // 
    // CRITICAL BUG FIX (The "drawing offset" fix):
    // Only apply the DPR transform to the "live" contexts
    // (overlay and buffer) where drawing actually happens.
    //
    overlayCtx.setTransform(dpr,0,0,dpr,0,0);
    bufferCtx.setTransform(dpr,0,0,dpr,0,0);
    
    // The baseCtx remains 1:1. It is just a "copy" target.
    
    rebuildBufferFromHistory();
  }
}

// --- Drawing Functions ---

function drawStrokeOn(ctx, op){
  if (!op || !op.payload || !op.payload.points) return;
  const p = op.payload;
  ctx.save();
  ctx.lineWidth = p.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = p.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = p.color || '#000';
  const pts = p.points;
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++){
    const prev = pts[i-1], cur = pts[i];
    const midx = (prev.x + cur.x)/2, midy = (prev.y + cur.y)/2;
    ctx.quadraticCurveTo(prev.x, prev.y, midx, midy);
  }
  ctx.stroke();
  ctx.restore();
}

function drawShapeOn(ctx, op){
  if (!op || !op.payload || !op.payload.shape) return;
  const p = op.payload;
  const s = p.shape;
  ctx.save();
  ctx.lineWidth = p.size || 2;
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = p.color || '#000';
  if (s.type === 'rect'){
    const x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2);
    const w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1);
    ctx.strokeRect(x,y,w,h);
  } else if (s.type === 'circle'){
    const cx = (s.x1 + s.x2)/2, cy = (s.y1 + s.y2)/2;
    const r = Math.hypot(s.x2 - s.x1, s.y2 - s.y1)/2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
  } else if (s.type === 'line'){
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
  }
  ctx.restore();
}

function rebuildBufferFromHistory(){
  bufferCtx.clearRect(0,0,buffer.width, buffer.height);
  
  const clearedUsers = new Set();
  let globalClearIndex = -1;

  const undoCount = new Map();
  for (let i = 0; i < history.length; i++){
    const op = history[i];
    if (op.type === 'undo') {
      const t = op.payload && op.payload.target;
      if (t) undoCount.set(t, (undoCount.get(t)||0) + 1);
    } else if (op.type === 'redo') {
      const t = op.payload && op.payload.target;
      if (t) undoCount.set(t, Math.max(0, (undoCount.get(t)||0) - 1));
    } else if (op.type === 'clear') {
      globalClearIndex = i;
      clearedUsers.clear();
    } else if (op.type === 'clear-user' && op.payload && op.payload.userId) {
      clearedUsers.add(op.payload.userId);
    }
  }

  for (let i = 0; i < history.length; i++){
    if (i <= globalClearIndex) continue;
    
    const op = history[i];

    if (op.userId && clearedUsers.has(op.userId)) {
        if (op.type === 'stroke' || op.type === 'shape') {
            continue;
        }
    }

    if (op.type === 'stroke' || op.type === 'shape'){
      const count = undoCount.get(op.id) || 0;
      if (count % 2 === 0) {
        if (op.type === 'stroke') drawStrokeOn(bufferCtx, op);
        if (op.type === 'shape') drawShapeOn(bufferCtx, op);
      }
    } else if (op.type === 'clear'){
      bufferCtx.clearRect(0,0, buffer.width, buffer.height);
    }
  }
  
  // CRITICAL BUG FIX:
  // Copy from the transformed buffer to the 1:1 base canvas.
  baseCtx.clearRect(0,0, baseCanvas.width, baseCanvas.height);
  baseCtx.drawImage(buffer, 0, 0);
}

function redrawOverlayPreview(){
  overlayCtx.clearRect(0,0, overlayCanvas.width, overlayCanvas.height);
  
  if (drawing && pts.length > 0 && (tool === 'brush' || tool === 'eraser')) {
    const tempOp = { payload: { points: pts, color: color, size: size, tool: tool } };
    drawStrokeOn(overlayCtx, tempOp); 
  }
  
  if (drawing && shapeStart && (tool === 'rect' || tool === 'circle' || tool === 'line')) {
    const last = pts.length ? pts[pts.length-1] : null;
    if (last) {
      const op = { payload: { shape: { type: tool, x1: shapeStart.x, y1: shapeStart.y, x2: last.x, y2: last.y }, color, size } };
      drawShapeOn(overlayCtx, op);
    }
  }
  for (const [id, c] of Object.entries(cursors)) {
    if (!c || typeof c.x !== 'number' || id === userId) continue;
    overlayCtx.save();
    overlayCtx.beginPath();
    overlayCtx.fillStyle = c.color || '#222';
    overlayCtx.arc(c.x, c.y, 6, 0, Math.PI*2);
    overlayCtx.fill();
    overlayCtx.fillStyle = '#fff';
    overlayCtx.font = '11px sans-serif';
    overlayCtx.fillText(c.name || id.slice(0,4), c.x + 10, c.y + 4);
    overlayCtx.restore();
  }
  frames++;
  if (performance.now() - lastFpsTs >= 1000) {
    fpsEl.textContent = frames.toString();
    frames = 0;
    lastFpsTs = performance.now();
  }
  requestAnimationFrame(redrawOverlayPreview);
}

// --- Pointer/Event Handlers ---

function pointerToLocal(ev){
  // ev.offsetX is the most direct way
  if (ev.offsetX !== undefined) {
    return { x: ev.offsetX, y: ev.offsetY };
  } 
  
  // Fallback for touch or browsers without offsetX
  const rect = baseCanvas.getBoundingClientRect();
  const computedStyle = getComputedStyle(baseCanvas);
  const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0;
  const borderTop = parseFloat(computedStyle.borderTopWidth) || 0;
  
  const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
  const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;

  return { 
    x: clientX - rect.left - borderLeft, 
    y: clientY - rect.top - borderTop 
  };
}

function generateId(){ return `${userId||'u'}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }

const sendPreview = throttle((points) => {
  if (!userId) return;
  const part = { id: generateId(), type: 'stroke-part', userId, payload: { points, color, size, tool } };
  net.send('op', part);
}, 60);

function pointerDown(ev) {
  if (!userId) return;
  if (ev.button > 0) return; // Ignore right-click
  ev.preventDefault();
  drawing = true; pts = [];
  const p = pointerToLocal(ev);
  pts.push(p);
  if (tool === 'rect' || tool === 'circle' || tool === 'line') shapeStart = p;
  
  baseCanvas.setPointerCapture(ev.pointerId);
}
function pointerMove(ev) {
  if (!userId) return;
  const p = pointerToLocal(ev);
  
  if (!drawing) {
    net.send('cursor', { x: p.x, y: p.y });
  } else {
    pts.push(p);
    if (tool === 'brush' || tool === 'eraser') sendPreview(pts.slice());
  }
}
function pointerUp(ev) {
  if (!userId) return;

  if (drawing) {
    drawing = false; 
    
    const p = pointerToLocal(ev);
    pts.push(p);

    if (tool === 'brush' || tool === 'eraser') {
      if (pts.length < 2) { pts = []; }
      else {
        const op = { id: generateId(), type: 'stroke', userId, payload: { points: pts.slice(), color, size, tool } };
        history.push(op); seenOpIds.add(op.id);
        drawStrokeOn(bufferCtx, op);
        // CRITICAL BUG FIX: Copy to baseCtx
        baseCtx.clearRect(0,0, baseCanvas.width, baseCanvas.height); 
        baseCtx.drawImage(buffer, 0,0);
        net.send('op', op);
        pts = [];
      }
    } else if (tool === 'rect' || tool === 'circle' || tool === 'line') {
      if (!shapeStart || (shapeStart.x === p.x && shapeStart.y === p.y)) {
        pts = []; shapeStart = null; 
      } else {
        const op = { id: generateId(), type: 'shape', userId, payload: { shape: { type: tool, x1: shapeStart.x, y1: shapeStart.y, x2: p.x, y2: p.y }, color, size } };
        history.push(op); seenOpIds.add(op.id);
        drawShapeOn(bufferCtx, op);
        // CRITICAL BUG FIX: Copy to baseCtx
        baseCtx.clearRect(0,0, baseCanvas.width, baseCanvas.height); 
        baseCtx.drawImage(buffer, 0,0);
        net.send('op', op);
        pts = []; shapeStart = null; 
      }
    }
  }

  drawing = false;
  pts = [];
  shapeStart = null;
  
  try {
    baseCanvas.releasePointerCapture(ev.pointerId);
  } catch (e) {}
}

// --- UI Actions ---

function doUndo(){
  if (!userId) return;
  net.send('undo', {});
}
function doRedo(){
  if (!userId) return;
  net.send('redo', {});
}

function doClear(){
  if (!userId) return;
  // This sends a global clear, which is what the button implies
  const op = { id: generateId(), type: 'clear', userId, payload: {} };
  history.push(op); 
  seenOpIds.add(op.id);
  rebuildBufferFromHistory(); // Trigger local rebuild immediately
  net.send('op', op); // Send to server
}

function updateUsers(list){
  const newIds = new Set(list.map(u => u.id));
  const existingEls = Array.from(usersList.children);

  existingEls.forEach(li => {
    if (!newIds.has(li.dataset.userId)) {
      li.style.animation = 'fadeOutLeft 0.3s forwards';
      setTimeout(() => li.remove(), 300);
    }
  });

  list.forEach(u => {
    let li = usersList.querySelector(`[data-user-id="${u.id}"]`);
    if (!li) {
      li = document.createElement('li');
      li.dataset.userId = u.id;
      const txt = document.createElement('span'); 
      li.appendChild(txt);
      usersList.appendChild(li);
    }
    li.style.borderColor = u.color || '#444'; // Use border color from new CSS
    li.querySelector('span:last-child').textContent = `${u.name}${u.id === userId ? ' (You)' : ''}`;
  });
}

function attachHandlers(){
  baseCanvas.addEventListener('pointerdown', pointerDown);
  baseCanvas.addEventListener('pointermove', pointerMove);
  baseCanvas.addEventListener('pointerup', pointerUp);
  baseCanvas.addEventListener('pointercancel', pointerUp);
  baseCanvas.addEventListener('pointerleave', (ev) => {
    if (drawing) {
        pointerUp(ev);
    }
    net.send('cursor', { x: -1, y: -1 }); 
  });

  // This is the other key for scalable/responsive design
  window.addEventListener('resize', resizeCanvases);

  sizeInput.addEventListener('input', ()=> size = Number(sizeInput.value));
  colorPicker.addEventListener('input', ()=> color = colorPicker.value);
  brushBtn.addEventListener('click', ()=> setTool('brush'));
  eraserBtn.addEventListener('click', ()=> setTool('eraser'));
  rectBtn.addEventListener('click', ()=> setTool('rect'));
  circleBtn.addEventListener('click', ()=> setTool('circle'));
  lineBtn.addEventListener('click', ()=> setTool('line'));
  undoBtn.addEventListener('click', doUndo);
  redoBtn.addEventListener('click', doRedo);
  clearBtn.addEventListener('click', doClear);
  saveBtn.addEventListener('click', ()=> {
    // CRITICAL BUG FIX: Copy to baseCtx before saving
    baseCtx.clearRect(0,0, baseCanvas.width, baseCanvas.height);
    baseCtx.drawImage(buffer, 0, 0);
    const dataUrl = baseCanvas.toDataURL('image/png');
    const a = document.createElement('a'); a.href = dataUrl; a.download = 'canvas.png'; a.click();
  });
}

// --- WebSocket Handlers ---
net.on('open', ()=> {});
net.on('joined', (payload) => {
  userId = payload.userId;
  username = payload.name || username;
  userColor = payload.color || userColor;
  if (payload.state) { history = payload.state.slice(); history.forEach(op=> op.id && seenOpIds.add(op.id)); }
  // We must resize *after* we have history, so it redraws
  resizeCanvases();
  updateUsers(payload.users || []);
});
net.on('op', (op) => {
  if (!op || !op.id) return;
  if (seenOpIds.has(op.id)) return;
  seenOpIds.add(op.id);
  if (op.type === 'stroke-part') {
    const tmp = { payload: op.payload };
    drawStrokeOn(overlayCtx, tmp);
    setTimeout(()=> { 
        // A bit of a hacky clear, but fine for previews
        overlayCtx.clearRect(0,0, overlayCanvas.width, overlayCanvas.height);
    }, 120);
    return;
  }
  history.push(op);
  rebuildBufferFromHistory();
});
net.on('history', (h) => {
  if (!Array.isArray(h)) return;
  history = h.slice(); history.forEach(op => op.id && seenOpIds.add(op.id));
  rebuildBufferFromHistory();
});
net.on('presence', (list) => updateUsers(list));
net.on('cursor', (c) => {
  if (!c || !c.userId) return;
  if (c.x < 0 || c.y < 0) {
    delete cursors[c.userId];
    return;
  }
  cursors[c.userId] = { x:c.x, y:c.y, color:c.color, name:c.name, _ts: Date.w.now() };
  setTimeout(()=> { const cur = cursors[c.userId]; if (cur && Date.now() - cur._ts > 5000) delete cursors[c.userId]; }, 7000);
});
net.on('pong', (t) => { const r = Date.now() - t; latencyEl.textContent = `Ping: ${r} ms`; });

// --- App Initialization ---
function setTool(t){
  tool = t;
  [brushBtn, eraserBtn, rectBtn, circleBtn, lineBtn].forEach(b => b.classList.toggle('active', false));
  
  const activeBtn = [brushBtn, eraserBtn, rectBtn, circleBtn, lineBtn].find(b => b.id.startsWith(t));
  if (activeBtn) activeBtn.classList.add('active');
}

window.canvasApp = {
  init: (opts) => {
    username = opts.name; userColor = opts.color || userColor;
    net.send('join', { name: username, color: userColor });
    attachHandlers();
    // Delay initial resize to allow layout to settle
    setTimeout(resizeCanvases, 60);
    requestAnimationFrame(redrawOverlayPreview);
  }
};