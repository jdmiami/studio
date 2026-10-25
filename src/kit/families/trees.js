// trees: not built yet. build(variant, random, item) must return an Object3D whose base center
// sits at the origin on the ground (y = 0); the kit page positions it on the sheet.
import * as THREE from 'three';

export function build() {
  return new THREE.Group();
}
