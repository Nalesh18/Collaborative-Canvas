const { DrawingState } = require('./drawing-state');

class RoomManager {
  constructor(){ this.rooms = new Map(); }

  /**
   * Ensures a room object exists in the map.
   * @param {string} room - The name of the room.
   */
  ensure(room){
    if (!this.rooms.has(room)) {
      this.rooms.set(room, { 
        state: new DrawingState(), 
        presence: new Map() 
      });
    }
  }

  pushOp(room, op){
    this.ensure(room); 
    this.rooms.get(room).state.pushOp(op);
  }

  getHistory(room){
    this.ensure(room); 
    return this.rooms.get(room).state.getState();
  }

  addPresence(room, id, payload){
    this.ensure(room); 
    this.rooms.get(room).presence.set(id, payload);
  }

  removePresence(room, id){
    this.ensure(room); 
    this.rooms.get(room).presence.delete(id);
  }

  listPresence(room){
    this.ensure(room); 
    return Array.from(this.rooms.get(room).presence.values());
  }

  // Find the last op for a specific user that can be undone
  findLastActiveOpForUser(room, userId){
    this.ensure(room); 
    return this.rooms.get(room).state.findLastActiveOpForUser(userId);
  }

  // Find the last undone op for a specific user that can be redone
  findLastUndoneOpForUser(room, userId){
    this.ensure(room); 
    return this.rooms.get(room).state.findLastUndoneOpForUser(userId);
  }
}

module.exports = { RoomManager };