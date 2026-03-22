export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { apiKey, personImg, clothingImg } = req.body;

  if (!apiKey || !personImg || !clothingImg) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Create prediction using model endpoint (always uses latest version)
    const createRes = await fetch("https://api.replicate.com/v1/models/cuuupid/idm-vton/predictions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
        "Prefer": "wait",
      },
      body: JSON.stringify({
        input: {
          human_img: personImg,
          garm_img: clothingImg,
          garment_des: "clothing item",
          is_checked: true,
          is_checked_crop: false,
          denoise_steps: 30,
          seed: 42,
        },
      }),
    });

    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({}));
      return res.status(createRes.status).json({
        error: errData.detail || `Replicate API error: ${createRes.status}`,
      });
    }

    let prediction = await createRes.json();

    // Poll until complete
    while (prediction.status === "starting" || prediction.status === "processing") {
      await new Promise((r) => setTimeout(r, 3000));
      const pollRes = await fetch(
        `https://api.replicate.com/v1/predictions/${prediction.id}`,
        { headers: { "Authorization": "Bearer " + apiKey } }
      );
      if (!pollRes.ok) {
        return res.status(pollRes.status).json({ error: `Polling error: ${pollRes.status}` });
      }
      prediction = await pollRes.json();
    }

    if (prediction.status === "failed") {
      return res.status(500).json({ error: prediction.error || "Generation failed" });
    }

    const outputUrl = Array.isArray(prediction.output)
      ? prediction.output[0]
      : prediction.output;

    return res.status(200).json({ output: outputUrl });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
