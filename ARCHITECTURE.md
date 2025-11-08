# 🏗️ ARCHITECTURE.md

## **Collaborative Canvas – Real-Time Multiuser Drawing Application**

---

## 🧩 **1. System Overview**

Collaborative Canvas is a real-time web-based application that allows multiple users to draw simultaneously on a shared canvas. It is designed to provide smooth synchronization, global undo/redo functionality, and an intuitive user interface without relying on heavy frontend frameworks.

---

## ⚙️ **2. High-Level Architecture**

The system follows a **client-server architecture** using **WebSockets** for bi-directional communication.

```
 ┌──────────────────┐        WebSocket       ┌───────────────────┐
 │    Client A      │ <--------------------> │     Node.js       │
 │ (Canvas + JS)    │                        │   (ws + express)  │
 └──────────────────┘                        └───────────────────┘
           ▲                                           ▲
           │                                           │
           │                                           │
           ▼                                           ▼
 ┌──────────────────┐                        ┌──────────────────┐
 │    Client B      │ <--------------------> │   Shared State   │
 │ (Canvas + JS)    │                        │  (Drawing, Users)│
 └──────────────────┘                        └──────────────────┘
```

---

## 🖌️ **3. Data Flow**

1. **User draws on canvas** → client captures mouse/touch events (x, y, color, size, tool).
2. **Event sent via WebSocket** → serialized JSON payload sent to the server.
3. **Server receives event** → broadcasts it to all connected clients (except originator).
4. **Clients update canvas** → real-time drawing is rendered locally.
5. **Undo/Redo events** → propagated globally, updating all connected clients consistently.

---

## 💬 **4. WebSocket Message Protocol**

Each message exchanged between client and server uses a structured JSON format:

```json
{
  "type": "draw" | "erase" | "undo" | "redo" | "cursor" | "user_join" | "user_leave",
  "userId": "uuid",
  "roomId": "default",
  "data": { "x": 100, "y": 200, "color": "#000000", "size": 5, "tool": "brush" },
  "timestamp": 1730976000
}
```

**Message Types:**

| Type                       | Description                                    |
| -------------------------- | ---------------------------------------------- |
| `draw`                     | Continuous stroke data while user draws        |
| `erase`                    | Removes pixels from canvas                     |
| `undo` / `redo`            | Global undo/redo event across users            |
| `cursor`                   | Tracks cursor position of each active user     |
| `user_join` / `user_leave` | Notifies others when user connects/disconnects |

---

## 🧠 **5. Undo/Redo Strategy**

Undo/redo is handled using a **global operation stack** stored server-side.

### **Structure:**

```js
drawingHistory = [
  { id: "uuid1", user: "userA", action: "draw", path: [...] },
  { id: "uuid2", user: "userB", action: "erase", area: [...] },
];
undoneHistory = [];
```

* When a user draws, the stroke is stored in `drawingHistory`.
* When undo is triggered, the latest stroke is moved to `undoneHistory` and a broadcast is sent to all clients to redraw the canvas.
* Redo reverses this process.
* Clients listen for `undo`/`redo` events and reconstruct the canvas from history arrays.

This ensures **global consistency** across all users.

---

## 🌐 **6. Real-Time Synchronization**

* Each drawing stroke is transmitted in **batches** (every few milliseconds) instead of per-pixel to reduce network overhead.
* The client applies **client-side prediction** — rendering locally before confirmation — for smooth UX.
* The server ensures **order preservation** using timestamps and message sequencing.

---

## 👥 **7. User Management**

Each user gets:

* A **unique UUID** assigned by the server.
* A **distinct cursor color**.
* A display name generated locally or prompted.

The server maintains an active user list and notifies others when someone joins or leaves.

---

## 🪄 **8. Performance Considerations**

| Optimization          | Description                                        |
| --------------------- | -------------------------------------------------- |
| **FPS Lock (60Hz)**   | Canvas rendering capped at 60 FPS                  |
| **Batching**          | Draw events grouped to reduce WebSocket load       |
| **Efficient Redraw**  | Redraw only changed regions instead of full canvas |
| **Compression**       | JSON message compression for large payloads        |
| **Memory Management** | Stale history entries cleared periodically         |

---

## 🧱 **9. File Structure**

```
collaborative-canvas/
├── client/
│   ├── index.html           # UI layout and canvas element
│   ├── style.css            # UI styling and layout
│   ├── canvas.js            # Handles drawing, erasing, and rendering
│   ├── websocket.js         # WebSocket client-side logic
│   └── main.js              # Initialization and event binding
├── server/
│   ├── server.js            # Express + WebSocket server setup
│   ├── rooms.js             # Room and user session management
│   └── drawing-state.js     # Handles drawing history and undo/redo
├── package.json
├── README.md
└── ARCHITECTURE.md
```

---

## 🚀 **10. Deployment Strategy**

### **For Local Development**

```bash
npm install
npm start
```

Then open `http://localhost:3000` in multiple browser tabs to test real-time sync.

### **For Production (Render / Railway / Vercel)**

1. Push your code to GitHub:

   ```bash
   git add .
   git commit -m "Deploy-ready build"
   git push
   ```

2. Deploy using Render:

   * Visit [Railway.app](https://railway.app).
   * Create a new project → Deploy from GitHub.
   * Configure environment:

         * No database required.
   * Deploy — it will automatically assign a live domain.

3. Once deployed, open the live URL in two browsers to verify global sync.

---

## 🧾 **11. Known Limitations**

* Minor latency under high load due to batching.
* Global undo/redo may conflict if multiple users undo simultaneously.
* No database persistence — drawings are lost on server restart.
* Limited mobile support.

---

## 🧠 **12. Future Enhancements**

* Canvas persistence with Redis or MongoDB.
* Touch gesture support.
* Custom shapes and text tools.
* Replay feature (view timeline of drawing).
* Optimized compression using binary WebSocket frames.

---

**Author:** Nalesh Kumar B
**Repository:** [Collaborative-Canvas](https://github.com/Nalesh18/Collaborative-Canvas)
