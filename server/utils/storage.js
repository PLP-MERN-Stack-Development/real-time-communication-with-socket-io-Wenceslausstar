const fs = require("fs").promises;
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "storage.json");

// Default structure
const DEFAULT = {
  messages: [], // messages now include roomId, reactions, fileUrl, etc.
  readReceipts: {}, // { messageId: { userId: timestamp } }
  rooms: ["general"], // default room
};

async function ensureDataFile() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    // If file doesn't exist, create with default
    try {
      await fs.access(DATA_FILE);
    } catch (err) {
      await fs.writeFile(DATA_FILE, JSON.stringify(DEFAULT, null, 2), "utf8");
    }
  } catch (err) {
    console.error("Failed to ensure data file", err);
    throw err;
  }
}

async function readData() {
  await ensureDataFile();
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw || "{}");
  } catch (err) {
    console.error("Failed to read storage file", err);
    return { ...DEFAULT };
  }
}

async function writeData(data) {
  await ensureDataFile();
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write storage file", err);
    throw err;
  }
}

async function getMessages() {
  const data = await readData();
  return data.messages || [];
}

async function getReadReceipts() {
  const data = await readData();
  return data.readReceipts || {};
}

async function getRooms() {
  const data = await readData();
  return data.rooms || ["general"];
}

async function addRoom(roomName) {
  const data = await readData();
  data.rooms = data.rooms || ["general"];
  if (!data.rooms.includes(roomName)) {
    data.rooms.push(roomName);
    await writeData(data);
  }
}

async function addMessage(message) {
  const data = await readData();
  data.messages = data.messages || [];
  data.messages.push(message);
  // keep cap of 100 messages same as before
  if (data.messages.length > 100) data.messages.shift();
  await writeData(data);
}

async function markMessageRead(messageId, userId) {
  const data = await readData();
  data.readReceipts = data.readReceipts || {};
  if (!data.readReceipts[messageId]) data.readReceipts[messageId] = {};
  data.readReceipts[messageId][userId] = new Date().toISOString();
  await writeData(data);
  return data.readReceipts[messageId];
}

async function addReaction(messageId, userId, reaction) {
  const data = await readData();
  data.messages = data.messages || [];
  const message = data.messages.find((m) => String(m.id) === String(messageId));
  if (message) {
    message.reactions = message.reactions || {};
    message.reactions[reaction] = message.reactions[reaction] || [];
    if (!message.reactions[reaction].includes(userId)) {
      message.reactions[reaction].push(userId);
    }
    await writeData(data);
  }
}

async function removeReaction(messageId, userId, reaction) {
  const data = await readData();
  data.messages = data.messages || [];
  const message = data.messages.find((m) => String(m.id) === String(messageId));
  if (message && message.reactions && message.reactions[reaction]) {
    message.reactions[reaction] = message.reactions[reaction].filter(
      (id) => id !== userId
    );
    if (message.reactions[reaction].length === 0) {
      delete message.reactions[reaction];
    }
    await writeData(data);
  }
}

module.exports = {
  getMessages,
  getReadReceipts,
  addMessage,
  markMessageRead,
  getRooms,
  addRoom,
  addReaction,
  removeReaction,
};
