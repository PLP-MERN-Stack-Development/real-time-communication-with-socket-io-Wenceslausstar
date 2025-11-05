// socket.js - Socket.io client setup

import { io } from "socket.io-client";
import { useEffect, useState } from "react";

// Socket.io connection URL
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5001";

// Create socket instance with namespace
export const socket = io(`${SOCKET_URL}/chat`, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  auth: {},
});

// Notification utilities
const playNotificationSound = () => {
  // Create a simple beep sound using Web Audio API
  try {
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + 0.3
    );

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    console.warn("Could not play notification sound:", error);
  }
};

const showBrowserNotification = (title, body, icon = null) => {
  if ("Notification" in window && Notification.permission === "granted") {
    const notification = new Notification(title, {
      body,
      icon,
      tag: "chat-notification", // Prevents duplicate notifications
    });

    // Auto-close after 5 seconds
    setTimeout(() => {
      notification.close();
    }, 5000);

    return notification;
  }
  return null;
};

const requestNotificationPermission = async () => {
  if ("Notification" in window && Notification.permission === "default") {
    try {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    } catch (error) {
      console.warn("Error requesting notification permission:", error);
      return false;
    }
  }
  return Notification.permission === "granted";
};

// Custom hook for using socket.io
export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [lastMessage, setLastMessage] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [typingUsers, setTypingUsers] = useState([]);
  const [readReceipts, setReadReceipts] = useState({});
  const [myId, setMyId] = useState(socket.id || null);
  const [currentRoom, setCurrentRoom] = useState("general");
  const [availableRooms, setAvailableRooms] = useState(["general"]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [notificationSettings, setNotificationSettings] = useState({
    soundEnabled: true,
    browserEnabled: false,
  });
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);

  // Initialize notifications on mount
  useEffect(() => {
    requestNotificationPermission().then((granted) => {
      setNotificationSettings((prev) => ({ ...prev, browserEnabled: granted }));
    });
  }, []);

  // Connect to socket server
  const connect = (username, token) => {
    console.log(
      `[DEBUG] Connecting socket with username: ${username}, token: ${
        token ? "present" : "missing"
      }`
    );
    if (token) {
      socket.auth.token = token;
    }
    socket.connect();
    if (username) {
      socket.emit("user_join", username, currentRoom);
    }
  };

  // Disconnect from socket server
  const disconnect = () => {
    socket.disconnect();
  };

  // Send a message
  const sendMessage = (message, callback) => {
    socket.emit("send_message", { message }, callback);
  };

  // Send a private message
  const sendPrivateMessage = (to, message) => {
    socket.emit("private_message", { to, message });
  };

  // Send a file message
  const sendFile = (fileData) => {
    socket.emit("send_file", fileData);
  };

  // Switch room
  const switchRoom = (newRoom) => {
    socket.emit("switch_room", newRoom);
    setCurrentRoom(newRoom);
  };

  // Add reaction
  const addReaction = (messageId, reaction) => {
    socket.emit("add_reaction", { messageId, reaction });
  };

  // Remove reaction
  const removeReaction = (messageId, reaction) => {
    socket.emit("remove_reaction", { messageId, reaction });
  };

  // Set typing status
  const setTyping = (isTyping) => {
    socket.emit("typing", isTyping);
  };

  // Socket event listeners
  useEffect(() => {
    // Connection events
    const onConnect = () => {
      setIsConnected(true);
      setMyId(socket.id);
      // fetch initial messages and read receipts
      (async () => {
        const token = socket.auth.token;
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        try {
          const res = await fetch(
            `${SOCKET_URL}/api/messages?roomId=${currentRoom}&limit=50&offset=0`,
            { headers }
          );
          if (res.ok) {
            const data = await res.json();
            // Messages are already filtered by room on server
            setMessages(data.messages);
            setHasMoreMessages(data.hasMore);
          } else if (res.status === 401 || res.status === 403) {
            // Token expired or invalid, disconnect and clear auth
            socket.auth.token = null;
            socket.disconnect();
            // Trigger logout by clearing messages/users
            setMessages([]);
            setUsers([]);
            setTypingUsers([]);
            setReadReceipts({});
            setIsConnected(false);
            setMyId(null);
          }
        } catch (err) {
          // ignore
        }

        try {
          const r = await fetch(`${SOCKET_URL}/api/read-receipts`, { headers });
          if (r.ok) {
            const receipts = await r.json();
            setReadReceipts(receipts || {});
          }
        } catch (err) {
          // ignore
        }

        try {
          const roomRes = await fetch(`${SOCKET_URL}/api/rooms`, { headers });
          if (roomRes.ok) {
            const rooms = await roomRes.json();
            setAvailableRooms(rooms);
          }
        } catch (err) {
          // ignore
        }
      })();
    };

    const onDisconnect = () => {
      setIsConnected(false);
      setMyId(null);
      // If disconnected due to auth error, clear auth data
      if (!socket.auth.token) {
        setMessages([]);
        setUsers([]);
        setTypingUsers([]);
        setReadReceipts({});
      }
    };

    // Message events
    const onReceiveMessage = (message) => {
      setLastMessage(message);
      setMessages((prev) => [...prev, message]);
      // Increment unread count for the room if not current room or message not from self
      if (message.roomId !== currentRoom && message.senderId !== myId) {
        setUnreadCounts((prev) => ({
          ...prev,
          [message.roomId]: (prev[message.roomId] || 0) + 1,
        }));

        // Play sound notification
        if (notificationSettings.soundEnabled) {
          playNotificationSound();
        }

        // Show browser notification
        if (notificationSettings.browserEnabled && document.hidden) {
          showBrowserNotification(
            `New message in #${message.roomId}`,
            `${message.sender}: ${message.message}`,
            "/vite.svg"
          );
        }
      }
    };

    const onPrivateMessage = (message) => {
      setLastMessage(message);
      setMessages((prev) => [...prev, message]);
      // Private messages are always considered unread if not from self
      if (message.senderId !== myId) {
        setUnreadCounts((prev) => ({
          ...prev,
          private: (prev.private || 0) + 1,
        }));

        // Play sound notification for private messages
        if (notificationSettings.soundEnabled) {
          playNotificationSound();
        }

        // Show browser notification for private messages
        if (notificationSettings.browserEnabled && document.hidden) {
          showBrowserNotification(
            "New private message",
            `${message.sender}: ${message.message}`,
            "/vite.svg"
          );
        }
      }
    };

    // User events
    const onUserList = (userList) => {
      setUsers(userList);
    };

    const onUserJoined = (user) => {
      // You could add a system message here
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          system: true,
          message: `${user.username} joined the chat`,
          timestamp: new Date().toISOString(),
          roomId: currentRoom,
        },
      ]);

      // Show notification for user joins if enabled
      if (notificationSettings.browserEnabled && document.hidden) {
        showBrowserNotification(
          "User joined",
          `${user.username} joined #${currentRoom}`,
          "/vite.svg"
        );
      }
    };

    const onUserLeft = (user) => {
      // You could add a system message here
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          system: true,
          message: `${user.username} left the chat`,
          timestamp: new Date().toISOString(),
          roomId: currentRoom,
        },
      ]);

      // Show notification for user leaves if enabled
      if (notificationSettings.browserEnabled && document.hidden) {
        showBrowserNotification(
          "User left",
          `${user.username} left #${currentRoom}`,
          "/vite.svg"
        );
      }
    };
    const onRoomJoined = (room) => {
      setCurrentRoom(room);
      // Clear messages when switching rooms
      setMessages([]);
      setHasMoreMessages(false);
      // Reset unread count for this room
      setUnreadCounts((prev) => ({ ...prev, [room]: 0 }));
      // Fetch messages for the new room
      (async () => {
        const token = socket.auth.token;
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        try {
          const res = await fetch(
            `${SOCKET_URL}/api/messages?roomId=${room}&limit=50&offset=0`,
            { headers }
          );
          if (res.ok) {
            const data = await res.json();
            setMessages(data.messages);
            setHasMoreMessages(data.hasMore);
          }
        } catch (err) {
          // ignore
        }
      })();
    };

    const onReactionAdded = ({ messageId, reaction, userId }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          String(msg.id) === String(messageId)
            ? {
                ...msg,
                reactions: {
                  ...msg.reactions,
                  [reaction]: [...(msg.reactions?.[reaction] || []), userId],
                },
              }
            : msg
        )
      );
    };

    const onReactionRemoved = ({ messageId, reaction, userId }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          String(msg.id) === String(messageId)
            ? {
                ...msg,
                reactions: {
                  ...msg.reactions,
                  [reaction]: (msg.reactions?.[reaction] || []).filter(
                    (id) => id !== userId
                  ),
                },
              }
            : msg
        )
      );
    };

    // Typing events
    const onTypingUsers = (users) => {
      setTypingUsers(users);
    };

    const onReadReceipt = ({ messageId, receipts }) => {
      setReadReceipts((prev) => ({ ...prev, [messageId]: receipts }));
    };

    const onUserStatus = ({ userId, status }) => {
      setOnlineUsers((prev) => {
        const newOnlineUsers = new Set(prev);
        if (status === "online") {
          newOnlineUsers.add(userId);
        } else {
          newOnlineUsers.delete(userId);
        }
        return newOnlineUsers;
      });
    };

    // Register event listeners
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("user_status", onUserStatus);
    socket.on("receive_message", onReceiveMessage);
    socket.on("private_message", onPrivateMessage);
    socket.on("user_list", onUserList);
    socket.on("user_joined", onUserJoined);
    socket.on("user_left", onUserLeft);
    socket.on("typing_users", onTypingUsers);
    socket.on("read_receipt", onReadReceipt);
    socket.on("room_joined", onRoomJoined);
    socket.on("reaction_added", onReactionAdded);
    socket.on("reaction_removed", onReactionRemoved);

    // Clean up event listeners
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("user_status", onUserStatus);
      socket.off("receive_message", onReceiveMessage);
      socket.off("private_message", onPrivateMessage);
      socket.off("user_list", onUserList);
      socket.off("user_joined", onUserJoined);
      socket.off("user_left", onUserLeft);
      socket.off("typing_users", onTypingUsers);
      socket.off("read_receipt", onReadReceipt);
      socket.off("room_joined", onRoomJoined);
      socket.off("reaction_added", onReactionAdded);
      socket.off("reaction_removed", onReactionRemoved);
    };
  }, []);

  const sendReadReceipt = (messageId) => {
    socket.emit("message_read", { messageId });
  };

  // Load older messages
  const loadOlderMessages = async (searchTerm = "") => {
    if (!hasMoreMessages || loadingOlderMessages) return;
    setLoadingOlderMessages(true);
    const token = socket.auth.token;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const offset = messages.length;
      const searchParam = searchTerm
        ? `&search=${encodeURIComponent(searchTerm)}`
        : "";
      const res = await fetch(
        `${SOCKET_URL}/api/messages?roomId=${currentRoom}&limit=50&offset=${offset}${searchParam}`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...data.messages, ...prev]);
        setHasMoreMessages(data.hasMore);
      }
    } catch (err) {
      console.error("Failed to load older messages", err);
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  // Search messages
  const searchMessages = async (searchTerm) => {
    const token = socket.auth.token;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const res = await fetch(
        `${SOCKET_URL}/api/messages?roomId=${currentRoom}&limit=100&offset=0&search=${encodeURIComponent(
          searchTerm
        )}`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
        setHasMoreMessages(data.hasMore);
      }
    } catch (err) {
      console.error("Failed to search messages", err);
    }
  };

  return {
    socket,
    isConnected,
    onlineUsers,
    lastMessage,
    messages,
    users,
    typingUsers,
    myId,
    currentRoom,
    availableRooms,
    unreadCounts,
    notificationSettings,
    setNotificationSettings,
    connect,
    disconnect,
    sendMessage,
    sendPrivateMessage,
    sendFile,
    switchRoom,
    addReaction,
    removeReaction,
    setTyping,
    readReceipts,
    sendReadReceipt,
    loadOlderMessages,
    searchMessages,
    hasMoreMessages,
    loadingOlderMessages,
  };
};

export default socket;
