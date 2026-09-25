import { useEffect, useRef, useState } from 'react'
import { Fingerprint } from 'lucide-react'

const HOLD_MS = 900

/** Press and hold to confirm: the seal should feel like a deliberate act, not a tap. */
export function HoldButton({ color, label, onDone, disabled }: { color: string; label: string; onDone: () => void; disabled?: boolean }) {
  const [progress, setProgress] = useState(0)
  const raf = useRef<number | undefined>(undefined)
  const started = useRef<number | undefined>(undefined)
  const done = useRef(false)

  useEffect(() => () => cancelAnimationFrame(raf.current!), [])

  const start = () => {
    if (disabled || done.current || started.current !== undefined) return
    started.current = performance.now()
    navigator.vibrate?.(10)
    const step = (now: number) => {
      const p = Math.min(1, (now - started.current!) / HOLD_MS)
      setProgress(p)
      if (p >= 1) {
        done.current = true
        onDone()
        return
      }
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
  }

  const stop = () => {
    if (done.current) return
    cancelAnimationFrame(raf.current!)
    started.current = undefined
    setProgress(0)
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && (e.preventDefault(), start())}
      onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && stop()}
      onContextMenu={(e) => e.preventDefault()}
      className="relative h-16 w-full touch-none select-none overflow-hidden rounded-full border font-display text-lg font-bold uppercase tracking-[0.2em] disabled:opacity-40"
      style={{ borderColor: color, color: progress > 0.5 ? '#000' : color }}
      aria-label={`${label} (press and hold)`}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0"
        style={{ width: `${progress * 100}%`, background: color, transition: progress === 0 ? 'width 200ms ease-out' : 'none' }}
      />
      <span className="relative flex items-center justify-center gap-2">
        <Fingerprint size={22} strokeWidth={2.25} aria-hidden />
        {label}
      </span>
    </button>
  )
}
