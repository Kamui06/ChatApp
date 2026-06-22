import { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import { socket } from "./socket";
import Sidebar from "./sidebar";
import Header from "./header";
import MessageActions from "./messageActions";
import HeaderOptions from "./headerOptions";
import ConfirmDialog from "./confirmDialogue";
import useWindowWidth from "./useWindowWidth";
import "./chat.css";

const MOBILE_BREAKPOINT = 768;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 480;

export default function Chat() {
  const [me, setMe]                     = useState(null);
  const [contacts, setContacts]         = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages]         = useState([]);
  const [text, setText]                 = useState("");
  const [onlineUsers, setOnlineUsers]   = useState([]);
  const [isTyping, setIsTyping]         = useState(false);
  const [activeMessage, setActiveMessage] = useState(null);
  const [headerOptions, setHeaderOptions] = useState(null);
  const [sidebarWidth, setSidebarWidth]   = useState(280);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const bottomRef                       = useRef(null);
  const typingTimeout                   = useRef(null);
  const isResizing                      = useRef(false);

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < MOBILE_BREAKPOINT;

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    setMe(storedUser);
  }, []);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing.current) return;
      const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, e.clientX));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    if (!me) return;

    socket.emit("user-online", me._id);

    socket.on("online-users", (ids) => setOnlineUsers(ids));
    socket.on("receive-message", (msg) => setMessages(prev => [...prev, msg]));
    socket.on("typing",      (senderId) => { if (selectedUser?._id === senderId) setIsTyping(true);  });
    socket.on("stop-typing", (senderId) => { if (selectedUser?._id === senderId) setIsTyping(false); });

    socket.on("message-deleted-everyone", (messageId) => {
      setMessages(prev => prev.filter(m => m._id !== messageId));
    });

    socket.on("chat-cleared", () => setMessages([]));

    socket.on("contact-removed", (removedByUserId) => {
      setContacts(prev => prev.filter(c => c._id !== removedByUserId));
      setSelectedUser(prev => (prev?._id === removedByUserId ? null : prev));
      setMessages(prev => (selectedUser?._id === removedByUserId ? [] : prev));
    });

    axios.get(`/api/contacts/${me._id}`).then(r => setContacts(r.data));

    return () => {
      socket.off("online-users");
      socket.off("receive-message");
      socket.off("typing");
      socket.off("stop-typing");
      socket.off("message-deleted-everyone");
      socket.off("chat-cleared");
      socket.off("contact-removed");
    };
  }, [selectedUser, me]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!me) {
    return <div className="chat-loading">Loading...</div>;
  }

  const handleSelectUser = async (user) => {
    setSelectedUser(user);
    setIsTyping(false);
    setActiveMessage(null);
    setHeaderOptions(null);
    if (user) {
      const res = await axios.get(`/api/messages/${me._id}/${user._id}`);
      setMessages(res.data);
    }
  };

  const handleTyping = (e) => {
    setText(e.target.value);
    if (selectedUser) {
      socket.emit("typing", { senderId: me._id, receiverId: selectedUser._id });
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => {
        socket.emit("stop-typing", { senderId: me._id, receiverId: selectedUser._id });
      }, 1500);
    }
  };

  const sendMessage = async () => {
    if (!text.trim() || !selectedUser) return;
    const msg = { senderId: me._id, receiverId: selectedUser._id, text };
    socket.emit("stop-typing", { senderId: me._id, receiverId: selectedUser._id });
    const res = await axios.post("/api/messages", msg);
    socket.emit("send-message", { ...msg, _id: res.data._id });
    setMessages(prev => [...prev, res.data]);
    setText("");
  };

  const deleteForEveryone = async (messageId) => {
    try {
      await axios.delete(`/api/messages/${messageId}/everyone`, { data: { userId: me._id } });
      setMessages(prev => prev.filter(m => m._id !== messageId));
      socket.emit("delete-message-everyone", { messageId, receiverId: selectedUser._id });
    } catch (err) {
      console.error("Failed to delete for everyone:", err.response?.data || err.message);
    }
  };

  const deleteForMe = async (messageId) => {
    try {
      await axios.delete(`/api/messages/${messageId}/me`, { data: { userId: me._id } });
      setMessages(prev => prev.filter(m => m._id !== messageId));
    } catch (err) {
      console.error("Failed to delete for me:", err.response?.data || err.message);
    }
  };

  const handleMessageClick = (e, message, isMe) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setActiveMessage({
      message, isMe,
      position: { x: isMe ? rect.left : rect.right, y: rect.bottom + 6 }
    });
  };

  const handleClearChat = async () => {
    if (!selectedUser) return;
    try {
      await axios.delete(`/api/messages/clear/${me._id}/${selectedUser._id}`);
      setMessages([]);
      socket.emit("clear-chat", { receiverId: selectedUser._id });
      setHeaderOptions(null);
    } catch (err) {
      console.error("Failed to clear chat:", err.response?.data || err.message);
    }
  };

  const handleRemoveUser = () => {
    setHeaderOptions(null);
    setShowRemoveConfirm(true);
  };

  const confirmRemoveUser = async () => {
    if (!selectedUser) return;
    try {
      await axios.delete("/api/contacts/remove", {
        data: { userId: me._id, contactId: selectedUser._id }
      });
      socket.emit("remove-contact", { removedUserId: selectedUser._id, byUserId: me._id });
      setContacts(prev => prev.filter(c => c._id !== selectedUser._id));
      setSelectedUser(null);
      setMessages([]);
    } catch (err) {
      console.error("Failed to remove user:", err.response?.data || err.message);
    } finally {
      setShowRemoveConfirm(false);
    }
  };

  return (
    <div className="chat-container">

      <Sidebar
        me={me}
        contacts={contacts}
        setContacts={setContacts}
        selectedUser={selectedUser}
        onSelectUser={handleSelectUser}
        onlineUsers={onlineUsers}
        width={sidebarWidth}
        onResizeStart={handleResizeStart}
        isMobile={isMobile}
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      {isMobile && mobileSidebarOpen && (
        <div className="chat-mobile-backdrop" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {selectedUser ? (
        <div className="chat-main">

          <Header
            selectedUser={selectedUser}
            onlineUsers={onlineUsers}
            onOpenOptions={(position) => setHeaderOptions({ position })}
            isMobile={isMobile}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
          />

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty-state">No messages yet</div>
            )}

            {messages.map((m, i) => {
              const isMe = m.senderId === me._id || m.senderId?._id === me._id;
              return (
                <div key={m._id || i} className={`chat-message-row ${isMe ? "me" : "them"}`}>
                  <div
                    onClick={(e) => handleMessageClick(e, m, isMe)}
                    className={`chat-bubble ${isMe ? "me" : "them"} ${isMobile ? "mobile" : ""}`}
                  >
                    {m.text}
                  </div>
                </div>
              );
            })}

            {isTyping && (
              <div className="chat-typing-indicator">
                {selectedUser.username} is typing...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="chat-input-bar">
            <input
              className="chat-input"
              value={text}
              onChange={handleTyping}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder={`Message ${selectedUser.username}...`}
            />
            <button
              className={`chat-send-btn ${text.trim() ? "active" : ""}`}
              onClick={sendMessage}
              disabled={!text.trim()}
            >
              Send
            </button>
          </div>
        </div>

      ) : (
        <div className="chat-no-selection">
          {isMobile && (
            <button
              className="chat-mobile-open-btn"
              onClick={() => setMobileSidebarOpen(true)}
            >
              Chats
            </button>
          )}
          <p className="title">Select a chat to start messaging</p>
          <p className="subtitle">Search for users in the sidebar to add them</p>
        </div>
      )}

      {activeMessage && (
        <MessageActions
          message={activeMessage.message}
          position={activeMessage.position}
          isMe={activeMessage.isMe}
          onClose={() => setActiveMessage(null)}
          onDeleteForEveryone={deleteForEveryone}
          onDeleteForMe={deleteForMe}
        />
      )}

      {headerOptions && (
        <HeaderOptions
          position={headerOptions.position}
          username={selectedUser.username}
          onClose={() => setHeaderOptions(null)}
          onClearChat={handleClearChat}
          onRemoveUser={handleRemoveUser}
        />
      )}

      {showRemoveConfirm && selectedUser && (
        <ConfirmDialog
          title="Remove contact?"
          message={`Do you want to remove ${selectedUser.username}? This will delete your chat history with them.`}
          confirmLabel="Remove"
          danger
          onConfirm={confirmRemoveUser}
          onCancel={() => setShowRemoveConfirm(false)}
        />
      )}
    </div>
  );
}