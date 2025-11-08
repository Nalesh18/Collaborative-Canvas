# 🎨 Real-Time Collaborative Canvas

A **multi-user collaborative drawing application** that enables multiple participants to draw together on a shared canvas — in **real-time**, without using any external frameworks or drawing libraries.

---

## 🚀 Project Overview

This project demonstrates **real-time synchronization**, **state management**, and **Canvas API mastery** through a clean and minimal implementation.
Each connected user can draw, erase, and manage strokes collaboratively across a shared workspace.

---

## 🧠 Core Features

### ✏️ Drawing Tools

* Brush and eraser with adjustable **stroke width**
* **Color palette** selection
* **Undo / Redo** support (global across users)
* **Shape drawing** (rectangle, circle, line)

### ⚡ Real-Time Synchronization

* Instant drawing updates for all connected users
* Smooth cursor motion with **60 FPS rendering**
* Conflict-free synchronization using **operation queues**

### 👥 Multi-User Collaboration

* Multiple users drawing simultaneously
* Unique colors for each user
* Online user tracking
* Room-based isolation (optional)

### 💾 No Database Required

* Fully in-memory drawing state management
* Lightweight Node.js + WebSocket architecture

---

## 🏗️ Tech Stack

| Layer         | Technology                              |
| ------------- | --------------------------------------- |
| **Frontend**  | HTML5, CSS3, Vanilla JS (no frameworks) |
| **Backend**   | Node.js (Express + WebSocket)           |
| **Protocol**  | WebSocket message streaming             |
| **Rendering** | HTML5 Canvas API                        |

---

## 🧩 Folder Structure

```
collaborative-canvas/
├── client/
│   ├── index.html
│   ├── style.css
│   ├── canvas.js
│   ├── websocket.js
│   └── main.js
├── server/
│   ├── server.js
│   ├── rooms.js
│   └── drawing-state.js
├── package.json
├── README.md
└── ARCHITECTURE.md
```

---

## ⚙️ Setup Instructions (Local)

### **1. Clone the Repository**

```bash
git clone https://github.com/<your-username>/collaborative-canvas.git
cd collaborative-canvas
```

### **2. Install Dependencies**

```bash
npm install
```

### **3. Start the Server**

```bash
npm start
```

### **4. Open the Client**

Open your browser and navigate to:

```
http://localhost:3000
```

To test collaboration, open **two different browser tabs** or devices and draw simultaneously.

---

## 🌐 Deployment Instructions

### **Deploy on Render**

1. Push your code to GitHub.
2. Go to [Render.com](https://render.com) → Create a **New Web Service**.
3. Connect your GitHub repo.
4. Set:

   * **Build Command:** `npm install`
   * **Start Command:** `npm start`
5. Wait for deployment and open your live URL.

### **Deploy on Railway**

1. Visit [Railway.app](https://railway.app).
2. Create a new project → Deploy from GitHub.
3. Configure environment:

   * No database required.
4. Deploy — it will automatically assign a live domain.

### **Deploy Locally via Node**

If you want to expose locally using ngrok:

```bash
npm install -g ngrok
npm start
ngrok http 3000
```

Share the generated **public URL** to connect from different devices.

---

## 🧪 Testing Instructions

* Open two or more browser tabs with your deployed app link.
* Try:

  * Drawing simultaneously on both screens.
  * Using different tools.
  * Performing **undo/redo** and verifying synchronization.
  * Observing **cursor indicators** for other users.

---

## ⚙️ Known Limitations

* No persistent storage.
* Global undo/redo can occasionally desync during rapid events.
* Touch support for mobile devices is experimental.

---

## 📘 Time Spent

Approx. **4 days** (including testing, integration, and deployment).

---

## 📄 License

This project is open-source under the **MIT License**.

---

## 👤 Author

**Developed by:** Nalesh Kumar B

**GitHub:** @Nalesh18

**Email:** nalesh.nk18@gmail.com

---

**Ready to collaborate, draw, and build — together!**
