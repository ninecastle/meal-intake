// 개발 모드 전용(/dev/ui): 디자인 시안 공통 부품과 색 견본 모음(조각 D1-a). App.tsx가 DEV일 때만 등록한다(배포 번들에 없음).
// 글자는 모두 모양 확인용 예시다(실제 기록·숫자가 아니다).
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Band,
  BottomSheet,
  Button,
  Card,
  ChipButton,
  Crown,
  Icon,
  IconButton,
  Mascot,
  MealArt,
  Segment,
  Tabs,
  Toast,
  TopBar,
  type ButtonVariant,
  type CardTone,
  type ChoiceItem,
  type IconName,
} from '../components/ui'
import type { MealType } from '../data/meals'

const COLORS = [
  'ground', 'surface', 'ink', 'ink-2', 'ink-3', 'line',
  'sky', 'sky-deep', 'sky-soft', 'lime', 'lime-deep', 'lime-soft',
  'peach', 'peach-deep', 'peach-soft', 'butter', 'butter-soft', 'crown',
  'carb', 'prot', 'fat', 'heat0', 'heat1', 'heat2', 'heat3', 'heat4',
] as const
const ICONS: IconName[] = ['back', 'close', 'cal', 'gear', 'camera', 'image', 'pen', 'share', 'plus']
const MEALS: { meal: MealType; name: string; tone: CardTone }[] = [
  { meal: 'breakfast', name: '아침', tone: 'sky' },
  { meal: 'lunch', name: '점심', tone: 'lime' },
  { meal: 'dinner', name: '저녁', tone: 'peach' },
  { meal: 'snack', name: '간식', tone: 'butter' },
]
const VARIANTS: ButtonVariant[] = ['peach', 'ink', 'lime', 'sky', 'ghost']

type Period = 'day' | 'week' | 'month'
const PERIODS: ChoiceItem<Period>[] = [
  { value: 'day', label: '하루' },
  { value: 'week', label: '주간' },
  { value: 'month', label: <>월간 <Crown /></> },
]
type Nut = 'kcal' | 'carb' | 'prot' | 'fat'
const NUTS: ChoiceItem<Nut>[] = [
  { value: 'kcal', label: '칼로리' },
  { value: 'carb', label: '탄' },
  { value: 'prot', label: '단' },
  { value: 'fat', label: '지' },
]

export default function UiGalleryPage() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period>('day')
  const [nut, setNut] = useState<Nut>('kcal')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <div className="mx-auto min-h-dvh max-w-[430px] bg-surface pb-[120px] shadow-[0_0_0_1px_var(--color-line)]">
      <TopBar
        sticky
        title="부품 모음 (개발용)"
        left={<IconButton icon="back" label="뒤로" onClick={() => navigate(-1)} />}
        right={<IconButton icon="gear" label="설정 (예시)" />}
      />

      <Band tone="sky" title="색 견본" action={<ChipButton>예시 칩</ChipButton>}>
        <ul className="grid grid-cols-3 gap-2">
          {COLORS.map((c) => (
            <li key={c} className="grid gap-1">
              <span className="h-10 rounded-chip border border-line" style={{ background: `var(--color-${c})` }} />
              <span className="text-xs text-ink-2">{c}</span>
            </li>
          ))}
        </ul>
      </Band>

      <Band tone="lime" title="버튼" action={<ChipButton dark>예시 칩 (dark)</ChipButton>}>
        <div className="flex flex-wrap gap-2">
          {VARIANTS.map((v) => (
            <Button key={v} variant={v}>
              {v} 예시
            </Button>
          ))}
          <Button variant="ink" disabled>
            꺼진 버튼
          </Button>
        </div>
        <Button full className="mt-[18px]" onClick={() => setToast('예시 토스트예요')}>
          토스트 띄우기 (peach, full)
        </Button>
        <Button variant="ghost" full className="mt-2" onClick={() => setSheetOpen(true)}>
          아래 시트 열기
        </Button>
      </Band>

      <Band tone="peach" title="탭 · 고르기">
        <Tabs label="기간 (예시)" items={PERIODS} value={period} onChange={setPeriod} />
        <Segment label="영양소 (예시)" items={NUTS} value={nut} onChange={setNut} />
        <p className="mt-3 mb-0 text-sm text-ink-2">
          고른 값: {period} · {nut}
        </p>
      </Band>

      <section className="pad grid gap-4 py-7">
        <h2 className="m-0 text-[22px]">카드 · 그림 · 글자</h2>
        <div className="grid grid-cols-2 gap-3">
          {MEALS.map(({ meal, name, tone }) => (
            <Card key={meal} tone={tone} className="flex min-h-[150px] flex-col gap-2.5">
              <MealArt meal={meal} framed />
              <h3 className="m-0 text-[17px]">{name}</h3>
              <span className="text-[13px] text-ink/60">예시 카드</span>
            </Card>
          ))}
        </div>

        <Card tone="ground" className="flex items-center justify-around">
          <Mascot />
          <MealArt meal="dinner" size={64} />
          <Crown />
        </Card>

        <Card tone="ground">
          <ul className="m-0 grid list-none grid-cols-5 gap-3 p-0">
            {ICONS.map((n) => (
              <li key={n} className="grid justify-items-center gap-1 text-xs text-ink-2">
                <Icon name={n} className="text-ink" />
                {n}
              </li>
            ))}
          </ul>
        </Card>

        <div className="flex flex-wrap gap-1">
          {ICONS.map((n) => (
            <IconButton key={n} icon={n} label={`${n} (예시)`} />
          ))}
        </div>

        <Card className="border border-line">
          <p className="m-0 text-sm text-ink-2">숫자(.num) 예시</p>
          <p className="num m-0 text-[36px] leading-none">0123456789</p>
          <p className="mt-3 mb-0 text-ink">ink 글자 예시</p>
          <p className="m-0 text-ink-2">ink-2 글자 예시</p>
          <p className="m-0 text-ink-3">ink-3 글자 예시</p>
          <p className="mt-2 mb-0 flex gap-3">
            <span className="text-carb">탄수화물</span>
            <span className="text-prot">단백질</span>
            <span className="text-fat">지방</span>
            <span className="font-bold">font-bold도 400</span>
          </p>
        </Card>
      </section>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="예시 시트">
        <div className="mt-3.5 grid gap-2.5">
          {(
            [
              ['camera', '카메라로 찍기 (예시)'],
              ['image', '앨범에서 고르기 (예시)'],
              ['pen', '직접 입력 (예시)'],
            ] as const
          ).map(([icon, text]) => (
            <button
              key={icon}
              type="button"
              onClick={() => setSheetOpen(false)}
              className="focus-ring flex min-h-[60px] items-center gap-3.5 rounded-tile bg-ground px-[18px] text-left"
            >
              <Icon name={icon} />
              {text}
            </button>
          ))}
        </div>
      </BottomSheet>
      <Toast message={toast} />
    </div>
  )
}
