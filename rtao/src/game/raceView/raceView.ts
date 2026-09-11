import * as THREE from "three";
import { renderPng } from "../renderCapture";
import { RaceCourseModel, type RaceCoursePresentationStats } from "./courseModel";

export interface RacePose {
  /** Course render coordinates, after the established X reflection. */
  readonly position: readonly [number, number, number];
  readonly yaw: number;
  readonly pitch?: number;
  readonly roll?: number;
}

export interface RaceEntrantPresentation {
  readonly id: string;
  readonly object: THREE.Object3D;
  readonly pose: RacePose;
  readonly visible?: boolean;
}

export interface RaceCameraPose {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

export interface RaceCaptureSize {
  readonly width: number;
  readonly height: number;
}

export function applyRacePose(object: THREE.Object3D, pose: RacePose): void {
  object.position.set(...pose.position);
  object.rotation.order = "YXZ";
  object.rotation.set(-(pose.pitch ?? 0), pose.yaw, pose.roll ?? 0);
}

export function applyRaceCameraPose(camera: THREE.PerspectiveCamera, pose: RaceCameraPose): void {
  camera.position.set(...pose.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld(true);
}

/** Presentation container only. Supplied objects remain owned/disposed by the caller. */
export class RaceEntrantLayer extends THREE.Group {
  private readonly entrants = new Map<string, THREE.Object3D>();

  constructor() {
    super();
    this.name = "race entrants";
  }

  setEntrants(entries: readonly RaceEntrantPresentation[]): void {
    const ids = new Set<string>();
    const objects = new Set<THREE.Object3D>();
    for (const entry of entries) {
      if (!entry.id || ids.has(entry.id)) throw new Error(`Duplicate or empty race entrant ID '${entry.id}'.`);
      if (objects.has(entry.object)) throw new Error(`Race entrant object is reused by more than one ID.`);
      ids.add(entry.id);
      objects.add(entry.object);
    }

    this.clearEntrants();
    for (const entry of entries) {
      applyRacePose(entry.object, entry.pose);
      entry.object.visible = entry.visible ?? true;
      this.entrants.set(entry.id, entry.object);
      this.add(entry.object);
    }
  }

  updatePose(id: string, pose: RacePose): void {
    const object = this.entrants.get(id);
    if (!object) throw new Error(`Unknown race entrant '${id}'.`);
    applyRacePose(object, pose);
  }

  setVisible(id: string, visible: boolean): void {
    const object = this.entrants.get(id);
    if (!object) throw new Error(`Unknown race entrant '${id}'.`);
    object.visible = visible;
  }

  entrant(id: string): THREE.Object3D | undefined {
    return this.entrants.get(id);
  }

  clearEntrants(): void {
    for (const object of this.entrants.values()) object.removeFromParent();
    this.entrants.clear();
  }
}

export class RaceView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(54, 1, 1, 20_000);
  readonly entrants = new RaceEntrantLayer();
  private readonly resizeObserver: ResizeObserver;
  private course?: RaceCourseModel;
  private cameraPose: RaceCameraPose = {
    position: [1180, 310, 1120],
    target: [800, 28, 800],
  };

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x91c2dc, 1);
    this.renderer.domElement.className = "race-canvas";
    this.host.append(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x91c2dc);
    this.scene.add(this.entrants);
    applyRaceCameraPose(this.camera, this.cameraPose);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
  }

  loadCourse(courseId: number, compiledBytes: Uint8Array): RaceCoursePresentationStats {
    this.course?.dispose();
    const course = RaceCourseModel.fromBytes(courseId, compiledBytes);
    this.course = course;
    this.scene.add(course);
    return course.stats;
  }

  setEntrants(entries: readonly RaceEntrantPresentation[]): void {
    this.entrants.setEntrants(entries);
  }

  setCameraPose(pose: RaceCameraPose): void {
    this.cameraPose = {
      position: [...pose.position],
      target: [...pose.target],
    };
    applyRaceCameraPose(this.camera, this.cameraPose);
  }

  renderOnce(): void {
    this.renderer.render(this.scene, this.camera);
  }

  async capturePng(size: RaceCaptureSize, pose: RaceCameraPose = this.cameraPose): Promise<Blob> {
    validateCaptureSize(size);
    const camera = this.camera.clone();
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
    applyRaceCameraPose(camera, pose);
    return await renderPng(this.renderer, size.width, size.height, () => {
      this.renderer.clear(true, true, true);
      this.renderer.render(this.scene, camera);
    });
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.entrants.clearEntrants();
    this.course?.dispose();
    this.course = undefined;
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}

function validateCaptureSize(size: RaceCaptureSize): void {
  if (!Number.isInteger(size.width) || size.width <= 0 || !Number.isInteger(size.height) || size.height <= 0) {
    throw new Error(`Invalid race capture size ${size.width}x${size.height}.`);
  }
}
