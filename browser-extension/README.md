# Provenance Canvas Lens

This extension adds the Provenance Canvas Lens directly on supported Canvas pages.

What it does:
- reads visible page/question content;
- detects common Canvas question blocks and answer choices;
- builds local page-context study suggestions;
- opens a deeper review in Provenance Studio without manual copy/paste;
- keeps a one-by-one approval control.

What it intentionally does not do:
- automatically select answers;
- submit quizzes/tests;
- claim a context-overlap suggestion is a verified correct answer.

Supported URL patterns are currently `*.instructure.com` and `canvas.sdsu.edu`.

The same overlay source is also available at the repository root as `canvas-overlay.js` for the iPhone bookmarklet/page-bridge flow.