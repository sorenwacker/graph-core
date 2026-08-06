# AI Notes

Graph Core integrates with local and cloud LLMs to enhance your notes.

## Providers

### Ollama (Local)

Run AI models locally on your machine.

**Setup:**

1. Install Ollama: https://ollama.ai/download
2. Pull a model:
   ```bash
   ollama pull llama3.2
   ```
3. Start Ollama:
   ```bash
   ollama serve
   ```
4. In Settings, select "Ollama" as provider
5. Test the connection

**Settings:**

| Setting | Description | Default |
|---------|-------------|---------|
| Endpoint | Ollama server URL | `http://localhost:11434` |
| Model | Any installed Ollama model | `llama3.2` |
| Context Size | Context window (4K-128K) | 32K |

Context Size is sent with every generation request as Ollama's `num_ctx` option, so raising it really does widen the model's context window (at the cost of RAM).

### OpenAI-Compatible APIs

Use OpenAI, Azure OpenAI, or any compatible endpoint.

**Setup:**

1. In Settings, select "OpenAI-compatible"
2. Enter your API endpoint
3. Enter your API key
4. Select a model
5. Test the connection

**Settings:**

| Setting | Description | Default |
|---------|-------------|---------|
| Endpoint | API URL | `https://api.openai.com/v1` |
| API Key | Your API key | Required |
| Model | Model name | `gpt-4o-mini` |
| Skip SSL verification | Accept self-signed certificates on local endpoints | Off |

**Skip SSL verification:**

The bypass is limited to local endpoints — `localhost`, `127.0.0.1`, `::1` and `*.local`. Certificates for any other host are always verified, even with the setting enabled, so pointing at a remote server with a bad certificate fails with an explicit error instead of silently sending your data over an unverified connection.

The setting applies to note improvement and to research/agent runs alike.

!!! warning
    Skipping verification exposes data to interception. Only use it on trusted networks.

## Using AI Features

### Preset Actions

Select text in a note and use the AI toolbar:

| Action | Description |
|--------|-------------|
| Improve | Enhance clarity and grammar |
| Summarize | Create a concise summary |
| Expand | Add more detail |
| Fix Grammar | Correct grammatical errors |
| Simplify | Make easier to understand |
| Bullet Points | Convert to bullet list |
| Action Items | Extract actionable tasks |
| Continue | Generate continuation |

### Custom Prompts

Create your own prompts in Settings:

1. Open Settings > AI
2. Scroll to Custom Prompts
3. Add a name and prompt template
4. Use `{{selection}}` as placeholder for selected text

**Example prompts:**

| Name | Template |
|------|----------|
| Translate to German | `Translate the following to German:\n\n{{selection}}` |
| Meeting Notes | `Format this as meeting notes with attendees, decisions, and action items:\n\n{{selection}}` |
| Code Review | `Review this code for bugs and improvements:\n\n{{selection}}` |
| ELI5 | `Explain this like I'm five years old:\n\n{{selection}}` |
| Extract Dates | `Extract all dates and deadlines mentioned:\n\n{{selection}}` |

Custom prompts appear in the AI action menu alongside the preset actions.

### Workflow

1. Select text in a note (or entire note if nothing selected)
2. Click an AI action
3. Preview the changes
4. Accept or reject the changes

### Undo Support

All AI changes can be undone with Cmd/Ctrl+Z.

## Troubleshooting

### Ollama Not Running

```
Error: Ollama is not running. Start with: ollama serve
```

**Solution:** Start Ollama in a terminal:
```bash
ollama serve
```

### Model Not Found

```
Error: Model not available. Run: ollama pull llama3.2
```

**Solution:** Pull the model:
```bash
ollama pull llama3.2
```

### OpenAI Authentication Failed

```
Error: Invalid API key
```

**Solution:** Check your API key in Settings.

### Certificate Error on a Remote Endpoint

```
SSL/TLS error: ... "Skip SSL verification" only applies to local endpoints
(localhost, 127.0.0.1, ::1, *.local); certificates for remote hosts are always verified.
```

**Solution:** "Skip SSL verification" cannot bypass this. Install the endpoint's CA certificate in your system trust store, or use an endpoint with a valid certificate.

## See Also

- [Settings](../reference/settings.md)
- [Detail Panel](detail-panel.md)
- [Keyboard Shortcuts](../reference/keyboard-shortcuts.md)
