(() => {
  // dont load twice
  if (window.__fibExtLoaded) return;
  window.__fibExtLoaded = true;

  // aspect ratio from the svg viewbox
  const ASPECT = 233.60574 / 144.81508;

  // state stuff
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
  let svgTemplate = "";
  let rotating = false;
  let rotateTarget = null;
  let rotateStartAngle = 0;
  let rotateCurrentAngle = 0;

  // inject font face so it works on any page
  const fontStyle = document.createElement("style");
  fontStyle.textContent = `
    @font-face {
      font-family: "Lilex";
      src: url("${chrome.runtime.getURL("fonts/Lilex-Regular.ttf")}") format("truetype");
      font-weight: normal;
      font-style: normal;
    }
  `;
  document.documentElement.appendChild(fontStyle);

  // svg source url
  const svgSrc = chrome.runtime.getURL("icons/fibseq.svg");
  const previewSrc = chrome.runtime.getURL("icons/fibseq.svg");

  // grab the svg text so we can recolor it later
  fetch(svgSrc)
    .then((r) => r.text())
    .then((text) => {
      svgTemplate = text;
      previewImg.src = svgToDataUrl(colorizeSvg(darkMode ? "#ffffff" : "#000000"));
    });

  // slight tint so user knows the extension is active
  const tint = document.createElement("div");
  tint.id = "fib-tint";
  document.documentElement.appendChild(tint);

  // main toolbar card
  const toolbar = document.createElement("div");
  toolbar.id = "fib-toolbar";
  toolbar.className = "fib-light";
  toolbar.innerHTML = `
    <div class="fib-toolbar-row">
      <div id="fib-drag-handle" title="Drag to move">
        <span></span><span></span><span></span><span></span><span></span><span></span>
      </div>
      <div class="fib-toolbar-buttons">
        <button id="fib-btn-theme" title="Toggle dark / light mode"><span id="fib-btn-theme-label">Dark</span></button>
        <button id="fib-btn-clear" title="Erase all"><span id="fib-btn-clear-label">Erase all</span></button>
      </div>
    </div>
    <div class="fib-toolbar-hint">Alt + Q to toggle</div>
  `;
  document.documentElement.appendChild(toolbar);

  // preview element that shows while dragging out a new spiral
  const preview = document.createElement("div");
  preview.id = "fib-draw-preview";
  const previewImg = document.createElement("img");
  previewImg.src = previewSrc;
  previewImg.draggable = false;
  preview.appendChild(previewImg);
  document.documentElement.appendChild(preview);

  // per-spiral mirror state (not used globally anymore but kept for legacy)
  let mirrorOn = false;

  // dark/light toggle
  const btnTheme = toolbar.querySelector("#fib-btn-theme");
  const themeLabel = toolbar.querySelector("#fib-btn-theme-label");
  btnTheme.addEventListener("click", () => {
    darkMode = !darkMode;
    applyTheme();
  });

  function applyTheme() {
    toolbar.className = darkMode ? "fib-dark visible" : "fib-light visible";
    themeLabel.textContent = darkMode ? "Light" : "Dark";
    // update preview color so it matches the current theme
    if (svgTemplate) {
      previewImg.src = svgToDataUrl(colorizeSvg(darkMode ? "#ffffff" : "#000000"));
    }
    document.querySelectorAll(".fib-spiral-container").forEach((el) => {
      el.classList.toggle("fib-dark", darkMode);
      el.classList.toggle("fib-light", !darkMode);
    });
  }

  // erase all spirals
  toolbar.querySelector("#fib-btn-clear").addEventListener("click", () => {
    clearEditing();
    document.querySelectorAll(".fib-spiral-container").forEach((el) => {
      if (el._editMenu) el._editMenu.remove();
      el.remove();
    });
  });

  // toolbar dragging - lets users move the card around
  const dragHandle = toolbar.querySelector("#fib-drag-handle");
  let toolbarDragging = false;
  let toolbarOffsetX = 0;
  let toolbarOffsetY = 0;

  dragHandle.addEventListener("mousedown", (e) => {
    toolbarDragging = true;
    const rect = toolbar.getBoundingClientRect();
    toolbarOffsetX = e.clientX - rect.left;
    toolbarOffsetY = e.clientY - rect.top;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!toolbarDragging) return;
    toolbar.style.left = (e.clientX - toolbarOffsetX) + "px";
    toolbar.style.top = (e.clientY - toolbarOffsetY) + "px";
    toolbar.style.right = "auto";
    e.stopPropagation();
    e.preventDefault();
  });

  document.addEventListener("mouseup", () => {
    toolbarDragging = false;
  });

  // show/hide extension
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

  // editing a spiral - shows outline, handles, mini menu
  function clearEditing() {
    if (editingSpiral) {
      editingSpiral.classList.remove("fib-editing");
      if (editingSpiral._editMenu) editingSpiral._editMenu.classList.remove("fib-menu-visible");
      editingSpiral = null;
    }
  }

  function setEditing(container) {
    if (editingSpiral === container) return;
    clearEditing();
    editingSpiral = container;
    container.classList.add("fib-editing");
    if (container._editMenu) {
      container._editMenu.classList.add("fib-menu-visible");
      positionEditMenu(container);
    }
  }

  // listen for toggle messge from background script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "toggle") {
      active ? deactivate() : activate();
    }
  });

  // figure out the proportional rect from drag distance
  // keeps the golden ratio locked no matter wich direction you drag
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

  // main mousedown handler - figures out what the user is tryng to do
  document.addEventListener("mousedown", (e) => {
    if (!active || e.button !== 0) return;
    if (toolbar.contains(e.target)) return;

    // rotate handle
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

    // resize handle
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

    // clicked on an exisitng spiral - enter edit mode and start dragging
    const spiralEl = e.target.closest(".fib-spiral-container");
    if (spiralEl) {
      if (e.target.closest(".fib-edit-menu") || e.target.closest(".fib-delete-btn")) return;
      setEditing(spiralEl);
      dragging = true;
      dragTarget = spiralEl;
      dragOffsetX = e.pageX - parseFloat(spiralEl.style.left);
      dragOffsetY = e.pageY - parseFloat(spiralEl.style.top);
      e.preventDefault();
      return;
    }

    // clicked empty space - deselect and start drawing a new one
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
    // free rotate, snaps to 15deg when holding ctrl
    if (rotating && rotateTarget) {
      const rect = rotateTarget.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      let angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI) - rotateStartAngle;
      if (e.ctrlKey) {
        angle = Math.round(angle / 15) * 15;
      }
      rotateCurrentAngle = angle;
      rotateTarget.dataset.rotation = angle;
      updateContainerTransform(rotateTarget);
      e.preventDefault();
      return;
    }

    // dragging a spiral around the page
    if (dragging && dragTarget) {
      dragTarget.style.left = (e.pageX - dragOffsetX) + "px";
      dragTarget.style.top = (e.pageY - dragOffsetY) + "px";
      if (editingSpiral === dragTarget) positionEditMenu(dragTarget);
      e.preventDefault();
      return;
    }

    // resizing - keeps ratio locked
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
      if (editingSpiral === resizeTarget) positionEditMenu(resizeTarget);
      e.preventDefault();
      return;
    }

    // drawing preview
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
    if (w < 30 || h < 20) return; // too small, ignore

    const newSpiral = createSpiral(x, y, w, h, mirrorOn);
    setEditing(newSpiral);
    e.preventDefault();
  });

  // swap out the black in the svg with whatever color the user picked
  function colorizeSvg(color) {
    return svgTemplate
      .replace(/stroke:#000000/g, "stroke:" + color)
      .replace(/fill:#000000/g, "fill:" + color);
  }

  function svgToDataUrl(svgText) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
  }

  // creates a new spiral on the page
  function createSpiral(x, y, w, h, mirrored) {
    const container = document.createElement("div");
    container.className = "fib-spiral-container " + (darkMode ? "fib-dark" : "fib-light");
    container.style.left = x + "px";
    container.style.top = y + "px";
    container.style.width = w + "px";
    container.style.height = h + "px";

    const currentColor = darkMode ? "#ffffff" : "#000000";
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

    // delete btn - shows on hover
    const btnDelete = document.createElement("button");
    btnDelete.className = "fib-delete-btn";
    btnDelete.textContent = "✕";
    btnDelete.title = "Delete this spiral";
    btnDelete.addEventListener("click", (e) => {
      e.stopPropagation();
      if (editingSpiral === container) clearEditing();
      if (container._editMenu) container._editMenu.remove();
      container.remove();
    });
    container.appendChild(btnDelete);

    // resize handle bottom right
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "fib-resize-handle";
    container.appendChild(resizeHandle);

    // rotate handle at the top center
    const rotateHandleEl = document.createElement("div");
    rotateHandleEl.className = "fib-rotate-handle";
    container.appendChild(rotateHandleEl);

    // mini menu - lives outside the container so it doesnt rotate with it
    const menu = document.createElement("div");
    menu.className = "fib-edit-menu";

    // rotate 90 btn
    const btnRotate = document.createElement("button");
    btnRotate.textContent = "Rotate 90°";
    btnRotate.title = "Rotate 90° clockwise";
    btnRotate.addEventListener("click", (e) => {
      e.stopPropagation();
      const current = parseFloat(container.dataset.rotation || "0");
      container.dataset.rotation = current + 90;
      updateContainerTransform(container);
      positionEditMenu(container);
    });

    // mirror btn
    const btnMirrorSpiral = document.createElement("button");
    btnMirrorSpiral.textContent = "Mirror";
    btnMirrorSpiral.title = "Mirror this spiral";
    btnMirrorSpiral.addEventListener("click", (e) => {
      e.stopPropagation();
      container.dataset.mirrored = container.dataset.mirrored === "1" ? "0" : "1";
      const mirrd = container.dataset.mirrored === "1";
      img.style.transform = mirrd ? "scaleX(-1)" : "";
    });

    // duplicate btn - clones the spiral to the center of the screen
    const btnDuplicate = document.createElement("button");
    btnDuplicate.textContent = "Duplicate";
    btnDuplicate.title = "Duplicate this spiral";
    btnDuplicate.addEventListener("click", (e) => {
      e.stopPropagation();
      const w = parseFloat(container.style.width);
      const h = parseFloat(container.style.height);
      const centerX = window.scrollX + (window.innerWidth / 2) - (w / 2);
      const centerY = window.scrollY + (window.innerHeight / 2) - (h / 2);
      const mirrored = container.dataset.mirrored === "1";
      const dupe = createSpiral(centerX, centerY, w, h, mirrored);
      // copy over rotation and color
      const rot = parseFloat(container.dataset.rotation || "0");
      const color = container.dataset.spiralColor || "#000000";
      dupe.dataset.rotation = rot;
      dupe.dataset.spiralColor = color;
      dupe.querySelector(".fib-spiral-img").src = svgToDataUrl(colorizeSvg(color));
      updateContainerTransform(dupe);
      setEditing(dupe);
    });

    // color picker
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = currentColor;
    colorInput.className = "fib-color-input";
    colorInput.title = "Change spiral color";
    colorInput.addEventListener("input", (e) => {
      e.stopPropagation();
      const newColor = e.target.value;
      container.dataset.spiralColor = newColor;
      img.src = svgToDataUrl(colorizeSvg(newColor));
    });
    colorInput.addEventListener("click", (e) => e.stopPropagation());

    menu.appendChild(btnRotate);
    menu.appendChild(btnMirrorSpiral);
    menu.appendChild(btnDuplicate);
    menu.appendChild(colorInput);

    // stop menu clicks from bubbling up and closing edit mode
    menu.addEventListener("mousedown", (e) => e.stopPropagation());

    document.documentElement.appendChild(menu);
    container._editMenu = menu;

    document.documentElement.appendChild(container);
    return container;
  }

  // positions the mini menu at the bottom right of the spiral's bounding box
  // even when rotated this stays in the right spot since the menu is outside the container
  function positionEditMenu(container) {
    const menu = container._editMenu;
    if (!menu) return;
    const rect = container.getBoundingClientRect();
    menu.style.left = (rect.right + window.scrollX - menu.offsetWidth) + "px";
    menu.style.top = (rect.bottom + window.scrollY + 15) + "px";
  }

  // update rotation + counter-rotate the UI bits so they dont spin with it
  function updateContainerTransform(container) {
    const rot = parseFloat(container.dataset.rotation || "0");
    container.style.transform = rot ? `rotate(${rot}deg)` : "";
    const counterRot = rot ? `rotate(${-rot}deg)` : "";
    const del = container.querySelector(".fib-delete-btn");
    const resize = container.querySelector(".fib-resize-handle");
    const rotHandle = container.querySelector(".fib-rotate-handle");
    if (del) del.style.transform = counterRot;
    if (resize) resize.style.transform = counterRot;
    if (rotHandle) rotHandle.style.transform = `translateX(-50%) ${counterRot}`;
    if (editingSpiral === container) positionEditMenu(container);
  }
})();
