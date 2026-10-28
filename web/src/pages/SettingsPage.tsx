// 설정(디자인 조각 D8, 시안 settings() 마크업·클래스 그대로, 2026-10-28 사용자 확인 _workspace/design/mock/d8_1~7).
// div.screen > .topbar.sticky(‹ "설정") → .pad.slist: 계정(구글 이메일) / 내 목표(목표 칼로리·탄단지, 목표, 목표 몸무게, 키·몸무게 + 시안에 없는
// 성별·나이, 활동량) / 기록(시안에 없는 묶음: 같이 먹은 사람 고르기) / 학교 / 사진 / 알림 / 기타(… 내 기록 전체 삭제, 로그아웃).
// 아직 만들지 않은 기능의 줄(학교 등록 D13, 끼니 기록 알림 D15, 프리미엄, 사용방법 D11,
// 처음 화면 다시 보기·약관·개인정보 D10)은 시안처럼 보이고 누르면 "준비 중이에요"(스위치는 꺼진 채).
// 사진(D9, 2026-10-28 사용자 확인 _workspace/design/mock/d9_4·5): 식사 사진 보관 켜기는 바로, 끄기는 "보관한 사진도 지울까요?"
// 시트([남겨 두기]·[모두 지우기], X는 취소 = 켜진 채), 사진 전체 삭제는 확인 시트 뒤 deleteAllMealPhotos.
// 목표가 없는 계정은 온보딩(D11) 전까지 내 목표 값이 "–"이고 누르면 목표 화면(/goal, 처음 목표 정하기)으로 간다.
// 저장은 기다리지 않는다(오프라인이면 끝나지 않는다, 구독에는 바로 들어간다). 짧은 알림은 시안 토스트 1.6초.
// 방문 기록: 홈 톱니에서 push(state.fromHome). ‹ = 홈에서 왔으면 navigate(-1), 아니면 홈으로 replace.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { Link, useLocation, useNavigate } from 'react-router'
import type { Activity, GoalInput, GoalOverride, GoalType } from '../analysis/goal'
import { KgSheet } from '../components/home/WeightSheets'
import { formatKcal } from '../components/mealText'
import {
  ACTIVITY_LABEL,
  ActivitySheet,
  GOAL_LABEL,
  GoalTypeSheet,
  HeightWeightSheet,
  KcalSheet,
  SEX_LABEL,
  SexAgeSheet,
} from '../components/settings/GoalSheets'
import { BottomSheet, Crown, IconButton, Toast } from '../components/ui'
import { saveGoal, subscribeGoal, type StoredGoal } from '../data/goals'
import { deleteAllMealPhotos } from '../data/mealPhotos'
import { setKeepPhotos, setShareEaters, subscribePrefs, type Prefs } from '../data/prefs'
import { deleteAllRecords } from '../data/records'
import { setTargetWeight, subscribeWeightProfile, type WeightProfile } from '../data/weights'
import { signOutAndClear } from '../lib/auth'
import { clearFlash, peekFlash } from '../lib/flash'
import { formatKg } from '../lib/weight'

type SheetKey = 'kcal' | 'goal' | 'target' | 'hw' | 'sexage' | 'activity' | 'delete' | 'keepoff' | 'delphotos'

/** 시안 row(): span 이름 + small 값(또는 다른 오른쪽 내용) */
function Row({ label, value, danger, disabled, onClick }: { label: string; value?: ReactNode; danger?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={danger ? 'srow danger' : 'srow'} disabled={disabled} onClick={onClick}>
      <span>{label}</span>
      {typeof value === 'string' || value === undefined ? <small>{value ?? '›'}</small> : value}
    </button>
  )
}

/** 시안 .toggle(꺼짐은 .off). 줄 버튼 안의 표시라 스위치 역할은 줄이 아니라 이 칸에 둔다(시안과 같다) */
const Switch = ({ on, label }: { on: boolean; label: string }) => (
  <span className={on ? 'toggle' : 'toggle off'} role="switch" aria-checked={on} aria-label={label}></span>
)

export default function SettingsPage({ user }: { user: User }) {
  const uid = user.uid
  const navigate = useNavigate()
  const location = useLocation()
  const [fromHome] = useState(() => (location.state as { fromHome?: unknown } | null)?.fromHome === true)
  const leaving = useRef(false)
  const [goal, setGoal] = useState<StoredGoal | null | undefined>(undefined)
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [weight, setWeight] = useState<WeightProfile | null>(null)
  const [sheet, setSheet] = useState<SheetKey | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  // 목표 화면(처음 목표 정하기)에서 저장하고 돌아왔으면 "목표를 저장했어요"(lib/flash, 키는 GoalPage와 같다)
  const [toast, setToast] = useState<{ text: string; at: number } | null>(() =>
    peekFlash('goal:saved') || peekFlash('goal:pending') ? { text: '목표를 저장했어요', at: Date.now() } : null,
  )

  useEffect(() => {
    clearFlash('goal:saved')
    clearFlash('goal:pending')
  }, [])
  useEffect(() => subscribeGoal(uid, setGoal, () => setGoal((g) => (g === undefined ? null : g))), [uid])
  useEffect(() => subscribePrefs(uid, setPrefs), [uid])
  useEffect(() => subscribeWeightProfile(uid, setWeight), [uid])
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1600)
    return () => window.clearTimeout(t)
  }, [toast])

  const say = (text: string) => setToast({ text, at: Date.now() })
  const soon = () => say('준비 중이에요')

  function goBack() {
    if (leaving.current) return
    leaving.current = true
    if (fromHome) void navigate(-1)
    else void navigate('/', { replace: true })
  }

  /** 내 목표 줄: 목표가 있으면 그 시트, 없으면 처음 목표 정하기(목표 화면, 저장하면 이 화면으로 돌아온다) */
  function openGoalRow(k: SheetKey) {
    if (goal) setSheet(k)
    else if (goal === null) void navigate('/goal', { state: { fromHome: true } })
  }

  function save(input: GoalInput, override: GoalOverride | null, done: string) {
    setSheet(null)
    saveGoal(uid, input, override).catch((e: unknown) => {
      console.warn('[settings] 목표 저장 실패', e)
      say('목표를 저장하지 못했어요')
    })
    say(done)
  }
  const recalc = (patch: Partial<GoalInput>, done = '목표를 다시 계산했어요') => goal && save({ ...goal.input, ...patch }, null, done)

  function toggleShare() {
    if (!prefs) return
    setShareEaters(uid, !prefs.shareEaters).catch(() => say('설정을 저장하지 못했어요'))
  }

  function toggleKeep() {
    if (!prefs) return
    if (prefs.keepPhotos === true) {
      setSheet('keepoff')
      return
    }
    setKeepPhotos(uid, true).catch(() => say('설정을 저장하지 못했어요'))
    say('사진 보관을 켰어요')
  }

  /** 보관 끄기 시트: 둘 다 보관을 끄고, [모두 지우기]면 보관한 사진도 지운다 */
  async function keepOff(wipe: boolean) {
    if (deleting) return
    setKeepPhotos(uid, false).catch(() => say('설정을 저장하지 못했어요'))
    if (!wipe) {
      setSheet(null)
      say('사진 보관을 껐어요')
      return
    }
    await wipePhotos()
  }

  async function wipePhotos() {
    if (deleting) return
    setDeleting(true)
    try {
      await deleteAllMealPhotos(uid)
      setSheet(null)
      say('사진을 모두 지웠어요')
    } catch (e) {
      console.warn('[settings] 사진 삭제 실패', e)
      say('사진을 지우지 못했어요. 인터넷 연결을 확인해 주세요')
    } finally {
      setDeleting(false)
    }
  }

  function saveTarget(kg: number | null) {
    setSheet(null)
    setTargetWeight(uid, kg).catch(() => say('목표 몸무게를 저장하지 못했어요'))
  }

  async function deleteAll() {
    if (deleting) return
    setDeleting(true)
    try {
      const { committed } = await deleteAllRecords(uid)
      committed.catch((e: unknown) => {
        console.warn('[settings] 기록 삭제 실패', e)
        say('기록을 다 지우지 못했어요. 다시 해 주세요')
      })
      setSheet(null)
      say('기록을 모두 지웠어요')
    } catch (e) {
      console.warn('[settings] 기록 목록 읽기 실패', e)
      say('기록을 지우지 못했어요. 인터넷 연결을 확인해 주세요')
    } finally {
      setDeleting(false)
    }
  }

  async function logout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await signOutAndClear()
    } catch {
      setLoggingOut(false)
      say('로그아웃하지 못했어요. 다시 해 주세요')
    }
  }

  const g = goal ?? null
  const dash = '– ›'
  const targetKg = weight?.targetKg ?? null
  const shareOn = prefs?.shareEaters === true
  const keepOn = prefs?.keepPhotos === true

  return (
    <main className="screen enter">
      <div className="topbar sticky pad">
        <div style={{ display: 'flex' }}>
          <IconButton icon="back" label="뒤로" onClick={goBack} />
        </div>
        <h1>설정</h1>
        <div style={{ display: 'flex', minWidth: 44, justifyContent: 'flex-end' }}></div>
      </div>
      <div className="pad slist">
        <div className="sgroup">계정</div>
        {/* 로그인한 구글 계정(누를 수 없음). 시안 줄 버튼과 같은 자리(버튼 안쪽 여백 1px 6px) */}
        <div className="srow" style={{ padding: '1px 6px', gap: 12 }}>
          <span>로그인</span>
          <small style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email ?? '구글 계정'}</small>
        </div>

        <div className="sgroup">내 목표</div>
        <Row label="목표 칼로리·탄단지" value={g ? `${formatKcal(g.targets.target_kcal)}kcal ›` : dash} disabled={goal === undefined} onClick={() => openGoalRow('kcal')} />
        <Row label="목표" value={g ? `${GOAL_LABEL[g.result.goal_applied]} ›` : dash} disabled={goal === undefined} onClick={() => openGoalRow('goal')} />
        <Row label="목표 몸무게" value={targetKg === null ? dash : `${formatKg(targetKg)}kg ›`} disabled={!weight} onClick={() => setSheet('target')} />
        <Row
          label="키·몸무게"
          value={g ? `${g.input.height_cm}cm · ${formatKg(g.input.weight_kg)}kg ›` : dash}
          disabled={goal === undefined}
          onClick={() => openGoalRow('hw')}
        />
        <Row label="성별·나이" value={g ? `${SEX_LABEL[g.input.sex]} · ${g.input.age}세 ›` : dash} disabled={goal === undefined} onClick={() => openGoalRow('sexage')} />
        <Row label="활동량" value={g ? `${ACTIVITY_LABEL[g.input.activity][0]} ›` : dash} disabled={goal === undefined} onClick={() => openGoalRow('activity')} />

        {/* 시안에 없는 묶음(2026-10-28 사용자 결정): 사용자가 고른 변경 (7) "같이 먹은 사람 고르기" */}
        <div className="sgroup">기록</div>
        <Row label="같이 먹은 사람 고르기" value={<Switch on={shareOn} label="같이 먹은 사람 고르기" />} disabled={!prefs} onClick={toggleShare} />
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>반찬을 나눠 먹을 때 켜요. 결과 화면에서 음식마다 몇 명이 먹었는지 고를 수 있어요.</p>

        <div className="sgroup">학교</div>
        <Row label="학교 등록" value="등록 안 함 ›" onClick={soon} />
        <div className="sgroup">사진</div>
        <Row label="식사 사진 보관" value={<Switch on={keepOn} label="식사 사진 보관" />} disabled={!prefs} onClick={toggleKeep} />
        <Row label="사진 전체 삭제" value="" danger onClick={() => setSheet('delphotos')} />
        <div className="sgroup">알림</div>
        {/* 시안은 버튼이 아닌 줄(안쪽 여백 없음). 누르면 "준비 중이에요"라 버튼으로 두고 여백만 시안처럼 없앤다 */}
        <button type="button" className="srow" style={{ padding: 0 }} onClick={soon}>
          <span>끼니 기록 알림</span>
          <Switch on={false} label="끼니 기록 알림" />
        </button>
        <div className="sgroup">기타</div>
        <Row label="프리미엄" value={<Crown />} onClick={soon} />
        <Row label="사용방법" onClick={soon} />
        <Row label="처음 화면 다시 보기" onClick={soon} />
        <Row label="약관·개인정보" onClick={soon} />
        <Row label="내 기록 전체 삭제" value="" danger onClick={() => setSheet('delete')} />
        <Row label="로그아웃" value="" disabled={loggingOut} onClick={() => void logout()} />
        {import.meta.env.DEV && (
          <Link to="/dev" style={{ display: 'block', padding: '14px 6px', fontSize: 13, color: 'var(--ink-3)' }}>
            개발
          </Link>
        )}
      </div>

      {g && (
        <>
          <KcalSheet
            open={sheet === 'kcal'}
            goal={g}
            onSave={(o) => save(g.input, o, '목표를 저장했어요')}
            onClose={() => setSheet(null)}
          />
          <GoalTypeSheet open={sheet === 'goal'} goal={g} onPick={(v: GoalType) => recalc({ goal: v }, '목표를 바꿨어요')} onClose={() => setSheet(null)} />
          <ActivitySheet open={sheet === 'activity'} goal={g} onPick={(v: Activity) => recalc({ activity: v })} onClose={() => setSheet(null)} />
          <HeightWeightSheet open={sheet === 'hw'} goal={g} onSave={(input) => save(input, null, '목표를 다시 계산했어요')} onClose={() => setSheet(null)} />
          <SexAgeSheet open={sheet === 'sexage'} goal={g} onSave={(input) => save(input, null, '목표를 다시 계산했어요')} onClose={() => setSheet(null)} />
        </>
      )}
      <KgSheet
        open={sheet === 'target'}
        onClose={() => setSheet(null)}
        title="목표 몸무게"
        sub="정해 두면 목표까지 남은 무게를 알려 드려요"
        value={targetKg}
        deleteLabel={targetKg === null ? undefined : '목표 지우기'}
        onSave={(kg) => saveTarget(kg)}
        onDelete={() => saveTarget(null)}
      />
      <BottomSheet open={sheet === 'delete'} onClose={() => !deleting && setSheet(null)} title="내 기록을 모두 지울까요?">
        <p style={{ color: 'var(--ink-2)', margin: '6px 0 0' }}>식사 기록, 먹은 시간·공복 표시, 체중 기록, 보관한 사진을 모두 지워요. 지운 기록은 되돌릴 수 없어요.</p>
        <div className="note" style={{ marginTop: 14 }}>
          목표, 목표 몸무게, 설정은 그대로 남아요
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button type="button" className="btn ghost" style={{ flex: 1 }} disabled={deleting} onClick={() => setSheet(null)}>
            취소
          </button>
          <button type="button" className="btn ink" style={{ flex: 1 }} disabled={deleting} onClick={() => void deleteAll()}>
            {deleting ? '지우는 중…' : '모두 지우기'}
          </button>
        </div>
      </BottomSheet>
      <BottomSheet open={sheet === 'keepoff'} onClose={() => !deleting && setSheet(null)} title="보관한 사진도 지울까요?">
        <p style={{ color: 'var(--ink-2)', margin: '6px 0 0' }}>앞으로 찍는 사진은 보관하지 않아요. 이미 보관한 사진은 남겨 두거나 지울 수 있어요.</p>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button type="button" className="btn ghost" style={{ flex: 1 }} disabled={deleting} onClick={() => void keepOff(false)}>
            남겨 두기
          </button>
          <button type="button" className="btn ink" style={{ flex: 1 }} disabled={deleting} onClick={() => void keepOff(true)}>
            {deleting ? '지우는 중…' : '모두 지우기'}
          </button>
        </div>
      </BottomSheet>
      <BottomSheet open={sheet === 'delphotos'} onClose={() => !deleting && setSheet(null)} title="보관한 사진을 모두 지울까요?">
        <p style={{ color: 'var(--ink-2)', margin: '6px 0 0' }}>식사 기록은 그대로 남아요. 지운 사진은 되돌릴 수 없어요.</p>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button type="button" className="btn ghost" style={{ flex: 1 }} disabled={deleting} onClick={() => setSheet(null)}>
            취소
          </button>
          <button type="button" className="btn ink" style={{ flex: 1 }} disabled={deleting} onClick={() => void wipePhotos()}>
            {deleting ? '지우는 중…' : '모두 지우기'}
          </button>
        </div>
      </BottomSheet>
      <Toast message={toast?.text ?? null} />
    </main>
  )
}
