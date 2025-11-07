class DrawingState {
  constructor(){ 
    this.ops = []; 
  }

  pushOp(op){
    if (!op || !op.type) return;
    // Prevent duplicate ops
    if (op.id && this.ops.some(o => o.id === op.id)) return;
    this.ops.push(op);
  }

  getState(){ 
    return this.ops.slice(); 
  }

  // Finds the last op for a *specific user* that is currently "active"
  // (i.e., not undone)
  findLastActiveOpForUser(userId){
    for (let i = this.ops.length -1; i>=0; i--){
      const op = this.ops[i];
      // Check for user ID match on a drawable operation
      if ((op.type === 'stroke' || op.type === 'shape') && op.userId === userId){
        
        // Count undos/redos targeting this op
        const undoneCount = this.ops.slice(i+1).filter(x => x.type === 'undo' && x.payload && x.payload.target === op.id).length;
        const redoCount = this.ops.slice(i+1).filter(x => x.type === 'redo' && x.payload && x.payload.target === op.id).length;
        
        // If (undone - redo) is even (0, 2, ...), it's considered active
        if ((undoneCount - redoCount) % 2 === 0) {
          return op.id;
        }
      }
    }
    return null; // No active op found
  }

  // Finds the last op for a *specific user* that is currently "undone"
  findLastUndoneOpForUser(userId){
    for (let i = this.ops.length -1; i>=0; i--){
      const op = this.ops[i];
      // Check for user ID match on a drawable operation
      if ((op.type === 'stroke' || op.type === 'shape') && op.userId === userId){
        
        // Count undos/redos targeting this op
        const undoneCount = this.ops.slice(i+1).filter(x => x.type === 'undo' && x.payload && x.payload.target === op.id).length;
        const redoCount = this.ops.slice(i+1).filter(x => x.type === 'redo' && x.payload && x.payload.target === op.id).length;
        
        // If (undone - redo) is odd (1, 3, ...), it's considered undone
        if ((undoneCount - redoCount) % 2 === 1) {
          return op.id;
        }
      }
    }
    return null; // No undone op found
  }
}

module.exports = { DrawingState };