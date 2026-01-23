import json

try:
    with open('./public/data/transit_graph.json', 'r') as f:
        graph = json.load(f)
        
    print(f"Total Nodes: {len(graph)}")
    
    # Get first node
    first_node = list(graph.keys())[0]
    print(f"Sample Node ({first_node}):")
    print(json.dumps(graph[first_node], indent=2))
    
    print("STATUS: GRAPH VALID")
except Exception as e:
    print(f"STATUS: FAILED - {e}")