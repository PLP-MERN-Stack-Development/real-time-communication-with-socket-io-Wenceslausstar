import { useState, useEffect, useRef } from "react";
import { useSocket } from "./socket/socket";
import Login from "./components/Login";
import Chat from "./components/Chat";

function App() {
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const socket = useSocket();

  // Persist username and token in sessionStorage so reloads keep the user
  useEffect(() => {
    const savedUsername = sessionStorage.getItem("chat_username");
    const savedToken = sessionStorage.getItem("chat_token");
    if (savedUsername && savedToken) {
      setUsername(savedUsername);
      setToken(savedToken);
    }
  }, []);

  useEffect(() => {
    if (username && token) {
      sessionStorage.setItem("chat_username", username);
      sessionStorage.setItem("chat_token", token);
    } else {
      sessionStorage.removeItem("chat_username");
      sessionStorage.removeItem("chat_token");
    }
  }, [username, token]);

  // Handle token expiration - if socket disconnects due to auth, logout
  useEffect(() => {
    const handleStorageChange = () => {
      const currentToken = sessionStorage.getItem("chat_token");
      if (!currentToken && token) {
        // Token was cleared, logout
        setUsername("");
        setToken("");
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [token]);

  return (
    <div className="max-w-6xl mx-auto">
      <header className="py-4 px-6 border-b border-secondary bg-primary">
        <h1 className="text-2xl font-bold text-gray-800">Socket.io Chat</h1>
      </header>

      {!username ? (
        <Login
          onSubmit={(name, jwtToken) => {
            setUsername(name);
            setToken(jwtToken);
          }}
        />
      ) : (
        <Chat
          username={username}
          token={token}
          socket={socket}
          onLogout={() => {
            setUsername("");
            setToken("");
          }}
        />
      )}
    </div>
  );
}

export default App;
