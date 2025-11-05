const fs = require("fs").promises;
const path = require("path");

const messagesFilePath = path.join(__dirname, "..", "data", "messages.json");
const roomsFilePath = path.join(__dirname, "..", "data", "rooms.json");
const readReceiptsFilePath = path.join(
  __dirname,
  "..",
  "data",
  "readReceipts.json"
);

// Ensure data directory exists
const ensureDataDir = async () => {
  try {
    await fs.mkdir(path.dirname(messagesFilePath), { recursive: true });
  } catch (err) {
    console.error("Could not create data directory", err);
  }
};

// Helper to read JSON file
const readJsonFile = async (filePath, defaultValue = []) => {
  try {
    await ensureDataDir();
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    if (err.code === "ENOENT") {
      // File doesn't exist, create it with default value
      await writeJsonFile(filePath, defaultValue);
      return defaultValue;
    }
    console.error(`Failed to read from ${filePath}`, err);
    return defaultValue; // Return default value on error
  }
};

// Helper to write JSON file
const writeJsonFile = async (filePath, data) => {
  try {
    await ensureDataDir();
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error(`Failed to write to ${filePath}`, err);
  }
};

// Message-related functions
const getMessages = () => readJsonFile(messagesFilePath, []);
const addMessage = async (message) => {
  const messages = await getMessages();
  messages.push(message);
  await writeJsonFile(messagesFilePath, messages);
};

// Room-related functions
const getRooms = () => readJsonFile(roomsFilePath, ["general"]);
const addRoom = async (room) => {
  const rooms = await getRooms();
  if (!rooms.includes(room)) {
    rooms.push(room);
    await writeJsonFile(roomsFilePath, rooms);
  }
};

// Read receipt functions
const getReadReceipts = () => readJsonFile(readReceiptsFilePath, {});
const markMessageRead = async (messageId, userId) => {
  const receipts = await getReadReceipts();
  if (!receipts[messageId]) {
    receipts[messageId] = [];
  }
  if (!receipts[messageId].includes(userId)) {
    receipts[messageId].push(userId);
  }
  await writeJsonFile(readReceiptsFilePath, receipts);
  return receipts[messageId];
};

// Reaction functions
const addReaction = async (messageId, userId, reaction) => {
  const messages = await getMessages();
  const message = messages.find((m) => String(m.id) === messageId);
  if (message) {
    if (!message.reactions) {
      message.reactions = {};
    }
    if (!message.reactions[reaction]) {
      message.reactions[reaction] = [];
    }
    if (!message.reactions[reaction].includes(userId)) {
      message.reactions[reaction].push(userId);
    }
    await writeJsonFile(messagesFilePath, messages);
  }
};

const removeReaction = async (messageId, userId, reaction) => {
  const messages = await getMessages();
  const message = messages.find((m) => String(m.id) === messageId);
  if (message && message.reactions && message.reactions[reaction]) {
    message.reactions[reaction] = message.reactions[reaction].filter(
      (id) => id !== userId
    );
    if (message.reactions[reaction].length === 0) {
      delete message.reactions[reaction];
    }
    await writeJsonFile(messagesFilePath, messages);
  }
};

module.exports = {
  getMessages,
  addMessage,
  getRooms,
  addRoom,
  getReadReceipts,
  markMessageRead,
  addReaction,
  removeReaction,
};
