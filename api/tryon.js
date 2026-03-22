export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { apiKey, personImg, clothingImg, clothType = "overall", numImages = 4 } = req.body;

  if (!apiKey || !personImg || !clothingImg) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const count = Math.min(Math.max(parseInt(numImages) || 4, 1), 4);

  try {
    // Submit multiple requests in parallel with different seeds for variety
    const seeds = Array.from({ length: count }, (_, i) => Math.floor(Math.random() * 999999) + i);

    const submissions = seeds.map((seed) =>
      fetch("https://queue.fal.run/fal-ai/cat-vton", {
        method: "POST",
        headers: {
          "Authorization": "Key " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          human_image_url: personImg,
          garment_image_url: clothingImg,
          cloth_type: clothType,
          seed,
          num_inference_steps: 50,
        }),
      })
    );

    const submitResults = await Promise.all(submissions);

    // Check for errors on any submission
    for (const submitRes of submitResults) {
      if (!submitRes.ok) {
        const errText = await submitRes.text().catch(() => "");
        let errMsg = `fal.ai API error ${submitRes.status}`;
        try {
          const errData = JSON.parse(errText);
          errMsg = errData.detail || errData.message || errMsg;
        } catch { errMsg += ": " + errText.slice(0, 300); }
        return res.status(submitRes.status).json({ error: errMsg });
      }
    }

    const requestIds = await Promise.all(submitResults.map((r) => r.json().then((d) => d.request_id)));
    const authHeader = { "Authorization": "Key " + apiKey };

    // Poll all requests until completion
    async function pollUntilDone(requestId) {
      const statusUrl = `https://queue.fal.run/fal-ai/cat-vton/requests/${requestId}/status`;
      const resultUrl = `https://queue.fal.run/fal-ai/cat-vton/requests/${requestId}`;

      let status = "IN_QUEUE";
      while (status === "IN_QUEUE" || status === "IN_PROGRESS") {
        await new Promise((r) => setTimeout(r, 3000));
        const pollRes = await fetch(statusUrl, { headers: authHeader });
        if (!pollRes.ok) {
          throw new Error(`Polling error: ${pollRes.status}`);
        }
        const pollData = await pollRes.json();
        status = pollData.status;
      }

      if (status !== "COMPLETED") {
        throw new Error("Generation failed with status: " + status);
      }

      const resultRes = await fetch(resultUrl, { headers: authHeader });
      if (!resultRes.ok) {
        throw new Error("Failed to fetch result");
      }

      const result = await resultRes.json();
      const outputUrl = result.image?.url || (result.images && result.images[0]?.url);
      if (!outputUrl) {
        throw new Error("No output image returned");
      }
      return outputUrl;
    }

    const outputs = await Promise.all(requestIds.map(pollUntilDone));

    return res.status(200).json({ outputs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
