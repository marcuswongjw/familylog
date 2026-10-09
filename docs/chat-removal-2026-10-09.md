# Retired Chat data removal — 9 October 2026

User requested deletion of all Chat data after the feature's removal.

Production project `familylog-86db6`:

- Recursively deleted the Firestore `chat` collection (45 root messages at inventory).
- Deleted four Storage objects under `chat/` (556,568 bytes total), with object-generation preconditions.
- Verified the root Chat collection no longer appears, document count is zero, and the Storage `chat/` prefix is empty.
- Removed historical-read allowances from Firestore and Storage rules. Chat now falls under default deny for all client reads/writes, including flat and owner-nested attachment layouts. Rules deployed successfully.
- Original Family Log spreadsheet metadata checked using the connected Google Drive plugin; no Chat tab remains.

Memories, user settings and all other application data remain in place. Client URL redirects and backend error responses for obsolete Chat endpoints remain deliberately, so old clients cannot recreate Chat data.

Seven emulator checks passed, including seeded legacy Chat documents/attachments whose reads are now denied for both parents and children.
