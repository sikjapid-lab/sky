import requests
import json
import os

def fetch_global_flights():
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        # استفاده از endpoint سراسری با شعاع کامل برای پوشش حداکثری
        url = "https://api.adsb.lol/v2/lat/30.0/lon/50.0/dist/10000"
        
        response = requests.get(url, headers=headers, timeout=20)
        
        if response.status_code == 200:
            data = response.json()
            aircraft_list = data.get('ac', [])
            
            processed_flights = []
            for ac in aircraft_list:
                lat = ac.get('lat')
                lon = ac.get('lon')
                
                # فیلتر مختصات نامعتبر
                if lat is not None and lon is not None:
                    alt_feet = ac.get('alt_baro')
                    if alt_feet == "ground" or alt_feet is None:
                        alt_feet = 0
                    else:
                        try:
                            alt_feet = int(alt_feet)
                        except:
                            alt_feet = 0

                    speed_knots = ac.get('gs', 0) or 0
                    speed_kmh = round(speed_knots * 1.852)

                    processed_flights.append({
                        'hex': str(ac.get('hex', '')).strip().upper(),
                        'flight': str(ac.get('flight', 'N/A')).strip() or 'N/A',
                        'lat': float(lat),
                        'lon': float(lon),
                        'alt_feet': alt_feet,
                        'speed': speed_kmh,
                        'vspeed': ac.get('baro_rate', 0) or 0,
                        'track': ac.get('track', 0) or 0,
                        'type': str(ac.get('t', 'UNK')).strip(),
                        'squawk': str(ac.get('squawk', 'N/A')).strip(),
                        'r': str(ac.get('r', 'N/A')).strip() # شماره ثبت (Registration)
                    })
            
            os.makedirs('data', exist_ok=True)
            with open('data/flights.json', 'w', encoding='utf-8') as f:
                json.dump({
                    'updated_at': data.get('now'),
                    'total': len(processed_flights),
                    'flights': processed_flights
                }, f, ensure_ascii=False, indent=2)
                
            print(f"موفقیت: {len(processed_flights)} پرواز ذخیره شد.")
        else:
            print(f"خطای دریافت داده: {response.status_code}")

    except Exception as e:
        print(f"خطا در اجرا: {e}")

if __name__ == "__main__":
    fetch_global_flights()
