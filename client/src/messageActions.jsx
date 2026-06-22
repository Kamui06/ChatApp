import { useEffect, useRef } from "react";
import "./messageActions.css";

export default function MessageActions({ message, position, isMe, onClose, onDeleteForEveryone, onDeleteForMe }) {
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

  const copyText = () => {
    navigator.clipboard.writeText(message.text);
    onClose();
  };

  return (
    <>
      <div className="message-actions-backdrop" />

      <div
        ref={menuRef}
        className="message-actions-menu"
        style={{
          top: position.y,
          left: isMe ? "auto" : position.x,
          right: isMe ? window.innerWidth - position.x : "auto"
        }}
      >
        <button className="message-actions-item" onClick={copyText}>
          <span>Copy text</span>
        </button>

        {/* Delete for me — available to anyone in the conversation */}
        <button
          className="message-actions-item danger"
          onClick={() => { onDeleteForMe(message._id); onClose(); }}
        >
          <span>Delete for me</span>
        </button>

        {/* Delete for everyone — sender only */}
        {isMe && (
          <button
            className="message-actions-item danger"
            onClick={() => { onDeleteForEveryone(message._id); onClose(); }}
          >
            <span>Delete for everyone</span>
          </button>
        )}
      </div>
    </>
  );
}