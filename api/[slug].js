export default async function handler(req, res) {
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
    // ১. ফায়ারবেজ থেকে ডেটা আনা
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

    // ৩. অ্যাপ কিল-সুইচ চেক (অফ থাকলে নোটিশ পাঠানো)
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

    // ৪. টার্গেট URL ঠিক করা (https:// না থাকলে নিজে বসিয়ে নেবে)
    let rawTarget = (linkData.targetUrl || "").trim();
    if (!rawTarget.startsWith("http://") && !rawTarget.startsWith("https://")) {
      rawTarget = "https://" + rawTarget;
    }

    let finalTargetUrl = new URL(rawTarget);
    Object.keys(queryParams).forEach(key => finalTargetUrl.searchParams.append(key, queryParams[key]));

    // ৫. আসল API কল করা
    const apiRes = await fetch(finalTargetUrl.toString(), {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: ['POST', 'PUT'].includes(req.method) ? JSON.stringify(req.body) : undefined
    });

    // রেসপন্স ঠিকভাবে পাঠানো (JSON অথবা সাধারণ টেক্সট)
    const contentType = apiRes.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await apiRes.json();
      return res.status(apiRes.status).json(data);
    } else {
      const textData = await apiRes.text();
      return res.status(apiRes.status).send(textData);
    }

  } catch (error) {
    return res.status(500).json({ error: "সার্ভার এরর", details: error.message });
  }
}
