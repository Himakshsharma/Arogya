"""In-memory WebSocket rooms (single process)."""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import WebSocket

log = logging.getLogger("arogya.rooms")


class RoomManager:
    def __init__(self):
        self.rooms: dict[str, dict[WebSocket, str]] = defaultdict(dict)
        self._lock = asyncio.Lock()

    async def join(self, code: str, ws: WebSocket, role: str):
        async with self._lock:
            self.rooms[code][ws] = role

    async def leave(self, code: str, ws: WebSocket):
        async with self._lock:
            self.rooms.get(code, {}).pop(ws, None)
            if code in self.rooms and not self.rooms[code]:
                del self.rooms[code]

    def presence(self, code: str) -> dict:
        roles = list(self.rooms.get(code, {}).values())
        return {"doctor": roles.count("doctor"), "patient": roles.count("patient")}

    async def broadcast(self, code: str, message: dict):
        dead = []
        for ws in list(self.rooms.get(code, {}).keys()):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.leave(code, ws)


rooms = RoomManager()
