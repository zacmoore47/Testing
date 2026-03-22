export const config = { api: { bodyParser: { sizeLimit: "10mb" } }, maxDuration: 60 };

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
    // Use synchronous fal.ai endpoint — no polling needed
    const seeds = Array.from({ length: count }, () => Math.floor(Math.random() * 999999));

    const results = await Promise.all(
      seeds.map(async (seed) => {
        const falRes = await fetch("https://fal.run/fal-ai/cat-vton", {
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

        const falText = await falRes.text();
        let data;
        try { data = JSON.parse(falText); } catch {
          throw new Error("Invalid fal.ai response: " + falText.slice(0, 300));
        }

        if (!falRes.ok) {
          const errMsg = data.detail || data.message || `fal.ai error ${falRes.status}`;
          throw new Error(errMsg);
        }

        const outputUrl = data.image?.url || data.images?.[0]?.url;
        if (!outputUrl) throw new Error("No output image returned. Keys: " + Object.keys(data).join(", "));
        return outputUrl;
      })
    );

    return res.status(200).json({ outputs: results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
