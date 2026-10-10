# Alpha OT — Training order by the original list position
**Corrected and verified: October 10, 2026.**

## Rule (plain English)
When two or more officers are assigned Training **for the same Training date**,
they move to the end of the rotation **in the relative order they occupied
immediately before the first Training assignment for that date**.

Entering officers in a different sequence must not change that result.

Example: Engelman was above Kent before October 14 Training was assigned.
Engelman remains above Kent after both have been recorded, whether Engelman
or Kent was entered first. Likewise, Luttrell remains above Leadingham.

## How the application enforces this rule
- Before the **first Training assignment** for a given work date, the database
  records a private snapshot of the complete OT list's existing order.
- On every additional Training assignment for that same date, the database
  repositions the valid (non-reversed) Training participants according to
  that unchanged snapshot, rather than by the sequence of entries.
- Training still drops immediately when assigned.
- Prior history and **manual Admin corrections are preserved**; no existing
  events or manually entered corrections were deleted.
- The Training-date snapshot is preserved even if there were manual list
  moves between Training entries.
- The **Volunteer OT then Required OT** block ordering rule is separate
  and was not modified.
- This new behavior applies to Training entries at or after
  **2026-10-10 11:26 UTC**; older Training history retains its prior logic.

## Deployment, regression test and storage
The following migrations were installed on **both** Alpha OT and Alpha OT Beta:
- `training_positions_snapshot_storage`
- `capture_initial_positions_for_training_assignments`
- `training_drop_order_uses_pre_group_snapshot`

The private schema stores:
`alpha_private.training_group_positions`

The existing October 14 production Training group was seeded using the list
position immediately before its first Training entry, rather than today's
already-dropped positions.

Beta regression test: adding Engelman then Kent **and** adding Kent then
Engelman both result in Engelman before Kent. A four-officer test adding
Leadingham, Kent, Luttrell and Engelman in reverse order produces the expected
pre-Training order. Tests were performed in transactions and rolled back.

On production, the verified October 14 Training group order is:
1. Engelman
2. Luttrell
3. Kent, C
4. Leadingham

See `database/alpha_training_position_order_20261010.sql` for reproducible
database migration code. No website or calendar frontend change is necessary.
