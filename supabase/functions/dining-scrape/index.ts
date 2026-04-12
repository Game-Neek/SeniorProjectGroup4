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
}

let cache: { data: DiningLocation[]; timestamp: number } | null = null;
const CACHE_TTL = 86400 * 1000; // 24 hours

function parseLocations(html: string): DiningLocation[] {
  const locations: DiningLocation[] = [];

  // Split by location card boundaries
  const cardRegex = /<div[^>]*class="[^"]*location-card[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*location-card|$)/gi;
  
  // Try a more general approach - look for repeated card structures
  // The site uses a grid of location cards with images, titles, addresses, hours
  
  // Extract all location blocks by looking for patterns
  const nameRegex = /<h[2-4][^>]*class="[^"]*(?:location|card)[^"]*"[^>]*>(.*?)<\/h[2-4]>/gi;
  const imgRegex = /<img[^>]*src="(https:\/\/images\.elevate-dxp\.com[^"]*)"[^>]*>/gi;

  // Broader approach: find all card-like sections with name + image + status
  // Split by a unique repeating marker in the HTML
  const sections = html.split(/(?=<a[^>]*class="[^"]*card[^"]*")/i);
  
  for (const section of sections) {
    if (section.length < 50) continue;

    const nameMatch = section.match(/<h\d[^>]*>(.*?)<\/h\d>/i) 
      || section.match(/class="[^"]*name[^"]*"[^>]*>(.*?)</i)
      || section.match(/class="[^"]*title[^"]*"[^>]*>(.*?)</i);
    
    const imgMatch = section.match(/<img[^>]*src="([^"]+)"[^>]*>/i);
    
    const addressMatch = section.match(/(\d+[^<]*(?:Street|St|Avenue|Ave|Boulevard|Blvd|Place|Drive|Dr|Road|Rd|Northwest|NW|NE|SW|SE)[^<]*)/i);
    
    const hoursMatch = section.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)\s*[-–]\s*\d{1,2}:\d{2}\s*(?:AM|PM))/i)
      || section.match(/(All Day[^<]*\d{1,2}:\d{2}[^<]*)/i)
      || section.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM)[^<]*)/i);
    
    const statusMatch = section.match(/(?:class="[^"]*status[^"]*"[^>]*>|class="[^"]*badge[^"]*"[^>]*>)\s*(OPEN|CLOSED|open|closed)/i)
      || section.match(/(OPEN|CLOSED)/i);
    
    const name = nameMatch ? nameMatch[1].replace(/<[^>]*>/g, '').trim() : null;
    
    if (!name || name.length < 2 || name.length > 100) continue;
    // Skip navigation/header text
    if (['Home', 'Menu', 'Locations', 'About', 'Contact', 'Login', 'Sign'].some(s => name === s)) continue;

    const address = addressMatch ? addressMatch[1].trim() : '';
    const hours = hoursMatch ? hoursMatch[1].trim() : 'Hours not available';
    const status = statusMatch ? statusMatch[1].toUpperCase() : 'UNKNOWN';
    const image = imgMatch ? imgMatch[1] : '';
    
    const directionsUrl = address 
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
      : '';

    // Deduplicate by name
    if (!locations.find(l => l.name === name)) {
      locations.push({ name, address, hours, status, image, directionsUrl });
    }
  }

  return locations;
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

    console.log('Fetching fresh dining data from Howard dining hub');
    const response = await fetch('https://howard.mydininghub.com/en/locations', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; StudyBot/1.0)',
        'Accept': 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch dining page: ${response.status}`);
    }

    const html = await response.text();
    console.log(`Fetched ${html.length} bytes of HTML`);

    const locations = parseLocations(html);
    console.log(`Parsed ${locations.length} dining locations`);

    // Update cache
    cache = { data: locations, timestamp: Date.now() };

    return new Response(
      JSON.stringify({ success: true, data: locations, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scraping dining data:', error);
    // Return cached data if available even if stale
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
