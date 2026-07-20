// ==========================================
// ۱. لایه‌های نقشه پایه دوبعدی (Leaflet)
// ==========================================
const baseMaps = {
    "Google Satellite": L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: 'Google' }),
    "Google Hybrid": L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: 'Google' }),
    "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: 'OSM' })
};

const map = L.map('map', {
    center: [30.0, 50.0],
    zoom: 5,
    layers: [baseMaps["Google Satellite"]],
    zoomControl: false
});

L.control.layers(baseMaps, null, { position: 'bottomleft' }).addTo(map);
L.control.zoom({ position: 'bottomleft' }).addTo(map);

// ==========================================
// ۲. مقداردهی و بارگذاری لایه معتبر کره سه‌بعدی (Cesium Globe)
// ==========================================
let cesiumViewer = null;
let cesiumEntities = {};
let isSyncing = false;

function initCesium() {
    if (cesiumViewer) return;

    // لایه کاشی‌های ماهواره‌ای استاندارد بدون نیاز به Token
    const esriProvider = new Cesium.UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maximumLevel: 18
    });

    cesiumViewer = new Cesium.Viewer('cesiumContainer', {
        imageryProvider: esriProvider,
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        sceneModePicker: false,
        infoBox: false,
        selectionIndicator: false
    });

    cesiumViewer.scene.globe.enableLighting = false; // خاموش کردن افکت شب جهت شفافیت همیشگی زمین

    // همگام‌سازی حرکت دوربین Cesium با Leaflet
    cesiumViewer.camera.percentageChanged = 0.01;
    cesiumViewer.camera.changed.addEventListener(sync2DFrom3D);
}

// ==========================================
// ۳. الگوریتم همگام‌سازی دوطرفه (Sync Engine)
// ==========================================
map.on('move', sync3DFrom2D);

function sync3DFrom2D() {
    if (!cesiumViewer || isSyncing) return;
    isSyncing = true;

    const center = map.getCenter();
    const zoom = map.getZoom();
    
    // تبدیل سطح زوم Leaflet به ارتفاع دوربین Cesium
    const altitude = 40000000 / Math.pow(2, zoom);

    cesiumViewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(center.lng, center.lat, altitude)
    });

    setTimeout(() => { isSyncing = false; }, 50);
}

function sync2DFrom3D() {
    if (!cesiumViewer || isSyncing) return;
    isSyncing = true;

    const cartographic = cesiumViewer.camera.positionCartographic;
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const lng = Cesium.Math.toDegrees(cartographic.longitude);
    const height = cartographic.height;

    // تبدیل ارتفاع Cesium به زوم Leaflet
    const zoom = Math.round(Math.log2(40000000 / height));

    map.setView([lat, lng], Math.min(Math.max(zoom, 2), 18), { animate: false });

    setTimeout(() => { isSyncing = false; }, 50);
}

// تغییر حالت‌های نمایش (دوبعدی / سه‌بعدی / دو پنله)
function setContainerMode(mode) {
    const container = document.getElementById('map-container');
    document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));

    container.className = '';

    if (mode === 'split') {
        container.classList.add('view-split');
        document.getElementById('btn-split').classList.add('active');
    } else if (mode === '2d') {
        container.classList.add('view-only-2d');
        document.getElementById('btn-2d').classList.add('active');
    } else if (mode === '3d') {
        container.classList.add('view-only-3d');
        document.getElementById('btn-3d').classList.add('active');
    }

    setTimeout(() => {
        map.invalidateSize();
        if (cesiumViewer) cesiumViewer.resize();
    }, 200);
}

// ==========================================
// ۴. دریافت و رندر داده‌های پرواز
// ==========================================
const aircraftMarkers = {};
let allFlightsData = [];
let mainPollingTimer = null;

function getAltitudeColor(alt) {
    if (alt <= 0) return '#22c55e';
    if (alt < 10000) return '#84cc16';
    if (alt < 20000) return '#eab308';
    if (alt < 30000) return '#f97316';
    return '#a855f7';
}

function createPlaneIcon(heading, altFeet) {
    const angle = heading || 0;
    const color = getAltitudeColor(altFeet);

    return L.divIcon({
        html: `<i class="fa-solid fa-plane" style="transform: rotate(${angle - 45}deg); color: ${color}; font-size: 16px; filter: drop-shadow(0 0 3px #000);"></i>`,
        className: 'custom-plane-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
}

async function fetchLiveGlobalFlights() {
    const center = map.getCenter();
    try {
        const apiUrl = `/api/flights?lat=${center.lat.toFixed(1)}&lon=${center.lng.toFixed(1)}&dist=1200`;
        const response = await fetch(apiUrl);
        if (!response.ok) return;

        const data = await response.json();
        const rawAircraft = data.ac || [];

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
        renderFlights3D(allFlightsData);
        updateTable(allFlightsData);

    } catch (error) {
        console.error(error);
    }
}

function renderFlights2D(flights) {
    const currentActiveHexes = new Set();
    const searchKeyword = document.getElementById('search-input').value.toLowerCase();
    let visibleCount = 0;

    flights.forEach(ac => {
        if (ac.flight.toLowerCase().includes(searchKeyword) || ac.hex.toLowerCase().includes(searchKeyword)) {
            visibleCount++;
            currentActiveHexes.add(ac.hex);

            const popupContent = `<b>پرواز: ${ac.flight}</b><br>ارتفاع: ${ac.alt_feet} ft<br>سرعت: ${ac.speed} km/h`;

            if (aircraftMarkers[ac.hex]) {
                aircraftMarkers[ac.hex].setLatLng([ac.lat, ac.lon]);
                aircraftMarkers[ac.hex].setIcon(createPlaneIcon(ac.track, ac.alt_feet));
            } else {
                const marker = L.marker([ac.lat, ac.lon], { icon: createPlaneIcon(ac.track, ac.alt_feet) }).bindPopup(popupContent);
                marker.addTo(map);
                aircraftMarkers[ac.hex] = marker;
            }
        }
    });

    document.getElementById('visible-count').innerText = visibleCount.toLocaleString('fa-IR');
}

function renderFlights3D(flights) {
    if (!cesiumViewer) return;

    flights.forEach(ac => {
        const position = Cesium.Cartesian3.fromDegrees(ac.lon, ac.lat, ac.alt_meters);
        const heading = Cesium.Math.toRadians(ac.track);
        const orientation = Cesium.Transforms.headingPitchRollQuaternion(position, new Cesium.HeadingPitchRoll(heading, 0, 0));

        if (cesiumEntities[ac.hex]) {
            cesiumEntities[ac.hex].position = position;
            cesiumEntities[ac.hex].orientation = orientation;
        } else {
            cesiumEntities[ac.hex] = cesiumViewer.entities.add({
                name: ac.flight,
                position: position,
                orientation: orientation,
                point: { pixelSize: 8, color: Cesium.Color.fromCssColorString(getAltitudeColor(ac.alt_feet)) },
                label: { text: ac.flight, font: '11px sans-serif', verticalOrigin: Cesium.VerticalOrigin.BOTTOM }
            });
        }
    });
}

function updateTable(flights) {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    flights.slice(0, 50).forEach(ac => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${ac.flight}</b></td>
            <td>${ac.r}</td>
            <td>${ac.type}</td>
            <td><code>${ac.hex}</code></td>
            <td>${ac.alt_feet.toLocaleString()}</td>
            <td>${ac.speed}</td>
            <td><button onclick="focusAircraft(${ac.lat}, ${ac.lon})" style="background:#0284c7; color:#fff; border:none; padding:2px 6px; border-radius:4px; cursor:pointer;">تمرکز</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function focusAircraft(lat, lon) {
    map.flyTo([lat, lon], 9);
}

function toggleTable() {
    document.getElementById('table-container').classList.toggle('table-hidden');
}

function filterFlights() { renderFlights2D(allFlightsData); }

// راه اندازی
initCesium();
fetchLiveGlobalFlights();
setInterval(fetchLiveGlobalFlights, 4000);
