const BABYLON = globalThis.BABYLON;

function getColorKey(color = [1, 1, 1]) {
  return color.map((component) => component.toFixed(4)).join(',');
}

export class Renderer {
  constructor({ canvas }) {
    if (!canvas) {
      throw new Error('Renderer requires a canvas element.');
    }

    this.canvas = canvas;
    this.engine = null;
    this.scene = null;
    this.camera = null;
    this.light = null;

    this.groups = {
      board: { root: null, meshes: [] },
      highlights: { root: null, meshes: [] },
      pieces: { root: null, meshes: [] },
    };

    this.materialCache = new Map();
    this._tempScaling = null;
    this._tempRotation = null;
    this._tempPosition = null;
    this._cameraTarget = null;
  }

  async initialize() {
    if (!BABYLON) {
      throw new Error('Babylon.js is not available. Ensure the Babylon.js CDN script is loaded.');
    }

    this.engine = new BABYLON.Engine(this.canvas, true, { adaptToDeviceRatio: false });
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.useRightHandedSystem = true;
    this.scene.clearColor = new BABYLON.Color4(0.05, 0.07, 0.12, 1.0);

    this.camera = new BABYLON.FreeCamera('chess-camera', new BABYLON.Vector3(0, 10, 10), this.scene);
    this.camera.minZ = 0.1;
    this.camera.maxZ = 100;
    this.camera.fov = Math.PI / 4;
    this.camera.inertia = 0;
    this.camera.position.copyFromFloats(0, 8, 8);
    this.camera.setTarget(BABYLON.Vector3.Zero());

    this.light = new BABYLON.DirectionalLight('chess-light', new BABYLON.Vector3(-0.6, -1.0, -0.8), this.scene);
    this.light.position = new BABYLON.Vector3(6, 8, 6);
    this.light.intensity = 1.25;

    const hemiLight = new BABYLON.HemisphericLight('chess-hemi', new BABYLON.Vector3(0, 1, 0), this.scene);
    hemiLight.intensity = 0.35;
    hemiLight.specular = new BABYLON.Color3(0.05, 0.05, 0.05);

    this.groups.board.root = new BABYLON.TransformNode('board-root', this.scene);
    this.groups.highlights.root = new BABYLON.TransformNode('highlight-root', this.scene);
    this.groups.pieces.root = new BABYLON.TransformNode('piece-root', this.scene);

    this._tempScaling = new BABYLON.Vector3(1, 1, 1);
    this._tempRotation = new BABYLON.Quaternion();
    this._tempPosition = new BABYLON.Vector3();
    this._cameraTarget = new BABYLON.Vector3();
  }

  setLightDirection(direction) {
    if (!this.light || !direction) return;
    this.light.direction.copyFromFloats(direction[0], direction[1], direction[2]);
  }

  updateCamera({ position, target }) {
    if (!this.camera || !position || !target) {
      return;
    }
    this.camera.position.copyFromFloats(position[0], position[1], position[2]);
    this._cameraTarget.copyFromFloats(target[0], target[1], target[2]);
    this.camera.setTarget(this._cameraTarget);
  }

  setBoardInstances(instances) {
    this.#syncGroup(this.groups.board, instances, 'board');
  }

  setHighlightInstances(instances) {
    this.#syncGroup(this.groups.highlights, instances, 'highlight');
  }

  updatePieceInstances(instances) {
    this.#syncGroup(this.groups.pieces, instances, 'piece');
  }

  render() {
    if (!this.scene || !this.engine) return;
    this.scene.render();
  }

  resize(width, height) {
    if (!this.engine) return;
    if (typeof width === 'number' && typeof height === 'number') {
      this.engine.setSize(width, height);
    } else {
      this.engine.resize();
    }
  }

  #syncGroup(group, instances, prefix) {
    if (!this.scene || !group?.root) {
      return;
    }

    group.meshes.forEach((mesh) => mesh.dispose());
    group.meshes = [];

    if (!Array.isArray(instances) || instances.length === 0) {
      return;
    }

    instances.forEach((instance, index) => {
      const mesh = BABYLON.MeshBuilder.CreateBox(`${prefix}-${index}`, { size: 1 }, this.scene);
      mesh.parent = group.root;
      mesh.isPickable = false;
      mesh.receiveShadows = false;
      mesh.material = this.#getMaterial(instance.color);
      this.#applyTransform(mesh, instance.matrix);
      group.meshes.push(mesh);
    });
  }

  #applyTransform(mesh, matrixArray) {
    if (!Array.isArray(matrixArray) && !(matrixArray instanceof Float32Array)) {
      return;
    }

    const matrix = BABYLON.Matrix.FromArray(matrixArray);
    matrix.decompose(this._tempScaling, this._tempRotation, this._tempPosition);
    mesh.scaling.copyFrom(this._tempScaling);
    mesh.rotationQuaternion = mesh.rotationQuaternion ?? new BABYLON.Quaternion();
    mesh.rotationQuaternion.copyFrom(this._tempRotation);
    mesh.position.copyFrom(this._tempPosition);
    mesh.computeWorldMatrix(true);
  }

  #getMaterial(color) {
    const key = getColorKey(color);
    if (this.materialCache.has(key)) {
      return this.materialCache.get(key);
    }

    const material = new BABYLON.StandardMaterial(`mat-${this.materialCache.size}`, this.scene);
    const [r, g, b] = color ?? [1, 1, 1];
    material.diffuseColor = new BABYLON.Color3(r, g, b);
    material.specularColor = new BABYLON.Color3(0.12, 0.12, 0.12);
    material.ambientColor = new BABYLON.Color3(r * 0.4, g * 0.4, b * 0.4);
    material.backFaceCulling = true;
    material.freeze();

    this.materialCache.set(key, material);
    return material;
  }
}
