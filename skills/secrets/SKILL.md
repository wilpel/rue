# secrets

Securely store and retrieve secrets (API keys, tokens, passwords). Encrypted at rest with AES-256-GCM.

## Usage

```bash
# Initialize the secret vault (set master passphrase — first time only)
node --import tsx/esm skills/secrets/run.ts init

# Store a secret
node --import tsx/esm skills/secrets/run.ts set --key "OPENAI_API_KEY" --value "sk-..."

# Retrieve a secret
node --import tsx/esm skills/secrets/run.ts get --key "OPENAI_API_KEY"

# List all secret keys (values are NOT shown)
node --import tsx/esm skills/secrets/run.ts list

# Delete a secret
node --import tsx/esm skills/secrets/run.ts delete --key "OPENAI_API_KEY"

# Check if a secret exists
node --import tsx/esm skills/secrets/run.ts has --key "OPENAI_API_KEY"
```

## Security

- Secrets are encrypted with AES-256-GCM using a key derived from the master passphrase (PBKDF2, 100k iterations)
- Each secret has its own IV and auth tag
- The master key is derived at runtime from `RUE_VAULT_PASSPHRASE` env var or `~/.rue/vault-key` file
- The vault file (`~/.rue/vault.enc`) contains only encrypted data — useless without the key
- Secret values are NEVER logged or stored in plain text

## When to use

- When you need an API key to call an external service
- When a skill or tool needs credentials
- When the user says "store this key" or "save this secret"
- When configuring integrations that need tokens

## Environment variable

Set `RUE_VAULT_PASSPHRASE` to auto-unlock the vault without prompting. Or store the passphrase in `~/.rue/vault-key` (chmod 600).
