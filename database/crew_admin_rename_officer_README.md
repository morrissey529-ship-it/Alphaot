# Admin-only officer name edits

Prepared for **Alpha, Bravo, Charlie, and Delta** crew sites.

## Deployment dependency
The overtime Supabase project `hvihhsrhoqbbhkobayhx` must be reconnected
before release. The connected account currently exposes only the OurRoster project.
**Do not merge until the SQL has been applied and verified on the overtime project.**

1. Inspect existing `officers.name`, archived support, public.current_user_role(),
   and `*_private.list_state` in the live overtime database.
2. Apply `database/crew_admin_rename_officer_20261111.sql` using the connected
   Supabase migration action.
3. Verify anonymous and editor users are denied; admin can edit an active officer;
   blank and duplicate names are rejected; the row UUID and related OT/IEAS histories
   stay intact.
4. Verify same names and OT/IEAS list ordering are unchanged in a rollback-only test,
   including the Alpha and three night/day crew variants.
5. Merge the PR to publish at the existing GitHub Pages URLs. No new bookmarks.

## UI
Open **Update Officer** while signed in as an Admin. An editable Officer Name
field with **Save Name** is added above the usual Action / Status controls.
The normal Save button remains dedicated to OT/status updates. Non-admins do
not see the name editing controls.

## Historical records and seniority
Names are updated on the crew officer row, with unchanged UUID; linked overtime,
training, and In Early/After Shift records continue using that UUID.
Existing audit and undo triggers log the change. The department seniority list
remains separate so a crew edit cannot accidentally rename a different employee.

If the name participates in a legacy name-based tie-break and the edit would
move the officer in either rotation, the backend rejects it rather than changing
the list's ordering.
