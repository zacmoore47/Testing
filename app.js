// ============================================================
// Virtual Try-On App
// ============================================================

(() => {
  "use strict";

  // ---- State ----
  const state = {
    selfieImg: null,       // HTMLImageElement of user photo
    items: [],             // { id, img, x, y, w, h, rot, flipH, flipV, opacity, visible, name }
    selectedId: null,
    dragging: false,
    dragOffX: 0,
    dragOffY: 0,
    nextId: 1,
    canvasScale: 1,        // ratio of display size to internal size
  };

  // ---- DOM refs ----
  const $ = (sel) => document.querySelector(sel);
  const landing   = $("#landing");
  const editor    = $("#editor");
  const canvas    = $("#tryonCanvas");
  const ctx       = canvas.getContext("2d");
  const container = $("#canvas-container");

  // Landing
  const selfieUpload  = $("#selfie-upload");
  const webcamBtn     = $("#webcam-btn");
  const webcamModal   = $("#webcam-modal");
  const webcamVideo   = $("#webcam-video");
  const captureBtn    = $("#capture-btn");
  const cancelWebcam  = $("#cancel-webcam-btn");

  // Sidebar
  const clothingUpload = $("#clothing-upload");
  const clothingDrop   = $("#clothing-drop-zone");
  const urlUploadBtn   = $("#url-upload-btn");
  const urlInputArea   = $("#url-input-area");
  const urlInput       = $("#url-input");
  const urlSubmit      = $("#url-submit");
  const clothingList   = $("#clothing-list");

  // Toolbar
  const itemTools    = $("#item-tools");
  const hintText     = $("#hint-text");
  const selectedLabel = $("#selected-label");
  const flipHBtn     = $("#flip-h-btn");
  const flipVBtn     = $("#flip-v-btn");
  const bringFront   = $("#bring-front-btn");
  const sendBack     = $("#send-back-btn");
  const opacitySlider = $("#opacity-slider");
  const deleteBtn    = $("#delete-btn");
  const downloadBtn  = $("#download-btn");
  const backBtn      = $("#back-btn");

  // ---- Helpers ----
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = src;
    });
  }

  function fileToDataURL(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
  }

  function getSelected() {
    return state.items.find((i) => i.id === state.selectedId) || null;
  }

  // Convert mouse event to canvas-internal coords
  function toCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / state.canvasScale,
      y: (e.clientY - rect.top) / state.canvasScale,
    };
  }

  // Hit test: check if point is inside a (possibly rotated) item
  function hitTest(item, px, py) {
    // Transform point into item-local coords
    const cx = item.x + item.w / 2;
    const cy = item.y + item.h / 2;
    const rad = (-item.rot * Math.PI) / 180;
    const dx = px - cx;
    const dy = py - cy;
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
    return (
      Math.abs(lx) <= item.w / 2 &&
      Math.abs(ly) <= item.h / 2
    );
  }

  // ---- Rendering ----
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw selfie
    if (state.selfieImg) {
      ctx.drawImage(state.selfieImg, 0, 0, canvas.width, canvas.height);
    }

    // Draw clothing items
    for (const item of state.items) {
      if (!item.visible) continue;
      ctx.save();
      ctx.globalAlpha = item.opacity;
      const cx = item.x + item.w / 2;
      const cy = item.y + item.h / 2;
      ctx.translate(cx, cy);
      ctx.rotate((item.rot * Math.PI) / 180);
      ctx.scale(item.flipH ? -1 : 1, item.flipV ? -1 : 1);
      ctx.drawImage(item.img, -item.w / 2, -item.h / 2, item.w, item.h);

      // Selection outline
      if (item.id === state.selectedId) {
        ctx.strokeStyle = "#6c5ce7";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.strokeRect(-item.w / 2, -item.h / 2, item.w, item.h);
        ctx.setLineDash([]);

        // Corner handles
        const hs = 8;
        ctx.fillStyle = "#6c5ce7";
        for (const [hx, hy] of [
          [-item.w / 2, -item.h / 2],
          [item.w / 2, -item.h / 2],
          [-item.w / 2, item.h / 2],
          [item.w / 2, item.h / 2],
        ]) {
          ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
        }
      }
      ctx.restore();
    }
  }

  function resizeCanvas() {
    if (!state.selfieImg) return;
    const imgW = state.selfieImg.naturalWidth;
    const imgH = state.selfieImg.naturalHeight;
    canvas.width = imgW;
    canvas.height = imgH;

    // Fit to container
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const scale = Math.min(cw / imgW, ch / imgH, 1);
    canvas.style.width = imgW * scale + "px";
    canvas.style.height = imgH * scale + "px";
    state.canvasScale = scale;
    render();
  }

  // ---- Sidebar list ----
  function refreshSidebar() {
    clothingList.innerHTML = "";
    for (const item of state.items) {
      const div = document.createElement("div");
      div.className = "clothing-item" + (item.id === state.selectedId ? " selected" : "");
      div.innerHTML = `
        <img src="${item.img.src}" alt="${item.name}">
        <div class="item-info">
          <div class="item-name">${item.name}</div>
          <div class="item-meta">Opacity: ${Math.round(item.opacity * 100)}%</div>
        </div>
        <button class="item-visibility" title="Toggle visibility">${item.visible ? "👁" : "🚫"}</button>
      `;
      div.addEventListener("click", (e) => {
        if (e.target.closest(".item-visibility")) {
          item.visible = !item.visible;
          refreshSidebar();
          render();
          return;
        }
        selectItem(item.id);
      });
      clothingList.appendChild(div);
    }
    updateToolbar();
  }

  function updateToolbar() {
    const sel = getSelected();
    if (sel) {
      itemTools.style.display = "flex";
      hintText.style.display = "none";
      selectedLabel.textContent = "Selected: " + sel.name;
      opacitySlider.value = sel.opacity * 100;
    } else {
      itemTools.style.display = "none";
      hintText.style.display = "flex";
    }
  }

  function selectItem(id) {
    state.selectedId = id;
    refreshSidebar();
    render();
  }

  // ---- Add clothing item ----
  async function addClothingImage(imgSrc, name) {
    try {
      const img = await loadImage(imgSrc);
      // Size clothing to ~40% of canvas width initially
      const targetW = canvas.width * 0.4;
      const scale = targetW / img.naturalWidth;
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;

      const item = {
        id: state.nextId++,
        img,
        x: (canvas.width - w) / 2,
        y: (canvas.height - h) / 2,
        w,
        h,
        rot: 0,
        flipH: false,
        flipV: false,
        opacity: 1,
        visible: true,
        name: name || "Item " + (state.items.length + 1),
      };
      state.items.push(item);
      selectItem(item.id);
    } catch (err) {
      alert("Could not load image: " + err.message);
    }
  }

  // ---- Screen transitions ----
  function showEditor() {
    landing.classList.remove("active");
    editor.classList.add("active");
    resizeCanvas();
  }

  function showLanding() {
    editor.classList.remove("active");
    landing.classList.add("active");
    state.selfieImg = null;
    state.items = [];
    state.selectedId = null;
    state.nextId = 1;
    clothingList.innerHTML = "";
  }

  // ---- Selfie upload ----
  selfieUpload.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = await fileToDataURL(file);
    state.selfieImg = await loadImage(url);
    showEditor();
    selfieUpload.value = "";
  });

  // ---- Webcam ----
  let webcamStream = null;

  webcamBtn.addEventListener("click", async () => {
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } } });
      webcamVideo.srcObject = webcamStream;
      webcamModal.classList.remove("hidden");
    } catch {
      alert("Could not access webcam. Please upload a photo instead.");
    }
  });

  captureBtn.addEventListener("click", () => {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = webcamVideo.videoWidth;
    tempCanvas.height = webcamVideo.videoHeight;
    const tCtx = tempCanvas.getContext("2d");
    // Mirror the capture to match the preview
    tCtx.translate(tempCanvas.width, 0);
    tCtx.scale(-1, 1);
    tCtx.drawImage(webcamVideo, 0, 0);
    stopWebcam();
    const url = tempCanvas.toDataURL("image/jpeg", 0.92);
    loadImage(url).then((img) => {
      state.selfieImg = img;
      showEditor();
    });
  });

  cancelWebcam.addEventListener("click", stopWebcam);

  function stopWebcam() {
    if (webcamStream) {
      webcamStream.getTracks().forEach((t) => t.stop());
      webcamStream = null;
    }
    webcamVideo.srcObject = null;
    webcamModal.classList.add("hidden");
  }

  // ---- Clothing upload ----
  clothingUpload.addEventListener("change", async (e) => {
    for (const file of e.target.files) {
      const url = await fileToDataURL(file);
      await addClothingImage(url, file.name.replace(/\.[^.]+$/, ""));
    }
    clothingUpload.value = "";
  });

  // Drag & drop on drop zone
  clothingDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    clothingDrop.classList.add("drag-over");
  });
  clothingDrop.addEventListener("dragleave", () => {
    clothingDrop.classList.remove("drag-over");
  });
  clothingDrop.addEventListener("drop", async (e) => {
    e.preventDefault();
    clothingDrop.classList.remove("drag-over");
    // Check for image URL from dragged web images
    const html = e.dataTransfer.getData("text/html");
    const urlText = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");

    if (e.dataTransfer.files.length) {
      for (const file of e.dataTransfer.files) {
        if (!file.type.startsWith("image/")) continue;
        const url = await fileToDataURL(file);
        await addClothingImage(url, file.name.replace(/\.[^.]+$/, ""));
      }
    } else if (html) {
      // Extract img src from dragged HTML
      const match = html.match(/<img[^>]+src="([^"]+)"/i);
      if (match) await addClothingImage(match[1], "Dragged Image");
    } else if (urlText && /^https?:\/\/.+/i.test(urlText)) {
      await addClothingImage(urlText, "Linked Image");
    }
  });

  // Paste from clipboard (global)
  document.addEventListener("paste", async (e) => {
    if (!editor.classList.contains("active")) return;
    // Check for pasted images
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        const url = await fileToDataURL(file);
        await addClothingImage(url, "Pasted Image");
        return;
      }
    }
    // Check for pasted URL text
    const text = e.clipboardData.getData("text/plain");
    if (text && /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg)/i.test(text.trim())) {
      await addClothingImage(text.trim(), "Pasted URL");
    }
  });

  // URL input
  urlUploadBtn.addEventListener("click", () => {
    urlInputArea.classList.toggle("hidden");
    if (!urlInputArea.classList.contains("hidden")) urlInput.focus();
  });

  urlSubmit.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) return;
    await addClothingImage(url, "Web Image");
    urlInput.value = "";
    urlInputArea.classList.add("hidden");
  });

  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") urlSubmit.click();
  });

  // ---- Canvas interactions ----

  // Click to select / deselect
  canvas.addEventListener("mousedown", (e) => {
    const { x, y } = toCanvasCoords(e);
    // Check items in reverse order (top-most first)
    let found = null;
    for (let i = state.items.length - 1; i >= 0; i--) {
      const item = state.items[i];
      if (item.visible && hitTest(item, x, y)) {
        found = item;
        break;
      }
    }
    if (found) {
      selectItem(found.id);
      state.dragging = true;
      state.dragOffX = x - found.x;
      state.dragOffY = y - found.y;
      canvas.style.cursor = "grabbing";
    } else {
      selectItem(null);
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!state.dragging) return;
    const sel = getSelected();
    if (!sel) return;
    const { x, y } = toCanvasCoords(e);
    sel.x = x - state.dragOffX;
    sel.y = y - state.dragOffY;
    render();
  });

  canvas.addEventListener("mouseup", () => {
    state.dragging = false;
    canvas.style.cursor = "default";
  });

  canvas.addEventListener("mouseleave", () => {
    state.dragging = false;
    canvas.style.cursor = "default";
  });

  // Scroll to resize, Shift+scroll to rotate
  canvas.addEventListener("wheel", (e) => {
    const sel = getSelected();
    if (!sel) return;
    e.preventDefault();

    if (e.shiftKey) {
      // Rotate
      sel.rot += e.deltaY > 0 ? 5 : -5;
    } else {
      // Resize (maintain aspect ratio)
      const factor = e.deltaY > 0 ? 0.95 : 1.05;
      const oldW = sel.w;
      const oldH = sel.h;
      sel.w *= factor;
      sel.h *= factor;
      // Keep centered
      sel.x -= (sel.w - oldW) / 2;
      sel.y -= (sel.h - oldH) / 2;
    }
    render();
    refreshSidebar();
  }, { passive: false });

  // Touch support for mobile
  let lastTouchDist = 0;
  let lastTouchAngle = 0;
  let touchStartX = 0;
  let touchStartY = 0;

  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const { x, y } = toCanvasCoords(touch);
      let found = null;
      for (let i = state.items.length - 1; i >= 0; i--) {
        const item = state.items[i];
        if (item.visible && hitTest(item, x, y)) {
          found = item;
          break;
        }
      }
      if (found) {
        selectItem(found.id);
        state.dragging = true;
        state.dragOffX = x - found.x;
        state.dragOffY = y - found.y;
        e.preventDefault();
      } else {
        selectItem(null);
      }
    }
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist = Math.sqrt(dx * dx + dy * dy);
      lastTouchAngle = Math.atan2(dy, dx);
      e.preventDefault();
    }
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    const sel = getSelected();
    if (!sel) return;

    if (e.touches.length === 1 && state.dragging) {
      const touch = e.touches[0];
      const { x, y } = toCanvasCoords(touch);
      sel.x = x - state.dragOffX;
      sel.y = y - state.dragOffY;
      render();
      e.preventDefault();
    }

    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      // Pinch to resize
      const scaleFactor = dist / lastTouchDist;
      const oldW = sel.w;
      const oldH = sel.h;
      sel.w *= scaleFactor;
      sel.h *= scaleFactor;
      sel.x -= (sel.w - oldW) / 2;
      sel.y -= (sel.h - oldH) / 2;

      // Two-finger rotate
      const angleDiff = ((angle - lastTouchAngle) * 180) / Math.PI;
      sel.rot += angleDiff;

      lastTouchDist = dist;
      lastTouchAngle = angle;
      render();
      refreshSidebar();
      e.preventDefault();
    }
  }, { passive: false });

  canvas.addEventListener("touchend", () => {
    state.dragging = false;
  });

  // ---- Toolbar actions ----
  flipHBtn.addEventListener("click", () => {
    const sel = getSelected();
    if (sel) { sel.flipH = !sel.flipH; render(); }
  });

  flipVBtn.addEventListener("click", () => {
    const sel = getSelected();
    if (sel) { sel.flipV = !sel.flipV; render(); }
  });

  bringFront.addEventListener("click", () => {
    const sel = getSelected();
    if (!sel) return;
    state.items = state.items.filter((i) => i !== sel);
    state.items.push(sel);
    refreshSidebar();
    render();
  });

  sendBack.addEventListener("click", () => {
    const sel = getSelected();
    if (!sel) return;
    state.items = state.items.filter((i) => i !== sel);
    state.items.unshift(sel);
    refreshSidebar();
    render();
  });

  opacitySlider.addEventListener("input", () => {
    const sel = getSelected();
    if (sel) {
      sel.opacity = opacitySlider.value / 100;
      render();
      refreshSidebar();
    }
  });

  deleteBtn.addEventListener("click", () => {
    const sel = getSelected();
    if (!sel) return;
    state.items = state.items.filter((i) => i !== sel);
    state.selectedId = null;
    refreshSidebar();
    render();
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (!editor.classList.contains("active")) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    const sel = getSelected();
    if (!sel) return;

    const step = e.shiftKey ? 10 : 2;

    switch (e.key) {
      case "Delete":
      case "Backspace":
        deleteBtn.click();
        break;
      case "ArrowLeft":
        sel.x -= step;
        render();
        e.preventDefault();
        break;
      case "ArrowRight":
        sel.x += step;
        render();
        e.preventDefault();
        break;
      case "ArrowUp":
        sel.y -= step;
        render();
        e.preventDefault();
        break;
      case "ArrowDown":
        sel.y += step;
        render();
        e.preventDefault();
        break;
      case "[":
        sel.rot -= 5;
        render();
        break;
      case "]":
        sel.rot += 5;
        render();
        break;
    }
  });

  // ---- Download ----
  downloadBtn.addEventListener("click", () => {
    // Deselect to hide outline
    const prevSel = state.selectedId;
    state.selectedId = null;
    render();

    const link = document.createElement("a");
    link.download = "virtual-tryon.png";
    link.href = canvas.toDataURL("image/png");
    link.click();

    state.selectedId = prevSel;
    render();
  });

  // ---- Back button ----
  backBtn.addEventListener("click", showLanding);

  // ---- Resize handling ----
  window.addEventListener("resize", resizeCanvas);

  // ---- Allow drop on canvas too ----
  container.addEventListener("dragover", (e) => e.preventDefault());
  container.addEventListener("drop", async (e) => {
    e.preventDefault();
    const html = e.dataTransfer.getData("text/html");
    const urlText = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");

    if (e.dataTransfer.files.length) {
      for (const file of e.dataTransfer.files) {
        if (!file.type.startsWith("image/")) continue;
        const url = await fileToDataURL(file);
        await addClothingImage(url, file.name.replace(/\.[^.]+$/, ""));
      }
    } else if (html) {
      const match = html.match(/<img[^>]+src="([^"]+)"/i);
      if (match) await addClothingImage(match[1], "Dragged Image");
    } else if (urlText && /^https?:\/\/.+/i.test(urlText)) {
      await addClothingImage(urlText, "Linked Image");
    }
  });
})();
