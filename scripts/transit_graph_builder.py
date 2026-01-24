import requests
import json
import os
import math
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv('LTA_DATAMALL_API_KEY')
BASE_URL = 'https://datamall2.mytransport.sg/ltaodataservice'
OUTPUT_DIR = './public/data'

if not API_KEY:
    raise ValueError("Error: LTA_DATAMALL_API_KEY not found in environment variables.")

# Constants
AVG_BUS_SPEED_KMH = 25
AVG_MRT_SPEED_KMH = 60
AVG_LRT_SPEED_KMH = 35 # LRT is slower than MRT
MAX_TRANSFER_DIST_KM = 0.3
SECONDS_PER_HOUR = 3600

headers = { 'AccountKey': API_KEY, 'accept': 'application/json' }

def fetch_lta_data(endpoint):
    data_buffer = []
    skip = 0
    while True:
        url = f"{BASE_URL}/{endpoint}?$skip={skip}"
        print(f"Fetching {endpoint} with skip {skip}...")
        try:
            response = requests.get(url, headers=headers)
            results = response.json().get('value', [])
            if not results: break
            data_buffer.extend(results)
            skip += 500
        except Exception as e:
            print(f"Error: {e}")
            break
    return data_buffer

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def process_rail_data(graph, stations, speed_kmh, type_label):
    """
    Generic function to link rail stations (MRT or LRT) based on line codes.
    """
    lines = {}
    for stn in stations:
        # Extract prefix (e.g., "NS" from "NS1", "SW" from "SW1")
        # Special handling for "STC" or "PTC" (Sengkang/Punggol Town Centres)
        code = stn['code']
        if code in ['STC', 'PTC']:
            # These are hubs, they connect to multiple loops. 
            # For simplicity in this graph builder, we treat them as nodes that 
            # adjacent stations (SE1, SW1, PE1, PW1) will link to if we handle logic manually,
            # OR we just let the distance-based transfer logic handle the hub connections 
            # if the codes don't sequence perfectly.
            # However, usually STC connects to SE1 and SW1.
            pass
        
        # Heuristic: First 2 chars for most, 3 for hubs if needed, but 
        # for standard logic let's try to group by strictly alpha prefix
        prefix = "".join([c for c in code if c.isalpha()])
        number = "".join([c for c in code if c.isdigit()])
        
        if prefix and number:
            idx = int(number)
            if prefix not in lines: lines[prefix] = []
            lines[prefix].append({ 'idx': idx, 'data': stn })

    for line_code, station_list in lines.items():
        station_list.sort(key=lambda x: x['idx'])
        for i in range(len(station_list) - 1):
            s1 = station_list[i]['data']
            s2 = station_list[i+1]['data']
            
            dist = haversine_distance(s1['lat'], s1['lng'], s2['lat'], s2['lng'])
            weight = int((dist / speed_kmh) * SECONDS_PER_HOUR)
            
            # Bi-directional edge
            for a, b in [(s1, s2), (s2, s1)]:
                if a['code'] not in graph: graph[a['code']] = {}
                if b['code'] not in graph[a['code']]: graph[a['code']][b['code']] = []
                
                graph[a['code']][b['code']].append({
                    'type': type_label,
                    'service': line_code,
                    'distance': dist,
                    'weight': weight
                })

def build_graph(bus_routes, mrt_stations, lrt_stations, stops_metadata):
    graph = {}
    
    # 1. Bus Routes
    print("Processing Bus Routes...")
    sorted_routes = sorted(bus_routes, key=lambda x: (x['ServiceNo'], x['Direction'], x['StopSequence']))
    for i in range(len(sorted_routes) - 1):
        curr, nxt = sorted_routes[i], sorted_routes[i+1]
        if (curr['ServiceNo'] == nxt['ServiceNo'] and 
            curr['Direction'] == nxt['Direction'] and 
            nxt['StopSequence'] == curr['StopSequence'] + 1):
            
            src, tgt = curr['BusStopCode'], nxt['BusStopCode']
            dist = max(0, float(nxt.get('Distance') or 0) - float(curr.get('Distance') or 0))
            weight = int((dist / AVG_BUS_SPEED_KMH) * SECONDS_PER_HOUR)
            
            if src not in graph: graph[src] = {}
            if tgt not in graph[src]: graph[src][tgt] = []
            graph[src][tgt].append({
                'type': 'BUS', 'service': curr['ServiceNo'], 'distance': dist, 'weight': weight
            })

    # 2. MRT Routes
    print("Processing MRT Routes...")
    process_rail_data(graph, mrt_stations, AVG_MRT_SPEED_KMH, 'MRT')

    # 3. LRT Routes
    print("Processing LRT Routes...")
    process_rail_data(graph, lrt_stations, AVG_LRT_SPEED_KMH, 'LRT')

    # 4. Transfers (Bus <-> MRT <-> LRT)
    print("Linking Intermodal Transfers...")
    all_rail_stations = mrt_stations + lrt_stations
    
    # We check distance between EVERY bus stop and EVERY rail station
    # This is O(N*M), can be slow. Optimized by simple check.
    for stop_code, stop_data in stops_metadata.items():
        # Only check bus stops against rail (Rail-Rail transfers are usually implicit by shared station codes or short walks)
        # But here we treat them as separate nodes unless they share a code.
        # Note: LTA bus stops have numeric codes. MRT/LRT have alphanumeric. They are separate nodes.
        
        for rail in all_rail_stations:
            dist = haversine_distance(stop_data['lat'], stop_data['lng'], rail['lat'], rail['lng'])
            if dist <= MAX_TRANSFER_DIST_KM:
                walk_time = int((dist / 5.0) * SECONDS_PER_HOUR)
                
                # Bi-directional Transfer
                for a_id, b_id in [(stop_code, rail['code']), (rail['code'], stop_code)]:
                    if a_id not in graph: graph[a_id] = {}
                    if b_id not in graph[a_id]: graph[a_id][b_id] = []
                    
                    graph[a_id][b_id].append({
                        'type': 'WALK',
                        'service': 'Transfer',
                        'distance': dist,
                        'weight': walk_time
                    })

    return graph

def main():
    if not os.path.exists(OUTPUT_DIR): os.makedirs(OUTPUT_DIR)
    
    # Load Static Data
    try:
        with open(f'{OUTPUT_DIR}/mrt_stations.json', 'r') as f: mrt_stations = json.load(f)
        with open(f'{OUTPUT_DIR}/lrt_stations.json', 'r') as f: lrt_stations = json.load(f)
    except FileNotFoundError as e:
        print(f"Error loading static JSON files: {e}")
        return

    stops_raw = fetch_lta_data('BusStops')
    routes_raw = fetch_lta_data('BusRoutes')

    stops_metadata = {}
    for stop in stops_raw:
        stops_metadata[stop['BusStopCode']] = {
            'lat': float(stop['Latitude']),
            'lng': float(stop['Longitude']),
            'name': stop['Description'],
            'road': stop['RoadName']
        }
    
    # Merge Rail Metadata
    for stn in mrt_stations + lrt_stations:
        stops_metadata[stn['code']] = {
            'lat': stn['lat'],
            'lng': stn['lng'],
            'name': stn['name'],
            'road': stn['line']
        }

    transit_graph = build_graph(routes_raw, mrt_stations, lrt_stations, stops_metadata)

    with open(f'{OUTPUT_DIR}/stops_metadata.json', 'w') as f: json.dump(stops_metadata, f)
    with open(f'{OUTPUT_DIR}/transit_graph.json', 'w') as f: json.dump(transit_graph, f)
    
    print("Done!")

if __name__ == "__main__":
    main()