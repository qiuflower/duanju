
export interface Lens {
  id: string;
  name: string;
  description: string; // Combined function & narrative role
  keywords: string;
  difficulty?: string;
}

const l = (id: string, name: string, description: string, keywords: string, difficulty?: string): Lens => ({
  id, name, description, keywords, difficulty
});

export const CORE_LENSES: Lens[] = [
  // Part 1: Foundation (001-040)
  l("001", "大特写 (Extreme Close-Up)", "【强调细节/压迫感】极度聚焦局部细节，展示强烈情绪或关键线索。", "Extreme close-up, Macro detail, Iris texture, Pores visible", "Low"),
  l("002", "特写 (Close-Up)", "【情感连接】标准肖像，聚焦面部微表情。", "Close-up shot, Face framing, Headshot, Emotional focus", "Low"),
  l("003", "宽特写 (Wide Close-Up)", "【舒适亲密】头顶到锁骨，允许少量背景。", "Wide close-up, Loose headshot, Shoulder up", "Low"),
  l("004", "窒息特写 (Choker Shot)", "【焦虑/对峙】切掉额头下巴，制造心理压迫。", "Choker shot, Face cropping forehead and chin, Intense gaze, Claustrophobic", "Med"),
  l("005", "胸景 (Medium Close-Up)", "【叙事/采访】头顶到胸部，展示肢体语言。", "Medium close-up, Chest up, Bust shot, Interview framing", "Low"),
  l("006", "中景 (Medium Shot)", "【互动/关系】头顶到腰部，展示上半身动作。", "Medium shot, Waist up, Mid-shot, Action interaction", "Low"),
  l("007", "牛仔景 (Cowboy Shot)", "【自信/备战】头顶到大腿中部，展示自信姿态。", "Cowboy shot, American shot, Thighs up, Confident stance", "Med"),
  l("008", "全景 (Full Shot)", "【全身/姿态】头到脚完整形象，展示体态与环境比例。", "Full body shot, Head to toe, Entire figure, Walking shot", "High"),
  l("009", "小全景 (Tight Full Shot)", "【紧凑全身】顶天立地，强调高大存在感。", "Tight full shot, Framing subject tightly, Vertical dominance", "High"),
  l("010", "远景 (Wide Shot)", "【环境/孤立】人物占1/3，强调环境与孤立感。", "Wide shot, Environment context, Subject in surroundings, Isolation", "Med"),
  l("011", "大远景 (Extreme Wide Shot)", "【史诗/渺小】人物微小，展示宏大景观。", "Extreme wide shot, Tiny figure, Massive landscape, Epic scale", "Low"),
  l("012", "建置镜头 (Establishing Shot)", "【时空定位】交代地点、时间和氛围。", "Establishing shot, City skyline, Exterior building, Location reveal", "Low"),
  l("013", "主镜头 (Master Shot)", "【场景全貌】覆盖整个场景，建立空间关系。", "Master shot, Scene coverage, Wide angle room view, Spatial geography", "Med"),
  l("014", "意大利式特写 (Italian Shot)", "【极度紧张】仅拍摄眼睛，用于决斗前对峙。", "Italian shot, Eyes only close-up, Sergio Leone style, Intense stare", "Low"),
  l("015", "过肩镜头 (Over the Shoulder)", "【对话/关系】越过肩膀拍摄，建立对话关系。", "Over the shoulder, OTS, Blurred foreground shoulder, Conversation", "Med"),
  l("016", "双人镜头 (Two Shot)", "【同盟/对立】两人同框，展示关系。", "Two shot, Two subjects in frame, Side by side, Face to face", "Med"),
  l("017", "三人镜头 (Three Shot)", "【三角关系】三人同框，展示复杂关系。", "Three shot, Trio in frame, Group interaction", "High"),
  l("018", "插入镜头 (Insert Shot)", "【关键线索】切入物品特写，引导注意。", "Insert shot, Prop detail, Object focus, Clue reveal", "Low"),
  l("019", "定场航拍 (Aerial Establishing)", "【上帝视角】高空俯瞰，展示地理环境。", "Aerial view, Drone shot, Bird's eye view, Map view", "Low"),
  l("020", "平视 (Eye Level)", "【客观/真实】与眼睛高度一致，中立视角。", "Eye level shot, Neutral angle, Straight on, Documentary style", "Low"),
  l("021", "高机位 (High Angle)", "【弱化/怜悯】高于人物向下拍，使人物显渺小。", "High angle shot, Looking down, Subject looks small, Vulnerable", "Low"),
  l("022", "低机位 (Low Angle)", "【强化/威严】低于人物向上拍，使人物显高大。", "Low angle shot, Looking up, Heroic angle, Dominant, Intimidating", "Low"),
  l("023", "俯视/上帝视角 (Top Down)", "【几何/命运】垂直向下，平面化。", "Top down shot, Overhead angle, God's eye view, Flat lay, Geometry", "Low"),
  l("024", "虫视 (Worm's Eye)", "【怪诞/巨物】贴近地面向上拍，极端透视。", "Worm's eye view, Ground level looking up, Extreme low angle, Distorted", "Med"),
  l("025", "荷兰角 (Dutch Angle)", "【失衡/混乱】倾斜构图，表现不安或危险。", "Dutch angle, Canted angle, Tilted horizon, Unease, Disorientation", "Low"),
  l("026", "过臀视角 (Hip Level)", "【动作/跟随】腰部高度，强调肢体动作。", "Hip level shot, Camera at waist height, Gunfighter style, Action stance", "Med"),
  l("027", "膝盖视角 (Knee Level)", "【行走/低调】膝盖高度，强调步态。", "Knee level shot, Low height camera, Focus on legs, Walking detail", "Med"),
  l("028", "地面视角 (Ground Level)", "【速度/贴地】直接放地面，强调速度或沉重。", "Ground level shot, Camera on floor, Surface view, Bug eye", "Low"),
  l("029", "肩膀视角 (Shoulder Level)", "【亲密/跟随】肩膀高度，增强代入感。", "Shoulder level shot, Camera at shoulder height, Intimate following", "Low"),
  l("030", "主观视角 (POV)", "【代入/身临其境】模拟角色眼睛看到的画面。", "POV shot, First person view, Seeing through eyes, Immersive", "Med"),
  l("031", "侧面视角 (Profile Shot)", "【冷漠/隐瞒】正侧面拍摄，切断眼神交流。", "Profile shot, Side view, 90 degree angle, Silhouette, Detached", "Low"),
  l("032", "四分之三侧面 (3/4 Shot)", "【立体/经典】45度角，展现立体感。", "3/4 view, Three-quarter angle, Cinematic portrait, Depth", "Low"),
  l("033", "背影 (Rear View)", "【神秘/告别】从背后拍摄，制造悬念或孤独。", "Rear view, From behind, Back of head, Mystery, Walking away", "Low"),
  l("034", "天底视角 (Nadir Shot)", "【极端仰视】垂直正下向上看。", "Nadir shot, Directly below looking up, Underneath view", "High"),
  l("035", "斜侧俯视 (Oblique High)", "【监控/审视】高处角落拍摄，疏离感。", "Oblique high angle, CCTV perspective, Surveillance style", "Low"),
  l("036", "水平齐平 (Level Shot)", "【平衡/秩序】严格水平，对称构图。", "Level shot, Perfectly horizontal, Symmetrical alignment, Wes Anderson style", "Low"),
  l("037", "倒置视角 (Inverted)", "【颠覆/梦境】画面上下颠倒。", "Upside down camera, Inverted orientation, Disorienting, Dreamlike", "High"),
  l("038", "穿越视角 (Through-Legs)", "【羞辱/独特框架】穿过双腿拍摄。", "Shot through legs, Framed by legs, Unique framing, Humiliating", "High"),
  l("039", "无人机俯瞰 (Drone High)", "【全知/宏大】动态高空视角。", "Drone shot, Aerial view, High altitude, Sweeping view", "Low"),
  l("040", "监控视角 (CCTV Angle)", "【真实/冷酷】模拟监控画面，低画质广角。", "CCTV angle, High corner shot, Wide distortion, Grainy, Security footage", "Low"),

  // Part 2: Movement (041-080)
  l("041", "静态镜头 (Static Shot)", "【客观/聚焦】摄影机静止，聚焦构图或演技。", "Static camera, Tripod shot, Still shot, Absolutely no movement", "Low"),
  l("042", "左右摇摄 (Pan)", "【展示/转移】水平转动，展示全貌或转移视线。", "Pan left, Pan right, Camera swivels horizontal, Scanning room", "Med"),
  l("043", "上下仰俯 (Tilt)", "【揭示/隐藏】垂直转动，揭示高度或地面线索。", "Tilt up, Tilt down, Camera angles vertical, Reveal size", "Med"),
  l("044", "推镜头 (Dolly In)", "【侵入/顿悟】物理推进，拉入心理空间。", "Slow dolly in, Push in, Camera moves forward, Psychological tension", "Low"),
  l("045", "拉镜头 (Dolly Out)", "【抽离/揭示】物理后退，展示环境与渺小。", "Slow dolly out, Pull back, Camera retreats, Reveal isolation", "Low"),
  l("046", "横移跟拍 (Tracking/Truck)", "【平行/时间】平行侧向移动，旁观视角。", "Truck left, Tracking shot side view, Parallel movement", "Med"),
  l("047", "垂直升降 (Pedestal/Boom)", "【越过/转换】垂直升降，揭示后方或升华。", "Pedestal up, Boom down, Vertical rise, Crane lift", "Med"),
  l("048", "光学变焦推 (Zoom In)", "【强调/偷窥】焦距放大，压缩空间。", "Zoom in, Optical zoom, Magnify focal length, Flattened depth", "Low"),
  l("049", "光学变焦拉 (Zoom Out)", "【抽离/反转】焦距拉远，揭示语境。", "Zoom out, Demagnify, Reveal context", "Low"),
  l("050", "跟随推进 (Follow Push)", "【主观/代入】背后跟随移动，增强代入感。", "Follow shot from behind, Chasing subject, Over shoulder follow", "Low"),
  l("051", "倒退引导 (Lead Pull)", "【直面/紧逼】前方引导后退，直面表情。", "Leading shot, Walking backwards with subject, Frontal follow", "Low"),
  l("052", "急速横摇 (Whip Pan)", "【衔接/转场】极快横甩，动态模糊转场。", "Whip pan, Fast swish pan, Heavy motion blur transition, Snap pan", "High"),
  l("053", "撞击推/急推 (Crash Zoom)", "【震惊/喜剧】瞬间快速变焦放大。", "Crash zoom, Snap zoom, Sudden harsh magnification, Shock reveal", "Med"),
  l("054", "手持晃动 (Handheld Shake)", "【纪实/呼吸】模拟自然抖动，增加真实感。", "Handheld camera, Camera shake, Jittery movement, Documentary style", "Low"),
  l("055", "斯坦尼康平滑 (Steadicam)", "【顺滑/梦幻】消除震动，幽灵般穿梭。", "Steadicam, Perfectly smooth movement, Floating stabilized, Gliding", "Low"),
  l("056", "漂浮游离 (Floating/Drift)", "【失重/迷幻】缓慢无规律漂移。", "Floating camera, Slow random drift, Weightless movement, Ethereal", "Low"),
  l("057", "震颤聚焦 (Shaky Zoom)", "【不安/突发】晃动加变焦找焦点，极度紧张。", "Shaky camera zoom, Hunting for focus, Chaotic news footage style", "Low"),
  l("058", "随机漫游 (Searching Pan)", "【迷失/寻找】漫无目的扫视，心理悬念。", "Meandering camera, Aimless panning, Searching movement, Uneasy wandering", "Low"),
  l("059", "旋转晕眩 (Dutch Roll)", "【失控/倾覆】沿Z轴旋转，打破重力。", "Camera roll, Rotating frame slowly, World spinning, Disorientation", "High"),
  l("060", "希区柯克变焦 (Dolly Zoom)", "【心理扭曲】推拉变焦结合，背景变形。", "Dolly zoom, Vertigo effect, Zolly, Push pull zoom, Background warping", "Extreme"),
  l("061", "360度环绕 (Orbit / Arc)", "【史诗/包围】围绕角色圆周运动。", "360 degree orbit shot, Circular camera move around subject, Heroic arc", "High"),
  l("062", "半弧形运动 (Half Arc)", "【转变/立体】围绕半圈，展示关系变化。", "180 degree arc shot, Semi-circle movement, Revealing backside", "Med"),
  l("063", "蟹行横移 (Crab Dolly)", "【穿梭/层次】曲线侧滑，穿过障碍。", "Crab shot, Curved tracking, Moving laterally through obstacles", "High"),
  l("064", "螺旋升降 (Corkscrew)", "【神性/毁灭】垂直升降加旋转。", "Corkscrew camera move, Spiral up and rotate, Swirling descent", "High"),
  l("065", "无人机俯冲 (Drone Dive)", "【打击/失重】高空极速俯冲。", "FPV drone dive, Fast high angle descent, Plunging towards ground", "Med"),
  l("066", "穿越缝隙 (Gap Fly-through)", "【炫技/无缝】穿过狭窄缝隙。", "Fly through gap, Passing through narrow window, Seamless spatial transition", "Med"),
  l("067", "身体挂载 (Snorricam)", "【主观/剥离】固定身上，背景晃动。", "Snorricam, Body mount camera, Face static while background shakes violently", "Extreme"),
  l("068", "滑动变焦 (Slide Zoom)", "【诡异/错觉】横移加变焦，怪诞视觉。", "Truck left while zooming in, Sliding zoom, Unnatural perspective shift", "Extreme"),
  l("069", "探头揭示 (Peek Reveal)", "【偷窥/惊喜】从遮挡后移出揭示。", "Peek shot, Slow reveal from behind wall, Slide out from cover", "Med"),
  l("070", "越肩推进 (OTS Push)", "【压迫/紧逼】过肩镜头向前推进。", "Push in over shoulder, Slow creep past foreground, Intensifying conversation", "Med"),
  l("071", "焦点转移 (Rack Focus)", "【引导/因果】前后景焦点切换。", "Rack focus, Focus pull from foreground to background, Shifting attention", "High"),
  l("072", "锁定追踪 (Lock-on Stabilization)", "【机械/速度】中心锁定主体，背景模糊。", "Camera mathematically locked on subject face, Stabilized tracking, Wild background blur", "Med"),
  l("073", "子弹时间 (Bullet Time Orbit)", "【时间冻结】主体静止，摄影机环绕。", "Bullet time, Frozen moment in time, Camera orbiting static subject rapidly", "Extreme"),
  l("074", "贴地极速追车 (Bumper Cam)", "【危险/速度】贴地极速前移。", "Bumper cam, Extreme low angle car chase, Road vibration, High speed tracking", "Low"),
  l("075", "模拟长镜头 (Oner / Long Take)", "【沉浸/连贯】无剪辑跟随穿越。", "Continuous one-shot take, Oner, Seamless follow through multiple rooms, No cuts", "High"),
  l("076", "摇臂大横扫 (Jib Sweep)", "【宏大/转场】半空巨大弧线扫过。", "Jib sweep, Crane arm swinging across, Sweeping cinematic motion", "Med"),
  l("077", "回旋镖运动 (Boomerang Move)", "【惊吓/节奏】快推急拉。", "Fast push in then immediately pull back, Yo-yo movement, Investigate and retreat", "High"),
  l("078", "视差滑动 (Parallax Slide)", "【立体/深度】横移产生强烈视差。", "Strong parallax effect, Dolly slide with deep foreground objects, 3D depth", "Med"),
  l("079", "突然急停 (Sudden Stop)", "【冲击/强调】高速运动瞬间静止。", "Fast tracking then sudden dead stop, Abrupt halt, Camera mimics physical impact", "Med"),
  l("080", "视线匹配移动 (Eyeline Match Move)", "【引导/揭示】模仿视线轨迹移动。", "Camera panning mimicking character's eyeline, Subjective scan, POV movement", "Med"),

  // Part 3: Composition (081-120)
  l("081", "三分法构图 (Rule of Thirds)", "【平衡/自然】主体在交叉点。", "Rule of thirds, Subject on intersection line, Balanced composition, Cinematic framing", "Low"),
  l("082", "居中构图 (Center Framing)", "【权威/秩序】主体正中。", "Center framing, Symmetrical composition, Dead center, Wes Anderson style", "Low"),
  l("083", "完全对称 (Symmetry)", "【镜像/对立】左右完全一致。", "Perfect symmetry, Mirror image, Symmetrical balance, Reflection", "Low"),
  l("084", "引导线 (Leading Lines)", "【纵深/强制】线条引导视线。", "Leading lines, Vanishing point, Perspective lines, Road leading to subject", "Low"),
  l("085", "框中框 (Frame within a Frame)", "【窥视/受困】前景框住主体。", "Frame within a frame, Shot through doorway, View through window, Natural framing", "Med"),
  l("086", "留白构图 (Negative Space)", "【孤独/压抑】大面积空旷。", "Negative space, Subject in corner, Empty background, Minimalist, Vast void", "Med"),
  l("087", "对角线构图 (Diagonal)", "【动感/张力】沿对角线分布。", "Diagonal composition, Dynamic angle, Diagonal lines", "Low"),
  l("088", "L型构图 (L-Shape)", "【稳定/开放】主体占一侧和底。", "L-shape composition, Framing along edge and bottom", "High"),
  l("089", "三角形构图 (Triangle)", "【稳定/攻击】三角排列。", "Triangular composition, Pyramid structure, Three subjects arrangement", "Med"),
  l("090", "S型曲线 (S-Curve)", "【优雅/流动】S型线条引导。", "S-curve path, Winding road, Serpentine line, Graceful flow", "Low"),
  l("091", "重复纹理 (Repetition)", "【工业/压抑】大量重复物体。", "Repetitive pattern, Soldiers in rows, Identical windows, Industrial order", "Low"),
  l("092", "短边构图 (Short Siding)", "【封闭/无路】面向边缘，视线受阻。", "Short siding, Looking into edge of frame, Uncomfortable framing, Trapped", "Med"),
  l("093", "长边构图 (Long Siding)", "【开放/希望】面向空间，视线延伸。", "Long siding, Looking into negative space, Open composition", "Low"),
  l("094", "四象限构图 (Quadrant)", "【分割/疏离】画面分割或占一角。", "Quadrant framing, Mr. Robot style, Bottom corner framing, Grid composition", "Med"),
  l("095", "前景遮挡 (Foreground Bokeh)", "【偷窥/层次】前景模糊遮挡。", "Blurred foreground object, Depth layering, Something in front, Dirty foreground", "Low"),
  l("096", "深焦摄影 (Deep Focus)", "【全知/信息】全景深清晰。", "Deep focus, f/22, Everything sharp, Citizen Kane style", "Med"),
  l("097", "浅景深 (Shallow Focus)", "【专注/唯美】背景虚化。", "Shallow depth of field, f/1.2, Bokeh background, Blurry background, Isolation", "Low"),
  l("098", "焦点搜寻 (Focus Hunting)", "【真实/紧张】模拟自动对焦。", "Focus hunting, Camera searching for focus, Blur to sharp breathing", "Low"),
  l("099", "分割屈光度 (Split Diopter)", "【割裂/张力】前后同时清晰，中间模糊。", "Split diopter shot, Sharp foreground and background, Blurry middle", "Extreme"),
  l("100", "纵深走位 (Z-Axis Staging)", "【立体/冲击】沿Z轴运动。", "Character walking from background to foreground, Z-axis movement, Walk into close-up", "Med"),

  // Part 4: Lighting (121-160) - Select Key
  l("121", "硬光 (Hard Light)", "【强硬/真实】高对比清晰阴影。", "Hard light, Sharp shadows, Direct sunlight, High contrast", "Low"),
  l("122", "柔光 (Soft Light)", "【唯美/浪漫】漫反射无阴影。", "Soft light, Diffused lighting, Cloudy day, Softbox, Flattering", "Low"),
  l("123", "体积光 (Volumetric Lighting)", "【神性/氛围】丁达尔效应。", "Volumetric lighting, God rays, Light shafts, Foggy light, Atmospheric", "Low"),
  l("124", "剪影 (Silhouette)", "【神秘/形式】背光黑色轮廓。", "Silhouette, Black figure, Bright background, Backlit", "Low"),
  l("125", "轮廓光 (Rim Light)", "【立体/英雄】边缘亮光。", "Rim lighting, Edge lighting, Hair light, Backlight separation", "Low"),
  l("126", "伦勃朗光 (Rembrandt Lighting)", "【经典/深沉】三角光区。", "Rembrandt lighting, Triangle of light on cheek, Cinematic portrait", "Med"),
  l("129", "明暗对照法 (Chiaroscuro)", "【戏剧/压抑】高反差黑暗。", "Chiaroscuro, Deep shadows, High contrast, Film noir style", "Med"),
  l("130", "底光 (Under Lighting)", "【恐怖/邪恶】下方光源。", "Under lighting, Monster lighting, Up-lighting from chin, Horror", "Low"),
  l("131", "顶光 (Top Light)", "【压抑/死亡】正上方光源。", "Top lighting, Overhead light, Deep eye sockets, Interrogation", "Low"),
  l("133", "霓虹光 (Neon/Cyberpunk)", "【未来/迷乱】高饱和彩光。", "Neon lighting, Cyberpunk lights, Pink and blue, Fluorescent", "Low"),
  l("137", "黄金时刻 (Golden Hour)", "【唯美/希望】日落暖金光。", "Golden hour, Warm glow, Low sun, Long shadows, Magic hour", "Low"),
  l("138", "蓝调时刻 (Blue Hour)", "【忧郁/静谧】日落后冷蓝光。", "Blue hour, Twilight, Deep blue sky, Melancholy, Cold tone", "Low"),
  l("146", "青橙色调 (Teal & Orange)", "【大片/肤色】好莱坞通调。", "Teal and orange, Blockbuster color grading, Blue shadows orange highlights", "Low"),
  l("147", "黑白 (Black & White)", "【历史/纯粹】去色光影。", "Black and white, Noir, Grayscale, High contrast B&W", "Low"),

  // Part 10: Metaphor (361-400) - Full set as requested for "Spectacle"
  l("361", "窗上的雨痕 (Rain on Glass)", "【悲伤/隔绝】玻璃水流，模拟流泪。", "Raindrops on window, Water streaming down glass, Blurry city background, Melancholy, Crying metaphor", "Low"),
  l("362", "枯萎的花 (Wilting Flower)", "【逝去/绝望】花朵枯萎，隐喻终结。", "Wilting flower, Dying rose, Petals falling, Time lapse decay, Symbol of death", "Low"),
  l("363", "破茧成蝶 (Breaking the Cocoon)", "【重生/觉醒】昆虫破茧，隐喻新生。", "Butterfly emerging from cocoon, Breaking shell, Metamorphosis, Rebirth, New life", "Low"),
  l("364", "空椅子 (The Empty Chair)", "【缺失/怀念】空位，暗示缺席。", "Empty chair, Empty seat at table, Absence, Loss, Lonely composition", "Low"),
  l("365", "燃烧的桥 (Burning Bridge)", "【决裂/无路】桥梁起火，隐喻断后路。", "Burning bridge, Fire on bridge, No return, Severing ties, Destruction", "Low"),
  l("366", "沙漏流逝 (Hourglass Macro)", "【紧迫/宿命】沙子落下，时间流逝。", "Hourglass close-up, Sand falling, Time running out, Countdown, Fatalism", "Low"),
  l("367", "笼中鸟 (Bird in Cage)", "【囚禁/渴望】鸟撞笼子，隐喻束缚。", "Bird in cage, Trapped bird, Looking through bars, Imprisonment", "Low"),
  l("368", "飞鸟离去 (Bird Flying Away)", "【自由/升华】群鸟飞走，隐喻解脱。", "Birds flying away, Flock in sky, Freedom, Liberation, Ascension", "Low"),
  l("369", "提线木偶 (Marionette Strings)", "【被控/阴谋】丝线操控，隐喻棋子。", "Marionette strings, Puppet on strings, Giant hand controlling, Manipulation", "Med"),
  l("370", "溺水感 (Drowning)", "【压抑/无助】深水下沉，隐喻重负。", "Sinking underwater, Reaching for surface, Drowning, Suffocation, Deep blue", "Low"),
  l("371", "破碎的镜子 (Shattered Mirror)", "【崩塌/分裂】镜子碎裂，隐喻崩溃。", "Shattered mirror, Broken reflection, Fragmented face, Identity crisis", "Low"),
  l("372", "风中残烛 (Flickering Candle)", "【脆弱/垂危】摇曳烛光，隐喻生命。", "Flickering candle, Wind blowing flame, Dying light, Fragility", "Low"),
  l("373", "迷宫俯瞰 (Maze Overview)", "【困惑/难题】俯视迷宫，隐喻迷茫。", "Maze from above, Labyrinth, Lost character, Confusion, Puzzle", "Low"),
  l("374", "多米诺骨牌 (Domino Fall)", "【因果/连锁】骨牌倒塌，隐喻灾难。", "Domino effect, Falling dominoes, Chain reaction, Inevitability", "Low"),
  l("375", "悬崖边缘 (Cliff Edge)", "【危机/抉择】站立边缘，隐喻转折。", "Standing on cliff edge, Abyss below, Precipice, Danger, Decision point", "Low"),
  l("376", "且听风吟 (Wind Blowing Grass)", "【宁静/虚无】风吹草浪，隐喻命运。", "Wind blowing grass, Wheat field waves, Invisible force, Serenity, Nature power", "Low"),
  l("377", "孤灯 (Lonely Streetlight)", "【孤独/希望】黑暗路灯，隐喻守望。", "Single streetlight, Dark street, Cone of light, Loneliness, Solitude", "Low"),
  l("378", "面具掉落 (Mask Falling)", "【真相/脆弱】面具脱落，隐喻卸伪。", "Mask falling off, Cracked mask, Revealing true face, Hypocrisy end", "Low"),
  l("379", "逆流而上的鱼 (Fish Upstream)", "【奋斗/反叛】鱼逆流，隐喻不屈。", "Salmon swimming upstream, Fighting current, Struggle, Perseverance", "Low"),
  l("380", "腐烂的苹果 (Rotting Fruit)", "【堕落/阴暗】内部腐烂，隐喻罪恶。", "Rotting apple, Worm inside fruit, Decay, Corruption, Hidden evil", "Low"),
  l("381", "提灯探路 (Lantern in Dark)", "【探索/先驱】黑暗提灯，隐喻求知。", "Holding lantern, Walking in fog, Guiding light, Discovery", "Low"),
  l("382", "断线的风筝 (Kite Flying Away)", "【失去/告别】风筝飘远，隐喻失控。", "Kite string breaking, Kite flying away, Loss, Letting go", "Low"),
  l("383", "时钟倒转 (Clock Spinning Back)", "【后悔/回忆】指针逆转，隐喻修正。", "Clock hands spinning backwards, Time reversal, Regret, Flashback", "Low"),
  l("384", "冰层破裂 (Ice Cracking)", "【危机/脆弱】冰裂蔓延，隐喻崩溃。", "Ice cracking under feet, Fracture lines, Imminent danger, Fragile foundation", "Low"),
  l("385", "两手相触 (Hands Almost Touching)", "【渴望/遗憾】指尖未触，隐喻难及。", "Hands reaching out, Fingers almost touching, Creation of Adam style, Longing", "Low"),
  l("386", "积灰的玩具 (Dusty Toy)", "【逝去/遗忘】灰尘玩具，隐喻童年。", "Dusty teddy bear, Abandoned toy, Sunlight motes, Lost childhood", "Low"),
  l("387", "困兽之斗 (Caged Beast)", "【愤怒/潜力】笼中猛兽，隐喻积压。", "Tiger pacing in cage, Angry beast, Suppressed rage, Potential energy", "Low"),
  l("388", "落叶归根 (Falling Leaves)", "【轮回/平静】秋叶飘落，隐喻归宿。", "Autumn leaves falling, Circle of life, Return to roots, Peaceful end", "Low"),
  l("389", "牵线木偶剪断 (Cutting Strings)", "【觉醒/自由】剪断丝线，隐喻独立。", "Cutting puppet strings, Snap wires, Liberation, Breaking control", "Med"),
  l("390", "红线缠绕 (Red String)", "【缘分/纠缠】红线缠身，隐喻宿命。", "Red string of fate, Tangled threads, Destiny, Complex relationship", "Low"),
  l("391", "深渊回望 (Abyss Staring)", "【恐惧/同化】凝视深渊，隐喻同化。", "Looking into abyss, Dark void, Vertigo, Nietzsche theme", "Low"),
  l("392", "破墙而入的光 (Light Through Crack)", "【希望/启示】墙裂光入，隐喻生机。", "Light beam through crack, Wall breaking, Hope, Divine intervention", "Low"),
  l("393", "被淹没的城市 (Flooded City)", "【末日/潜意识】城市水淹，隐喻吞噬。", "Flooded city streets, Underwater ruins, Post-apocalyptic, Subconscious", "Low"),
  l("394", "无脸人 (Faceless Crowd)", "【异化/迷失】无官人群，隐喻异化。", "Faceless people, Blank faces, Alienation, Social anxiety, Surreal", "Med"),
  l("395", "蝴蝶效应 (Butterfly Flapping)", "【因果/混沌】蝴蝶扇翅，隐喻起因。", "Butterfly wings macro, Air disturbance, Chaos theory, Small cause", "Low"),
  l("396", "过山车顶点 (Rollercoaster Top)", "【顶点/不可逆】俯冲前一秒，隐喻剧变。", "Rollercoaster drop view, Top of peak, Anticipation, Point of no return", "Low"),
  l("397", "破碎的雕像 (Broken Statue)", "【毁灭/终结】雕像碎裂，隐喻覆灭。", "Fallen statue, Broken idol, Ruins, End of era, Loss of faith", "Low"),
  l("398", "衔尾蛇 (Ouroboros)", "【循环/徒劳】蛇咬尾，隐喻宿命。", "Snake eating tail, Ouroboros symbol, Infinite loop, Cycle, Eternity", "Med"),
  l("399", "融化的时钟 (Melting Clock)", "【扭曲/主观】达利软钟，隐喻梦境。", "Melting clock, Dali style, Distorted time, Surreal memory", "Low"),
  l("400", "黎明破晓 (Sunrise Break)", "【新生/结局】第一缕光，隐喻希望。", "Sunrise horizon, First light, Breaking dawn, New beginning, Hope", "Low")
];

export const getLensById = (id: string) => CORE_LENSES.find(l => l.id === id);

export const getLensesByCategory = () => {
  return {
    "Foundation (001-040)": CORE_LENSES.filter(l => parseInt(l.id) <= 40),
    "Movement (041-080)": CORE_LENSES.filter(l => parseInt(l.id) >= 41 && parseInt(l.id) <= 80),
    "Composition (081-120)": CORE_LENSES.filter(l => parseInt(l.id) >= 81 && parseInt(l.id) <= 120),
    "Lighting (121-160)": CORE_LENSES.filter(l => parseInt(l.id) >= 121 && parseInt(l.id) <= 160),
    "Metaphor (361-400)": CORE_LENSES.filter(l => parseInt(l.id) >= 361 && parseInt(l.id) <= 400),
  };
};

export const LENS_LIBRARY_PROMPT = `
**CORE LENS LIBRARY (Partial Reference)**:
Part 1: Foundation (001-040) - Framing & Angle
Part 2: Movement (041-080) - Camera Dynamics
Part 3: Composition (081-120) - Staging
Part 4: Lighting (121-160) - Atmosphere
Part 10: Metaphor (361-400) - Visual Synesthesia (Critical for "Spectacle")

Examples:
[001] Extreme Close-Up: Intense detail/pressure.
[004] Choker Shot: Anxiety/Suffocation.
[022] Low Angle: Heroic/Dominant.
[060] Dolly Zoom: Vertigo/Realization.
[392] Light Through Crack: Hope in darkness.
[395] Butterfly Effect: Small cause, chaos.
`;
