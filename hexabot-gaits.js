(function(global) {
  'use strict';

  const DEG_TO_RAD = Math.PI / 180;
  const RAD_TO_DEG = 180 / Math.PI;

  const DEFAULT_CONFIG = {
    bodyWidth: 169.45,
    bodyHeight: 164.2,
    topJointSpan: 121.5,
    coxaLength: 75,
    femurPrimaryLength: 51,
    femurSecondaryLength: 51,
    femurSecondaryAngleDeg: 45,
    tibiaLength: 74.5,
    footLength: 95,
    coxaHomeDeg: 90,
    femurHomeDeg: 90,
    tibiaHomeDeg: 90,
    uiTibiaHomeDeg: 135
  };

  const TRIPOD_GROUPS = [
    [1, 3, 5],
    [2, 4, 6]
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothStep(t) {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
  }

  function vec(x = 0, y = 0, z = 0) {
    return { x, y, z };
  }

  function add(a, b) {
    return vec(a.x + b.x, a.y + b.y, a.z + b.z);
  }

  function sub(a, b) {
    return vec(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  function scale(a, s) {
    return vec(a.x * s, a.y * s, a.z * s);
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function length(a) {
    return Math.hypot(a.x, a.y, a.z);
  }

  function normalize(a) {
    const len = length(a);
    if (len < 0.0001) return vec(1, 0, 0);
    return scale(a, 1 / len);
  }

  function rotatePlanar(outward, yawRad) {
    const side = vec(-outward.z, 0, outward.x);
    return normalize(add(scale(outward, Math.cos(yawRad)), scale(side, Math.sin(yawRad))));
  }

  function bodyDirection(directionDeg = 0) {
    const yawRad = directionDeg * DEG_TO_RAD;
    return normalize(vec(Math.sin(yawRad), 0, Math.cos(yawRad)));
  }

  function basePoints(config = DEFAULT_CONFIG) {
    const halfW = config.bodyWidth / 2;
    const halfH = config.bodyHeight / 2;
    const halfTop = config.topJointSpan / 2;
    return [
      vec(-halfTop, 0, -halfH),
      vec(-halfW, 0, 0),
      vec(-halfTop, 0, halfH),
      vec(halfTop, 0, halfH),
      vec(halfW, 0, 0),
      vec(halfTop, 0, -halfH)
    ];
  }

  function legFrame(legNumber, config = DEFAULT_CONFIG) {
    const mount = basePoints(config)[legNumber - 1];
    const outward = normalize(vec(mount.x, 0, mount.z));
    const side = normalize(vec(-outward.z, 0, outward.x));
    return { mount, outward, side };
  }

  function femurAssemblyReach(config = DEFAULT_CONFIG) {
    const bend = config.femurSecondaryAngleDeg * DEG_TO_RAD;
    return Math.hypot(
      config.femurPrimaryLength + Math.cos(bend) * config.femurSecondaryLength,
      Math.sin(bend) * config.femurSecondaryLength
    );
  }

  function femurAssemblyOffset(config = DEFAULT_CONFIG) {
    const bend = config.femurSecondaryAngleDeg * DEG_TO_RAD;
    return Math.atan2(
      Math.sin(bend) * config.femurSecondaryLength,
      config.femurPrimaryLength + Math.cos(bend) * config.femurSecondaryLength
    );
  }

  function lowerAssemblyReach(config = DEFAULT_CONFIG) {
    return Math.hypot(config.tibiaLength, config.footLength);
  }

  function lowerAssemblyOffset(config = DEFAULT_CONFIG) {
    return Math.atan2(config.footLength, config.tibiaLength);
  }

  function servoAnglesToFootTarget(legNumber, angles, config = DEFAULT_CONFIG) {
    const frame = legFrame(legNumber, config);
    const coxaRad = (angles.coxa - config.coxaHomeDeg) * DEG_TO_RAD;
    const femurRad = -(angles.femur - config.femurHomeDeg) * DEG_TO_RAD;
    const tibiaRad = -(angles.tibia - config.tibiaHomeDeg) * DEG_TO_RAD;
    const femurBendRad = config.femurSecondaryAngleDeg * DEG_TO_RAD;
    const forward = rotatePlanar(frame.outward, coxaRad);
    const down = vec(0, -1, 0);

    const femurPrimaryDir = normalize(add(scale(forward, Math.cos(femurRad)), scale(down, Math.sin(femurRad))));
    const femurSecondaryDir = normalize(add(scale(forward, Math.cos(femurRad + femurBendRad)), scale(down, Math.sin(femurRad + femurBendRad))));
    const tibiaDir = normalize(add(scale(forward, Math.cos(femurRad + femurBendRad + tibiaRad)), scale(down, Math.sin(femurRad + femurBendRad + tibiaRad))));
    const footDir = normalize(add(scale(forward, Math.cos(femurRad + femurBendRad + tibiaRad + Math.PI / 2)), scale(down, Math.sin(femurRad + femurBendRad + tibiaRad + Math.PI / 2))));

    const coxaEnd = add(frame.mount, scale(forward, config.coxaLength));
    const knee = add(
      add(coxaEnd, scale(femurPrimaryDir, config.femurPrimaryLength)),
      scale(femurSecondaryDir, config.femurSecondaryLength)
    );
    const ankle = add(knee, scale(tibiaDir, config.tibiaLength));
    return add(ankle, scale(footDir, config.footLength));
  }

  function footTargetToServoAngles(legNumber, target, config = DEFAULT_CONFIG) {
    const frame = legFrame(legNumber, config);
    const mountToTarget = sub(target, frame.mount);
    const forwardComponent = dot(mountToTarget, frame.outward);
    const sideComponent = dot(mountToTarget, frame.side);
    const coxaRad = Math.atan2(sideComponent, forwardComponent);
    const coxa = clamp(config.coxaHomeDeg + coxaRad * RAD_TO_DEG, 0, 180);
    const forward = rotatePlanar(frame.outward, coxaRad);
    const coxaEnd = add(frame.mount, scale(forward, config.coxaLength));
    const fromCoxaEnd = sub(target, coxaEnd);
    const x = dot(fromCoxaEnd, forward);
    const y = -fromCoxaEnd.y;

    const a = femurAssemblyReach(config);
    const b = lowerAssemblyReach(config);
    const distance = clamp(Math.hypot(x, y), Math.abs(a - b) + 0.001, a + b - 0.001);
    const baseAngle = Math.atan2(y, x);
    const femurTriangle = Math.acos(clamp((a * a + distance * distance - b * b) / (2 * a * distance), -1, 1));
    const virtualFemurRad = baseAngle - femurTriangle;
    const kneeTriangle = Math.acos(clamp((a * a + b * b - distance * distance) / (2 * a * b), -1, 1));
    const virtualLowerRad = virtualFemurRad + Math.PI - kneeTriangle;
    const femurRad = virtualFemurRad - femurAssemblyOffset(config);
    const tibiaRad = virtualLowerRad - lowerAssemblyOffset(config) - (femurRad + config.femurSecondaryAngleDeg * DEG_TO_RAD);

    return {
      coxa: clamp(Math.round(coxa), 0, 180),
      femur: clamp(Math.round(config.femurHomeDeg - femurRad * RAD_TO_DEG), 0, 180),
      tibia: clamp(Math.round(config.tibiaHomeDeg - tibiaRad * RAD_TO_DEG), 0, 180)
    };
  }

  function defaultStandingPose(config = DEFAULT_CONFIG) {
    const pose = {};
    for (let leg = 1; leg <= 6; leg++) {
      pose[leg] = {
        coxa: config.coxaHomeDeg,
        femur: config.femurHomeDeg,
        tibia: config.uiTibiaHomeDeg
      };
    }
    return pose;
  }

  function defaultFootTargets(config = DEFAULT_CONFIG) {
    const targets = {};
    const pose = defaultStandingPose(config);
    for (let leg = 1; leg <= 6; leg++) {
      targets[leg] = servoAnglesToFootTarget(leg, pose[leg], config);
    }
    return targets;
  }

  function tripodPhaseOffset(legNumber) {
    return TRIPOD_GROUPS[0].includes(legNumber) ? 0 : 0.5;
  }

  function tripodFootTarget(legNumber, phase, options, config) {
    const baseTargets = options.baseTargets || defaultFootTargets(config);
    const base = baseTargets[legNumber];
    const localPhase = (phase + tripodPhaseOffset(legNumber)) % 1;
    const stride = options.strideLength ?? 45;
    const lift = options.liftHeight ?? 28;
    const travel = bodyDirection(options.directionDeg ?? 0);

    if (localPhase < 0.5) {
      const t = localPhase / 0.5;
      return add(base, scale(travel, lerp(stride / 2, -stride / 2, t)));
    }

    const t = (localPhase - 0.5) / 0.5;
    const eased = smoothStep(t);
    const liftProfile = Math.sin(Math.PI * t) * lift;
    return add(
      add(base, scale(travel, lerp(-stride / 2, stride / 2, eased))),
      vec(0, liftProfile, 0)
    );
  }

  function tripodFrame(phase, options = {}, config = DEFAULT_CONFIG) {
    const frame = {
      phase,
      groups: TRIPOD_GROUPS.map((group) => group.slice()),
      legs: {}
    };
    for (let leg = 1; leg <= 6; leg++) {
      const target = tripodFootTarget(leg, phase, options, config);
      frame.legs[leg] = {
        footTarget: target,
        angles: footTargetToServoAngles(leg, target, config),
        swing: ((phase + tripodPhaseOffset(leg)) % 1) >= 0.5
      };
    }
    return frame;
  }

  function generateTripodGait(options = {}, config = DEFAULT_CONFIG) {
    const steps = Math.max(2, options.steps ?? 24);
    const frames = [];
    for (let i = 0; i < steps; i++) {
      frames.push(tripodFrame(i / steps, options, config));
    }
    return {
      type: 'tripod',
      durationMs: options.durationMs ?? 1200,
      frames
    };
  }

  global.HexabotGaits = {
    config: DEFAULT_CONFIG,
    tripodGroups: TRIPOD_GROUPS,
    basePoints,
    legFrame,
    bodyDirection,
    defaultStandingPose,
    defaultFootTargets,
    servoAnglesToFootTarget,
    footTargetToServoAngles,
    tripodFrame,
    generateTripodGait,
    walking: {
      tripod: generateTripodGait
    }
  };
})(window);
