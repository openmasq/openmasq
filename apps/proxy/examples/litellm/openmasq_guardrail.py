"""OpenMasq as a LiteLLM guardrail — a SKETCH, not a finished plugin.

LiteLLM is Python and OpenMasq's engine is TypeScript, so this cannot import
`@openmasq/redact`. It talks to a local OpenMasq REDACTION endpoint over loopback: mask the
outgoing prompt before the call, restore the real values in the reply after it. One vault per
LiteLLM request, carried by a session id.

Why a guardrail rather than the base-URL proxy: a LiteLLM deployment is already the fan-out
point in front of many providers, so a team that standardised on it wants the masking THERE,
in the same config as its other guardrails, not a second hop per provider.

⚠️ The endpoint this calls (`/redact`, `/unredact`) DOES NOT EXIST on the proxy yet — the
proxy today only relays full LLM calls. `README.md` next to this file states exactly what the
addition would be and the boundary question it raises. Until then this file is a design
reference, not something to wire into a config.
"""

from __future__ import annotations

import os
import uuid
from typing import Optional, Union

import httpx
from litellm.integrations.custom_guardrail import CustomGuardrail
from litellm.proxy._types import UserAPIKeyAuth
from litellm.caching.dual_cache import DualCache

OPENMASQ_URL = os.environ.get("OPENMASQ_REDACT_URL", "http://127.0.0.1:8787")


class OpenMasqGuardrail(CustomGuardrail):
    """Mask user text before the provider sees it; restore it in the answer."""

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self._client = httpx.AsyncClient(base_url=OPENMASQ_URL, timeout=30.0)

    async def async_pre_call_hook(
        self,
        user_api_key_dict: UserAPIKeyAuth,
        cache: DualCache,
        data: dict,
        call_type: str,
    ) -> Optional[Union[Exception, str, dict]]:
        # One vault for this request; stash it on `data` so post_call reaches the same one.
        session = data.setdefault("metadata", {}).setdefault(
            "openmasq_session", uuid.uuid4().hex
        )
        for message in data.get("messages", []):
            content = message.get("content")
            if isinstance(content, str) and content:
                message["content"] = await self._redact(content, session)
        return data

    async def async_post_call_success_hook(
        self,
        data: dict,
        user_api_key_dict: UserAPIKeyAuth,
        response,
    ):
        # Fail closed: if restore is unreachable, the reader keeps the FAKE (safe) rather than
        # a half-restored mix — never raise here, the answer already left the provider.
        session = (data.get("metadata") or {}).get("openmasq_session")
        if not session:
            return response
        for choice in getattr(response, "choices", []):
            msg = getattr(choice, "message", None)
            if msg and isinstance(getattr(msg, "content", None), str):
                msg.content = await self._unredact(msg.content, session)
        return response

    async def _redact(self, text: str, session: str) -> str:
        r = await self._client.post(
            "/redact", json={"text": text}, headers={"x-openmasq-session": session}
        )
        r.raise_for_status()
        return r.json()["text"]

    async def _unredact(self, text: str, session: str) -> str:
        try:
            r = await self._client.post(
                "/unredact", json={"text": text}, headers={"x-openmasq-session": session}
            )
            r.raise_for_status()
            return r.json()["text"]
        except httpx.HTTPError:
            return text  # keep the fake; never a half-restored leak
