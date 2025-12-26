import { fromHono } from "chanfana";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { TaskCreate } from "./endpoints/taskCreate";
import { TaskDelete } from "./endpoints/taskDelete";
import { TaskFetch } from "./endpoints/taskFetch";
import { TaskList } from "./endpoints/taskList";
import { RecipeGenerate } from "./endpoints/recipeGenerate";

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

// Allow local dev + deployed clients to hit REST endpoints
app.use("/api/*", cors());

// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/",
});

// Register OpenAPI endpoints
openapi.get("/api/tasks", TaskList);
openapi.post("/api/tasks", TaskCreate);
openapi.get("/api/tasks/:taskSlug", TaskFetch);
openapi.delete("/api/tasks/:taskSlug", TaskDelete);
openapi.post("/api/recipes", RecipeGenerate);

app.get("/ws/:roomId", async (c) => {
	const roomId = c.req.param("roomId");
	if (!roomId) return c.text("Missing roomId", 400);

	const id = c.env.ROOMS.idFromName(roomId);
	const stub = c.env.ROOMS.get(id);

	// Forward the request to the Durable Object. The DO will handle the WS upgrade.
	return stub.fetch(c.req.raw);
});

// Export the Hono app
export default app;

/**
 * Environment bindings interface.
 */
export interface Env {
	ROOMS: DurableObjectNamespace;
	OPENAI_API_KEY: string;
}

type ClientMsg =
	| { type: "join"; roomId: string; displayName?: string }
	| { type: "user_message"; id: string; text: string };

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

export class RoomDurableObject implements DurableObject {
	private sockets = new Set<WebSocket>();
	private generating = false;

	constructor(private state: DurableObjectState, private env: Env) {}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("Expected websocket", { status: 426 });
		}

		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];

		server.accept();
		this.sockets.add(server);

		server.addEventListener("close", () => this.sockets.delete(server));
		server.addEventListener("message", (evt) => {
			void this.onMessage(server, String(evt.data));
		});

		return new Response(null, { status: 101, webSocket: client });
	}

	private broadcast(msg: ServerMsg) {
		const payload = JSON.stringify(msg);
		for (const ws of this.sockets) {
			try {
				ws.send(payload);
			} catch {
				// ignore
			}
		}
	}

	private async onMessage(ws: WebSocket, raw: string) {
		let msg: ClientMsg;
		try {
			msg = JSON.parse(raw);
		} catch {
			ws.send(
				JSON.stringify({
					type: "error",
					message: "Invalid JSON",
				} satisfies ServerMsg)
			);
			return;
		}

		if (msg.type === "join") {
			// Optional: send history/presence here
			return;
		}

		if (msg.type === "user_message") {
			this.broadcast({
				type: "message_added",
				role: "user",
				id: msg.id,
				text: msg.text,
				ts: Date.now(),
			});

			// One assistant generation at a time per room
			if (this.generating) {
				this.broadcast({
					type: "error",
					message: "Assistant is busy; try again in a moment.",
				});
				return;
			}

			this.generating = true;
			const assistantId = `a_${crypto.randomUUID()}`;

			this.broadcast({
				type: "message_added",
				role: "assistant",
				id: assistantId,
				text: "",
				ts: Date.now(),
			});

			try {
				await this.streamAssistantReply(assistantId, msg.text);
				this.broadcast({ type: "assistant_done", id: assistantId });
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} catch (e: any) {
				this.broadcast({
					type: "error",
					message: e?.message ?? "Assistant error",
				});
			} finally {
				this.generating = false;
			}
		}
	}

	private async streamAssistantReply(assistantId: string, userText: string) {
		const body = {
			model: "gpt-4.1-mini",
			stream: true,
			messages: [
				{
					role: "system",
					content:
						"You are a helpful cooking assistant for a recipe book website.",
				},
				{ role: "user", content: userText },
			],
		};

		const resp = await fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		if (!resp.ok || !resp.body) {
			const text = await resp.text().catch(() => "");
			throw new Error(`OpenAI error ${resp.status}: ${text}`);
		}

		// Parse SSE stream from OpenAI and broadcast deltas
		const reader = resp.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		while (true) {
			const { value, done } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const parts = buffer.split("\n\n");
			buffer = parts.pop() ?? "";

			for (const part of parts) {
				for (const line of part.split("\n")) {
					if (!line.startsWith("data:")) continue;
					const data = line.slice(5).trim();
					if (!data) continue;
					if (data === "[DONE]") return;

					try {
						const json = JSON.parse(data);
						const delta: string | undefined =
							json?.choices?.[0]?.delta?.content;
						if (delta) {
							this.broadcast({
								type: "assistant_delta",
								id: assistantId,
								text: delta,
							});
						}
					} catch {
						// ignore parse errors
					}
				}
			}
		}
	}
}
