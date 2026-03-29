# telegram

Send messages, images, files, and emoji reactions to paired Telegram users.

## Usage

```bash
# Send a text message to all paired users
node --import tsx/esm skills/telegram/run.ts send --message "Hello from Rue!"

# Send to a specific user by Telegram ID
node --import tsx/esm skills/telegram/run.ts send --message "Hey!" --user 123456789

# React to a message with an emoji
node --import tsx/esm skills/telegram/run.ts react --chat-id 123456789 --message-id 42 --emoji "😂"

# Send an image (local file or URL)
node --import tsx/esm skills/telegram/run.ts send-image --path /path/to/image.png --caption "Check this out"
node --import tsx/esm skills/telegram/run.ts send-image --url "https://example.com/image.png" --caption "From the web"

# Send a file/document
node --import tsx/esm skills/telegram/run.ts send-file --path /path/to/report.pdf --caption "Weekly report"

# List paired users
node --import tsx/esm skills/telegram/run.ts users

# Check bot status
node --import tsx/esm skills/telegram/run.ts status
```

## Reactions

You can react to Telegram messages with emojis using the `react` command. You need:
- `--chat-id` — the Telegram chat/user ID
- `--message-id` — the ID of the message to react to
- `--emoji` — the emoji to react with (e.g. "😂", "❤️", "👍", "🔥", "😎", "🤔", "👀", "🎉")

Use reactions naturally — when something is funny, cool, or noteworthy. Don't overdo it.

## When to use

- When you need to notify the user about something (task completed, agent done, error)
- When the user asks you to send something to Telegram
- When a trigger fires and the action is "send a Telegram message"
- When you want to share an image, screenshot, or document
- When you want to react to a message with an emoji (something funny, cool, etc.)
- For proactive updates: "Hey, your build finished!"

## Requirements

- Telegram bot must be configured: `rue telegram setup <bot-token>`
- At least one user must be paired: `rue telegram pair` then send code to bot
