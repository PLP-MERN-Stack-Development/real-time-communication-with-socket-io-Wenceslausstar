// server.js - Main server file for Socket.io chat application

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Store connected users and messages (in-memory mirrors persisted storage)
const users = {};
const typingUsers = {};

const storage = require("./utils/storage");
// messages will be loaded from storage on demand; keep an in-memory reference for fast access
let messages = [];

// load persisted messages on startup
(async () => {
  try {
    messages = await storage.getMessages();
    console.log(`Loaded ${messages.length} messages from storage`);
  } catch (err) {
    console.error("Failed to load persisted messages", err);
    messages = [];
  }
})();

// Socket.io connection handler
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle user joining
  socket.on("user_join", (username) => {
    users[socket.id] = { username, id: socket.id };
    io.emit("user_list", Object.values(users));
    io.emit("user_joined", { username, id: socket.id });
    console.log(`${username} joined the chat`);
  });

  // Handle chat messages
  socket.on("send_message", (messageData) => {
    const message = {
      ...messageData,
      id: Date.now(),
      sender: users[socket.id]?.username || "Anonymous",
      senderId: socket.id,
      timestamp: new Date().toISOString(),
    };
    // persist and update in-memory
    storage
      .addMessage(message)
      .then(() => {
        messages.push(message);
        if (messages.length > 100) messages.shift();
      })
      .catch((err) => console.error("Failed to persist message", err));

    io.emit("receive_message", message);
  });

  // Handle typing indicator
  socket.on("typing", (isTyping) => {
    if (users[socket.id]) {
      const username = users[socket.id].username;

      if (isTyping) {
        typingUsers[socket.id] = username;
      } else {
        delete typingUsers[socket.id];
      }

      io.emit("typing_users", Object.values(typingUsers));
    }
  });

  // Handle private messages
  socket.on("private_message", ({ to, message }) => {
    const messageData = {
      id: Date.now(),
      sender: users[socket.id]?.username || "Anonymous",
      senderId: socket.id,
      message,
      timestamp: new Date().toISOString(),
      isPrivate: true,
    };
    // persist private message as well
    storage
      .addMessage(messageData)
      .then(() => {
        messages.push(messageData);
        if (messages.length > 100) messages.shift();
      })
      .catch((err) => console.error("Failed to persist private message", err));

    socket.to(to).emit("private_message", messageData);
    socket.emit("private_message", messageData);
  });

  // Handle read receipts from clients (socket event)
  socket.on("message_read", async ({ messageId }) => {
    try {
      const receipts = await storage.markMessageRead(
        String(messageId),
        socket.id
      );
      // broadcast new read receipt info to clients (could be scoped to room/user)
      io.emit("read_receipt", { messageId: String(messageId), receipts });
    } catch (err) {
      console.error("Failed to mark message read", err);
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    if (users[socket.id]) {
      const { username } = users[socket.id];
      io.emit("user_left", { username, id: socket.id });
      console.log(`${username} left the chat`);
    }

    delete users[socket.id];
    delete typingUsers[socket.id];

    io.emit("user_list", Object.values(users));
    io.emit("typing_users", Object.values(typingUsers));
  });
});

// API routes
app.get("/api/messages", (req, res) => {
  // return persisted messages (fresh read)
  storage
    .getMessages()
    .then((msgs) => res.json(msgs))
    .catch((err) => {
      console.error("Failed to read messages", err);
      res.status(500).json({ error: "Failed to read messages" });
    });
});

app.get("/api/users", (req, res) => {
  res.json(Object.values(users));
});

app.get("/api/read-receipts", (req, res) => {
  storage
    .getReadReceipts()
    .then((r) => res.json(r))
    .catch((err) => {
      console.error("Failed to read receipts", err);
      res.status(500).json({ error: "Failed to read receipts" });
    });
});

// Root route
app.get("/", (req, res) => {
  res.send("Socket.io Chat Server is running");
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };
