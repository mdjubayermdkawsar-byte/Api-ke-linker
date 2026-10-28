export default async function handler(req, res) {
  // CORS হেডার
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { slug, ...queryParams } = req.query;
  const FIREBASE_DB = "https://ejitor-apk-default-rtdb.firebaseio.com";

  if (!slug) {
    return res.status(400).json({ success: false, error: "Slug required" });
  }

  try {
    // ১. ফায়ারবেজ থেকে লিংক চেক
    const fbRes = await fetch(`${FIREBASE_DB}/links/${slug}.json`);
    const linkData = await fbRes.json();

    if (!linkData) {
      return res.status(404).json({ success: false, error: "লিংক পাওয়া যায়নি!" });
    }

    // ২. লিংক ব্যান চেক
    if (linkData.status === "banned") {
      return res.status(403).json({
        success: false,
        status: "banned",
        message: "এই লিংকটি অ্যাডমিন কর্তৃক ব্যান করা হয়েছে।"
      });
    }

    // ৩. অ্যাপ কিল-সুইচ ও পপ-আপ চেক (অফলাইন থাকলে)
    if (linkData.appStatus === "offline") {
      return res.status(200).json({
        app_status: "offline",
        popup: linkData.popup || {
          title: "নোটিশ",
          message: "অ্যাপ সাময়িকভাবে বন্ধ আছে।",
          btnText: "ওকে",
          btnUrl: ""
        }
      });
    }

    // ৪. আসল API কল করা (আসল লিংক গোপনে কাজ করবে)
    let finalTargetUrl = new URL(linkData.targetUrl);
    Object.keys(queryParams).forEach(key => finalTargetUrl.searchParams.append(key, queryParams[key]));

    const apiRes = await fetch(finalTargetUrl.toString(), {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: ['POST', 'PUT'].includes(req.method) ? JSON.stringify(req.body) : undefined
    });

    const data = await apiRes.json();
    return res.status(apiRes.status).json(data);

  } catch (error) {
    return res.status(500).json({ error: "সার্ভার এরর", details: error.message });
  }
}
