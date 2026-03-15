(() => {
  /* ── Prevent double-injection ── */
  if (window.__fibExtLoaded) return;
  window.__fibExtLoaded = true;

  /* ── Constants ── */
  const ASPECT = 1280 / 792; // width / height from the spiral image

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

  /* ── Spiral image URL ── */
  const spiralSrc = chrome.runtime.getURL("icons/Fibonacci-spiral.png");

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
  previewImg.src = spiralSrc;
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
    if (dragging && dragTarget) {
      dragTarget.style.left = (e.pageX - dragOffsetX) + "px";
      dragTarget.style.top = (e.pageY - dragOffsetY) + "px";
      e.preventDefault();
      return;
    }

    if (resizing && resizeTarget) {
      const dx = e.pageX - resizeStartX;
      const dy = e.pageY - resizeStartY;
      // Use larger delta, lock aspect ratio
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

  /* ── Create a spiral ── */
  function createSpiral(x, y, w, h, mirrored) {
    const container = document.createElement("div");
    container.className = "fib-spiral-container " + (darkMode ? "fib-dark" : "fib-light");
    container.style.left = x + "px";
    container.style.top = y + "px";
    container.style.width = w + "px";
    container.style.height = h + "px";

    const img = document.createElement("img");
    img.src = spiralSrc;
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

    /* Edit menu (bottom-right, outside) */
    const menu = document.createElement("div");
    menu.className = "fib-edit-menu";

    const btnRotateCW = document.createElement("button");
    btnRotateCW.textContent = "↻ 90°";
    btnRotateCW.title = "Rotate 90° clockwise";
    btnRotateCW.addEventListener("click", (e) => {
      e.stopPropagation();
      const current = parseInt(img.dataset.rotation || "0");
      const next = (current + 90) % 360;
      img.dataset.rotation = next;
      updateImgTransform(img);
    });

    const btnRotateCCW = document.createElement("button");
    btnRotateCCW.textContent = "↺ 90°";
    btnRotateCCW.title = "Rotate 90° counter-clockwise";
    btnRotateCCW.addEventListener("click", (e) => {
      e.stopPropagation();
      const current = parseInt(img.dataset.rotation || "0");
      const next = (current - 90 + 360) % 360;
      img.dataset.rotation = next;
      updateImgTransform(img);
    });

    const btnMirrorSpiral = document.createElement("button");
    btnMirrorSpiral.textContent = "↔ Mirror";
    btnMirrorSpiral.title = "Mirror this spiral";
    btnMirrorSpiral.addEventListener("click", (e) => {
      e.stopPropagation();
      img.dataset.mirrored = img.dataset.mirrored === "1" ? "0" : "1";
      updateImgTransform(img);
    });

    menu.appendChild(btnRotateCCW);
    menu.appendChild(btnRotateCW);
    menu.appendChild(btnMirrorSpiral);
    container.appendChild(menu);

    // Init transform data
    img.dataset.rotation = "0";
    img.dataset.mirrored = mirrored ? "1" : "0";

    document.documentElement.appendChild(container);
  }

  /* ── Update image transform from data attributes ── */
  function updateImgTransform(img) {
    const rot = parseInt(img.dataset.rotation || "0");
    const mir = img.dataset.mirrored === "1";
    let transform = "";
    if (mir) transform += "scaleX(-1) ";
    if (rot) transform += `rotate(${rot}deg)`;
    img.style.transform = transform.trim() || "";
  }
})();
