// 홈 복숭아 띠 "나의 변화"(조각 D2-S 자리 → D6 체중 기록, 시안 home() section.band.peach > .weight 마크업·클래스 그대로).
// 숫자만 실제 데이터(2026-10-27·28 사용자 결정, _workspace/design/mock/d6_4): "오늘 내 체중은?"(지난 날짜는 "이날")·kg(없으면 "–")·저울·[기록하기]는 늘,
// .delta "지난 기록보다 ○kg 줄었어요"는 그날 기록과 그 앞 가장 최근 기록이 모두 있을 때만, .goalw는 목표 몸무게가 있을 때만(알약은 그날 기록이 있을 때만).
// [기록하기] → 체중 기록 시트(그 날짜). 저장 직후 최근 체중이 목표 계산 몸무게와 2kg 이상 다르면 "목표를 다시 계산할까요?"(lib/weight shouldAskRecalc).
// [다시 계산]은 목표 입력의 몸무게만 바꿔 추천값으로 저장(saveGoal: 현재 목표 + 오늘 날짜 목표, 지난 날짜 목표는 그대로), [나중에]·X는 그때 최근 체중을 적어 둔다.
// 저울 그림은 시안 SVG 값 그대로(장식). 쓰기는 기다리지 않는다(오프라인이면 끝나지 않는다, 구독에는 바로 들어간다).
import { useEffect, useState } from 'react'
import { computeGoal, validateGoalInput } from '../../analysis/goal'
import { saveGoal, type StoredGoal } from '../../data/goals'
import {
  deleteWeight,
  setRecalcSkip,
  setWeight,
  subscribeLatestWeight,
  subscribeWeight,
  subscribeWeightAfter,
  subscribeWeightBefore,
  subscribeWeightProfile,
  type WeightEntry,
  type WeightProfile,
} from '../../data/weights'
import { deltaText, formatKg, goalTagText, shouldAskRecalc, weightJump } from '../../lib/weight'
import { shortDateLabel } from '../day/useDayData'
import { Band } from '../ui'
import { KgSheet, RecalcSheet, type RecalcView } from './WeightSheets'

type Keyed<T> = { forDate: string; value: T }

export default function ChangeBand({
  uid,
  dateKey,
  today,
  goal,
  onToast,
}: {
  uid: string
  dateKey: string
  today: string
  /** 현재 목표(HomePage subscribeGoal). undefined = 첫 값 전 */
  goal: StoredGoal | null | undefined
  onToast: (text: string) => void
}) {
  const [entry, setEntry] = useState<Keyed<WeightEntry | null> | null>(null)
  const [prev, setPrev] = useState<Keyed<WeightEntry | null> | null>(null)
  const [next, setNext] = useState<Keyed<WeightEntry | null> | null>(null)
  const [latest, setLatest] = useState<WeightEntry | null>(null)
  const [profile, setProfile] = useState<WeightProfile>({ targetKg: null, skipKg: null })
  const [sheet, setSheet] = useState(false)
  const [recalc, setRecalc] = useState<RecalcView | null>(null)

  useEffect(() => subscribeWeight(uid, dateKey, (e) => setEntry({ forDate: dateKey, value: e })), [uid, dateKey])
  useEffect(() => subscribeWeightBefore(uid, dateKey, (e) => setPrev({ forDate: dateKey, value: e })), [uid, dateKey])
  useEffect(() => subscribeWeightAfter(uid, dateKey, (e) => setNext({ forDate: dateKey, value: e })), [uid, dateKey])
  useEffect(() => subscribeLatestWeight(uid, today, setLatest), [uid, today])
  useEffect(() => subscribeWeightProfile(uid, setProfile), [uid])

  // 날짜를 옮긴 직후에는 이전 날짜 값을 보이지 않는다
  const cur = entry?.forDate === dateKey ? entry.value : null
  const before = prev?.forDate === dateKey ? prev.value : null
  const after = next?.forDate === dateKey ? next.value : null
  const isToday = dateKey === today

  function save(kg: number) {
    setSheet(false)
    setWeight(uid, dateKey, kg).catch(() => onToast('체중을 저장하지 못했어요'))
    // 이 기록이 가장 최근이면 최근 체중은 이 값
    const latestKg = !latest || dateKey >= latest.dateKey ? kg : latest.kg
    const view = goal ? recalcView(goal, latestKg) : null
    if (view && shouldAskRecalc(view.goalKg, latestKg, profile.skipKg)) setRecalc(view)
    else onToast('체중을 기록했어요')
  }

  function remove() {
    setSheet(false)
    deleteWeight(uid, dateKey).catch(() => onToast('기록을 지우지 못했어요'))
    onToast('체중 기록을 지웠어요')
  }

  function doRecalc() {
    if (!goal || !recalc) return
    const latestKg = recalc.latestKg
    setRecalc(null)
    saveGoal(uid, { ...goal.input, weight_kg: latestKg }, null).catch(() => onToast('목표를 저장하지 못했어요'))
    if (profile.skipKg !== null) setRecalcSkip(uid, null).catch((e: unknown) => console.warn('[weights] 나중에 지우기 실패', e))
    onToast('목표를 다시 계산했어요')
  }

  function later() {
    if (!recalc) return
    const latestKg = recalc.latestKg
    setRecalc(null)
    setRecalcSkip(uid, latestKg).catch((e: unknown) => console.warn('[weights] 나중에 저장 실패', e))
    onToast('체중을 기록했어요')
  }

  return (
    <Band tone="peach" label="나의 변화" title="나의 변화">
      <div className="weight">
        {/* 사용자가 고른 변경 (15): 띠가 늘어난 만큼 제목↔체중 글, 체중 글↔저울, 저울↔[기록하기] 빈 칸(.bgap)에 나눈다 */}
        <div className="bgap" aria-hidden="true"></div>
        <div className="q">{isToday ? '오늘 내 체중은?' : '이날 내 체중은?'}</div>
        <div className="kg num">
          {cur ? formatKg(cur.kg) : '–'}
          <span> kg</span>
        </div>
        {cur && before && <div className="delta">{deltaText(cur.kg, before.kg)}</div>}
        {profile.targetKg !== null && (
          <div className="goalw">
            <span>
              {'목표 '}
              <span className="num">{`${formatKg(profile.targetKg)}kg`}</span>
            </span>
            {cur && <GoalTag kg={cur.kg} targetKg={profile.targetKg} goal={goal ?? null} />}
          </div>
        )}
        <div className="bgap" aria-hidden="true"></div>
        <svg className="scale" viewBox="0 0 220 210" aria-hidden="true">
          <ellipse cx="110" cy="200" rx="88" ry="8" fill="rgba(201,105,44,.18)" />
          <rect x="14" y="22" width="192" height="178" rx="42" fill="#E9865A" />
          <rect x="14" y="14" width="192" height="170" rx="42" fill="#F29A6B" />
          <path d="M40 30h60" stroke="#F7B48D" strokeWidth="8" strokeLinecap="round" />
          <path d="M58 82a52 52 0 0 1 104 0z" fill="#FFFFFF" />
          <path d="M58 82a52 52 0 0 1 104 0" fill="none" stroke="#FCE3D2" strokeWidth="4" />
          <g stroke="#E9B796" strokeWidth="2.5" strokeLinecap="round">
            <path d="M70 76l4 2M78 58l4 4M94 44l3 5M110 40v6M126 44l-3 5M142 58l-4 4M150 76l-4 2" />
          </g>
          <path d="M110 46l7 24h-14z" fill="#E2552B" />
          <circle cx="110" cy="76" r="5" fill="#E2552B" />
          <rect x="44" y="112" width="52" height="52" rx="20" fill="#F5AE85" />
          <rect x="124" y="112" width="52" height="52" rx="20" fill="#F5AE85" />
        </svg>
        <div className="bgap" aria-hidden="true"></div>
        <button type="button" className="btn peach" onClick={() => setSheet(true)}>
          기록하기
        </button>
      </div>
      <KgSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="체중 기록"
        sub={`${shortDateLabel(dateKey)} 체중을 적어 주세요`}
        value={cur?.kg ?? null}
        hint={
          before && (
            <>
              {'지난 기록 '}
              <span className="num">{`${formatKg(before.kg)}kg`}</span>
              {` · ${shortDateLabel(before.dateKey)}`}
            </>
          )
        }
        deleteLabel={cur ? '기록 지우기' : undefined}
        check={(kg) => {
          // 하루 3kg 넘게 바뀐 기록은 저장하지 않는다(사용자 결정). 앞·뒤 기록 × 떨어진 날수
          const j = weightJump(kg, dateKey, before, after)
          return j
            ? `${shortDateLabel(j.ref.dateKey)} 기록(${formatKg(j.ref.kg)}kg)보다 ${j.limitKg}kg 넘게 달라요. 하루에 3kg 넘게 바뀌기는 어려워요`
            : null
        }}
        onSave={save}
        onDelete={remove}
      />
      <RecalcSheet view={recalc} onRecalc={doRecalc} onLater={later} />
    </Band>
  )
}

function GoalTag({ kg, targetKg, goal }: { kg: number; targetKg: number; goal: StoredGoal | null }) {
  return <span className="tag">{tagContent(goalTagText(kg, targetKg, goal?.input.goal))}</span>
}

/** "목표까지 4.4kg"의 숫자만 시안처럼 .num */
function tagContent(text: string) {
  const m = /^목표까지 (.+)$/.exec(text)
  return m ? (
    <>
      {'목표까지 '}
      <span className="num">{m[1]}</span>
    </>
  ) : (
    text
  )
}

/** 다시 계산 미리보기: 목표 입력의 몸무게만 바꿔 추천값을 계산한다. 입력이 틀리면(범위 밖 등) null — 묻지 않는다 */
function recalcView(goal: StoredGoal, latestKg: number): RecalcView | null {
  const v = validateGoalInput({ ...goal.input, weight_kg: latestKg })
  if (!v.ok) return null
  return {
    goalKg: goal.input.weight_kg,
    latestKg,
    fromKcal: goal.targets.target_kcal,
    toKcal: computeGoal(v.value).target_kcal,
    custom: goal.override !== null,
  }
}
