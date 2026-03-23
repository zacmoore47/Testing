export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { apiKey, requestId, model } = req.body;

  if (!apiKey || !requestId || !model) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const headers = { "Authorization": "Key " + apiKey };

  try {
    // Check status
    const statusRes = await fetch(
      `https://queue.fal.run/${model}/requests/${requestId}/status`,
      { headers }
    );

    const statusText = await statusRes.text();
    let statusData;
    try { statusData = JSON.parse(statusText); } catch {
      return res.status(500).json({ error: "Invalid status response: " + statusText.slice(0, 300) });
    }

    if (!statusRes.ok) {
      const errMsg = (typeof statusData.detail === "string" ? statusData.detail : JSON.stringify(statusData.detail)) || statusData.message || `Status error ${statusRes.status}`;
      return res.status(statusRes.status).json({ error: errMsg });
    }

    const status = statusData.status;

    if (status !== "COMPLETED") {
      return res.status(200).json({ status });
    }

    // Fetch the completed result
    const resultRes = await fetch(
      `https://queue.fal.run/${model}/requests/${requestId}`,
      { headers }
    );

    const resultText = await resultRes.text();
    let resultData;
    try { resultData = JSON.parse(resultText); } catch {
      return res.status(500).json({ error: "Invalid result response: " + resultText.slice(0, 300) });
    }

    if (!resultRes.ok) {
      const errMsg = (typeof resultData.detail === "string" ? resultData.detail : JSON.stringify(resultData.detail)) || resultData.message || `Result error ${resultRes.status}`;
      return res.status(resultRes.status).json({ error: errMsg });
    }

    const imageUrl = resultData.images?.[0]?.url || resultData.image?.url;

    return res.status(200).json({ status: "COMPLETED", imageUrl });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
