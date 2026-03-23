export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { apiKey, mannequinUrl, clothingImg, clothType = "overall", numImages = 4 } = req.body;

  if (!apiKey || !mannequinUrl || !clothingImg) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const count = Math.min(Math.max(parseInt(numImages) || 4, 1), 4);

  try {
    // Submit multiple CatVTON requests to the queue, return request_ids
    const seeds = Array.from({ length: count }, () => Math.floor(Math.random() * 999999));

    const submissions = await Promise.all(
      seeds.map(async (seed) => {
        const submitRes = await fetch("https://queue.fal.run/fal-ai/cat-vton", {
          method: "POST",
          headers: {
            "Authorization": "Key " + apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            human_image_url: mannequinUrl,
            garment_image_url: clothingImg,
            cloth_type: clothType,
            seed,
            num_inference_steps: 50,
          }),
        });

        const text = await submitRes.text();
        let data;
        try { data = JSON.parse(text); } catch {
          throw new Error("Invalid fal.ai response: " + text.slice(0, 300));
        }

        if (!submitRes.ok) {
          const errMsg = (typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail)) || data.message || `fal.ai error ${submitRes.status}`;
          throw new Error(errMsg);
        }

        return data.request_id;
      })
    );

    return res.status(200).json({ request_ids: submissions, model: "fal-ai/cat-vton" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
