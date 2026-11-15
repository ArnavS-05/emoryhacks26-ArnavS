import {
  Activity, Bed, Brain, Check, CircleHelp, Clock, Droplets, Ear, Eye, Flame, Frown, Glasses, Hand, Heart,
  HeartPulse, LifeBuoy, MessageSquare, Minus, Moon, Music, Phone, Pill, PersonStanding, ShieldAlert, ShowerHead,
  Smile, Sparkles, Stethoscope, Sun, Thermometer, ThermometerSnowflake, ThermometerSun, TrendingDown, TrendingUp,
  TriangleAlert, Users, Utensils, Volume2, Waves, Wind, X, Zap, Footprints, Bone, Annoyed, Lightbulb, Toilet,
  type LucideIcon,
} from 'lucide-react'

const MAP: Record<string, LucideIcon> = {
  head: Brain, chest: HeartPulse, stomach: Utensils, back: Bone, arm: Hand, leg: Footprints, neck: PersonStanding,
  pelvis: PersonStanding, body: PersonStanding, other: CircleHelp, unsure: CircleHelp, yes: Check, no: X, ok: Smile,
  pain: Zap, 'pain-sharp': Zap, 'pain-dull': Waves, flame: Flame, pulse: Activity, cramp: Waves, pressure: Minus,
  clock: Clock, 'trend-up': TrendingUp, 'trend-down': TrendingDown, minus: Minus, nausea: Annoyed, dizzy: Sparkles,
  tired: Moon, 'temp-hot': ThermometerSun, 'temp-cold': ThermometerSnowflake, itch: Hand, numb: Hand, alert: TriangleAlert,
  eye: Eye, ear: Ear, throat: PersonStanding, breath: Wind, heart: Heart, bed: Bed, light: Lightbulb, sound: Volume2,
  glasses: Glasses, music: Music, sleep: Moon, sad: Frown, happy: Smile, scared: ShieldAlert, move: Footprints,
  hand: Hand, water: Droplets, food: Utensils, toilet: Toilet, wash: ShowerHead, teeth: Sparkles, question: CircleHelp,
  repeat: Volume2, write: MessageSquare, family: Users, pray: Sun, medicine: Pill, help: LifeBuoy, nurse: Stethoscope,
  phone: Phone, message: MessageSquare, thermometer: Thermometer,
}

export function Pictogram({ id, className = 'size-10' }: { id?: string | null; className?: string }) {
  const Icon = (id && MAP[id]) || MessageSquare
  return <Icon className={className} aria-hidden="true" strokeWidth={1.75} />
}
