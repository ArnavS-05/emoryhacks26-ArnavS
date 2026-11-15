"""In-process WebSocket hub: synchronizes clinician and patient panels per care session."""
from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import WebSocket

log = logging.getLogger("synaphi.ws")


class Hub:
    def __init__(self) -> None:
        self.rooms: dict[str, dict[WebSocket, str]] = defaultdict(dict)
        self.lock = asyncio.Lock()

    async def join(self, session_id: str, ws: WebSocket, role: str) -> None:
        async with self.lock:
            self.rooms[session_id][ws] = role
        await self.broadcast(session_id, "presence", self.presence(session_id))

    async def leave(self, session_id: str, ws: WebSocket) -> None:
        async with self.lock:
            self.rooms[session_id].pop(ws, None)
            if not self.rooms[session_id]:
                self.rooms.pop(session_id, None)
        await self.broadcast(session_id, "presence", self.presence(session_id))

    def presence(self, session_id: str) -> dict:
        roles = list(self.rooms.get(session_id, {}).values())
        return {"clinician": roles.count("clinician"), "patient": roles.count("patient")}

    async def broadcast(self, session_id: str, event: str, payload: dict, exclude: WebSocket | None = None) -> None:
        msg = json.dumps({"type": event, "payload": payload, "at": datetime.now(timezone.utc).isoformat()}, default=str)
        dead = []
        for ws in list(self.rooms.get(session_id, {})):
            if ws is exclude:
                continue
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.rooms.get(session_id, {}).pop(ws, None)


hub = Hub()
