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

const API_HEADERS = {
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

function parseHoursAndStatus(schedule: any[]): { hours: string; status: string } {
  if (!schedule || !Array.isArray(schedule) || schedule.length === 0) {
    return { hours: 'Hours not available', status: 'UNKNOWN' };
  }

  const now = new Date();
  // Convert to Eastern Time
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const dayOfWeek = etNow.getDay(); // 0=Sun, 1=Mon...
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayName = dayNames[dayOfWeek];

  let todayHours = '';
  let isOpen = false;

  for (const entry of schedule) {
    if (!entry || typeof entry !== 'object') continue;
    
    const dayKey = Object.keys(entry).find(k => k.toLowerCase() === todayName || k.toLowerCase() === todayName.substring(0, 3));
    const periods = entry.periods || entry.mealPeriods || [];
    
    if (Array.isArray(periods)) {
      for (const period of periods) {
        const name = period.name || period.mealPeriodName || '';
        const from = period.from || period.startTime || '';
        const to = period.to || period.endTime || '';
        if (from && to) {
          todayHours += (todayHours ? ', ' : '') + `${name ? name + ' ' : ''}${from}-${to}`;
          
          // Check if currently open
          try {
            const [fH, fM] = parseTime(from);
            const [tH, tM] = parseTime(to);
            const nowMins = etNow.getHours() * 60 + etNow.getMinutes();
            const fromMins = fH * 60 + fM;
            const toMins = tH * 60 + tM;
            if (nowMins >= fromMins && nowMins <= toMins) {
              isOpen = true;
            }
          } catch {}
        }
      }
    }
  }

  return {
    hours: todayHours || 'Closed today',
    status: isOpen ? 'OPEN' : 'CLOSED',
  };
}

function parseTime(timeStr: string): [number, number] {
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return [0, 0];
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const ampm = match[3]?.toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return [h, m];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check cache
    if (cache && (Date.now() - cache.timestamp) < CACHE_TTL) {
      console.log('Returning cached dining data');
      return new Response(
        JSON.stringify({ success: true, data: cache.data, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching fresh dining data from GraphQL API');

    const response = await fetch(
      `${GRAPHQL_URL}?query=${encodeURIComponent(LOCATIONS_QUERY)}&operationName=getLocations&variables=${encodeURIComponent(JSON.stringify({ campus_url_key: "campus" }))}&extensions=${encodeURIComponent(JSON.stringify({ clientLibrary: { name: "@apollo/client", version: "4.1.6" } }))}`,
      {
        method: 'GET',
        headers: API_HEADERS,
      }
    );

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
      const { hours, status } = parseHoursAndStatus(schedule);

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

    // Update cache
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
