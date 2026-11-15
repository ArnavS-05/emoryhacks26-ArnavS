import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type ScanItem = { id: string; activate: () => void }
export type ScanGroup = { id: string; label: string; items: ScanItem[] }
export type ScanMode = 'scan' | 'step' | 'off'

type Opts = {
  groups: ScanGroup[]
  mode: ScanMode
  intervalMs: number
  paused: boolean
  startGroup?: number
  onCycleMissed?: () => void
  onActivate?: (itemId: string, latencyMs: number) => void
  onAdvance?: () => void
}

/**
 * Two-level (group → item) switch scanning, or manual stepping for head-gesture control.
 * A single "select" action is enough to operate the whole interface.
 */
export function useScanner({ groups, mode, intervalMs, paused, startGroup = 0, onCycleMissed, onActivate, onAdvance }: Opts) {
  const [level, setLevel] = useState<'group' | 'item'>('group')
  const [g, setG] = useState(startGroup)
  const [i, setI] = useState(0)
  const [flat, setFlat] = useState(0)
  const passes = useRef(0)
  const presentedAt = useRef(performance.now())
  const cb = useRef({ onCycleMissed, onActivate, onAdvance })
  cb.current = { onCycleMissed, onActivate, onAdvance }

  const nonEmpty = useMemo(() => groups.filter((x) => x.items.length > 0), [groups])
  const signature = nonEmpty.map((x) => `${x.id}:${x.items.map((it) => it.id).join(',')}`).join('|')
  const flatItems = useMemo(() => nonEmpty.flatMap((x) => x.items), [nonEmpty])

  // Reset whenever the set of selectable items changes (new step / new question).
  useEffect(() => {
    setLevel('group')
    setG(Math.min(startGroup, Math.max(nonEmpty.length - 1, 0)))
    setI(0)
    setFlat(0)
    passes.current = 0
    presentedAt.current = performance.now()
  }, [signature]) // eslint-disable-line react-hooks/exhaustive-deps

  const groupsRef = useRef(nonEmpty)
  groupsRef.current = nonEmpty

  // Automatic scanning timer.
  useEffect(() => {
    if (mode !== 'scan' || paused || nonEmpty.length === 0) return
    const t = window.setInterval(() => {
      const gs = groupsRef.current
      cb.current.onAdvance?.()
      if (level === 'group') {
        setG((cur) => {
          const nxt = (cur + 1) % gs.length
          if (nxt === startGroup % gs.length) {
            passes.current += 1
            cb.current.onCycleMissed?.()
          }
          return nxt
        })
      } else {
        setI((cur) => {
          const len = gs[g]?.items.length ?? 1
          const nxt = (cur + 1) % len
          if (nxt === 0) {
            passes.current += 1
            if (passes.current >= 2) {
              cb.current.onCycleMissed?.()
              passes.current = 0
              setLevel('group')
            }
          }
          return nxt
        })
      }
    }, intervalMs)
    return () => clearInterval(t)
  }, [mode, paused, intervalMs, level, g, nonEmpty.length, startGroup])

  const activate = useCallback((item: ScanItem | undefined) => {
    if (!item) return
    cb.current.onActivate?.(item.id, Math.round(performance.now() - presentedAt.current))
    presentedAt.current = performance.now()
    item.activate()
  }, [])

  const select = useCallback(() => {
    const gs = groupsRef.current
    if (!gs.length) return
    if (mode === 'step') return activate(flatItems[flat])
    if (level === 'group') {
      const grp = gs[g]
      if (!grp) return
      if (grp.items.length === 1) {
        activate(grp.items[0])
        setLevel('group')
        return
      }
      setLevel('item')
      setI(0)
      passes.current = 0
      return
    }
    activate(gs[g]?.items[i])
    setLevel('group')
    setG(startGroup)
    passes.current = 0
  }, [mode, level, g, i, flat, flatItems, activate, startGroup])

  const step = useCallback((dir: 1 | -1) => {
    if (!flatItems.length) return
    setFlat((f) => (f + dir + flatItems.length) % flatItems.length)
    cb.current.onAdvance?.()
  }, [flatItems.length])

  const escape = useCallback(() => {
    if (level === 'item') setLevel('group')
  }, [level])

  let focusedItem: string | null = null
  let focusedGroup: string | null = null
  if (mode === 'step') focusedItem = flatItems[flat]?.id ?? null
  else if (mode === 'scan') {
    if (level === 'group') focusedGroup = nonEmpty[g]?.id ?? null
    else focusedItem = nonEmpty[g]?.items[i]?.id ?? null
  }
  return { focusedItem, focusedGroup, level, select, next: () => step(1), prev: () => step(-1), escape }
}
