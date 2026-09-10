# Booking E2E Test Plan

Run these cases with one admin, one branch manager A, one sale A, and one sale B in another branch.

1. Full information in one message: name, phone, service, branch, concrete time. Expected: AI asks confirmation, creates one appointment after customer confirms.
2. Missing name. Expected: AI asks only name.
3. Missing phone. Expected: AI asks only phone and rejects invalid Vietnamese phone.
4. Missing service. Expected: AI asks service and validates configured products when products exist.
5. Missing branch. Expected: AI asks branch and validates team/branch.
6. Missing date/time. Expected: AI asks date/time.
7. Ambiguous time "cuối tuần" or "tầm 3h". Expected: AI asks customer to confirm a concrete time.
8. Reschedule. Expected: old appointment status becomes rescheduled/cancelled; old reminders are not sent.
9. Cancel. Expected: status cancelled; reminder worker skips it.
10. Duplicate booking same phone + service + branch + datetime. Expected: API returns "Khách đã có lịch hẹn tương tự".
11. Branch A appointment notification. Expected: admin, branch A users, assigned sale receive notification; branch B does not.
12. Reminder 24h and 2h. Expected: each sent once, timestamps are set.
13. Follow-up silent customer. Expected: 30m, 3h, 1d max three times; stops after customer replies or AI paused.
14. AI created appointment log. Expected: `ai_activity_logs.action_type = ai.appointment_created`.
15. Permission check. Expected: sale B cannot list or open branch A contact/appointment/conversation.
