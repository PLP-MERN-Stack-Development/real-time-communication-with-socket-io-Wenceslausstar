import { useEffect, useState, useRef } from "react";

export default function Chat({ username, socket, onLogout }) {
  const [message, setMessage] = useState("");
  const {
    connect,
    disconnect,
    sendMessage,
    sendPrivateMessage,
    messages,
    users,
    typingUsers,
    isConnected,
    setTyping,
    readReceipts,
    sendReadReceipt,
    myId,
  } = socket;
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const messagesRef = useRef(null);

  useEffect(() => {
    // connect when component mounts
    connect(username);
    return () => disconnect();
  }, [username]);

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
    if (!trimmed) return;
    if (selectedRecipient) {
      sendPrivateMessage(selectedRecipient, trimmed);
    } else {
      sendMessage(trimmed);
    }
    setMessage("");
    setTyping(false);
  };

  return (
    <div className="chat-root">
      <aside className="chat-sidebar">
        <div className="sidebar-header">
          <strong>You:</strong>
          <div>{username}</div>
          <button
            onClick={() => {
              onLogout();
              disconnect();
            }}
          >
            Logout
          </button>
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
        <div className="messages" ref={messagesRef} aria-live="polite">
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
                  <div className="msg-body">{m.message}</div>
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
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setTyping(!!e.target.value);
            }}
            placeholder={
              isConnected ? "Type a message and press Enter" : "Connecting..."
            }
            disabled={!isConnected}
          />
          <button type="submit" disabled={!isConnected || !message.trim()}>
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
