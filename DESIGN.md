# ZenithURL — design intention

Reconstructed from the existing, consistently-applied design (no prior DESIGN.md existed).
This records what the look already *is* so later changes can be judged against it.

## Intent (one sentence)
A clean, calm personal directory of the user's subdomains and installable apps —
reads like a quiet control panel for one person, not a marketing site.

## Audience
- The **admin** (one Google account): edits status, hides sites, writes notes, uploads apps,
  manages the publish key. Wants speed and inline controls.
- **Casual visitors**: read-only. Browse the directory and download apps. Should understand
  everything at a glance with zero hand-holding.

## Feel in three seconds
Techy, composed, low-ceremony. "Nodes", status dots with a soft glow, monospace key —
a dashboard aesthetic, not a landing page. No tagline, no hero sell.

## Tokens (the de-facto system — keep to these)
- **Field background:** `linear-gradient(165deg,#3a1d76,#271658,#160e36)`, `bg-fixed`.
- **Accent:** indigo-600 (actions), indigo-300/400 (text/icon highlights).
- **Surfaces:** `bg-white/5` glass, `border-white/10`, `rounded-2xl` cards / `rounded-xl` inputs / `rounded-full` pills.
- **Text scale:** slate-100 body, slate-200 headings, slate-400/500 secondary.
- **Semantic status:** single source of truth is `STATUS_CONFIG` — finished=emerald, unfinished=rose, on_hold=amber. Hidden=slate (admin-only, muted).
- **Type:** wordmark `zenithurl` (lowercase, `url` in indigo-300). No gradient text.
- **Glow:** indigo box-shadow on primary actions; `shadow-[0_0_8px_currentColor]` on status dots. Use sparingly — it is the one flourish.

## Feature ranking (tier = how big / where / how many clicks)
- **Tier 1:** the directory itself (grouped site grid) + the domain search box. The point of the app; zero clicks.
- **Tier 1 (Apps view):** the installable-apps grid. Peer to the directory via the top tab switch.
- **Tier 2:** per-card status pill (admin: a control; visitor: a label), hide/note/edit icons, "Add app". One click, visible but quiet.
- **Tier 3:** Admin sign-in, Publish API key. Behind a button / modal. Present, not surfaced.

## Density stance
Grows by **adding structure, not shouting**: status sections already group the grid;
future growth means more sections / filters / wider columns, not bigger furniture or louder color.
Keep one tier-1 focus per view. New features land at the tier they earn, not at the top because they're new.

## What would violate this
- A marketing tagline / hero subtitle under the wordmark.
- Gradient text, emoji section icons, or a second accent hue competing with indigo.
- A fixed narrow column that strands content in the middle of a wide monitor.
- Explanatory grey micro-copy propping up a control instead of a clearer label/default.
- Two sources of truth for status color (keep it in `STATUS_CONFIG`).
- Everything equally loud: if the directory, search, and admin tools all shout, ranking is lost.
