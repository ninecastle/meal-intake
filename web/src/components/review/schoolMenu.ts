// 학교 급식 메뉴(D13): 급식 기록의 결과·직접 입력 화면에서 이름 찾기(FoodSearch) 아래 바로 고를 수 있는 후보
import { createContext } from 'react'

export const NO_MENU: string[] = []
export const SchoolMenuContext = createContext<string[]>(NO_MENU)
