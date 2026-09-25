import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { CalendarCheck, Ghost, Images, type LucideIcon } from 'lucide-react'
import type { Habit } from './db'
import { useData } from './data'
import { unansweredMisses } from './lib/stats'
import { Today } from './screens/Today'
import { Race } from './screens/Race'
import { Rituals } from './screens/Rituals'
import { Settings } from './screens/Settings'
import { RitualFlow } from './components/RitualFlow'
import { RivalFeed } from './components/Rival'
import { MissCheckin, type MissItem } from './components/MissCheckin'

type Tab = 'today' | 'race' | 'rituals'

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'today', label: 'Today', icon: CalendarCheck },
  { id: 'race', label: 'Race', icon: Ghost },
  { id: 'rituals', label: 'Rituals', icon: Images },
]

export function App() {
  const { ix, habits, misses } = useData()
  const [tab, setTab] = useState<Tab>('today')
  const [ritualHabit, setRitualHabit] = useState<Habit | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [feedOpen, setFeedOpen] = useState(false)
  const [checkin, setCheckin] = useState<MissItem[] | null>(null)

  // Ask about recent misses once per app launch.
  const asked = useRef(false)
  useEffect(() => {
    if (asked.current) return
    asked.current = true
    const items = unansweredMisses(ix, habits, misses)
    if (items.length) setCheckin(items)
  }, [ix, habits, misses])

  const switchTab = (t: Tab) => {
    setTab(t)
    window.scrollTo({ top: 0 })
  }

  return (
    <MotionConfig reducedMotion="user">
      <main className="mx-auto min-h-dvh max-w-md pb-[calc(env(safe-area-inset-bottom)+96px)]">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {tab === 'today' && <Today onOpenHabit={setRitualHabit} onOpenSettings={() => setSettingsOpen(true)} onOpenFeed={() => setFeedOpen(true)} />}
            {tab === 'race' && <Race />}
            {tab === 'rituals' && <Rituals />}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-black/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl" aria-label="Main">
        <div className="mx-auto flex max-w-md px-3">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id
            return (
              <button
                key={id}
                onClick={() => switchTab(id)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex h-[68px] flex-1 flex-col items-center justify-center gap-1 transition-colors ${active ? 'text-ink' : 'text-ink-3'}`}
              >
                {active && <motion.span layoutId="tab-indicator" className="absolute top-0 h-[3px] w-10 rounded-b-full bg-ink" />}
                <Icon size={23} strokeWidth={active ? 2.5 : 2} aria-hidden />
                <span className="font-display text-[12px] font-semibold uppercase tracking-[0.16em]">{label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      <AnimatePresence>
        {ritualHabit && <RitualFlow key={ritualHabit.id} habit={ritualHabit} onClose={() => setRitualHabit(null)} />}
      </AnimatePresence>
      <AnimatePresence>{settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}</AnimatePresence>
      <AnimatePresence>{feedOpen && <RivalFeed onClose={() => setFeedOpen(false)} />}</AnimatePresence>
      <AnimatePresence>{checkin && !ritualHabit && <MissCheckin items={checkin} onDone={() => setCheckin(null)} />}</AnimatePresence>
    </MotionConfig>
  )
}
