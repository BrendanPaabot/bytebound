# Bytebound Workspace Rules

- **Capstone Documentation Auto-Sync:** Whenever you modify code, styling, UI layouts, gameplay mechanics, question bank entries, database migrations, or backend endpoints in this workspace:
  1. Run `node scripts/update-capstone-docs.js --note "<concise summary of the revision>"` after completing your edits so `CAPSTONE_DOCUMENTATION.md` and `scripts/.capstone-doc-state.json` record the exact metrics and revision log.
  2. If your change alters system architecture, user workflows, study methodology, or capstone-relevant features (not just small bugfixes), also update the corresponding narrative section in `CAPSTONE_DOCUMENTATION.md` (outside `<!-- AUTO:START:* -->` / `<!-- AUTO:END:* -->` markers) and `CHANGES.md`.
- **Question Bank Builds:** After any edit to `data/questions.json`, always run `node scripts/build-questions.js` to recompile `js/data/questions.js` and refresh documentation metrics.
