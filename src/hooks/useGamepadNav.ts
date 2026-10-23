import { useEffect, useState, useRef, useCallback } from 'react';

export interface GamepadNavOptions {
  onSquare?: () => void;
  onTriangle?: () => void;
  onOptions?: () => void;
  onCircle?: () => void;
}

export function useGamepadNav(options: GamepadNavOptions = {}) {
  const [isGamepadConnected, setIsGamepadConnected] = useState(false);
  const [gamepadName, setGamepadName] = useState<string>('Control PS5 / Gamepad');
  
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const lastButtonPressTimeRef = useRef<{ [key: number]: number }>({});
  const lastDirectionTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);

  // Focus spatial navigation helper
  const navigateFocus = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    const focusableSelectors = [
      'button:not([disabled])',
      'a[href]',
      'textarea:not([disabled])',
      'input:not([disabled])',
      '[tabindex="0"]',
    ].join(',');

    const focusables = Array.from(document.querySelectorAll<HTMLElement>(focusableSelectors)).filter(
      (el) => el.offsetWidth > 0 && el.offsetHeight > 0 && getComputedStyle(el).visibility !== 'hidden'
    );

    if (focusables.length === 0) return;

    const current = document.activeElement as HTMLElement | null;
    if (!current || !focusables.includes(current)) {
      focusables[0].focus();
      return;
    }

    const currentRect = current.getBoundingClientRect();
    let bestCandidate: HTMLElement | null = null;
    let minDistance = Infinity;

    for (const candidate of focusables) {
      if (candidate === current) continue;
      const candidateRect = candidate.getBoundingClientRect();

      let isDirectionValid = false;
      if (direction === 'up' && candidateRect.bottom <= currentRect.top + 10) isDirectionValid = true;
      if (direction === 'down' && candidateRect.top >= currentRect.bottom - 10) isDirectionValid = true;
      if (direction === 'left' && candidateRect.right <= currentRect.left + 10) isDirectionValid = true;
      if (direction === 'right' && candidateRect.left >= currentRect.right - 10) isDirectionValid = true;

      if (isDirectionValid) {
        const dx = (candidateRect.left + candidateRect.width / 2) - (currentRect.left + currentRect.width / 2);
        const dy = (candidateRect.top + candidateRect.height / 2) - (currentRect.top + currentRect.height / 2);
        const distance = dx * dx + dy * dy;

        if (distance < minDistance) {
          minDistance = distance;
          bestCandidate = candidate;
        }
      }
    }

    if (bestCandidate) {
      bestCandidate.focus();
      bestCandidate.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  useEffect(() => {
    const handleConnect = (e: GamepadEvent) => {
      console.log('[Gamepad] Control conectado:', e.gamepad.id);
      setIsGamepadConnected(true);
      const name = e.gamepad.id.toLowerCase().includes('dualsense')
        ? 'DualSense PS5'
        : e.gamepad.id.toLowerCase().includes('playstation') || e.gamepad.id.toLowerCase().includes('wireless controller')
        ? 'Control PlayStation'
        : 'Control PS5 / Gamepad';
      setGamepadName(name);
    };

    const handleDisconnect = (e: GamepadEvent) => {
      console.log('[Gamepad] Control desconectado:', e.gamepad.id);
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const hasAny = Array.from(gamepads).some((g) => g && g.connected);
      if (!hasAny) {
        setIsGamepadConnected(false);
      }
    };

    const handlePointerInteraction = () => {
      document.body.classList.remove('gamepad-active');
    };

    window.addEventListener('pointerdown', handlePointerInteraction);
    window.addEventListener('touchstart', handlePointerInteraction);
    window.addEventListener('gamepadconnected', handleConnect);
    window.addEventListener('gamepaddisconnected', handleDisconnect);

    // Initial check
    if (navigator.getGamepads) {
      const initialGamepads = navigator.getGamepads();
      const active = Array.from(initialGamepads).find((g) => g && g.connected);
      if (active) {
        setIsGamepadConnected(true);
        if (active.id.toLowerCase().includes('dualsense')) {
          setGamepadName('DualSense PS5');
        }
      }
    }

    // Polling loop
    const pollGamepad = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = Array.from(gamepads).find((g) => g && g.connected);

      if (gp) {
        if (!isGamepadConnected) {
          setIsGamepadConnected(true);
        }

        const now = Date.now();
        const ACTION_DEBOUNCE_MS = 200;
        const DIRECTION_COOLDOWN_MS = 220;

        const isPressed = (btnIndex: number) => {
          const btn = gp.buttons[btnIndex];
          if (!btn) return false;
          const pressed = typeof btn === 'object' ? btn.pressed : btn === 1.0;
          if (pressed) {
            document.body.classList.add('gamepad-active');
            const lastTime = lastButtonPressTimeRef.current[btnIndex] || 0;
            if (now - lastTime > ACTION_DEBOUNCE_MS) {
              lastButtonPressTimeRef.current[btnIndex] = now;
              return true;
            }
          }
          return false;
        };

        const activeEl = document.activeElement as HTMLElement | null;
        const isEditingText = activeEl && (
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'INPUT' ||
          activeEl.isContentEditable
        );

        // 1-5. Action Buttons: Disabled when typing inside textarea/input so PS5 native virtual keyboard works 100%
        if (!isEditingText) {
          // Cross / X (Button 0): Click active element
          if (isPressed(0)) {
            if (activeEl && typeof activeEl.click === 'function') {
              activeEl.click();
            }
          }

          // Circle / O (Button 1): Cancel / Back / Blur
          if (isPressed(1)) {
            if (optionsRef.current.onCircle) {
              optionsRef.current.onCircle();
            } else if (activeEl) {
              activeEl.blur();
            }
          }

          // Square / ■ (Button 2): Cycle reasoning mode
          if (isPressed(2)) {
            if (optionsRef.current.onSquare) {
              optionsRef.current.onSquare();
            }
          }

          // Triangle / ▲ (Button 3): Open model selector
          if (isPressed(3)) {
            if (optionsRef.current.onTriangle) {
              optionsRef.current.onTriangle();
            }
          }

          // Options / Start (Button 9): Toggle sidebar
          if (isPressed(9)) {
            if (optionsRef.current.onOptions) {
              optionsRef.current.onOptions();
            }
          }
        }

        // 6. D-Pad & Left Stick navigation with strict 220ms cooldown
        const leftStickX = gp.axes[0] || 0;
        const leftStickY = gp.axes[1] || 0;

        let targetDir: 'up' | 'down' | 'left' | 'right' | null = null;
        if (isPressed(12) || leftStickY < -0.55) targetDir = 'up';
        else if (isPressed(13) || leftStickY > 0.55) targetDir = 'down';
        else if (isPressed(14) || leftStickX < -0.55) targetDir = 'left';
        else if (isPressed(15) || leftStickX > 0.55) targetDir = 'right';

        if (targetDir) {
          document.body.classList.add('gamepad-active');
          if (now - lastDirectionTimeRef.current > DIRECTION_COOLDOWN_MS) {
            lastDirectionTimeRef.current = now;
            navigateFocus(targetDir);
          }
        }

        // 7. Right Stick Y / L2 / R2: Proportional continuous smooth TV scrolling
        const rightStickY = gp.axes[3] || gp.axes[2] || 0;
        const l2Val = typeof gp.buttons[6] === 'object' ? gp.buttons[6].value : (gp.buttons[6] || 0);
        const r2Val = typeof gp.buttons[7] === 'object' ? gp.buttons[7].value : (gp.buttons[7] || 0);
        const scrollAmount = (rightStickY * 28) + (r2Val * 25) - (l2Val * 25);

        if (Math.abs(scrollAmount) > 2) {
          document.body.classList.add('gamepad-active');
          const scrollTarget = document.querySelector('.chat-scroll-container') || window;
          scrollTarget.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        }
        animFrameRef.current = requestAnimationFrame(pollGamepad);
      }
    };

    if (isGamepadConnected) {
      animFrameRef.current = requestAnimationFrame(pollGamepad);
    }

    return () => {
      window.removeEventListener('pointerdown', handlePointerInteraction);
      window.removeEventListener('touchstart', handlePointerInteraction);
      window.removeEventListener('gamepadconnected', handleConnect);
      window.removeEventListener('gamepaddisconnected', handleDisconnect);
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isGamepadConnected, navigateFocus]);

  return { isGamepadConnected, gamepadName };
}
