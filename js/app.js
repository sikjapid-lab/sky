// ==========================================
// ۱. گسترش لایه‌های نقشه پایه (Extended Base Layers)
// ==========================================
const baseMaps = {
    "Google Satellite": L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: 'Google' }),
    "Google Hybrid": L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: 'Google' }),
    "Google Terrain": L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: 'Google' }),
    "CartoDB Dark": L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19, attribution: 'CARTO' }),
    "CartoDB Voyager": L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19, attribution: 'CARTO' }),
    "Esri World Imagery": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri' }),
    "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: 'OSM' })
};

// ۲. مقداردهی اولیه Leaflet (2D)
const map = L.map('map', {
    center: [30.0, 50.0],
    zoom: 5,
    layers: [baseMaps["Google Satellite"]],
    zoomControl: false
});

L.control.layers(baseMaps, null, { position: 'bottomleft' }).addTo(map);
L.control.zoom({ position: 'bottomleft' }).addTo(map);

// ==========================================
// ۳. مقداردهی اولیه Cesium (3D Globe)
// ==========================================
Cesium.Ion.defaultAccessToken = ''; // در صورت تمایل کلید Cesium Ion خود را ست کنید
let cesiumViewer = null;
let is3DMode = false;
let cesiumEntities = {};
let trackedCesiumEntity = null;

function initCesium() {
    if (cesiumViewer) return;
    
    cesiumViewer = new Cesium.Viewer('cesiumContainer', {
        terrainProvider: Cesium.createWorldTerrain(),
        animation: false,
        timeline: false,
        baseLayerPicker: true,
        fullscreenButton: false,
        geocoder: false,
        sceneModePicker: false
    });

    cesiumViewer.scene.globe.enableLighting = true;
}

// ==========================================
// ۴. منطق دریافت داده‌ها و مدیریت همزمانی ۲D / ۳D
// ==========================================
const aircraftMarkers = {};
const flightTrails = {};
let allFlightsData = [];
let mainPollingTimer = null;
let moveDebounceTimer = null;
let selectedHex = null;
let currentFetchController = null;
let lastFetchedKey = "";
let lastFetchTime = 0;
let currentFetchInterval = 4000;

function getAltitudeColor(alt) {
    if (alt <= 0) return '#22c55e';
    if (alt < 10000) return '#84cc16';
    if (alt < 20000) return '#eab308';
    if (alt < 30000) return '#f97316';
    if (alt < 40000) return '#a855f7';
    return '#ec4899';
}

function createPlaneIcon(heading, altFeet, isSelected = false) {
    const angle = heading || 0;
    const color = isSelected ? '#38bdf8' : getAltitudeColor(altFeet);
    const size = isSelected ? '22px' : '16px';
    const filterStyle = isSelected ? 'filter: drop-shadow(0 0 8px #38bdf8);' : 'filter: drop-shadow(0 0 2px rgba(0,0,0,0.9));';

    return L.divIcon({
        html: `<i class="fa-solid fa-plane" style="transform: rotate(${angle - 45}deg); color: ${color}; font-size: ${size}; ${filterStyle}"></i>`,
        className: 'custom-plane-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
}

async function fetchLiveGlobalFlights() {
    const center = map.getCenter();
    const lat = center.lat.toFixed(1);
    const lon = center.lng.toFixed(1);
    const currentKey = `${lat}_${lon}`;
    const now = Date.now();

    if (currentKey === lastFetchedKey && (now - lastFetchTime) < 3000) return;

    if (currentFetchController) currentFetchController.abort();
    currentFetchController = new AbortController();

    try {
        const apiUrl = `/api/flights?lat=${lat}&lon=${lon}&dist=1200`;
        const response = await fetch(apiUrl, { signal: currentFetchController.signal });

        if (!response.ok) return;

        const data = await response.json();
        const rawAircraft = data.ac || [];

        lastFetchedKey = currentKey;
        lastFetchTime = Date.now();

        allFlightsData = rawAircraft.map(ac => ({
            hex: String(ac.hex || '').toUpperCase(),
            flight: String(ac.flight || 'N/A').trim(),
            lat: ac.lat,
            lon: ac.lon,
            alt_feet: typeof ac.alt_baro === 'number' ? ac.alt_baro : 0,
            alt_meters: (typeof ac.alt_baro === 'number' ? ac.alt_baro : 0) * 0.3048,
            speed: Math.round((ac.gs || 0) * 1.852),
            track: ac.track || 0,
            type: String(ac.t || 'UNK').trim(),
            r: String(ac.r || 'N/A').trim()
        })).filter(ac => ac.lat && ac.lon);

        document.getElementById('flight-count').innerText = allFlightsData.length.toLocaleString('fa-IR');

        renderFlights2D(allFlightsData);
        if (is3DMode) renderFlights3D(allFlightsData);

    } catch (error) {
        if (error.name !== 'AbortError') console.error(error);
    }
}

// ==========================================
// ۵. رندر ۲D در Leaflet
// ==========================================
function renderFlights2D(flights) {
    const currentActiveHexes = new Set();
    const searchKeyword = document.getElementById('search-input').value.toLowerCase();
    let visibleCount = 0;

    flights.forEach(ac => {
        if (ac.flight.toLowerCase().includes(searchKeyword) || ac.hex.toLowerCase().includes(searchKeyword)) {
            visibleCount++;
            currentActiveHexes.add(ac.hex);

            if (!flightTrails[ac.hex]) flightTrails[ac.hex] = [];
            flightTrails[ac.hex].push([ac.lat, ac.lon]);
            if (flightTrails[ac.hex].length > 20) flightTrails[ac.hex].shift();

            if (aircraftMarkers[ac.hex]) {
                aircraftMarkers[ac.hex].marker.setLatLng([ac.lat, ac.lon]);
                aircraftMarkers[ac.hex].marker.setIcon(createPlaneIcon(ac.track, ac.alt_feet, ac.hex === selectedHex));
            } else {
                const marker = L.marker([ac.lat, ac.lon], { icon: createPlaneIcon(ac.track, ac.alt_feet, ac.hex === selectedHex) });
                marker.on('click', () => selectAircraft(ac.hex, ac.lat, ac.lon));
                marker.addTo(map);
                aircraftMarkers[ac.hex] = { marker };
            }
        }
    });

    document.getElementById('visible-count').innerText = visibleCount.toLocaleString('fa-IR');
}

// ==========================================
// ۶. رندر ۳D و شبیه‌سازی تعقیب پرواز در CesiumJS
// ==========================================
function renderFlights3D(flights) {
    if (!cesiumViewer) return;

    flights.forEach(ac => {
        const position = Cesium.Cartesian3.fromDegrees(ac.lon, ac.lat, ac.alt_meters);
        const heading = Cesium.Math.toRadians(ac.track);
        const orientation = Cesium.Transforms.headingPitchRollQuaternion(
            position,
            new Cesium.HeadingPitchRoll(heading, 0, 0)
        );

        if (cesiumEntities[ac.hex]) {
            cesiumEntities[ac.hex].position = position;
            cesiumEntities[ac.hex].orientation = orientation;
        } else {
            cesiumEntities[ac.hex] = cesiumViewer.entities.add({
                name: ac.flight,
                position: position,
                orientation: orientation,
                point: { pixelSize: 8, color: Cesium.Color.fromCssColorString(getAltitudeColor(ac.alt_feet)) },
                label: {
                    text: ac.flight,
                    font: '12px sans-serif',
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    outlineWidth: 2,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    pixelOffset: new Cesium.Cartesian2(0, -9)
                }
            });
        }
    });
}

function selectAircraft(hex, lat, lon) {
    selectedHex = hex;
    map.flyTo([lat, lon], 8);

    if (is3DMode && cesiumEntities[hex]) {
        trackedCesiumEntity = cesiumEntities[hex];
        cesiumViewer.trackedEntity = trackedCesiumEntity;
        document.getElementById('camera-controls').style.display = 'flex';
    }
}

// تغییر زوایای دوربین در مد ۳D
function setCameraView(mode) {
    if (!cesiumViewer || !trackedCesiumEntity) return;

    if (mode === 'chase') {
        cesiumViewer.trackedEntity = trackedCesiumEntity;
    } else if (mode === 'cockpit') {
        cesiumViewer.trackedEntity = undefined;
        // تنظیم زاویه دید چشم پرنده
        cesiumViewer.zoomTo(trackedCesiumEntity, new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-5), 50));
    } else if (mode === 'free') {
        cesiumViewer.trackedEntity = undefined;
    }
}

// سوئیچ بین حالت ۲D و ۳D
function toggle3DMode() {
    is3DMode = !is3DMode;
    const btn = document.getElementById('btn-toggle-3d');
    const cesiumDiv = document.getElementById('cesiumContainer');

    if (is3DMode) {
        initCesium();
        cesiumDiv.style.display = 'block';
        btn.innerHTML = `<i class="fa-solid fa-map"></i> حالت ۲D Map`;
        document.getElementById('camera-controls').style.display = selectedHex ? 'flex' : 'none';
        renderFlights3D(allFlightsData);
    } else {
        cesiumDiv.style.display = 'none';
        btn.innerHTML = `<i class="fa-solid fa-cube"></i> حالت ۳D Glob`;
        document.getElementById('camera-controls').style.display = 'none';
    }
}

function filterFlights() { renderFlights2D(allFlightsData); }
function clearTrails() { Object.keys(flightTrails).forEach(k => flightTrails[k] = []); }

function startSinglePollingLoop() {
    clearTimeout(mainPollingTimer);
    const loop = async () => {
        await fetchLiveGlobalFlights();
        mainPollingTimer = setTimeout(loop, currentFetchInterval);
    };
    loop();
}

startSinglePollingLoop();
