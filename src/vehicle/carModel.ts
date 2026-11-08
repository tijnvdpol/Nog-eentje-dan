import type { DriveInput } from '../input/input';

export interface CarState { x: number; z: number; heading: number; speed: number; steerSmoothed?: number }

export const CAR_PARAMS = {
  maxSpeed: 50, maxReverse: 8, accel: 8, brakeDecel: 14, coastDecel: 2,
  steerRate: 1.6, handbrakeDecel: 7, handbrakeSteerBoost: 1.5,
};

export function stepCar(
  s: CarState, input: DriveInput, dt: number,
  mods: { steerFactor: number; steerResponse: number },
): CarState {
  const P = CAR_PARAMS;
  let v = s.speed;

  // Longitudinal
  if (input.brake > 0) {
    if (v > 0) v = Math.max(0, v - P.brakeDecel * input.brake * dt);
    else v = Math.max(-P.maxReverse, v - P.accel * input.brake * dt);
  } else if (input.throttle > 0) {
    if (v < 0) v = Math.min(0, v + P.brakeDecel * input.throttle * dt);
    else v = Math.min(P.maxSpeed, v + P.accel * input.throttle * dt);
  } else {
    const d = P.coastDecel * dt;
    v = v > 0 ? Math.max(0, v - d) : Math.min(0, v + d);
  }
  if (input.handbrake) {
    const d = P.handbrakeDecel * dt;
    v = v > 0 ? Math.max(0, v - d) : Math.min(0, v + d);
  }

  // Steering (first-order lag when steerResponse < 1)
  const target = input.steer;
  let steer = target;
  let smoothed = s.steerSmoothed ?? 0;
  if (mods.steerResponse < 1) {
    const tau = 0.15 / Math.max(mods.steerResponse, 0.01);
    smoothed += (target - smoothed) * Math.min(1, dt / tau);
    steer = smoothed;
  } else {
    smoothed = target;
  }
  const grip = Math.min(1, Math.abs(v) / 5) * Math.sign(v);
  const boost = input.handbrake ? P.handbrakeSteerBoost : 1;
  const heading = s.heading - steer * P.steerRate * mods.steerFactor * boost * grip * dt;

  const avgHeading = (s.heading + heading) / 2;
  return {
    x: s.x + Math.sin(avgHeading) * v * dt,
    z: s.z + Math.cos(avgHeading) * v * dt,
    heading, speed: v, steerSmoothed: smoothed,
  };
}
