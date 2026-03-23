// ============================================================
// Virtual Try-On — Two-step: Mannequin generation + Clothing
// ============================================================
(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  // ---- DOM refs ----
  const apiKeyInput     = $("#api-key-input");
  const saveKeyBtn      = $("#save-key-btn");
  const keyStatus       = $("#key-status");

  const faceCard        = $("#face-card");
  const faceUpload      = $("#face-upload");
  const faceImg         = $("#face-img");
  const facePlaceholder = $("#face-placeholder");
  const clearFaceBtn    = $("#clear-face");

  const genderSelect    = $("#gender-select");
  const bodyTypeSelect  = $("#body-type-select");
  const heightFt        = $("#height-ft");
  const heightIn        = $("#height-in");
  const weightInput     = $("#weight-input");

  const clothingCard    = $("#clothing-card");
  const clothingUpload  = $("#clothing-upload");
  const clothingImg     = $("#clothing-img");
  const clothPlaceholder = $("#clothing-placeholder");
  const clearClothingBtn = $("#clear-clothing");
  const clothTypeSelect = $("#cloth-type-select");
  const numImagesSelect = $("#num-images-select");

  const generateBtn     = $("#generate-btn");
  const generateHint    = $("#generate-hint");
  const loadingSection  = $("#loading-section");
  const loadingStatus   = $("#loading-status");
  const resultSection   = $("#result-section");
  const resultGallery   = $("#result-gallery");
  const downloadBtn     = $("#download-btn");
  const downloadAllBtn  = $("#download-all-btn");
  const tryAgainBtn     = $("#try-again-btn");
  const errorSection    = $("#error-section");
  const errorText       = $("#error-text");
  const dismissErrorBtn = $("#dismiss-error-btn");

  // ---- State ----
  let faceDataURL = null;
  let clothingDataURL = null;
  let resultImages = [];
  let selectedIndex = 0;

  // ---- API Key ----
  function getApiKey() {
    return localStorage.getItem("fal_api_key") || "";
  }

  function loadSavedKey() {
    const key = getApiKey();
    if (key) {
      apiKeyInput.value = key;
      keyStatus.textContent = "Saved";
    }
  }

  saveKeyBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      keyStatus.textContent = "Enter a key";
      keyStatus.style.color = "#c0392b";
      return;
    }
    localStorage.setItem("fal_api_key", key);
    keyStatus.textContent = "Saved";
    keyStatus.style.color = "#27ae60";
    updateGenerateState();
  });

  // ---- File helper ----
  function fileToDataURL(file) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1536;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          const scale = MAX / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/png"));
      };
      img.src = URL.createObjectURL(file);
    });
  }

  // ---- Upload cards ----
  function setupCard(card, fileInput, imgEl, placeholder, clearBtn, onLoad) {
    card.addEventListener("click", (e) => {
      if (e.target === clearBtn || clearBtn.contains(e.target)) return;
      fileInput.click();
    });

    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = await fileToDataURL(file);
      showImg(imgEl, placeholder, clearBtn, url);
      onLoad(url);
      fileInput.value = "";
    });

    card.addEventListener("dragover", (e) => { e.preventDefault(); card.classList.add("drag"); });
    card.addEventListener("dragleave", () => card.classList.remove("drag"));
    card.addEventListener("drop", async (e) => {
      e.preventDefault();
      card.classList.remove("drag");
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith("image/")) return;
      const url = await fileToDataURL(file);
      showImg(imgEl, placeholder, clearBtn, url);
      onLoad(url);
    });

    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hideImg(imgEl, placeholder, clearBtn);
      onLoad(null);
    });
  }

  function showImg(imgEl, placeholder, clearBtn, url) {
    imgEl.src = url;
    imgEl.classList.remove("hidden");
    placeholder.classList.add("hidden");
    clearBtn.classList.remove("hidden");
    updateGenerateState();
  }

  function hideImg(imgEl, placeholder, clearBtn) {
    imgEl.src = "";
    imgEl.classList.add("hidden");
    placeholder.classList.remove("hidden");
    clearBtn.classList.add("hidden");
    updateGenerateState();
  }

  setupCard(faceCard, faceUpload, faceImg, facePlaceholder, clearFaceBtn, (url) => { faceDataURL = url; });
  setupCard(clothingCard, clothingUpload, clothingImg, clothPlaceholder, clearClothingBtn, (url) => { clothingDataURL = url; });

  // ---- Generate state ----
  function updateGenerateState() {
    const ready = faceDataURL && clothingDataURL && getApiKey();
    generateBtn.disabled = !ready;

    if (!getApiKey()) {
      generateHint.textContent = "Enter your fal.ai API key above";
    } else if (!faceDataURL && !clothingDataURL) {
      generateHint.textContent = "Upload a face photo and a clothing item";
    } else if (!faceDataURL) {
      generateHint.textContent = "Upload a photo of your face";
    } else if (!clothingDataURL) {
      generateHint.textContent = "Upload a clothing item";
    } else {
      generateHint.textContent = "Ready";
    }
  }

  // ---- Generate ----
  generateBtn.addEventListener("click", () => {
    if (generateBtn.disabled) return;
    runPipeline();
  });

  async function pollForResult(apiKey, requestId, model) {
    while (true) {
      await new Promise((r) => setTimeout(r, 3000));
      const pollRes = await fetch("/api/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, requestId, model }),
      });

      const pollText = await pollRes.text();
      let pollData;
      try { pollData = JSON.parse(pollText); } catch {
        throw new Error("Server error: " + pollText.slice(0, 200));
      }
      if (!pollRes.ok) throw new Error(pollData.error || "Polling failed");

      if (pollData.status === "COMPLETED") {
        return pollData.imageUrl;
      }
      // IN_QUEUE or IN_PROGRESS — keep polling
    }
  }

  async function runPipeline() {
    loadingSection.classList.remove("hidden");
    resultSection.classList.add("hidden");
    errorSection.classList.add("hidden");
    generateBtn.disabled = true;

    const apiKey = getApiKey();

    try {
      // Step 1: Submit mannequin generation
      loadingStatus.textContent = "Submitting mannequin generation...";

      const mannequinRes = await fetch("/api/mannequin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          faceImg: faceDataURL,
          heightFt: heightFt.value,
          heightIn: heightIn.value,
          weightLbs: weightInput.value,
          bodyType: bodyTypeSelect.value,
          gender: genderSelect.value,
        }),
      });

      const mannequinText = await mannequinRes.text();
      let mannequinData;
      try { mannequinData = JSON.parse(mannequinText); } catch {
        throw new Error("Server error: " + mannequinText.slice(0, 200));
      }
      if (!mannequinRes.ok) throw new Error(mannequinData.error || "Mannequin generation failed");

      // Poll for mannequin result
      loadingStatus.textContent = "Generating your mannequin (this may take a minute)...";
      const mannequinUrl = await pollForResult(apiKey, mannequinData.request_id, mannequinData.model);
      if (!mannequinUrl) throw new Error("No mannequin image returned");

      // Step 2: Submit clothing try-on
      loadingStatus.textContent = "Submitting clothing try-on...";

      const tryonRes = await fetch("/api/tryon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          mannequinUrl,
          clothingImg: clothingDataURL,
          clothType: clothTypeSelect.value,
          numImages: parseInt(numImagesSelect.value),
        }),
      });

      const tryonText = await tryonRes.text();
      let tryonData;
      try { tryonData = JSON.parse(tryonText); } catch {
        throw new Error("Server error: " + tryonText.slice(0, 200));
      }
      if (!tryonRes.ok) throw new Error(tryonData.error || "Try-on generation failed");

      // Poll for all try-on results
      loadingStatus.textContent = "Applying clothing (this may take a minute)...";
      const outputs = await Promise.all(
        tryonData.request_ids.map((id) => pollForResult(apiKey, id, tryonData.model))
      );

      const validOutputs = outputs.filter(Boolean);
      if (validOutputs.length === 0) throw new Error("No results returned");

      resultImages = validOutputs;
      selectedIndex = 0;
      renderGallery();

      loadingSection.classList.add("hidden");
      resultSection.classList.remove("hidden");

    } catch (err) {
      loadingSection.classList.add("hidden");
      errorSection.classList.remove("hidden");
      errorText.textContent = err.message;
    } finally {
      updateGenerateState();
    }
  }

  // ---- Gallery ----
  function renderGallery() {
    resultGallery.innerHTML = "";
    resultImages.forEach((url, i) => {
      const item = document.createElement("div");
      item.className = "gallery-item" + (i === selectedIndex ? " selected" : "");
      item.addEventListener("click", () => {
        selectedIndex = i;
        updateSelection();
      });

      const img = document.createElement("img");
      img.src = url;
      img.alt = `Result ${i + 1}`;

      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = i + 1;

      item.appendChild(img);
      item.appendChild(badge);
      resultGallery.appendChild(item);
    });
  }

  function updateSelection() {
    resultGallery.querySelectorAll(".gallery-item").forEach((el, i) => {
      el.classList.toggle("selected", i === selectedIndex);
    });
  }

  // ---- Downloads ----
  downloadBtn.addEventListener("click", () => {
    if (!resultImages[selectedIndex]) return;
    dl(resultImages[selectedIndex], `tryon-${selectedIndex + 1}.png`);
  });

  downloadAllBtn.addEventListener("click", () => {
    resultImages.forEach((url, i) => dl(url, `tryon-${i + 1}.png`));
  });

  function dl(href, name) {
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.click();
  }

  // ---- Try again / dismiss ----
  tryAgainBtn.addEventListener("click", () => {
    resultSection.classList.add("hidden");
    resultImages = [];
    selectedIndex = 0;
  });

  dismissErrorBtn.addEventListener("click", () => {
    errorSection.classList.add("hidden");
  });

  // ---- Init ----
  loadSavedKey();
  updateGenerateState();
})();
