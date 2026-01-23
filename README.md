# SingaTransit

SingaTransit is a client-side public transport routing application for Singapore. It utilizes a custom implementation of Dijkstra's algorithm running in a Web Worker to calculate paths between bus stops. The application integrates real-time bus arrival data from the LTA DataMall API.

## Features

* **Graph-Based Routing:** Calculates shortest paths using a weighted graph of over 5,000 bus stops and services.
* **Performance:** Routing calculations are offloaded to a Web Worker to ensure the main interface remains responsive (average calculation time: ~7ms).
* **Real-Time Arrivals:** Fetches live bus timings from LTA DataMall V3.
* **Simulation Fallback:** Automatically generates simulated data during off-peak hours (00:00 - 05:30) when real-time services are unavailable.
* **Offline Capability:** configured as a Progressive Web App (PWA) to cache map assets and graph data.
* **Personalization:** Users can save frequently used locations to local storage.
* **Responsive Design:** Fully adaptive interface supporting desktop and mobile (bottom-sheet layout) views.

## Architecture

* **Frontend Framework:** React (TypeScript)
* **Build Tool:** Vite
* **Maps:** React Leaflet / OneMap (SLA)
* **State Management:** React Hooks & LocalStorage
* **Data Source:** LTA DataMall (Static datasets converted to JSON graph)

## Installation and Setup

### Prerequisites

* Node.js (Version 18 or higher)
* LTA DataMall API Key

### Steps

1.  Clone the repository:
    ```bash
    git clone [https://github.com/yourusername/singatransit.git](https://github.com/yourusername/singatransit.git)
    cd singatransit
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Configure Environment Variables:
    Create a file named `.env` in the root directory and add your LTA API key:
    ```
    LTA_DATAMALL_API_KEY=your_api_key_here
    ```

4.  Run the development server:
    ```bash
    npm run dev
    ```

5.  Open your browser and navigate to `http://localhost:5173`.

## Deployment

### Vercel (Recommended)

This project is configured for Vercel deployment using `vercel.json` rewrites to handle API proxying.

1.  Push the code to a GitHub repository.
2.  Import the repository into Vercel.
3.  Add the `LTA_DATAMALL_API_KEY` in the Project Settings > Environment Variables.
4.  Deploy.

### Graph Data Maintenance

The routing graph is generated from static LTA datasets. To update the graph:

1.  Download the latest "Bus Stops", "Bus Services", and "Bus Routes" datasets from LTA DataMall.
2.  Place the raw files in the `scripts/data` directory.
3.  Run the builder script:
    ```bash
    python scripts/transit_graph_builder.py
    ```
4.  The script will output `transit_graph.json` and `stops_metadata.json` to the `public/data` directory.

## License

This project is open source. Data provided by Land Transport Authority (LTA) via DataMall. Maps provided by OneMap.