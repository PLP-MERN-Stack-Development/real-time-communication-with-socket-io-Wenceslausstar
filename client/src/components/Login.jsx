import { useState } from "react";

export default function Login({ onSubmit }) {
  const [name, setName] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div className="login-container">
      <form onSubmit={handleSubmit} className="login-form">
        <h2>Join the chat</h2>
        <input
          aria-label="username"
          placeholder="Enter a display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit">Join</button>
      </form>
    </div>
  );
}
