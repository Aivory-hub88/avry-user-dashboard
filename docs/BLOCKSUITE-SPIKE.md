# BlockSuite PageEditor Spike

## Usage

Open an empty workspace page with:

`/dashboard/workspace/<page-id>?editor=blocksuite`

The production editor remains the default route. The spike is loaded with
`ssr: false` so browser-only BlockSuite elements are not imported during the
Next.js server render.

## Scope

- Uses `@blocksuite/presets`, `@blocksuite/blocks`, and `@blocksuite/store` at `0.19.5`.
- Loads `@toeverything/theme/style.css` in the root layout (CSS variables only;
  no existing dashboard styling is affected) and scopes `data-theme="dark"`
  while the spike is mounted, matching how AFFiNE/BlockSuite's `ThemeObserver`
  resolves the theme. Without this the editor renders messy and the slash-menu
  popup breaks.
- The editor wrapper intentionally has no `overflow-hidden`: BlockSuite renders
  the slash menu, drag handle, and format bar as overlays inside the editor
  tree, and a clipping ancestor cuts them off.
- Uses the existing document GET/PUT endpoint and `workspace:<id>` websocket room.
- Initializes the minimal BlockSuite tree: page, surface, note, and paragraph.
- Uses BlockSuite's stable block IDs and built-in page controls, slash menu, clipboard, and undo/redo surface.
- Keeps the existing custom editor untouched and does not add a command bridge yet.

## Safety Boundary

The current production document uses a top-level Yjs array named `blocks`, while
BlockSuite uses a Yjs map with the same name. The spike detects that legacy
shape and refuses to open it instead of changing the document in place. A real
migration must define an explicit conversion and rollback strategy before this
flag is enabled for existing pages.

## License

BlockSuite packages are MPL-2.0. This dependency boundary must be reviewed for
the distribution model before the preview becomes a production editor.
