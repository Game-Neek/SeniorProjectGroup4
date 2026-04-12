

# Plan: Scrape Howard Dining Hub for Live Dining Information

## Summary
Create an edge function that scrapes `https://howard.mydininghub.com/en/locations` on demand, parses dining location data (name, address, hours, open/closed status, image), and serves it to the frontend. Results are cached for 24 hours to minimize external requests.

## Implementation

### 1. New Edge Function: `dining-scrape`
- Fetches HTML from `https://howard.mydininghub.com/en/locations`
- Parses location cards using regex/string parsing
- Returns JSON array with: name, address, hours, status (OPEN/CLOSED), image URL, directions link
- **Caches results in-memory for 24 hours** (86400 seconds). Subsequent calls within the same day return the cached response instantly. Cache is keyed by date so it refreshes daily.

### 2. New Component: `DiningLocations.tsx`
- Dialog opened from Dashboard's "See Menus" button
- Displays dining location cards with image, name, address, hours
- Green/red OPEN/CLOSED badges
- "Get Directions" link to Google Maps
- Filter tabs: "All" and "Open Now"

### 3. Update `Dashboard.tsx`
- Wire "See Menus" button to open the `DiningLocations` dialog
- Show count of currently open locations on the card

## Files
- **New**: `supabase/functions/dining-scrape/index.ts`
- **New**: `src/components/DiningLocations.tsx`
- **Modified**: `src/components/Dashboard.tsx`

## No Database Changes Required

