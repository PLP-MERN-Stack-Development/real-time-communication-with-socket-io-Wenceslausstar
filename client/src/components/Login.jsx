import { useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function Login({ onSubmit }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: trimmed }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Login failed");
      }

      const data = await response.json();
      onSubmit(data.username, data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
          disabled={loading}
        />
        <button type="submit" disabled={loading || !name.trim()}>
          {loading ? "Joining..." : "Join"}
        </button>
        {error && <p className="error-message">{error}</p>}
      </form>
    </div>
  );
}
