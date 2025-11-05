import { useState, useEffect, useRef } from "react";

const Chat = ({ username, token, socket, onLogout }) => {
  const [message, setMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messageListRef = useRef(null);

  const { connect, disconnect, sendMessage, setTyping, messages, users, onlineUsers } = socket;

  useEffect(() => {
    if (username && token) {
      connect(username, token);
    }

    return () => {
      disconnect();
    };
  }, [username, token, connect, disconnect]);

  useEffect(() => {
    // Scroll to the bottom of the message list whenever new messages arrive
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  const handleTyping = (e) => {
    setMessage(e.target.value);

    if (!isTyping) {
      setIsTyping(true);
      setTyping(true);
    }

    // Debounce typing event
    setTimeout(() => {
      setIsTyping(false);
      setTyping(false);
    }, 2000);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (message.trim()) {
      sendMessage(message, (ack) => {
        if (ack.success) {
          setMessage("");
        } else {
          console.error("Message failed to send");
        }
      });
    }
  };

  return (
    <div className="flex h-[calc(100vh-80px)]">
      <div className="w-64 bg-gray-100 p-4 border-r border-gray-200">
        <h2 className="text-lg font-bold mb-4">Users</h2>
        <ul>
          {users.map((user) => (
            <li key={user.id} className="flex items-center mb-2">
              <span
                className={`w-3 h-3 rounded-full mr-2 ${
                  onlineUsers.has(user.id) ? "bg-green-500" : "bg-gray-400"
                }`}
              ></span>
              <span>{user.username}</span>
              {user.id !== socket.myId && (
                <button
                  onClick={() => {
                    const message = prompt(`Send a private message to ${user.username}`);
                    if (message) {
                      socket.sendPrivateMessage(user.id, message);
                    }
                  }}
                  className="ml-auto text-xs bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-1 px-2 rounded"
                >
                  Send PM
                </button>
              )}
            </li>
          ))}
        </ul>
        <h2 className="text-lg font-bold mt-4 mb-2">Rooms</h2>
        <ul>
          {socket.availableRooms.map((room) => (
            <li key={room} className="mb-2">
              <button
                onClick={() => socket.switchRoom(room)}
                className={`w-full text-left px-2 py-1 rounded ${
                  socket.currentRoom === room
                    ? "bg-blue-500 text-white"
                    : "bg-gray-300 hover:bg-gray-400"
                }`}
              >
                # {room}
              </button>
            </li>
          ))}
        </ul>
        <button
          onClick={() => {
            const newRoom = prompt("Enter new room name");
            if (newRoom) {
              socket.switchRoom(newRoom);
            }
          }}
          className="w-full mt-2 text-sm bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-1 px-2 rounded"
        >
          + Add Room
        </button>
      </div>
      <div className="flex-1 flex flex-col">
        <div className="flex-1 p-4 overflow-y-auto" ref={messageListRef}>
          {socket.hasMoreMessages && (
            <div className="text-center mb-4">
              <button
                onClick={() => socket.loadOlderMessages()}
                disabled={socket.loadingOlderMessages}
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 transition duration-300 disabled:bg-gray-200"
              >
                {socket.loadingOlderMessages ? "Loading..." : "Load More"}
              </button>
            </div>
          )}
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${
                msg.sender === username ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg mb-2 ${
                  msg.isPrivate
                    ? "bg-purple-500 text-white"
                    : msg.sender === username
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-800"
                }`}
              >
                <p className="font-bold">{msg.sender}{msg.isPrivate ? " (private)" : ""}</p>
                {msg.file ? (
                  <div>
                    {msg.file.mimetype.startsWith("image/") ? (
                      <img src={msg.file.data} alt={msg.file.filename} className="max-w-xs rounded" />
                    ) : (
                      <a
                        href={msg.file.data}
                        download={msg.file.filename}
                        className="text-blue-200 hover:underline"
                      >
                        {msg.file.filename}
                      </a>
                    )}
                  </div>
                ) : (
                  <p>{msg.message}</p>
                )}
                <p className="text-xs text-right mt-1">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 bg-white border-t border-gray-200">
          <div className="flex items-center mb-4">
            <input
              type="text"
              placeholder="Search messages..."
              className="flex-1 px-4 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  socket.searchMessages(e.target.value);
                }
              }}
            />
            <button
              onClick={() =>
                socket.searchMessages(
                  document.querySelector('input[placeholder="Search messages..."]').value
                )
              }
              className="ml-4 px-6 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition duration-300"
            >
              Search
            </button>
          </div>
          <form onSubmit={handleSendMessage} className="flex items-center">
            <input
              type="text"
              value={message}
              onChange={handleTyping}
              placeholder="Type a message..."
              className="flex-1 px-4 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
                      <input
                        type="file"
                        id="file-input"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (e) => {
                              const fileData = {
                                filename: file.name,
                                mimetype: file.type,
                                size: file.size,
                                data: e.target.result,
                              };
                              socket.sendFile(fileData);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      <label
                        htmlFor="file-input"
                        className="ml-4 px-4 py-2 bg-gray-300 text-gray-800 rounded-full hover:bg-gray-400 transition duration-300 cursor-pointer"
                      >
                        +
                      </label>
                      <button
                        type="submit"
                        className="ml-4 px-6 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition duration-300"
                      >
                        Send
                      </button>          </form>
                  <button
                    onClick={onLogout}
                    className="mt-2 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Logout
                  </button>
                  <div className="mt-4">
                    <h3 className="text-lg font-bold mb-2">Settings</h3>
                    <div className="flex items-center mb-2">
                      <input
                        type="checkbox"
                        id="sound-notifications"
                        checked={socket.notificationSettings.soundEnabled}
                        onChange={(e) =>
                          socket.setNotificationSettings((prev) => ({
                            ...prev,
                            soundEnabled: e.target.checked,
                          }))
                        }
                        className="mr-2"
                      />
                      <label htmlFor="sound-notifications">Sound Notifications</label>
                    </div>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="browser-notifications"
                        checked={socket.notificationSettings.browserEnabled}
                        onChange={(e) =>
                          socket.setNotificationSettings((prev) => ({
                            ...prev,
                            browserEnabled: e.target.checked,
                          }))
                        }
                        className="mr-2"
                      />
                      <label htmlFor="browser-notifications">Browser Notifications</label>
                    </div>
                  </div>        </div>
      </div>
    </div>
  );
};

export default Chat;
