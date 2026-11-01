# 공개 실제 음식 사진(photos_src/manifest.json) → 앱과 같은 썸네일(5:4 가운데 자름, 360×288 JPEG, EXIF 없음)
# 쓰는 법: python -P make_thumbs.py <photos_src 폴더> <출력 폴더>
# 출력: <출력>/thumbs/<사진 이름표>_<n>.jpg 와 <출력>/manifest.json(출처·라이선스 그대로 옮김)
import json
import os
import sys

from PIL import Image

# 매니페스트의 음식 이름 → demo_seed.mjs의 photo 이름표
KEYS = {
    '비빔밥': 'bibimbap', '김치찌개': 'kimchi_jjigae', '된장찌개': 'doenjang_jjigae', '제육볶음': 'jeyuk_bokkeum', '돈가스': 'donkatsu',
    '짜장면': 'jajangmyeon', '짬뽕': 'jjamppong', '라면': 'ramyeon', '물냉면': 'naengmyeon', '칼국수': 'kalguksu', '쌀국수': 'pho',
    '카레라이스': 'curry_rice', '김밥': 'gimbap', '떡볶이': 'tteokbokki', '순대국밥': 'sundae_gukbap', '불고기': 'bulgogi', '오므라이스': 'omurice',
    '우동': 'udon', '삼겹살': 'samgyeopsal', '후라이드 치킨': 'fried_chicken', '피자': 'pizza', '닭가슴살 샐러드': 'chicken_salad',
    '고등어구이': 'grilled_mackerel', '갈비탕': 'galbitang', '부대찌개': 'budae_jjigae', '잡채': 'japchae', '스파게티': 'spaghetti', '토스트': 'toast',
    '시리얼': 'cereal', '샌드위치': 'sandwich', '카페라떼': 'cafe_latte', '아메리카노': 'americano', '고구마': 'sweet_potato', '요거트': 'yogurt',
    '떡국': 'tteokguk', '김치볶음밥': 'kimchi_fried_rice', '초밥': 'sushi', '햄버거': 'hamburger', '군만두': 'fried_mandu', '바나나': 'banana',
    '사과': 'fruit', '과일 샐러드': 'fruit', '삶은 달걀': 'boiled_eggs', '케이크': 'cake', '닭갈비': 'dakgalbi', '족발': 'jokbal', '함박스테이크': 'hamburg_steak',
}
W, H = 360, 288


def main(src, out):
    os.makedirs(os.path.join(out, 'thumbs'), exist_ok=True)
    manifest = json.load(open(os.path.join(src, 'manifest.json'), encoding='utf8'))
    count = {}
    kept = []
    for m in manifest:
        key = KEYS.get(m['dish'])
        if not key:
            print('이름표 없음', m['dish'])
            continue
        try:
            im = Image.open(os.path.join(src, m['file']))
            im = im.convert('RGB')
        except Exception as e:  # 그림이 아니면 건너뛴다
            print('열 수 없음', m['file'], e)
            continue
        w, h = im.size
        if w / h > W / H:
            cw = round(h * W / H)
            box = ((w - cw) // 2, 0, (w - cw) // 2 + cw, h)
        else:
            ch = round(w * H / W)
            box = (0, (h - ch) // 2, w, (h - ch) // 2 + ch)
        im = im.crop(box).resize((W, H), Image.LANCZOS)
        count[key] = count.get(key, 0) + 1
        name = f'{key}_{count[key]}.jpg'
        im.save(os.path.join(out, 'thumbs', name), 'JPEG', quality=72, optimize=True)
        size = os.path.getsize(os.path.join(out, 'thumbs', name))
        kept.append({**m, 'thumb': name, 'bytes': size})
    json.dump(kept, open(os.path.join(out, 'manifest.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print(f'썸네일 {len(kept)}장, 음식 {len(count)}가지, 최대 {max((k["bytes"] for k in kept), default=0)}바이트')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
