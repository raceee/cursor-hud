# Cursor HUD

An always-on-top **Cursor chat overlay** for World of Warcraft Classic, Retail, and other borderless games.

This matches the [Hermes HUD](https://x.com/imbabybrooklyn/status/2091725936311910909) idea: a glanceable chat frame over the game so you can prompt without alt-tabbing. It is **not** a WoW addon. Blizzard's Lua sandbox cannot talk to Cursor, open sockets, or refresh files without `/reload`.

```
┌─────────────────────────────┐
│  WoW Classic / Retail       │
│  (borderless fullscreen)    │
│                             │
│   ┌───────────────────┐     │
│   │ Cursor HUD        │     │
│   │ transcript        │     │
│   │ Ask Cursor…    ↑  │     │
│   └───────────────────┘     │
└─────────────────────────────┘
           │
           ▼
   local Cursor agent
   (@cursor/sdk, same machine)
```

The HUD is a thin Electron window. Prompts run through a Node host that uses the [Cursor TypeScript SDK](https://cursor.com/docs/sdk/typescript) against a project folder on disk. That is a local Cursor agent session (your account, your files), not a remote control of the IDE chat panel.

## Requirements

- Windows, macOS, or Linux
- Node.js 22.13+
- A Cursor account (SDK usage bills like the IDE)
- WoW in **Windowed (Fullscreen)** / borderless — exclusive fullscreen bypasses the compositor, so no overlay can draw on top of it

## Install and run

```bash
npm install
npm start
```

On some Linux setups Electron needs extra flags:

```bash
npm run start:linux
```

1. Click **setup**.
2. **Sign in to Cursor** (browser login) or set `CURSOR_API_KEY`.
3. Click **+** and pick a **recently opened** repo, **New agent on this repo**, or **Browse…**.
4. Put WoW in borderless fullscreen. Drag the HUD like a chat frame.
5. Switch tabs to jump between agents. Each tab is its own conversation, even on the same folder.
6. Type a prompt. Optional: **include screen** attaches a screenshot of that display.

Hotkey: `Ctrl+Shift+H` (`Cmd+Shift+H` on Mac) shows the overlay and focuses the composer.

Voice typing (Wispr Flow, Speechify, Windows Voice Access, Apple Dictation) works when the composer is selected. Click the text box so Cursor HUD is the active window, then dictate. On macOS, grant Accessibility to the voice app if it asks. The composer is a normal text field: it accepts keystrokes, IME composition, and paste.

## Why this is not a Lua addon

WoW addons cannot:

- make HTTP requests
- talk to `localhost`
- read arbitrary files while the game is running

The only ToS-safe addon pattern is SavedVariables plus `/reload`, which is unusable as a live chat. Hermes HUD works because it is a desktop overlay, not FrameXML.

Classic Era, MoP Classic, and Retail all work the same way: the overlay does not load inside the game client.

## Notes

- Click-through is enabled on Windows and macOS so clicks beside the chat land in WoW. Linux keeps the HUD solid (Electron cannot forward mouse events there).
- Do not use exclusive fullscreen.
- The SDK does not inject into the Cursor IDE window that is already open. It starts a local agent with your Cursor login. Open **Filter > Source > SDK** in Cursor if you want to inspect those runs.
- Open **+** for another agent. The picker lists recently opened repos, offers the current repo again, or lets you browse to a new folder.
- Tool calls (edits, shell) run on that tab's project folder. Pick folders carefully.

## Development

```bash
npm test
```
