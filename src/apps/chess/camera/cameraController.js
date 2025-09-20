import { mat4 } from '../../../math/mat4.js';
import { vec3 } from '../../../math/vec3.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(theta) {
  let angle = theta;
  const tau = Math.PI * 2;
  angle = ((angle % tau) + tau) % tau;
  if (angle > Math.PI) {
    angle -= tau;
  }
  return angle;
}

export class CameraController {
  constructor({ canvas, target = [0, 0, 0], radius = 12 }) {
    this.canvas = canvas;
    this.target = new Float32Array(target);
    this.targetGoal = new Float32Array(target);
    this.defaultTarget = new Float32Array(target);

    this.radius = radius;
    this.targetRadius = radius;
    this.minRadius = 6;
    this.maxRadius = 24;

    this.theta = Math.PI * 0.25;
    this.phi = Math.PI * 0.35;
    this.targetTheta = this.theta;
    this.targetPhi = this.phi;
    this.defaultPhi = this.phi;
    this.minPhi = 0.05;
    this.maxPhi = Math.PI * 0.48;
    this.up = new Float32Array([0, 1, 0]);

    this.smoothFactor = 0.16;
    this.radiusSmoothFactor = 0.18;

    this.anchors = [
      { theta: Math.PI * 0.25, phi: this.defaultPhi, label: 'corner-front-left', haptics: true },
      { theta: Math.PI * 0.75, phi: this.defaultPhi, label: 'corner-back-left', haptics: true },
      { theta: -Math.PI * 0.25, phi: this.defaultPhi, label: 'corner-front-right', haptics: true },
      { theta: -Math.PI * 0.75, phi: this.defaultPhi, label: 'corner-back-right', haptics: true },
      { theta: Math.PI * 0.5, phi: this.defaultPhi, label: 'side-left', haptics: true },
      { theta: -Math.PI * 0.5, phi: this.defaultPhi, label: 'side-right', haptics: true },
      { theta: 0, phi: this.defaultPhi, label: 'side-front', haptics: true },
      { theta: Math.PI, phi: this.defaultPhi, label: 'side-back', haptics: true },
      { theta: 0, phi: 0.1, label: 'top-down', haptics: true },
    ];

    this.viewMatrix = mat4.create();
    this.projectionMatrix = mat4.create();
    this.viewProjectionMatrix = mat4.create();
    this.cameraPosition = new Float32Array(3);
    this.inverseViewProjection = mat4.create();

    this.needsUpdate = true;
    this.updateProjection();
    this.updateView();
  }

  updateProjection(aspect) {
    const width = this.canvas.clientWidth || this.canvas.width;
    const height = this.canvas.clientHeight || this.canvas.height;
    const targetAspect = aspect ?? width / Math.max(height, 1);
    mat4.perspective(this.projectionMatrix, Math.PI / 4, targetAspect, 0.1, 100.0);
    this.needsUpdate = true;
  }

  update(deltaSeconds = 1 / 60) {
    const factor = 1 - Math.pow(1 - this.smoothFactor, deltaSeconds * 60);
    const radiusFactor = 1 - Math.pow(1 - this.radiusSmoothFactor, deltaSeconds * 60);

    let changed = false;

    const thetaDiff = normalizeAngle(this.targetTheta - this.theta);
    if (Math.abs(thetaDiff) > 1e-4) {
      this.theta = normalizeAngle(this.theta + thetaDiff * factor);
      changed = true;
    } else if (this.theta !== this.targetTheta) {
      this.theta = this.targetTheta;
      changed = true;
    }

    const phiDiff = this.targetPhi - this.phi;
    if (Math.abs(phiDiff) > 1e-4) {
      this.phi += phiDiff * factor;
      changed = true;
    } else if (this.phi !== this.targetPhi) {
      this.phi = this.targetPhi;
      changed = true;
    }

    const radiusDiff = this.targetRadius - this.radius;
    if (Math.abs(radiusDiff) > 1e-3) {
      this.radius += radiusDiff * radiusFactor;
      changed = true;
    } else if (this.radius !== this.targetRadius) {
      this.radius = this.targetRadius;
      changed = true;
    }

    for (let i = 0; i < 3; i += 1) {
      const diff = this.targetGoal[i] - this.target[i];
      if (Math.abs(diff) > 1e-4) {
        this.target[i] += diff * factor;
        changed = true;
      } else if (this.target[i] !== this.targetGoal[i]) {
        this.target[i] = this.targetGoal[i];
        changed = true;
      }
    }

    if (changed) {
      this.needsUpdate = true;
    }

    if (this.needsUpdate) {
      this.updateView();
    }
  }

  updateView() {
    const sinPhi = Math.sin(this.phi);
    const cosPhi = Math.cos(this.phi);
    const sinTheta = Math.sin(this.theta);
    const cosTheta = Math.cos(this.theta);

    const x = this.target[0] + this.radius * sinTheta * sinPhi;
    const y = this.target[1] + this.radius * cosPhi;
    const z = this.target[2] + this.radius * cosTheta * sinPhi;

    this.cameraPosition[0] = x;
    this.cameraPosition[1] = y;
    this.cameraPosition[2] = z;

    mat4.lookAt(this.viewMatrix, this.cameraPosition, this.target, this.up);
    mat4.multiply(this.viewProjectionMatrix, this.projectionMatrix, this.viewMatrix);
    mat4.invert(this.inverseViewProjection, this.viewProjectionMatrix);
    this.needsUpdate = false;
  }

  applyImmediate() {
    this.theta = this.targetTheta;
    this.phi = this.targetPhi;
    this.radius = this.targetRadius;
    this.target.set(this.targetGoal);
    this.needsUpdate = true;
    this.updateView();
  }

  orbit(deltaX, deltaY, { immediate = false } = {}) {
    const orbitSpeed = 0.009;
    this.targetTheta = normalizeAngle(this.targetTheta - deltaX * orbitSpeed);
    this.targetPhi = clamp(this.targetPhi + deltaY * orbitSpeed, this.minPhi, this.maxPhi);
    if (immediate) {
      this.applyImmediate();
    }
  }

  zoom(delta, { immediate = false } = {}) {
    const factor = 1 + delta * 0.0015;
    this.targetRadius = clamp(this.targetRadius * factor, this.minRadius, this.maxRadius);
    if (immediate) {
      this.applyImmediate();
    }
  }

  pan(deltaX, deltaY, { immediate = false } = {}) {
    const forward = vec3.create();
    const right = vec3.create();
    const upVec = vec3.create();
    vec3.subtract(forward, this.target, this.cameraPosition);
    vec3.normalize(forward, forward);
    vec3.cross(right, forward, this.up);
    vec3.normalize(right, right);
    vec3.cross(upVec, right, forward);

    const panSpeed = 0.004 * this.radius;
    const offsetX = (-deltaX * panSpeed) * right[0] + (deltaY * panSpeed) * upVec[0];
    const offsetY = (-deltaX * panSpeed) * right[1] + (deltaY * panSpeed) * upVec[1];
    const offsetZ = (-deltaX * panSpeed) * right[2] + (deltaY * panSpeed) * upVec[2];

    this.targetGoal[0] += offsetX;
    this.targetGoal[1] += offsetY;
    this.targetGoal[2] += offsetZ;

    if (immediate) {
      this.applyImmediate();
    }
  }

  resetTarget({ immediate = false } = {}) {
    this.targetGoal.set(this.defaultTarget);
    if (immediate) {
      this.applyImmediate();
    }
  }

  setAnchor(index, { immediate = false } = {}) {
    const anchor = this.anchors[index % this.anchors.length];
    if (!anchor) return;
    this.targetTheta = normalizeAngle(anchor.theta);
    this.targetPhi = clamp(anchor.phi, this.minPhi, this.maxPhi);
    this.resetTarget({ immediate: false });
    if (immediate) {
      this.applyImmediate();
    }
  }

  snapToNearestAnchor({ immediate = false } = {}) {
    const index = this.getNearestAnchorIndex(this.targetTheta, this.targetPhi);
    this.setAnchor(index, { immediate });
    return index;
  }

  getNearestAnchorIndex(targetTheta = this.theta, targetPhi = this.phi) {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.anchors.length; i += 1) {
      const anchor = this.anchors[i];
      const thetaDiff = Math.abs(normalizeAngle(targetTheta - anchor.theta));
      const phiDiff = Math.abs(targetPhi - anchor.phi);
      const score = thetaDiff * 0.8 + phiDiff;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  getViewProjectionMatrix() {
    if (this.needsUpdate) {
      this.updateView();
    }
    return this.viewProjectionMatrix;
  }

  getInverseViewProjectionMatrix() {
    if (this.needsUpdate) {
      this.updateView();
    }
    return this.inverseViewProjection;
  }

  getCameraPosition() {
    if (this.needsUpdate) {
      this.updateView();
    }
    return this.cameraPosition;
  }

  isSettled({ angleThreshold = 0.01, radiusThreshold = 0.02, positionThreshold = 0.02 } = {}) {
    const thetaDiff = Math.abs(normalizeAngle(this.theta - this.targetTheta));
    const phiDiff = Math.abs(this.phi - this.targetPhi);
    const radiusDiff = Math.abs(this.radius - this.targetRadius);

    if (thetaDiff > angleThreshold || phiDiff > angleThreshold || radiusDiff > radiusThreshold) {
      return false;
    }

    for (let i = 0; i < 3; i += 1) {
      if (Math.abs(this.target[i] - this.targetGoal[i]) > positionThreshold) {
        return false;
      }
    }

    return true;
  }
}
