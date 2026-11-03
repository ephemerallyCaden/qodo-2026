// Tangent frame for a cloud puff sitting on the unit sphere at direction `d`.
// Returns a RIGHT-HANDED basis (east, d, north) with east x d = north, so a puff
// instance matrix built from it has a positive determinant. three.js only flips
// triangle winding for a mirrored *mesh* matrixWorld, never per instance, so a
// left-handed instance gets its outer shell back-face culled and reads as a hollow
// ring (the b67f935 bug). At the poles up x d vanishes; fall back to the x axis.
export function tangentFrame(THREE, d) {
  const east = new THREE.Vector3(-d.z, 0, d.x); // = up x d for up = (0, 1, 0)
  if (east.lengthSq() < 1e-10) east.set(1, 0, 0); // pole: any horizontal axis
  east.normalize();
  const north = new THREE.Vector3().crossVectors(east, d).normalize();
  return { east, north };
}
