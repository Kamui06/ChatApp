import { useRef } from "react";
import "./header.css";

export default function Header({ selectedUser, onlineUsers, onOpenOptions, isMobile, onOpenSidebar }) {
  const isOnline = onlineUsers.includes(selectedUser._id);
  const btnRef = useRef(null);

  const handleClick = () => {
    const rect = btnRef.current.getBoundingClientRect();
    onOpenOptions({
      x: window.innerWidth - rect.right,
      y: rect.bottom + 6
    });
  };

  return (
    <div className="header-bar">
      <div className="header-left">
        {/* Hamburger — mobile only */}
        {isMobile && (
          <button className="header-hamburger" onClick={onOpenSidebar}>
            ☰
          </button>
        )}

        <div className="header-avatar">
          {selectedUser.username[0].toUpperCase()}
        </div>

        <div>
          <p className="header-name">{selectedUser.username}</p>
          <p className={`header-status ${isOnline ? "online" : ""}`}>
            {isOnline ? "Online" : "Offline"}
          </p>
        </div>
      </div>

      <button
        ref={btnRef}
        onClick={handleClick}
        title="Chat options"
        className="header-options-btn"
      >
        ⋮
      </button>
    </div>
  );
}