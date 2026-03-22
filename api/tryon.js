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
    // Create prediction with confirmed version hash
    const createRes = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": "Token " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "0aee68c6e6753e4722d362678c927ff91e2e5a7fe7312dc87fb5b2ccc35b277d",
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
      const errText = await createRes.text().catch(() => "");
      let errMsg = `Replicate API error ${createRes.status}`;
      try {
        const errData = JSON.parse(errText);
        errMsg = errData.detail || errData.title || errMsg;
      } catch { errMsg += ": " + errText.slice(0, 200); }
      return res.status(createRes.status).json({ error: errMsg });
    }

    let prediction = await createRes.json();

    // Poll until complete
    while (prediction.status === "starting" || prediction.status === "processing") {
      await new Promise((r) => setTimeout(r, 3000));
      const pollRes = await fetch(
        `https://api.replicate.com/v1/predictions/${prediction.id}`,
        { headers: { "Authorization": "Token " + apiKey } }
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
