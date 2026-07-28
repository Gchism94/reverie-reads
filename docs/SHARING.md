# Sharing, household sync & book clubs

Reverie's **Clubs** tab adds three collaborative features:

- **Shared lists** — a household TBR or any list you share by code; everyone with the code can add/remove and sees changes within a few seconds.
- **Book-club TBR** — the same thing, labelled for a club (everyone can edit).
- **Read-alongs** — a group reads one book together; each reader tracks their chapter/page, and every comment is tagged to a point in the book and stays hidden for you until you reach it.

## How sharing works

Everything shared is stored as one JSON **document** identified by a random **share code**.
The code works like a Google-Doc "anyone with the link": hand it to your household or club and
they can open and edit the same document. The app picks a sync backend automatically:

| Mode                 | When                                                         | Live?                             | Notes                                                 |
| -------------------- | ------------------------------------------------------------ | --------------------------------- | ----------------------------------------------------- |
| **Cloud (Supabase)** | You've set a Project URL + anon key in ⚙ Sync setup          | Yes, across any device/person     | Recommended for a household or remote club            |
| **Host-shared**      | Running inside an environment that provides `window.storage` | Yes, for everyone using that copy | e.g. the Claude artifact preview                      |
| **This device**      | A plain static deployment with no backend configured         | No                                | Still fully usable; share via **Export/Import** codes |

The app polls the shared document every few seconds while you have a list or read-along open, so
edits from other people appear on their own. No realtime config required.

### Turning on cloud sync (Supabase, free)

1. Create a project at <https://supabase.com> (free tier is plenty).
2. In the SQL editor, run [`supabase_schema.sql`](../supabase_schema.sql).
3. In the app: **Clubs ▸ ⚙ Sync setup**, paste your **Project URL** and **anon public key**, Save.
   (You can also bake them into `SyncBaked` at the top of the app script if you prefer.)

The app calls Supabase's auto-generated REST endpoint (PostgREST) directly with the anon key —
no client library, no build step.

### Offline / no-backend sharing

Without a backend you can still share: open a list and hit **Export code** to copy a self-contained
blob (`RVL1:…`), send it to someone, and they paste it into **Join by code**. It's a snapshot, not
live, but it moves a list between devices.

## Read-along spoiler gating

Each comment carries the chapter/page it's "about". When you open a read-along the app only renders
comments at or before **your** current progress; the rest show as a locked count
("🔒 4 comments unlock at Chapter 12"). Move your progress up and more unlock.

This is an **honor-friendly** gate: members are trusted (they hold the code), and the hiding happens
in the app. It's designed for a friendly book club, not as an adversarial secret. Defining the book's
structure (chapter/page count) is a quick manual step when you create the read-along — exactly as
expected.

## Data shapes

```jsonc
// shared list (key = share code)
{ "type":"list", "kind":"list"|"clubtbr", "name":"Household TBR",
  "items":[{ "id":"…", "title":"…", "author":"…", "cover":"…", "by":"Greg" }],
  "updatedAt": 1730000000000 }

// read-along (key = share code)
{ "type":"club", "title":"Iron Flame", "author":"Rebecca Yarros", "cover":"…",
  "unit":{ "type":"chapter"|"page"|"percent", "count":65, "label":"Chapter" },
  "members":[{ "id":"…", "name":"Greg", "progress":12 }],
  "comments":[{ "id":"…", "by":"…", "byName":"Greg", "unit":12, "text":"…", "ts": 1730000000000 }],
  "updatedAt": 1730000000000 }
```

## Privacy & limits

- **Capability codes**: anyone with a code can view and edit that document. Don't post codes publicly.
- **Last-write-wins**: simultaneous edits to the _same_ document resolve to the most recent save. Fine
  for a few people; the app re-reads just before each change to minimise clobbering.
- **Whole-library household sync** isn't wired into the UI yet, but it's the same mechanism — a future
  step can store your library under a household code so everyone sees the same shelves.
