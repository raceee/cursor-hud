# Cursor HUD

Always-on-top Cursor chat.

## Download

[GitHub Releases](https://github.com/raceee/cursor-hud/releases)

macOS: if Gatekeeper blocks the app, run `xattr -cr "Cursor HUD.app"` then open it.

## Run from source

```bash
npm install
npm start
```

Linux: `npm run start:linux`

Sign in from Setup, or set `CURSOR_API_KEY`. Ghost: `Ctrl+Shift+H` (`Cmd+Shift+H` on Mac). Close: the × on the tab bar, Setup → Quit, or `Ctrl+Shift+Q`.

## Local debug traces

On by default (Setup → Local debug traces). While the HUD is running from this repo, another assistant can read:

- `debug/latest.json` — what the HUD is showing right now (mode, workspace, last messages, tools)
- `debug/hud-trace.jsonl` — event log (sends, tools, errors)

API keys and tokens are redacted. Turn it off in Setup, or set `CURSOR_HUD_DEBUG=0`. Packaged builds write to the app data `debug` folder instead.

## Development

```bash
npm test
npm run dist
```

Push a `v*` tag to publish builds.
