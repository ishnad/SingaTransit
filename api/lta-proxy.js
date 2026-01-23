export default async function handler(req, res) {
  // 1. Get the query parameter (BusStopCode)
  const { BusStopCode } = req.query;
  
  if (!BusStopCode) {
    return res.status(400).json({ error: 'BusStopCode is required' });
  }

  // 2. Retrieve the API Key from Vercel Environment Variables
  const apiKey = process.env.LTA_DATAMALL_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server API Key missing' });
  }

  // 3. Forward the request to LTA
  try {
    const ltaResponse = await fetch(
      `https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival?BusStopCode=${BusStopCode}`,
      {
        headers: {
          'AccountKey': apiKey,
          'accept': 'application/json'
        }
      }
    );

    if (!ltaResponse.ok) {
      throw new Error(`LTA API Error: ${ltaResponse.status}`);
    }

    const data = await ltaResponse.json();
    
    // 4. Return data to your frontend
    return res.status(200).json(data);
    
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}