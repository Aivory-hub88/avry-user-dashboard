# BlockSuite PageEditor (default Write surface)

## Usage

The block editor is the default Write view: `/dashboard/workspace/<page-id>`.
The legacy prototype stays one click away via `?editor=legacy` (rollback only).

## Scope

- Uses `@blocksuite/presets`, `@blocksuite/blocks`, and `@blocksuite/store` at `0.19.5`
  — the same editing core AFFiNE itself is built on (PageEditor + AffineSchemas).
- Legacy flat blocks migrate one way on first open (see below); already-native
  state is detected by content and never re-migrated.
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

One-way legacy migration (`lib/workspaceMigration.ts`, unit-tested):

| Legacy prototype | BlockSuite (same table as the built-in slash menu) |
|---|---|
| Text | `affine:paragraph` / text |
| Heading 1/2/3 | `affine:paragraph` / h1/h2/h3 |
| To-do (+checked) | `affine:list` / todo (+checked) |
| Bulleted list | `affine:list` / bulleted |
| Numbered list | `affine:list` / numbered |
| Quote | `affine:paragraph` / quote |
| Code Block | `affine:code` |
| Divider | `affine:divider` |
| Table | no page marker — rows travel in the `database` array the Data tab reads |
| Unknown future types | `affine:paragraph` / text (never throws) |

Rules: detection is content-based (flat `{type,text}` maps without `flavour`
vs the native Y.Map tree) — never `instanceof`, never `share.get` (unreliable
for remotely-integrated state). Native state never re-migrates, so opening a
converted page cannot duplicate blocks. After migration the legacy view shows
an "uses blocks now" notice instead of forking the doc.

## License

BlockSuite packages are MPL-2.0. This dependency boundary must be reviewed for
the distribution model before the preview becomes a production editor.
