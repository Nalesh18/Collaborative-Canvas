// client/main.js
// This file is correct and the typo 'Date.Nopw' is already fixed.
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
    // --- FIX: Corrected typo from Date.Nopw() to Date.now() --- (This was already fixed in your file)
    net.send('ping', Date.now()); 
  }
}, 2000);

// presence
setInterval(()=> {
  const name = usernameInput.value.trim();
  const color = userColorInput.value;
  // Send presence updates even if not changed, acts as a heartbeat
  if (window.net && window.canvasApp.userId) { // Only send if joined
     net.send('presence', { name, color });
  }
}, 3000);