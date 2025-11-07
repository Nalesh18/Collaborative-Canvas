const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { RoomManager } = require('./rooms');

const rooms = new RoomManager();
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// Serve the client files
app.use(express.static(path.join(__dirname, '..', 'client')));
app.get('/_health', (req,res) => res.send('ok'));

// Handle WebSocket upgrades
server.on('upgrade', (request, socket, head) => {
  if (request.url === '/ws') {
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request));
  } else {
    socket.destroy();
  }
});

// Helper to safely send to a WebSocket
function send(ws, type, payload){ 
  try { 
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload })); 
    }
  } catch(e){
    console.error('Send error:', e);
  } 
}

// Map of active clients (ws -> metadata)
const clients = new Map(); 

function broadcast(type, payload, except = null) {
  for (const [ws, meta] of clients) {
    if (ws !== except) {
      send(ws, type, payload);
    }
  }
}

wss.on('connection', (ws) => {
  const id = uuidv4();
  clients.set(ws, { id, name: null, color: null });
  console.log(`Client ${id} connected`);

  // Send history immediately (empty if new)
  send(ws, 'history', rooms.getHistory('global'));

  ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch(e){ return; }
    
    const { type, payload } = msg;
    const meta = clients.get(ws);
    if (!meta) return;

    if (type === 'join') {
      meta.name = payload.name || `User-${id.slice(0,4)}`;
      meta.color = payload.color || '#e63946';
      rooms.addPresence('global', meta.id, { id: meta.id, name: meta.name, color: meta.color });
      
      send(ws, 'joined', { 
        userId: meta.id, 
        name: meta.name, 
        color: meta.color, 
        users: rooms.listPresence('global'), 
        state: rooms.getHistory('global') 
      });
      
      broadcast('presence', rooms.listPresence('global'));
    
    } else if (type === 'op') {
      const op = payload;
      if (!op) return;
      if (!op.id) op.id = uuidv4();
      if (!op.userId) op.userId = meta.id;
      
      if (op.type === 'stroke-part') {
        broadcast('op', op, ws); // Send preview to others
      } else {
        // This includes 'stroke', 'shape', 'clear', and 'clear-user'
        rooms.pushOp('global', op);
        broadcast('op', op); // Send finalized op to EVERYONE
      }

    } else if (type === 'undo') {
      // Find *this user's* last operation
      const targetId = rooms.findLastActiveOpForUser('global', meta.id);
      if (targetId) {
        const undoOp = { id: uuidv4(), type: 'undo', userId: meta.id, payload: { target: targetId } };
        rooms.pushOp('global', undoOp);
        broadcast('op', undoOp);
      }
    
    } else if (type === 'redo') {
      // Find *this user's* last undone operation
      const targetId = rooms.findLastUndoneOpForUser('global', meta.id);
      if (targetId) {
        const redoOp = { id: uuidv4(), type: 'redo', userId: meta.id, payload: { target: targetId } };
        rooms.pushOp('global', redoOp);
        broadcast('op', redoOp);
      }
    
    } else if (type === 'cursor') {
      const c = payload; c.userId = meta.id; c.color = meta.color; c.name = meta.name;
      broadcast('cursor', c, ws);
    
    } else if (type === 'ping') {
      send(ws, 'pong', payload);
    
    } else if (type === 'presence') {
      // Heartbeat presence update
      if (payload.name) meta.name = payload.name;
      if (payload.color) meta.color = payload.color;
      rooms.addPresence('global', meta.id, { id: meta.id, name: meta.name, color: meta.color });
      broadcast('presence', rooms.listPresence('global'));
    }
  });

  ws.on('close', () => {
    const meta = clients.get(ws);
    if (meta) {
      console.log(`Client ${meta.id} disconnected`);
      rooms.removePresence('global', meta.id);
    }
    clients.delete(ws);
    broadcast('presence', rooms.listPresence('global'));
  });
  
  ws.on('error', (err) => {
    console.error("WS Error:", err);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log(`Server listening on port ${PORT}`));