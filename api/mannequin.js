export const config = { api: { bodyParser: { sizeLimit: "10mb" } }, maxDuration: 60 };

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
    // Use fal.ai synchronous endpoint (waits for result, no polling needed)
    const falRes = await fetch("https://fal.run/fal-ai/pulid", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        prompt,
        reference_images: [{ image_url: faceImg }],
        num_inference_steps: 4,
        guidance_scale: 1.2,
        image_size: { width: 768, height: 1024 },
        num_images: 1,
        negative_prompt: "blurry, low quality, deformed, distorted, cropped, text, watermark, logo",
      }),
    });

    const falText = await falRes.text();
    let result;
    try { result = JSON.parse(falText); } catch {
      return res.status(500).json({ error: "Invalid response from fal.ai: " + falText.slice(0, 300) });
    }

    if (!falRes.ok) {
      const errMsg = result.detail || result.message || `fal.ai error ${falRes.status}: ${falText.slice(0, 300)}`;
      return res.status(falRes.status).json({ error: errMsg });
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
