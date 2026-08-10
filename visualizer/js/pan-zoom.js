// js/pan-zoom.js
export function initPanZoom(viewportId, canvasId) {
  const viewport = document.getElementById(viewportId);
  const canvas = document.getElementById(canvasId);

  // Read base properties from CSS configuration layout variables
  let zoom = 1;
  let panX = 100;
  let panY = 100;
  let isDragging = false;
  let startX, startY;

  function applyTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const canvasMouseX = (mouseX - panX) / zoom;
    const canvasMouseY = (mouseY - panY) / zoom;

    const step = 0.1;
    if (e.deltaY < 0) {
      zoom = Math.min(Math.round((zoom + step) * 100) / 100, 3.0);
    } else {
      zoom = Math.max(Math.round((zoom - step) * 100) / 100, 0.1);
    }

    panX = mouseX - canvasMouseX * zoom;
    panY = mouseY - canvasMouseY * zoom;
    applyTransform();
  }, { passive: false });

  viewport.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    // If the click is inside the control panel or other controls, ignore panning
    if (e.target.closest('.control-panel')) return;
    isDragging = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
    viewport.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    viewport.style.cursor = 'grab';
  });

  window.addEventListener('mouseleave', () => {
    isDragging = false;
    viewport.style.cursor = 'grab';
  });

  // Initialize canvas coordinates baseline display
  applyTransform();
}
