-- Approving a leave creates one "On Leave" attendance entry per leave day. The server used to treat those entries
-- as manual punches, so each one sat in the regularization queue and blocked the month's attendance lock.
-- Entries backed by an approved leave of the same employee covering that date are marked as reviewed.
UPDATE attendances a
SET data = (a.data - 'regularizationRequested')
      || jsonb_build_object(
        'leaveRequestId', l.id,
        'regularizationApproved', true,
        'reviewedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'reviewComment', 'Approved ' || COALESCE(l.data->>'leaveType', '') || ' leave ' || l.id),
    version = a.version + 1,
    updated_at = now()
FROM leaves l
WHERE a.id LIKE 'att-auto-leave-%'
  AND a.id = 'att-auto-leave-' || l.id || '-' || (a.data->>'date')
  AND a.data->>'status' = 'On Leave'
  AND a.data->>'regularizationApproved' IS NULL
  AND l.data->>'status' = 'Approved'
  AND l.data->>'employeeId' = a.data->>'employeeId'
  AND l.data->>'startDate' <= a.data->>'date'
  AND l.data->>'endDate' >= a.data->>'date';
