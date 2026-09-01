# tokly-cli

Optional developer-machine connector for Tokly. Use it when you want local AI tools to report the operational telemetry they expose without collecting prompts, responses, files, emails, or provider credentials.

Tokly's primary application integration is the separate `tokly-sdk` package. The CLI is not required to instrument an application.

## Install and connect

```bash
npm install -g tokly-cli
tokly init
```

The wizard detects Cursor, Codex, Claude Code, Gemini CLI, and Ollama, explains each tool's monitoring fidelity, and previews every file and login-service change before applying it. It opens Tokly in your browser for authorization, so no app write key is copied into the connector.

Machine credentials are stored only in macOS Keychain, Windows Credential Manager, Linux Secret Service, or an initialized Linux `pass` store. Setup stops if no supported encrypted credential store is available.

Use `tokly status`, `tokly tools`, `tokly start`, `tokly stop`, or `tokly disconnect` to manage the connector. Claude Code and Gemini CLI report exact token metrics. Cursor, Codex, and Ollama report lifecycle activity only and never invent token or cost values.

## Uninstall

Disconnect first so Tokly removes its collector service and owned tool configuration, then uninstall the package:

```bash
tokly disconnect
npm uninstall -g tokly-cli
```

## License

MIT
