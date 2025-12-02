# Canvas LMS Integration

Full Canvas LMS integration including OAuth authentication, course sync, and calendar import.

## Database Schema
- `profiles` table extended with Canvas fields:
  - `canvas_access_token` - OAuth access token
  - `canvas_refresh_token` - OAuth refresh token  
  - `canvas_connected_at` - Timestamp of connection
  - `canvas_domain` - Institution-specific Canvas URL (e.g., myschool.instructure.com)

## Planned Features
1. **OAuth Sign-in**: Authenticate with Canvas to sync courses, assignments, and grades
2. **Calendar Sync**: Import calendar events and assignment due dates to AgentB calendar
3. **Course Import**: Pull enrolled courses and syllabi automatically

## Implementation Notes
- Each institution has their own Canvas domain (e.g., university.instructure.com)
- OAuth flow requires CANVAS_CLIENT_ID and CANVAS_CLIENT_SECRET secrets
- Canvas API uses OAuth 2.0 with refresh token support
- Edge function will handle OAuth callback and token exchange
