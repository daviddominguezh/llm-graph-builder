import * as THREE from 'three';

// Camera rig for the folded-silk scene. Two modes:
//  - Orthographic (default): pixel-space frustum, exactly as the reference — the
//    mesh transform is authored in pixels. Used by the fibrous developers wave.
//  - Perspective (opt-in): framed to match the ortho view at the sheet plane
//    (z≈0) so the wave looks the same at rest, but it can ORBIT around that
//    plane for real 3D depth as the wave rotates on scroll. Both knobs tunable.

type SilkCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

// Perspective camera → sheet distance. Smaller = stronger perspective/depth.
export const CAM_DIST = 1400;
// Radians the view orbits at scroll progress = 1 (~74°). Tune the swing here —
// more radians = more rotation per unit of scroll.
const MAX_ORBIT = 3.5;

export function createSilkCamera(usePerspective: boolean): SilkCamera {
  const camera: SilkCamera = usePerspective
    ? new THREE.PerspectiveCamera(30, 1, 1, 40000)
    : new THREE.OrthographicCamera(0, 0, 0, 0, 1, 10000);
  camera.position.set(usePerspective ? 0 : 100, 0, usePerspective ? CAM_DIST : 5000);
  camera.lookAt(0, 0, 0);
  return camera;
}

// Re-frame on resize. Perspective: pick the vertical fov that shows the same
// height the ortho view did at z≈0 (camera.zoom, from the Zoom control, still
// multiplies on top). Ortho: pixel-space frustum.
export function frameSilkCamera(camera: SilkCamera, width: number, height: number): void {
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = width / height;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(height / 2 / CAM_DIST));
  } else {
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
  }
  camera.updateProjectionMatrix();
}

// Orbit the perspective camera around the sheet plane for the 3D swing.
// progress 0→1 maps to MAX_ORBIT→0 (reversed): the wave starts at the far pose
// and swings back to flat/front, finishing where the arc used to start. No-op
// for the orthographic rig.
export function orbitSilkCamera(camera: SilkCamera, progress: number): void {
  if (!(camera instanceof THREE.PerspectiveCamera)) return;
  const angle = (1 - Math.min(1, Math.max(0, progress))) * MAX_ORBIT;
  camera.position.set(Math.sin(angle) * CAM_DIST, 0, Math.cos(angle) * CAM_DIST);
  camera.lookAt(0, 0, 0);
}
