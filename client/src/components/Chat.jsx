import { useEffect, useState, useRef } from "react";

export default function Chat({ username, token, socket, onLogout }) {
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const {
    connect,
    disconnect,
    sendMessage,
    sendPrivateMessage,
    sendFile,
    switchRoom,
    addReaction,
    removeReaction,
    messages,
    users,
    typingUsers,
    isConnected,
    setTyping,
    readReceipts,
    sendReadReceipt,
    myId,
    currentRoom,
    availableRooms,
    unreadCounts,
    notificationSettings,
    setNotificationSettings,
    loadOlderMessages,
    searchMessages,
    hasMoreMessages,
    loadingOlderMessages,
  } = socket;
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const messagesRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    // connect when component mounts
    connect(username, token);
    return () => disconnect();
  }, [username, token]);

  useEffect(() => {
    // scroll to bottom on new messages
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  // mark messages as read when they arrive / are visible
  useEffect(() => {
    if (!myId || !messages || messages.length === 0) return;
    (async () => {
      for (const m of messages) {
        if (m.system) continue;
        // never mark our own messages as read
        if (m.senderId === myId) continue;
        const receiptsForMsg = readReceipts?.[String(m.id)] || {};
        if (!receiptsForMsg[myId]) {
          // send a read receipt for this message
          try {
            sendReadReceipt(String(m.id));
          } catch (err) {
            // ignore
          }
        }
      }
    })();
  }, [messages, myId, readReceipts]);

  const handleSend = (e) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed && !selectedFile) return;

    if (selectedFile) {
      handleFileUpload();
    } else {
      if (selectedRecipient) {
        sendPrivateMessage(selectedRecipient, trimmed);
      } else {
        sendMessage(trimmed, (ack) => {
          if (ack.success) {
            console.log("Message delivered successfully:", ack.messageId);
          } else {
            console.error("Message delivery failed:", ack.error);
          }
        });
      }
      setMessage("");
      setTyping(false);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch("http://localhost:5000/api/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (response.ok) {
        const fileData = await response.json();
        sendFile(fileData);
        setSelectedFile(null);
        setMessage("");
        setTyping(false);
      } else {
        console.error("File upload failed");
      }
    } catch (error) {
      console.error("File upload error:", error);
    }
  };

  const handleFileSelect = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  const handleReaction = (messageId, reaction) => {
    const message = messages.find((m) => String(m.id) === String(messageId));
    if (!message) return;

    const hasReacted = message.reactions?.[reaction]?.includes(myId);
    if (hasReacted) {
      removeReaction(messageId, reaction);
    } else {
      addReaction(messageId, reaction);
    }
  };

  return (
    <div className="chat-root">
      <aside className="chat-sidebar">
        <div className="sidebar-header">
          <strong>You:</strong>
          <div>{username}</div>
          <div className="notification-settings">
            <label>
              <input
                type="checkbox"
                checked={notificationSettings.soundEnabled}
                onChange={(e) =>
                  setNotificationSettings((prev) => ({
                    ...prev,
                    soundEnabled: e.target.checked,
                  }))
                }
              />
              Sound
            </label>
            <label>
              <input
                type="checkbox"
                checked={notificationSettings.browserEnabled}
                onChange={(e) =>
                  setNotificationSettings((prev) => ({
                    ...prev,
                    browserEnabled: e.target.checked,
                  }))
                }
              />
              Browser
            </label>
          </div>
          <button
            onClick={() => {
              onLogout();
              disconnect();
            }}
          >
            Logout
          </button>
        </div>

        <div className="rooms-list">
          <h3>Rooms</h3>
          <ul>
            {availableRooms?.map((room) => (
              <li key={room}>
                <button
                  className={currentRoom === room ? "room-selected" : ""}
                  onClick={() => switchRoom(room)}
                >
                  #{room}
                  {unreadCounts[room] > 0 && (
                    <span className="unread-badge">{unreadCounts[room]}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="users-list">
          <h3>Online ({users?.length || 0})</h3>
          <ul>
            {users
              ?.filter((u) => u.username !== username)
              .map((u) => (
                <li key={u.id}>
                  <button
                    className={
                      selectedRecipient === u.id ? "user-selected" : ""
                    }
                    onClick={() => setSelectedRecipient(u.id)}
                    title={`Private message to ${u.username}`}
                  >
                    {u.username}
                  </button>
                </li>
              ))}
          </ul>

          {selectedRecipient && (
            <div className="private-target">
              <small>Sending privately to:</small>
              <div>
                {users.find((u) => u.id === selectedRecipient)?.username ||
                  "Unknown"}
                <button
                  className="clear-target"
                  onClick={() => setSelectedRecipient(null)}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="chat-main">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Search messages..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setIsSearching(true);
                searchMessages(searchTerm).finally(() => setIsSearching(false));
              }
            }}
          />
          <button
            onClick={() => {
              setIsSearching(true);
              searchMessages(searchTerm).finally(() => setIsSearching(false));
            }}
            disabled={isSearching}
          >
            {isSearching ? "Searching..." : "Search"}
          </button>
          {searchTerm && (
            <button
              onClick={() => {
                setSearchTerm("");
                setIsSearching(true);
                searchMessages("").finally(() => setIsSearching(false));
              }}
            >
              Clear
            </button>
          )}
        </div>
        <div className="messages" ref={messagesRef} aria-live="polite">
          {hasMoreMessages && !isSearching && (
            <button
              className="load-more-btn"
              onClick={() => loadOlderMessages()}
              disabled={loadingOlderMessages}
            >
              {loadingOlderMessages ? "Loading..." : "Load Older Messages"}
            </button>
          )}
          {messages?.map((m) => (
            <div key={m.id} className={m.system ? "msg-system" : "msg"}>
              {m.system ? (
                <em>{m.message}</em>
              ) : (
                <>
                  <div className="msg-meta">
                    <strong>{m.sender}</strong>
                    {m.isPrivate && (
                      <span className="private-badge">private</span>
                    )}
                    <span className="msg-time">
                      {new Date(m.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="msg-body">
                    {m.file ? (
                      m.file.mimetype?.startsWith("image/") ? (
                        <div>
                          <img
                            src={`http://localhost:5000${m.file.url}`}
                            alt={m.file.filename}
                            style={{ maxWidth: "200px", maxHeight: "200px" }}
                          />
                          <p>{m.message}</p>
                        </div>
                      ) : (
                        <div>
                          <a
                            href={`http://localhost:5000${m.file.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            📎 {m.file.filename}
                          </a>
                          <p>{m.message}</p>
                        </div>
                      )
                    ) : (
                      m.message
                    )}
                  </div>
                  {!m.system && (
                    <div className="msg-reactions">
                      {["👍", "❤️", "😂", "😮", "😢", "😡"].map((reaction) => {
                        const count = m.reactions?.[reaction]?.length || 0;
                        const hasReacted =
                          m.reactions?.[reaction]?.includes(myId);
                        return count > 0 ? (
                          <button
                            key={reaction}
                            className={`reaction-btn ${
                              hasReacted ? "reacted" : ""
                            }`}
                            onClick={() => handleReaction(m.id, reaction)}
                          >
                            {reaction} {count}
                          </button>
                        ) : null;
                      })}
                      <button
                        className="add-reaction-btn"
                        onClick={() => {
                          // Simple reaction picker - could be enhanced
                          const reaction = prompt(
                            "Enter reaction: 👍 ❤️ 😂 😮 😢 😡"
                          );
                          if (reaction) handleReaction(m.id, reaction);
                        }}
                      >
                        +
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        <div className="typing-indicator">
          {typingUsers?.length > 0 && (
            <small>{typingUsers.join(", ")} typing...</small>
          )}
        </div>

        <form className="message-form" onSubmit={handleSend}>
          <input
            type="file"
            onChange={handleFileSelect}
            accept="image/*,.pdf,.txt,.doc,.docx"
            style={{ display: "none" }}
            id="file-input"
          />
          <label htmlFor="file-input" className="file-upload-btn">
            📎
          </label>
          <input
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setTyping(!!e.target.value);
            }}
            placeholder={
              isConnected
                ? selectedFile
                  ? `Send "${selectedFile.name}" or type a message`
                  : "Type a message and press Enter"
                : "Connecting..."
            }
            disabled={!isConnected}
          />
          <button
            type="submit"
            disabled={!isConnected || (!message.trim() && !selectedFile)}
          >
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
