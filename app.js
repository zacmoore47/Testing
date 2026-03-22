// ============================================================
// Virtual Try-On App — AI-Powered via fal.ai (CatVTON)
// ============================================================

(() => {
  "use strict";

  // ---- DOM refs ----
  const $ = (sel) => document.querySelector(sel);

  const apiKeyInput   = $("#api-key-input");
  const saveKeyBtn    = $("#save-key-btn");
  const keyStatus     = $("#key-status");

  const personUpload   = $("#person-upload");
  const clothingUpload = $("#clothing-upload");
  const personCard     = $("#person-card");
  const clothingCard   = $("#clothing-card");
  const personImg      = $("#person-img");
  const clothingImg    = $("#clothing-img");
  const clearPersonBtn = $("#clear-person");
  const clearClothingBtn = $("#clear-clothing");

  const generateBtn   = $("#generate-btn");
  const generateHint  = $("#generate-hint");
  const loadingSection = $("#loading-section");
  const resultSection  = $("#result-section");
  const resultImg      = $("#result-img");
  const downloadBtn    = $("#download-btn");
  const tryAgainBtn    = $("#try-again-btn");
  const errorSection   = $("#error-section");
  const errorText      = $("#error-text");
  const dismissErrorBtn = $("#dismiss-error-btn");

  // ---- State ----
  let personDataURL = null;
  let clothingDataURL = null;

  // ---- API Key Management ----
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
      keyStatus.style.color = "var(--danger)";
      return;
    }
    localStorage.setItem("fal_api_key", key);
    keyStatus.textContent = "Saved";
    keyStatus.style.color = "var(--success)";
    updateGenerateState();
  });

  // ---- File helpers ----
  function fileToDataURL(file) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1024;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          const scale = MAX / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = URL.createObjectURL(file);
    });
  }

  // ---- Upload handling ----
  function setupUploadCard(card, fileInput, imgEl, clearBtn, onLoaded) {
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = await fileToDataURL(file);
      showPreview(card, imgEl, clearBtn, url);
      onLoaded(url);
      fileInput.value = "";
    });

    // Drag & drop
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      card.classList.add("drag-over");
    });
    card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
    card.addEventListener("drop", async (e) => {
      e.preventDefault();
      card.classList.remove("drag-over");
      if (e.dataTransfer.files.length) {
        const file = e.dataTransfer.files[0];
        if (!file.type.startsWith("image/")) return;
        const url = await fileToDataURL(file);
        showPreview(card, imgEl, clearBtn, url);
        onLoaded(url);
      }
    });

    // Clear
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hidePreview(card, imgEl, clearBtn);
      onLoaded(null);
    });
  }

  function showPreview(card, imgEl, clearBtn, url) {
    imgEl.src = url;
    imgEl.classList.remove("hidden");
    clearBtn.classList.remove("hidden");
    card.classList.add("has-image");
    updateGenerateState();
  }

  function hidePreview(card, imgEl, clearBtn) {
    imgEl.src = "";
    imgEl.classList.add("hidden");
    clearBtn.classList.add("hidden");
    card.classList.remove("has-image");
    updateGenerateState();
  }

  setupUploadCard(personCard, personUpload, personImg, clearPersonBtn, (url) => {
    personDataURL = url;
  });

  setupUploadCard(clothingCard, clothingUpload, clothingImg, clearClothingBtn, (url) => {
    clothingDataURL = url;
  });

  // ---- Generate button state ----
  function updateGenerateState() {
    const ready = personDataURL && clothingDataURL && getApiKey();
    generateBtn.disabled = !ready;

    if (!getApiKey()) {
      generateHint.textContent = "Enter your Replicate API key above";
    } else if (!personDataURL && !clothingDataURL) {
      generateHint.textContent = "Upload both images to enable generation";
    } else if (!personDataURL) {
      generateHint.textContent = "Upload a person photo";
    } else if (!clothingDataURL) {
      generateHint.textContent = "Upload a clothing photo";
    } else {
      generateHint.textContent = "Ready to generate!";
    }
  }

  // ---- Generate try-on ----
  generateBtn.addEventListener("click", () => {
    if (!personDataURL || !clothingDataURL || !getApiKey()) return;
    runTryOn();
  });

  async function runTryOn() {
    // Show loading
    loadingSection.classList.remove("hidden");
    resultSection.classList.add("hidden");
    errorSection.classList.add("hidden");
    generateBtn.disabled = true;

    try {
      const apiKey = getApiKey();

      // Call our serverless API route (avoids CORS issues)
      const res = await fetch("/api/tryon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          personImg: personDataURL,
          clothingImg: clothingDataURL,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `API error: ${res.status}`);
      }

      if (!data.output) throw new Error("No output image returned");

      resultImg.src = data.output;
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

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ---- Download result ----
  downloadBtn.addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = "virtual-tryon-result.png";
    link.href = resultImg.src;
    link.click();
  });

  // ---- Try again ----
  tryAgainBtn.addEventListener("click", () => {
    resultSection.classList.add("hidden");
  });

  // ---- Dismiss error ----
  dismissErrorBtn.addEventListener("click", () => {
    errorSection.classList.add("hidden");
  });

  // ---- Init ----
  loadSavedKey();
  updateGenerateState();
})();
