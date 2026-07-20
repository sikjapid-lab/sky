// تنظیم مرکز نقشه (ایران / خاورمیانه)
const CENTER_LAT = 32.4279;
const CENTER_LON = 53.6880;
const RADIUS_NAUTICAL_MILES = 1000;

const map = L.map('map').setView([CENTER_LAT, CENTER_LON], 5);

// افزودن لایه نقشه تاریک CartoDB
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

const aircraftMarkers = {};

// ساخت آیکون چرخان هواپیما
function createPlaneIcon(heading) {
    const angle = heading || 0;
    return L.divIcon({
        html: `<i class="fa-solid fa-plane plane-icon" style="transform: rotate(${angle - 45}deg); color: #38bdf8; font-size: 20px; filter: drop-shadow(0 0 3px #0284c7);"></i>`,
        className: 'custom-plane-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
}

// دریافت داده‌ها از طریق CORS Proxy
async function fetchFlightData() {
    try {
        const rawUrl = `https://api.adsb.lol/v2/lat/${CENTER_LAT}/lon/${CENTER_LON}/dist/${RADIUS_NAUTICAL_MILES}`;
        // استفاده از پروکسی معتبر جهت عبور از محدودیت CORS مرورگر
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(rawUrl)}`;

        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            if (response.status === 429) {
                console.warn('تعداد درخواست‌ها بیش از حد مجاز است. کمی صبر کنید...');
            }
            throw new Error(`خطای شبکه: ${response.status}`);
        }
        
        const data = await response.json();
        const aircraftList = data.ac || [];

        // بروزرسانی شمارنده
        document.getElementById('flight-count').innerText = aircraftList.length.toLocaleString('fa-IR');

        const currentActiveHexes = new Set();

        aircraftList.forEach(aircraft => {
            const hex = aircraft.hex;
            const flight = aircraft.flight ? aircraft.flight.trim() : 'N/A';
            const lat = aircraft.lat;
            const lon = aircraft.lon;
            const altFeet = aircraft.alt_baro || aircraft.alt_geom || 'N/A';
            const altMeters = typeof altFeet === 'number' ? Math.round(altFeet * 0.3048) : 'N/A';
            const speed = aircraft.gs ? Math.round(aircraft.gs * 1.852) : 'N/A';
            const track = aircraft.track || 0;
            const type = aircraft.t || 'نامشخص';

            if (lat && lon) {
                currentActiveHexes.add(hex);

                const popupContent = `
                    <div style="direction: rtl; font-family: Tahoma, sans-serif; line-height: 1.6;">
                        <h4 style="margin: 0 0 5px 0; color: #0284c7;">پرواز: ${flight}</h4>
                        <strong>نوع تایپ:</strong> ${type}<br>
                        <strong>ارتفاع:</strong> ${altMeters} متر (${altFeet} پا)<br>
                        <strong>سرعت:</strong> ${speed} km/h<br>
                        <strong>شناسه Hex:</strong> <code style="background: #e2e8f0; padding: 2px 4px; border-radius: 4px;">${hex.toUpperCase()}</code>
                    </div>
                `;

                if (aircraftMarkers[hex]) {
                    aircraftMarkers[hex].setLatLng([lat, lon]);
                    aircraftMarkers[hex].setIcon(createPlaneIcon(track));
                    aircraftMarkers[hex].getPopup().setContent(popupContent);
                } else {
                    const marker = L.marker([lat, lon], {
                        icon: createPlaneIcon(track)
                    }).bindPopup(popupContent);
                    
                    marker.addTo(map);
                    aircraftMarkers[hex] = marker;
                }
            }
        });

        // پاکسازی مارکرهای هواپیماهای خارج شده از محدوده
        Object.keys(aircraftMarkers).forEach(hex => {
            if (!currentActiveHexes.has(hex)) {
                map.removeLayer(aircraftMarkers[hex]);
                delete aircraftMarkers[hex];
            }
        });

    } catch (error) {
        console.error('تأخیر یا خطا در دریافت داده‌ها:', error.message);
    }
}

// فراخوانی اولیه
fetchFlightData();

// تنظیم زمان بروزرسانی روی ۱۲ ثانیه جهت جلوگیری از مسدود شدن IP (خطای 429)
setInterval(fetchFlightData, 12000);
