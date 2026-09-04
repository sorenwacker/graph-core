# Editing a node

The detail panel is an editor over a record that other parts of the app also hold and reload. Two rules keep an edit in progress safe from that.

## The view being typed in holds the text

Saving is a round-trip. The panel emits the values it has, the write is awaited, and the saved record comes back as a new `node` prop - from the app's own reload, or broadcast by another window showing the same node. Typing continues throughout, so the record that arrives is already behind the editor.

`DetailPanel` therefore distinguishes a navigation from a refresh. A record for a *different* node replaces the panel's state: tabs, collapsed sections, children, links and table are all reloaded. A record for the node already open is merged instead, and every field the user has changed since the last save is kept. Those fields are tracked in `locallyEdited`, which each edit handler adds to and each save clears - so a field is protected exactly while its newest value is still only in the panel.

Without this, text typed during the round-trip was reverted. A newly pressed Enter was the most visible casualty: the newline arrived after the save was emitted, so the record that came back removed it.

A change that genuinely originates elsewhere - an AI improvement, a note decrypted by unlocking, another window's edit - is adopted, because no local edit is outstanding for that field.

## Incoming text is applied as the smallest change

`NotesEditor` applies an incoming value through `minimalReplacement`, which yields the one span that differs. CodeMirror maps the selection through a change, so the caret only moves when the edit landed where the caret was. Replacing the whole document cannot be mapped through and sent the caret to position 0.

## Mid-edit saves do not reload the view

The notes autosave fires on every pause in typing. A full save also reloads the current container from the database, rebuilds the sidebar tree, and rebuilds every element in the graph - so doing it per autosave left the graph churning under the cursor for the length of the edit.

Saves therefore carry their intent. `saveChanges({ refresh: false })` writes and nothing more; `updateNode` skips `refreshAfterChange`, and a detached window skips its broadcast. The reload happens once, on the save that ends the edit: the editor is left, another tab is chosen, another node is opened, or the panel closes. `flushPendingSave` covers those exits, and also writes text still sitting on the autosave timer - closing the panel used to drop it.

The consequence is intended: while a note is being written, the graph shows the text as of the last completed edit, not the current keystroke.
