// --- Teaching Input ---
// Minimal floating input that appears only when the fairy asks a question.
// Player types a response. Fairy remembers it forever.
// Completely transparent, matches the aesthetic.

import { useState, useRef, useEffect, useCallback } from 'react';

const TEACHING_KEY = 'fairy_teachings';

export interface Teaching {
  word: string;
  playerResponse: string;
  timestamp: number;
  referenced: boolean;   // has the fairy referenced this teaching?
}

interface TeachingState {
  teachings: Teaching[];
}

function loadTeachings(): TeachingState {
  try {
    const raw = localStorage.getItem(TEACHING_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupted */ }
  return { teachings: [] };
}

function saveTeachings(state: TeachingState) {
  try {
    localStorage.setItem(TEACHING_KEY, JSON.stringify(state));
  } catch { /* full */ }
}

// Extract the word from a question like "¿Qué es una pizza?"
function extractWordFromQuestion(question: string): string | null {
  // Common patterns
  const patterns = [
    /¿Qué es (?:un |una |el |la |los |las )?(.+?)\??$/i,
    /¿Qué son (?:los |las )?(.+?)\??$/i,
    /¿Cómo (?:es |son |suena )(?:un |una |el |la )?(.+?)\??$/i,
  ];
  
  for (const pat of patterns) {
    const match = question.match(pat);
    if (match) return match[1].toLowerCase().trim();
  }
  
  return null;
}

interface Props {
  question: string | null;
  onAnswer: (word: string, answer: string) => void;
  onDismiss: () => void;
  fairyX: number;
  fairyY: number;
}

export default function TeachingInput({ question, onAnswer, onDismiss, fairyX, fairyY }: Props) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState('');
  const [opacity, setOpacity] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentQuestion = useRef<string | null>(null);

  useEffect(() => {
    if (question && question !== currentQuestion.current) {
      currentQuestion.current = question;
      setVisible(true);
      setValue('');
      setSubmitted(false);
      
      // Delay appearance
      setTimeout(() => {
        setOpacity(1);
        // Focus input on mobile
        setTimeout(() => {
          inputRef.current?.focus();
        }, 400);
      }, 2000); // Appear 2s after the question is shown
    }
  }, [question]);

  const handleSubmit = useCallback(() => {
    if (!value.trim() || !question) return;
    
    const word = extractWordFromQuestion(question) || question;
    
    // Save teaching
    const state = loadTeachings();
    state.teachings.push({
      word: word,
      playerResponse: value.trim(),
      timestamp: Date.now(),
      referenced: false,
    });
    saveTeachings(state);
    
    onAnswer(word, value.trim());
    setSubmitted(true);
    
    // Fade out
    setTimeout(() => {
      setOpacity(0);
      setTimeout(() => {
        setVisible(false);
        currentQuestion.current = null;
      }, 800);
    }, 1000);
  }, [value, question, onAnswer]);

  const handleDismiss = useCallback(() => {
    setOpacity(0);
    setTimeout(() => {
      setVisible(false);
      currentQuestion.current = null;
      onDismiss();
    }, 800);
  }, [onDismiss]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      handleDismiss();
    }
  }, [handleSubmit, handleDismiss]);

  if (!visible) return null;

  // Position below the fairy
  const top = Math.min(fairyY + 80, window.innerHeight - 80);
  const left = Math.max(40, Math.min(fairyX, window.innerWidth - 40));

  return (
    <>
      {/* Invisible overlay — absorbs all pointer events so canvas can't receive accidental taps */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 19,
          pointerEvents: submitted ? 'none' : 'auto',
          background: 'transparent',
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
      <div
        style={{
          position: 'fixed',
          left,
          top,
          transform: 'translate(-50%, 0)',
          opacity,
          transition: 'opacity 0.8s ease',
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          pointerEvents: submitted ? 'none' : 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {!submitted ? (
          <>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enseñale..."
              maxLength={80}
              style={{
                background: 'rgba(20, 10, 40, 0.5)',
                border: '1px solid rgba(160, 130, 255, 0.2)',
                borderRadius: '20px',
                padding: '8px 16px',
                color: 'rgba(220, 210, 255, 0.9)',
                fontSize: '13px',
                fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
                fontWeight: 300,
                letterSpacing: '0.5px',
                outline: 'none',
                width: '200px',
                maxWidth: '60vw',
                textAlign: 'center',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: '0 0 20px rgba(120, 90, 200, 0.15)',
              }}
            />
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleSubmit}
                disabled={!value.trim()}
                style={{
                  background: 'none',
                  border: 'none',
                  color: value.trim() ? 'rgba(200, 180, 255, 0.7)' : 'rgba(120, 100, 160, 0.3)',
                  fontSize: '12px',
                  fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
                  fontWeight: 300,
                  cursor: value.trim() ? 'pointer' : 'default',
                  padding: '4px 12px',
                  letterSpacing: '0.5px',
                  transition: 'color 0.3s',
                }}
              >
                enseñar
              </button>
              <button
                onClick={handleDismiss}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(150, 130, 180, 0.4)',
                  fontSize: '12px',
                  fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
                  fontWeight: 300,
                  cursor: 'pointer',
                  padding: '4px 12px',
                  letterSpacing: '0.5px',
                }}
              >
                ignorar
              </button>
            </div>
          </>
        ) : (
          <div
            style={{
              color: 'rgba(200, 180, 255, 0.6)',
              fontSize: '12px',
              fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
              fontWeight: 300,
              letterSpacing: '0.5px',
              textShadow: '0 0 8px rgba(160, 130, 255, 0.3)',
            }}
          >
            ...lo voy a recordar.
          </div>
        )}
      </div>
    </>
  );
}

// --- Static helpers for referencing teachings ---

export function getTeachings(): Teaching[] {
  return loadTeachings().teachings;
}

export function getTeachingFor(word: string): Teaching | null {
  const state = loadTeachings();
  return state.teachings.find(t => t.word.toLowerCase() === word.toLowerCase()) || null;
}

export function getRandomUnreferencedTeaching(): Teaching | null {
  const state = loadTeachings();
  const unreferenced = state.teachings.filter(t => !t.referenced);
  if (unreferenced.length === 0) {
    // Reset referenced flags if all have been referenced
    if (state.teachings.length > 0) {
      state.teachings.forEach(t => t.referenced = false);
      saveTeachings(state);
      return state.teachings[Math.floor(Math.random() * state.teachings.length)];
    }
    return null;
  }
  const teaching = unreferenced[Math.floor(Math.random() * unreferenced.length)];
  teaching.referenced = true;
  saveTeachings(state);
  return teaching;
}

// Generate a phrase referencing a past teaching
export function getTeachingReferencePhrase(): string | null {
  const teaching = getRandomUnreferencedTeaching();
  if (!teaching) return null;

  const phrases = [
    `Me dijiste que "${teaching.word}" es "${teaching.playerResponse}"... todavía pienso en eso.`,
    `"${teaching.playerResponse}"... así describiste "${teaching.word}". Me gusta.`,
    `Cada vez que pienso en "${teaching.word}", pienso en lo que me dijiste.`,
    `"${teaching.word}"... "${teaching.playerResponse}". Lo llevo conmigo.`,
    `¿Sabés? Todavía recuerdo cuando me enseñaste "${teaching.word}".`,
    `Me enseñaste que "${teaching.word}" es "${teaching.playerResponse}". No lo olvido.`,
  ];

  return phrases[Math.floor(Math.random() * phrases.length)];
}
