# Vacation eligibility: full scheduled work-block rule

**Effective:** November 13, 2026. Applies to Alpha, Bravo, Charlie and Delta crew overtime and IE/AS rotations.

## Rule

A vacation booking for **only some of the scheduled workdays within a 2- or 3-day work block** must **not** make an officer unavailable for the entire block, move them to the unavailable portion of the OT or IE/AS rotation, or trigger an OT rotation drop.

A vacation booking **covering every scheduled workday of the block** does make the officer ineligible under the existing block lookahead rules. After a completed full vacation work block, the existing Vacation Return rotation-drop logic applies once.

A single booked vacation day still counts as a **day off on that specific date**: do not schedule IE/AS for the officer on that booked day. The officer remains eligible for the other workdays of the block if otherwise eligible.

Do not delete partial vacation days, rewrite officers' OT/IEAS history, or manually reorder them as a side effect of booking vacation.

## Real-world regression case

- Alpha schedule: Tuesday, November 17, 2026 and Wednesday, November 18, 2026 are a two-day work block.
- Luttrell has vacation booked for Tuesday, November 17 **only** and works Wednesday, November 18.
- Expected: Luttrell remains **Active**, normal **OT and IE/AS eligibility** for the block, and keeps the same stored rotation rank. Tuesday's vacation stays booked; no IE/AS shift can be recorded for that date.
- If both November 17 and 18 are booked as vacation, the **entire block** is vacation, making the officer unavailable for that block, with a normal Vacation Return rotation drop after the block is completed.

## Implementation

Database project `hvihhsrhoqbbhkobayhx`, migration `full_block_vacation_eligibility_partial_day_fix_20261113`.

- `alpha_private.crew_vacation_covers_work_block(crew, officer_id, workday)` checks **all scheduled days** in one work block.
- `alpha_private.crew_vacation_conflict` disqualifies only where a **complete scheduled work block** in its current/next-block lookahead is booked.
- `alpha_private.crew_vacation_state` does not mark someone on full-block vacation leave merely because their first day of a partially booked block is a vacation day.
- The four crew-specific IE/AS assignment procedures still reject any assignment on its **exact booked vacation date**, even when the rest of the block is eligible.
- The existing `process_vacation_returns` (and other crew equivalents) already require complete work-block coverage before recording a vacation-return drop.

**Regression checks (read only)** completed on November 13:
- Luttrell's November 17 booking remained recorded.
- `crew_vacation_covers_work_block(..., '2026-11-17')` returned `false`.
- `crew_vacation_conflict` returned `false` for the current OT target and both November 17 and 18.
- OT and IE/AS summaries returned `vacation_unavailable=false`; the officer remained Active.
- The existing OT rotation rank did not change.

Full-block behavior is implemented by the coverage predicate and pre-existing return-drop procedure; there was no live multi-day vacation record for a non-mutating end-to-end test when this rule was recorded.
