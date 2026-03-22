export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { apiKey, faceImg, heightFt, heightIn, weightLbs, bodyType, gender } = req.body;

  if (!apiKey || !faceImg) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const ft = parseInt(heightFt) || 5;
  const inches = parseInt(heightIn) || 8;
  const weight = parseInt(weightLbs) || 150;
  const heightCm = Math.round((ft * 12 + inches) * 2.54);
  const build = bodyType || "average";
  const g = gender || "person";

  // Build a descriptive prompt for a neutral full-body mannequin pose
  const buildDesc = {
    slim: "slim, lean build",
    average: "average, natural build",
    athletic: "athletic, toned build",
    muscular: "muscular, strong build",
    curvy: "curvy, full-figured build",
    "plus-size": "plus-size, full build",
  }[build] || "average build";

  const prompt = `Full body studio photograph of a ${g}, ${buildDesc}, approximately ${heightCm}cm tall and ${weight} lbs, standing straight in a relaxed neutral pose facing the camera, wearing minimal plain white form-fitting undergarments, clean plain white studio background, soft even studio lighting, professional fashion photography, head to toe visible, high detail face`;

  try {
    // Step 1: Submit to fal.ai PuLID for face-preserving full-body generation
    const submitRes = await fetch("https://queue.fal.run/fal-ai/pulid", {
      method: "POST",
      headers: {
        "Authorization": "Key " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        reference_images: [{ url: faceImg }],
        num_inference_steps: 4,
        guidance_scale: 1.2,
        image_size: { width: 768, height: 1024 },
        num_images: 1,
        negative_prompt: "blurry, low quality, deformed, distorted, cropped, text, watermark, logo, clothing, dressed, outfit",
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
    const authHeader = { "Authorization": "Key " + apiKey };

    // Poll for completion
    const statusUrl = `https://queue.fal.run/fal-ai/pulid/requests/${request_id}/status`;
    const resultUrl = `https://queue.fal.run/fal-ai/pulid/requests/${request_id}`;

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
      return res.status(500).json({ error: "Mannequin generation failed: " + status });
    }

    const resultRes = await fetch(resultUrl, { headers: authHeader });
    if (!resultRes.ok) {
      return res.status(resultRes.status).json({ error: "Failed to fetch mannequin result" });
    }

    const result = await resultRes.json();
    const outputUrl = result.images?.[0]?.url || result.image?.url;

    if (!outputUrl) {
      return res.status(500).json({ error: "No mannequin image returned" });
    }

    return res.status(200).json({ mannequinUrl: outputUrl });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
