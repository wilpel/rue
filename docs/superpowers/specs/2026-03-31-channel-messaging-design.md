# Channel-Based Messaging Design

**Date:** 2026-03-31
**Status:** Approved

## Overview

Replace inbox-based messaging with a single shared channel per conversation. All participants (user, main agent, delegates) write to the same channel. The main agent sees a tagged conversation thread and responds naturally.

## Channel Message Format

```
[USER_TELEGRAM] i want an image of playground dev office
[USER_TELEGRAM] the one on gamla brogatan
[AGENT_RUE] On it — delegating a search for that.
[AGENT_DELEGATE_abc123] Found an image of Gamla Brogatan 27. Here's a street view...
[USER_TELEGRAM] nice! can you also find their revenue?
```

## Data Model

Each message in the `messages` table gets:
- `role`: "channel" (all channel messages use this role)
- `metadata.tag`: `USER_TELEGRAM` | `AGENT_RUE` | `AGENT_DELEGATE_<id>` | `SYSTEM`
- `metadata.chatId`: Telegram chat ID (groups messages per conversation)

## Components

### ChannelService

Replaces InboxService + InboxProcessorService. Single service that:

1. **`post(tag, content, chatId)`** — writes a message to the channel
2. **`getHistory(chatId, limit=20)`** — returns last N messages formatted as the conversation thread
3. **`onNewMessage(handler)`** — notifies when new messages arrive (for triggering the agent)

### Main Agent Trigger

When new messages arrive on a channel (from user OR delegate):
- Wait 2s for batching (rapid user messages get grouped)
- Build prompt: system prompt + `getHistory(chatId, 20)` + "Your turn. Respond to the latest."
- Run Claude: Bash-only, 4 turns, 60s timeout
- Write response to channel as `AGENT_RUE`
- Send response to Telegram via skill (the agent does this) OR the processor sends it

### Delegate Flow

1. Main agent delegates: `skills/delegate/run.ts spawn --task "..." --chat-id 123`
2. Delegate runs independently (full tools, 25 turns)
3. On completion: `channel.post("AGENT_DELEGATE_<id>", result, chatId)`
4. This triggers the main agent — it sees the delegate result in the conversation
5. Main agent processes, formats, and responds to the user

### What Changes

| Before | After |
|--------|-------|
| InboxService | ChannelService |
| InboxProcessorService | ChannelService (trigger logic built-in) |
| InboxModule | ChannelModule |
| Delegate pushes to inbox, processor forwards to Telegram | Delegate posts to channel, triggers main agent |
| Each message = independent Claude query | Last 20 messages as context for each query |
| No conversation history in prompt | Full tagged conversation in prompt |

### What Stays

- TelegramService — still receives messages, now calls `channel.post()`
- DelegateService — still spawns background agents, now posts results to channel
- AssemblerService — still builds system prompt (KB, memory, skills, personality)
- MessageRepository — still stores messages (just with new metadata format)
- Skills — unchanged, agent uses Bash to call them
