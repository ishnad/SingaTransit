import requests
import json
import os
import math
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configuration
API_KEY = os.getenv('LTA_DATAMALL_API_KEY')
# UPDATE: Changed to HTTPS to prevent 404 errors
BASE_URL = 'https://datamall2.mytransport.sg/ltaodataservice'
OUTPUT_DIR = './public/data'

# Validation
if not API_KEY:
    raise ValueError("Error: LTA_DATAMALL_API_KEY not found in environment variables. Check your .env file.")

# Constants for Weight Calculation
AVG_BUS_SPEED_KMH = 25
METERS_PER_KM = 1000
SECONDS_PER_HOUR = 3600

headers = {
    'AccountKey': API_KEY,
    'accept': 'application/json'
}

def fetch_lta_data(endpoint):
    """
    Fetches all records from an LTA DataMall endpoint, handling pagination (500 records per skip).
    """
    data_buffer = []
    skip = 0
    while True:
        url = f"{BASE_URL}/{endpoint}?$skip={skip}"
        print(f"Fetching {endpoint} with skip {skip}...")
        try:
            response = requests.get(url, headers=headers)
            
            # Debugging: If 404 or other error, print details
            if response.status_code != 200:
                print(f"FAILED: HTTP {response.status_code} - {response.text}")
                response.raise_for_status()
                
            results = response.json().get('value', [])
            
            if not results:
                break
            
            data_buffer.extend(results)
            skip += 500
        except requests.exceptions.RequestException as e:
            print(f"Error fetching data: {e}")
            break
            
    print(f"Total {endpoint} records fetched: {len(data_buffer)}")
    return data_buffer

def build_stops_metadata(stops_data):
    metadata = {}
    for stop in stops_data:
        code = stop['BusStopCode']
        metadata[code] = {
            'lat': float(stop['Latitude']),
            'lng': float(stop['Longitude']),
            'name': stop['Description'],
            'road': stop['RoadName']
        }
    return metadata

def calculate_time_weight(distance_km):
    if distance_km <= 0:
        return 10 
    return (distance_km / AVG_BUS_SPEED_KMH) * SECONDS_PER_HOUR

def build_graph(routes_data):
    graph = {}
    
    # Sort routes by Service, Direction, and StopSequence
    sorted_routes = sorted(
        routes_data, 
        key=lambda x: (x['ServiceNo'], x['Direction'], x['StopSequence'])
    )

    for i in range(len(sorted_routes) - 1):
        current = sorted_routes[i]
        nxt = sorted_routes[i+1]

        # Check continuity: Same Service, Same Direction, Sequential Sequence
        if (current['ServiceNo'] == nxt['ServiceNo'] and 
            current['Direction'] == nxt['Direction'] and
            nxt['StopSequence'] == current['StopSequence'] + 1):

            source_id = current['BusStopCode']
            target_id = nxt['BusStopCode']
            
            dist_current = float(current.get('Distance') or 0)
            dist_next = float(nxt.get('Distance') or 0)
            segment_dist_km = max(0, dist_next - dist_current)
            
            weight = calculate_time_weight(segment_dist_km)

            if source_id not in graph:
                graph[source_id] = {}
            
            if target_id not in graph[source_id]:
                graph[source_id][target_id] = []

            graph[source_id][target_id].append({
                'service': current['ServiceNo'],
                'direction': current['Direction'],
                'distance': segment_dist_km,
                'weight': int(weight)
            })

    return graph

def main():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    print("--- Starting Data Engineering Process (HTTPS) ---")

    # 1. Fetch Data
    stops_raw = fetch_lta_data('BusStops')
    routes_raw = fetch_lta_data('BusRoutes')

    if not stops_raw or not routes_raw:
        print("Critical: Failed to fetch data. Aborting.")
        return

    # 2. Process Metadata
    print("Building Stops Metadata...")
    stops_metadata = build_stops_metadata(stops_raw)
    
    # 3. Process Graph
    print("Building Transit Graph...")
    transit_graph = build_graph(routes_raw)

    # 4. Serialize to JSON
    print("Writing output files...")
    
    with open(f'{OUTPUT_DIR}/stops_metadata.json', 'w') as f:
        json.dump(stops_metadata, f)
        
    with open(f'{OUTPUT_DIR}/transit_graph.json', 'w') as f:
        json.dump(transit_graph, f)

    print(f"--- Success. Files saved to {OUTPUT_DIR} ---")
    print(f"Stops: {len(stops_metadata)}")
    print(f"Graph Nodes: {len(transit_graph)}")

if __name__ == "__main__":
    main()