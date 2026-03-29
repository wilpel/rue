# telegram

Send messages, images, and files to paired Telegram users. Check bot status and list users.

## Usage

```bash
# Send a text message to all paired users
node --import tsx/esm skills/telegram/run.ts send --message "Hello from Rue!"

# Send to a specific user by Telegram ID
node --import tsx/esm skills/telegram/run.ts send --message "Hey!" --user 123456789

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

## When to use

- When you need to notify the user about something (task completed, agent done, error)
- When the user asks you to send something to Telegram
- When a trigger fires and the action is "send a Telegram message"
- When you want to share an image, screenshot, or document
- For proactive updates: "Hey, your build finished!"

## Requirements

- Telegram bot must be configured: `rue telegram setup <bot-token>`
- At least one user must be paired: `rue telegram pair` then send code to bot
