(function(global) {
  'use strict';

  const DEG_TO_RAD = Math.PI / 180;
  const RAD_TO_DEG = 180 / Math.PI;
  const PHASE_EPSILON = 1e-6;

  const FALLBACK_ROBOT_CONFIG = {
    kinematics: {
      body: {
        shapeMode: 'dimensions',
        widthMm: 169.45,
        heightMm: 164.2,
        topJointSpanMm: 121.5,
        points: [
          { leg: 1, label: 'front-left', xMm: -60.75, zMm: -82.1 },
          { leg: 2, label: 'middle-left', xMm: -84.725, zMm: 0 },
          { leg: 3, label: 'rear-left', xMm: -60.75, zMm: 82.1 },
          { leg: 4, label: 'rear-right', xMm: 60.75, zMm: 82.1 },
          { leg: 5, label: 'middle-right', xMm: 84.725, zMm: 0 },
          { leg: 6, label: 'front-right', xMm: 60.75, zMm: -82.1 }
        ]
      },
      links: {
        coxaLengthMm: 75,
        femurPrimaryLengthMm: 51,
        femurSecondaryLengthMm: 51,
        femurSecondaryAngleDeg: 45,
        tibiaLengthMm: 74.5,
        footLengthMm: 95
      },
      homeAngles: {
        coxaHomeDeg: 90,
        femurHomeDeg: 90,
        tibiaHomeDeg: 90,
        uiTibiaHomeDeg: 135
      }
    },
    gaitDefaults: {
      type: 'tripod',
      strideLengthMm: 210,
      liftHeightMm: 130,
      walkHeightMm: 0,
      durationMs: 2000,
      directionDeg: 0
    },
    ui: {
      legMover: {
        baseX: 180,
        baseY: 220,
        viewYawDeg: -35,
        viewPitchDeg: 24,
        viewScale: 1
      }
    }
  };

  function numberOr(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function loadRobotConfig() {
    if (global.HexabotRobotConfig) return global.HexabotRobotConfig;
    try {
      const request = new XMLHttpRequest();
      request.open('GET', 'hexabot-config.json', false);
      request.send(null);
      if ((request.status >= 200 && request.status < 300) || request.status === 0) {
        return JSON.parse(request.responseText);
      }
    } catch (error) {
      console.warn('Using built-in Hexabot config fallback:', error);
    }
    return FALLBACK_ROBOT_CONFIG;
  }

  function kinematicsFromRobotConfig(robotConfig) {
    const fallback = FALLBACK_ROBOT_CONFIG.kinematics;
    const body = robotConfig?.kinematics?.body || {};
    const links = robotConfig?.kinematics?.links || {};
    const home = robotConfig?.kinematics?.homeAngles || {};
    return {
      bodyShapeMode: body.shapeMode === 'points' ? 'points' : 'dimensions',
      bodyWidth: numberOr(body.widthMm, fallback.body.widthMm),
      bodyHeight: numberOr(body.heightMm, fallback.body.heightMm),
      topJointSpan: numberOr(body.topJointSpanMm, fallback.body.topJointSpanMm),
      bodyPoints: normalizeBodyPoints(body.points, fallback.body.points),
      coxaLength: numberOr(links.coxaLengthMm, fallback.links.coxaLengthMm),
      femurPrimaryLength: numberOr(links.femurPrimaryLengthMm, fallback.links.femurPrimaryLengthMm),
      femurSecondaryLength: numberOr(links.femurSecondaryLengthMm, fallback.links.femurSecondaryLengthMm),
      femurSecondaryAngleDeg: numberOr(links.femurSecondaryAngleDeg, fallback.links.femurSecondaryAngleDeg),
      tibiaLength: numberOr(links.tibiaLengthMm, fallback.links.tibiaLengthMm),
      footLength: numberOr(links.footLengthMm, fallback.links.footLengthMm),
      coxaHomeDeg: numberOr(home.coxaHomeDeg, fallback.homeAngles.coxaHomeDeg),
      femurHomeDeg: numberOr(home.femurHomeDeg, fallback.homeAngles.femurHomeDeg),
      tibiaHomeDeg: numberOr(home.tibiaHomeDeg, fallback.homeAngles.tibiaHomeDeg),
      uiTibiaHomeDeg: numberOr(home.uiTibiaHomeDeg, fallback.homeAngles.uiTibiaHomeDeg)
    };
  }

  function normalizeBodyPoints(points, fallbackPoints) {
    const source = Array.isArray(points) && points.length >= 6 ? points : fallbackPoints;
    return source
      .slice(0, 6)
      .map((point, index) => ({
        leg: Number.isInteger(Number(point.leg)) ? Number(point.leg) : index + 1,
        label: point.label || `leg-${index + 1}`,
        x: numberOr(point.xMm, 0),
        z: numberOr(point.zMm, 0)
      }))
      .sort((a, b) => a.leg - b.leg);
  }

  const ROBOT_CONFIG = loadRobotConfig();
  const DEFAULT_CONFIG = kinematicsFromRobotConfig(ROBOT_CONFIG);

  const TRIPOD_GROUPS = [
    [1, 3, 5],
    [2, 4, 6]
  ];
  const SEQUENCE_GAIT_ORDER = [1, 4, 2, 5, 3, 6];
  const GAIT_TYPES = {
    tripod: {
      label: 'Tripod',
      groups: TRIPOD_GROUPS
    },
    ripple: {
      label: 'Ripple',
      sequence: SEQUENCE_GAIT_ORDER,
      swingFraction: 1 / 3
    },
    wave: {
      label: 'Wave',
      sequence: SEQUENCE_GAIT_ORDER,
      swingFraction: 1 / 6
    }
  };

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

  function wrapPhase(phase) {
    const wrapped = ((phase % 1) + 1) % 1;
    return wrapped > 1 - PHASE_EPSILON ? 0 : wrapped;
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
    if (config.bodyShapeMode === 'points' && Array.isArray(config.bodyPoints) && config.bodyPoints.length >= 6) {
      return config.bodyPoints.slice(0, 6).map((point) => vec(point.x, 0, point.z));
    }

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
    const localPhase = wrapPhase(phase + tripodPhaseOffset(legNumber));
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
    const framePhase = wrapPhase(phase);
    const frameOptions = {
      ...options,
      baseTargets: options.baseTargets || defaultFootTargets(config)
    };
    const frame = {
      type: 'tripod',
      phase: framePhase,
      groups: TRIPOD_GROUPS.map((group) => group.slice()),
      legs: {}
    };
    for (let leg = 1; leg <= 6; leg++) {
      const target = tripodFootTarget(leg, framePhase, frameOptions, config);
      frame.legs[leg] = {
        footTarget: target,
        angles: footTargetToServoAngles(leg, target, config),
        swing: wrapPhase(framePhase + tripodPhaseOffset(leg)) >= 0.5
      };
    }
    return frame;
  }

  function sequencePhaseOffset(legNumber, sequence) {
    const index = sequence.indexOf(legNumber);
    return index < 0 ? 0 : index / sequence.length;
  }

  function isSequenceSwingPhase(localPhase, swingFraction) {
    return localPhase < swingFraction - PHASE_EPSILON;
  }

  function sequenceFootTarget(legNumber, phase, options, config, definition) {
    const baseTargets = options.baseTargets || defaultFootTargets(config);
    const base = baseTargets[legNumber];
    const stride = options.strideLength ?? 45;
    const lift = options.liftHeight ?? 28;
    const travel = bodyDirection(options.directionDeg ?? 0);
    const swingFraction = clamp(definition.swingFraction, 0.08, 0.48);
    const localPhase = wrapPhase(phase - sequencePhaseOffset(legNumber, definition.sequence));

    if (stride <= 0.001) return base;

    if (isSequenceSwingPhase(localPhase, swingFraction)) {
      const t = localPhase / swingFraction;
      const eased = smoothStep(t);
      const liftProfile = Math.sin(Math.PI * t) * lift;
      return add(
        add(base, scale(travel, lerp(-stride / 2, stride / 2, eased))),
        vec(0, liftProfile, 0)
      );
    }

    const stanceT = (localPhase - swingFraction) / (1 - swingFraction);
    return add(base, scale(travel, lerp(stride / 2, -stride / 2, stanceT)));
  }

  function sequenceFrame(type, phase, options = {}, config = DEFAULT_CONFIG) {
    const definition = GAIT_TYPES[type] || GAIT_TYPES.wave;
    const framePhase = wrapPhase(phase);
    const frameOptions = {
      ...options,
      baseTargets: options.baseTargets || defaultFootTargets(config)
    };
    const frame = {
      type,
      phase: framePhase,
      sequence: definition.sequence.slice(),
      swingFraction: definition.swingFraction,
      legs: {}
    };
    for (let leg = 1; leg <= 6; leg++) {
      const localPhase = wrapPhase(framePhase - sequencePhaseOffset(leg, definition.sequence));
      const target = sequenceFootTarget(leg, framePhase, frameOptions, config, definition);
      frame.legs[leg] = {
        footTarget: target,
        angles: footTargetToServoAngles(leg, target, config),
        swing: isSequenceSwingPhase(localPhase, definition.swingFraction),
        localPhase
      };
    }
    return frame;
  }

  function rippleFrame(phase, options = {}, config = DEFAULT_CONFIG) {
    return sequenceFrame('ripple', phase, options, config);
  }

  function waveFrame(phase, options = {}, config = DEFAULT_CONFIG) {
    return sequenceFrame('wave', phase, options, config);
  }

  function normalizeGaitType(type) {
    return GAIT_TYPES[type] ? type : 'tripod';
  }

  function gaitFrame(type, phase, options = {}, config = DEFAULT_CONFIG) {
    const gaitType = normalizeGaitType(type);
    if (gaitType === 'tripod') return tripodFrame(phase, options, config);
    if (gaitType === 'ripple') return rippleFrame(phase, options, config);
    return waveFrame(phase, options, config);
  }

  function generateTripodGait(options = {}, config = DEFAULT_CONFIG) {
    return generateGait('tripod', options, config);
  }

  function generateRippleGait(options = {}, config = DEFAULT_CONFIG) {
    return generateGait('ripple', options, config);
  }

  function generateWaveGait(options = {}, config = DEFAULT_CONFIG) {
    return generateGait('wave', options, config);
  }

  function generateGait(type = 'tripod', options = {}, config = DEFAULT_CONFIG) {
    const gaitType = normalizeGaitType(type);
    const steps = Math.max(2, options.steps ?? 24);
    const frames = [];
    for (let i = 0; i < steps; i++) {
      frames.push(gaitFrame(gaitType, i / steps, options, config));
    }
    return {
      type: gaitType,
      durationMs: options.durationMs ?? numberOr(ROBOT_CONFIG?.gaitDefaults?.durationMs, FALLBACK_ROBOT_CONFIG.gaitDefaults.durationMs),
      frames
    };
  }

  global.HexabotGaits = {
    robotConfig: ROBOT_CONFIG,
    config: DEFAULT_CONFIG,
    gaitTypes: GAIT_TYPES,
    tripodGroups: TRIPOD_GROUPS,
    sequenceGaitOrder: SEQUENCE_GAIT_ORDER.slice(),
    basePoints,
    legFrame,
    bodyDirection,
    defaultStandingPose,
    defaultFootTargets,
    servoAnglesToFootTarget,
    footTargetToServoAngles,
    gaitFrame,
    tripodFrame,
    rippleFrame,
    waveFrame,
    generateGait,
    generateTripodGait,
    generateRippleGait,
    generateWaveGait,
    walking: {
      tripod: generateTripodGait,
      ripple: generateRippleGait,
      wave: generateWaveGait
    }
  };
})(window);
