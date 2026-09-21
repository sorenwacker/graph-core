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

The setting applies to note improvement and to Wikipedia lookups alike.

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
| Wikipedia | Look a topic up on Wikipedia and append what it finds ([details](#wikipedia-lookup)) |

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

### Wikipedia lookup

The **Wikipedia** action looks a topic up on Wikipedia and writes what it finds into the note. Wikipedia is its only source: it does not search the web, read papers, or consult anything else, and the result is no more reliable or current than the articles it read. It is available when the Wikipedia tool is enabled in Settings > AI.

1. Choose **Wikipedia** in the AI action menu.
2. Enter what you want to know. A question works better than a bare keyword: "When was the Delta Works programme completed, and what did it cost?" rather than "Delta Works".
3. Review the result in the preview, edit it if needed, and accept or reject it.

**What the model is given:**

| Input | Content |
|-------|---------|
| Your question | As typed |
| The node | Title, type and the title of its parent, so that an ambiguous question is read in context. Note text is not sent. |
| Search results | Up to 5 article titles with snippets per search; the model may search more than once with different wording |
| Articles | The full plain text of each article it chooses to read, not only the introduction, cut to fit the configured context size. It may read several. |

**What the model is asked to write:** an answer to the question, not a general summary of the topic. Concrete facts - dates, figures, names, definitions - are preferred over general statements. Every paragraph names the article it came from, and the result ends with a list of the articles read, with links. When the articles do not answer the question, the result says so instead of filling the gap.

**Editing the prompt:** the writing rules above are the default prompt of the Wikipedia action, and it is editable like any other preset: Settings > AI > AI Prompts, select **Wikipedia**, change the text, save. Reset restores the default. The prompt is sent to the model as its instructions for every lookup, in the tool-calling path and the fallback alike. The parts that make the tools work - which tools exist and the instruction to stop calling them before answering - are added by the app and are not part of the editable text, so an edited prompt cannot break the lookup.

**Where the result goes:** accepting appends the result below the existing note under a `## Wikipedia: <question>` heading. The existing note text is not replaced.

**Models without tool calling:** some local models cannot call tools. For those, the app searches Wikipedia with your question itself, reads the top articles in full, and asks the model to answer from them under the same writing rules.

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
