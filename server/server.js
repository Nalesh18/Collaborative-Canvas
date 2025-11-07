const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
// Assuming rooms.js is in the same directory
const { RoomManager } = require('./rooms'); 

const rooms = new RoomManager();
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// Serve the client files (assuming client is one level up, in a 'client' folder)
// MODIFIED: This path now correctly points to the 'client' directory
app.use(express.static(path.join(__dirname, '..', 'client')));
app.get('/_health', (req,res) => res.send('ok'));

// Handle WebSocket upgrades
server.on('upgrade', (request, socket, head) => {
  // Simple path check
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  
  if (pathname === '/ws') {
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

// MODIFIED: Broadcast function is now room-aware
function broadcast(room, type, payload, except = null) {
  if (!room) return; // Don't broadcast if room is invalid
  for (const [ws, meta] of clients) {
    if (meta.room === room && ws !== except) {
      send(ws, type, payload);
    }
  }
}

wss.on('connection', (ws) => {
  const id = uuidv4();
  // MODIFIED: Add room property to client metadata
  clients.set(ws, { id, name: null, color: null, room: null });
  console.log(`Client ${id} connected`);

  // REMOVED: Don't send history on connect, send it on join
  // send(ws, 'history', rooms.getHistory('global'));

  ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch(e){ return; }
    
    const { type, payload } = msg;
    const meta = clients.get(ws);
    if (!meta) return;

    if (type === 'join') {
      meta.name = payload.name || `User-${id.slice(0,4)}`;
      meta.color = payload.color || '#e63946';
      // MODIFIED: Set the client's room
      meta.room = payload.room || 'global';
      
      // MODIFIED: Use the client's room
      rooms.addPresence(meta.room, meta.id, { id: meta.id, name: meta.name, color: meta.color });
      
      console.log(`Client ${id} joined room ${meta.room}`);
      
      send(ws, 'joined', { 
        userId: meta.id, 
        name: meta.name, 
        color: meta.color, 
        // MODIFIED: Send users and state for the specific room
        users: rooms.listPresence(meta.room), 
        state: rooms.getHistory(meta.room) 
      });
      
      // MODIFIED: Broadcast presence only to the client's room
      broadcast(meta.room, 'presence', rooms.listPresence(meta.room));
    
    } else if (type === 'op') {
      // Ensure user is in a room before processing ops
      if (!meta.room) return;
      
      const op = payload;
      if (!op) return;
      if (!op.id) op.id = uuidv4();
      if (!op.userId) op.userId = meta.id;
      
      if (op.type === 'stroke-part') {
        // MODIFIED: Broadcast preview only to the room
        broadcast(meta.room, 'op', op, ws); 
      } else {
        // This includes 'stroke', 'shape', 'clear-user', 'image', 'text'
        // MODIFIED: Push op to the correct room
        rooms.pushOp(meta.room, op);
        // MODIFIED: Broadcast finalized op only to the room
        broadcast(meta.room, 'op', op); 
      }

    } else if (type === 'undo') {
      if (!meta.room) return;
      // MODIFIED: Find op in the correct room
      const targetId = rooms.findLastActiveOpForUser(meta.room, meta.id);
      if (targetId) {
        const undoOp = { id: uuidv4(), type: 'undo', userId: meta.id, payload: { target: targetId } };
        // MODIFIED: Push and broadcast to the correct room
        rooms.pushOp(meta.room, undoOp);
        broadcast(meta.room, 'op', undoOp);
      }
    
    } else if (type === 'redo') {
      if (!meta.room) return;
      // MODIFIED: Find op in the correct room
      const targetId = rooms.findLastUndoneOpForUser(meta.room, meta.id);
      if (targetId) {
        const redoOp = { id: uuidv4(), type: 'redo', userId: meta.id, payload: { target: targetId } };
        // MODIFIED: Push and broadcast to the correct room
        rooms.pushOp(meta.room, redoOp);
        broadcast(meta.room, 'op', redoOp);
      }
    
    } else if (type === 'cursor') {
      if (!meta.room) return;
      const c = payload; c.userId = meta.id; c.color = meta.color; c.name = meta.name;
      // MODIFIED: Broadcast cursor only to the room
      broadcast(meta.room, 'cursor', c, ws);
    
    } else if (type === 'ping') {
      send(ws, 'pong', payload);
    
    } else if (type === 'presence') {
      if (!meta.room) return;
      // Heartbeat presence update
      if (payload.name) meta.name = payload.name;
      if (payload.color) meta.color = payload.color;
      // MODIFIED: Update presence in the correct room
      rooms.addPresence(meta.room, meta.id, { id: meta.id, name: meta.name, color: meta.color });
      // MODIFIED: Broadcast presence only to the room
      broadcast(meta.room, 'presence', rooms.listPresence(meta.room));
    }
  });

  ws.on('close', () => {
    const meta = clients.get(ws);
    // MODIFIED: Check if user was in a room before broadcasting
    if (meta && meta.room) {
      console.log(`Client ${meta.id} disconnected from room ${meta.room}`);
      // MODIFIED: Remove presence from the correct room
      rooms.removePresence(meta.room, meta.id);
      // MODIFIED: Broadcast presence update only to that room
      broadcast(meta.room, 'presence', rooms.listPresence(meta.room));
    } else if (meta) {
      console.log(`Client ${meta.id} disconnected (was not in a room)`);
    }
    clients.delete(ws);
  });
  
  ws.on('error', (err) => {
    console.error("WS Error:", err);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log(`Server listening on port ${PORT}`));