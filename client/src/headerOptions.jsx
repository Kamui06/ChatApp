import { useEffect, useRef } from "react";
import "./headerOptions.css";

export default function HeaderOptions({ position, onClose, onRemoveUser, onClearChat, username }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <>
      <div className="header-options-backdrop" />

      <div
        ref={menuRef}
        className="header-options-menu"
        style={{ top: position.y, right: position.x }}
      >
        <button className="header-options-item" onClick={onClearChat}>
          <span>Clear chat</span>
        </button>

        <button className="header-options-item danger" onClick={onRemoveUser}>
          <span>Remove {username}</span>
        </button>
      </div>
    </>
  );
}