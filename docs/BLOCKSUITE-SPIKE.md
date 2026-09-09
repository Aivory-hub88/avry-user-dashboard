# BlockSuite PageEditor Spike

## Usage

Open an empty workspace page with:

`/dashboard/workspace/<page-id>?editor=blocksuite`

The production editor remains the default route. The spike is loaded with
`ssr: false` so browser-only BlockSuite elements are not imported during the
Next.js server render.

## Scope

- Uses `@blocksuite/presets`, `@blocksuite/blocks`, and `@blocksuite/store` at `0.19.5`.
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
