import { useEffect, useRef, useState } from 'react';
import { playHitSound, playScoreSound, playWallSound } from '../utils/sound';

const WIDTH = 900;
const HEIGHT = 560;
const WIN_SCORE = 11;

// 3D Camera parameters (behind-the-table simulator view)
const CAM_Z = -0.68;
const CAM_Y = 0.72;
const FOV = 560;

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function project(x, y, z) {
  const dz = Math.max(0.18, z - CAM_Z);
  const scale = FOV / dz;
  return {
    x: WIDTH / 2 + x * 0.44 * scale,
    y: HEIGHT * 0.44 + (CAM_Y - y) * 0.56 * scale - 110,
    scale,
  };
}

function createInitialBall(serveTowardNear = false) {
  const dirZ = serveTowardNear ? -1 : 1;
  return {
    x: (Math.random() - 0.5) * 0.35,
    y: 0.26,
    z: 0.5,
    vx: (Math.random() - 0.5) * 0.006,
    vy: 0.008,
    vz: 0.0115 * dirZ,
    trail: [],
    bouncedThisHalf: false,
  };
}

export default function TableTennisGame({
  mode = 'ai', // 'ai' | 'webrtc'
  role = 'host', // 'host' | 'guest'
  difficulty = 'easy',
  muted = false,
  nearPlayer = { username: 'Siz', avatarColor: '#10b981' },
  farPlayer = { username: 'Raqib', avatarColor: '#06b6d4' },
  sendGameData,
  sendReliable,
  incomingStateRef,
  incomingPaddleRef,
  rematchSignal,
  onScoreChange,
  onMatchEnd,
}) {
  const canvasRef = useRef(null);
  const [winner, setWinner] = useState(null); // 'near' | 'far' | null
  const [paused, setPaused] = useState(false);

  // Canonical simulation space:
  // Host (or AI player) is always at z = 0 (near), Opponent/Guest is at z = 1 (far).
  // When rendering for WebRTC Guest, we mirror x -> -x and z -> 1 - z so Guest also sees from behind their own table end!
  const stateRef = useRef({
    near: { x: 0, y: 0.18, vx: 0, vy: 0 },
    far: { x: 0, y: 0.18, vx: 0, vy: 0 },
    ball: createInitialBall(false),
    scores: { near: 0, far: 0 },
    servePauseFrames: 42,
    finished: false,
    bounceFlash: null,
  });

  const keysRef = useRef({});
  const pointerTargetRef = useRef(null);

  const resetMatch = (notifyPeer = false) => {
    stateRef.current = {
      near: { x: 0, y: 0.18, vx: 0, vy: 0 },
      far: { x: 0, y: 0.18, vx: 0, vy: 0 },
      ball: createInitialBall(false),
      scores: { near: 0, far: 0 },
      servePauseFrames: 42,
      finished: false,
      bounceFlash: null,
    };
    setWinner(null);
    setPaused(false);
    onScoreChange?.({ near: 0, far: 0 });
    if (notifyPeer && mode === 'webrtc') {
      sendReliable?.({ type: 'rematch' });
    }
  };

  useEffect(() => {
    if (rematchSignal > 0) {
      resetMatch(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rematchSignal]);

  useEffect(() => {
    function onKeyDown(e) {
      keysRef.current[e.key.toLowerCase()] = true;
    }
    function onKeyUp(e) {
      keysRef.current[e.key.toLowerCase()] = false;
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    let animId;
    const isGuestView = mode === 'webrtc' && role === 'guest';

    function moveLocalPaddle(paddle) {
      const prevX = paddle.x;
      const prevY = paddle.y;
      const keys = keysRef.current;
      const speed = 0.048;
      let movedByKey = false;

      if (keys.a || keys.arrowleft) {
        paddle.x -= speed;
        movedByKey = true;
      }
      if (keys.d || keys.arrowright) {
        paddle.x += speed;
        movedByKey = true;
      }
      if (keys.w || keys.arrowup) {
        paddle.y += speed * 0.75;
        movedByKey = true;
      }
      if (keys.s || keys.arrowdown) {
        paddle.y -= speed * 0.75;
        movedByKey = true;
      }

      if (!movedByKey && pointerTargetRef.current) {
        paddle.x += (pointerTargetRef.current.x - paddle.x) * 0.45;
        paddle.y += (pointerTargetRef.current.y - paddle.y) * 0.45;
      }

      paddle.x = clamp(paddle.x, -1.18, 1.18);
      paddle.y = clamp(paddle.y, 0.05, 0.56);
      paddle.vx = paddle.x - prevX;
      paddle.vy = paddle.y - prevY;
    }

    function updateAI(paddle, ball) {
      const prevX = paddle.x;
      const prevY = paddle.y;
      const cfg =
        difficulty === 'hard'
          ? { maxSpeed: 0.052, returnSpeed: 0.0155 }
          : difficulty === 'medium'
            ? { maxSpeed: 0.036, returnSpeed: 0.0135 }
            : { maxSpeed: 0.023, returnSpeed: 0.0118 };

      const targetX = ball.vz > 0 ? clamp(ball.x, -0.95, 0.95) : 0;
      const targetY = ball.vz > 0 ? clamp(ball.y, 0.1, 0.45) : 0.2;

      paddle.x += clamp(targetX - paddle.x, -cfg.maxSpeed, cfg.maxSpeed);
      paddle.y += clamp(targetY - paddle.y, -cfg.maxSpeed * 0.8, cfg.maxSpeed * 0.8);
      paddle.x = clamp(paddle.x, -1.08, 1.08);
      paddle.y = clamp(paddle.y, 0.06, 0.5);
      paddle.vx = paddle.x - prevX;
      paddle.vy = paddle.y - prevY;
      return cfg.returnSpeed;
    }

    function checkWin(scores) {
      const { near, far } = scores;
      if ((near >= WIN_SCORE || far >= WIN_SCORE) && Math.abs(near - far) >= 2) {
        const winSide = near > far ? 'near' : 'far';
        stateRef.current.finished = true;
        setWinner(winSide);
        const iWon = isGuestView ? winSide === 'far' : winSide === 'near';
        onMatchEnd?.({
          won: iWon,
          myScore: isGuestView ? far : near,
          opponentScore: isGuestView ? near : far,
        });
        return true;
      }
      return false;
    }

    function step() {
      const s = stateRef.current;

      if (!paused && !s.finished) {
        if (isGuestView) {
          // Guest controls local paddle in their own view, then mirrors X to canonical space
          const localGuest = {
            x: -s.far.x,
            y: s.far.y,
            vx: 0,
            vy: 0,
          };
          moveLocalPaddle(localGuest);
          s.far.x = -localGuest.x;
          s.far.y = localGuest.y;

          sendGameData?.({
            type: 'paddle',
            x: s.far.x,
            y: s.far.y,
          });

          if (incomingStateRef?.current) {
            const net = incomingStateRef.current;
            s.near.x = net.near.x;
            s.near.y = net.near.y;
            s.ball.x = net.ball.x;
            s.ball.y = net.ball.y;
            s.ball.z = net.ball.z;
            s.ball.vx = net.ball.vx;
            s.ball.vy = net.ball.vy;
            s.ball.vz = net.ball.vz;
            s.ball.trail.push({ x: s.ball.x, y: s.ball.y, z: s.ball.z });
            if (s.ball.trail.length > 10) s.ball.trail.shift();

            if (
              net.scores.near !== s.scores.near ||
              net.scores.far !== s.scores.far
            ) {
              const guestScored = net.scores.far > s.scores.far;
              s.scores = { ...net.scores };
              onScoreChange?.({ near: s.scores.far, far: s.scores.near });
              if (!muted) playScoreSound(guestScored);
              checkWin(s.scores);
            }
            incomingStateRef.current = null;
          }
        } else {
          // Authoritative simulation (AI mode or WebRTC Host)
          moveLocalPaddle(s.near);

          let aiReturnSpeed = 0.0135;
          if (mode === 'ai') {
            aiReturnSpeed = updateAI(s.far, s.ball);
          } else if (incomingPaddleRef?.current) {
            s.far.vx = incomingPaddleRef.current.x - s.far.x;
            s.far.vy = incomingPaddleRef.current.y - s.far.y;
            s.far.x = incomingPaddleRef.current.x;
            s.far.y = incomingPaddleRef.current.y;
          }

          if (s.servePauseFrames > 0) {
            s.servePauseFrames -= 1;
          } else {
            const b = s.ball;
            b.x += b.vx;
            b.y += b.vy;
            b.z += b.vz;
            b.vy -= 0.00052; // gentle gravity

            b.trail.push({ x: b.x, y: b.y, z: b.z });
            if (b.trail.length > 10) b.trail.shift();

            // Table surface bounce
            if (b.y <= 0.02 && b.vy < 0 && b.z >= -0.04 && b.z <= 1.04 && Math.abs(b.x) <= 1.06) {
              b.y = 0.02;
              b.vy = Math.max(0.011, Math.abs(b.vy) * 0.88);
              s.bounceFlash = { x: b.x, z: b.z, life: 12 };
              if (!muted) playWallSound();
            }

            // Net collision check (generous so rallies flow)
            if (Math.abs(b.z - 0.5) < 0.02 && b.y < 0.145) {
              b.y = 0.15;
              b.vy = Math.max(0.005, b.vy);
            }

            // Near paddle hit (Player at z ~ 0.04)
            if (b.vz < 0 && b.z <= 0.095 && b.z >= -0.06) {
              const dx = b.x - s.near.x;
              const dy = b.y - s.near.y;
              if (Math.abs(dx) <= 0.28 && Math.abs(dy) <= 0.26) {
                const nextVz = mode === 'ai' ? 0.0135 : 0.0145;
                b.vz = nextVz;
                b.vx = clamp(dx * 0.032 + s.near.vx * 0.22, -0.014, 0.014);
                b.vy = 0.0155;
                b.z = 0.1;
                if (!muted) playHitSound(7);
              }
            }

            // Far paddle hit (AI or Guest at z ~ 0.96)
            if (b.vz > 0 && b.z >= 0.905 && b.z <= 1.06) {
              const dx = b.x - s.far.x;
              const dy = b.y - s.far.y;
              const hitTolX = mode === 'ai' ? 0.22 : 0.28;
              const hitTolY = mode === 'ai' ? 0.22 : 0.26;
              if (Math.abs(dx) <= hitTolX && Math.abs(dy) <= hitTolY) {
                b.vz = -(mode === 'ai' ? aiReturnSpeed : 0.0145);
                b.vx = clamp(dx * 0.026 + (Math.random() - 0.5) * 0.004, -0.012, 0.012);
                b.vy = 0.015;
                b.z = 0.9;
                if (!muted) playHitSound(6);
              }
            }

            // Scoring
            if (b.z < -0.18 || (b.y < -0.35 && b.z < 0.5)) {
              s.scores = { ...s.scores, far: s.scores.far + 1 };
              onScoreChange?.(s.scores);
              if (!muted) playScoreSound(false);
              if (!checkWin(s.scores)) {
                s.ball = createInitialBall(false);
                s.servePauseFrames = 40;
              }
            } else if (b.z > 1.18 || (b.y < -0.35 && b.z >= 0.5)) {
              s.scores = { ...s.scores, near: s.scores.near + 1 };
              onScoreChange?.(s.scores);
              if (!muted) playScoreSound(true);
              if (!checkWin(s.scores)) {
                s.ball = createInitialBall(true);
                s.servePauseFrames = 40;
              }
            }
          }

          if (mode === 'webrtc' && role === 'host') {
            sendGameData?.({
              type: 'state',
              near: { x: s.near.x, y: s.near.y },
              ball: {
                x: s.ball.x,
                y: s.ball.y,
                z: s.ball.z,
                vx: s.ball.vx,
                vy: s.ball.vy,
                vz: s.ball.vz,
              },
              scores: s.scores,
            });
          }
        }
      }

      if (s.bounceFlash) {
        s.bounceFlash.life -= 1;
        if (s.bounceFlash.life <= 0) s.bounceFlash = null;
      }

      draw(isGuestView);
      animId = requestAnimationFrame(step);
    }

    function draw(isGuestView) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const s = stateRef.current;

      // Arena background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      bgGrad.addColorStop(0, '#040812');
      bgGrad.addColorStop(0.5, '#0b1526');
      bgGrad.addColorStop(1, '#070e19');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Subtle arena spotlight glow
      const spot = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.42, 40, WIDTH / 2, HEIGHT * 0.42, 420);
      spot.addColorStop(0, 'rgba(16, 185, 129, 0.14)');
      spot.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // 3D Table corners
      const fl = project(-1, 0, 1);
      const fr = project(1, 0, 1);
      const nr = project(1, 0, 0);
      const nl = project(-1, 0, 0);

      // Table legs / under-frame shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.moveTo(fl.x + 12, fl.y + 42);
      ctx.lineTo(fr.x - 12, fr.y + 42);
      ctx.lineTo(nr.x - 24, nr.y + 85);
      ctx.lineTo(nl.x + 24, nl.y + 85);
      ctx.closePath();
      ctx.fill();

      // Table front thickness
      ctx.fillStyle = '#063d2b';
      ctx.beginPath();
      ctx.moveTo(nl.x, nl.y);
      ctx.lineTo(nr.x, nr.y);
      ctx.lineTo(nr.x, nr.y + 14);
      ctx.lineTo(nl.x, nl.y + 14);
      ctx.closePath();
      ctx.fill();

      // Table top surface
      const tableGrad = ctx.createLinearGradient(0, fl.y, 0, nl.y);
      tableGrad.addColorStop(0, '#094e38');
      tableGrad.addColorStop(0.55, '#0f7654');
      tableGrad.addColorStop(1, '#108962');
      ctx.fillStyle = tableGrad;
      ctx.beginPath();
      ctx.moveTo(fl.x, fl.y);
      ctx.lineTo(fr.x, fr.y);
      ctx.lineTo(nr.x, nr.y);
      ctx.lineTo(nl.x, nl.y);
      ctx.closePath();
      ctx.fill();

      // White table borders
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Center service line
      const cf = project(0, 0, 1);
      const cn = project(0, 0, 0);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cf.x, cf.y);
      ctx.lineTo(cn.x, cn.y);
      ctx.stroke();

      // Bounce flash ring on table
      if (s.bounceFlash) {
        const bx = isGuestView ? -s.bounceFlash.x : s.bounceFlash.x;
        const bz = isGuestView ? 1 - s.bounceFlash.z : s.bounceFlash.z;
        const bp = project(bx, 0, bz);
        const alpha = s.bounceFlash.life / 12;
        ctx.strokeStyle = `rgba(251, 191, 36, ${alpha * 0.8})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(bp.x, bp.y, 16 * (1.4 - alpha * 0.4), 7 * (1.4 - alpha * 0.4), 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 3D Net at z = 0.5
      const netBL = project(-1.04, 0, 0.5);
      const netBR = project(1.04, 0, 0.5);
      const netTL = project(-1.04, 0.16, 0.5);
      const netTR = project(1.04, 0.16, 0.5);

      ctx.fillStyle = 'rgba(226, 232, 240, 0.22)';
      ctx.beginPath();
      ctx.moveTo(netBL.x, netBL.y);
      ctx.lineTo(netBR.x, netBR.y);
      ctx.lineTo(netTR.x, netTR.y);
      ctx.lineTo(netTL.x, netTL.y);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(netTL.x, netTL.y);
      ctx.lineTo(netTR.x, netTR.y);
      ctx.stroke();

      // Coordinates mapped to current viewer's perspective
      const viewFarPaddle = isGuestView
        ? { x: -s.near.x, y: s.near.y }
        : { x: s.far.x, y: s.far.y };
      const viewNearPaddle = isGuestView
        ? { x: -s.far.x, y: s.far.y }
        : { x: s.near.x, y: s.near.y };
      const viewBall = isGuestView
        ? { x: -s.ball.x, y: s.ball.y, z: 1 - s.ball.z }
        : { x: s.ball.x, y: s.ball.y, z: s.ball.z };

      // Draw far paddle first
      drawPaddle3D(ctx, viewFarPaddle.x, viewFarPaddle.y, 0.98, farPlayer.avatarColor || '#06b6d4', false);

      // Ball shadow on table
      if (viewBall.z >= -0.05 && viewBall.z <= 1.05 && Math.abs(viewBall.x) <= 1.1) {
        const sh = project(viewBall.x, 0, viewBall.z);
        const shadowSize = Math.max(4, 0.028 * sh.scale * Math.max(0.45, 1 - viewBall.y));
        ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
        ctx.beginPath();
        ctx.ellipse(sh.x, sh.y, shadowSize, shadowSize * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ball trail
      for (let i = 0; i < s.ball.trail.length; i += 1) {
        const pt = s.ball.trail[i];
        const tx = isGuestView ? -pt.x : pt.x;
        const tz = isGuestView ? 1 - pt.z : pt.z;
        const tp = project(tx, pt.y, tz);
        const alpha = ((i + 1) / s.ball.trail.length) * 0.25;
        ctx.fillStyle = `rgba(251, 191, 36, ${alpha})`;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, Math.max(2, 0.019 * tp.scale), 0, Math.PI * 2);
        ctx.fill();
      }

      // Ball
      const bp = project(viewBall.x, viewBall.y, viewBall.z);
      const ballR = Math.max(4, 0.023 * bp.scale);
      ctx.save();
      ctx.shadowColor = 'rgba(251, 191, 36, 0.75)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, ballR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Draw near paddle on top (semi-translucent so you can see the ball through it)
      drawPaddle3D(ctx, viewNearPaddle.x, viewNearPaddle.y, 0.03, nearPlayer.avatarColor || '#10b981', true);
    }

    function drawPaddle3D(ctx, x, y, z, color, isNear) {
      const p = project(x, y, z);
      const r = 0.088 * p.scale;

      ctx.save();
      ctx.globalAlpha = isNear ? 0.82 : 0.95;

      // Handle
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = Math.max(4, r * 0.26);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + r * 0.8);
      ctx.lineTo(p.x + (x >= 0 ? 1 : -1) * r * 0.28, p.y + r * 1.65);
      ctx.stroke();

      // Outer rim
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.88, 0, 0, Math.PI * 2);
      ctx.fill();

      // Rubber face
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r * 0.88, r * 0.77, 0, 0, Math.PI * 2);
      ctx.fill();

      // Gloss highlight
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r * 0.85, r * 0.74, 0, -0.9, 0.7);
      ctx.stroke();
      ctx.restore();
    }

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [
    difficulty,
    farPlayer.avatarColor,
    incomingPaddleRef,
    incomingStateRef,
    mode,
    muted,
    nearPlayer.avatarColor,
    onMatchEnd,
    onScoreChange,
    paused,
    role,
    sendGameData,
  ]);

  function handlePointerMove(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const normX = ((e.clientX - rect.left) / rect.width - 0.5) * 2.35;
    const normY = (1 - (e.clientY - rect.top) / rect.height) * 0.62;
    pointerTargetRef.current = {
      x: clamp(normX, -1.18, 1.18),
      y: clamp(normY, 0.05, 0.56),
    };
  }

  const displayNearScore =
    mode === 'webrtc' && role === 'guest'
      ? stateRef.current.scores.far
      : stateRef.current.scores.near;
  const displayFarScore =
    mode === 'webrtc' && role === 'guest'
      ? stateRef.current.scores.near
      : stateRef.current.scores.far;

  return (
    <div className="canvas-frame">
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className="game-canvas"
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerMove}
      />

      {(winner || paused) && (
        <div className="canvas-overlay">
          {winner ? (
            <>
              <span className="badge badge-emerald">O‘yin yakunlandi</span>
              <h2 style={{ fontSize: '2rem' }}>
                {(mode === 'webrtc' && role === 'guest'
                  ? winner === 'far'
                  : winner === 'near')
                  ? nearPlayer.username
                  : farPlayer.username}{' '}
                g‘olib!
              </h2>
              <p style={{ color: 'var(--text-secondary)' }}>
                Hisob: {displayNearScore} — {displayFarScore}
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => resetMatch(true)}
              >
                Qayta o‘ynash (Rematch)
              </button>
            </>
          ) : (
            <>
              <h2>Pauza</h2>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setPaused(false)}
              >
                Davom ettirish
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
