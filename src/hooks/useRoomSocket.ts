import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "../types/chat";

export type ConnectionStatus = "idle" | "connecting" | "ready" | "error";

type ServerMsg =
	| {
			type: "message_added";
			role: "user" | "assistant";
			id: string;
			text: string;
			ts: number;
	  }
	| { type: "assistant_delta"; id: string; text: string }
	| { type: "assistant_done"; id: string }
	| { type: "error"; message: string };

type UseRoomSocketOptions = {
	displayName?: string;
	wsBaseUrl?: string;
	onError?: (message: string) => void;
};

type UseRoomSocketResult = {
	conversation: ChatMessage[];
	status: ConnectionStatus;
	sendUserMessage: (text: string) => boolean;
	clearConversation: () => void;
	reconnect: () => void;
};

const toWsOrigin = (input: string): string => {
	try {
		const base =
			typeof window !== "undefined"
				? window.location.origin
				: "http://localhost";
		const url = new URL(input, base);
		if (url.protocol === "http:") {
			url.protocol = "ws:";
		} else if (url.protocol === "https:") {
			url.protocol = "wss:";
		}
		return url.origin.replace(/\/$/, "");
	} catch {
		return input.replace(/\/$/, "");
	}
};

const resolveWsBaseUrl = (preferred?: string): string => {
	if (preferred) {
		return toWsOrigin(preferred);
	}
	const envUrl = (
		import.meta.env.VITE_WS_BASE_URL as string | undefined
	)?.trim();
	if (envUrl) {
		return toWsOrigin(envUrl);
	}
	if (typeof window === "undefined") {
		return "";
	}
	const { protocol, host } = window.location;
	const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
	return `${wsProtocol}//${host}`;
};

export const useRoomSocket = (
	roomId: string | null,
	options?: UseRoomSocketOptions
): UseRoomSocketResult => {
	const { displayName, wsBaseUrl, onError } = options ?? {};
	const [conversation, setConversation] = useState<ChatMessage[]>([]);
	const [status, setStatus] = useState<ConnectionStatus>("idle");
	const socketRef = useRef<WebSocket | null>(null);
	const [session, setSession] = useState(0);

	const wsUrl = useMemo(() => {
		if (!roomId) {
			return null;
		}
		const base = resolveWsBaseUrl(wsBaseUrl);
		return `${base}/ws/${encodeURIComponent(roomId)}`;
	}, [roomId, wsBaseUrl]);

	const handleServerMessage = useCallback(
		(msg: ServerMsg) => {
			if (msg.type === "message_added") {
				setConversation((prev) => {
					const existingIndex = prev.findIndex((entry) => entry.id === msg.id);
					const next = [...prev];
					const payload: ChatMessage = {
						id: msg.id,
						role: msg.role,
						content: msg.text,
						timestamp: msg.ts,
					};
					if (existingIndex >= 0) {
						next[existingIndex] = payload;
						return next;
					}
					return [...next, payload];
				});
				return;
			}

			if (msg.type === "assistant_delta") {
				setConversation((prev) => {
					const next = [...prev];
					const idx = next.findIndex((entry) => entry.id === msg.id);
					if (idx === -1) {
						next.push({
							id: msg.id,
							role: "assistant",
							content: msg.text,
							timestamp: Date.now(),
						});
						return next;
					}
					next[idx] = {
						...next[idx],
						content: `${next[idx].content}${msg.text}`,
					};
					return next;
				});
				return;
			}

			if (msg.type === "error") {
				onError?.(msg.message);
				return;
			}
		},
		[onError]
	);

	const closeSocket = useCallback(() => {
		if (socketRef.current) {
			socketRef.current.close();
			socketRef.current = null;
		}
	}, []);

	const reconnect = useCallback(() => {
		setSession((value) => value + 1);
		closeSocket();
	}, [closeSocket]);

	useEffect(() => {
		setConversation([]);
	}, [roomId]);

	useEffect(() => {
		if (!wsUrl) {
			return;
		}

		setStatus("connecting");
		const ws = new WebSocket(wsUrl);
		socketRef.current = ws;
		let didUnmount = false;

		ws.addEventListener("open", () => {
			setStatus("ready");
			ws.send(
				JSON.stringify({
					type: "join",
					roomId,
					displayName,
				})
			);
		});

		ws.addEventListener("message", (event) => {
			try {
				const data = JSON.parse(String(event.data)) as ServerMsg;
				handleServerMessage(data);
			} catch {
				// ignore malformed payloads
			}
		});

		ws.addEventListener("close", () => {
			if (!didUnmount) {
				setStatus("idle");
			}
		});

		ws.addEventListener("error", () => {
			if (didUnmount) {
				return;
			}
			setStatus("error");
			onError?.("Chat connection failed");
		});

		return () => {
			didUnmount = true;
			ws.close();
			if (socketRef.current === ws) {
				socketRef.current = null;
			}
		};
	}, [wsUrl, handleServerMessage, displayName, roomId, session]);

	const sendUserMessage = useCallback(
		(text: string) => {
			const ws = socketRef.current;
			const trimmed = text.trim();
			if (!ws || ws.readyState !== WebSocket.OPEN || !trimmed) {
				onError?.("Chat is offline");
				return false;
			}
			const payload = {
				type: "user_message",
				id: `u_${crypto.randomUUID()}`,
				text: trimmed,
			};
			ws.send(JSON.stringify(payload));
			return true;
		},
		[onError]
	);

	const clearConversation = useCallback(() => {
		setConversation([]);
	}, []);

	return {
		conversation,
		status,
		sendUserMessage,
		clearConversation,
		reconnect,
	};
};
