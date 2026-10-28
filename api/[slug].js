export default async function handler(req, res) {
  // প্রি-ফ্লাইট OPTIONS হ্যান্ডেল করা
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // URL থেকে লিংকের নাম/slug নেওয়া
  const { slug, ...queryParams } = req.query;
  const FIREBASE_DB = "https://ejitor-apk-default-rtdb.firebaseio.com";

  if (!slug) {
    return res.status(400).json({ success: false, error: "Slug is required" });
  }

  try {
    // ১. ফায়ারবেজ থেকে লিংক ইনফো চেক
    const fbResponse = await fetch(`${FIREBASE_DB}/links/${slug}.json`);
    const linkData = await fbResponse.json();

    // লিংক যদি ডেটাবেজে না থাকে
    if (!linkData) {
      return res.status(404).json({
        success: false,
        error: "Invalid Link: কোনো ডেটা পাওয়া যায়নি।"
      });
    }

    // ২. চেক করা লিংক কি অ্যাডমিন থেকে ব্যান/অফ করা?
    if (linkData.status === "banned") {
      return res.status(403).json({
        app_status: "blocked",
        success: false,
        message: linkData.blockMessage || "এই সার্ভিস বা অ্যাপটি অ্যাডমিন কর্তৃক সাময়িকভাবে বন্ধ আছে।"
      });
    }

    // ৩. আসল API URL তৈরি করা (কোয়েরি প্যারামিটার সহ যদি থাকে)
    let finalTargetUrl = new URL(linkData.targetUrl);
    Object.keys(queryParams).forEach(key => {
      finalTargetUrl.searchParams.append(key, queryParams[key]);
    });

    // ৪. আসল API কল করা (আসল লিংক অ্যাপের কাছ থেকে গোপন থাকবে)
    const options = {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
      }
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      options.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
    }

    const apiResponse = await fetch(finalTargetUrl.toString(), options);
    const contentType = apiResponse.headers.get("content-type");

    // রেসপন্স ব্যাক করা
    if (contentType && contentType.includes("application/json")) {
      const data = await apiResponse.json();
      return res.status(apiResponse.status).json(data);
    } else {
      const textData = await apiResponse.text();
      return res.status(apiResponse.status).send(textData);
    }

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "সার্ভারে সমস্যা হয়েছে",
      details: error.message
    });
  }
}
