import { useEffect, useRef, useState } from 'react';
import { playHitSound, playScoreSound, playWallSound } from '../utils/sound';

const WIDTH = 900;
const HEIGHT = 520;
const TABLE_MARGIN_X = 48;
const TABLE_MARGIN_Y = 34;
const PADDLE_RADIUS = 26;
const BALL_RADIUS = 9;
const WIN_SCORE = 11;

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function createInitialBall(serveToRight = true) {
  const dir = serveToRight ? 1 : -1;
  const angle = (Math.random() - 0.5) * 0.45;
  const speed = 6.2;
  return {
    x: WIDTH / 2,
    y: HEIGHT / 2,
    vx: Math.cos(angle) * speed * dir,
    vy: Math.sin(angle) * speed,
    trail: [],
  };
}

export default function TableTennisGame({
  mode = 'ai', // 'ai' | 'webrtc'
  role = 'host', // 'host' | 'guest'
  difficulty = 'medium',
  muted = false,
  leftPlayer = { username: 'Siz', avatarColor: '#10b981' },
  rightPlayer = { username: 'Raqib', avatarColor: '#06b6d4' },
  sendGameData,
  sendReliable,
  incomingStateRef,
  incomingPaddleRef,
  rematchSignal,
  onScoreChange,
  onMatchEnd,
}) {
  const canvasRef = useRef(null);
  const [winner, setWinner] = useState(null); // 'left' | 'right' | null
  const [paused, setPaused] = useState(false);

  const stateRef = useRef({
    left: { x: 110, y: HEIGHT / 2, vx: 0, vy: 0 },
    right: { x: WIDTH - 110, y: HEIGHT / 2, vx: 0, vy: 0 },
    ball: createInitialBall(true),
    scores: { left: 0, right: 0 },
    servePauseFrames: 36,
    finished: false,
  });

  const keysRef = useRef({});
  const pointerTargetRef = useRef(null);

  const resetMatch = (notifyPeer = false) => {
    stateRef.current = {
      left: { x: 110, y: HEIGHT / 2, vx: 0, vy: 0 },
      right: { x: WIDTH - 110, y: HEIGHT / 2, vx: 0, vy: 0 },
      ball: createInitialBall(true),
      scores: { left: 0, right: 0 },
      servePauseFrames: 40,
      finished: false,
    };
    setWinner(null);
    setPaused(false);
    onScoreChange?.({ left: 0, right: 0 });
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
    const isLocalLeft = mode === 'ai' || role === 'host';

    function movePaddleWithInput(paddle, isLeft) {
      const minX = isLeft ? TABLE_MARGIN_X + 12 : WIDTH / 2 + PADDLE_RADIUS + 10;
      const maxX = isLeft ? WIDTH / 2 - PADDLE_RADIUS - 10 : WIDTH - TABLE_MARGIN_X - 12;
      const minY = TABLE_MARGIN_Y + PADDLE_RADIUS;
      const maxY = HEIGHT - TABLE_MARGIN_Y - PADDLE_RADIUS;

      const prevX = paddle.x;
      const prevY = paddle.y;

      const keys = keysRef.current;
      const speed = 7.5;
      let movedByKey = false;
      if (keys.w || keys.arrowup) {
        paddle.y -= speed;
        movedByKey = true;
      }
      if (keys.s || keys.arrowdown) {
        paddle.y += speed;
        movedByKey = true;
      }
      if (keys.a || keys.arrowleft) {
        paddle.x -= speed;
        movedByKey = true;
      }
      if (keys.d || keys.arrowright) {
        paddle.x += speed;
        movedByKey = true;
      }

      if (!movedByKey && pointerTargetRef.current) {
        const tx = pointerTargetRef.current.x;
        const ty = pointerTargetRef.current.y;
        paddle.x += (tx - paddle.x) * 0.42;
        paddle.y += (ty - paddle.y) * 0.42;
      }

      paddle.x = clamp(paddle.x, minX, maxX);
      paddle.y = clamp(paddle.y, minY, maxY);
      paddle.vx = paddle.x - prevX;
      paddle.vy = paddle.y - prevY;
    }

    function updateAI(paddle, ball) {
      const prevX = paddle.x;
      const prevY = paddle.y;
      const cfg =
        difficulty === 'hard'
          ? { maxSpeed: 6.8, homeX: WIDTH - 105, reactX: WIDTH * 0.35 }
          : difficulty === 'easy'
            ? { maxSpeed: 3.6, homeX: WIDTH - 95, reactX: WIDTH * 0.55 }
            : { maxSpeed: 5.1, homeX: WIDTH - 100, reactX: WIDTH * 0.45 };

      let targetY = HEIGHT / 2;
      let targetX = cfg.homeX;

      if (ball.vx > 0 || ball.x > cfg.reactX) {
        targetY = ball.y;
        if (ball.x > WIDTH / 2 && ball.vx > 0) {
          targetX = clamp(ball.x + 28, WIDTH / 2 + 60, WIDTH - TABLE_MARGIN_X - 20);
        }
      }

      const dy = targetY - paddle.y;
      const dx = targetX - paddle.x;
      paddle.y += clamp(dy, -cfg.maxSpeed, cfg.maxSpeed);
      paddle.x += clamp(dx, -cfg.maxSpeed * 0.65, cfg.maxSpeed * 0.65);

      paddle.x = clamp(
        paddle.x,
        WIDTH / 2 + PADDLE_RADIUS + 10,
        WIDTH - TABLE_MARGIN_X - 12
      );
      paddle.y = clamp(
        paddle.y,
        TABLE_MARGIN_Y + PADDLE_RADIUS,
        HEIGHT - TABLE_MARGIN_Y - PADDLE_RADIUS
      );
      paddle.vx = paddle.x - prevX;
      paddle.vy = paddle.y - prevY;
    }

    function checkPaddleHit(paddle, ball, isLeft) {
      const dx = ball.x - paddle.x;
      const dy = ball.y - paddle.y;
      const dist = Math.hypot(dx, dy);
      const minDist = PADDLE_RADIUS + BALL_RADIUS;

      if (dist <= minDist && dist > 0) {
        const nx = dx / dist;
        const ny = dy / dist;
        ball.x = paddle.x + nx * (minDist + 1);
        ball.y = paddle.y + ny * (minDist + 1);

        const currentSpeed = Math.hypot(ball.vx, ball.vy);
        const paddleBoost = Math.min(2.6, Math.hypot(paddle.vx, paddle.vy) * 0.25);
        const nextSpeed = clamp(currentSpeed * 1.045 + paddleBoost, 6.2, 13.5);

        const hitOffset = clamp(dy / PADDLE_RADIUS, -1, 1);
        const maxAngle = Math.PI / 3.2;
        const angle = hitOffset * maxAngle;

        const dir = isLeft ? 1 : -1;
        ball.vx = Math.cos(angle) * nextSpeed * dir;
        ball.vy = Math.sin(angle) * nextSpeed + paddle.vy * 0.28;

        if (!muted) playHitSound(nextSpeed);
      }
    }

    function checkWin(scores) {
      const { left, right } = scores;
      if ((left >= WIN_SCORE || right >= WIN_SCORE) && Math.abs(left - right) >= 2) {
        const winSide = left > right ? 'left' : 'right';
        stateRef.current.finished = true;
        setWinner(winSide);
        const iWon = isLocalLeft ? winSide === 'left' : winSide === 'right';
        onMatchEnd?.({
          won: iWon,
          myScore: isLocalLeft ? left : right,
          opponentScore: isLocalLeft ? right : left,
        });
        return true;
      }
      return false;
    }

    function step() {
      const s = stateRef.current;

      if (!paused && !s.finished) {
        if (mode === 'webrtc' && role === 'guest') {
          movePaddleWithInput(s.right, false);
          sendGameData?.({
            type: 'paddle',
            x: s.right.x,
            y: s.right.y,
          });

          if (incomingStateRef?.current) {
            const net = incomingStateRef.current;
            s.left.x = net.left.x;
            s.left.y = net.left.y;
            s.ball.x = net.ball.x;
            s.ball.y = net.ball.y;
            s.ball.vx = net.ball.vx;
            s.ball.vy = net.ball.vy;
            s.ball.trail.push({ x: s.ball.x, y: s.ball.y });
            if (s.ball.trail.length > 10) s.ball.trail.shift();

            if (
              net.scores.left !== s.scores.left ||
              net.scores.right !== s.scores.right
            ) {
              s.scores = { ...net.scores };
              onScoreChange?.(s.scores);
              if (!muted) playScoreSound(net.scores.right > s.scores.right);
              checkWin(s.scores);
            }
            incomingStateRef.current = null;
          }
        } else {
          // Authoritative simulation (AI mode or WebRTC Host)
          movePaddleWithInput(s.left, true);

          if (mode === 'ai') {
            updateAI(s.right, s.ball);
          } else if (incomingPaddleRef?.current) {
            s.right.vx = incomingPaddleRef.current.x - s.right.x;
            s.right.vy = incomingPaddleRef.current.y - s.right.y;
            s.right.x = incomingPaddleRef.current.x;
            s.right.y = incomingPaddleRef.current.y;
          }

          if (s.servePauseFrames > 0) {
            s.servePauseFrames -= 1;
          } else {
            s.ball.x += s.ball.vx;
            s.ball.y += s.ball.vy;
            s.ball.trail.push({ x: s.ball.x, y: s.ball.y });
            if (s.ball.trail.length > 10) s.ball.trail.shift();

            // Top / bottom table bounce
            if (s.ball.y - BALL_RADIUS <= TABLE_MARGIN_Y) {
              s.ball.y = TABLE_MARGIN_Y + BALL_RADIUS;
              s.ball.vy = Math.abs(s.ball.vy);
              if (!muted) playWallSound();
            } else if (s.ball.y + BALL_RADIUS >= HEIGHT - TABLE_MARGIN_Y) {
              s.ball.y = HEIGHT - TABLE_MARGIN_Y - BALL_RADIUS;
              s.ball.vy = -Math.abs(s.ball.vy);
              if (!muted) playWallSound();
            }

            checkPaddleHit(s.left, s.ball, true);
            checkPaddleHit(s.right, s.ball, false);

            // Scoring
            if (s.ball.x < TABLE_MARGIN_X - 18) {
              s.scores = { ...s.scores, right: s.scores.right + 1 };
              onScoreChange?.(s.scores);
              if (!muted) playScoreSound(false);
              if (!checkWin(s.scores)) {
                s.ball = createInitialBall(false);
                s.servePauseFrames = 36;
              }
            } else if (s.ball.x > WIDTH - TABLE_MARGIN_X + 18) {
              s.scores = { ...s.scores, left: s.scores.left + 1 };
              onScoreChange?.(s.scores);
              if (!muted) playScoreSound(true);
              if (!checkWin(s.scores)) {
                s.ball = createInitialBall(true);
                s.servePauseFrames = 36;
              }
            }
          }

          if (mode === 'webrtc' && role === 'host') {
            sendGameData?.({
              type: 'state',
              left: { x: s.left.x, y: s.left.y },
              ball: {
                x: s.ball.x,
                y: s.ball.y,
                vx: s.ball.vx,
                vy: s.ball.vy,
              },
              scores: s.scores,
            });
          }
        }
      }

      draw();
      animId = requestAnimationFrame(step);
    }

    function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const s = stateRef.current;

      // Arena floor
      ctx.fillStyle = '#07111c';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Table shadow
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(
        TABLE_MARGIN_X + 6,
        TABLE_MARGIN_Y + 8,
        WIDTH - TABLE_MARGIN_X * 2,
        HEIGHT - TABLE_MARGIN_Y * 2
      );

      // Table surface
      const grad = ctx.createLinearGradient(0, TABLE_MARGIN_Y, 0, HEIGHT - TABLE_MARGIN_Y);
      grad.addColorStop(0, '#0b5e43');
      grad.addColorStop(0.5, '#0f7654');
      grad.addColorStop(1, '#094f38');
      ctx.fillStyle = grad;
      ctx.fillRect(
        TABLE_MARGIN_X,
        TABLE_MARGIN_Y,
        WIDTH - TABLE_MARGIN_X * 2,
        HEIGHT - TABLE_MARGIN_Y * 2
      );

      // Table white border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 4;
      ctx.strokeRect(
        TABLE_MARGIN_X,
        TABLE_MARGIN_Y,
        WIDTH - TABLE_MARGIN_X * 2,
        HEIGHT - TABLE_MARGIN_Y * 2
      );

      // Center service line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(TABLE_MARGIN_X, HEIGHT / 2);
      ctx.lineTo(WIDTH - TABLE_MARGIN_X, HEIGHT / 2);
      ctx.stroke();

      // Net
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(WIDTH / 2, TABLE_MARGIN_Y - 10);
      ctx.lineTo(WIDTH / 2, HEIGHT - TABLE_MARGIN_Y + 10);
      ctx.stroke();
      ctx.setLineDash([]);

      // Net posts
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(WIDTH / 2 - 4, TABLE_MARGIN_Y - 14, 8, 12);
      ctx.fillRect(WIDTH / 2 - 4, HEIGHT - TABLE_MARGIN_Y + 2, 8, 12);

      // Ball trail
      for (let i = 0; i < s.ball.trail.length; i += 1) {
        const pt = s.ball.trail[i];
        const alpha = ((i + 1) / s.ball.trail.length) * 0.25;
        ctx.fillStyle = `rgba(251, 191, 36, ${alpha})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, BALL_RADIUS * 0.75, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw paddles
      drawPaddle(ctx, s.left.x, s.left.y, leftPlayer.avatarColor || '#10b981');
      drawPaddle(ctx, s.right.x, s.right.y, rightPlayer.avatarColor || '#06b6d4');

      // Ball
      ctx.save();
      ctx.shadowColor = 'rgba(251, 191, 36, 0.65)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(s.ball.x, s.ball.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawPaddle(ctx, x, y, color) {
      // Outer rim
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(x, y, PADDLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Rubber face
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, PADDLE_RADIUS - 4, 0, Math.PI * 2);
      ctx.fill();

      // Highlight
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, PADDLE_RADIUS - 4, -0.8, 0.8);
      ctx.stroke();
    }

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [
    difficulty,
    incomingPaddleRef,
    incomingStateRef,
    leftPlayer.avatarColor,
    mode,
    muted,
    onMatchEnd,
    onScoreChange,
    paused,
    rightPlayer.avatarColor,
    role,
    sendGameData,
  ]);

  function handlePointerMove(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    pointerTargetRef.current = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

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
                {winner === 'left' ? leftPlayer.username : rightPlayer.username} g‘olib!
              </h2>
              <p style={{ color: 'var(--text-secondary)' }}>
                Hisob: {stateRef.current.scores.left} — {stateRef.current.scores.right}
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
