// ۱. تعریف لایه‌های نقشه متعدده (Base Layers)
const baseMaps = {
    "Google Satellite": L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: 'Google Maps'
    }),
    "Google Streets": L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: 'Google Maps'
    }),
    "CartoDB Dark (پیش‌فرض)": L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: 'CARTO', subdomains: 'abcd', maxZoom: 19
    }),
    "Esri World Imagery": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri'
    }),
    "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: 'OpenStreetMap'
    }),
    "Yandex Maps": L.tileLayer('https://core-renderer-tiles.maps.yandex.net/tiles?l=map&v=21.06.18-0&x={x}&y={y}&z={z}&scale=1&lang=en_US', {
        attribution: 'Yandex'
    })
};

// راه اندازی نقشه
const map = L.map('map', {
    center: [32.4279, 53.6880],
    zoom: 5,
    layers: [baseMaps["CartoDB Dark (پیش‌فرض)"]]
});

// کنترل انتخاب لایه‌های نقشه
L.control.layers(baseMaps).addTo(map);

// متغیرهای عمومی
const aircraftMarkers = {};
const flightTrails = {}; // تاریخچه مسیر پروازی
let allFlightsData = [];
let updateTimer = null;
let selectedHex = null;

// آیکون هواپیما
function createPlaneIcon(heading, isSelected = false) {
    const angle = heading || 0;
    const color = isSelected ? '#f59e0b' : '#38bdf8'; // تغییر رنگ هواپیمای انتخاب شده
    const size = isSelected ? '26px' : '20px';
    return L.divIcon({
        html: `<i class="fa-solid fa-plane" style="transform: rotate(${angle - 45}deg); color: ${color}; font-size: ${size}; filter: drop-shadow(0 0 4px rgba(0,0,0,0.8)); transition: all 0.3s;"></i>`,
        className: 'custom-plane-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
}

// خواندن داده‌ها از فایل JSON محلی
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
        console.error('Error loading JSON:', error);
    }
}

// رندر مارکرها و مسیرهای پروازی روی نقشه
function renderFlights(flights) {
    const currentActiveHexes = new Set();
    const searchKeyword = document.getElementById('search-input').value.toLowerCase();

    let visibleCount = 0;

    flights.forEach(aircraft => {
        const hex = aircraft.hex;
        const flight = aircraft.flight;
        const lat = aircraft.lat;
        const lon = aircraft.lon;
        const track = aircraft.track;

        // فیلتر جستجو
        const matchesSearch = flight.toLowerCase().includes(searchKeyword) || 
                              hex.toLowerCase().includes(searchKeyword) || 
                              aircraft.type.toLowerCase().includes(searchKeyword);

        if (lat && lon && matchesSearch) {
            visibleCount++;
            currentActiveHexes.add(hex);

            // ذخیره تاریخچه مسیر پروازی (Trail)
            if (!flightTrails[hex]) flightTrails[hex] = [];
            flightTrails[hex].push([lat, lon]);
            if (flightTrails[hex].length > 20) flightTrails[hex].shift(); // نگه داشتن ۲۰ نقطه اخیر

            const popupContent = `
                <div style="direction: rtl; font-family: Tahoma; line-height: 1.6;">
                    <h4 style="margin: 0 0 5px 0; color: #0284c7;">پرواز: ${flight}</h4>
                    <b>نوع تایپ:</b> ${aircraft.type}<br>
                    <b>ارتفاع:</b> ${Math.round(aircraft.alt_feet * 0.3048)} متر (${aircraft.alt_feet} ft)<br>
                    <b>سرعت:</b> ${aircraft.speed} km/h<br>
                    <b>کد Squawk:</b> ${aircraft.squawk}<br>
                    <b>شناسه Hex:</b> <code>${hex.toUpperCase()}</code>
                </div>
            `;

            if (aircraftMarkers[hex]) {
                aircraftMarkers[hex].marker.setLatLng([lat, lon]);
                aircraftMarkers[hex].marker.setIcon(createPlaneIcon(track, hex === selectedHex));
                aircraftMarkers[hex].marker.getPopup().setContent(popupContent);
                
                // بروزرسانی خط مسیر اگر انتخاب شده باشد
                if (aircraftMarkers[hex].polyline) {
                    aircraftMarkers[hex].polyline.setLatLngs(flightTrails[hex]);
                }
            } else {
                const marker = L.marker([lat, lon], {
                    icon: createPlaneIcon(track, hex === selectedHex)
                }).bindPopup(popupContent);

                // رسم خط مسیر (Polyline)
                const polyline = L.polyline(flightTrails[hex], {
                    color: '#f59e0b',
                    weight: 2,
                    opacity: 0.7,
                    dashArray: '4, 4'
                });

                marker.on('click', () => selectAircraft(hex, lat, lon));

                marker.addTo(map);
                aircraftMarkers[hex] = { marker, polyline };
            }
        }
    });

    document.getElementById('visible-count').innerText = visibleCount.toLocaleString('fa-IR');

    // پاکسازی پروازهای خارج شده
    Object.keys(aircraftMarkers).forEach(hex => {
        if (!currentActiveHexes.has(hex)) {
            map.removeLayer(aircraftMarkers[hex].marker);
            if (aircraftMarkers[hex].polyline) map.removeLayer(aircraftMarkers[hex].polyline);
            delete aircraftMarkers[hex];
        }
    });
}

// انتخاب پرواز و رسم مسیر اختصاصی
function selectAircraft(hex, lat, lon) {
    selectedHex = hex;
    map.flyTo([lat, lon], 8, { duration: 1.5 });
    
    // فعال‌سازی خط مسیر روی نقشه
    Object.keys(aircraftMarkers).forEach(h => {
        if (h === hex) {
            aircraftMarkers[h].polyline.addTo(map);
            aircraftMarkers[h].marker.setIcon(createPlaneIcon(allFlightsData.find(a=>a.hex===hex)?.track, true));
        } else {
            if (map.hasLayer(aircraftMarkers[h].polyline)) {
                map.removeLayer(aircraftMarkers[h].polyline);
            }
        }
    });
}

// بروزرسانی جدول مشخصات
function updateTable(flights) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    flights.slice(0, 100).forEach(ac => { // نمایش ۱۰۰ پرواز اول جهت عملکرد روان
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${ac.flight}</b></td>
            <td>${ac.type}</td>
            <td><code>${ac.hex.toUpperCase()}</code></td>
            <td>${Math.round(ac.alt_feet * 0.3048)}</td>
            <td>${ac.speed}</td>
            <td>${ac.squawk}</td>
            <td><button onclick="selectAircraft('${ac.hex}', ${ac.lat}, ${ac.lon})" style="background:#0284c7; color:#fff; border:none; padding:3px 8px; border-radius:4px; cursor:pointer;">تمرکز</button></td>
        `;
        tbody.appendChild(tr);
    });
}

// فیلتر لحظه‌ای جستجو
function filterFlights() {
    renderFlights(allFlightsData);
}

// تنظیم بازه زمانی بروزرسانی
function updateInterval() {
    const seconds = parseInt(document.getElementById('refresh-rate').value) || 5;
    clearInterval(updateTimer);
    updateTimer = setInterval(fetchLocalFlightData, seconds * 1000);
}

// نمایش/مخفی‌سازی جدول
function toggleTable() {
    document.getElementById('table-container').classList.toggle('table-hidden');
}

// پاکسازی تمام مسیرها
function clearTrails() {
    Object.keys(flightTrails).forEach(k => flightTrails[k] = []);
    Object.keys(aircraftMarkers).forEach(h => {
        if (aircraftMarkers[h].polyline) aircraftMarkers[h].polyline.setLatLngs([]);
    });
}

// شروع برنامه
fetchLocalFlightData();
updateInterval();
