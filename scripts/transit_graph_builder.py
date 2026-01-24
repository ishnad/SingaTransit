import requests
import json
import os
import math
import re
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
API_KEY = os.getenv('LTA_DATAMALL_API_KEY')
BASE_URL = 'https://datamall2.mytransport.sg/ltaodataservice'
OUTPUT_DIR = './public/data'

# --- PHYSICS CONSTANTS ---
AVG_BUS_SPEED_KMH = 25
MRT_SPEED_KMH = 60
LRT_SPEED_KMH = 40
WALK_SPEED_KMH = 5
SECONDS_PER_HOUR = 3600
MAX_WALK_RADIUS_KM = 0.4 # Max transfer distance (400m)

headers = {
    'AccountKey': API_KEY,
    'accept': 'application/json'
}

def fetch_lta_data(endpoint):
    """Fetches data from LTA API with pagination."""
    data_buffer = []
    skip = 0
    print(f"Fetching {endpoint}...")
    while True:
        url = f"{BASE_URL}/{endpoint}?$skip={skip}"
        try:
            response = requests.get(url, headers=headers)
            if response.status_code != 200:
                print(f"Error {response.status_code}: {response.text}")
                break
            
            results = response.json().get('value', [])
            if not results: break
            
            data_buffer.extend(results)
            skip += 500
        except Exception as e:
            print(f"Request failed: {e}")
            break
            
    print(f"Fetched {len(data_buffer)} records for {endpoint}")
    return data_buffer

def load_local_json(filename):
    """Loads local JSON files (MRT/LRT data)."""
    path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(path):
        print(f"Warning: {path} not found. Skipping.")
        return []
    with open(path, 'r') as f:
        return json.load(f)

# --- GEOSPATIAL HELPERS ---

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) * math.sin(dlat / 2) + \
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
        math.sin(dlon / 2) * math.sin(dlon / 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def calculate_time_weight(distance_km, speed_kmh):
    if distance_km <= 0: return 15
    return (distance_km / speed_kmh) * SECONDS_PER_HOUR

def get_grid_key(lat, lng, grid_size=0.005):
    return (math.floor(lat / grid_size), math.floor(lng / grid_size))

# --- GRAPH BUILDERS ---

def add_edge(graph, u, v, service, direction, dist, weight):
    if u not in graph: graph[u] = {}
    if v not in graph[u]: graph[u][v] = []
    
    graph[u][v].append({
        'service': service,
        'direction': direction,
        'distance': dist,
        'weight': int(weight)
    })

def build_bus_graph(routes_data, graph):
    print("Building Bus Layer...")
    sorted_routes = sorted(routes_data, key=lambda x: (x['ServiceNo'], x['Direction'], x['StopSequence']))

    for i in range(len(sorted_routes) - 1):
        curr = sorted_routes[i]
        nxt = sorted_routes[i+1]

        if (curr['ServiceNo'] == nxt['ServiceNo'] and 
            curr['Direction'] == nxt['Direction'] and
            nxt['StopSequence'] == curr['StopSequence'] + 1):

            dist = max(0, float(nxt.get('Distance') or 0) - float(curr.get('Distance') or 0))
            weight = calculate_time_weight(dist, AVG_BUS_SPEED_KMH)
            
            add_edge(graph, curr['BusStopCode'], nxt['BusStopCode'], 
                     curr['ServiceNo'], curr['Direction'], dist, weight)

def build_rail_graph(stations_data, graph, metadata, speed_kmh, mode_type):
    print(f"Building {mode_type} Layer...")
    
    lines = {}
    for stn in stations_data:
        line = stn.get('line', 'UNKNOWN')
        if line not in lines: lines[line] = []
        lines[line].append(stn)
        
        # Add to metadata with TYPE
        metadata[stn['code']] = {
            'lat': float(stn['lat']),
            'lng': float(stn['lng']),
            'name': stn['name'] + f" {mode_type}", # Append type for clarity in search
            'road': f"{line} Line",
            'type': mode_type # Tag for UI icons
        }

    for line_name, stations in lines.items():
        def get_sort_key(s):
            match = re.search(r'\d+', s['code'])
            return int(match.group()) if match else 0
            
        stations.sort(key=get_sort_key)
        
        for i in range(len(stations) - 1):
            u, v = stations[i], stations[i+1]
            dist = haversine_distance(u['lat'], u['lng'], v['lat'], v['lng'])
            weight = calculate_time_weight(dist, speed_kmh)
            
            add_edge(graph, u['code'], v['code'], line_name, 1, dist, weight)
            add_edge(graph, v['code'], u['code'], line_name, 2, dist, weight)

def generate_walking_edges(metadata, graph):
    print("Generating Walking & Transfer Edges...")
    grid = {}
    grid_size = 0.005 
    
    for code, data in metadata.items():
        key = get_grid_key(data['lat'], data['lng'], grid_size)
        if key not in grid: grid[key] = []
        grid[key].append(code)

    count = 0
    for code, data in metadata.items():
        lat, lng = data['lat'], data['lng']
        center_key = get_grid_key(lat, lng, grid_size)
        
        candidates = []
        for x in [-1, 0, 1]:
            for y in [-1, 0, 1]:
                k = (center_key[0] + x, center_key[1] + y)
                if k in grid: candidates.extend(grid[k])
        
        for target in candidates:
            if code == target: continue
            
            t_data = metadata[target]
            dist = haversine_distance(lat, lng, t_data['lat'], t_data['lng'])
            
            if dist <= MAX_WALK_RADIUS_KM:
                weight = calculate_time_weight(dist, WALK_SPEED_KMH)
                add_edge(graph, code, target, 'WALK', 0, dist, weight)
                count += 1
                
    print(f"Generated {count} walking connections.")

def main():
    if not os.path.exists(OUTPUT_DIR): os.makedirs(OUTPUT_DIR)
    
    stops_raw = fetch_lta_data('BusStops')
    routes_raw = fetch_lta_data('BusRoutes')
    mrt_raw = load_local_json('mrt_stations.json')
    lrt_raw = load_local_json('lrt_stations.json')
    
    if not stops_raw or not routes_raw:
        print("Critical: Missing bus data.")
        return

    graph = {}
    metadata = {}
    
    # Process Bus Metadata
    for stop in stops_raw:
        metadata[stop['BusStopCode']] = {
            'lat': float(stop['Latitude']),
            'lng': float(stop['Longitude']),
            'name': stop['Description'],
            'road': stop['RoadName'],
            'type': 'BUS'
        }

    build_bus_graph(routes_raw, graph)
    build_rail_graph(mrt_raw, graph, metadata, MRT_SPEED_KMH, 'MRT')
    build_rail_graph(lrt_raw, graph, metadata, LRT_SPEED_KMH, 'LRT')
    generate_walking_edges(metadata, graph)

    print("Saving files...")
    with open(f'{OUTPUT_DIR}/stops_metadata.json', 'w') as f:
        json.dump(metadata, f)
    with open(f'{OUTPUT_DIR}/transit_graph.json', 'w') as f:
        json.dump(graph, f)

    print(f"Done. Nodes: {len(graph)}. Metadata: {len(metadata)}")

if __name__ == "__main__":
    main()