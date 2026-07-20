module.exports = async (req, res) => {
    // تنظیم هدرهای کامل CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { lat = 30.0, lon = 50.0, dist = 3000 } = req.query;
    
    // گرد کردن مختصات برای افزایش نرخ Hit شدن Cache
    const roundedLat = parseFloat(lat).toFixed(1);
    const roundedLon = parseFloat(lon).toFixed(1);

    const targetUrl = `https://api.adsb.lol/v2/lat/${roundedLat}/lon/${roundedLon}/dist/${dist}`;

    // اطلاعات کلید اختصاصی شما
    const CLIENT_ID = "sikjapid@gmail.com-api-client";
    const CLIENT_SECRET = "2lzjHSo5FaXLt6fJ9SyweYKiAtW0uZN2";

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'X-Client-Id': CLIENT_ID,
                'X-Client-Secret': CLIENT_SECRET,
                'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: `Source API error: ${response.status}` });
        }

        const data = await response.json();

        // کش سبک ۵ ثانیه‌ای روی Vercel Edge Network
        res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=10');
        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: 'Internal proxy error: ' + error.message });
    }
};
