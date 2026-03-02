export const STATE_KEY = 'storyboarder_session';

export const DEFAULT_STYLES: Record<string, { directors: string[], works: string[], textures: string[] }> = {
    Chinese: {
        directors: ["王家卫", "张艺谋", "姜文", "李安", "宫崎骏", "新海诚", "克里斯托弗·诺兰", "昆汀·塔伦蒂诺", "斯皮尔伯格", "希区柯克", "黑泽明", "大卫·芬奇", "韦斯·安德森", "丹尼斯·维伦纽瓦", "奉俊昊", "周星驰", "徐克", "岩井俊二", "今敏", "蒂姆·波顿"],
        works: ["让子弹飞", "一代宗师", "卧虎藏龙", "千与千寻", "你的名字", "盗梦空间", "低俗小说", "阿凡达", "教父", "七武士", "搏击俱乐部", "布达佩斯大饭店", "沙丘", "寄生虫", "大话西游", "青蛇", "情书", "红辣椒", "剪刀手爱德华", "赛博朋克2077"],
        textures: ["写实摄影", "2D 动画", "2.5D 渲染", "3D 渲染 (Unreal Engine)", "水墨画", "黏土动画", "油画", "剪纸", "像素艺术", "胶片颗粒", "铅笔素描", "水彩", "浮世绘", "赛博朋克霓虹", "高对比度黑白", "复古 VHS", "低多边形", "乐高", "皮影", "概念艺术"]
    },
    English: {
        directors: ["Christopher Nolan", "Quentin Tarantino", "Steven Spielberg", "Martin Scorsese", "Wes Anderson", "David Fincher", "Hayao Miyazaki", "Akira Kurosawa", "Stanley Kubrick", "Alfred Hitchcock", "James Cameron", "Ridley Scott", "Denis Villeneuve", "Tim Burton", "Greta Gerwig", "Bong Joon-ho", "Wong Kar-wai", "Ang Lee", "Peter Jackson", "Guillermo del Toro"],
        works: ["Inception", "Pulp Fiction", "The Grand Budapest Hotel", "Fight Club", "Spirited Away", "Seven Samurai", "2001: A Space Odyssey", "Avatar", "Blade Runner", "Dune", "Parasite", "The Matrix", "The Godfather", "Star Wars", "Lord of the Rings", "Cyberpunk 2077", "Arcane", "Spider-Verse", "Mad Max: Fury Road", "Interstellar"],
        textures: ["Realistic Photography", "2D Anime", "2.5D Render", "3D Render", "Ink Wash", "Claymation", "Oil Painting", "Paper Cutout", "Pixel Art", "Vintage Film", "Sketch", "Watercolor", "Ukiyo-e", "Cyberpunk Neon", "Black & White", "VHS Glitch", "Low Poly", "Lego", "Silhouette", "Concept Art"]
    }
};
