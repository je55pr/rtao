export type BrowserChaseVector = readonly [number, number, number];

export interface BrowserChaseCameraState {
  readonly position: BrowserChaseVector;
  readonly target: BrowserChaseVector;
  readonly ready: boolean;
}

export interface BrowserChaseVehiclePose {
  readonly position: BrowserChaseVector;
  readonly yaw: number;
  readonly cameraLift: number;
}

export interface BrowserChasePolicy {
  readonly distance: number;
  readonly targetLift: number;
  readonly positionBlend: number;
  readonly targetBlend: number;
}

export const currentBrowserChasePolicy: BrowserChasePolicy = {
  distance: 7.8,
  targetLift: 0.72,
  positionBlend: 0.13,
  targetBlend: 0.17,
};

export function advanceBrowserChaseCamera(
  state: BrowserChaseCameraState,
  vehicle: BrowserChaseVehiclePose,
  snap: boolean,
  policy: BrowserChasePolicy = currentBrowserChasePolicy,
): BrowserChaseCameraState {
  const [x, y, z] = vehicle.position;
  const forwardX = Math.sin(vehicle.yaw);
  const forwardZ = Math.cos(vehicle.yaw);
  const desiredPosition: BrowserChaseVector = [
    x - forwardX * policy.distance,
    y + vehicle.cameraLift,
    z - forwardZ * policy.distance,
  ];
  const desiredTarget: BrowserChaseVector = [x, y + policy.targetLift, z];

  if (snap || !state.ready) {
    return { position: desiredPosition, target: desiredTarget, ready: true };
  }

  return {
    position: blendVector(state.position, desiredPosition, policy.positionBlend),
    target: blendVector(state.target, desiredTarget, policy.targetBlend),
    ready: true,
  };
}

function blendVector(
  current: BrowserChaseVector,
  target: BrowserChaseVector,
  amount: number,
): BrowserChaseVector {
  return [
    current[0] + (target[0] - current[0]) * amount,
    current[1] + (target[1] - current[1]) * amount,
    current[2] + (target[2] - current[2]) * amount,
  ];
}
