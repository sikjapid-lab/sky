// تنظیمات اولیه نقشه روی مرکز ایران
const CENTER_LAT = 32.4279;
const CENTER_LON = 53.6880;
const RADIUS_NAUTICAL_MILES = 1200; // شعاع پوشش (حدود ۲۰۰۰ کیلومتر برای پوشش کامل ایران و خاورمیانه)

const map = L.map('map').setView([CENTER_LAT, CENTER_LON], 5);

// افزودن لایه نقشه تاریک و حرفه‌ای CartoDB
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

// شیء ذخیره مارکرهای روی نقشه
const aircraftMarkers = {};

// تابع ساخت آیکون هواپیما با زاویه حرکت (Heading/Track)
function createPlaneIcon(heading) {
    const angle = heading || 0;
    return L.divIcon({
        html: `<i class="fa-solid fa-plane plane-icon" style="transform: rotate(${angle - 45}deg); color: #38bdf8; font-size: 20px; filter: drop-shadow(0 0 3px #0284c7);"></i>`,
        className: 'custom-plane-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
}

// تابع اصلی دریافت داده‌های ADS-B از سرویس آزاد و بدون CORS
async function fetchFlightData() {
    try {
        const url = `https://api.adsb.lol/v2/lat/${CENTER_LAT}/lon/${CENTER_LON}/dist/${RADIUS_NAUTICAL_MILES}`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        const aircraftList = data.ac || [];

        // بروزرسانی شمارنده پروازها
        document.getElementById('flight-count').innerText = aircraftList.length.toLocaleString('fa-IR');

        // مجموعه‌ای از icao24های فعال در این درخواست برای پاکسازی هواپیماهای خارج شده
        const currentActiveHexes = new Set();

        aircraftList.forEach(aircraft => {
            const hex = aircraft.hex;
            const flight = aircraft.flight ? aircraft.flight.trim() : 'N/A';
            const lat = aircraft.lat;
            const lon = aircraft.lon;
            const altFeet = aircraft.alt_baro || aircraft.alt_geom || 'N/A';
            const altMeters = typeof altFeet === 'number' ? Math.round(altFeet * 0.3048) : 'N/A';
            const speed = aircraft.gs ? Math.round(aircraft.gs * 1.852) : 'N/A'; // تبدیل گره به کیلومتر بر ساعت
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
                    // بروزرسانی موقعیت هواپیمای موجود
                    aircraftMarkers[hex].setLatLng([lat, lon]);
                    aircraftMarkers[hex].setIcon(createPlaneIcon(track));
                    aircraftMarkers[hex].getPopup().setContent(popupContent);
                } else {
                    // افزودن هواپیمای جدید به نقشه
                    const marker = L.marker([lat, lon], {
                        icon: createPlaneIcon(track)
                    }).bindPopup(popupContent);
                    
                    marker.addTo(map);
                    aircraftMarkers[hex] = marker;
                }
            }
        });

        // حذف هواپیماهایی که دیگر در حریم هوایی نیستند
        Object.keys(aircraftMarkers).forEach(hex => {
            if (!currentActiveHexes.has(hex)) {
                map.removeLayer(aircraftMarkers[hex]);
                delete aircraftMarkers[hex];
            }
        });

    } catch (error) {
        console.error('ADS-B Fetch Error:', error);
    }
}

// فراخوانی اولیه و تنظیم بازه بروزرسانی هر ۵ ثانیه
fetchFlightData();
setInterval(fetchFlightData, 5000);
