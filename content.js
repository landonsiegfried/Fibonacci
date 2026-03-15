(() => {
  /* ── Prevent double-injection ── */
  if (window.__fibExtLoaded) return;
  window.__fibExtLoaded = true;

  /* ── State ── */
  let active = false;
  let darkMode = false;
  let drawing = false;
  let startX = 0;
  let startY = 0;

  /* ── Fibonacci helper ── */
  function fibSequence(count) {
    const seq = [1, 1];
    for (let i = 2; i < count; i++) seq.push(seq[i - 1] + seq[i - 2]);
    return seq;
  }

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

  /* ── Draw preview rectangle ── */
  const preview = document.createElement("div");
  preview.id = "fib-draw-preview";
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
      redrawSpiral(el);
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

  /* ── Drawing handlers ── */
  document.addEventListener("mousedown", (e) => {
    if (!active || e.button !== 0) return;
    // Ignore clicks on toolbar
    if (toolbar.contains(e.target)) return;

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
    const x = Math.min(e.pageX, startX);
    const y = Math.min(e.pageY, startY);
    const w = Math.abs(e.pageX - startX);
    const h = Math.abs(e.pageY - startY);
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

    const x = Math.min(e.pageX, startX);
    const y = Math.min(e.pageY, startY);
    const w = Math.abs(e.pageX - startX);
    const h = Math.abs(e.pageY - startY);

    if (w < 20 || h < 20) return; // too small, ignore

    createSpiral(x, y, w, h, mirrorOn);
    e.preventDefault();
  });

  /* ── Create a spiral ── */
  function createSpiral(x, y, w, h, mirrored) {
    const container = document.createElement("div");
    container.className = "fib-spiral-container " + (darkMode ? "fib-dark" : "fib-light");
    container.dataset.mirrored = mirrored ? "1" : "0";
    container.style.left = x + "px";
    container.style.top = y + "px";
    container.style.width = w + "px";
    container.style.height = h + "px";

    const canvas = document.createElement("canvas");
    canvas.width = w * window.devicePixelRatio;
    canvas.height = h * window.devicePixelRatio;
    container.appendChild(canvas);

    /* Per-spiral controls */
    const controls = document.createElement("div");
    controls.className = "fib-spiral-controls";

    const btnFlip = document.createElement("button");
    btnFlip.textContent = "↔";
    btnFlip.title = "Mirror this spiral";
    btnFlip.addEventListener("click", () => {
      container.dataset.mirrored = container.dataset.mirrored === "1" ? "0" : "1";
      redrawSpiral(container);
    });

    const btnRemove = document.createElement("button");
    btnRemove.textContent = "✕";
    btnRemove.title = "Remove this spiral";
    btnRemove.addEventListener("click", () => container.remove());

    controls.appendChild(btnFlip);
    controls.appendChild(btnRemove);
    container.appendChild(controls);
    document.documentElement.appendChild(container);

    redrawSpiral(container);
  }

  /* ── Draw Fibonacci golden spiral on a container's canvas ── */
  function redrawSpiral(container) {
    const canvas = container.querySelector("canvas");
    const w = parseInt(container.style.width);
    const h = parseInt(container.style.height);
    canvas.width = w * window.devicePixelRatio;
    canvas.height = h * window.devicePixelRatio;
    const ctx = canvas.getContext("2d");
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.clearRect(0, 0, w, h);

    const mirrored = container.dataset.mirrored === "1";
    const isDark = container.classList.contains("fib-dark");

    const strokeColor = isDark ? "#c9a84c" : "#b8860b";
    const fillColors = isDark
      ? ["#1e2a3a", "#1a2e3e", "#162e38", "#1a3040", "#1e3444", "#223848"]
      : ["#fdf6e3", "#fef9ec", "#fdf3d7", "#fef0c7", "#fde9b0", "#fce4a0"];
    const textColor = isDark ? "#9aabbf" : "#8a7040";

    // Determine how many squares we can fit
    const dim = Math.min(w, h);
    const seq = fibSequence(12);
    const total = seq.reduce((a, b) => a + b, 0);
    const scale = dim / total * 1.6;

    // Draw Fibonacci rectangles with golden spiral
    ctx.save();

    if (mirrored) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }

    let cx = w * 0.15;
    let cy = h * 0.5;

    // Direction cycle: right, down, left, up
    const dirs = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ];

    // Draw squares and arcs
    for (let i = 0; i < seq.length; i++) {
      const size = seq[i] * scale;
      const dir = dirs[i % 4];

      // Compute square top-left
      let sx, sy;
      if (i === 0) {
        sx = cx;
        sy = cy - size / 2;
      } else {
        const prevSize = seq[i - 1] * scale;
        const d = dirs[(i - 1) % 4];

        if (i % 4 === 0) {
          sx = cx;
          sy = cy - size;
        } else if (i % 4 === 1) {
          sx = cx - prevSize;
          sy = cy;
        } else if (i % 4 === 2) {
          sx = cx - size;
          sy = cy - prevSize;
        } else {
          sx = cx;
          sy = cy - size;
        }
      }

      // Draw rectangle
      ctx.fillStyle = fillColors[i % fillColors.length];
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      ctx.fillRect(sx, sy, size, size);
      ctx.strokeRect(sx, sy, size, size);

      // Draw Fibonacci number
      ctx.save();
      if (mirrored) {
        ctx.scale(-1, 1);
        ctx.fillStyle = textColor;
        ctx.font = `${Math.max(9, size * 0.25)}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(seq[i], -(sx + size / 2), sy + size / 2);
      } else {
        ctx.fillStyle = textColor;
        ctx.font = `${Math.max(9, size * 0.25)}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(seq[i], sx + size / 2, sy + size / 2);
      }
      ctx.restore();

      // Draw quarter-circle arc (golden spiral segment)
      ctx.beginPath();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;

      let arcCx, arcCy, startAngle, endAngle;
      const mod = i % 4;
      if (mod === 0) {
        arcCx = sx;
        arcCy = sy + size;
        startAngle = -Math.PI / 2;
        endAngle = 0;
      } else if (mod === 1) {
        arcCx = sx;
        arcCy = sy;
        startAngle = 0;
        endAngle = Math.PI / 2;
      } else if (mod === 2) {
        arcCx = sx + size;
        arcCy = sy;
        startAngle = Math.PI / 2;
        endAngle = Math.PI;
      } else {
        arcCx = sx + size;
        arcCy = sy + size;
        startAngle = Math.PI;
        endAngle = (3 * Math.PI) / 2;
      }

      ctx.arc(arcCx, arcCy, size, startAngle, endAngle);
      ctx.stroke();

      // Advance anchor point
      if (mod === 0) {
        cx = sx + size;
        cy = sy + size;
      } else if (mod === 1) {
        cx = sx;
        cy = sy + size;
      } else if (mod === 2) {
        cx = sx;
        cy = sy;
      } else {
        cx = sx + size;
        cy = sy;
      }
    }

    ctx.restore();
  }
})();
