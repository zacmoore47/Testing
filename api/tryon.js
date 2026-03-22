export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

async function uploadToFalCDN(dataUri, apiKey) {
  // Convert data URI to binary
  const match = dataUri.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data");
  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const ext = mimeType === "image/png" ? "png" : "jpeg";

  const uploadRes = await fetch("https://fal.ai/api/fal/storage/upload", {
    method: "PUT",
    headers: {
      "Authorization": "Key " + apiKey,
      "Content-Type": mimeType,
    },
    body: buffer,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error("Upload failed (" + uploadRes.status + "): " + errText.slice(0, 200));
  }

  const data = await uploadRes.json();
  return data.access_url || data.url;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { apiKey, personImg, clothingImg } = req.body;

  if (!apiKey || !personImg || !clothingImg) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Upload images to fal CDN to get proper URLs
    const [personUrl, clothingUrl] = await Promise.all([
      uploadToFalCDN(personImg, apiKey),
      uploadToFalCDN(clothingImg, apiKey),
    ]);

    // Submit to fal.ai CatVTON queue
    const submitRes = await fetch("https://queue.fal.run/fal-ai/cat-vton", {
      method: "POST",
      headers: {
        "Authorization": "Key " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        human_image_url: personUrl,
        garment_image_url: clothingUrl,
        cloth_type: "overall",
      }),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text().catch(() => "");
      let errMsg = `fal.ai API error ${submitRes.status}`;
      try {
        const errData = JSON.parse(errText);
        errMsg = errData.detail || errData.message || errMsg;
      } catch { errMsg += ": " + errText.slice(0, 300); }
      return res.status(submitRes.status).json({ error: errMsg });
    }

    const { request_id } = await submitRes.json();

    // Poll for completion
    const statusUrl = `https://queue.fal.run/fal-ai/cat-vton/requests/${request_id}/status`;
    const resultUrl = `https://queue.fal.run/fal-ai/cat-vton/requests/${request_id}`;
    const authHeader = { "Authorization": "Key " + apiKey };

    let status = "IN_QUEUE";
    while (status === "IN_QUEUE" || status === "IN_PROGRESS") {
      await new Promise((r) => setTimeout(r, 3000));
      const pollRes = await fetch(statusUrl, { headers: authHeader });
      if (!pollRes.ok) {
        return res.status(pollRes.status).json({ error: `Polling error: ${pollRes.status}` });
      }
      const pollData = await pollRes.json();
      status = pollData.status;
    }

    if (status !== "COMPLETED") {
      return res.status(500).json({ error: "Generation failed with status: " + status });
    }

    // Fetch result
    const resultRes = await fetch(resultUrl, { headers: authHeader });
    if (!resultRes.ok) {
      return res.status(resultRes.status).json({ error: "Failed to fetch result" });
    }

    const result = await resultRes.json();
    const outputUrl = result.image?.url || (result.images && result.images[0]?.url);

    if (!outputUrl) {
      return res.status(500).json({ error: "No output image returned" });
    }

    return res.status(200).json({ output: outputUrl });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
