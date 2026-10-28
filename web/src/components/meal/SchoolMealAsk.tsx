// 식사 기록 시트 맨 위 급식 질문(D13, 사용자 확인 모양 d13_3a_record_ask·d13_3b_record_loaded, 시안 .school 상자).
// 학교가 있고 그 기록의 날짜(홈에서 보던 날짜)·끼니(아침 조식·점심 중식·저녁 석식)에 급식이 있으면(3초 안에) 묻는다.
// 없음·실패·간식·주말·방학이면 상자를 그리지 않는다(흐름을 막지 않는다).
// [급식 불러오기] → 메뉴 목록 상자. 불러온 급식은 그 기록에 쓰일 때까지(먹기 전 분석이 끝나거나 직접 입력으로 갈 때) 남고 take()로 꺼낸다.
import { useEffect, useState } from 'react'
import { subscribeSchool, type School } from '../../data/school'
import type { MealType } from '../../data/meals'
import { getSchoolMeal, type SchoolMeal } from '../../lib/neis'
import { mealCode } from '../../lib/neisParse'
import { toDateKey } from '../../lib/time'
import { shortDateLabel } from '../day/useDayData'
import { MEAL_TYPE_LABEL } from '../mealText'

export type SchoolMealAsk = {
  /** 시트 맨 위에 둘 상자(없으면 null) */
  box: React.ReactNode
  /** 불러온 급식(먹기 전 분석에 메뉴 후보로) */
  loaded: SchoolMeal | null
  /** 이 기록에 썼으니 비운다 */
  take: () => SchoolMeal | null
}

export function useSchoolMealAsk(uid: string, dateKey: string, mealType: MealType, open: boolean): SchoolMealAsk {
  const [school, setSchool] = useState<School | null>(null)
  useEffect(() => subscribeSchool(uid, setSchool), [uid])
  const key = school && mealCode(mealType) ? `${school.atpt}-${school.code}:${dateKey}:${mealType}` : ''
  const [found, setFound] = useState<{ key: string; meal: SchoolMeal | null } | null>(null)
  const [loaded, setLoaded] = useState<{ key: string; meal: SchoolMeal } | null>(null)

  useEffect(() => {
    if (!open || !school || !key) return
    const ac = new AbortController()
    getSchoolMeal(school, dateKey, mealType, ac.signal)
      .then((meal) => !ac.signal.aborted && setFound({ key, meal }))
      .catch(() => !ac.signal.aborted && setFound({ key, meal: null }))
    return () => ac.abort()
    // key가 학교·날짜·끼니를 모두 담는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key])

  const label = MEAL_TYPE_LABEL[mealType]
  const cur = loaded && loaded.key === key ? loaded.meal : null
  const ask = found && found.key === key ? found.meal : null
  let box: React.ReactNode = null
  if (cur) {
    box = (
      <div className="school" role="status" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
        <p>{`✓ ${label} 급식 메뉴 ${cur.menu.length}개를 불러왔어요`}</p>
        <small style={{ color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.5 }}>{cur.menu.join(' · ')}</small>
        <small style={{ color: 'var(--ink-2)', fontSize: 13 }}>이제 사진을 찍으면 이 메뉴로 음식을 찾아요</small>
      </div>
    )
  } else if (ask && school) {
    const day = dateKey === toDateKey(new Date()) ? '오늘' : shortDateLabel(dateKey)
    box = (
      <div className="school">
        <p>{`${day} ${school.name} ${label} 급식인가요?`}</p>
        <button type="button" className="chipbtn" style={{ background: 'var(--butter)' }} onClick={() => setLoaded({ key, meal: ask })}>
          급식 불러오기
        </button>
      </div>
    )
  }

  return {
    box,
    loaded: cur,
    take: () => {
      setLoaded(null)
      return cur
    },
  }
}
