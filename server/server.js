// server.js - Main server file for Socket.io chat application

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const jwt = require("jsonwebtoken");
const multer = require("multer");

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

// Use namespaces for better organization
const chatNamespace = io.of("/chat");

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Configure multer for file uploads
const storageConfig = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "uploads"));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storageConfig,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|txt|doc|docx/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  },
});

// JWT secret key
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Store connected users and messages (in-memory mirrors persisted storage)
const users = {};
const typingUsers = {};
const rooms = {}; // { roomName: { socketId: user } }

const storage = require("./utils/storage");
// messages will be loaded from storage on demand; keep an in-memory reference for fast access
let messages = [];
let availableRooms = [];

// load persisted messages and rooms on startup
(async () => {
  try {
    messages = await storage.getMessages();
    availableRooms = await storage.getRooms();
    console.log(`Loaded ${messages.length} messages from storage`);
    console.log(`Available rooms: ${availableRooms.join(", ")}`);
  } catch (err) {
    console.error("Failed to load persisted data", err);
    messages = [];
    availableRooms = ["general"];
  }
})();

// Socket.io connection handler
chatNamespace.use((socket, next) => {
  console.log(
    `[DEBUG] Socket middleware: ${socket.id}, auth:`,
    socket.handshake.auth
  );
  const token = socket.handshake.auth.token;
  if (!token) {
    console.log(`[DEBUG] No token provided for socket ${socket.id}`);
    return next(new Error("Authentication error"));
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      console.log(
        `[DEBUG] Token verification failed for socket ${socket.id}:`,
        err.message
      );
      return next(new Error("Authentication error"));
    }
    socket.username = decoded.username;
    console.log(
      `[DEBUG] Authenticated socket ${socket.id} as ${socket.username}`
    );
    next();
  });
});

chatNamespace.on("connection", (socket) => {
  console.log(`User connected: ${socket.id} (${socket.username})`);

  // Handle user joining
  socket.on("user_join", (username, room = "general") => {
    // Use authenticated username from JWT, but allow override if provided
    const authenticatedUsername = socket.username || username;
    users[socket.id] = { username: authenticatedUsername, id: socket.id, room };
    socket.join(room);
    if (!rooms[room]) rooms[room] = {};
    rooms[room][socket.id] = users[socket.id];

    io.to(room).emit("user_list", Object.values(rooms[room]));
    io.to(room).emit("user_joined", {
      username: authenticatedUsername,
      id: socket.id,
    });
    io.to(room).emit("user_status", { userId: socket.id, status: "online" });
    socket.emit("room_joined", room);
    console.log(`${authenticatedUsername} joined room: ${room}`);
  });

  // Handle room switching
  socket.on("switch_room", (newRoom) => {
    if (!users[socket.id]) return;
    const user = users[socket.id];
    const oldRoom = user.room;

    // Leave old room
    socket.leave(oldRoom);
    delete rooms[oldRoom][socket.id];
    io.to(oldRoom).emit("user_list", Object.values(rooms[oldRoom]));
    io.to(oldRoom).emit("user_left", {
      username: user.username,
      id: socket.id,
    });

    if (!availableRooms.includes(newRoom)) {
      availableRooms.push(newRoom);
      storage.addRoom(newRoom);
    }

    // Join new room
    user.room = newRoom;
    socket.join(newRoom);
    if (!rooms[newRoom]) rooms[newRoom] = {};
    rooms[newRoom][socket.id] = user;

    io.to(newRoom).emit("user_list", Object.values(rooms[newRoom]));
    io.to(newRoom).emit("user_joined", {
      username: user.username,
      id: socket.id,
    });
    socket.emit("room_joined", newRoom);
    console.log(`${user.username} switched to room: ${newRoom}`);
  });

  // Handle chat messages
  socket.on("send_message", (messageData, callback) => {
    // Only allow authenticated users to send messages
    if (!users[socket.id]) {
      return (
        callback && callback({ success: false, error: "Not authenticated" })
      );
    }
    const user = users[socket.id];
    const message = {
      ...messageData,
      id: Date.now(),
      sender: user.username || "Anonymous",
      senderId: socket.id,
      roomId: user.room,
      timestamp: new Date().toISOString(),
    };
    // persist and update in-memory
    storage
      .addMessage(message)
      .then(() => {
        messages.push(message);
        if (messages.length > 100) messages.shift();
        // Emit delivery acknowledgment
        callback && callback({ success: true, messageId: message.id });
        io.to(user.room).emit("receive_message", message);
      })
      .catch((err) => {
        console.error("Failed to persist message", err);
        callback &&
          callback({ success: false, error: "Failed to persist message" });
      });
  });

  // Handle file messages
  socket.on("send_file", (fileData) => {
    if (!users[socket.id]) return;
    const user = users[socket.id];
    const message = {
      id: Date.now(),
      sender: user.username || "Anonymous",
      senderId: socket.id,
      roomId: user.room,
      timestamp: new Date().toISOString(),
      file: fileData,
      message: `Shared a file: ${fileData.filename}`,
    };
    storage
      .addMessage(message)
      .then(() => {
        messages.push(message);
        if (messages.length > 100) messages.shift();
      })
      .catch((err) => console.error("Failed to persist file message", err));

    io.to(user.room).emit("receive_message", message);
  });

  // Handle typing indicator
  socket.on("typing", (isTyping) => {
    // Only allow authenticated users to show typing indicators
    if (users[socket.id]) {
      const username = users[socket.id].username;
      const room = users[socket.id].room;

      if (isTyping) {
        typingUsers[socket.id] = username;
      } else {
        delete typingUsers[socket.id];
      }

      io.to(room).emit("typing_users", Object.values(typingUsers));
    }
  });

  // Handle private messages
  socket.on("private_message", ({ to, message }) => {
    // Only allow authenticated users to send private messages
    if (!users[socket.id]) {
      return;
    }
    const user = users[socket.id];
    const messageData = {
      id: Date.now(),
      sender: user.username || "Anonymous",
      senderId: socket.id,
      message,
      roomId: user.room,
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
    // Only allow authenticated users to mark messages as read
    if (!users[socket.id]) {
      return;
    }
    try {
      const receipts = await storage.markMessageRead(
        String(messageId),
        socket.id
      );
      // broadcast new read receipt info to clients (scoped to room)
      const room = users[socket.id].room;
      io.to(room).emit("read_receipt", {
        messageId: String(messageId),
        receipts,
      });
    } catch (err) {
      console.error("Failed to mark message read", err);
    }
  });

  // Handle message reactions
  socket.on("add_reaction", async ({ messageId, reaction }) => {
    if (!users[socket.id]) return;
    try {
      await storage.addReaction(String(messageId), socket.id, reaction);
      const room = users[socket.id].room;
      io.to(room).emit("reaction_added", {
        messageId: String(messageId),
        reaction,
        userId: socket.id,
      });
    } catch (err) {
      console.error("Failed to add reaction", err);
    }
  });

  socket.on("remove_reaction", async ({ messageId, reaction }) => {
    if (!users[socket.id]) return;
    try {
      await storage.removeReaction(String(messageId), socket.id, reaction);
      const room = users[socket.id].room;
      io.to(room).emit("reaction_removed", {
        messageId: String(messageId),
        reaction,
        userId: socket.id,
      });
    } catch (err) {
      console.error("Failed to remove reaction", err);
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    if (users[socket.id]) {
      const { username, room } = users[socket.id];
      io.to(room).emit("user_left", { username, id: socket.id });
      io.to(room).emit("user_status", { userId: socket.id, status: "offline" });
      console.log(`${username} left the chat`);

      delete rooms[room][socket.id];
      io.to(room).emit("user_list", Object.values(rooms[room]));
    }

    delete users[socket.id];
    delete typingUsers[socket.id];

    // Note: typing_users is global, but we can keep it for now or make it room-specific later
    io.emit("typing_users", Object.values(typingUsers));
  });
});

// Login endpoint to generate JWT
app.post("/api/login", (req, res) => {
  const { username } = req.body;
  if (
    !username ||
    typeof username !== "string" ||
    username.trim().length === 0
  ) {
    return res.status(400).json({ error: "Valid username required" });
  }

  const trimmedUsername = username.trim();
  const token = jwt.sign({ username: trimmedUsername }, JWT_SECRET, {
    expiresIn: "24h",
  });

  res.json({ token, username: trimmedUsername });
});

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

// API routes
app.get("/api/messages", authenticateToken, (req, res) => {
  const { limit = 50, offset = 0, roomId, search } = req.query;
  const limitNum = parseInt(limit, 10);
  const offsetNum = parseInt(offset, 10);

  // return persisted messages (fresh read) with pagination and search
  storage
    .getMessages()
    .then((msgs) => {
      let filteredMsgs = msgs;
      if (roomId) {
        filteredMsgs = msgs.filter(
          (m) => m.roomId === roomId || (!m.roomId && roomId === "general")
        );
      }
      if (search) {
        const searchLower = search.toLowerCase();
        filteredMsgs = filteredMsgs.filter(
          (m) =>
            m.message?.toLowerCase().includes(searchLower) ||
            m.sender?.toLowerCase().includes(searchLower)
        );
      }
      // Sort by timestamp descending (newest first)
      filteredMsgs.sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );
      const paginatedMsgs = filteredMsgs.slice(offsetNum, offsetNum + limitNum);
      res.json({
        messages: paginatedMsgs,
        total: filteredMsgs.length,
        hasMore: offsetNum + limitNum < filteredMsgs.length,
      });
    })
    .catch((err) => {
      console.error("Failed to read messages", err);
      res.status(500).json({ error: "Failed to read messages" });
    });
});

app.get("/api/users", authenticateToken, (req, res) => {
  // Return users in the same room as the requesting user
  const userSocketId = Object.keys(users).find(
    (id) => users[id].username === req.user.username
  );
  if (userSocketId && users[userSocketId]) {
    const room = users[userSocketId].room;
    res.json(Object.values(rooms[room] || {}));
  } else {
    res.json([]);
  }
});

app.get("/api/rooms", authenticateToken, (req, res) => {
  res.json(availableRooms);
});

app.get("/api/read-receipts", authenticateToken, (req, res) => {
  storage
    .getReadReceipts()
    .then((r) => res.json(r))
    .catch((err) => {
      console.error("Failed to read receipts", err);
      res.status(500).json({ error: "Failed to read receipts" });
    });
});

// File upload endpoint
app.post(
  "/api/upload",
  authenticateToken,
  upload.single("file"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      filename: req.file.originalname,
      url: fileUrl,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  }
);

// Root route
app.get("/", (req, res) => {
  res.send("Socket.io Chat Server is running");
});

// Start server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io, chatNamespace };
