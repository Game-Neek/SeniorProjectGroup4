

## Why Upcoming Assignments Isn't Updating

**Root Cause**: The `UpcomingAssignments` component has a date/time filtering bug. When you create an assignment for today, `parseISO("2026-04-06")` returns **midnight** of today — which is already in the past by the time you view it. This causes `differenceInHours` to return a negative number, so the assignment falls into **neither** the "Urgent" (requires `hoursLeft >= 0`) nor "Coming Up" (requires `hoursLeft > 48`) section. It's fetched from the database but silently dropped from the UI.

**Secondary issue**: If the default event type wasn't changed from "other" to "assignment", the query `.eq("event_type", "assignment")` would also filter it out.

## Plan

### 1. Fix the hours-until-due calculation in `UpcomingAssignments.tsx`
- Change the urgency calculation to use **days** instead of hours, or treat today's assignments as urgent (0 hours = still due today)
- Update the urgent filter to include `hoursLeft >= -24` (or use date-level comparison instead of hour-level) so same-day assignments always appear in the urgent section
- Add a fallback: any assignment with `event_date === today` should show as urgent regardless of hour math

### 2. No database or backend changes needed
The data is being stored correctly — this is purely a frontend display bug.

