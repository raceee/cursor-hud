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

Sign in from Setup, or set `CURSOR_API_KEY`. Hotkey: `Ctrl+Shift+H` (`Cmd+Shift+H` on Mac).

## Development

```bash
npm test
npm run dist
```

Push a `v*` tag to publish builds.
