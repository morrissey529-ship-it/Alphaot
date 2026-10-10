# Editable Training calendar (October 10, 2026)

## Calendar schedule (separate from OT rotation)

The Alpha Crew Training roster is now stored in **public.alpha_training_schedule** in each Supabase project:
- Live Alpha OT: `hvihhsrhoqbbhkobayhx`
- Alpha OT Beta: `jpwrlsakjxaoczdkfckk`

Both were deployed using migration `training_calendar_editable_schedule_stockman_oct19`.

All 20 original Training-calendar annotations were seeded. **Stockman, R** was moved from the October 5 calendar group to **October 19, 2026** (now with Akre and Pettyjohn). No OT event was added, deleted, or reversed; no rotation or officer status was modified by this calendar change.

The calendar's training markers, day roster popup, and expandable monthly Training roster all read from the same saved schedule using `public.alpha_training_calendar()`, granted to anonymous and authenticated users.

An Admin or Editor can select **Move** next to a Training officer in the calendar popup or monthly roster, choose a new date and save. The edit uses `public.alpha_move_training_calendar(text,date)` which checks `public.current_user_role()`, updates only the officer's schedule date and records the old and new dates in `alpha_private.training_calendar_changes`. View-only users do not see editable controls; the API rejects unauthorized updates.

The schedule table is not directly readable or writable by anonymous/authenticated roles; it is RLS-protected. The public read-only function exposes only officer name and Training calendar date.

**Critical distinction:** Rescheduling a Training calendar annotation does **not** create or alter an OT list Training event, change recorded Training attendance, or change the rotation. Rotation-affecting Training is still recorded separately from the **Update Officer → Training** action.

## Code
- Live calendar script: `alpha-calendar-v4.js`, loaded by `index.html`
- GitHub-hosted Beta: `beta/alpha-calendar-v3.js`, loaded by `beta/index.html`
- ShipStatic-hosted Beta: independently deployed copy, linked to `alpha-ot-beta.shipstatic.com`.

Preserve the schema migration, both RPC functions, role checks, and calendar JS changes together during a company handoff.
