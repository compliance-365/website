/* Checkpoint's current version, as a single, always-correct constant the
   rest of the app (sidebar footer, the "What's new" panel in app.js,
   changelog.js) can read. The placeholder below is replaced at build
   time — scripts/hash-checkpoint-assets.mjs reads public/checkpoint/
   VERSION and substitutes it here, throwing (failing the build) if
   either file is missing or the placeholder isn't found — so this
   value can never silently drift from the actual release: bump
   VERSION, not this file, and the build does the rest.
   Source (this file, as checked into git) always shows the
   placeholder — only the built dist/checkpoint/version.js has the
   real number substituted in. */
window.CHECKPOINT_VERSION = '__CHECKPOINT_VERSION__';
