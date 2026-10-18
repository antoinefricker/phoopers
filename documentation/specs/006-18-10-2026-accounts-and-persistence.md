# Spec 006 — Accounts and persistence

Phase 1d, part B. Part A — [spec 005](005-17-10-2026-system-creation.md) — gave a system a
name, a court and a duration. This one gives it somewhere to live, someone to own it, and a
way back to it.

## Intent

A system drawn today exists only in the memory of one browser tab. Reload and it is gone;
the app comes back up on the `hornsPlay` sample. The menu already carries a "Save" entry,
disabled, with a tooltip promising this lot.

Saving alone would not be enough: a system written to a database nobody can list is as lost
as one that was never written. So this lot covers the whole round trip — an account, a save,
a list, and a way back in — plus the thing a community tool needs from the first day: a
system its author can make **public**, readable by anyone with its address, without an
account.

It also removes the standing risk that any of this is built on: twenty minutes of drawing
held in a variable. From here the browser keeps the system being worked on, so a reload, a
crash or a trip through Google's sign-in page costs nothing.

## Vocabulary

As in spec 005: the domain term in code, documentation and English strings is **play**; the
French catalogue says « système ». Two terms join it:

- A system is **public** or **private**. Public means anyone may read it, signed in or not.
- A signed-in person has a **display name**: the name their public systems are credited to.
  Free-form, not unique, chosen once and changeable afterwards.

## Goals

- A coach can draw without an account, and is asked for one only when they save.
- An account is created through Google — nothing to remember, no password to handle.
- A saved system is listed, searchable, reopened and edited further.
- A system can be made public, and a public system has its own address, which opens on the
  system itself for anyone who loads it — so that sharing works the day the app is deployed.
- A public system belongs to its author alone: anyone may read it, nobody else may write it,
  and the database enforces that rather than the interface.
- The system being worked on survives a reload or a sign-in round trip.

## Non-goals

- Saving automatically. The coach presses Save. (Explicitly deferred by the user; the
  machinery here is what a later autosave would build on.)
- Editing a system's court, extent or duration after creation. The **name** becomes
  editable in this lot; the rest stays as
  [limitations.md](../limitations.md#a-systems-court-extent-and-duration-are-fixed-once-it-is-created)
  records it.
- A visual preview of a system in the lists. Deliberately deferred: drawing one costs the
  whole system document where the list needs only its metadata.
- Community features beyond public reading — no search by tag, rating, comment, follow or
  moderation. Those are Phase 3.
- Offline editing, PWA packaging, and conflict resolution between two tabs holding the same
  system.
- Deleting an account, exporting one's systems, transferring ownership.
- Server-side rendering, e-mail/password sign-in, magic links, and every identity provider
  other than Google. Adding a second one is a line in a list, and this lot leaves it there.
- Deploying the app. It runs on the developer's machine against a hosted Supabase project;
  hosting, and the public address a colleague can actually open, are a later lot. The
  addresses below are real routes, reachable on `localhost` today.

## Anti-goals

Failures even if the feature technically works:

- Work lost between pressing Save and arriving back from the identity provider.
- A private system readable by someone who guesses its address. Row Level Security has to
  deny it at the database, not the client.
- A coach who signs in to save and lands on an empty editor, their system gone.
- Someone opening a public system, editing it, pressing Save, and silently overwriting the
  author's copy.
- An anon key, or any other secret, committed to the repository.

## Shape of the application

Today the app is one screen: `App` mounts `EditorContextProvider` on `hornsPlay` and renders
`PlayView`. This lot makes it several, with real addresses.

| Address          | Screen                                                              | Account needed |
| ---------------- | ------------------------------------------------------------------- | -------------- |
| `/`              | Home — three cards                                                  | no             |
| `/library`       | Public systems                                                      | no             |
| `/mine`          | My systems                                                          | yes            |
| `/play`          | The editor, on the system in progress (not saved, or newly created) | no             |
| `/play/:id`      | The editor, on a stored system                                      | no, if public  |
| `/auth/callback` | Where the identity provider returns; resumes what was interrupted   | —              |

### Home

Three cards of equal rank, no primary among them: **New system**, **Public systems**, **My
systems**. The third is reachable only signed in; signed out, it invites signing in rather
than hiding.

A header carries the app's name and, on the right, either "Sign in" or the account menu
(display name, "Change my display name", "Sign out").

**New system** does not go straight to the creation dialog when a draft is held in the
browser. It first asks: _resume the system in progress_, or _start a new one_ — and only the
second discards the draft. With no draft, it opens the creation dialog from spec 005
unchanged.

### My systems

Signed in only. A search field over the names, a "New" button, and one card per system
holding the name, a public/private badge, the court and extent, and the date it was last
changed. **Open** is on the card; everything else is behind a `…` menu: **Rename**,
**Make public** / **Make private**, **Duplicate**, **Delete**. Deleting asks first.

### Public systems

Open to anyone. The same cards, minus the private ones and the ownership actions: the name,
the author's display name, the court and extent, and **Open**. Searchable by name the same
way.

An address naming a system that does not exist, or one that is private and not the reader's,
is the same thing seen from outside: the database returns nothing either way, and so does the
app — one "no such system" screen, which invites signing in when nobody is. It never says
whether the system exists, because saying so would leak what Row Level Security is there to
hide.

### The editor

Unchanged in substance. What joins it:

- **Save** in the system menu, no longer disabled, and marked while the open system differs
  from what was last stored. A system never stored is always marked.
- The behaviour behind it, which depends on who is looking:

| Open system                   | Save does                                                                |
| ----------------------------- | ------------------------------------------------------------------------ |
| Never stored                  | Asks for an account if there is none, then the save dialog, then inserts |
| Stored, owned by the signer   | Overwrites, no dialog                                                    |
| Stored, owned by someone else | Says so and offers to save a copy, which the signer then owns            |

A copy — made from the `…` menu on one's own system, or offered when saving someone else's —
is **always private**, whatever the original was, and the save dialog opens with its name
already filled in as the original's followed by a word marking it a copy. Nothing records
where it came from; attribution between coaches belongs to Phase 3.

The **save dialog** is the creation dialog's twin — the same shape, the same words — holding
the name, editable, and the public/private choice. It appears on a first save and on a copy;
never on a plain overwrite.

### Signing in

One screen, one button: Google. No form. On the first return from a
provider, the app asks for a display name before anything else; after that, the return goes
back to where the coach was, carrying out the action that sent them away — pressing Save
before signing in means the save dialog is what greets them.

## The draft

The browser holds exactly one system: the one currently open. It is written on every change
and it carries the system's identity — its `id`, and whether it has ever been stored — so a
draft of a stored system is that system with unsaved changes, and resuming it writes back to
the same row rather than making a second copy. A draft of a system owned by someone else
stays owned by them, and saving it still offers a copy.

Where it is picked up again:

- **Reload** brings the app up on the home screen, not in the editor. The draft is waiting,
  not reopened.
- **New system** offers it back, as described above, and only "start a new one" drops it.
- **Opening another system**, from either list, replaces it. When the draft has unsaved
  changes, the coach is told what they are about to leave behind and confirms before the
  other system opens. With nothing unsaved there is nothing to warn about, and the switch is
  silent.

This is what makes the sign-in round trip safe, and it is also why the app no longer boots
on `hornsPlay`.

## Storage

One table for people, one for systems.

**`profiles`** — one row per account, keyed by the Supabase auth user id, holding the display
name, which is required, and when it was created. The row is written by the app once the
coach has given a display name, so a signed-in person with no profile row is simply one who
has not finished that step: the app asks again rather than letting them past it. Readable by
anyone (a public system's author has to be nameable); writable by its owner alone.

**`plays`** — one row per system:

| Column                     | Why it is a column rather than inside the document                               |
| -------------------------- | -------------------------------------------------------------------------------- |
| `id`                       | The address in `/play/:id`; the document's own `Play.id`, supplied by the client |
| `owner_id` → `auth.users`  | Ownership, and what every policy is written against                              |
| `name`                     | Listed, searched and sorted without opening the document                         |
| `court`, `extent`          | Shown on every card                                                              |
| `is_public`                | What the read policy turns on                                                    |
| `created_at`, `updated_at` | "Last changed" on every card, and the list's order                               |
| `schema_version` (`int`)   | Which shape of `Play` the document is, so a later change can migrate on read     |
| `data` (`jsonb`)           | The whole `Play`: players, branches, tracks, steps, screens                      |

A system keeps one identity everywhere: the `PlayId` the editor already mints is the row's
primary key, so the address in the bar, the draft in the browser and the document in the
column all name the same thing. Duplicating a system, or saving a copy of someone else's,
mints a new one.

A document that fails `validatePlay` on load still opens: the existing issue panel is what
tells the coach, exactly as it does for a system built in the editor.

The `Play` is stored as one JSON document because it is always read and written whole — the
engine resolves a branch against the entire tree, and no screen in the product asks for part
of a system. Splitting the branch tree into tables would buy queries nobody runs and cost a
join-heavy write on every save. The duplicated fields (`name`, `court`, `extent`) are the
document's, copied out for the lists; the document stays authoritative, and the row is
written from it on every save, so they cannot drift.

### Row Level Security

Enabled on both tables, and the rules are the product's rules:

- **Read a system** when it is public, or when the reader owns it.
- **Write a system** — insert, update, delete — when the writer owns it, and an insert may
  not claim another owner.
- **Read a profile**: anyone. **Write a profile**: its owner.

These are stated as SQL policies, committed in the repository as a migration file so the
schema is reviewable and reproducible, not clicked into a dashboard and forgotten.

### Configuration

The Supabase URL and anon key reach the app through Vite environment variables
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), read from `.env.local`, which is not
committed. A committed `.env.example` documents both. The anon key is public by design — it
is shipped in the bundle and RLS is what protects the data — but it still does not belong in
git, because it names the project.

The app must start and run without them: with no configuration it is the editor and the
draft, the home screen keeps its three cards, and every screen that needs the server says in
plain words that the app is not configured rather than failing. This is the state the test
suite and the CI build run in — no test reaches a real database.

The schema and its policies are one SQL migration committed to the repository, under
`supabase/migrations/`, applied to the project through the Supabase SQL editor or CLI. The
repository gains no database service, and CI applies nothing.

## Server state

Server data — the two lists, one system, the signed-in profile — is read through **TanStack
Query**, as the [roadmap](../roadmap.md#recommended-architecture--stack-to-be-refined-in-phase-1)
recommends: it owns the cache, the loading and error states, and the invalidation after a
save, a rename, a publish or a delete. Authentication state is a React context following the
repository's `XxxContextProvider` / `useXxxContext` convention.

Routing is **React Router**. The editor's own state — the open `Play`, the mode, the
selection — stays exactly where it is, in `EditorContextProvider`.

## Strings

Every user-facing string goes through `t()` with its English default, extracted and
translated into French in the same commit. New key prefixes: `home.*`, `auth.*`,
`library.*`, `mine.*`, and `play.save.*` alongside the existing `play.menu.*` and
`play.create.*`.

## Verification

A coach, on a machine that has never seen the app:

1. Opens it, lands on the home screen, picks **New system**, and gets the creation dialog.
2. Draws, reloads the page by accident, picks **New system** again and is offered their work
   back — unchanged.
3. Presses **Save**, is told an account is needed, signs in with Google, chooses a display
   name, and comes back to the save dialog without having lost anything.
4. Saves the system as private, reloads, opens **My systems**, and finds it there.
5. Opens it, moves a player, saves again — no dialog, and the card's date moves.
6. Makes it public, copies its address into another browser with no account at all, and the
   system opens.
7. In that second browser, signs in as someone else, moves a player, presses Save, and is
   offered a copy rather than overwriting the first coach's system.
8. Renames, then deletes their system, confirming first; it leaves both lists.

And the rules hold where the interface cannot be trusted to hold them: a private system's row
is unreadable through the API by anyone but its owner.

## Open to the implementer

- How the lists paginate, if they do at this size.
- Whether the Supabase CLI joins the repository, and whether a local Postgres is part of the
  developer setup.
- Whether the search filters in the browser or in Postgres, and what it does about accents.
- The exact shape of the interrupted-action resume across the sign-in redirect.
- Where the draft lives in the browser's storage and under what key, and what happens when
  it cannot be parsed.
- How Supabase is faked in tests, and which tests reach a real database, if any.
- The visual arrangement of the three home cards, the list cards and the sign-in screen,
  within the Mantine conventions the repository already follows.
