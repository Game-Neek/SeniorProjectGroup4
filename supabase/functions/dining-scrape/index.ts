const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface DiningLocation {
  name: string;
  address: string;
  hours: string;
  status: string;
  image: string;
  directionsUrl: string;
  category: string;
}

let cache: { data: DiningLocation[]; timestamp: number } | null = null;
const CACHE_TTL = 86400 * 1000; // 24 hours

const GRAPHQL_URL = 'https://api.elevate-dxp.com/api/mesh/c087f756-cc72-4649-a36f-3a41b700c519/graphql';

const LOCATIONS_QUERY = `query getLocations($campus_url_key:String!$location_category:[String]$limit:Int$isFeatured:Boolean){getLocations(campusUrlKey:$campus_url_key locationCategory:$location_category limit:$limit isFeatured:$isFeatured){commerceAttributes{uid url_key address_line_1 address_line_2 city_locality state_province postal_code timezone longitude latitude location_category_ids __typename}aemAttributes{name wayfindingInstructions featuredLocation teaserAssetRef{...on AEM_ImageRef{_dynamicUrl width height __typename}__typename}hoursOfOperation{_path schedule __typename}_path __typename}__typename}}`;

const API_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Accept': 'application/graphql-response+json,application/json;q=0.9',
  'store': 'ch_howard_en',
  'magento-store-code': 'ch_howard',
  'magento-website-code': 'ch_howard',
  'magento-store-view-code': 'ch_howard_en',
  'x-api-key': 'ElevateAPIProd',
  'aem-elevate-clientpath': 'ch/howard/en',
  'magento-customer-group': 'b6589fc6ab0dc82cf12099d1c2d40ab994e8410c',
};

const DAY_ABBREVS: Record<string, number> = {
  'mo': 1, 'tu': 2, 'we': 3, 'th': 4, 'fr': 5, 'sa': 6, 'su': 0,
};

function expandDayRange(rangeStr: string): number[] {
  // e.g. "Mo-Fr" -> [1,2,3,4,5], "Sa-Su" -> [6,0], "Mo" -> [1]
  const parts = rangeStr.toLowerCase().split('-');
  if (parts.length === 1) {
    const d = DAY_ABBREVS[parts[0]];
    return d !== undefined ? [d] : [];
  }
  const start = DAY_ABBREVS[parts[0]];
  const end = DAY_ABBREVS[parts[1]];
  if (start === undefined || end === undefined) return [];
  const days: number[] = [];
  let d = start;
  while (true) {
    days.push(d);
    if (d === end) break;
    d = d === 6 ? 0 : d + 1; // wrap from Sa(6) -> Su(0)
    if (days.length > 7) break;
  }
  return days;
}

function formatTime24to12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
}

function parseSchedule(schedule: any[]): { hours: string; status: string } {
  if (!schedule || !Array.isArray(schedule) || schedule.length === 0) {
    return { hours: 'Hours not available', status: 'UNKNOWN' };
  }

  const now = new Date();
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etNow = new Date(etStr);
  const currentDay = etNow.getDay(); // 0=Sun
  const currentMins = etNow.getHours() * 60 + etNow.getMinutes();

  // Use the "standard" schedule
  const standard = schedule.find((s: any) => s.type === 'standard') || schedule[0];
  const mealPeriods = standard?.meal_periods || [];

  const todayPeriods: { name: string; from: string; to: string }[] = [];
  let isOpen = false;

  for (const mp of mealPeriods) {
    const openingHours = mp.opening_hours || '';
    if (!openingHours) continue;

    // Parse segments like "Mo-Fr 08:00-16:00; Sa-Su off"
    const segments = openingHours.split(';').map((s: string) => s.trim());
    
    for (const segment of segments) {
      if (!segment) continue;
      const parts = segment.split(/\s+/);
      if (parts.length < 2) continue;
      
      const dayRange = parts[0];
      const timeRange = parts[1];
      
      if (timeRange.toLowerCase() === 'off') continue;
      
      const days = expandDayRange(dayRange);
      if (!days.includes(currentDay)) continue;
      
      const timeParts = timeRange.split('-');
      if (timeParts.length !== 2) continue;
      
      const from = timeParts[0];
      const to = timeParts[1];
      
      const [fH, fM] = from.split(':').map(Number);
      const [tH, tM] = to.split(':').map(Number);
      const fromMins = fH * 60 + fM;
      const toMins = tH * 60 + tM;
      
      todayPeriods.push({
        name: mp.meal_period,
        from: formatTime24to12(from),
        to: formatTime24to12(to),
      });
      
      if (currentMins >= fromMins && currentMins <= toMins) {
        isOpen = true;
      }
    }
  }

  if (todayPeriods.length === 0) {
    return { hours: 'Closed today', status: 'CLOSED' };
  }

  // Merge/simplify: show distinct time ranges
  const uniqueRanges = new Map<string, string[]>();
  for (const p of todayPeriods) {
    const key = `${p.from}-${p.to}`;
    if (!uniqueRanges.has(key)) uniqueRanges.set(key, []);
    uniqueRanges.get(key)!.push(p.name);
  }

  const hoursStr = Array.from(uniqueRanges.entries())
    .map(([range, names]) => `${names[0]} ${range}`)
    .join(', ');

  return { hours: hoursStr, status: isOpen ? 'OPEN' : 'CLOSED' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (cache && (Date.now() - cache.timestamp) < CACHE_TTL) {
      console.log('Returning cached dining data');
      return new Response(
        JSON.stringify({ success: true, data: cache.data, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching fresh dining data from GraphQL API');

    const params = new URLSearchParams({
      query: LOCATIONS_QUERY,
      operationName: 'getLocations',
      variables: JSON.stringify({ campus_url_key: 'campus' }),
      extensions: JSON.stringify({ clientLibrary: { name: '@apollo/client', version: '4.1.6' } }),
    });

    const response = await fetch(`${GRAPHQL_URL}?${params.toString()}`, {
      method: 'GET',
      headers: API_HEADERS,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('GraphQL API error:', response.status, errText.substring(0, 500));
      throw new Error(`GraphQL API returned ${response.status}`);
    }

    const result = await response.json();
    const rawLocations = result?.data?.getLocations || [];
    console.log(`Got ${rawLocations.length} locations from API`);

    const locations: DiningLocation[] = rawLocations.map((loc: any) => {
      const commerce = loc.commerceAttributes || {};
      const aem = loc.aemAttributes || {};

      const address = [
        commerce.address_line_1,
        commerce.address_line_2,
        commerce.city_locality,
        commerce.state_province,
        commerce.postal_code,
      ].filter(Boolean).join(', ');

      const imageRef = aem.teaserAssetRef?._dynamicUrl || '';
      const image = imageRef ? `https://images.elevate-dxp.com${imageRef}` : '';

      const schedule = aem.hoursOfOperation?.schedule || [];
      const { hours, status } = parseSchedule(schedule);

      const directionsUrl = commerce.latitude && commerce.longitude
        ? `https://www.google.com/maps/dir/?api=1&destination=${commerce.latitude},${commerce.longitude}`
        : address
          ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
          : '';

      return {
        name: aem.name || commerce.url_key || 'Unknown Location',
        address,
        hours,
        status,
        image,
        directionsUrl,
        category: (commerce.location_category_ids || [])[0] || '',
      };
    });

    cache = { data: locations, timestamp: Date.now() };

    return new Response(
      JSON.stringify({ success: true, data: locations, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching dining data:', error);
    if (cache) {
      return new Response(
        JSON.stringify({ success: true, data: cache.data, cached: true, stale: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to fetch dining data' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
