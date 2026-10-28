// 기록 수정 화면의 "식사 사진" 접힌 칸(디자인 조각 D9, 2026-10-28 사용자 확인 _workspace/design/mock/d9_6_edit_closed·d9_7_edit_open).
// 날짜 줄·[아침|점심|저녁|간식] 바로 아래 .srow(위 선) "식사 사진" + small "펼치기 ⌄"/"접기 ⌃" → 펼치면 .shots(먹기 전·후 나란히, 없는 쪽 "사진 없음").
// 그 기록의 사진 문서가 있을 때만 보인다(subscribeMealPhotos). 사진을 누르면 크게 보기(PhotoViewer). AI 호출 없음.
import { useCallback, useEffect, useState } from 'react'
import { subscribeMealPhotos, type MealPhotos } from '../../data/mealPhotos'
import type { MealType } from '../../data/meals'
import { subscribeMealTimes, type MealTimes } from '../../data/mealTimes'
import { MEAL_TYPE_LABEL } from '../mealText'
import { PhotoViewer, Shot, type PhotoView } from './PhotoViewer'

export default function EditPhotos({ uid, mealId, dateKey, mealType }: { uid: string; mealId: string; dateKey: string; mealType: MealType }) {
  const [photos, setPhotos] = useState<MealPhotos | null>(null)
  const [times, setTimes] = useState<MealTimes>({})
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<PhotoView | null>(null)

  useEffect(() => {
    try {
      return subscribeMealPhotos(uid, mealId, setPhotos)
    } catch (e) {
      // 사진을 못 읽어도 수정 화면은 그대로 쓴다(칸만 숨김)
      console.warn('[edit] 사진 구독 실패', e)
      return undefined
    }
  }, [uid, mealId])
  useEffect(() => subscribeMealTimes(uid, dateKey, setTimes), [uid, dateKey])
  const closeView = useCallback(() => setView(null), [])

  if (!photos || (!photos.before && !photos.after)) return null
  const name = MEAL_TYPE_LABEL[mealType]
  const time = times[mealType] ?? null
  const show = (src: string | null, side: string) => () => src && setView({ src, caption: `${name} · ${side}`, time })
  return (
    <>
      <button type="button" className="srow" style={{ marginTop: 14, borderTop: '1px solid var(--line)' }} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>식사 사진</span>
        <small>{open ? '접기 ⌃' : '펼치기 ⌄'}</small>
      </button>
      {open && (
        <div className="shots" style={{ marginTop: 12 }}>
          <Shot src={photos.before} label="먹기 전" onOpen={show(photos.before, '먹기 전')} />
          <Shot src={photos.after} label="먹은 후" onOpen={show(photos.after, '먹은 후')} />
        </div>
      )}
      <PhotoViewer view={view} onClose={closeView} />
    </>
  )
}
