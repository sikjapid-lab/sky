import requests
import json
import os

# آدرس دریافت تمام پروازهای جهانی از endpoint اختصاصی
URL = "https://api.adsb.lol/v2/ladd" # یا v2/all جهت دریافت پوشش جهانی کلی

def fetch_global_flights():
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        # در صورت عدم دسترسی به ladd، از endpoint شعاع کامل استفاده می‌شود
        fallback_url = "https://api.adsb.lol/v2/lat/20.0/lon/30.0/dist/9000"
        
        response = requests.get(fallback_url, headers=headers, timeout=15)
        
        if response.status_code == 200:
            data = response.json()
            aircraft_list = data.get('ac', [])
            
            processed_flights = []
            for ac in aircraft_list:
                lat = ac.get('lat')
                lon = ac.get('lon')
                if lat is not None and lon is not None:
                    processed_flights.append({
                        'hex': ac.get('hex', '').strip(),
                        'flight': (ac.get('flight') or 'N/A').strip(),
                        'lat': lat,
                        'lon': lon,
                        'alt_feet': ac.get('alt_baro') or ac.get('alt_geom') or 0,
                        'speed': round((ac.get('gs') or 0) * 1.852), # km/h
                        'vspeed': ac.get('baro_rate', 0), # سرعت صعود/نزول
                        'track': ac.get('track', 0),
                        'type': ac.get('t', 'نامشخص'),
                        'squawk': ac.get('squawk', 'N/A')
                    })
            
            os.makedirs('data', exist_ok=True)
            with open('data/flights.json', 'w', encoding='utf-8') as f:
                json.dump({
                    'updated_at': data.get('now'),
                    'total': len(processed_flights),
                    'flights': processed_flights
                }, f, ensure_ascii=False, indent=2)
                
            print(f"Successfully saved {len(processed_flights)} global flights.")
        else:
            print(f"Error fetching data: {response.status_code}")

    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    fetch_global_flights()
