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

  try {
    // Submit to fal.ai queue and return request_id immediately
    const submitRes = await fetch("https://queue.fal.run/fal-ai/pulid", {
      method: "POST",
      headers: {
        "Authorization": "Key " + apiKey,
        "Content-Type": "application/json",
      },
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

    const text = await submitRes.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return res.status(500).json({ error: "Invalid fal.ai response: " + text.slice(0, 300) });
    }

    if (!submitRes.ok) {
      const errMsg = (typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail)) || data.message || `fal.ai error ${submitRes.status}`;
      return res.status(submitRes.status).json({ error: errMsg });
    }

    // Return request_id for client-side polling
    return res.status(200).json({ request_id: data.request_id, model: "fal-ai/pulid" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
