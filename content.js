(() => {
  /* ── Prevent double-injection ── */
  if (window.__fibExtLoaded) return;
  window.__fibExtLoaded = true;

  /* ── Constants ── */
  const ASPECT = 233.60574 / 144.81508; // width / height from the SVG viewBox

  /* ── State ── */
  let active = false;
  let darkMode = false;
  let drawing = false;
  let resizing = false;
  let startX = 0;
  let startY = 0;
  let resizeTarget = null;
  let resizeStartW = 0;
  let resizeStartH = 0;
  let resizeStartX = 0;
  let resizeStartY = 0;
  let editingSpiral = null;
  let dragging = false;
  let dragTarget = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let svgTemplate = ""; // raw SVG text, loaded once
  let rotating = false;
  let rotateTarget = null;
  let rotateStartAngle = 0;
  let rotateCurrentAngle = 0;

  /* ── Spiral image URLs ── */
  const svgSrc = chrome.runtime.getURL("icons/fibseq.svg");
  const previewSrc = chrome.runtime.getURL("icons/fibseq.svg");

  /* ── Load SVG template ── */
  fetch(svgSrc)
    .then((r) => r.text())
    .then((text) => {
      svgTemplate = text;
    });

  /* ── Page tint overlay ── */
  const tint = document.createElement("div");
  tint.id = "fib-tint";
  document.documentElement.appendChild(tint);

  /* ── Build toolbar ── */
  const toolbar = document.createElement("div");
  toolbar.id = "fib-toolbar";
  toolbar.className = "fib-light";
  toolbar.innerHTML = `
    <span class="fib-status">Fibonacci</span>
    <button id="fib-btn-mirror" title="Mirror next spiral">Mirror</button>
    <button id="fib-btn-theme" title="Toggle dark / light mode">Dark</button>
    <button id="fib-btn-clear" title="Remove all spirals">Clear All</button>
    <button id="fib-btn-close" title="Deactivate overlay">✕</button>
  `;
  document.documentElement.appendChild(toolbar);

  /* ── Draw preview with spiral image ── */
  const preview = document.createElement("div");
  preview.id = "fib-draw-preview";
  const previewImg = document.createElement("img");
  previewImg.src = previewSrc;
  previewImg.draggable = false;
  preview.appendChild(previewImg);
  document.documentElement.appendChild(preview);

  /* ── Mirror state ── */
  let mirrorOn = false;
  const btnMirror = toolbar.querySelector("#fib-btn-mirror");
  btnMirror.addEventListener("click", () => {
    mirrorOn = !mirrorOn;
    btnMirror.textContent = mirrorOn ? "Mirror ✓" : "Mirror";
  });

  /* ── Theme toggle ── */
  const btnTheme = toolbar.querySelector("#fib-btn-theme");
  btnTheme.addEventListener("click", () => {
    darkMode = !darkMode;
    applyTheme();
  });

  function applyTheme() {
    toolbar.className = darkMode ? "fib-dark visible" : "fib-light visible";
    btnTheme.textContent = darkMode ? "Light" : "Dark";
    document.querySelectorAll(".fib-spiral-container").forEach((el) => {
      el.classList.toggle("fib-dark", darkMode);
      el.classList.toggle("fib-light", !darkMode);
    });
  }

  /* ── Clear all ── */
  toolbar.querySelector("#fib-btn-clear").addEventListener("click", () => {
    clearEditing();
    document.querySelectorAll(".fib-spiral-container").forEach((el) => el.remove());
  });

  /* ── Close ── */
  toolbar.querySelector("#fib-btn-close").addEventListener("click", () => {
    deactivate();
  });

  /* ── Activate / Deactivate ── */
  function activate() {
    active = true;
    toolbar.classList.add("visible");
    tint.classList.add("visible");
    document.body.classList.add("fib-drawing-mode");
  }

  function deactivate() {
    active = false;
    drawing = false;
    resizing = false;
    clearEditing();
    preview.style.display = "none";
    toolbar.classList.remove("visible");
    tint.classList.remove("visible");
    document.body.classList.remove("fib-drawing-mode");
  }

  /* ── Edit mode ── */
  function clearEditing() {
    if (editingSpiral) {
      editingSpiral.classList.remove("fib-editing");
      editingSpiral = null;
    }
  }

  function setEditing(container) {
    if (editingSpiral === container) return;
    clearEditing();
    editingSpiral = container;
    container.classList.add("fib-editing");
  }

  /* ── Listen for toggle from background ── */
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "toggle") {
      active ? deactivate() : activate();
    }
  });

  /* ── Compute proportional size from drag distance ── */
  function getProportionalRect(ex, ey) {
    const dx = ex - startX;
    const dy = ey - startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    let w, h;
    if (absDx / ASPECT >= absDy) {
      w = absDx;
      h = absDx / ASPECT;
    } else {
      h = absDy;
      w = absDy * ASPECT;
    }
    const x = dx >= 0 ? startX : startX - w;
    const y = dy >= 0 ? startY : startY - h;
    return { x, y, w, h };
  }

  /* ── Drawing handlers ── */
  document.addEventListener("mousedown", (e) => {
    if (!active || e.button !== 0) return;
    if (toolbar.contains(e.target)) return;

    // Check if clicking the rotate handle
    if (e.target.classList.contains("fib-rotate-handle")) {
      rotating = true;
      rotateTarget = e.target.closest(".fib-spiral-container");
      const rect = rotateTarget.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const mouseAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
      rotateCurrentAngle = parseFloat(rotateTarget.dataset.rotation || "0");
      rotateStartAngle = mouseAngle - rotateCurrentAngle;
      e.preventDefault();
      return;
    }

    // Check if clicking a resize handle
    if (e.target.classList.contains("fib-resize-handle")) {
      resizing = true;
      resizeTarget = e.target.closest(".fib-spiral-container");
      resizeStartW = parseFloat(resizeTarget.style.width);
      resizeStartH = parseFloat(resizeTarget.style.height);
      resizeStartX = e.pageX;
      resizeStartY = e.pageY;
      e.preventDefault();
      return;
    }

    // Check if clicking on a spiral container (enter edit mode + start drag)
    const spiralEl = e.target.closest(".fib-spiral-container");
    if (spiralEl) {
      // Don't drag if clicking edit menu buttons
      if (e.target.closest(".fib-edit-menu") || e.target.closest(".fib-delete-btn")) return;
      setEditing(spiralEl);
      dragging = true;
      dragTarget = spiralEl;
      dragOffsetX = e.pageX - parseFloat(spiralEl.style.left);
      dragOffsetY = e.pageY - parseFloat(spiralEl.style.top);
      e.preventDefault();
      return;
    }

    // Clicking on empty space — clear edit mode and start drawing
    clearEditing();
    drawing = true;
    startX = e.pageX;
    startY = e.pageY;
    preview.style.display = "block";
    preview.style.left = startX + "px";
    preview.style.top = startY + "px";
    preview.style.width = "0px";
    preview.style.height = "0px";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (rotating && rotateTarget) {
      const rect = rotateTarget.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      let angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI) - rotateStartAngle;
      // Snap to 15° increments when Ctrl is held
      if (e.ctrlKey) {
        angle = Math.round(angle / 15) * 15;
      }
      rotateCurrentAngle = angle;
      rotateTarget.dataset.rotation = angle;
      updateContainerTransform(rotateTarget);
      e.preventDefault();
      return;
    }

    if (dragging && dragTarget) {
      dragTarget.style.left = (e.pageX - dragOffsetX) + "px";
      dragTarget.style.top = (e.pageY - dragOffsetY) + "px";
      e.preventDefault();
      return;
    }

    if (resizing && resizeTarget) {
      const dx = e.pageX - resizeStartX;
      const dy = e.pageY - resizeStartY;
      let newW, newH;
      if (Math.abs(dx) / ASPECT >= Math.abs(dy)) {
        newW = Math.max(30, resizeStartW + dx);
        newH = newW / ASPECT;
      } else {
        newH = Math.max(20, resizeStartH + dy);
        newW = newH * ASPECT;
      }
      resizeTarget.style.width = newW + "px";
      resizeTarget.style.height = newH + "px";
      e.preventDefault();
      return;
    }

    if (!drawing) return;
    const { x, y, w, h } = getProportionalRect(e.pageX, e.pageY);
    preview.style.left = x + "px";
    preview.style.top = y + "px";
    preview.style.width = w + "px";
    preview.style.height = h + "px";
    e.preventDefault();
  });

  document.addEventListener("mouseup", (e) => {
    if (rotating) {
      rotating = false;
      rotateTarget = null;
      e.preventDefault();
      return;
    }

    if (dragging) {
      dragging = false;
      dragTarget = null;
      e.preventDefault();
      return;
    }

    if (resizing) {
      resizing = false;
      resizeTarget = null;
      e.preventDefault();
      return;
    }

    if (!drawing) return;
    drawing = false;
    preview.style.display = "none";

    const { x, y, w, h } = getProportionalRect(e.pageX, e.pageY);
    if (w < 30 || h < 20) return;

    createSpiral(x, y, w, h, mirrorOn);
    e.preventDefault();
  });

  /* ── Colorize SVG text ── */
  function colorizeSvg(color) {
    // Replace all stroke:#000000 and fill:#000000 with the chosen color
    return svgTemplate
      .replace(/stroke:#000000/g, "stroke:" + color)
      .replace(/fill:#000000/g, "fill:" + color);
  }

  function svgToDataUrl(svgText) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
  }

  /* ── Create a spiral ── */
  function createSpiral(x, y, w, h, mirrored) {
    const container = document.createElement("div");
    container.className = "fib-spiral-container " + (darkMode ? "fib-dark" : "fib-light");
    container.style.left = x + "px";
    container.style.top = y + "px";
    container.style.width = w + "px";
    container.style.height = h + "px";

    const currentColor = "#000000";
    container.dataset.spiralColor = currentColor;
    container.dataset.mirrored = mirrored ? "1" : "0";
    container.dataset.rotation = "0";

    const img = document.createElement("img");
    img.className = "fib-spiral-img";
    img.src = svgToDataUrl(colorizeSvg(currentColor));
    img.draggable = false;
    if (mirrored) {
      img.style.transform = "scaleX(-1)";
    }
    container.appendChild(img);

    /* Delete button (red X, top-right) */
    const btnDelete = document.createElement("button");
    btnDelete.className = "fib-delete-btn";
    btnDelete.textContent = "✕";
    btnDelete.title = "Delete this spiral";
    btnDelete.addEventListener("click", (e) => {
      e.stopPropagation();
      if (editingSpiral === container) clearEditing();
      container.remove();
    });
    container.appendChild(btnDelete);

    /* Resize handle (bottom-right) */
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "fib-resize-handle";
    container.appendChild(resizeHandle);

    /* Rotate handle (top-center) */
    const rotateHandleEl = document.createElement("div");
    rotateHandleEl.className = "fib-rotate-handle";
    container.appendChild(rotateHandleEl);

    /* Edit menu (bottom-right, outside) */
    const menu = document.createElement("div");
    menu.className = "fib-edit-menu";

    /* Single rotate button — 90° CW icon only */
    const btnRotate = document.createElement("button");
    btnRotate.textContent = "↻";
    btnRotate.title = "Rotate 90° clockwise";
    btnRotate.addEventListener("click", (e) => {
      e.stopPropagation();
      const current = parseFloat(container.dataset.rotation || "0");
      container.dataset.rotation = current + 90;
      updateContainerTransform(container);
    });

    /* Mirror button — text only, no icon */
    const btnMirrorSpiral = document.createElement("button");
    btnMirrorSpiral.textContent = "Mirror";
    btnMirrorSpiral.title = "Mirror this spiral";
    btnMirrorSpiral.addEventListener("click", (e) => {
      e.stopPropagation();
      container.dataset.mirrored = container.dataset.mirrored === "1" ? "0" : "1";
      const mirrd = container.dataset.mirrored === "1";
      img.style.transform = mirrd ? "scaleX(-1)" : "";
    });

    /* Color picker */
    const colorLabel = document.createElement("label");
    colorLabel.className = "fib-color-label";
    colorLabel.title = "Change spiral color";
    colorLabel.textContent = "Color";

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = currentColor;
    colorInput.className = "fib-color-input";
    colorInput.addEventListener("input", (e) => {
      e.stopPropagation();
      const newColor = e.target.value;
      container.dataset.spiralColor = newColor;
      img.src = svgToDataUrl(colorizeSvg(newColor));
    });
    colorInput.addEventListener("click", (e) => e.stopPropagation());

    colorLabel.appendChild(colorInput);

    menu.appendChild(btnRotate);
    menu.appendChild(btnMirrorSpiral);
    menu.appendChild(colorLabel);
    container.appendChild(menu);

    document.documentElement.appendChild(container);
  }

  /* ── Update container rotation transform ── */
  function updateContainerTransform(container) {
    const rot = parseFloat(container.dataset.rotation || "0");
    container.style.transform = rot ? `rotate(${rot}deg)` : "";
  }
})();
