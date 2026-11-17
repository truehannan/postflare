import type { Env } from "../env";

/**
 * InboxHub — per-workspace Durable Object for real-time inbox updates.
 *
 * Clients connect over WebSocket (`wss://.../ws/inbox?workspace=<id>`); the
 * Worker broadcasts JSON events to connected clients by POSTing to this
 * object's fetch handler.
 */
export class InboxHub {
  private sessions = new Set<WebSocket>();
  private state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    void env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      this.state.acceptWebSocket(pair[1]);
      this.sessions.add(pair[1]);
      pair[1].send(JSON.stringify({ type: "connected" }));
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (request.method === "POST" && url.pathname === "/broadcast") {
      const body = await request.text();
      for (const ws of this.sessions) {
        try {
          ws.send(body);
        } catch {
          /* client disconnected */
        }
      }
      return new Response(JSON.stringify({ delivered: this.sessions.size }), {
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("InboxHub", { status: 200 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      ws.send(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      /* ignore */
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.sessions.delete(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.sessions.delete(ws);
  }
}