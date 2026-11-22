// Initializes infinite canvas pan and zoom with LOD semantic title scaling
export function initPanZoom(viewportId, canvasId) {
  const viewport = document.getElementById(viewportId);
  const canvas = document.getElementById(canvasId);

  const initialPanX = 100;
  const initialPanY = 100;
  let zoom = 1;
  let panX = initialPanX;
  let panY = initialPanY;
  let isDragging = false;
  let startX, startY;

  const clampZoom = (val) => Math.min(Math.max(Math.round(val * 100) / 100, 0.1), 3.0);

  // Applies 2D canvas transform and updates LOD title opacity
  function applyTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;

    const minZoomThreshold = 0.25;
    const maxZoomThreshold = 0.55;
    const opacity = Math.max(0, Math.min(1, (maxZoomThreshold - zoom) / (maxZoomThreshold - minZoomThreshold)));
    canvas.style.setProperty('--section-title-opacity', opacity.toFixed(3));
    canvas.classList.toggle('canvas--low-lod', zoom <= 0.4);
  }

  // Zoom towards cursor location on mouse wheel
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const canvasMouseX = (mouseX - panX) / zoom;
    const canvasMouseY = (mouseY - panY) / zoom;

    const step = e.deltaY < 0 ? 0.1 : -0.1;
    zoom = clampZoom(zoom + step);

    panX = mouseX - canvasMouseX * zoom;
    panY = mouseY - canvasMouseY * zoom;
    applyTransform();
  }, { passive: false });

  // Pan initiation on canvas mousedown
  viewport.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('.control-panel')) return;
    isDragging = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
    viewport.style.cursor = 'grabbing';
  });

  // Pan update on mousemove
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    applyTransform();
  });

  // Pan termination on mouseup or mouseleave
  const stopDragging = () => {
    if (!isDragging) return;
    isDragging = false;
    viewport.style.cursor = 'grab';
  };

  window.addEventListener('mouseup', stopDragging);
  window.addEventListener('mouseleave', stopDragging);

  applyTransform();

  return {
    resetPan() {
      panX = initialPanX;
      panY = initialPanY;
      applyTransform();
    },
    getTransform() {
      return { panX, panY, zoom };
    }
  };
}
