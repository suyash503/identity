import { useEffect, useRef } from 'react'

// Open layers (overlays, sheets, the photo viewer), newest last. Android's back button closes the top one.
const stack: (() => void)[] = []

/** Registers a layer for as long as it's mounted. The latest onClose is always used. */
export function useBackClose(onClose: (() => void) | undefined) {
  const ref = useRef(onClose)
  ref.current = onClose
  useEffect(() => {
    const close = () => ref.current?.()
    stack.push(close)
    return () => {
      const i = stack.lastIndexOf(close)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [])
}

/** Closes the top layer. False when nothing was open. */
export function closeTopLayer(): boolean {
  const close = stack.at(-1)
  if (!close) return false
  close()
  return true
}
