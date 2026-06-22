import { useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import "./register.css";

export default function Register() {
  const [form, setForm] = useState({ username: "", password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    try {
      await axios.post("/api/auth/register", {
        username: form.username,
        password: form.password
      });
      navigate("/login");
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    }
  };

  const passwordsMatch =
    form.confirmPassword.length > 0 && form.password === form.confirmPassword;

  const passwordsMismatch =
    form.confirmPassword.length > 0 && form.password !== form.confirmPassword;

  return (
    <div className="register-container">
      <div className="register-card">
        <h2 className="register-title">Create Account</h2>
        {error && <p className="register-error">{error}</p>}

        <form onSubmit={handleSubmit}>
          <input
            className="register-input"
            placeholder="Username"
            value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })}
            autoComplete="username"
            required
          />

          <input
            className="register-input"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            autoComplete="new-password"
            required
          />

          {/* Confirm Password with live match indicator */}
          <div className="register-confirm-wrapper">
            <input
              className={`register-input register-confirm-input ${
                passwordsMatch ? "match" : passwordsMismatch ? "mismatch" : ""
              }`}
              type="password"
              placeholder="Confirm Password"
              value={form.confirmPassword}
              onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
              autoComplete="new-password"
              required
            />
            {form.confirmPassword.length > 0 && (
              <span className="register-match-icon">
                {passwordsMatch ? "correct" : "incorrect"}
              </span>
            )}
          </div>

          {/* Live hint text */}
          {passwordsMismatch && (
            <p className="register-hint mismatch">Passwords do not match</p>
          )}
          {passwordsMatch && (
            <p className="register-hint match">Passwords match</p>
          )}

          <button
            className={`register-button ${passwordsMatch ? "enabled" : ""}`}
            type="submit"
            disabled={!passwordsMatch}
          >
            Register
          </button>
        </form>

        <p className="register-link">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </div>
  );
}