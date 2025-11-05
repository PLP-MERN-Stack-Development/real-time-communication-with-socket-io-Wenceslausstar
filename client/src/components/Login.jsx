import { useState } from "react";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5001";

function Login({ onSubmit }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError("Username is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${SOCKET_URL}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username }),
      });

      if (!response.ok) {
        const { error: errorMessage } = await response.json();
        throw new Error(errorMessage || "Login failed");
      }

      const { token, username: returnedUsername } = await response.json();
      onSubmit(returnedUsername, token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen -mt-20">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm"
      >
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">
          Join Chat
        </h2>
        {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}
        <div className="mb-4">
          <label
            htmlFor="username"
            className="block text-gray-700 text-sm font-bold mb-2"
          >
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            className="w-full px-3 py-2 border rounded-md text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
        <button
          type="submit"
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md transition duration-300 disabled:bg-blue-300"
          disabled={loading}
        >
          {loading ? "Joining..." : "Join"}
        </button>
      </form>
    </div>
  );
}

export default Login;
