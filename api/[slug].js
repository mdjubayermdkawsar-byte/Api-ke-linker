export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { slug, ...queryParams } = req.query;
  const DB_BASE = "https://ejitor-apk-default-rtdb.firebaseio.com";

  if (!slug) return res.status(400).json({ error: "Slug required" });

  try {
    // ১. প্রথমে চেক করি এটি কি কোনো 'অ্যাপ কন্ট্রোল' লিংক কিনা
    let appRes = await fetch(`${DB_BASE}/app_links/${slug}.json`);
    let appData = await appRes.json();

    // পুরাতন লিংকের ব্যাকওয়ার্ড সাপোর্ট
    if (!appData) {
      const oldRes = await fetch(`${DB_BASE}/links/${slug}.json`);
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

    // ২. এটি যদি 'সাধারণ এপিআই প্রক্সি' লিংক হয় (সম্পূর্ণ হাইড এপিআই)
    const apiRes = await fetch(`${DB_BASE}/api_links/${slug}.json`);
    const apiData = await apiRes.json();

    if (!apiData) {
      return res.status(404).json({ error: "কোনো এপিআই বা অ্যাপ লিংক পাওয়া যায়নি!" });
    }

    if (apiData.status === "banned") {
      return res.status(403).json({ error: "এই এপিআই লিংকটি ব্যান করা হয়েছে।" });
    }

    // আসল এপিআই কল করা (সম্পূর্ণ গোপন থাকবে)
    let rawTarget = apiData.targetUrl.trim();
    if (!rawTarget.startsWith("http://") && !rawTarget.startsWith("https://")) {
      rawTarget = "https://" + rawTarget;
    }

    let targetUrlObj = new URL(rawTarget);
    Object.keys(queryParams).forEach(k => targetUrlObj.searchParams.append(k, queryParams[k]));

    const forwardRes = await fetch(targetUrlObj.toString(), {
      method: req.method,
      headers: { 'Content-Type': req.headers['content-type'] || 'application/json' },
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined
    });

    const cType = forwardRes.headers.get("content-type") || "";
    if (cType.includes("application/json")) {
      const data = await forwardRes.json();
      return res.status(forwardRes.status).json(data);
    } else {
      const text = await forwardRes.text();
      return res.status(forwardRes.status).send(text);
    }

  } catch (error) {
    return res.status(500).json({ error: "সার্ভার এরর", details: error.message });
  }
}
