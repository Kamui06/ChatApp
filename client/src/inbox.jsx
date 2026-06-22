import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { socket } from "./socket";
import ConfirmDialog from "./confirmDialogue";
import "./inbox.css";

export default function Inbox() {
  const navigate = useNavigate();
  const [me, setMe]             = useState(null);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [tab, setTab]           = useState("incoming");
  const [loading, setLoading]   = useState(true);
  const [confirmAction, setConfirmAction] = useState(null);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    setMe(storedUser);
  }, []);

  const fetchAll = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    try {
      const [inc, out] = await Promise.all([
        axios.get(`/api/requests/inbox/${me._id}`),
        axios.get(`/api/requests/sent/${me._id}`)
      ]);
      setIncoming(inc.data);
      setOutgoing(out.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [me]);

  useEffect(() => {
    if (!me) return;

    fetchAll();

    socket.on("new-request", () => fetchAll());
    return () => socket.off("new-request");
  }, [me, fetchAll]);

  const accept = async (requestId) => {
    try {
      await axios.post(`/api/requests/accept/${requestId}`);
      setIncoming(prev => prev.filter(r => r._id !== requestId));
    } catch (err) {
      console.error(err);
    }
  };

  const decline = async (requestId) => {
    try {
      await axios.post(`/api/requests/decline/${requestId}`);
      setIncoming(prev => prev.filter(r => r._id !== requestId));
    } catch (err) {
      console.error(err);
    }
  };

  const cancel = async (requestId) => {
    try {
      await axios.delete(`/api/requests/cancel/${requestId}`);
      setOutgoing(prev => prev.filter(r => r._id !== requestId));
    } catch (err) {
      console.error(err);
    }
  };

  const timeAgo = (date) => {
    const diff = Math.floor((Date.now() - new Date(date)) / 1000);
    if (diff < 60)    return `${diff}s ago`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  if (!me) {
    return <div className="inbox-loading">Loading...</div>;
  }

  return (
    <div className="inbox-page">

      {/* Top Bar */}
      <div className="inbox-topbar">
        <button className="inbox-back-btn" onClick={() => navigate("/chat")}>
          Back to Chat
        </button>
        <h2 className="inbox-title">Request Inbox</h2>
      </div>

      <div className="inbox-content">

        {/* Tabs */}
        <div className="inbox-tabs">
          {["incoming", "outgoing"].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`inbox-tab ${tab === t ? "active" : ""}`}
            >
              {t === "incoming" ? `Incoming` : `Sent`}
              {t === "incoming" && incoming.length > 0 && (
                <span className={`inbox-tab-badge ${tab === "incoming" ? "active" : ""}`}>
                  {incoming.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="inbox-loading-state">Loading...</div>
        ) : tab === "incoming" ? (
          <>
            {incoming.length === 0 ? (
              <div className="inbox-empty-state">
                <p>No pending requests</p>
              </div>
            ) : (
              incoming.map(r => (
                <div key={r._id} className="inbox-card">
                  <div className="inbox-avatar incoming">
                    {r.senderId.username[0].toUpperCase()}
                  </div>

                  <div className="inbox-card-info">
                    <p className="inbox-card-name">{r.senderId.username}</p>
                    <p className="inbox-card-meta">
                      Wants to chat · {timeAgo(r.createdAt)}
                    </p>
                  </div>

                  <div className="inbox-card-actions">
                    <button
                      className="inbox-btn accept"
                      onClick={() => setConfirmAction({ type: "accept", request: r })}
                    >
                      Accept
                    </button>
                    <button
                      className="inbox-btn decline"
                      onClick={() => setConfirmAction({ type: "decline", request: r })}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        ) : (
          <>
            {outgoing.length === 0 ? (
              <div className="inbox-empty-state">
                <p>No sent requests</p>
              </div>
            ) : (
              outgoing.map(r => (
                <div key={r._id} className="inbox-card">
                  <div className="inbox-avatar outgoing">
                    {r.receiverId.username[0].toUpperCase()}
                  </div>

                  <div className="inbox-card-info">
                    <p className="inbox-card-name">{r.receiverId.username}</p>
                    <p className="inbox-card-meta">
                      Request pending · {timeAgo(r.createdAt)}
                    </p>
                  </div>

                  <span className="inbox-pending-badge">Pending</span>

                  <button className="inbox-btn cancel" onClick={() => cancel(r._id)}>
                    Cancel
                  </button>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.type === "accept" ? "Accept invite?" : "Decline invite?"}
          message={
            confirmAction.type === "accept"
              ? `Do you want to accept ${confirmAction.request.senderId.username}'s invite?`
              : `Do you want to decline ${confirmAction.request.senderId.username}'s invite?`
          }
          confirmLabel={confirmAction.type === "accept" ? "Accept" : "Decline"}
          danger={confirmAction.type === "decline"}
          onConfirm={() => {
            if (confirmAction.type === "accept") accept(confirmAction.request._id);
            else decline(confirmAction.request._id);
            setConfirmAction(null);
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}