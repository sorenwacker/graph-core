# Quick capture

Quick capture puts a thought into Graph Core without switching to it. A global hotkey opens a small capture window over whatever you are doing; you type and press Enter, and the note is saved and the window hides.

## Using it

- Press the capture hotkey (default `Ctrl/Cmd + Shift + N`) from any app.
- A small input appears. Type the note text.
- Press Enter to save, or Escape to dismiss without saving.

The captured note is created as a new top-level item in the current workspace. This is the inbox as Graph Core defines it: uncategorized top-level items. Open the Table or Cards view to find and file it later.

## What it creates

- A note node whose title is the text you typed.
- Parent: none, so it is a workspace root.
- Workspace: the workspace the main window last had open.

## Settings

In **Settings > General**, quick capture can be turned off, and the hotkey can be changed. The hotkey uses Electron accelerator syntax (for example `CommandOrControl+Shift+N`). An accelerator already claimed by the system or another app fails to register; the setting reports that so you can pick another.

## Availability

Quick capture is a desktop feature. It relies on a system-wide hotkey and a separate capture window, neither of which exists in web mode. The hotkey is registered after the database is unlocked, so on an encrypted database it becomes active once the app is unlocked for the session.
