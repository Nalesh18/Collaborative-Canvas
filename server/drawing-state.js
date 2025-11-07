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

  // --- THIS FUNCTION IS MODIFIED ---
  // Finds the last op for a *specific user* that is currently "active"
  findLastActiveOpForUser(userId){
    for (let i = this.ops.length -1; i>=0; i--){
      const op = this.ops[i];
      // MODIFIED: Added 'image' and 'text' as drawable operations
      if ((op.type === 'stroke' || op.type === 'shape' || op.type === 'image' || op.type === 'text') && op.userId === userId){
        
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

  // --- THIS FUNCTION IS CORRECTED ---
  // Finds the target of the *most recent 'undo' operation* by a user
  // that is eligible to be "redone".
  findLastUndoneOpForUser(userId){
    // Iterate backwards through the entire history to find 'undo' ops by this user
    for (let i = this.ops.length - 1; i >= 0; i--) {
      const op = this.ops[i];

      // We only care about this user's 'undo' actions
      if (op.type === 'undo' && op.userId === userId) {
        const targetId = op.payload.target;
        if (!targetId) continue; // Malformed undo op

        // Now, we must check if this target is *still* in an undone state.
        // Find the original operation that was undone.
        const targetOpIndex = this.ops.findIndex(o => o.id === targetId);
        if (targetOpIndex === -1) continue; // Original op not found

        // Count *all* undos and redos for this target *after* it was created
        const opsAfter = this.ops.slice(targetOpIndex + 1);
        const undoneCount = opsAfter.filter(x => x.type === 'undo' && x.payload && x.payload.target === targetId).length;
        const redoCount = opsAfter.filter(x => x.type === 'redo' && x.payload && x.payload.target === targetId).length;

        // If the balance is odd (1, 3, ...), it's "undone" and can be redone.
        if ((undoneCount - redoCount) % 2 === 1) {
          return targetId; // This is the correct op to redo
        }
        
        // If the balance is even, it means this 'undo' was *already* redone.
        // So, we continue our loop backwards to find the *previous* 'undo' op.
      }
    }
    return null; // No eligible undo op found
  }
}

module.exports = { DrawingState };