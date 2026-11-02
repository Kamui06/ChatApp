
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

// Convert MongoDB IDs or populated user objects into strings.
const getId = (value) => {
  if (value === null || value === undefined) return "";

  return String(
    typeof value === "object" ? value._id : value
  );
};

// Merge messages without adding duplicates.
const mergeMessages = (...groups) => {
  const messagesById = new Map();

  groups.flat().forEach((message) => {
    if (message?._id) {
      messagesById.set(getId(message._id), message);
    }
  });

  return Array.from(messagesById.values()).sort(
    (a, b) =>
      new Date(a.createdAt || 0).getTime() -
      new Date(b.createdAt || 0).getTime()
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

  // These refs keep event handlers up to date without reconnecting.
  const selectedUserRef = useRef(null);
  const conversationRequest = useRef(0);

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < MOBILE_BREAKPOINT;

  // Keep the selected conversation available to persistent socket listeners.
  selectedUserRef.current = selectedUser;

  // Load logged-in user.
  useEffect(() => {
    try {
      const storedUser = JSON.parse(localStorage.getItem("user"));
      setMe(storedUser);
    } catch (err) {
      console.error("Failed to load user:", err);
      setMe(null);
    }
  }, []);

  // =========================================================
  // SOCKET.IO: ONE CONNECTION AND ONE SET OF LISTENERS PER USER
  // =========================================================

  useEffect(() => {
    if (!me?._id) return;

    const myId = String(me._id);

    // Register the user whenever the socket connects or reconnects.
    const handleConnect = () => {
      console.log("Socket connected:", socket.id);

      socket.emit("user-online", myId);

      // Refresh the currently selected conversation after reconnecting.
      const currentUser = selectedUserRef.current;

      if (currentUser?._id) {
        const currentUserId = getId(currentUser._id);

        api
          .get(`/api/messages/${myId}/${currentUserId}`)
          .then((res) => {
            if (
              getId(selectedUserRef.current?._id) === currentUserId
            ) {
              setMessages((prev) =>
                mergeMessages(res.data, prev)
              );
            }
          })
          .catch((err) => {
            console.error("Reconnect message refresh failed:", err);
          });
      }
    };

    const handleDisconnect = (reason) => {
      console.log("Socket disconnected:", reason);
    };

    const handleConnectError = (err) => {
      console.error("Socket connection error:", err.message);
    };

    // Update online users.
    const handleOnlineUsers = (ids) => {
      setOnlineUsers(
        Array.isArray(ids) ? ids.map(String) : []
      );
    };

    // Receive messages in the currently selected conversation.
    const handleReceiveMessage = (msg) => {
      const currentUser = selectedUserRef.current;

      if (!currentUser?._id) return;

      const senderId = getId(msg.senderId);
      const receiverId = getId(msg.receiverId);
      const selectedId = getId(currentUser._id);

      const belongsToCurrentChat =
        (senderId === selectedId && receiverId === myId) ||
        (senderId === myId && receiverId === selectedId);

      if (!belongsToCurrentChat) return;

      setMessages((prev) => mergeMessages(prev, [msg]));
    };

    // Typing indicator.
    const handleTyping = (senderId) => {
      if (
        getId(selectedUserRef.current?._id) === getId(senderId)
      ) {
        setIsTyping(true);
      }
    };

    const handleStopTyping = (senderId) => {
      if (
        getId(selectedUserRef.current?._id) === getId(senderId)
      ) {
        setIsTyping(false);
      }
    };

    // Delete message for everyone.
    const handleMessageDeleted = (messageId) => {
      setMessages((prev) =>
        prev.filter(
          (message) => getId(message._id) !== getId(messageId)
        )
      );
    };

    // Clear current conversation.
    const handleChatCleared = () => {
      setMessages([]);
    };

    // Contact removed by another user.
    const handleContactRemoved = (removedByUserId) => {
      const removedId = getId(removedByUserId);

      setContacts((prev) =>
        prev.filter(
          (contact) => getId(contact._id) !== removedId
        )
      );

      if (
        getId(selectedUserRef.current?._id) === removedId
      ) {
        selectedUserRef.current = null;
        setSelectedUser(null);
        setMessages([]);
        setIsTyping(false);
      }
    };

    // Register listeners before connecting.
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    socket.on("online-users", handleOnlineUsers);
    socket.on("receive-message", handleReceiveMessage);
    socket.on("typing", handleTyping);
    socket.on("stop-typing", handleStopTyping);
    socket.on("message-deleted-everyone", handleMessageDeleted);
    socket.on("chat-cleared", handleChatCleared);
    socket.on("contact-removed", handleContactRemoved);

    // Start the connection.
    if (!socket.connected) {
      socket.connect();
    } else {
      // Socket was already connected.
      handleConnect();
    }

    // Load contacts.
    api
      .get(`/api/contacts/${myId}`)
      .then((res) => {
        setContacts(res.data);
      })
      .catch((err) => {
        console.error("Failed to load contacts:", err);
      });

    // Remove only this effect's listeners.
    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);

      socket.off("online-users", handleOnlineUsers);
      socket.off("receive-message", handleReceiveMessage);
      socket.off("typing", handleTyping);
      socket.off("stop-typing", handleStopTyping);
      socket.off("message-deleted-everyone", handleMessageDeleted);
      socket.off("chat-cleared", handleChatCleared);
      socket.off("contact-removed", handleContactRemoved);

      // Do not disconnect the shared socket when switching chats.
    };
  }, [me]);

  // =========================================================
  // LOAD CONVERSATION WHEN SELECTED USER CHANGES
  // =========================================================

  useEffect(() => {
    if (!me?._id || !selectedUser?._id) {
      conversationRequest.current++;
      setMessages([]);
      setIsTyping(false);
      return;
    }

    const requestId = ++conversationRequest.current;
    const myId = getId(me._id);
    const selectedId = getId(selectedUser._id);

    setMessages([]);
    setIsTyping(false);

    api
      .get(`/api/messages/${myId}/${selectedId}`)
      .then((res) => {
        // Ignore old requests if the user switched conversations.
        if (requestId !== conversationRequest.current) return;

        if (
          getId(selectedUserRef.current?._id) !== selectedId
        ) {
          return;
        }

        // Merge with messages received while the request was running.
        setMessages((prev) =>
          mergeMessages(res.data, prev)
        );
      })
      .catch((err) => {
        if (requestId === conversationRequest.current) {
          console.error("Failed to load conversation:", err);
        }
      });

    return () => {
      conversationRequest.current = requestId + 1;
    };
  }, [me, selectedUser]);

  // =========================================================
  // REFRESH WHEN THE USER RETURNS TO THE BROWSER TAB
  // =========================================================

  useEffect(() => {
    if (!me?._id) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;

      if (!socket.connected) {
        // handleConnect registers the user and refreshes the conversation.
        socket.connect();
        return;
      }

      const currentUser = selectedUserRef.current;

      if (!currentUser?._id) return;

      const selectedId = getId(currentUser._id);

      api
        .get(`/api/messages/${me._id}/${selectedId}`)
        .then((res) => {
          if (
            getId(selectedUserRef.current?._id) === selectedId
          ) {
            setMessages((prev) =>
              mergeMessages(res.data, prev)
            );
          }
        })
        .catch((err) => {
          console.error("Visibility refresh failed:", err);
        });
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [me]);

  // =========================================================
  // SIDEBAR RESIZING
  // =========================================================

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

  // =========================================================
  // CLEANUP TYPING TIMEOUT
  // =========================================================

  useEffect(() => {
    return () => {
      clearTimeout(typingTimeout.current);
    };
  }, []);

  // Scroll to the latest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages]);

  // =========================================================
  // SELECT CONVERSATION
  // =========================================================

  const handleSelectUser = (user) => {
    const previousUser = selectedUserRef.current;

    clearTimeout(typingTimeout.current);

    // Tell the previous conversation that typing stopped.
    if (previousUser?._id && me?._id) {
      socket.emit("stop-typing", {
        senderId: me._id,
        receiverId: previousUser._id
      });
    }

    selectedUserRef.current = user;

    setSelectedUser(user);
    setIsTyping(false);
    setActiveMessage(null);
    setHeaderOptions(null);

    if (!user) {
      setMessages([]);
    }

    if (isMobile) {
      setMobileSidebarOpen(false);
    }
  };

  // =========================================================
  // TYPING INDICATOR
  // =========================================================

  const handleTyping = (e) => {
    const value = e.target.value;
    setText(value);

    if (!selectedUser) return;

    const receiverId = selectedUser._id;

    socket.emit("typing", {
      senderId: me._id,
      receiverId
    });

    clearTimeout(typingTimeout.current);

    typingTimeout.current = setTimeout(() => {
      socket.emit("stop-typing", {
        senderId: me._id,
        receiverId
      });
    }, 1500);
  };

  // =========================================================
  // SEND MESSAGE
  // =========================================================

  const sendMessage = async () => {
    const messageText = text.trim();

    if (!messageText || !selectedUser) return;

    const receiverId = selectedUser._id;
    const receiverIdString = getId(receiverId);

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

      // Notify recipient through Socket.IO.
      socket.emit("send-message", savedMessage);

      // Update sender's screen only if the same chat is still selected.
      if (
        getId(selectedUserRef.current?._id) === receiverIdString
      ) {
        setMessages((prev) =>
          mergeMessages(prev, [savedMessage])
        );
      }

      setText("");
      setIsTyping(false);
    } catch (err) {
      console.error(
        "Failed to send message:",
        err.response?.data || err.message
      );
    }
  };

  // =========================================================
  // DELETE MESSAGE FOR EVERYONE
  // =========================================================

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
        prev.filter(
          (message) => getId(message._id) !== getId(messageId)
        )
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

  // =========================================================
  // DELETE MESSAGE FOR ME
  // =========================================================

  const deleteForMe = async (messageId) => {
    try {
      await api.delete(
        `/api/messages/${messageId}/me`,
        {
          data: { userId: me._id }
        }
      );

      setMessages((prev) =>
        prev.filter(
          (message) => getId(message._id) !== getId(messageId)
        )
      );
    } catch (err) {
      console.error(
        "Failed to delete for me:",
        err.response?.data || err.message
      );
    }
  };

  // =========================================================
  // MESSAGE ACTIONS
  // =========================================================

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

  // =========================================================
  // CLEAR CHAT
  // =========================================================

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

  // =========================================================
  // REMOVE CONTACT
  // =========================================================

  const handleRemoveUser = () => {
    setHeaderOptions(null);
    setShowRemoveConfirm(true);
  };

  const confirmRemoveUser = async () => {
    if (!selectedUser) return;

    const removedUserId = selectedUser._id;

    try {
      await api.delete("/api/contacts/remove", {
        data: {
          userId: me._id,
          contactId: removedUserId
        }
      });

      socket.emit("remove-contact", {
        removedUserId,
        byUserId: me._id
      });

      setContacts((prev) =>
        prev.filter(
          (contact) => getId(contact._id) !== getId(removedUserId)
        )
      );

      selectedUserRef.current = null;

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

  // =========================================================
  // LOADING
  // =========================================================

  if (!me) {
    return <div className="chat-loading">Loading...</div>;
  }

  // =========================================================
  // UI
  // =========================================================

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
        <button
          type="button"
          className="chat-mobile-backdrop"
          aria-label="Close navigation menu"
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
              const isMe =
                getId(m.senderId) === getId(me._id);

              return (
                <div
                  key={m._id || i}
                  className={`chat-message-row ${
                    isMe ? "me" : "them"
                  }`}
                >
                  <button
                    type="button"
                    onClick={(e) =>
                      handleMessageClick(e, m, isMe)
                    }
                    className={`chat-bubble ${
                      isMe ? "me" : "them"
                    } ${isMobile ? "mobile" : ""}`}
                  >
                    {m.text}
                  </button>
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
                  void sendMessage();
                }
              }}
              placeholder={`Message ${selectedUser.username}...`}
            />

            <button
              className={`chat-send-btn ${
                text.trim() ? "active" : ""
              }`}
              onClick={() => void sendMessage()}
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
