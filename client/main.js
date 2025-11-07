// client/main.js
const loginModal = document.getElementById('loginModal');
const usernameInput = document.getElementById('usernameInput');
const userColorInput = document.getElementById('userColorInput');
const joinBtn = document.getElementById('joinBtn');

joinBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim() || ('User' + Math.floor(Math.random()*900+100));
  const color = userColorInput.value || '#e63946';
  
  // Add class to trigger fade-out animation
  loginModal.classList.add('hidden');
  // Wait for animation to finish before hiding
  setTimeout(() => {
    loginModal.style.display = 'none';
  }, 300); // Must match animation duration
  
  window.canvasApp.init({ name, color });
});

// Allow joining with "Enter" key
usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    joinBtn.click();
  }
});

// ping loop
setInterval(()=> { 
  if (window.net && window.canvasApp.userId) {
    net.send('ping', Date.now()); 
  }
}, 2000);

// presence
setInterval(()=> {
  // Only send if joined
  if (window.net && window.canvasApp.userId) {
    const name = usernameInput.value.trim();
    
    // MODIFIED: Get the *live* brush color from canvas.js if app is running
    let color = userColorInput.value; // Default to modal color
    if (window.canvasApp && typeof window.canvasApp.getCurrentColor === 'function') {
      color = window.canvasApp.getCurrentColor();
    }
    
    // Send presence updates even if not changed, acts as a heartbeat
     net.send('presence', { name, color });
  }
}, 3000); // This interval now updates the user's cursor color