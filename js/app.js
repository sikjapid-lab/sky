const map = L.map('map').setView([32.4279, 53.6880], 5);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

const aircraftMarkers = {};

function createPlaneIcon(heading) {
    const angle = heading || 0;
    return L.divIcon({
        html: `<i class="fa-solid fa-plane plane-icon" style="transform: rotate(${angle - 45}deg); color: #38bdf8; font-size: 20px; filter: drop-shadow(0 0 3px #0284c7);"></i>`,
        className: 'custom-plane-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
}

async function fetchLocalFlightData() {
    try {
        // خواندن مستقیم فایل JSON داخلی
        const response = await fetch('./data/flights.json?cache_bust=' + new Date().getTime());
        if (!response.ok) return;

        const data = await response.json();
        const aircraftList = data.flights || [];

        document.getElementById('flight-count').innerText = aircraftList.length.toLocaleString('fa-IR');

        const currentActiveHexes = new Set();

        aircraftList.forEach(aircraft => {
            const hex = aircraft.hex;
            const flight = aircraft.flight;
            const lat = aircraft.lat;
            const lon = aircraft.lon;
            const altFeet = aircraft.alt_feet;
            const altMeters = Math.round(altFeet * 0.3048);
            const speed = aircraft.speed;
            const track = aircraft.track;
            const type = aircraft.type;

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
        });

        // حذف مارکرهای قدیمی
        Object.keys(aircraftMarkers).forEach(hex => {
            if (!currentActiveHexes.has(hex)) {
                map.removeLayer(aircraftMarkers[hex]);
                delete aircraftMarkers[hex];
            }
        });

    } catch (error) {
        console.error('Error reading JSON:', error);
    }
}

// خواندن اطلاعات هر ۱۰ ثانیه از فایل خودی
fetchLocalFlightData();
setInterval(fetchLocalFlightData, 10000);
