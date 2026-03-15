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
  let startX = 0;
  let startY = 0;

  /* ── Spiral image URL ── */
  const spiralSrc = chrome.runtime.getURL("icons/Fibonacci-spiral.png");

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
    document.body.classList.add("fib-drawing-mode");
  }

  function deactivate() {
    active = false;
    drawing = false;
    preview.style.display = "none";
    toolbar.classList.remove("visible");
    document.body.classList.remove("fib-drawing-mode");
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
    // Use the larger axis to determine size, lock aspect ratio
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
    // Position: anchor at startX/startY, expand in drag direction
    const x = dx >= 0 ? startX : startX - w;
    const y = dy >= 0 ? startY : startY - h;
    return { x, y, w, h };
  }

  /* ── Drawing handlers ── */
  document.addEventListener("mousedown", (e) => {
    if (!active || e.button !== 0) return;
    if (toolbar.contains(e.target)) return;
    if (e.target.closest(".fib-spiral-container")) return;

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
    if (!drawing) return;
    const { x, y, w, h } = getProportionalRect(e.pageX, e.pageY);
    preview.style.left = x + "px";
    preview.style.top = y + "px";
    preview.style.width = w + "px";
    preview.style.height = h + "px";
    e.preventDefault();
  });

  document.addEventListener("mouseup", (e) => {
    if (!drawing) return;
    drawing = false;
    preview.style.display = "none";

    const { x, y, w, h } = getProportionalRect(e.pageX, e.pageY);

    if (w < 30 || h < 20) return; // too small, ignore

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

    /* Per-spiral controls */
    const controls = document.createElement("div");
    controls.className = "fib-spiral-controls";

    const btnFlip = document.createElement("button");
    btnFlip.textContent = "↔";
    btnFlip.title = "Mirror this spiral";
    btnFlip.addEventListener("click", () => {
      const current = img.style.transform;
      img.style.transform = current === "scaleX(-1)" ? "" : "scaleX(-1)";
    });

    const btnRemove = document.createElement("button");
    btnRemove.textContent = "✕";
    btnRemove.title = "Remove this spiral";
    btnRemove.addEventListener("click", () => container.remove());

    controls.appendChild(btnFlip);
    controls.appendChild(btnRemove);
    container.appendChild(controls);
    document.documentElement.appendChild(container);
  }
})();
