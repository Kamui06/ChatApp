import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { socket } from "./socket";
import ConfirmDialog from "./confirmDialogue";
import "./sidebar.css";

export default function Sidebar({
  contacts, setContacts, selectedUser, onSelectUser, onlineUsers, me,
  width, onResizeStart, isMobile, isOpen, onClose
}) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery]     = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching]     = useState(false);
  const [requestError, setRequestError]   = useState("");
  const [sentIds, setSentIds]             = useState([]);
  const [inboxCount, setInboxCount]       = useState(0);
  const searchTimeout                     = useRef(null);
  const searchRef                         = useRef(null);
  const [confirmInvite, setConfirmInvite] = useState(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);

  const fetchInboxCount = useCallback(async () => {
    try {
      const res = await axios.get(`/api/requests/count/${me._id}`);
      setInboxCount(res.data.count);
    } catch {}
  }, [me._id]);

  useEffect(() => {
    fetchInboxCount();
    socket.on("new-request", () => fetchInboxCount());
    return () => socket.off("new-request");
  }, [fetchInboxCount]);

  useEffect(() => {
    const handleClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchResults([]);
        setSearchQuery("");
        setRequestError("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSearch = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    setRequestError("");

    if (!q.trim()) { setSearchResults([]); return; }

    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await axios.get(`/api/contacts/search/${me._id}/${q.trim()}`);
        setSearchResults(res.data);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);
  };

  const sendRequest = async (user) => {
    setRequestError("");
    try {
      await axios.post("/api/requests/send", {
        senderId: me._id,
        receiverId: user._id
      });
      setSentIds(prev => [...prev, user._id]);
      socket.emit("send-request", { receiverId: user._id });
      setSearchResults(prev => prev.filter(u => u._id !== user._id));
    } catch (err) {
      setRequestError(err.response?.data?.error || "Failed to send request");
    }
  };

  const askRemoveContact = (e, user) => {
    e.stopPropagation();
    setConfirmRemove(user);
  };

  const confirmRemoveContact = async () => {
    if (!confirmRemove) return;
    const contactId = confirmRemove._id;
    try {
      await axios.delete("/api/contacts/remove", {
        data: { userId: me._id, contactId }
      });
      socket.emit("remove-contact", { removedUserId: contactId, byUserId: me._id });
      setContacts(prev => prev.filter(c => c._id !== contactId));
      if (selectedUser?._id === contactId) onSelectUser(null);
    } catch {
    } finally {
      setConfirmRemove(null);
    }
  };

  const logout = () => {
    localStorage.clear();
    socket.disconnect();
    navigate("/login");
  };

  const handleSelectAndClose = (user) => {
    onSelectUser(user);
    if (isMobile) onClose();
  };

  const sidebarClass = isMobile
    ? `sidebar mobile ${isOpen ? "open" : "closed"}`
    : "sidebar";

  return (
    <div className={sidebarClass} style={!isMobile ? { width } : undefined}>

      {isMobile && (
        <div className="sidebar-mobile-close-row">
          <button className="sidebar-mobile-close-btn" onClick={onClose}>✕</button>
        </div>
      )}

      {/* Profile Header */}
      <div className="sidebar-profile">
        <div>
          <p className="sidebar-profile-label">Logged in as</p>
          <p className="sidebar-profile-name">@{me.username}</p>
        </div>

        <button
          className="sidebar-inbox-btn"
          onClick={() => navigate("/inbox")}
          title="Request Inbox"
        >
          Inbox
          {inboxCount > 0 && (
            <span className="sidebar-inbox-badge">
              {inboxCount > 9 ? "9+" : inboxCount}
            </span>
          )}
        </button>
      </div>

      {/* Search Bar */}
      <div ref={searchRef} className="sidebar-search-wrapper">
        <div className="sidebar-search-input-wrapper">
          <input
            className="sidebar-search-input"
            value={searchQuery}
            onChange={handleSearch}
            placeholder="Search users to invite..."
          />
          {searchQuery && (
            <span
              className="sidebar-search-clear"
              onClick={() => { setSearchQuery(""); setSearchResults([]); setRequestError(""); }}
            >
              Clear
            </span>
          )}
        </div>

        {(searchResults.length > 0 || isSearching || (searchQuery && !isSearching)) && (
          <div className="sidebar-search-dropdown">
            {isSearching && (
              <p className="sidebar-search-message">Searching...</p>
            )}
            {!isSearching && searchResults.length === 0 && searchQuery && (
              <p className="sidebar-search-message">No users found</p>
            )}
            {searchResults.map(u => (
              <div key={u._id} className="sidebar-search-result">
                <div className="sidebar-search-result-avatar">
                  {u.username[0].toUpperCase()}
                </div>
                <span className="sidebar-search-result-name">{u.username}</span>

                {sentIds.includes(u._id) ? (
                  <span className="sidebar-sent-label">✓ Sent</span>
                ) : (
                  <button className="sidebar-invite-btn" onClick={() => setConfirmInvite(u)}>
                    Invite
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {requestError && <p className="sidebar-request-error">{requestError}</p>}
      </div>

      <p className="sidebar-chats-label">Chats</p>

      <div className="sidebar-contact-list">
        {contacts.length === 0 && (
          <p className="sidebar-empty-hint">
            Search for users above and send them an invite to start chatting
          </p>
        )}

        {contacts.map(u => (
          <div
            key={u._id}
            onClick={() => handleSelectAndClose(u)}
            className={`sidebar-contact-row ${selectedUser?._id === u._id ? "selected" : ""}`}
          >
            <div className="sidebar-contact-avatar">
              {u.username[0].toUpperCase()}
              <div className={`sidebar-contact-status-dot ${onlineUsers.includes(u._id) ? "online" : "offline"}`} />
            </div>

            <div className="sidebar-contact-info">
              <p className="sidebar-contact-name">{u.username}</p>
              <p className={`sidebar-contact-status-text ${onlineUsers.includes(u._id) ? "online" : "offline"}`}>
                {onlineUsers.includes(u._id) ? "Online" : "Offline"}
              </p>
            </div>

            <button
              className="sidebar-remove-btn"
              onClick={(e) => askRemoveContact(e, u)}
              title="Remove contact"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <button className="sidebar-logout-btn" onClick={() => setConfirmLogout(true)}>
        Logout
      </button>

      {/* Resize handle — desktop only */}
      {!isMobile && (
        <div className="sidebar-resize-handle" onMouseDown={onResizeStart} />
      )}

      {/* Confirm: send invite */}
      {confirmInvite && (
        <ConfirmDialog
          title="Send chat invite?"
          message={`Do you want to send a chat invite to ${confirmInvite.username}?`}
          confirmLabel="Send Invite"
          onConfirm={() => {
            sendRequest(confirmInvite);
            setConfirmInvite(null);
          }}
          onCancel={() => setConfirmInvite(null)}
        />
      )}

      {/* Confirm: remove contact */}
      {confirmRemove && (
        <ConfirmDialog
          title="Remove contact?"
          message={`Do you want to remove ${confirmRemove.username}? This will delete your chat history with them.`}
          confirmLabel="Remove"
          danger
          onConfirm={confirmRemoveContact}
          onCancel={() => setConfirmRemove(null)}
        />
      )}

      {/* Confirm: logout */}
      {confirmLogout && (
        <ConfirmDialog
          title="Log out?"
          message="Do you want to log out of your account?"
          confirmLabel="Log out"
          danger
          onConfirm={logout}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
    </div>
  );
}