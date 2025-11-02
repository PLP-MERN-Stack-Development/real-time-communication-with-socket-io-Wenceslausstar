import { useState, useEffect, useRef } from "react";
import "./App.css";
import { useSocket } from "./socket/socket";
import Login from "./components/Login";
import Chat from "./components/Chat";

function App() {
  const [username, setUsername] = useState("");
  const socket = useSocket();

  // Persist username in sessionStorage so reloads keep the user
  useEffect(() => {
    const saved = sessionStorage.getItem("chat_username");
    if (saved) setUsername(saved);
  }, []);

  useEffect(() => {
    if (username) sessionStorage.setItem("chat_username", username);
    else sessionStorage.removeItem("chat_username");
  }, [username]);

  return (
    <div className="app-root">
      <header className="app-header">
        <h1>Socket.io Chat</h1>
      </header>

      {!username ? (
        <Login onSubmit={(name) => setUsername(name)} />
      ) : (
        <Chat
          username={username}
          socket={socket}
          onLogout={() => setUsername("")}
        />
      )}
    </div>
  );
}

export default App;
