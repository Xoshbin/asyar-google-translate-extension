# Google Translate

> Translate text using Google Translate. Auto-detect source, sticky target, history, and agent integration.

`org.asyar.google-translate` is a Tier 2 Asyar extension (productivity · macOS, Windows, Linux).

## What it does

The extension provides **3 commands**:

| Command | Mode | What it does |
| --- | --- | --- |
| **Translate** | `view` | Open an interactive translation view. Type in the launcher to translate. |
| **Translate Selection** | `view` | Translate whatever text is selected in the frontmost app. |
| **Translation History** | `view` | Browse, repeat, pin past translations. |

It also exposes **1 tool** to AI agents:

| Tool | What the agent uses it for |
| --- | --- |
| `translate` | Translate a piece of text to the requested target language using Google Translate. Call this when the user asks to translate text, asks what something means in another language, or writes content that needs to be rendered in another language. Returns the translation and, when source was 'auto', the detected source language. |

## Permissions

```json
"permissions": [
  "network",
  "selection:read",
  "clipboard:read",
  "clipboard:write",
  "notifications:send",
  "storage:read",
  "storage:write",
  "cache:read",
  "cache:write",
  "tools:register",
  "extension:invoke"
]
```

## Install

Install from the [Asyar Store](https://asyar.org/extensions).

Then open the **Agent editor** in the launcher to enable its tools for any agent.

## Develop

```bash
# from this directory
pnpm install
pnpm dev          # vite dev server
pnpm test:run     # vitest
pnpm build        # emits dist/{worker,view}.js + assets
pnpm link         # registers the dev path with the launcher
asyar publish     # builds, packages, GitHub release, store submission
```

## License

[MIT](./LICENSE) © Khoshbin
