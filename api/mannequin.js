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

  const buildDesc = {
    slim: "slim, lean build",
    average: "average, natural build",
    athletic: "athletic, toned build",
    muscular: "muscular, strong build",
    curvy: "curvy, full-figured build",
    "plus-size": "plus-size, full build",
  }[build] || "average build";

  const prompt = `Full body studio photograph of a ${g}, ${buildDesc}, approximately ${heightCm}cm tall and ${weight} lbs, standing straight in a relaxed neutral pose facing the camera, wearing minimal plain white form-fitting undergarments, clean plain white studio background, soft even studio lighting, professional fashion photography, head to toe visible, high detail face`;

  const authHeader = { "Authorization": "Key " + apiKey, "Content-Type": "application/json" };

  try {
    // Submit to fal.ai PuLID for face-preserving full-body generation
    const submitRes = await fetch("https://queue.fal.run/fal-ai/pulid", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        prompt,
        reference_images: [{ url: faceImg }],
        num_inference_steps: 4,
        guidance_scale: 1.2,
        image_size: { width: 768, height: 1024 },
        num_images: 1,
        negative_prompt: "blurry, low quality, deformed, distorted, cropped, text, watermark, logo",
      }),
    });

    const submitText = await submitRes.text();
    let submitData;
    try { submitData = JSON.parse(submitText); } catch {
      return res.status(500).json({ error: "Invalid response from fal.ai: " + submitText.slice(0, 300) });
    }

    if (!submitRes.ok) {
      const errMsg = submitData.detail || submitData.message || `fal.ai error ${submitRes.status}: ${submitText.slice(0, 300)}`;
      return res.status(submitRes.status).json({ error: errMsg });
    }

    // fal.ai queue returns request_id for async, or images directly for sync
    // Check if result came back immediately
    if (submitData.images?.[0]?.url || submitData.image?.url) {
      const url = submitData.images?.[0]?.url || submitData.image?.url;
      return res.status(200).json({ mannequinUrl: url });
    }

    const requestId = submitData.request_id;
    if (!requestId) {
      return res.status(500).json({
        error: "No request_id returned from fal.ai. Response: " + JSON.stringify(submitData).slice(0, 300),
      });
    }

    // Poll for completion
    const statusUrl = `https://queue.fal.run/fal-ai/pulid/requests/${requestId}/status`;
    const resultUrl = `https://queue.fal.run/fal-ai/pulid/requests/${requestId}`;
    const pollHeaders = { "Authorization": "Key " + apiKey };

    let status = "IN_QUEUE";
    while (status === "IN_QUEUE" || status === "IN_PROGRESS") {
      await new Promise((r) => setTimeout(r, 3000));
      const pollRes = await fetch(statusUrl, { headers: pollHeaders });
      if (!pollRes.ok) {
        const pollText = await pollRes.text().catch(() => "");
        return res.status(pollRes.status).json({
          error: `Polling error ${pollRes.status}: ${pollText.slice(0, 300)}`,
        });
      }
      const pollData = await pollRes.json();
      status = pollData.status;
    }

    if (status !== "COMPLETED") {
      return res.status(500).json({ error: "Mannequin generation failed with status: " + status });
    }

    // Fetch the completed result
    const resultRes = await fetch(resultUrl, { headers: pollHeaders });
    const resultText = await resultRes.text();

    if (!resultRes.ok) {
      return res.status(resultRes.status).json({
        error: `Failed to fetch result (${resultRes.status}): ${resultText.slice(0, 300)}`,
      });
    }

    let result;
    try { result = JSON.parse(resultText); } catch {
      return res.status(500).json({ error: "Invalid result JSON: " + resultText.slice(0, 300) });
    }

    const outputUrl = result.images?.[0]?.url || result.image?.url;

    if (!outputUrl) {
      return res.status(500).json({
        error: "No image in result. Keys returned: " + Object.keys(result).join(", "),
      });
    }

    return res.status(200).json({ mannequinUrl: outputUrl });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
