import { useEffect, useState, useRef } from 'react';
import { soundEngine } from '../sound/soundEngine';

interface Props {
  message: string | null;
  fairyX: number;
  fairyY: number;
  onTalkingChange?: (talking: boolean) => void;
}

type Phase = 'idle' | 'typing' | 'displaying' | 'fading';

function stripRoleplay(text: string): string {
  return text.replace(/\*[^*]+\*/g, '').replace(/\s+/g, ' ').trim();
}

const MARGIN = 16; // px from screen edges

export default function MemoryBubble({ message, fairyX, fairyY, onTalkingChange }: Props) {
  const [displayText, setDisplayText] = useState('');
  const [opacity, setOpacity] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pos, setPos] = useState({ left: 0, top: 0, transformX: '-50%' });

  const bubbleRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>('idle');
  const typeIntervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);

  // Recalculate position whenever fairy moves or text changes
  useEffect(() => {
    const el = bubbleRef.current;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // Measure real bubble width (or estimate based on text length)
    const bubbleW = el ? el.offsetWidth : Math.min(displayText.length * 8.5, screenW * 0.7);
    const bubbleH = el ? el.offsetHeight : 20;

    // Desired center X = fairy X
    let left = fairyX;

    // Clamp so the bubble doesn't exit left or right edges
    const halfW = bubbleW / 2;
    left = Math.max(halfW + MARGIN, Math.min(left, screenW - halfW - MARGIN));

    // Desired top = above the fairy
    let top = fairyY - 120;

    // If it would go above the screen, put it below the fairy instead
    if (top - bubbleH < MARGIN) {
      top = fairyY + 80;
    }

    // Clamp vertically too
    top = Math.max(MARGIN + bubbleH, Math.min(top, screenH - MARGIN));

    setPos({ left, top, transformX: '-50%' });
  }, [fairyX, fairyY, displayText]);

  const clearAllTimers = () => {
    if (typeIntervalRef.current !== null) {
      clearInterval(typeIntervalRef.current);
      typeIntervalRef.current = null;
    }
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const setPhaseSync = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const processNext = () => {
    if (queueRef.current.length === 0) {
      processingRef.current = false;
      onTalkingChange?.(false);
      return;
    }

    const rawMsg = queueRef.current.shift()!;
    const msg = stripRoleplay(rawMsg);
    if (!msg) { processNext(); return; }
    processingRef.current = true;
    onTalkingChange?.(true);

    clearAllTimers();
    setDisplayText('');
    setOpacity(0);
    setPhaseSync('typing');

    timeoutRef.current = window.setTimeout(() => {
      setOpacity(1);

      let i = 0;
      const chars = msg.split('');

      typeIntervalRef.current = window.setInterval(() => {
        if (phaseRef.current !== 'typing') {
          clearInterval(typeIntervalRef.current!);
          typeIntervalRef.current = null;
          return;
        }

        i++;
        setDisplayText(chars.slice(0, i).join(''));
        // Sound per character — only for non-space, non-punctuation chars
        const ch = chars[i - 1];
        if (ch && ch.trim() && !/[.,!?…\-]/.test(ch)) {
          soundEngine.play('typing');
        }

        if (i >= chars.length) {
          clearInterval(typeIntervalRef.current!);
          typeIntervalRef.current = null;
          setPhaseSync('displaying');

          const displayDuration = Math.max(2500, msg.length * 80);
          timeoutRef.current = window.setTimeout(() => {
            setPhaseSync('fading');
            setOpacity(0);

            timeoutRef.current = window.setTimeout(() => {
              setDisplayText('');
              setPhaseSync('idle');
              onTalkingChange?.(false);
              processNext();
            }, 900);
          }, displayDuration);
        }
      }, 38);
    }, 120);
  };

  useEffect(() => {
    if (!message) return;

    if (phaseRef.current === 'fading' || phaseRef.current === 'idle') {
      queueRef.current = [message];
      clearAllTimers();
      setPhaseSync('idle');
      setDisplayText('');
      setOpacity(0);
      processingRef.current = false;
      timeoutRef.current = window.setTimeout(() => {
        processNext();
      }, 50);
    } else if (phaseRef.current === 'displaying') {
      queueRef.current = [message];
      clearAllTimers();
      setPhaseSync('fading');
      setOpacity(0);
      timeoutRef.current = window.setTimeout(() => {
        setDisplayText('');
        setPhaseSync('idle');
        processNext();
      }, 600);
    } else if (phaseRef.current === 'typing') {
      queueRef.current = [message];
    }
  }, [message]);

  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, []);

  if (phase === 'idle' && displayText === '') return null;

  return (
    <div
      ref={bubbleRef}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        transform: `translate(${pos.transformX}, -100%)`,
        opacity,
        transition: 'opacity 0.9s ease',
        pointerEvents: 'none',
        zIndex: 10,
        maxWidth: `min(70vw, ${window.innerWidth - MARGIN * 2}px)`,
        textAlign: 'center',
        color: 'rgba(210, 195, 255, 0.85)',
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        fontSize: '14px',
        fontWeight: 300,
        letterSpacing: '0.5px',
        textShadow: '0 0 12px rgba(160, 130, 255, 0.5), 0 0 30px rgba(120, 90, 200, 0.2)',
        lineHeight: 1.4,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        wordBreak: 'break-word',
        padding: '0 4px',
      }}
    >
      {displayText}
    </div>
  );
}
