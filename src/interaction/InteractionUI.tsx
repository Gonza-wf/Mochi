// Interaction UI
// Handles: personal questions, decisions, free conversation, mini-game UI
// All minimal, transparent, context-aware.

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Decision } from './decisionsEngine';
import type { MiniGame } from './miniGames';

// ---- Personal Question Input ----
interface PersonalQuestionProps {
  questionId: string;
  question: string;
  onAnswer: (questionId: string, question: string, answer: string) => void;
  onDismiss: () => void;
  fairyX: number;
  fairyY: number;
}

export function PersonalQuestionInput({ questionId, question, onAnswer, onDismiss, fairyX, fairyY }: PersonalQuestionProps) {
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => setVisible(true), 50);
    setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) { onDismiss(); return; }
    onAnswer(questionId, question, trimmed);
  }, [value, questionId, question, onAnswer, onDismiss]);

  const posY = fairyY < window.innerHeight * 0.5
    ? fairyY + 90
    : fairyY - 160;

  const posX = Math.max(120, Math.min(fairyX, window.innerWidth - 120));

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 19,
          pointerEvents: 'auto',
        }}
        onClick={onDismiss}
        onTouchStart={onDismiss}
      />
      {/* Input box */}
      <div
        style={{
          position: 'fixed',
          left: posX,
          top: posY,
          transform: 'translateX(-50%)',
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.4s ease',
          pointerEvents: 'auto',
        }}
        onClick={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onDismiss(); }}
          placeholder="respondé..."
          maxLength={80}
          style={{
            background: 'rgba(10,5,20,0.75)',
            border: '1px solid rgba(180,150,255,0.25)',
            borderRadius: '20px',
            color: 'rgba(220,210,255,0.9)',
            fontSize: '14px',
            padding: '10px 18px',
            outline: 'none',
            width: '220px',
            textAlign: 'center',
            backdropFilter: 'blur(8px)',
            fontFamily: 'inherit',
            letterSpacing: '0.02em',
          }}
        />
        <div style={{ display: 'flex', gap: '16px' }}>
          <button
            onClick={submit}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(180,150,255,0.6)', fontSize: '12px',
              letterSpacing: '0.1em', padding: '4px 8px',
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(200,180,255,0.9)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(180,150,255,0.6)')}
          >
            decir
          </button>
          <button
            onClick={onDismiss}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(120,100,180,0.4)', fontSize: '12px',
              letterSpacing: '0.1em', padding: '4px 8px',
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(150,130,210,0.7)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(120,100,180,0.4)')}
          >
            no ahora
          </button>
        </div>
      </div>
    </>
  );
}

// ---- Decision UI ----
interface DecisionUIProps {
  decision: Decision;
  onChoose: (choice: 'A' | 'B') => void;
  fairyX: number;
  fairyY: number;
}

export function DecisionUI({ decision, onChoose, fairyX, fairyY }: DecisionUIProps) {
  const [visible, setVisible] = useState(false);
  const [chosen, setChosen] = useState<'A' | 'B' | null>(null);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
  }, []);

  const choose = (c: 'A' | 'B') => {
    if (chosen) return;
    setChosen(c);
    setTimeout(() => onChoose(c), 500);
  };

  const posY = fairyY < window.innerHeight * 0.5
    ? fairyY + 80
    : fairyY - 140;
  const posX = Math.max(130, Math.min(fairyX, window.innerWidth - 130));

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 19, pointerEvents: 'auto' }} />
      <div
        style={{
          position: 'fixed',
          left: posX,
          top: posY,
          transform: 'translateX(-50%)',
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.5s ease',
          pointerEvents: 'auto',
        }}
        onClick={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', gap: '20px' }}>
          {(['A', 'B'] as const).map(c => (
            <button
              key={c}
              onClick={() => choose(c)}
              style={{
                background: chosen === c
                  ? 'rgba(180,150,255,0.15)'
                  : 'rgba(10,5,20,0.7)',
                border: `1px solid rgba(180,150,255,${chosen === c ? '0.5' : '0.2'})`,
                borderRadius: '16px',
                color: `rgba(220,210,255,${chosen && chosen !== c ? '0.3' : '0.85'})`,
                fontSize: '13px',
                padding: '8px 16px',
                cursor: chosen ? 'default' : 'pointer',
                backdropFilter: 'blur(6px)',
                transition: 'all 0.3s ease',
                letterSpacing: '0.02em',
                fontFamily: 'inherit',
                minWidth: '80px',
              }}
              onMouseEnter={e => {
                if (!chosen) e.currentTarget.style.background = 'rgba(180,150,255,0.1)';
              }}
              onMouseLeave={e => {
                if (!chosen && chosen !== c) e.currentTarget.style.background = 'rgba(10,5,20,0.7)';
              }}
            >
              {c === 'A' ? decision.optionA : decision.optionB}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ---- Free Conversation Input ----
interface FreeConvoProps {
  onSend: (text: string) => void;
  onClose: () => void;
  fairyX: number;
  fairyY: number;
}

export function FreeConvoInput({ onSend, onClose, fairyX, fairyY }: FreeConvoProps) {
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => setVisible(true), 50);
    setTimeout(() => inputRef.current?.focus(), 150);
  }, []);

  const send = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) { onClose(); return; }
    onSend(trimmed);
    setValue('');
  }, [value, onSend, onClose]);

  const posY = fairyY < window.innerHeight * 0.5
    ? fairyY + 90
    : fairyY - 150;
  const posX = Math.max(130, Math.min(fairyX, window.innerWidth - 130));

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 19, pointerEvents: 'auto' }}
        onClick={onClose}
        onTouchStart={onClose}
      />
      <div
        style={{
          position: 'fixed',
          left: posX,
          top: posY,
          transform: 'translateX(-50%)',
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.35s ease',
          pointerEvents: 'auto',
        }}
        onClick={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(); if (e.key === 'Escape') onClose(); }}
          placeholder="decile algo..."
          maxLength={120}
          style={{
            background: 'rgba(10,5,20,0.75)',
            border: '1px solid rgba(180,150,255,0.2)',
            borderRadius: '20px',
            color: 'rgba(220,210,255,0.9)',
            fontSize: '14px',
            padding: '10px 18px',
            outline: 'none',
            width: '240px',
            textAlign: 'center',
            backdropFilter: 'blur(8px)',
            fontFamily: 'inherit',
            letterSpacing: '0.02em',
          }}
        />
        <div style={{ display: 'flex', gap: '16px' }}>
          <button
            onClick={send}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(180,150,255,0.6)', fontSize: '12px',
              letterSpacing: '0.1em', padding: '4px 8px',
            }}
          >
            enviar
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(120,100,180,0.35)', fontSize: '12px',
              letterSpacing: '0.1em', padding: '4px 8px',
            }}
          >
            cerrar
          </button>
        </div>
      </div>
    </>
  );
}

// ---- Mini Game UI ----
interface MiniGameUIProps {
  game: MiniGame;
  onReady: () => void; // player confirms ready
  progress?: number; // 0-1 for stay still
  sequencePositions?: { x: number; y: number }[];
  currentStep?: number;
  isInputPhase?: boolean;
}

export function MiniGameUI({ game, onReady, progress, sequencePositions, currentStep, isInputPhase }: MiniGameUIProps) {
  const [visible, setVisible] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);
  }, []);

  const confirm = () => {
    if (confirmed) return;
    setConfirmed(true);
    onReady();
  };

  return (
    <>
      {/* Sequence indicators */}
      {game.type === 'follow_sequence' && sequencePositions && isInputPhase && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 15, pointerEvents: 'none' }}>
          {sequencePositions.map((pos, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: pos.x,
                top: pos.y,
                transform: 'translate(-50%, -50%)',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: `1px solid rgba(180,150,255,${i < (currentStep || 0) ? '0.15' : '0.5'})`,
                background: i < (currentStep || 0)
                  ? 'rgba(180,150,255,0.05)'
                  : 'rgba(180,150,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: `rgba(200,180,255,${i < (currentStep || 0) ? '0.2' : '0.7'})`,
                fontSize: '11px',
                transition: 'all 0.3s',
                pointerEvents: 'none',
              }}
            >
              {i + 1}
            </div>
          ))}
        </div>
      )}

      {/* Stay still progress */}
      {game.type === 'stay_still' && progress !== undefined && progress > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '60px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 15,
          pointerEvents: 'none',
        }}>
          <div style={{
            width: '120px',
            height: '2px',
            background: 'rgba(180,150,255,0.15)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${progress * 100}%`,
              height: '100%',
              background: 'rgba(180,150,255,0.6)',
              borderRadius: '2px',
              transition: 'width 0.1s linear',
            }} />
          </div>
        </div>
      )}

      {/* Ready button (only if not confirmed yet) */}
      {!confirmed && game.type !== 'find_me' && (
        <div style={{
          position: 'fixed',
          bottom: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.4s',
          pointerEvents: 'auto',
        }}>
          <button
            onClick={confirm}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(180,150,255,0.5)', fontSize: '12px',
              letterSpacing: '0.1em', padding: '8px 16px',
              fontFamily: 'inherit',
            }}
          >
            listo
          </button>
        </div>
      )}
    </>
  );
}
