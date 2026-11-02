
import { useEffect, useRef, useState, useCallback } from "react";
import api from "./api";
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

// Convert either a MongoDB ID string or populated user object to a string ID.
const getId = (value) => {
  if (value === null || value === undefined) return "";
  return String(
    typeof value === "object" ? value._id : value
  );
};

export default function Chat() {
  const [me, setMe] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [activeMessage, setActiveMessage] = useState(null);
  const [headerOptions, setHeaderOptions] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const bottomRef = useRef(null);
  const typingTimeout = useRef(null);
  const isResizing = useRef(false);

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < MOBILE_BREAKPOINT;

  // Load logged-in user
  useEffect(() => {
    try {
      const storedUser = JSON.parse(localStorage.getItem("user"));
      setMe(storedUser);
    } catch (err) {
      console.error("Failed to load user:", err);
      setMe(null);
    }
  }, []);

  // Main Socket.IO connection and event listeners
  useEffect(() => {
    if (!me?._id) return;

    const myId = String(me._id);
    const selectedUserId = getId(selectedUser?._id);

    // Called on initial connection and every reconnection
    const handleConnect = () => {
      console.log("Socket connected:", socket.id);

      // Register this user with the backend
      socket.emit("user-online", myId);

      // Refresh the open conversation after reconnecting
      if (selectedUserId) {
        api
          .get(`/api/messages/${myId}/${selectedUserId}`)
          .then((res) => {
            setMessages(res.data);
          })
          .catch((err) => {
            console.error("Failed to refresh messages:", err);
          });
      }
    };

    const handleOnlineUsers = (ids) => {
      setOnlineUsers(Array.isArray(ids) ? ids.map(String) : []);
    };

    // Receive messages in the currently selected conversation only
    const handleReceiveMessage = (msg) => {
      const senderId = getId(msg.senderId);
      const receiverId = getId(msg.receiverId);

      const belongsToSelectedChat =
        selectedUserId &&
        (
          (senderId === selectedUserId && receiverId === myId) ||
          (senderId === myId && receiverId === selectedUserId)
        );

      if (!belongsToSelectedChat) return;

      setMessages((prev) => {
        // Avoid adding the same message twice
        const alreadyExists = prev.some(
          (message) => getId(message._id) === getId(msg._id)
        );

        if (alreadyExists) return prev;

        return [...prev, msg];
      });
    };

    const handleTypingEvent = (senderId) => {
      if (getId(senderId) === selectedUserId) {
        setIsTyping(true);
      }
    };

    const handleStopTyping = (senderId) => {
      if (getId(senderId) === selectedUserId) {
        setIsTyping(false);
      }
    };

    const handleMessageDeleted = (messageId) => {
      setMessages((prev) =>
        prev.filter(
          (message) => getId(message._id) !== getId(messageId)
        )
      );
    };

    const handleChatCleared = () => {
      setMessages([]);
    };

    const handleContactRemoved = (removedByUserId) => {
      const removedById = getId(removedByUserId);

      setContacts((prev) =>
        prev.filter((contact) => getId(contact._id) !== removedById)
      );

      if (selectedUserId === removedById) {
        setSelectedUser(null);
        setMessages([]);
        setIsTyping(false);
      }
    };

    // Register event listeners
    socket.on("connect", handleConnect);
    socket.on("online-users", handleOnlineUsers);
    socket.on("receive-message", handleReceiveMessage);
    socket.on("typing", handleTypingEvent);
    socket.on("stop-typing", handleStopTyping);
    socket.on("message-deleted-everyone", handleMessageDeleted);
    socket.on("chat-cleared", handleChatCleared);
    socket.on("contact-removed", handleContactRemoved);

    // Start the connection if it is not already connected
    if (!socket.connected) {
      socket.connect();
    } else {
      // The socket was already connected before these listeners were added
      handleConnect();
    }

    // Load contacts
    api
      .get(`/api/contacts/${myId}`)
      .then((res) => setContacts(res.data))
      .catch((err) => {
        console.error("Failed to load contacts:", err);
      });

    // Remove only the listeners registered by this effect
    return () => {
      socket.off("connect", handleConnect);
      socket.off("online-users", handleOnlineUsers);
      socket.off("receive-message", handleReceiveMessage);
      socket.off("typing", handleTypingEvent);
      socket.off("stop-typing", handleStopTyping);
      socket.off("message-deleted-everyone", handleMessageDeleted);
      socket.off("chat-cleared", handleChatCleared);
      socket.off("contact-removed", handleContactRemoved);
    };
  }, [me, selectedUser]);

  // Refresh messages when the browser tab becomes visible again
  useEffect(() => {
    if (!me?._id) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;

      if (!socket.connected) {
        // The connect event will register the user and refresh the chat
        socket.connect();
        return;
      }

      if (selectedUser?._id) {
        api
          .get(`/api/messages/${me._id}/${selectedUser._id}`)
          .then((res) => setMessages(res.data))
          .catch((err) => {
            console.error("Failed to refresh conversation:", err);
          });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [me, selectedUser]);

  // Sidebar resizing
  const handleResizeStart = useCallback((e) => {
    e.preventDefault();

    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing.current) return;

      const newWidth = Math.min(
        MAX_SIDEBAR_WIDTH,
        Math.max(MIN_SIDEBAR_WIDTH, e.clientX)
      );

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

      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  // Clear typing timeout when component unmounts
  useEffect(() => {
    return () => {
      clearTimeout(typingTimeout.current);
    };
  }, []);

  // Automatically scroll to the latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Select a conversation and load its message history
  const handleSelectUser = async (user) => {
    clearTimeout(typingTimeout.current);

    setSelectedUser(user);
    setIsTyping(false);
    setActiveMessage(null);
    setHeaderOptions(null);

    if (!user) {
      setMessages([]);
      return;
    }

    setMessages([]);

    try {
      const res = await api.get(
        `/api/messages/${me._id}/${user._id}`
      );

      // Don't display an older request if the user switched chats
      setMessages((prev) => {
        if (getId(selectedUser?._id) !== getId(user._id)) {
          return prev;
        }

        return res.data;
      });
    } catch (err) {
      console.error("Failed to load conversation:", err);
    }
  };

  // Typing indicator
  const handleTyping = (e) => {
    const value = e.target.value;
    setText(value);

    if (!selectedUser) return;

    socket.emit("typing", {
      senderId: me._id,
      receiverId: selectedUser._id
    });

    clearTimeout(typingTimeout.current);

    typingTimeout.current = setTimeout(() => {
      socket.emit("stop-typing", {
        senderId: me._id,
        receiverId: selectedUser._id
      });
    }, 1500);
  };

  // Send message
  const sendMessage = async () => {
    const messageText = text.trim();

    if (!messageText || !selectedUser) return;

    const receiverId = selectedUser._id;

    try {
      clearTimeout(typingTimeout.current);

      socket.emit("stop-typing", {
        senderId: me._id,
        receiverId
      });

      const res = await api.post("/api/messages", {
        senderId: me._id,
        receiverId,
        text: messageText
      });

      const savedMessage = res.data;

      // Add message to sender's screen
      setMessages((prev) => {
        const alreadyExists = prev.some(
          (message) => getId(message._id) === getId(savedMessage._id)
        );

        if (alreadyExists) return prev;

        return [...prev, savedMessage];
      });

      // Notify the recipient in real time
      socket.emit("send-message", savedMessage);

      setText("");
      setIsTyping(false);
    } catch (err) {
      console.error(
        "Failed to send message:",
        err.response?.data || err.message
      );
    }
  };

  // Delete message for everyone
  const deleteForEveryone = async (messageId) => {
    if (!selectedUser) return;

    try {
      await api.delete(
        `/api/messages/${messageId}/everyone`,
        {
          data: { userId: me._id }
        }
      );

      setMessages((prev) =>
        prev.filter((message) => getId(message._id) !== getId(messageId))
      );

      socket.emit("delete-message-everyone", {
        messageId,
        receiverId: selectedUser._id
      });
    } catch (err) {
      console.error(
        "Failed to delete for everyone:",
        err.response?.data || err.message
      );
    }
  };

  // Delete message only for the current user
  const deleteForMe = async (messageId) => {
    try {
      await api.delete(
        `/api/messages/${messageId}/me`,
        {
          data: { userId: me._id }
        }
      );

      setMessages((prev) =>
        prev.filter((message) => getId(message._id) !== getId(messageId))
      );
    } catch (err) {
      console.error(
        "Failed to delete for me:",
        err.response?.data || err.message
      );
    }
  };

  // Open message actions
  const handleMessageClick = (e, message, isMe) => {
    const rect = e.currentTarget.getBoundingClientRect();

    setActiveMessage({
      message,
      isMe,
      position: {
        x: isMe ? rect.left : rect.right,
        y: rect.bottom + 6
      }
    });
  };

  // Clear conversation
  const handleClearChat = async () => {
    if (!selectedUser) return;

    try {
      await api.delete(
        `/api/messages/clear/${me._id}/${selectedUser._id}`
      );

      setMessages([]);

      socket.emit("clear-chat", {
        receiverId: selectedUser._id
      });

      setHeaderOptions(null);
    } catch (err) {
      console.error(
        "Failed to clear chat:",
        err.response?.data || err.message
      );
    }
  };

  // Open remove-contact confirmation
  const handleRemoveUser = () => {
    setHeaderOptions(null);
    setShowRemoveConfirm(true);
  };

  // Confirm contact removal
  const confirmRemoveUser = async () => {
    if (!selectedUser) return;

    try {
      await api.delete("/api/contacts/remove", {
        data: {
          userId: me._id,
          contactId: selectedUser._id
        }
      });

      socket.emit("remove-contact", {
        removedUserId: selectedUser._id,
        byUserId: me._id
      });

      setContacts((prev) =>
        prev.filter(
          (contact) => getId(contact._id) !== getId(selectedUser._id)
        )
      );

      setSelectedUser(null);
      setMessages([]);
      setIsTyping(false);
    } catch (err) {
      console.error(
        "Failed to remove user:",
        err.response?.data || err.message
      );
    } finally {
      setShowRemoveConfirm(false);
    }
  };

  if (!me) {
    return <div className="chat-loading">Loading...</div>;
  }

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
        <div
          className="chat-mobile-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {selectedUser ? (
        <div className="chat-main">

          <Header
            selectedUser={selectedUser}
            onlineUsers={onlineUsers}
            onOpenOptions={(position) =>
              setHeaderOptions({ position })
            }
            isMobile={isMobile}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
          />

          <div className="chat-messages">

            {messages.length === 0 && (
              <div className="chat-empty-state">
                No messages yet
              </div>
            )}

            {messages.map((m, i) => {
              const isMe = getId(m.senderId) === getId(me._id);

              return (
                <div
                  key={m._id || i}
                  className={`chat-message-row ${isMe ? "me" : "them"}`}
                >
                  <div
                    onClick={(e) => handleMessageClick(e, m, isMe)}
                    className={`chat-bubble ${isMe ? "me" : "them"} ${
                      isMobile ? "mobile" : ""
                    }`}
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
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={`Message ${selectedUser.username}...`}
            />

            <button
              className={`chat-send-btn ${
                text.trim() ? "active" : ""
              }`}
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

          <p className="title">
            Select a chat to start messaging
          </p>

          <p className="subtitle">
            Search for users in the sidebar to add them
          </p>
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

      {headerOptions && selectedUser && (
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
