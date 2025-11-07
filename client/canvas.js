// client/canvas.js

const baseCanvas = document.getElementById('baseCanvas');
const overlayCanvas = document.getElementById('overlayCanvas');
const usersList = document.getElementById('usersList');
const fpsEl = document.getElementById('fps');
const latencyEl = document.getElementById('latency');

// ADDED: Theme toggle
const themeToggle = document.getElementById('themeToggle');

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

// ADDED: New tool buttons
const textBtn = document.getElementById('textBtn');
const imageBtn = document.getElementById('imageBtn');
const imageInput = document.getElementById('imageInput');

let dpr = window.devicePixelRatio || 1;
let baseCtx = baseCanvas.getContext('2d');
let overlayCtx = overlayCanvas.getContext('2d');

const buffer = document.createElement('canvas');
const bufferCtx = buffer.getContext('2d');

let username = null;
// MODIFIED: Default userColor set to black
let userColor = '#000000';
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

// ADDED: Global for room name
let roomName = 'global';

// ADDED: Globals for new tools
let pendingImage = null; // Stores loaded Image object for placement
let pendingImageDataUrl = null; // Stores dataURL to send in op
let currentTextInput = null; // Stores {input, x, y, w, h, color, size} for live text
let imageCache = {}; // Caches Image objects from dataURLs {src: Image}

// MODIFIED: A helper for the eraser cursor
let eraserCursorSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='${24}' height='${24}' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'><circle cx='12' cy='12' r='10'/></svg>`;
let eraserCursorDataUrl = `data:image/svg+xml;charset=utf8,${encodeURIComponent(eraserCursorSvg)}`;

// MODIFIED: SVG cursors for text and image
let textCursorDataUrl = '';
let imageCursorDataUrl = '';
let brushCursorDataUrl = '';

// ADDED: Global for theme-based cursor color
let cursorColor = '#000000'; // Default to black for dark mode


let frames = 0, lastFpsTs = performance.now();

// --- Helper Functions ---

function throttle(fn, wait) {
  let last = 0;
  return function(...args) {
    const now = Date.now();
    if (now - last >= wait) { last = now; fn(...args); }
  };
}

function resizeCanvases(){
  dpr = window.devicePixelRatio || 1;
  
  const width = baseCanvas.clientWidth;
  const height = baseCanvas.clientHeight;
  
  if (width === 0 || height === 0) {
    return;
  }
  
  const w = Math.floor(width * dpr);
  const h = Math.floor(height * dpr);

  if (baseCanvas.width !== w || baseCanvas.height !== h) {
    baseCanvas.width = w; baseCanvas.height = h;
    overlayCanvas.width = w; overlayCanvas.height = h;
    buffer.width = w; buffer.height = h;
    
    // Set transform for contexts that draw based on 1:1 coordinates
    overlayCtx.setTransform(dpr,0,0,dpr,0,0);
    bufferCtx.setTransform(dpr,0,0,dpr,0,0);
    
    // ADDED: Update all cursor sizes/colors on resize
    updateBrushCursor();
    updateEraserCursor();
    updateTextCursor();
    updateImageCursor();
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

// MODIFIED: Function to draw text
function drawTextOn(ctx, op) {
  if (!op || !op.payload) return;
  const p = op.payload;
  ctx.save();
  ctx.fillStyle = p.color;
  // Scale font size based on the 'size' slider
  // This was the bug: it needs to use p.size
  const fontSize = (p.size * 1) + 12; // e.g., size 4 -> 16px, size 48 -> 60px
  
  // --- FIX ---
  // The canvas context can't read CSS variables like 'var(--font-sans)'.
  // We must provide the actual font family name from style.css.
  ctx.font = `${fontSize}px 'Exo 2', sans-serif`;
  
  ctx.textBaseline = 'top';
  
  // Text wrapping logic
  const lines = p.text.split('\n');
  let currentY = p.y;
  const lineHeight = fontSize * 1.2;
  const maxWidth = p.width;

  lines.forEach(line => {
    let words = line.split(' ');
    let currentLine = '';
    
    for (let n = 0; n < words.length; n++) {
      let testLine = currentLine + words[n] + ' ';
      let metrics = ctx.measureText(testLine);
      let testWidth = metrics.width;
      
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(currentLine, p.x, currentY);
        currentLine = words[n] + ' ';
        currentY += lineHeight;
      } else {
        currentLine = testLine;
      }
    }
    ctx.fillText(currentLine, p.x, currentY);
    currentY += lineHeight;
  });
  
  ctx.restore();
}

// ADDED: Function to draw images from cache
function drawImageOn(ctx, op) {
  if (!op || !op.payload) return;
  const p = op.payload;
  const img = imageCache[p.src];
  
  // Only draw if the image is in the cache and fully loaded
  if (img && img.complete) {
    ctx.drawImage(img, p.x, p.y, p.width, p.height);
  }
}


function rebuildBufferFromHistory(){
  bufferCtx.clearRect(0,0,buffer.width, buffer.height);
  
  let globalClearIndex = -1;
  const userClearMap = new Map();
  const undoCount = new Map();

  // --- First Pass: Calculate states ---
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
      userClearMap.clear(); 
    } else if (op.type === 'clear-user' && op.payload && op.payload.userId) {
      userClearMap.set(op.payload.userId, i);
    }
  }

  // --- Second Pass: Iterate and draw ---
  for (let i = 0; i < history.length; i++){
    if (i <= globalClearIndex) continue;
    
    const op = history[i];

    // Check if the operation is "active" (not undone)
    // ADDED: 'image' and 'text' to the check
    if (op.type === 'stroke' || op.type === 'shape' || op.type === 'image' || op.type === 'text'){
      
      const lastClearIndex = userClearMap.get(op.userId);
      if (lastClearIndex !== undefined && i < lastClearIndex) {
          continue; 
      }

      const count = undoCount.get(op.id) || 0;
      if (count % 2 === 0) { 
        if (op.type === 'stroke') drawStrokeOn(bufferCtx, op);
        if (op.type === 'shape') drawShapeOn(bufferCtx, op);
        // ADDED: Draw new op types
        if (op.type === 'image') drawImageOn(bufferCtx, op);
        if (op.type === 'text') drawTextOn(bufferCtx, op);
      }
    
    } else if (op.type === 'clear'){
      bufferCtx.clearRect(0,0, buffer.width, buffer.height);
    }
  }
  
  baseCtx.clearRect(0,0, baseCanvas.width, baseCanvas.height);
  baseCtx.drawImage(buffer, 0, 0);
}

function redrawOverlayPreview(){
  overlayCtx.clearRect(0,0, overlayCanvas.width, overlayCanvas.height);
  
  // Draw brush/shape previews
  if (drawing && pts.length > 0 && (tool === 'brush' || tool === 'eraser')) {
    const tempOp = { payload: { points: pts, color: color, size: size, tool: tool } };
    drawStrokeOn(overlayCtx, tempOp); 
  }
  
  // MODIFIED: Draw shape/text/image box previews
  if (drawing && shapeStart && (tool === 'rect' || tool === 'circle' || tool === 'line' || tool === 'text' || tool === 'image')) {
    const last = pts.length ? pts[pts.length-1] : null;
    if (last) {
      const x = Math.min(shapeStart.x, last.x), y = Math.min(shapeStart.y, last.y);
      const w = Math.abs(last.x - shapeStart.x), h = Math.abs(last.y - shapeStart.y);
      
      overlayCtx.save();
      
      if (tool === 'image' && pendingImage) {
        // Image preview
        overlayCtx.globalAlpha = 0.6;
        overlayCtx.drawImage(pendingImage, x, y, w, h);
        overlayCtx.globalAlpha = 1.0;
        overlayCtx.strokeStyle = 'rgba(0, 207, 255, 0.8)';
        overlayCtx.lineWidth = 2;
        overlayCtx.strokeRect(x, y, w, h);
      } else if (tool === 'text') {
        // Text box preview
        overlayCtx.strokeStyle = 'rgba(0, 207, 255, 0.8)';
        overlayCtx.setLineDash([5, 5]);
        overlayCtx.strokeRect(x, y, w, h);
      } else if (tool !== 'image') {
        // Shape preview
        const op = { payload: { shape: { type: tool, x1: shapeStart.x, y1: shapeStart.y, x2: last.x, y2: last.y }, color, size } };
        drawShapeOn(overlayCtx, op);
      }
      overlayCtx.restore();
    }
  }


  // Draw remote user cursors
  for (const [id, c] of Object.entries(cursors)) {
    // MODIFIED: This check *already* hides the local user's cursor
    if (!c || typeof c.x !== 'number' || id === userId) continue;
    overlayCtx.save();
    overlayCtx.beginPath();
    overlayCtx.fillStyle = c.color || '#222';
    overlayCtx.arc(c.x, c.y, 6, 0, Math.PI*2);
    overlayCtx.fill();
    // MODIFIED: Use theme-based cursorColor for text
    overlayCtx.fillStyle = cursorColor; 
    overlayCtx.font = 'bold 12px "Exo 2", sans-serif';
    overlayCtx.fillText(c.name || id.slice(0,4), c.x + 10, c.y + 5);
    overlayCtx.restore();
  }
  
  // FPS counter
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
  if (ev.offsetX !== undefined) {
    return { x: ev.offsetX, y: ev.offsetY };
  } 
  
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

// MODIFIED: Handler for when text input is submitted (now textarea)
function onTextAreaSubmit() {
  if (!currentTextInput) return;
  
  // MODIFICATION: Get color and size from the stored object
  const { input, x, y, width, height, color, size } = currentTextInput;
  const text = input.value;
  input.remove(); // Remove from DOM
  currentTextInput = null;
  setTool('brush'); // Revert to brush tool
  
  if (text.trim()) {
    // Create and send text op
    const op = { 
      id: generateId(), 
      type: 'text', 
      userId, 
      // MODIFICATION: Use the color and size captured at creation
      payload: { text: text.trim(), x, y, width, height, color: color, size: size } 
    };
    history.push(op); 
    seenOpIds.add(op.id);
    drawTextOn(bufferCtx, op); // Draw to buffer
    baseCtx.clearRect(0,0, baseCanvas.width, baseCanvas.height); 
    baseCtx.drawImage(buffer, 0,0); // Redraw base
    net.send('op', op);
  }
}

function pointerDown(ev) {
  if (!userId) return;
  if (ev.button > 0) return;
  
  // If text input is active, clicking away submits it.
  if (currentTextInput) {
    currentTextInput.input.blur();
    ev.preventDefault();
    return;
  }
  
  ev.preventDefault();
  const p = pointerToLocal(ev);

  // MODIFIED: Logic for new tools (now based on click-and-drag)
  if (tool === 'text') {
    drawing = true;
    pts = [p];
    shapeStart = p;
    // Don't create input yet
    return;
  
  } else if (tool === 'image') {
    if (!pendingImage) return; // No image loaded
    
    drawing = true;
    pts = [p];
    shapeStart = p;
    // Don't place image yet
    return;
  }

  // Default drawing logic
  drawing = true; pts = [];
  pts.push(p);
  if (tool === 'rect' || tool === 'circle' || tool === 'line') shapeStart = p;
  
  baseCanvas.setPointerCapture(ev.pointerId);
}
function pointerMove(ev) {
  if (!userId) return;
  const p = pointerToLocal(ev);
  
  // Always send cursor update if not drawing
  if (!drawing) {
    net.send('cursor', { x: p.x, y: p.y });
    
    // ADDED: Show eraser size indicator even when not drawing
    if (tool === 'eraser') {
        pts = [p]; // Store last point for overlay preview
    }
    return; // Don't do drawing logic if not drawing
  }
  
  // Store cursor point for image/text preview
  if (tool === 'image' || tool === 'text') {
    pts = [p]; // Just store the last point
  }
  
  pts.push(p);
  if (tool === 'brush' || tool === 'eraser') sendPreview(pts.slice());
}

function pointerUp(ev) {
  if (!userId) return;
  
  // If text input is active, don't do anything
  if (currentTextInput) return;

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
        baseCtx.clearRect(0,0, baseCanvas.width, baseCanvas.height); 
        baseCtx.drawImage(buffer, 0,0);
        net.send('op', op);
        pts = []; shapeStart = null; 
      }
    }
    // ADDED: Logic for new tools on pointer up
    else if (tool === 'text') {
      if (!shapeStart) return;
      
      const x = Math.min(shapeStart.x, p.x), y = Math.min(shapeStart.y, p.y);
      const w = Math.abs(shapeStart.x - p.x), h = Math.abs(shapeStart.y - p.y);
      
      if (w < 20 || h < 20) { // Ignore tiny boxes
        pts = []; shapeStart = null; 
        return;
      }
      
      // Create and position the text input
      const textarea = document.createElement('textarea');
      textarea.className = 'text-input-overlay';
      
      // Position relative to the canvas-area container
      const rect = baseCanvas.getBoundingClientRect();

      // Calculate position relative to container
      const inputX = (x * (rect.width / baseCanvas.width * dpr));
      const inputY = (y * (rect.height / baseCanvas.height * dpr));
      const inputW = (w * (rect.width / baseCanvas.width * dpr));
      const inputH = (h * (rect.height / baseCanvas.height * dpr));

      textarea.style.left = `${inputX}px`;
      textarea.style.top = `${inputY}px`;
      textarea.style.width = `${inputW}px`;
      textarea.style.height = `${inputH}px`;
      
      const fontSize = (size * 1) + 12;
      textarea.style.fontSize = `${fontSize}px`;
      textarea.style.color = color;
      
      document.querySelector('.canvas-area').appendChild(textarea);
      textarea.focus();
      
      // Store reference
      // MODIFICATION: Store size and color at creation time
      currentTextInput = { input: textarea, x, y, width: w, height: h, color: color, size: size };
      
      textarea.addEventListener('blur', onTextAreaSubmit);
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          textarea.value = ''; // Cancel
          onTextAreaSubmit();
        }
        // Allow 'Enter' to create new lines, don't submit
      });

    } else if (tool === 'image') {
      if (!shapeStart || !pendingImage) {
        pts = []; shapeStart = null; 
        return;
      }

      const x = Math.min(shapeStart.x, p.x), y = Math.min(shapeStart.y, p.y);
      const w = Math.abs(shapeStart.x - p.x), h = Math.abs(shapeStart.y - p.y);

      if (w < 2 || h < 2) { // Ignore tiny boxes
        pts = []; shapeStart = null; 
        return;
      }
      
      // Create and send image op
      const op = {
        id: generateId(),
        type: 'image',
        userId,
        payload: {
          src: pendingImageDataUrl,
          x, y, width: w, height: h
        }
      };
      history.push(op); 
      seenOpIds.add(op.id);
      drawImageOn(bufferCtx, op); // Draw to buffer
      baseCtx.clearRect(0,0, baseCanvas.width, baseCanvas.height); 
      baseCtx.drawImage(buffer, 0,0); // Redraw base
      net.send('op', op);
      
      // Reset image tool
      pendingImage = null;
      pendingImageDataUrl = null;
      setTool('brush');
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
  
  const op = { 
    id: generateId(), 
    type: 'clear-user',
    userId, 
    payload: { userId: userId } 
  };
  
  history.push(op); 
  seenOpIds.add(op.id);
  rebuildBufferFromHistory(); 
  net.send('op', op); 
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
    // MODIFIED: User cursor color now updates from presence
    li.style.borderColor = u.color || '#444'; 
    li.querySelector('span:last-child').textContent = `${u.name}${u.id === userId ? ' (You)' : ''}`;
  });
}

// ADDED: Function to handle file input
function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const dataUrl = event.target.result;
    const img = new Image();
    img.onload = () => {
      // Image is loaded, set it as pending and switch tool
      pendingImage = img;
      pendingImageDataUrl = dataUrl;
      // Add to cache immediately
      if (!imageCache[dataUrl]) {
        imageCache[dataUrl] = img;
      }
      setTool('image');
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);

  // Reset file input to allow uploading the same file again
  e.target.value = null;
}

// ADDED: Helper to update brush cursor SVG
function updateBrushCursor() {
    const brushCursorSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='${cursorColor}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M17 3l4 4L12 18H8v-4L17 3z'/><path d='m16 4 4 4'/></svg>`;
    brushCursorDataUrl = `data:image/svg+xml;charset=utf8,${encodeURIComponent(brushCursorSvg)}`;
    
    if (tool === 'brush') {
        baseCanvas.style.cursor = `url("${brushCursorDataUrl}") 0 24, crosshair`;
    }
}

// ADDED: Helper to update image cursor SVG
function updateImageCursor() {
    const imageCursorSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='${cursorColor}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='12' y1='5' x2='12' y2='19'></line><line x1='5' y1='12' x2='19' y2='12'></line></svg>`;
    imageCursorDataUrl = `data:image/svg+xml;charset=utf8,${encodeURIComponent(imageCursorSvg)}`;
    
    if (tool === 'image') {
        baseCanvas.style.cursor = `url("${imageCursorDataUrl}") 12 12, crosshair`;
    }
}


// ADDED: Helper to update eraser cursor SVG
function updateEraserCursor() {
    // Scale cursor size based on slider, but with min/max caps
    const cursorSize = Math.max(8, Math.min(size * dpr, 128)); 
    const center = cursorSize / 2;
    const radius = (cursorSize / 2) - 1;

    // MODIFIED: Use theme-based cursorColor
    eraserCursorSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='${cursorSize}' height='${cursorSize}' viewBox='0 0 ${cursorSize} ${cursorSize}' fill='none' stroke='${cursorColor}' stroke-width='2'><circle cx='${center}' cy='${center}' r='${radius}'/></svg>`;
    eraserCursorDataUrl = `data:image/svg+xml;charset=utf8,${encodeURIComponent(eraserCursorSvg)}`;
    
    // Update cursor if eraser is active
    if (tool === 'eraser') {
        baseCanvas.style.cursor = `url("${eraserCursorDataUrl}") ${center} ${center}, crosshair`;
    }
}

// ADDED: Helper to update text cursor SVG
function updateTextCursor() {
    // MODIFIED: Use theme-based cursorColor
    const textCursorSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='${cursorColor}'><path d='M13 5h-2v14h2V5zM11 3H5v2h6V3zM19 3h-6v2h6V3zM11 21H5v-2h6v2zM19 21h-6v-2h6v2z'/></svg>`;
    textCursorDataUrl = `data:image/svg+xml;charset=utf8,${encodeURIComponent(textCursorSvg)}`;
    
    // Update cursor if text tool is active
    if (tool === 'text') {
        baseCanvas.style.cursor = `url("${textCursorDataUrl}") 12 12, text`;
    }
}

// ADDED: Function to set the theme
/**
 * Sets the color theme for the UI
 * @param {'bright' | 'dark'} theme - The theme to set
 * @param {boolean} updatePicker - Whether to update the color picker default
 */
function setTheme(theme, updatePicker = false) {
  if (theme === 'bright') {
    document.body.classList.add('bright-mode');
    localStorage.setItem('canvas-theme', 'bright');
    cursorColor = '#ffffff'; // MODIFIED: Bright mode cursor is WHITE
    if (updatePicker) {
      // MODIFIED: Bright mode default is RED
      colorPicker.value = '#FF4136'; // Red for bright
      color = colorPicker.value;
    }
  } else { // default to dark
    document.body.classList.remove('bright-mode');
    localStorage.setItem('canvas-theme', 'dark');
    cursorColor = '#000000'; // MODIFIED: Dark mode cursor is BLACK
    if (updatePicker) {
      // MODIFIED: Dark mode default is BLACK
      colorPicker.value = '#000000'; // Black for dark
      color = colorPicker.value;
    }
  }
  
  // MODIFIED: Update all cursors and re-apply active tool cursor
  updateBrushCursor();
  updateEraserCursor();
  updateTextCursor();
  updateImageCursor();
  setTool(tool, true); // Pass a flag to force re-applying the cursor
}

// ADDED: Function to load and apply the saved theme
function initializeTheme() {
  const savedTheme = localStorage.getItem('canvas-theme') || 'dark'; // Dark is default
  const isBright = savedTheme === 'bright';
  
  if (themeToggle) { // Ensure toggle exists
    themeToggle.checked = isBright;
  }
  
  // Set the theme class on load
  setTheme(savedTheme, false); 
  
  // Set the color picker's default based on the loaded theme
  if (isBright) {
    // MODIFIED: Bright mode default is RED
    colorPicker.value = '#FF4136'; // Red for bright mode
  } else {
    // MODIFIED: Dark mode default is BLACK
    colorPicker.value = '#000000'; // Black for dark mode
  }
  
  // Sync the internal color variable
  color = colorPicker.value;
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
    // Clear pending image preview if mouse leaves
    if (tool === 'image' || tool === 'eraser') {
        pts = [];
    }
    net.send('cursor', { x: -1, y: -1 }); 
  });

  window.addEventListener('resize', resizeCanvases);

  sizeInput.addEventListener('input', ()=> {
    size = Number(sizeInput.value);
    // ADDED: Update eraser cursor on size change
    updateEraserCursor();
  });
  colorPicker.addEventListener('input', ()=> {
    color = colorPicker.value;
    // REMOVED: Text cursor is now theme-based
    // updateTextCursor();
  });
  brushBtn.addEventListener('click', ()=> setTool('brush'));
  eraserBtn.addEventListener('click', ()=> setTool('eraser'));
  rectBtn.addEventListener('click', ()=> setTool('rect'));
  circleBtn.addEventListener('click', ()=> setTool('circle'));
  lineBtn.addEventListener('click', ()=> setTool('line'));
  undoBtn.addEventListener('click', doUndo);
  redoBtn.addEventListener('click', doRedo);
  clearBtn.addEventListener('click', doClear);
  saveBtn.addEventListener('click', ()=> {
    baseCtx.clearRect(0,0, baseCanvas.width, baseCanvas.height);
    baseCtx.drawImage(buffer, 0, 0);
    const dataUrl = baseCanvas.toDataURL('image/png');
    const a = document.createElement('a'); a.href = dataUrl; a.download = 'canvas.png'; a.click();
  });
  
  // ADDED: New tool handlers
  textBtn.addEventListener('click', () => setTool('text'));
  imageBtn.addEventListener('click', () => {
    // MODIFIED: Always trigger click, setTool will handle logic
    imageInput.click();
  });
  imageInput.addEventListener('change', handleImageUpload);
  
  // ADDED: Theme toggle listener
  themeToggle.addEventListener('change', () => {
    setTheme(themeToggle.checked ? 'bright' : 'dark', true); // Update picker on toggle
  });
}

// --- WebSocket Handlers ---
net.on('open', ()=> {});
net.on('joined', (payload) => {
  userId = payload.userId;
  window.canvasApp.userId = userId; // Expose userId
  username = payload.name || username;
  userColor = payload.color || userColor;
  
  // ADDED: Clear cursors when joining a new room
  cursors = {};
  
  if (payload.state) { 
    history = payload.state.slice(); 
    history.forEach(op => {
      op.id && seenOpIds.add(op.id);
      // ADDED: Preload images from history
      if (op.type === 'image' && !imageCache[op.payload.src]) {
        const img = new Image();
        img.onload = () => rebuildBufferFromHistory(); // Redraw when loaded
        img.src = op.payload.src;
        imageCache[op.payload.src] = img;
      }
    }); 
  }
  resizeCanvases();
  updateUsers(payload.users || []);
});
net.on('op', (op) => {
  if (!op || !op.id) return;
  if (seenOpIds.has(op.id)) return;
  seenOpIds.add(op.id);
  
  // ADDED: Preload images from incoming ops
  if (op.type === 'image' && !imageCache[op.payload.src]) {
    const img = new Image();
    img.onload = () => rebuildBufferFromHistory(); // Redraw when loaded
    img.src = op.payload.src;
    imageCache[op.payload.src] = img;
  }
  
  if (op.type === 'stroke-part') {
    const tmp = { payload: op.payload };
    drawStrokeOn(overlayCtx, tmp);
    setTimeout(()=> { 
        // A full rebuild isn't needed, just clear overlay
        // This might conflict with image preview, but stroke-part is temporary
    }, 120);
    return;
  }
  history.push(op);
  rebuildBufferFromHistory();
});
net.on('history', (h) => {
  if (!Array.isArray(h)) return;
  history = h.slice(); 
  history.forEach(op => {
    op.id && seenOpIds.add(op.id);
    // ADDED: Preload images from history
    if (op.type === 'image' && !imageCache[op.payload.src]) {
      const img = new Image();
      img.onload = () => rebuildBufferFromHistory(); // Redraw when loaded
      img.src = op.payload.src;
      imageCache[op.payload.src] = img;
    }
  });
  rebuildBufferFromHistory();
});
net.on('presence', (list) => updateUsers(list));
net.on('cursor', (c) => {
  if (!c || !c.userId) return;
  if (c.x < 0 || c.y < 0) {
    delete cursors[c.userId];
    return;
  }
  cursors[c.userId] = { x:c.x, y:c.y, color:c.color, name:c.name, _ts: Date.now() };
  setTimeout(()=> { const cur = cursors[c.userId]; if (cur && Date.now() - cur._ts > 5000) delete cursors[c.userId]; }, 7000);
});

// FIX for 'Date.Tnow' typo
net.on('pong', (t) => { const r = Date.now() - t; latencyEl.textContent = `Ping: ${r} ms`; });


// --- App Initialization ---
// MODIFIED: Added forceUpdate flag
function setTool(t, forceUpdate = false){
  // ADDED: Prevent recursion if tool is already active
  if (t === tool && !forceUpdate) return;
  
  // If switching away from text tool, submit any active text
  if (tool === 'text' && t !== 'text' && currentTextInput) {
    currentTextInput.input.blur();
  }
  // If switching away from image tool, clear pending image
  if (tool === 'image' && t !== 'image') {
    pendingImage = null;
    pendingImageDataUrl = null;
    pts = [];
  }
  
  // ADDED: If clicking 'image' but no image is loaded, trigger file dialog
  if (t === 'image' && !pendingImage) {
    imageInput.click();
    return; // Don't switch tool yet, handleImageUpload will do it
  }

  tool = t;
  // ADDED: textBtn and imageBtn to list
  [brushBtn, eraserBtn, rectBtn, circleBtn, lineBtn, textBtn, imageBtn].forEach(b => b.classList.toggle('active', false));
  
  const activeBtn = [brushBtn, eraserBtn, rectBtn, circleBtn, lineBtn, textBtn, imageBtn].find(b => b.id.startsWith(t));
  if (activeBtn) activeBtn.classList.add('active');

  // MODIFIED: Set cursor style based on tool
  if (t === 'brush') {
    // MODIFIED: Use dynamic cursor
    baseCanvas.style.cursor = `url("${brushCursorDataUrl}") 0 24, crosshair`;
  } else if (t === 'eraser') {
    // Use the dynamic eraser cursor
    updateEraserCursor();
  } else if (t === 'image') {
     // MODIFIED: Use dynamic cursor
     baseCanvas.style.cursor = `url("${imageCursorDataUrl}") 12 12, crosshair`;
  } else if (t === 'text') {
     // MODIFIED: Use dynamic cursor
     updateTextCursor();
  } else {
    baseCanvas.style.cursor = 'crosshair';
  }
}

window.canvasApp = {
  init: (opts) => {
    username = opts.name; 
    userColor = opts.color || userColor;
    // ADDED: Set room name
    roomName = opts.room || 'global';

    // MODIFIED: Initialize theme and set default color *before* anything else
    initializeTheme(); 
    
    // MODIFIED: Send room name to server
    net.send('join', { name: username, color: userColor, room: roomName });
    attachHandlers(); // This will now attach the toggle listener
    
    // REMOVED: Redundant setTool and cursor updates.
    // initializeTheme() -> setTheme() -> setTool(tool, true) handles all of it.
    
    setTimeout(resizeCanvases, 60);
    requestAnimationFrame(redrawOverlayPreview);
  },
  // ADDED: Expose current color and userId
  getCurrentColor: () => color,
  userId: null 
};