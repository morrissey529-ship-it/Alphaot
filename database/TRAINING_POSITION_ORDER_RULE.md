# Alpha OT Training drop order — implemented October 10, 2026

## Rule
When several officers are assigned Training for **the same work date**, they must
drop as a group in **their existing relative rotation order**, regardless of
the order in which their Training assignments are entered. The officer already
farther down the list must still be farther down after both drop.

Example: Luttrell is above Leadingham before assignments for October 14.
Even if Leadingham is recorded first and Luttrell second, the resulting
Training group must show Luttrell before Leadingham. The manual correction
made on October 10 is preserved.

- A Training assignment still affects rotation immediately when entered.
- Training is grouped by **Training date**, rather than by operator entry order.
- On each additional Training assignment for that date, the rotation engine
  moves the currently valid Training participants together in their existing
  relative positions. It excludes reversed Training events.
- Existing admin/manual corrections remain in the rotation history.
- Volunteer and Required OT retain their separate established block logic:
  volunteers by workday first, then requireds by workday.
- Bereavement remains a non-dropping status, unrelated to Training.
- Older Training history before the October 10, 2026 cutover stays unchanged.

## Implementation
Both the Alpha OT and Alpha OT Beta Supabase databases have:
- `alpha_private.apply_training_group(uuid[], date, timestamptz)`
- A branch in `alpha_private.replay_segment(uuid[],timestamptz,timestamptz)`
  for Training actions from **2026-10-10 11:26:00 UTC** onward, delegating
  to `alpha_private.apply_training_group`.

Database migrations:
- `training_order_helper`
- `training_group_rotation_engine`

Important: these two database migrations must be transferred along with the
application during any company handoff. This is a backend rotation rule;
no calendar or front-end changes are needed.
