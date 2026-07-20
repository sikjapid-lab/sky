// ==========================================
// مرکز پایش هوایی ADSB - اسکریپت فرانت‌اند
// ==========================================

// ۱. تنظیم لایه‌های نقشه پایه
const baseMaps = {
    "Google Satellite": L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { 
        maxZoom: 20, 
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], 
        attribution: 'Google' 
    }),
    "CartoDB Dark": L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { 
        attribution: 'CARTO', 
        subdomains: 'abcd', 
        maxZoom: 19 
    })
};

// ۲. مقداردهی اولیه نقشه Leaflet
const map = L.map('map', {
    center: [30.0, 50.0],
    zoom: 4,
    layers: [baseMaps["Google Satellite"]],
    zoomControl: false
});

L.control.layers(baseMaps, null, { position: 'topleft' }).addTo(map);
L.control.zoom({ position: 'bottomleft' }).addTo(map);

// ۳. محاسبه رنگ علامت و مسیر هواپیما بر اساس ارتفاع (پا)
function getAltitudeColor(alt) {
    if (alt <= 0) return '#22c55e';       // روی زمین / ارتفاع بسیار پایین (سبز)
    if (alt < 10000) return '#84cc16';   // ارتفاع پایین (زرد لیمویی)
    if (alt < 20000) return '#eab308';   // ارتفاع متوسط (زرد)
    if (alt < 30000) return '#f97316';   // ارتفاع بالا (نارنجی)
    if (alt < 40000) return '#a855f7';   // ارتفاع بسیار بالا (بنفش)
    return '#ec4899';                     // سقف ارتفاع (صورتی)
}

// ۴. متغیرهای ساختار داده و کنترل ترافیک
const aircraftMarkers = {};
const flightTrails = {};
let allFlightsData = [];

let mainPollingTimer = null;
let moveDebounceTimer = null;
let selectedHex = null;
let currentFetchController = null;
let lastFetchedKey = "";
let lastFetchTime = 0;

// نرخ به‌روزرسانی پیش‌فرض با توجه به داشتن کلید اختصاصی (۴ ثانیه)
let currentFetchInterval = 4000; 

// ۵. ساخت آیکون اختصاصی هواپیما با زاویه چرخش و رنگ ارتفاع
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

// ۶. تابع اصلی دریافت داده‌های زنده پروازها
async function fetchLiveGlobalFlights() {
    const center = map.getCenter();
    const lat = center.lat.toFixed(1); // گرد کردن مختصات جهت کش شدن در پروکسی
    const lon = center.lng.toFixed(1);
    const currentKey = `${lat}_${lon}`;
    const now = Date.now();

    // کش کلاینت: جلوگیری از ارسال درخواست تکراری اگر کمتر از ۳ ثانیه گذشته و جابه‌جایی رخ نداده باشد
    if (currentKey === lastFetchedKey && (now - lastFetchTime) < 3000) {
        return;
    }

    // لغو درخواست معلق قبلی در صورت وجود
    if (currentFetchController) {
        currentFetchController.abort();
    }
    currentFetchController = new AbortController();

    try {
        const apiUrl = `/api/flights?lat=${lat}&lon=${lon}&dist=3000`;
        const response = await fetch(apiUrl, { signal: currentFetchController.signal });

        if (response.status === 420 || response.status === 429) {
            console.warn('محدودیت موقت درخواست. افزایش فاصله به‌روزرسانی...');
            currentFetchInterval = 10000;
            return;
        }

        if (!response.ok) return;

        const data = await response.json();
        const rawAircraft = data.ac || [];

        // بازگرداندن زمان به‌روزرسانی به حالت ایده‌آل (۴ ثانیه)
        currentFetchInterval = 4000;
        lastFetchedKey = currentKey;
        lastFetchTime = Date.now();

        allFlightsData = rawAircraft.map(ac => ({
            hex: String(ac.hex || '').toUpperCase(),
            flight: String(ac.flight || 'N/A').trim(),
            lat: ac.lat,
            lon: ac.lon,
            alt_feet: typeof ac.alt_baro === 'number' ? ac.alt_baro : 0,
            speed: Math.round((ac.gs || 0) * 1.852), // تبدیل نات به کیلومتر بر ساعت
            vspeed: ac.baro_rate || 0,
            track: ac.track || 0,
            type: String(ac.t || 'UNK').trim(),
            squawk: String(ac.squawk || 'N/A').trim(),
            r: String(ac.r || 'N/A').trim()
        })).filter(ac => ac.lat && ac.lon);

        const flightCountEl = document.getElementById('flight-count');
        if (flightCountEl) flightCountEl.innerText = allFlightsData.length.toLocaleString('fa-IR');

        renderFlights(allFlightsData);
        updateTable(allFlightsData);

    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('خطا در دریافت داده‌های زنده پروازها:', error);
        }
    }
}

// ۷. رندر کردن و به‌روزرسانی مارکرها و ردپای پرواز روی نقشه
function renderFlights(flights) {
    const currentActiveHexes = new Set();
    const searchInput = document.getElementById('search-input');
    const searchKeyword = searchInput ? searchInput.value.toLowerCase() : '';
    let visibleCount = 0;

    flights.forEach(ac => {
        const hex = ac.hex;
        const lat = ac.lat;
        const lon = ac.lon;

        const matchesSearch = ac.flight.toLowerCase().includes(searchKeyword) || 
                              hex.toLowerCase().includes(searchKeyword) || 
                              ac.r.toLowerCase().includes(searchKeyword) ||
                              ac.type.toLowerCase().includes(searchKeyword);

        if (matchesSearch) {
            visibleCount++;
            currentActiveHexes.add(hex);

            // بروزرسانی خط مسیر (Trail)
            if (!flightTrails[hex]) flightTrails[hex] = [];
            flightTrails[hex].push([lat, lon]);
            if (flightTrails[hex].length > 25) flightTrails[hex].shift();

            const popupContent = `
                <div style="direction: rtl; font-family: Tahoma; font-size: 0.82rem; line-height: 1.6;">
                    <h4 style="margin: 0 0 4px 0; color: #0284c7;">پرواز: ${ac.flight}</h4>
                    <b>شناسه Reg:</b> ${ac.r}<br>
                    <b>تایپ:</b> ${ac.type}<br>
                    <b>ارتفاع:</b> ${ac.alt_feet.toLocaleString()} ft<br>
                    <b>سرعت:</b> ${ac.speed} km/h<br>
                    <b>Squawk:</b> ${ac.squawk}<br>
                    <b>Hex:</b> <code>${hex}</code>
                </div>
            `;

            if (aircraftMarkers[hex]) {
                aircraftMarkers[hex].marker.setLatLng([lat, lon]);
                aircraftMarkers[hex].marker.setIcon(createPlaneIcon(ac.track, ac.alt_feet, hex === selectedHex));
                aircraftMarkers[hex].marker.getPopup().setContent(popupContent);
                if (aircraftMarkers[hex].polyline) aircraftMarkers[hex].polyline.setLatLngs(flightTrails[hex]);
            } else {
                const marker = L.marker([lat, lon], {
                    icon: createPlaneIcon(ac.track, ac.alt_feet, hex === selectedHex)
                }).bindPopup(popupContent);

                const polyline = L.polyline(flightTrails[hex], {
                    color: getAltitudeColor(ac.alt_feet),
                    weight: 2,
                    opacity: 0.85,
                    dashArray: '3, 3'
                });

                marker.on('click', () => selectAircraft(hex, lat, lon));
                marker.addTo(map);
                aircraftMarkers[hex] = { marker, polyline };
            }
        }
    });

    const visibleCountEl = document.getElementById('visible-count');
    if (visibleCountEl) visibleCountEl.innerText = visibleCount.toLocaleString('fa-IR');

    // پاکسازی پروازهایی که از منطقه دید خارج شده‌اند
    Object.keys(aircraftMarkers).forEach(hex => {
        if (!currentActiveHexes.has(hex)) {
            map.removeLayer(aircraftMarkers[hex].marker);
            if (aircraftMarkers[hex].polyline) map.removeLayer(aircraftMarkers[hex].polyline);
            delete aircraftMarkers[hex];
        }
    });
}

// ۸. انتخاب یک پرواز و زوم روی آن
function selectAircraft(hex, lat, lon) {
    selectedHex = hex;
    map.flyTo([lat, lon], 7, { duration: 1 });
    
    Object.keys(aircraftMarkers).forEach(h => {
        if (h === hex) {
            aircraftMarkers[h].polyline.addTo(map);
        } else {
            if (map.hasLayer(aircraftMarkers[h].polyline)) map.removeLayer(aircraftMarkers[h].polyline);
        }
    });
}

// ۹. چرخه دریافت امن تک‌مسیره (Recursive Timeout)
function startSinglePollingLoop() {
    clearTimeout(mainPollingTimer);
    
    const loop = async () => {
        await fetchLiveGlobalFlights();
        mainPollingTimer = setTimeout(loop, currentFetchInterval);
    };
    
    loop();
}

// ۱۰. رویداد جابه‌جایی نقشه با تاخیر بهینه (۶۰۰ میلی‌ثانیه)
map.on('moveend', function () {
    clearTimeout(moveDebounceTimer);
    moveDebounceTimer = setTimeout(() => {
        fetchLiveGlobalFlights();
    }, 600);
});

// ۱۱. نمایش مختصات و میزان زوم
map.on('mousemove', function (e) {
    const mousePosEl = document.getElementById('mouse-position');
    if (mousePosEl) {
        mousePosEl.innerHTML = `<i class="fa-solid fa-location-crosshairs"></i> مختصات: Lat: ${e.latlng.lat.toFixed(4)}, Lon: ${e.latlng.lng.toFixed(4)}`;
    }
});

map.on('zoomend', function () {
    const mapZoomEl = document.getElementById('map-zoom');
    if (mapZoomEl) {
        mapZoomEl.innerHTML = `<i class="fa-solid fa-magnifying-glass-plus"></i> زوم: ${map.getZoom()}`;
    }
});

// ۱۲. به‌روزرسانی جدول اطلاعات پروازها
function updateTable(flights) {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    flights.slice(0, 100).forEach(ac => {
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

function filterFlights() { 
    renderFlights(allFlightsData); 
}

function updateInterval() {
    const refreshEl = document.getElementById('refresh-rate');
    if (refreshEl) {
        const seconds = parseInt(refreshEl.value) || 4;
        currentFetchInterval = seconds * 1000;
    }
}

function toggleTable() { 
    const tableContainer = document.getElementById('table-container');
    if (tableContainer) tableContainer.classList.toggle('table-hidden'); 
}

function clearTrails() {
    Object.keys(flightTrails).forEach(k => flightTrails[k] = []);
    Object.keys(aircraftMarkers).forEach(h => {
        if (aircraftMarkers[h].polyline) aircraftMarkers[h].polyline.setLatLngs([]);
    });
}

// ۱۳. شروع خودکار چرخه دریافت داده
startSinglePollingLoop();
