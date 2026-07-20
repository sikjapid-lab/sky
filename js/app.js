// ۱. لایه‌های متعدد نقشه
const baseMaps = {
    "Google Satellite": L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: 'Google'
    }),
    "Google Hybrid": L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: 'Google'
    }),
    "CartoDB Dark": L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: 'CARTO', subdomains: 'abcd', maxZoom: 19
    }),
    "Esri Imagery": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri'
    }),
    "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: 'OSM'
    })
};

// ساخت نقشه
const map = L.map('map', {
    center: [32.4279, 53.6880],
    zoom: 5,
    layers: [baseMaps["CartoDB Dark"]],
    zoomControl: false // انتقال کنترل زوم در صورت نیاز
});

// افزودن کنترل لایه‌ها (به سمت چپ بالا منتقل شده در CSS)
L.control.layers(baseMaps, null, { position: 'topleft' }).addTo(map);
L.control.zoom({ position: 'bottomleft' }).addTo(map);

// محاسبه رنگ بر اساس ارتفاع پرواز (مشابه ADSBExchange)
function getAltitudeColor(alt) {
    if (alt <= 0) return '#22c55e';       // روی زمین (سبز)
    if (alt < 10000) return '#84cc16';   // ارتفاع پایین (سبز کم‌رنگ)
    if (alt < 20000) return '#eab308';   // ارتفاع متوسط (زرد)
    if (alt < 30000) return '#f97316';   // ارتفاع بالا (نارنجی)
    if (alt < 40000) return '#a855f7';   // کروز (بنفش)
    return '#ec4899';                    // ارتفاع خیلی بالا (صورتی)
}

// متغیرهای سیستم
const aircraftMarkers = {};
const flightTrails = {};
let allFlightsData = [];
let updateTimer = null;
let selectedHex = null;

// آیکون هواپیما با جهت و رنگ اختصاصی ارتفاع
function createPlaneIcon(heading, altFeet, isSelected = false) {
    const angle = heading || 0;
    const color = isSelected ? '#38bdf8' : getAltitudeColor(altFeet);
    const size = isSelected ? '24px' : '18px';
    const borderWidth = isSelected ? 'filter: drop-shadow(0 0 6px #38bdf8);' : 'filter: drop-shadow(0 0 2px rgba(0,0,0,0.9));';

    return L.divIcon({
        html: `<i class="fa-solid fa-plane" style="transform: rotate(${angle - 45}deg); color: ${color}; font-size: ${size}; ${borderWidth} transition: all 0.2s;"></i>`,
        className: 'custom-plane-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
}

// دریافت داده‌ها از JSON
async function fetchLocalFlightData() {
    try {
        const response = await fetch('./data/flights.json?t=' + new Date().getTime());
        if (!response.ok) return;

        const data = await response.json();
        allFlightsData = data.flights || [];

        document.getElementById('flight-count').innerText = allFlightsData.length.toLocaleString('fa-IR');

        renderFlights(allFlightsData);
        updateTable(allFlightsData);

    } catch (error) {
        console.error('Error:', error);
    }
}

// رندر پروازها
function renderFlights(flights) {
    const currentActiveHexes = new Set();
    const searchKeyword = document.getElementById('search-input').value.toLowerCase();
    let visibleCount = 0;

    flights.forEach(ac => {
        const hex = ac.hex;
        const flight = ac.flight;
        const lat = ac.lat;
        const lon = ac.lon;
        const track = ac.track;
        const alt = ac.alt_feet;

        const matchesSearch = flight.toLowerCase().includes(searchKeyword) || 
                              hex.toLowerCase().includes(searchKeyword) || 
                              ac.r.toLowerCase().includes(searchKeyword) ||
                              ac.type.toLowerCase().includes(searchKeyword);

        if (lat && lon && matchesSearch) {
            visibleCount++;
            currentActiveHexes.add(hex);

            // ذخیره مسیر
            if (!flightTrails[hex]) flightTrails[hex] = [];
            flightTrails[hex].push([lat, lon]);
            if (flightTrails[hex].length > 25) flightTrails[hex].shift();

            const popupContent = `
                <div style="direction: rtl; font-family: Tahoma; font-size: 0.85rem; line-height: 1.6;">
                    <h4 style="margin: 0 0 4px 0; color: #0284c7;">پرواز: ${flight}</h4>
                    <b>شناسه Reg:</b> ${ac.r}<br>
                    <b>تایپ هواپیما:</b> ${ac.type}<br>
                    <b>ارتفاع:</b> ${alt.toLocaleString()} ft (${Math.round(alt * 0.3048)} m)<br>
                    <b>سرعت زمینی:</b> ${ac.speed} km/h<br>
                    <b>سرعت عمودی:</b> ${ac.vspeed} ft/min<br>
                    <b>Squawk:</b> ${ac.squawk}<br>
                    <b>کد Hex:</b> <code>${hex}</code>
                </div>
            `;

            if (aircraftMarkers[hex]) {
                aircraftMarkers[hex].marker.setLatLng([lat, lon]);
                aircraftMarkers[hex].marker.setIcon(createPlaneIcon(track, alt, hex === selectedHex));
                aircraftMarkers[hex].marker.getPopup().setContent(popupContent);
                
                if (aircraftMarkers[hex].polyline) {
                    aircraftMarkers[hex].polyline.setLatLngs(flightTrails[hex]);
                }
            } else {
                const marker = L.marker([lat, lon], {
                    icon: createPlaneIcon(track, alt, hex === selectedHex)
                }).bindPopup(popupContent);

                const polyline = L.polyline(flightTrails[hex], {
                    color: getAltitudeColor(alt),
                    weight: 2,
                    opacity: 0.8,
                    dashArray: '3, 4'
                });

                marker.on('click', () => selectAircraft(hex, lat, lon));

                marker.addTo(map);
                aircraftMarkers[hex] = { marker, polyline };
            }
        }
    });

    document.getElementById('visible-count').innerText = visibleCount.toLocaleString('fa-IR');

    // پاکسازی موارد خارج شده
    Object.keys(aircraftMarkers).forEach(hex => {
        if (!currentActiveHexes.has(hex)) {
            map.removeLayer(aircraftMarkers[hex].marker);
            if (aircraftMarkers[hex].polyline) map.removeLayer(aircraftMarkers[hex].polyline);
            delete aircraftMarkers[hex];
        }
    });
}

// انتخاب پرواز
function selectAircraft(hex, lat, lon) {
    selectedHex = hex;
    map.flyTo([lat, lon], 8, { duration: 1.2 });
    
    Object.keys(aircraftMarkers).forEach(h => {
        if (h === hex) {
            aircraftMarkers[h].polyline.addTo(map);
            const ac = allFlightsData.find(a => a.hex === hex);
            if (ac) aircraftMarkers[h].marker.setIcon(createPlaneIcon(ac.track, ac.alt_feet, true));
        } else {
            if (map.hasLayer(aircraftMarkers[h].polyline)) {
                map.removeLayer(aircraftMarkers[h].polyline);
            }
        }
    });
}

// نمایش مختصات و خصوصیات زنده در نوار پایینی
map.on('mousemove', function (e) {
    const lat = e.latlng.lat.toFixed(5);
    const lng = e.latlng.lng.toFixed(5);
    document.getElementById('mouse-position').innerHTML = `<i class="fa-solid fa-location-crosshairs"></i> مختصات: Lat: ${lat}, Lon: ${lng}`;
});

map.on('zoomend', function () {
    document.getElementById('map-zoom').innerHTML = `<i class="fa-solid fa-magnifying-glass-plus"></i> زوم: ${map.getZoom()}`;
});

// بروزرسانی جدول
function updateTable(flights) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    flights.slice(0, 80).forEach(ac => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${ac.flight}</b></td>
            <td>${ac.r}</td>
            <td>${ac.type}</td>
            <td><code>${ac.hex}</code></td>
            <td><span style="color:${getAltitudeColor(ac.alt_feet)}">${ac.alt_feet.toLocaleString()}</span></td>
            <td>${ac.speed}</td>
            <td>${ac.squawk}</td>
            <td><button onclick="selectAircraft('${ac.hex}', ${ac.lat}, ${ac.lon})" style="background:#0284c7; color:#fff; border:none; padding:2px 6px; border-radius:4px; cursor:pointer;">تمرکز</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function filterFlights() { renderFlights(allFlightsData); }
function updateInterval() {
    const seconds = parseInt(document.getElementById('refresh-rate').value) || 5;
    clearInterval(updateTimer);
    updateTimer = setInterval(fetchLocalFlightData, seconds * 1000);
}
function toggleTable() { document.getElementById('table-container').classList.toggle('table-hidden'); }
function clearTrails() {
    Object.keys(flightTrails).forEach(k => flightTrails[k] = []);
    Object.keys(aircraftMarkers).forEach(h => {
        if (aircraftMarkers[h].polyline) aircraftMarkers[h].polyline.setLatLngs([]);
    });
}

// شروع
fetchLocalFlightData();
updateInterval();
