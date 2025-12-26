import type { FormEvent, ReactElement } from "react";
import type { ConnectionStatus } from "./hooks/useRoomSocket";
import type { ChatMessage } from "./types/chat";

type ChatSidebarProps = {
	conversation: ChatMessage[];
	chatInput: string;
	onChatInputChange: (value: string) => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	connectionStatus: ConnectionStatus;
	roomId?: string;
	onReconnect?: () => void;
};

export default function ChatSidebar({
	conversation,
	chatInput,
	onChatInputChange,
	onSubmit,
 	connectionStatus,
	roomId,
	onReconnect,
}: ChatSidebarProps): ReactElement {
	const statusLabel: Record<ConnectionStatus, string> = {
		idle: "Idle",
		connecting: "Connecting",
		ready: "Live",
		error: "Offline",
	};
	const isOffline = connectionStatus !== "ready";

	return (
		<section className="panel chat-panel">
			<header>
				<div>
					<p className="eyebrow">Chat</p>
					<h3>Questions & recommendations</h3>
				</div>
				<div className="chat-status">
					<span className="room-label">Room {roomId ?? "—"}</span>
					<span className={`connection-pill ${connectionStatus}`}>
						{statusLabel[connectionStatus]}
					</span>
					{isOffline && onReconnect && (
						<button type="button" onClick={onReconnect} className="ghost">
							Reconnect
						</button>
					)}
				</div>
			</header>
			<div className="conversation-box">
				{conversation.length ? (
					<ol className="conversation-feed">
						{conversation.map((entry) => (
							<li
								key={entry.id}
								className={`chat-row ${entry.role}`}
								data-role={entry.role}
							>
								<span>{entry.role === "user" ? "You" : "Chef"}</span>
								<p>{entry.content}</p>
							</li>
						))}
					</ol>
				) : (
					<p className="muted">
						Ask anything about pantry finds or get a suggestion.
					</p>
				)}
			</div>
			<form className="chat-form" onSubmit={onSubmit}>
				<input
					type="text"
					placeholder="Ask for a recommendation or cooking tip"
					value={chatInput}
					onChange={(event) => onChatInputChange(event.target.value)}
				/>
				<button type="submit" disabled={!chatInput.trim() || isOffline}>
					Send
				</button>
			</form>
		</section>
	);
}
