// تنظیمات اولیه نقشه (تمرکز اولیه روی خاورمیانه / ایران)
const map = L.map('map').setView([32.4279, 53.6880], 5);

// افزودن لایه نقشه CartoDB Dark (مناسب ترافیک هوایی)
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

// ذخیره مارکرها برای مدیریت و بروزرسانی
const aircraftMarkers = {};

// تابع ساخت آیکون هواپیما با زاویه حرکت مشخص
function createPlaneIcon(heading) {
    return L.divIcon({
        html: `<i class="fa-solid fa-plane plane-icon" style="transform: rotate(${heading - 45}deg); color: #38bdf8; font-size: 18px;"></i>`,
        className: 'custom-plane-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
}

// دریافت داده‌ها از API رایگان OpenSky Network
async function fetchFlightData() {
    try {
        // دریافت تمام پروازهای فعال
        const response = await fetch('https://opensky-network.org/api/states/all');
        if (!response.ok) throw new Error('خطا در دریافت داده‌ها');
        
        const data = await response.json();
        const states = data.states || [];

        // بروزرسانی آمار
        document.getElementById('flight-count').innerText = states.length.toLocaleString('fa-IR');

        // پیمایش پروازها (جهت بهینه‌سازی فقط پروازهای دارای مختصات نمایش داده می‌شوند)
        states.forEach(flight => {
            const icao24 = flight[0];
            const callsign = flight[1] ? flight[1].trim() : 'Unknown';
            const country = flight[2];
            const longitude = flight[5];
            const latitude = flight[6];
            const altitude = flight[7] ? Math.round(flight[7]) : 'N/A';
            const heading = flight[10] || 0;

            if (latitude && longitude) {
                const popupContent = `
                    <div style="direction: rtl; font-family: Tahoma;">
                        <strong>کد پرواز:</strong> ${callsign}<br>
                        <strong>کشور:</strong> ${country}<br>
                        <strong>ارتفاع:</strong> ${altitude} متر<br>
                        <strong>کد شناسه:</strong> ${icao24}
                    </div>
                `;

                if (aircraftMarkers[icao24]) {
                    // بروزرسانی موقعیت هواپیمای موجود
                    aircraftMarkers[icao24].setLatLng([latitude, longitude]);
                    aircraftMarkers[icao24].setIcon(createPlaneIcon(heading));
                    aircraftMarkers[icao24].setPopupContent(popupContent);
                } else {
                    // افزودن هواپیمای جدید
                    const marker = L.marker([latitude, longitude], {
                        icon: createPlaneIcon(heading)
                    }).bindPopup(popupContent);
                    
                    marker.addTo(map);
                    aircraftMarkers[icao24] = marker;
                }
            }
        });
    } catch (error) {
        console.error('OpenSky Fetch Error:', error);
    }
}

// اجرای اولیه و تنظیم تایمر ۱۰ ثانیه‌ای
fetchFlightData();
setInterval(fetchFlightData, 10000);
