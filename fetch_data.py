import requests
import json
import os

# تنظیمات مرکز ایران و محدوده پوشش
CENTER_LAT = 32.4279
CENTER_LON = 53.6880
RADIUS_NAUTICAL_MILES = 1000

# آدرس API بدون نیاز به پروکسی (در پایتون CORS وجود ندارد)
URL = f"https://api.adsb.lol/v2/lat/{CENTER_LAT}/lon/{CENTER_LON}/dist/{RADIUS_NAUTICAL_MILES}"

def update_flights_data():
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.get(URL, headers=headers, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            aircraft_list = data.get('ac', [])
            
            # فیلتر و بهینه‌سازی حجم داده‌ها برای فرانت‌اند
            processed_flights = []
            for ac in aircraft_list:
                lat = ac.get('lat')
                lon = ac.get('lon')
                if lat and lon:
                    processed_flights.append({
                        'hex': ac.get('hex'),
                        'flight': (ac.get('flight') or 'N/A').strip(),
                        'lat': lat,
                        'lon': lon,
                        'alt_feet': ac.get('alt_baro') or ac.get('alt_geom') or 0,
                        'speed': round((ac.get('gs') or 0) * 1.852), # تبدیل به km/h
                        'track': ac.get('track', 0),
                        'type': ac.get('t', 'نامشخص')
                    })
            
            # مطمئن شدن از وجود پوشه data
            os.makedirs('data', exist_ok=True)
            
            # ذخیره درون فایل JSON
            with open('data/flights.json', 'w', encoding='utf-8') as f:
                json.dump({
                    'updated_at': data.get('now'),
                    'total': len(processed_flights),
                    'flights': processed_flights
                }, f, ensure_ascii=False, indent=2)
                
            print(f"Successfully updated {len(processed_flights)} flights.")
        else:
            print(f"Failed to fetch data. Status code: {response.status_code}")

    except Exception as e:
        print(f"Error occurred: {e}")

if __name__ == "__main__":
    update_flights_data()
