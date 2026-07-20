export default async function handler(req, res) {
    // افزودن هدرهای کامل CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { lat = 30.0, lon = 50.0, dist = 3000 } = req.query;
    const targetUrl = `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${dist}`;

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: 'خطا در برقراری ارتباط با API مرجع' });
        }

        const data = await response.json();
        
        // Cache پاسخ به مدت ۵ ثانیه روی CDN ورسل جهت افزایش سرعت و کاهش فشار
        res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');
        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: 'خطای داخلی پروکسی Vercel: ' + error.message });
    }
}
