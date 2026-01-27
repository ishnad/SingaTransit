export default async function handler(req, res) {
  const { searchVal } = req.query;
  
  if (!searchVal) {
    return res.status(400).json({ error: 'searchVal is required' });
  }

  const token = process.env.ONEMAP_ACCESS_TOKEN;
  console.log(`[OneMap Proxy] Searching: "${searchVal}", token present: ${!!token}`);

  try {
    // OneMap API requires returnGeom parameter - ensure it's included
    const url = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(searchVal)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
    console.log(`[OneMap Proxy] Fetching: ${url}`);
    
    const headers = {
      'accept': 'application/json'
    };
    
    // Add Authorization header only if token exists
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(url, { headers });

    console.log(`[OneMap Proxy] Response status: ${response.status}`);
    
    if (!response.ok) {
      const text = await response.text();
      console.error(`[OneMap Proxy] Error response: ${text}`);
      
      // Return more detailed error
      return res.status(response.status).json({
        error: `OneMap API Error: ${response.status}`,
        details: text
      });
    }

    const data = await response.json();
    console.log(`[OneMap Proxy] Results count: ${data.results?.length || 0}`);
    
    return res.status(200).json(data);
    
  } catch (error) {
    console.error(`[OneMap Proxy] Caught error:`, error);
    return res.status(500).json({ error: error.message });
  }
}
