import { Renderer } from './graphics/renderer.js';
import { CameraController } from './camera/cameraController.js';
import { ChessGame, PieceType, PieceColor } from './game/chessGame.js';
import { StockfishEngine } from './game/stockfishEngine.js';
import { mat4 } from '../../math/mat4.js';
import { vec3 } from '../../math/vec3.js';

const BOARD_HALF = 3.5;
const BOARD_SCALE = [0.98, 0.08, 0.98];
const BOARD_HEIGHT_OFFSET = -0.04;

const BOARD_COLORS = {
  light: [0.82, 0.78, 0.72],
  dark: [0.33, 0.27, 0.22],
};

const PIECE_BASE_COLORS = {
  [PieceColor.WHITE]: [0.93, 0.93, 0.9],
  [PieceColor.BLACK]: [0.18, 0.21, 0.28],
};

const HIGHLIGHT_COLORS = {
  selected: [0.25, 0.65, 1.0],
  legal: [0.22, 0.72, 0.45],
  capture: [0.85, 0.33, 0.33],
  hover: [0.92, 0.78, 0.25],
  recent: [0.65, 0.55, 0.3],
};

const PIECE_SHAPES = {
  [PieceType.PAWN]: [
    { scale: [0.55, 0.5, 0.55], colorFactor: 1 },
    { scale: [0.35, 0.45, 0.35], colorFactor: 1.12 },
  ],
  [PieceType.ROOK]: [
    { scale: [0.75, 0.6, 0.75], colorFactor: 1 },
    { scale: [0.8, 0.45, 0.8], colorFactor: 1.08 },
    { scale: [0.5, 0.35, 0.5], colorFactor: 1.15 },
  ],
  [PieceType.KNIGHT]: [
    { scale: [0.7, 0.6, 0.5], colorFactor: 1 },
    { scale: [0.5, 0.9, 0.35], colorFactor: 1.1 },
  ],
  [PieceType.BISHOP]: [
    { scale: [0.6, 0.7, 0.6], colorFactor: 1 },
    { scale: [0.4, 0.9, 0.4], colorFactor: 1.12 },
    { scale: [0.3, 0.4, 0.3], colorFactor: 1.2 },
  ],
  [PieceType.QUEEN]: [
    { scale: [0.75, 0.8, 0.75], colorFactor: 1 },
    { scale: [0.5, 1.0, 0.5], colorFactor: 1.12 },
    { scale: [0.35, 0.6, 0.35], colorFactor: 1.22 },
  ],
  [PieceType.KING]: [
    { scale: [0.78, 0.8, 0.78], colorFactor: 1 },
    { scale: [0.55, 1.0, 0.55], colorFactor: 1.1 },
    { scale: [0.32, 0.6, 0.32], colorFactor: 1.2 },
    { scale: [0.18, 0.45, 0.18], colorFactor: 1.32 },
  ],
};

const lightDirection = vec3.fromValues(-0.6, -1.0, -0.8);
vec3.normalize(lightDirection, lightDirection);

function adjustColor(color, factor) {
  if (factor === 1) return [...color];
  const mix = Math.max(0, (factor - 1) * 0.8);
  return color.map((c) => Math.min(1, c + (1 - c) * mix));
}

function easeInOutCubic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function buildFallbackLayers(shapes, baseColor) {
  if (!Array.isArray(shapes) || shapes.length === 0) {
    return [];
  }
  const layers = [];
  let accumulatedHeight = 0;
  for (const shape of shapes) {
    const [sx, sy, sz] = shape.scale;
    const centerY = accumulatedHeight + sy * 0.5;
    accumulatedHeight += sy;
    layers.push({
      scale: [...shape.scale],
      yOffset: centerY,
      color: adjustColor(baseColor, shape.colorFactor ?? 1),
    });
  }
  return layers;
}

function toWorldPosition(row, col) {
  return {
    x: col - BOARD_HALF,
    z: BOARD_HALF - row,
  };
}

function createTransform(x, y, z, scale) {
  const matrix = mat4.create();
  mat4.translate(matrix, matrix, [x, y, z]);
  mat4.scale(matrix, matrix, scale);
  return matrix;
}

function transformPoint(matrix, point) {
  const x = point[0];
  const y = point[1];
  const z = point[2];
  const w = point[3];
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12] * w,
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13] * w,
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14] * w,
    matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15] * w,
  ];
}

function normalize(vec) {
  const len = Math.hypot(vec[0], vec[1], vec[2]);
  if (len === 0) return [0, 0, 0];
  return [vec[0] / len, vec[1] / len, vec[2] / len];
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export class App {
  constructor({ canvas, onStateChange, onMessage }) {
    this.canvas = canvas;
    this.onStateChange = onStateChange;
    this.onMessage = onMessage;

    this.game = new ChessGame();
    this.selectedSquare = null;
    this.legalMoves = [];
    this.hoverSquare = null;

    this.dragState = this.createInitialDragState();
    this.touchState = this.createInitialTouchState();
    this.running = false;

    this.renderer = null;
    this.camera = null;

    this.boardInstances = [];
    this.currentPieceStates = [];
    this.currentPieceStateMap = new Map();
    this.currentPieceIndexMap = new Map();
    this.activeAnimations = [];
    this.animationInProgress = false;
    this.animationSettings = {
      moveDuration: 0.6,
      liftHeight: 0.45,
      sidestepDistance: 0.6,
      sidestepDuration: 0.25,
      sidestepReturnDuration: 0.25,
    };

    this.engine = null;
    this.engineReadyPromise = null;
    this.singlePlayer = true;
    this.humanColor = PieceColor.WHITE;
    this.engineColor = PieceColor.BLACK;
    this.engineSkill = 8;
    this.engineThinking = false;
    this.engineMoveTime = 1000;

    this.cameraInteraction = {
      active: false,
      returning: false,
      lastInputTime: 0,
      currentAnchor: 0,
    };
    this.anchorSnapDelayMs = 700;
    this.autoAnchorEnabled = true;
    this.lastFrameTime = null;
  
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.onResize = this.onResize.bind(this);
    this.renderFrame = this.renderFrame.bind(this);
  }

  createInitialDragState() {
    return {
      active: false,
      pointerId: null,
      pointerType: null,
      button: 0,
      lastX: 0,
      lastY: 0,
      startX: 0,
      startY: 0,
      moved: false,
      usedCamera: false,
    };
  }

  createInitialTouchState() {
    return {
      pointers: new Map(),
      tapCandidate: null,
      tapStart: null,
      lastCentroid: null,
      lastDistance: null,
    };
  }

  resetDragState() {
    this.dragState = this.createInitialDragState();
  }

  clearTouchState() {
    this.touchState.pointers.clear();
    this.touchState.tapCandidate = null;
    this.touchState.tapStart = null;
    this.touchState.lastCentroid = null;
    this.touchState.lastDistance = null;
  }

  async prepareEngine() {
    this.engine = new StockfishEngine({
      skillLevel: this.engineSkill,
      moveTime: this.engineMoveTime,
    });
    await this.engine.initialize();
    await this.engine.newGame();
  }

  async initialize() {
    this.renderer = new Renderer({ canvas: this.canvas });
    await this.renderer.initialize();
    this.renderer.setLightDirection(lightDirection);

    this.camera = new CameraController({ canvas: this.canvas, target: [0, 1.0, 0], radius: 12 });
    this.cameraInteraction.currentAnchor = this.camera.getNearestAnchorIndex();
    this.cameraInteraction.lastInputTime = this.getTimestamp();

    this.boardInstances = this.buildBoardInstances();
    this.renderer.setBoardInstances(this.boardInstances);
    this.updatePieces();
    this.updateHighlights();
    this.updateUI();

    this.attachEventListeners();
    this.handleResize();

    if (this.singlePlayer) {
      try {
        this.engineReadyPromise = this.prepareEngine();
        await this.engineReadyPromise;
      } catch (error) {
        console.error('Failed to initialize Stockfish engine', error);
        this.onMessage?.('Engine unavailable. Two-player mode active.');
        this.singlePlayer = false;
        this.engine = null;
        this.engineReadyPromise = null;
        this.engineThinking = false;
        this.emitState();
      }
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = null;
    requestAnimationFrame(this.renderFrame);
  }

  reset() {
    this.activeAnimations = [];
    this.animationInProgress = false;
    this.game.reset();
    this.selectedSquare = null;
    this.hoverSquare = null;
    this.legalMoves = [];
    this.resetDragState();
    this.clearTouchState();
    this.engineThinking = false;
    if (this.engine) {
      this.engine.stop();
      this.engineReadyPromise = this.engine
        .newGame()
        .catch((error) => {
          console.error('Failed to reset Stockfish engine', error);
        });
    }
    this.updatePieces();
    this.updateHighlights();
    this.updateUI();
    this.onMessage?.('');
  }

  attachEventListeners() {
    window.addEventListener('resize', this.onResize);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('keydown', this.handleKeyDown);
  }

  onResize() {
    this.handleResize();
    this.camera.updateProjection();
  }

  handleResize() {
    const devicePixelRatio = window.devicePixelRatio ?? 1;
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * devicePixelRatio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * devicePixelRatio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.renderer.resize(width, height);
      this.camera.updateProjection(width / height);
    }
  }

  renderFrame(timestamp) {
    if (!this.running) return;

    const now = typeof timestamp === 'number' ? timestamp : this.getTimestamp();
    const lastTime = this.lastFrameTime ?? now;
    const deltaSeconds = Math.max((now - lastTime) / 1000, 0);
    this.lastFrameTime = now;

    this.handleResize();

    if (this.autoAnchorEnabled) {
      this.updateAutoAnchor(now);
    }

    this.camera.update(deltaSeconds);

    this.updateAnimations(deltaSeconds);

    const cameraPosition = this.camera.getCameraPosition();
    const cameraTarget = this.camera.getTarget();
    this.renderer.updateCamera({ position: cameraPosition, target: cameraTarget });
    this.renderer.render();
    requestAnimationFrame(this.renderFrame);
  }

  buildBoardInstances() {
    const instances = [];
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const { x, z } = toWorldPosition(row, col);
        const matrix = createTransform(x, BOARD_HEIGHT_OFFSET, z, BOARD_SCALE);
        const isLight = (row + col) % 2 === 0;
        const color = isLight ? BOARD_COLORS.light : BOARD_COLORS.dark;
        instances.push({ matrix, color });
      }
    }
    return instances;
  }

  updatePieces() {
    const states = this.buildPieceStates();
    this.applyPieceStates(states);
    return states;
  }

  buildPieceStates() {
    const pieces = this.game.getPieces();
    const pieceStates = [];
    for (const piece of pieces) {
      const { x, z } = toWorldPosition(piece.row, piece.col);
      const baseColor = PIECE_BASE_COLORS[piece.color];
      const rotationY = piece.color === PieceColor.BLACK ? Math.PI : 0;
      const shapes = PIECE_SHAPES[piece.type] ?? PIECE_SHAPES[PieceType.PAWN];
      const fallbackLayers = buildFallbackLayers(shapes, baseColor);
      let kind = null;
      switch (piece.type) {
        case PieceType.KING:
          kind = 'king-model';
          break;
        case PieceType.QUEEN:
          kind = 'queen-model';
          break;
        case PieceType.BISHOP:
          kind = 'bishop-model';
          break;
        case PieceType.PAWN:
          kind = 'pawn-model';
          break;
        default:
          kind = null;
          break;
      }
      pieceStates.push({
        id: piece.id,
        type: piece.type,
        index: piece.index,
        color: baseColor,
        kind,
        position: [x, 0, z],
        rotationY,
        fallbackLayers,
      });
    }
    return pieceStates;
  }

  applyPieceStates(states, { updateRenderer = true } = {}) {
    this.currentPieceStates = Array.isArray(states) ? states : [];
    this.currentPieceStateMap = new Map(
      this.currentPieceStates.map((state) => [state.id, state]),
    );
    this.currentPieceIndexMap = new Map(
      this.currentPieceStates.map((state) => [state.index, state]),
    );
    if (updateRenderer) {
      this.renderer.updatePieceInstances(this.currentPieceStates);
    }
  }

  scheduleMoveAnimation({ result, context, previousIndexMap, previousIdMap, nextStates }) {
    if (!Array.isArray(nextStates) || nextStates.length === 0) {
      this.applyPieceStates(nextStates);
      this.renderer.updatePieceInstances(this.currentPieceStates);
      return;
    }

    const fromIndex = typeof context?.from === 'number' ? context.from : null;
    const toIndex = typeof context?.to === 'number' ? context.to : null;
    if (fromIndex === null || toIndex === null) {
      this.applyPieceStates(nextStates);
      this.renderer.updatePieceInstances(this.currentPieceStates);
      return;
    }

    const fromState = previousIndexMap.get(fromIndex);
    if (!fromState) {
      this.applyPieceStates(nextStates);
      this.renderer.updatePieceInstances(this.currentPieceStates);
      return;
    }

    const nextMap = new Map(nextStates.map((state) => [state.id, state]));
    const toState = nextMap.get(fromState.id);
    if (!toState) {
      this.applyPieceStates(nextStates);
      this.renderer.updatePieceInstances(this.currentPieceStates);
      return;
    }

    const movingEntry = this.renderer.getPieceEntry(fromState.id);
    if (!movingEntry) {
      this.applyPieceStates(nextStates);
      this.renderer.updatePieceInstances(this.currentPieceStates);
      return;
    }

    this.animationInProgress = true;

    this.renderer.setPieceBasePosition(fromState.id, toState.position);
    const startOffset = [
      fromState.position[0] - toState.position[0],
      fromState.position[1] - toState.position[1],
      fromState.position[2] - toState.position[2],
    ];
    this.renderer.setPieceOffset(fromState.id, startOffset);
    this.renderer.setPieceRotationOffset(fromState.id, 0);

    const moveAnim = {
      kind: 'move',
      pieceId: fromState.id,
      duration: this.animationSettings.moveDuration,
      elapsed: 0,
      startOffset,
      targetOffset: [0, 0, 0],
      liftHeight: this.animationSettings.liftHeight,
      blockers: [],
      completed: false,
    };
    this.activeAnimations.push(moveAnim);

    const capturedId = result?.captured?.id ?? null;
    const blockers = this.computeBlockingPieces({
      fromState,
      toState,
      previousStates: previousIdMap,
      capturedId,
    });

    blockers.forEach((blocker) => {
      this.renderer.setPieceOffset(blocker.id, [0, 0, 0]);
      const outAnim = {
        kind: 'sidestep',
        pieceId: blocker.id,
        duration: this.animationSettings.sidestepDuration,
        elapsed: 0,
        startOffset: [0, 0, 0],
        targetOffset: blocker.offset,
        completed: false,
        meta: { phase: 'out' },
      };
      this.activeAnimations.push(outAnim);
      moveAnim.blockers.push(blocker);
    });

    if (typeof capturedId === 'number' && previousIdMap.has(capturedId)) {
      const captureAnim = {
        kind: 'capture',
        pieceId: capturedId,
        duration: Math.max(this.animationSettings.moveDuration * 0.6, 0.2),
        elapsed: 0,
        startOffset: [0, 0, 0],
        targetOffset: [0, -0.8, 0],
        startScale: 1,
        endScale: 0.2,
        onComplete: () => {
          this.renderer.removePiece(capturedId);
        },
      };
      this.activeAnimations.push(captureAnim);
    }

    if (result?.castle?.rookFrom !== undefined && result?.castle?.rookTo !== undefined) {
      const rookFromState = previousIndexMap.get(result.castle.rookFrom);
      if (rookFromState) {
        const rookNextState = nextMap.get(rookFromState.id);
        if (rookNextState) {
          this.renderer.setPieceBasePosition(rookFromState.id, rookNextState.position);
          const rookOffset = [
            rookFromState.position[0] - rookNextState.position[0],
            rookFromState.position[1] - rookNextState.position[1],
            rookFromState.position[2] - rookNextState.position[2],
          ];
          this.renderer.setPieceOffset(rookFromState.id, rookOffset);
          this.renderer.setPieceRotationOffset(rookFromState.id, 0);
          const rookAnim = {
            kind: 'move',
            pieceId: rookFromState.id,
            duration: this.animationSettings.moveDuration * 0.8,
            elapsed: 0,
            startOffset: rookOffset,
            targetOffset: [0, 0, 0],
            liftHeight: this.animationSettings.liftHeight * 0.5,
            blockers: [],
            completed: false,
          };
          this.activeAnimations.push(rookAnim);
        }
      }
    }

    moveAnim.onComplete = () => {
      moveAnim.completed = true;
      moveAnim.blockers.forEach((blocker) => {
        this.activeAnimations.push({
          kind: 'sidestep',
          pieceId: blocker.id,
          duration: this.animationSettings.sidestepReturnDuration,
          elapsed: 0,
          startOffset: blocker.offset,
          targetOffset: [0, 0, 0],
          completed: false,
          meta: { phase: 'back' },
        });
      });
    };
  }

  computeBlockingPieces({ fromState, toState, previousStates, capturedId }) {
    const blockers = [];
    if (!fromState || !toState) {
      return blockers;
    }

    const start = fromState.position;
    const end = toState.position;
    const dx = end[0] - start[0];
    const dz = end[2] - start[2];
    const length = Math.hypot(dx, dz);
    if (length < 1e-4) {
      return blockers;
    }

    const dirX = dx / length;
    const dirZ = dz / length;
    const perpX = -dirZ;
    const perpZ = dirX;
    const threshold = 0.6;

    for (const state of previousStates.values()) {
      if (!state || state.id === fromState.id || state.id === capturedId) {
        continue;
      }
      const px = state.position[0] - start[0];
      const pz = state.position[2] - start[2];
      const t = (px * dirX + pz * dirZ) / length;
      if (t <= 0 || t >= 1) {
        continue;
      }
      const closestX = start[0] + dirX * t * length;
      const closestZ = start[2] + dirZ * t * length;
      const offsetX = state.position[0] - closestX;
      const offsetZ = state.position[2] - closestZ;
      const distance = Math.hypot(offsetX, offsetZ);
      if (distance > threshold) {
        continue;
      }
      const sideSign = Math.sign(offsetX * perpX + offsetZ * perpZ) || 1;
      const offset = [
        perpX * sideSign * this.animationSettings.sidestepDistance,
        0,
        perpZ * sideSign * this.animationSettings.sidestepDistance,
      ];
      blockers.push({ id: state.id, offset, distance, t });
    }
    return blockers;
  }

  updateAnimations(deltaSeconds) {
    if (!this.animationInProgress && this.activeAnimations.length === 0) {
      return;
    }

    const completed = [];

    for (const anim of this.activeAnimations) {
      anim.elapsed += deltaSeconds;
      const progress = Math.min(anim.elapsed / Math.max(anim.duration, 1e-6), 1);
      const eased = easeInOutCubic(progress);

      if (anim.kind === 'move') {
        const currentOffset = [
          anim.startOffset[0] * (1 - eased),
          anim.startOffset[1] * (1 - eased),
          anim.startOffset[2] * (1 - eased),
        ];
        currentOffset[1] += Math.sin(eased * Math.PI) * anim.liftHeight;
        this.renderer.setPieceOffset(anim.pieceId, currentOffset);
        if (progress >= 1) {
          this.renderer.setPieceOffset(anim.pieceId, [0, 0, 0]);
          completed.push(anim);
        }
      } else if (anim.kind === 'sidestep') {
        const currentOffset = [
          anim.startOffset[0] + (anim.targetOffset[0] - anim.startOffset[0]) * eased,
          anim.startOffset[1] + (anim.targetOffset[1] - anim.startOffset[1]) * eased,
          anim.startOffset[2] + (anim.targetOffset[2] - anim.startOffset[2]) * eased,
        ];
        this.renderer.setPieceOffset(anim.pieceId, currentOffset);
        if (progress >= 1) {
          this.renderer.setPieceOffset(anim.pieceId, anim.targetOffset);
          completed.push(anim);
        }
      } else if (anim.kind === 'capture') {
        const currentOffset = [
          anim.startOffset[0] + (anim.targetOffset[0] - anim.startOffset[0]) * eased,
          anim.startOffset[1] + (anim.targetOffset[1] - anim.startOffset[1]) * eased,
          anim.startOffset[2] + (anim.targetOffset[2] - anim.startOffset[2]) * eased,
        ];
        this.renderer.setPieceOffset(anim.pieceId, currentOffset);
        const scale = anim.startScale + (anim.endScale - anim.startScale) * eased;
        const entry = this.renderer.getPieceEntry(anim.pieceId);
        if (entry?.root?.scaling) {
          entry.root.scaling.copyFromFloats(scale, Math.max(scale, 0.1), scale);
        }
        if (progress >= 1) {
          completed.push(anim);
        }
      }
    }

    if (completed.length > 0) {
      this.activeAnimations = this.activeAnimations.filter((anim) => !completed.includes(anim));
      for (const anim of completed) {
        if (typeof anim.onComplete === 'function') {
          anim.onComplete(anim);
        }
      }
    }

    if (this.activeAnimations.length === 0 && this.animationInProgress) {
      this.animationInProgress = false;
      this.renderer.updatePieceInstances(this.currentPieceStates);
      // Reset captured piece scales in case update reuses materials
      for (const state of this.currentPieceStates) {
        const entry = this.renderer.getPieceEntry(state.id);
        if (entry?.root?.scaling) {
          entry.root.scaling.copyFromFloats(1, 1, 1);
        }
      }
    }
  }

  updateHighlights() {
    const highlightInstances = [];
    const addHighlight = (index, color, scale = [0.96, 0.05, 0.96], height = 0.02) => {
      const row = Math.floor(index / 8);
      const col = index % 8;
      const { x, z } = toWorldPosition(row, col);
      const matrix = createTransform(x, height, z, scale);
      highlightInstances.push({ matrix, color });
    };

    const state = this.game.getState();

    if (state.lastMove) {
      addHighlight(state.lastMove.from, HIGHLIGHT_COLORS.recent, [0.92, 0.03, 0.92], 0.03);
      addHighlight(state.lastMove.to, HIGHLIGHT_COLORS.recent, [0.92, 0.03, 0.92], 0.03);
      if (state.lastMove.rook) {
        addHighlight(state.lastMove.rook.from, HIGHLIGHT_COLORS.recent, [0.92, 0.03, 0.92], 0.03);
        addHighlight(state.lastMove.rook.to, HIGHLIGHT_COLORS.recent, [0.92, 0.03, 0.92], 0.03);
      }
    }

    if (this.hoverSquare !== null && this.hoverSquare !== this.selectedSquare) {
      addHighlight(this.hoverSquare, HIGHLIGHT_COLORS.hover, [0.97, 0.04, 0.97], 0.025);
    }

    if (this.selectedSquare !== null) {
      addHighlight(this.selectedSquare, HIGHLIGHT_COLORS.selected, [0.98, 0.05, 0.98], 0.04);
      for (const move of this.legalMoves) {
        const targetPiece = this.game.getPieceAt(move.to);
        const color = targetPiece ? HIGHLIGHT_COLORS.capture : HIGHLIGHT_COLORS.legal;
        addHighlight(move.to, color, [0.85, 0.03, 0.85], 0.035);
      }
    }

    this.renderer.setHighlightInstances(highlightInstances);
  }

  emitState(extra = {}) {
    const state = this.game.getState();
    const winner = state.winner;
    const turnLabel = winner
      ? winner === 'draw'
        ? 'Game over: Draw'
        : `Winner: ${capitalize(winner)}`
      : `${capitalize(state.currentPlayer)} to move`;
    const checkLabel = !winner && state.inCheck ? `${capitalize(state.inCheck)} is in check!` : '';
    this.onStateChange?.({
      turnLabel,
      checkLabel,
      history: state.history,
      engineThinking: this.engineThinking,
      singlePlayer: this.singlePlayer,
      humanColor: this.humanColor,
      engineColor: this.engineColor,
      winner,
      currentPlayer: state.currentPlayer,
      ...extra,
    });
  }

  updateUI(extra = {}) {
    this.emitState(extra);
  }

  handleKeyDown(event) {
    if (event.defaultPrevented) return;
  }

  getTimestamp() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  markCameraInteraction(active = true) {
    if (!this.camera) {
      return;
    }
    const now = this.getTimestamp();
    this.cameraInteraction.lastInputTime = now;
    if (active) {
      this.cameraInteraction.active = true;
      this.cameraInteraction.returning = false;
    }
  }

  endCameraInteraction() {
    if (!this.camera) {
      return;
    }
    this.cameraInteraction.active = false;
    this.cameraInteraction.lastInputTime = this.getTimestamp();
  }

  updateAutoAnchor(nowMs) {
    if (!this.camera) {
      return;
    }
    const interaction = this.cameraInteraction;
    if (interaction.active) {
      return;
    }
    if (!this.autoAnchorEnabled) {
      interaction.returning = false;
      return;
    }

    if (!interaction.returning) {
      if (nowMs - interaction.lastInputTime >= this.anchorSnapDelayMs) {
        interaction.currentAnchor = this.camera.snapToNearestAnchor({ immediate: false });
        interaction.returning = true;
        interaction.lastInputTime = nowMs;
      }
      return;
    }

    if (interaction.returning && this.camera.isSettled()) {
      interaction.returning = false;
      interaction.currentAnchor = this.camera.getNearestAnchorIndex();
      interaction.lastInputTime = nowMs;
      this.notifyAnchorSnap();
    }
  }

  notifyAnchorSnap() {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(10);
      } catch (error) {
        // Ignore vibration errors (e.g., permissions)
      }
    }
  }

  capturePointer(event) {
    if (typeof this.canvas.setPointerCapture === 'function') {
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch (error) {
        // Ignore failures to capture pointer
      }
    }
  }

  releasePointer(event) {
    if (typeof this.canvas.releasePointerCapture === 'function') {
      try {
        if (!this.canvas.hasPointerCapture || this.canvas.hasPointerCapture(event.pointerId)) {
          this.canvas.releasePointerCapture(event.pointerId);
        }
      } catch (error) {
        // Ignore failures to release pointer
      }
    }
  }

  updateHoverSquare(clientX, clientY) {
    const square = this.pickSquare(clientX, clientY);
    if (square !== this.hoverSquare) {
      this.hoverSquare = square;
      this.updateHighlights();
    }
  }

  initializeMultiTouchGesture() {
    const points = Array.from(this.touchState.pointers.values());
    if (points.length < 2) {
      this.touchState.lastCentroid = null;
      this.touchState.lastDistance = null;
      return;
    }
    this.touchState.lastCentroid = this.computeCentroid(points);
    this.touchState.lastDistance = this.computeDistance(points[0], points[1]);
  }

  handleSingleTouchMove(event) {
    if (!this.dragState.active || this.dragState.pointerId !== event.pointerId) {
      this.dragState = {
        active: true,
        pointerId: event.pointerId,
        pointerType: 'touch',
        button: 0,
        lastX: event.clientX,
        lastY: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        usedCamera: false,
      };
      this.touchState.tapCandidate = event.pointerId;
      this.touchState.tapStart = {
        x: event.clientX,
        y: event.clientY,
        time: this.getTimestamp(),
      };
      return;
    }

    const dx = event.clientX - this.dragState.lastX;
    const dy = event.clientY - this.dragState.lastY;
    const totalDx = event.clientX - this.dragState.startX;
    const totalDy = event.clientY - this.dragState.startY;
    const distance = Math.hypot(totalDx, totalDy);

    if (!this.dragState.moved && distance > 6) {
      this.dragState.moved = true;
      if (this.touchState.tapCandidate === event.pointerId) {
        this.touchState.tapCandidate = null;
      }
    }

    if (this.dragState.moved) {
      const orbitX = dx;
      const orbitY = dy * 0.6;
      this.camera.orbit(orbitX, orbitY, { immediate: true });
      this.dragState.usedCamera = true;
      this.markCameraInteraction(true);
    }

    this.dragState.lastX = event.clientX;
    this.dragState.lastY = event.clientY;
  }

  handleMultiTouchGesture() {
    const points = Array.from(this.touchState.pointers.values());
    if (points.length < 2) {
      return;
    }

    this.touchState.tapCandidate = null;

    const centroid = this.computeCentroid(points);
    if (this.touchState.lastCentroid) {
      const deltaX = centroid.x - this.touchState.lastCentroid.x;
      const deltaY = centroid.y - this.touchState.lastCentroid.y;
      if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
        this.camera.pan(deltaX, deltaY, { immediate: true });
        this.markCameraInteraction(true);
      }
    }

    const [first, second] = points;
    const distance = this.computeDistance(first, second);
    if (this.touchState.lastDistance) {
      const delta = this.touchState.lastDistance - distance;
      if (Math.abs(delta) > 0.5) {
        this.camera.zoom(delta * 0.5, { immediate: true });
        this.markCameraInteraction(true);
      }
    }

    this.touchState.lastCentroid = centroid;
    this.touchState.lastDistance = distance;
  }

  computeCentroid(points) {
    if (points.length === 0) {
      return { x: 0, y: 0 };
    }
    const sum = points.reduce(
      (acc, point) => {
        acc.x += point.x;
        acc.y += point.y;
        return acc;
      },
      { x: 0, y: 0 },
    );
    return { x: sum.x / points.length, y: sum.y / points.length };
  }

  computeDistance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  canSelectPieces() {
    if (this.animationInProgress) {
      return false;
    }
    if (!this.singlePlayer) {
      return true;
    }
    if (this.engineThinking) {
      return false;
    }
    return this.game.currentPlayer === this.humanColor;
  }

  handlePointerDown(event) {
    event.preventDefault();
    if (event.pointerType === 'touch') {
      this.markCameraInteraction(true);
      this.touchState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.touchState.pointers.size === 1) {
        this.dragState = {
          active: true,
          pointerId: event.pointerId,
        pointerType: 'touch',
        button: 0,
        lastX: event.clientX,
        lastY: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        usedCamera: false,
      };
        this.touchState.tapCandidate = event.pointerId;
        this.touchState.tapStart = {
          x: event.clientX,
          y: event.clientY,
          time: this.getTimestamp(),
        };
      } else if (this.touchState.pointers.size === 2) {
        this.touchState.tapCandidate = null;
        this.resetDragState();
        this.initializeMultiTouchGesture();
      } else {
        this.touchState.tapCandidate = null;
        this.resetDragState();
        this.initializeMultiTouchGesture();
      }
    } else {
      if (event.button === 0 && this.canSelectPieces()) {
        const square = this.pickSquare(event.clientX, event.clientY);
        if (square !== null) {
          this.handleSquareSelection(square);
        }
      }
      if (event.button !== 0 || event.shiftKey) {
        this.markCameraInteraction(true);
      }
      this.dragState = {
        active: true,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        button: event.button,
        lastX: event.clientX,
        lastY: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        usedCamera: false,
      };
    }

    this.capturePointer(event);
  }

  handlePointerMove(event) {
    if (event.pointerType === 'touch') {
      if (!this.touchState.pointers.has(event.pointerId)) {
        return;
      }
      this.touchState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.touchState.pointers.size >= 2) {
        this.handleMultiTouchGesture();
      } else {
        this.handleSingleTouchMove(event);
      }
      return;
    }

    this.updateHoverSquare(event.clientX, event.clientY);

    if (!this.dragState.active || this.dragState.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - this.dragState.lastX;
   const dy = event.clientY - this.dragState.lastY;

    if (this.dragState.button === 2) {
      this.camera.orbit(dx, dy, { immediate: true });
      if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
        this.dragState.usedCamera = true;
        this.markCameraInteraction(true);
      }
    } else if (this.dragState.button === 1 || (event.shiftKey && this.dragState.button === 0)) {
      this.camera.pan(dx, dy, { immediate: true });
      if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
        this.dragState.usedCamera = true;
        this.markCameraInteraction(true);
      }
    }

    this.dragState.lastX = event.clientX;
    this.dragState.lastY = event.clientY;
  }

  handlePointerUp(event) {
    event.preventDefault();
    this.releasePointer(event);

    if (event.pointerType === 'touch') {
      const pointerInfo = this.touchState.pointers.get(event.pointerId);
      this.touchState.pointers.delete(event.pointerId);

      const tapCandidate = this.touchState.tapCandidate;
      const tapStart = this.touchState.tapStart;
      let wasTap = false;
      if (tapCandidate === event.pointerId && tapStart) {
        const endX = pointerInfo ? pointerInfo.x : event.clientX;
        const endY = pointerInfo ? pointerInfo.y : event.clientY;
        const movement = Math.hypot(endX - tapStart.x, endY - tapStart.y);
        const duration = this.getTimestamp() - tapStart.time;
        if (movement < 12 && duration < 500) {
          wasTap = true;
        }
      }

      if (wasTap && this.canSelectPieces()) {
        const square = this.pickSquare(event.clientX, event.clientY);
        if (square !== null) {
          this.handleSquareSelection(square);
        }
      }

      if (this.touchState.pointers.size === 1) {
        const [remainingId, position] = this.touchState.pointers.entries().next().value;
        this.dragState = {
          active: true,
          pointerId: remainingId,
          pointerType: 'touch',
          button: 0,
          lastX: position.x,
          lastY: position.y,
          startX: position.x,
          startY: position.y,
          moved: false,
          usedCamera: false,
        };
        this.touchState.tapCandidate = remainingId;
        this.touchState.tapStart = {
          x: position.x,
          y: position.y,
          time: this.getTimestamp(),
        };
        this.touchState.lastCentroid = null;
        this.touchState.lastDistance = null;
        this.markCameraInteraction(true);
      } else if (this.touchState.pointers.size >= 2) {
        this.initializeMultiTouchGesture();
        this.markCameraInteraction(true);
      } else {
        this.resetDragState();
        this.touchState.tapCandidate = null;
        this.touchState.tapStart = null;
        this.touchState.lastCentroid = null;
        this.touchState.lastDistance = null;
        this.endCameraInteraction();
      }
      return;
    }

    if (this.dragState.pointerId === event.pointerId) {
      this.resetDragState();
      this.endCameraInteraction();
    }
  }

  handlePointerLeave(event) {
    if (event.pointerType === 'touch') {
      return;
    }
    if (this.hoverSquare !== null) {
      this.hoverSquare = null;
      this.updateHighlights();
    }
  }

  handleWheel(event) {
    event.preventDefault();
    this.camera.zoom(event.deltaY, { immediate: true });
    this.markCameraInteraction(false);
  }

  handleSquareSelection(squareIndex) {
    if (!this.canSelectPieces()) {
      return;
    }
    if (this.selectedSquare !== null) {
      const move = this.legalMoves.find((m) => m.to === squareIndex);
      if (move) {
        const fromIndex = this.selectedSquare;
        const toIndex = squareIndex;
        const result = this.game.move(fromIndex, toIndex);
        if (result.success) {
          this.processMoveResult(result, { from: fromIndex, to: toIndex });
          return;
        }
      }
    }

    const piece = this.game.getPieceAt(squareIndex);
    if (piece && piece.color === this.game.currentPlayer) {
      this.selectedSquare = squareIndex;
      this.legalMoves = this.game.getLegalMoves(squareIndex);
    } else {
      this.selectedSquare = null;
      this.legalMoves = [];
    }
    this.updateHighlights();
  }

  processMoveResult(result, context = {}) {
    this.selectedSquare = null;
    this.legalMoves = [];
    this.hoverSquare = null;
    const previousIndexMap = this.currentPieceIndexMap ?? new Map();
    const previousIdMap = this.currentPieceStateMap ?? new Map();
    const nextStates = this.buildPieceStates();

    this.scheduleMoveAnimation({
      result,
      context,
      previousIndexMap,
      previousIdMap,
      nextStates,
    });

    this.applyPieceStates(nextStates, { updateRenderer: false });
    this.updateHighlights();
    this.updateUI();

    let message = '';
    if (result.checkmate) {
      message = `Checkmate! ${capitalize(result.winner)} wins.`;
    } else if (result.stalemate) {
      message = 'Stalemate. The game is a draw.';
    } else if (result.check) {
      message = `${capitalize(result.check)} is in check.`;
    }
    this.onMessage?.(message);

    if (this.singlePlayer) {
      if (result.movedColor === this.humanColor && !result.checkmate && !result.stalemate && !this.game.winner) {
        this.requestEngineMove();
      } else if (result.movedColor === this.engineColor) {
        this.engineThinking = false;
        this.emitState();
      }
    }
  }

  parseUCIMove(uci) {
    if (typeof uci !== 'string' || uci.length < 4) {
      return null;
    }
    const files = 'abcdefgh';
    const fromFile = files.indexOf(uci[0]);
    const fromRank = Number.parseInt(uci[1], 10);
    const toFile = files.indexOf(uci[2]);
    const toRank = Number.parseInt(uci[3], 10);
    if (fromFile < 0 || toFile < 0 || Number.isNaN(fromRank) || Number.isNaN(toRank)) {
      return null;
    }
    if (fromRank < 1 || fromRank > 8 || toRank < 1 || toRank > 8) {
      return null;
    }
    const fromRow = 8 - fromRank;
    const toRow = 8 - toRank;
    const fromIndex = fromRow * 8 + fromFile;
    const toIndex = toRow * 8 + toFile;
    if (fromIndex < 0 || fromIndex >= 64 || toIndex < 0 || toIndex >= 64) {
      return null;
    }
    let promotion = null;
    if (uci.length >= 5) {
      const promotionMap = {
        q: PieceType.QUEEN,
        r: PieceType.ROOK,
        b: PieceType.BISHOP,
        n: PieceType.KNIGHT,
      };
      promotion = promotionMap[uci[4].toLowerCase()] ?? null;
    }
    return { from: fromIndex, to: toIndex, promotion };
  }

  async requestEngineMove() {
    if (!this.singlePlayer || !this.engine) {
      return;
    }
    if (this.game.winner || this.game.currentPlayer !== this.engineColor) {
      return;
    }
    if (this.engineReadyPromise) {
      try {
        await this.engineReadyPromise;
      } catch (error) {
        console.error('Engine initialization failed', error);
        this.singlePlayer = false;
        this.engineThinking = false;
        this.onMessage?.('Engine unavailable. Two-player mode active.');
        this.emitState();
        return;
      }
    }

    this.engineThinking = true;
    this.emitState();

    try {
      const fen = this.game.getFEN();
      const move = await this.engine.getBestMove(fen);
      if (!move) {
        throw new Error('Engine returned no move');
      }
      const parsed = this.parseUCIMove(move);
      if (!parsed) {
        throw new Error(`Invalid move string: ${move}`);
      }
      const result = this.game.move(parsed.from, parsed.to, parsed.promotion ?? null);
      if (!result.success) {
        throw new Error(result.message ?? 'Engine move rejected');
      }
      this.processMoveResult(result, parsed);
    } catch (error) {
      console.error('Stockfish move error', error);
      this.engineThinking = false;
      this.emitState();
      this.onMessage?.('Engine error: unable to make a move.');
    }
  }

  pickSquare(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;

    const inverseVP = this.camera.getInverseViewProjectionMatrix();
    const nearPoint4 = transformPoint(inverseVP, [ndcX, ndcY, -1, 1]);
    const farPoint4 = transformPoint(inverseVP, [ndcX, ndcY, 1, 1]);

    const nearPoint = nearPoint4.map((v, i, arr) => v / arr[3]);
    const farPoint = farPoint4.map((v, i, arr) => v / arr[3]);

    const rayOrigin = nearPoint;
    const rayDir = normalize([
      farPoint[0] - nearPoint[0],
      farPoint[1] - nearPoint[1],
      farPoint[2] - nearPoint[2],
    ]);

    if (Math.abs(rayDir[1]) < 1e-5) {
      return null;
    }

    const t = -rayOrigin[1] / rayDir[1];
    if (t <= 0) {
      return null;
    }

    const hitX = rayOrigin[0] + rayDir[0] * t;
    const hitZ = rayOrigin[2] + rayDir[2] * t;

    if (hitX < -4 || hitX >= 4 || hitZ < -4 || hitZ >= 4) {
      return null;
    }

    const col = Math.floor(hitX + 4);
    const row = Math.floor(4 - hitZ);
    if (row < 0 || row > 7 || col < 0 || col > 7) {
      return null;
    }
    return row * 8 + col;
  }
}
