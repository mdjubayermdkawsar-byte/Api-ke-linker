// ভার্সেলের ডিফল্ট বডি-পার্সার বন্ধ করা (যাতে ছবি/ফাইল নষ্ট না হয়ে হুবহু আসল এপিআইতে যায়)
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { slug, ...queryParams } = req.query;
  const DB_BASE = "https://ejitor-apk-default-rtdb.firebaseio.com";

  if (!slug) return res.status(400).json({ error: "Slug required" });

  try {
    const timestamp = Date.now();

    // ১. অ্যাপ কন্ট্রোল চেক
    let appRes = await fetch(`${DB_BASE}/app_links/${slug}.json?t=${timestamp}`, { cache: 'no-store' });
    let appData = await appRes.json();

    if (!appData) {
      const oldRes = await fetch(`${DB_BASE}/links/${slug}.json?t=${timestamp}`, { cache: 'no-store' });
      const oldData = await oldRes.json();
      if (oldData && oldData.appStatus) appData = oldData;
    }

    if (appData) {
      if (appData.status === "banned") {
        return res.status(403).json({ success: false, status: "banned", message: "অ্যাপ লিংকটি ব্যান করা হয়েছে।" });
      }
      if (appData.appStatus === "offline") {
        return res.status(200).json({
          app_status: "offline",
          popup: appData.popup || { title: "নোটিশ", message: "অ্যাপ বন্ধ আছে।", btnText: "Update", btnUrl: "" }
        });
      }
      return res.status(200).json({ app_status: "online", message: "App is active" });
    }

    // ২. সাধারণ এপিআই প্রক্সি চেক
    const apiRes = await fetch(`${DB_BASE}/api_links/${slug}.json?t=${timestamp}`, { cache: 'no-store' });
    const apiData = await apiRes.json();

    if (!apiData) {
      return res.status(404).json({ error: "কোনো এপিআই বা অ্যাপ লিংক পাওয়া যায়নি!" });
    }

    if (apiData.status === "banned") {
      return res.status(403).json({ error: "এই এপিআই লিংকটি অ্যাডমিন কর্তৃক ব্যান করা হয়েছে।" });
    }

    // ৩. অ্যাপের পাঠানো ছবি/ফাইল বাইনারি বাফার আকারে ধরা
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const rawBodyBuffer = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

    // ৪. আসল টার্গেট URL তৈরি করা
    let rawTarget = apiData.targetUrl.trim();
    if (!rawTarget.startsWith("http://") && !rawTarget.startsWith("https://")) {
      rawTarget = "https://" + rawTarget;
    }

    let targetUrlObj = new URL(rawTarget);
    Object.keys(queryParams).forEach(k => targetUrlObj.searchParams.append(k, queryParams[k]));

    // ৫. হেডার ফিল্টার করে পাঠানো
    const forwardHeaders = { ...req.headers };
    delete forwardHeaders.host;
    delete forwardHeaders.connection;
    delete forwardHeaders['content-length'];

    // ৬. আসল API-তে ছবি ও রিকোয়েস্ট ফরোয়ার্ড
    const forwardRes = await fetch(targetUrlObj.toString(), {
      method: req.method,
      headers: forwardHeaders,
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? rawBodyBuffer : undefined
    });

    // ৭. আসল API থেকে যে রেসপন্স (PNG ছবি বা JSON) আসবে তা হুবহু অ্যাপে ব্যাক করা
    const contentType = forwardRes.headers.get("content-type");
    if (contentType) {
      res.setHeader("content-type", contentType);
    }

    const responseArrayBuffer = await forwardRes.arrayBuffer();
    return res.status(forwardRes.status).send(Buffer.from(responseArrayBuffer));

  } catch (error) {
    return res.status(500).json({ error: "সার্ভার এরর", details: error.message });
  }
}
