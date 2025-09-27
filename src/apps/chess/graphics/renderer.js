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
    this.modelDefinitions = {
      king: { filename: 'King.glb', targetHeight: 2.4 },
      queen: { filename: 'queen.glb', targetHeight: 2.4 },
      rook: { filename: 'castle.glb', targetHeight: 2.1 },
      bishop: { filename: 'bishop.glb', targetHeight: 2.2 },
      knight: { filename: 'knight.glb', targetHeight: 2.3 },
      pawn: { filename: 'pawn.glb', targetHeight: 1.45 },
    };
    this.modelAssets = new Map();
    this.modelLoadPromises = new Map();
    this.pieceRegistry = new Map();

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

    const loaderPromises = Object.entries(this.modelDefinitions).map(([id, definition]) =>
      this.#ensureModelLoaded(id, definition).catch((error) => {
        console.error(`Failed to load ${id} model`, error);
        this.modelAssets.delete(id);
      }),
    );
    if (loaderPromises.length > 0) {
      await Promise.all(loaderPromises);
    }
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
    const group = this.groups.pieces;
    if (!this.scene || !group?.root) {
      return;
    }

    const activeIds = new Set();

    if (Array.isArray(instances)) {
      instances.forEach((instance) => {
        const id = instance?.id;
        if (id === undefined || id === null) {
          return;
        }
        activeIds.add(id);
        const modelId = this.#resolveModelId(instance?.kind);
        let entry = this.pieceRegistry.get(id);
        const needsRebuild =
          !entry || entry.type !== instance.type || entry.modelId !== modelId;
        if (needsRebuild) {
          if (entry) {
            this.#disposePieceEntry(entry);
          }
          entry = this.#createPieceEntry({ ...instance, modelId });
          if (!entry) {
            return;
          }
          this.pieceRegistry.set(id, entry);
        }
        this.#updatePieceEntry(entry, instance);
      });
    }

    for (const [id, entry] of this.pieceRegistry.entries()) {
      if (!activeIds.has(id)) {
        this.#disposePieceEntry(entry);
        this.pieceRegistry.delete(id);
      }
    }

    this.groups.pieces.meshes = Array.from(this.pieceRegistry.values()).map(
      (entry) => entry.root,
    );
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

    const previousMeshes = Array.isArray(group.meshes) ? [...group.meshes] : [];
    const newMeshes = [];

    if (!Array.isArray(instances) || instances.length === 0) {
      previousMeshes.forEach((mesh) => mesh.dispose());
      group.meshes = [];
      return;
    }

    instances.forEach((instance, index) => {
      const mesh = BABYLON.MeshBuilder.CreateBox(`${prefix}-${index}`, { size: 1 }, this.scene);
      mesh.parent = group.root;
      mesh.isPickable = false;
      mesh.receiveShadows = false;
      mesh.material = this.#getMaterial(instance.color);
      this.#applyTransform(mesh, instance.matrix);
      newMeshes.push(mesh);
    });

    previousMeshes.forEach((mesh) => mesh.dispose());
    group.meshes = newMeshes;
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

  async #ensureModelLoaded(assetId, definition) {
    if (!this.scene || !BABYLON?.SceneLoader) {
      return null;
    }

    if (this.modelAssets.has(assetId)) {
      return this.modelAssets.get(assetId);
    }

    if (this.modelLoadPromises.has(assetId)) {
      return this.modelLoadPromises.get(assetId);
    }

    const promise = this.#loadModelAsset(assetId, definition);
    this.modelLoadPromises.set(assetId, promise);
    const asset = await promise;
    this.modelLoadPromises.delete(assetId);
    if (asset) {
      this.modelAssets.set(assetId, asset);
    }
    return asset;
  }

  async #loadModelAsset(assetId, definition) {
    const { filename, targetHeight = 2.4 } = definition ?? {};
    if (!filename) {
      return null;
    }

    const root = new BABYLON.TransformNode(`${assetId}-template-root`, this.scene);
    const offset = new BABYLON.TransformNode(`${assetId}-template-offset`, this.scene);
    offset.parent = root;

    const result = await BABYLON.SceneLoader.ImportMeshAsync(
      '',
      'src/apps/chess/assets/',
      filename,
      this.scene,
    );

    const meshes = Array.isArray(result?.meshes) ? result.meshes : [];
    const transformNodes = Array.isArray(result?.transformNodes) ? result.transformNodes : [];

    transformNodes
      .filter((node) => node && node !== root)
      .forEach((node) => {
        if (!node.parent) {
          node.parent = offset;
        }
      });

    const materialKeys = new Map();
    let materialIndex = 0;

    meshes
      .filter((mesh) => mesh && mesh !== root)
      .forEach((mesh) => {
        if (!mesh.parent) {
          mesh.parent = offset;
        }
        mesh.isPickable = false;
        mesh.receiveShadows = false;

        const material = mesh.material;
        if (material) {
          const metadata = material.metadata ?? (material.metadata = {});
          if (!metadata.modelMaterialKey) {
            const generatedKey = material.id
              || material.name
              || `${assetId}-material-${materialIndex += 1}`;
            metadata.modelMaterialKey = generatedKey;
          }
          const key = metadata.modelMaterialKey;
          if (!materialKeys.has(key)) {
            materialKeys.set(key, material);
          }
        }
      });

    if (offset.getChildMeshes().length === 0) {
      root.dispose();
      return null;
    }

    const { min, max } = offset.getHierarchyBoundingVectors(true);
    const height = Math.max(max.y - min.y, 1e-3);
    const centerX = (min.x + max.x) * 0.5;
    const centerZ = (min.z + max.z) * 0.5;

    const uniformScale = targetHeight / height;
    offset.scaling.copyFromFloats(uniformScale, uniformScale, uniformScale);
    offset.position.copyFromFloats(
      -centerX * uniformScale,
      -min.y * uniformScale,
      -centerZ * uniformScale,
    );

    root.setEnabled(false);

    return {
      assetId,
      template: root,
      targetHeight,
      baseMaterials: materialKeys,
      tintedCache: new Map(),
    };
  }

  #resolveModelId(kind) {
    switch (kind) {
      case 'king-model':
        return 'king';
      case 'queen-model':
        return 'queen';
      case 'rook-model':
        return 'rook';
      case 'pawn-model':
        return 'pawn';
      case 'bishop-model':
        return 'bishop';
      case 'knight-model':
        return 'knight';
      default:
        return null;
    }
  }

  #createPieceEntry(piece) {
    const { id, modelId } = piece ?? {};
    if (id === undefined || id === null) {
      return null;
    }

    const root = new BABYLON.TransformNode(`piece-${id}`, this.scene);
    root.parent = this.groups.pieces.root;
    root.isPickable = false;

    let primaryNode = null;
    let fallbackMeshes = [];
    const color = Array.isArray(piece?.color) ? piece.color : [1, 1, 1];

    if (modelId) {
      const asset = this.modelAssets.get(modelId);
      if (asset?.template) {
        const clone = asset.template.clone(`piece-${modelId}-${id}`, root);
        if (clone) {
          clone.setEnabled(true);
          clone.parent = root;
          const materialMap = this.#getModelMaterialsForColor(asset, color);
          clone.getChildMeshes().forEach((mesh) => {
            mesh.isPickable = false;
            mesh.receiveShadows = false;
            const baseMaterial = mesh.material;
            if (!baseMaterial) {
              return;
            }
            const key = baseMaterial.metadata?.modelMaterialKey
              || baseMaterial.id
              || baseMaterial.name;
            const tinted = key ? materialMap.get(key) : null;
            if (tinted) {
              mesh.material = tinted;
            }
          });
          primaryNode = clone;
        }
      }
    }

    if (!primaryNode) {
      fallbackMeshes = this.#createFallbackMeshes(root, piece?.fallbackLayers, color);
    }

    return {
      id,
      root,
      primaryNode,
      fallbackMeshes,
      modelId,
      type: piece?.type ?? null,
      colorKey: getColorKey(color),
      fallbackLayers: Array.isArray(piece?.fallbackLayers)
        ? piece.fallbackLayers.map((layer) => ({ ...layer }))
        : [],
      basePosition: new BABYLON.Vector3(0, 0, 0),
      offset: new BABYLON.Vector3(0, 0, 0),
      baseRotationY: 0,
      rotationOffsetY: 0,
    };
  }

  #updatePieceEntry(entry, piece) {
    if (!entry?.root) {
      return;
    }

    const position = Array.isArray(piece?.position) ? piece.position : [0, 0, 0];
    entry.basePosition.copyFromFloats(position[0] ?? 0, position[1] ?? 0, position[2] ?? 0);

    const rotationY = typeof piece?.rotationY === 'number' ? piece.rotationY : 0;
    entry.baseRotationY = rotationY;

    const color = Array.isArray(piece?.color) ? piece.color : [1, 1, 1];
    const colorKey = getColorKey(color);
    if (colorKey !== entry.colorKey) {
      this.#applyPieceColor(entry, color);
      entry.colorKey = colorKey;
    }

    if (!entry.primaryNode && entry.fallbackMeshes.length > 0) {
      this.#updateFallbackMeshes(entry, piece?.fallbackLayers);
    }

    this.#applyPieceTransform(entry);
  }

  #disposePieceEntry(entry) {
    if (!entry) {
      return;
    }
    if (Array.isArray(entry.fallbackMeshes)) {
      entry.fallbackMeshes.forEach((mesh) => mesh.dispose());
    }
    if (entry.primaryNode) {
      entry.primaryNode.dispose(false, false);
    }
    entry.root?.dispose(false, false);
  }

  #applyPieceColor(entry, color) {
    const modelId = entry?.modelId;
    if (modelId && entry?.primaryNode) {
      const asset = this.modelAssets.get(modelId);
      if (asset) {
        const materialMap = this.#getModelMaterialsForColor(asset, color);
        entry.primaryNode.getChildMeshes().forEach((mesh) => {
          const baseMaterial = mesh.material;
          if (!baseMaterial) {
            return;
          }
          const key = baseMaterial.metadata?.modelMaterialKey
            || baseMaterial.id
            || baseMaterial.name;
          const tinted = key ? materialMap.get(key) : null;
          if (tinted) {
            mesh.material = tinted;
          }
        });
      }
    } else if (Array.isArray(entry?.fallbackMeshes) && entry?.fallbackLayers) {
      entry.fallbackMeshes.forEach((mesh, index) => {
        const layer = entry.fallbackLayers[index];
        if (!layer) {
          return;
        }
        mesh.material = this.#getMaterial(layer.color ?? color);
      });
    }
  }

  #createFallbackMeshes(parent, layers, defaultColor = [1, 1, 1]) {
    const meshes = [];
    if (!Array.isArray(layers) || layers.length === 0) {
      return meshes;
    }

    layers.forEach((layer, index) => {
      const scale = Array.isArray(layer?.scale) ? layer.scale : [1, 1, 1];
      const mesh = BABYLON.MeshBuilder.CreateBox(
        `${parent.name ?? 'piece'}-fallback-${index}`,
        { size: 1 },
        this.scene,
      );
      mesh.parent = parent;
      mesh.isPickable = false;
      mesh.receiveShadows = false;
      mesh.scaling.copyFromFloats(scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1);
      const yOffset = typeof layer?.yOffset === 'number' ? layer.yOffset : 0;
      mesh.position.copyFromFloats(0, yOffset, 0);
      mesh.material = this.#getMaterial(layer?.color ?? defaultColor);
      meshes.push(mesh);
    });
    return meshes;
  }

  #updateFallbackMeshes(entry, layers) {
    if (!Array.isArray(entry?.fallbackMeshes)) {
      return;
    }
    entry.fallbackLayers = Array.isArray(layers)
      ? layers.map((layer) => ({ ...layer }))
      : entry.fallbackLayers;
    entry.fallbackMeshes.forEach((mesh, index) => {
      const layer = entry.fallbackLayers[index];
      if (!layer) {
        return;
      }
      const scale = Array.isArray(layer.scale) ? layer.scale : [1, 1, 1];
      mesh.scaling.copyFromFloats(scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1);
      const yOffset = typeof layer.yOffset === 'number' ? layer.yOffset : 0;
      mesh.position.y = yOffset;
      mesh.material = this.#getMaterial(layer.color ?? [1, 1, 1]);
    });
  }

  #applyPieceTransform(entry) {
    if (!entry?.root) {
      return;
    }
    const finalX = entry.basePosition.x + entry.offset.x;
    const finalY = entry.basePosition.y + entry.offset.y;
    const finalZ = entry.basePosition.z + entry.offset.z;
    entry.root.position.copyFromFloats(finalX, finalY, finalZ);

    const rotationY = entry.baseRotationY + entry.rotationOffsetY;
    entry.root.rotationQuaternion = entry.root.rotationQuaternion ?? new BABYLON.Quaternion();
    BABYLON.Quaternion.FromEulerAnglesToRef(0, rotationY, 0, entry.root.rotationQuaternion);

    entry.root.computeWorldMatrix(true);
  }

  getPieceEntry(id) {
    return this.pieceRegistry.get(id) ?? null;
  }

  setPieceOffset(id, offset) {
    const entry = this.pieceRegistry.get(id);
    if (!entry?.offset) {
      return;
    }
    if (Array.isArray(offset)) {
      entry.offset.copyFromFloats(offset[0] ?? 0, offset[1] ?? 0, offset[2] ?? 0);
    } else if (offset && typeof offset === 'object') {
      entry.offset.copyFrom(offset);
    } else {
      entry.offset.copyFromFloats(0, 0, 0);
    }
    this.#applyPieceTransform(entry);
  }

  setPieceBasePosition(id, position) {
    const entry = this.pieceRegistry.get(id);
    if (!entry?.basePosition) {
      return;
    }
    if (Array.isArray(position)) {
      entry.basePosition.copyFromFloats(position[0] ?? 0, position[1] ?? 0, position[2] ?? 0);
    } else if (position && typeof position === 'object') {
      entry.basePosition.copyFrom(position);
    }
    this.#applyPieceTransform(entry);
  }

  setPieceRotationOffset(id, offsetY = 0) {
    const entry = this.pieceRegistry.get(id);
    if (!entry) {
      return;
    }
    entry.rotationOffsetY = typeof offsetY === 'number' ? offsetY : 0;
    this.#applyPieceTransform(entry);
  }

  removePiece(id) {
    const entry = this.pieceRegistry.get(id);
    if (!entry) {
      return;
    }
    this.#disposePieceEntry(entry);
    this.pieceRegistry.delete(id);
    this.groups.pieces.meshes = Array.from(this.pieceRegistry.values()).map(
      (item) => item.root,
    );
  }

  #getModelMaterialsForColor(asset, color) {
    if (!asset) {
      return new Map();
    }

    const key = getColorKey(Array.isArray(color) ? color : [1, 1, 1]);
    if (asset.tintedCache.has(key)) {
      return asset.tintedCache.get(key);
    }

    const map = new Map();
    for (const [materialKey, baseMaterial] of asset.baseMaterials.entries()) {
      const clone = baseMaterial?.clone?.(`${baseMaterial?.name || `${asset.assetId}-material`}-${key}`);
      if (!clone) {
        continue;
      }
      clone.metadata = {
        ...(clone.metadata ?? {}),
        modelMaterialKey: materialKey,
      };
      this.#tintModelMaterial(clone, color);
      map.set(materialKey, clone);
    }

    asset.tintedCache.set(key, map);
    return map;
  }

  #tintModelMaterial(material, color) {
    const [r, g, b] = Array.isArray(color) ? color : [1, 1, 1];

    if ('albedoColor' in material && material.albedoColor) {
      material.albedoColor.copyFromFloats(r, g, b);
    } else if ('diffuseColor' in material && material.diffuseColor) {
      material.diffuseColor.copyFromFloats(r, g, b);
    }

    if (typeof material.backFaceCulling === 'boolean') {
      material.backFaceCulling = true;
    }
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
