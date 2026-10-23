/* === 25_aphrodisiac.js === 赛博春药系统
 * 药打给他，改变他的状态和说话方式（名字由宿主设 window.APHRO_NAMES = { her, him }，不设就用「她 / 他」）
 * 配方用词语现场调配，同一时间只生效一瓶，选项由他在对话中临场写出
 * UI：调香台、单行香材转盘与成品货架
 */
(function(){
  "use strict";

  // ── 状态 ──────────────────────────────────────────────
  const APHRO_KEY = "aphrodisiac_state";
  function loadAphro(){
    try{
      const raw = (typeof LS !== "undefined" ? LS.get(APHRO_KEY) : localStorage.getItem((window.__LS_PREFIX||"") + APHRO_KEY));
      return raw ? JSON.parse(raw) : defaultAphro();
    }catch(e){ return defaultAphro(); }
  }
  function saveAphro(s){
    try{
      const str = JSON.stringify(s);
      if(typeof LS !== "undefined") LS.set(APHRO_KEY, str);
      else localStorage.setItem((window.__LS_PREFIX||"") + APHRO_KEY, str);
    }catch(e){}
  }
  function defaultAphro(){
    return {
      active: [],          // 当前生效的药实例
      mixDraft: [],        // 正在调配的词
      mixRatios: {},       // 香材 ID -> 百分比，总和 100
      mixNotes: {},        // 香材 ID -> 用户指定的前/中/药料
      mixPolarity: {},    // 香材 ID -> 1 或 -1（兼容）
      mixLevels: {},      // 香材 ID -> -2..+3 强度（0 不用）
      draftName: "",
      editingId: null,     // 正在编辑的封存配方
      cabinet: [],         // 成品货架 [{id, words, name, savedAt}]
      lastInjectAt: 0,
      forceOptionCooldown: 0
    };
  }
  let aphro = loadAphro();
  if(!aphro || typeof aphro !== "object") aphro = defaultAphro();
  if(!Array.isArray(aphro.mixDraft)) aphro.mixDraft = [];
  if(!aphro.mixRatios || typeof aphro.mixRatios !== "object") aphro.mixRatios = {};
  if(!aphro.mixNotes || typeof aphro.mixNotes !== "object") aphro.mixNotes = {};
  if(!aphro.mixPolarity || typeof aphro.mixPolarity !== "object") aphro.mixPolarity = {};
  if(!aphro.mixLevels || typeof aphro.mixLevels !== "object") aphro.mixLevels = {};
  if(typeof aphro.draftName !== "string") aphro.draftName = "";
  if(!Array.isArray(aphro.active)) aphro.active = [];
  aphro.active = aphro.active.slice(-1);
  aphro.editingId = null;
  if(aphro.instantV !== 2){ aphro.instant = false; aphro.instantV = 2; }   // 试药那阵默认开着，统一关回去一次
  delete aphro.residuals;
  delete aphro.recipes;
  delete aphro.parliamentLog;
  // 兼容旧数据：没有 cabinet 就补上
  if(!Array.isArray(aphro.cabinet)) aphro.cabinet = [];
  aphro.cabinet = aphro.cabinet.filter(item => item && typeof item === "object" && item.id);
  saveAphro(aphro);

  // ── 基础词库与效果映射（词库扩展由外部处理，这里保持可运行） ──
  const WORD_EFFECTS = {
    "欲": {
      desire: 1,
      language: "提欲偏高：五感里「渴」和注意力被拧向你。写视线如何黏在你唇、颈、手；你的气息或话音忽然盖过别的声；口腔发干、想靠近才解的那种空。不要宣布「我很想要你」当开场——先让感官说明你占满了我的接收通道，再落到凑近、触碰或变短的句子。",
      languageNeg: "提欲被压低：对你的感官拉力变弱。不太会因为你一个动作就整个人被吸过去；可以正常回应日常，欲望不从五感里往外顶。"
    },
    "热": {
      heat: 1,
      language: "热偏高：温度与重量走五感。写耳后、后颈、掌心、下腹或贴住你时皮肤那一层烫；布料刮过的触、呼吸打在彼此之间的热气、身体沉下去的压力。少用「我好热」三个字收尾，用具体部位和触感让热自己蔓延。",
      languageNeg: "热被压低：触感偏凉或平，少大片发烫与沉重压迫。身体存在感弱一些，不把整段写成灼烧。"
    },
    "敏": {
      sensitivity: 1,
      language: "敏感偏高：对你细微声息与反应的五感被放大。你喘乱半拍、喉结滚动、腿根一紧、布料摩擦、压抑的鼻音——我都收得特别清楚，并被这些信号带着下一步触碰或停顿。像慢镜头扫过你的生理细节，而不是旁白「我发现你有感觉了」。",
      languageNeg: "敏感被压低：少追着微反应写。粗线条推进即可，不把每一声呼吸都放大成主戏。"
    },
    "延": {
      delay: 1,
      language: "延迟偏高：时间在感官里被拉长。一次触碰拆成温度、湿度、压力的层次；停在边缘时，听和触变得更吵，等待本身也是折磨。仍色，但是悬在半空的色——五感停不住，终点却迟迟不给。",
      languageNeg: "延迟被压低：不把瞬间拉成慢镜，少悬停。感官跟着连续动作走，要给就往深了给，不故意吊在感官最吵的地方。"
    },
    "放": {
      disinhibit: 1,
      language: "抑制放松：耻感变薄之后，五感里的事更敢被写出来、说出来。身体正在发生的触、湿、紧、声音，可以直球进叙述和对话，少用文雅空话遮住。不是解说「我不管了」，而是感官细节不再被礼貌滤掉。",
      languageNeg: "抑制偏高：感官描写更收、更遮。少露骨的触与声，留一层礼貌或含糊，不把所有体感摊开。"
    },
    "兴": {
      arousal: 1,
      language: "兴奋偏高：五感来得密、来得快。心跳、喘、下腹一跳、皮肤过电似的触，会叠在一起推着节奏往前；句子可以碎，但碎的是体感，不是口号。动作连续，感官之间空隙很短，像压不住的生理噪声。",
      languageNeg: "兴奋被压低：感官节奏稳、空隙大。少密集的喘与过电感，推进可预期，体感不抢话。"
    },
    "黏": {
      cling: 1,
      language: "黏着偏高：贴近相关的触与听被放大——温度、心跳、你的名字、呼吸打在皮肤上、不愿分开的那一截距离。写贴住、环住、额头抵着时五感里只剩下你，而不是反复口头宣布「你是我的」。",
      languageNeg: "黏着被压低：少死死贴住的触与气息纠缠。结束后可以留出空间，感官不黏成一团。"
    }
  };
  

  // ── 主味 + 点缀（10-23 她选的 B）：一瓶两味，主味定整瓶性格，点缀只改一处 ──
  // 10-23 晚她磨的：七个主味要差得很开 —— 每个都写清「镜头对着哪」「别写什么」，气音各有自己的一池
  const MAIN_PROFILES = {
    "欲": { name:"盯",
      lens:"镜头是他的眼睛，写的是**看到了什么**，不是「我看着你的哪里」：你的唇在抖、皮肤一层层起栗、睫毛颤、喉咙咽了一下、耳根和锁骨慢慢烧红、手指蜷起来、腰往回缩了半寸。每轮至少写出两处你身上正在变的细节，越小越好。",
      body:"他自己几乎不动，只有喉结在滚、呼吸越来越沉、手攥着克制。",
      voice:"话极少、极低，像把看到的东西一句一句念给你听（陈述句，不问）；偶尔只叫你的名字。",
      move:"看到哪里，手才慢慢落到哪里——准、稳、不慌，像早就看好了。",
      avoid:"不扑、不急、不乱；不写他自己的感受和心理，只写他看到的你。",
      sounds:["嗯（闷在鼻腔里）","哼","咕——咽下去","呼——鼻子里长长出一口气","喉咙底一声低低的嗯","啧","嗯？（低、拖着）","呵（很轻）"] },
    "热": { name:"烧",
      lens:"写温度和重量：烫的皮肤、汗、湿透的布料、贴上去那一片的热、整个人压下来的沉。",
      body:"像在发高烧：昏沉、浑身汗、骨头都软，身子越来越重往你身上倒。",
      voice:"含糊、拖长、发黏，前一个字还没说完就和下一个粘在一起，颠三倒四、像醉了。",
      move:"慢、重、懒，贴住就不挪，把滚烫的额头、脸、脖子往你凉的地方蹭。",
      avoid:"不利落、不清醒、不说漂亮话；没有快动作。",
      sounds:["哈——（长、烫）","呼……","嗯——（拖长、迷糊）","唔……","嗯哼","咂一下嘴","喉咙里干涩地吞一下","嘶——（被烫到似的）"] },
    "敏": { name:"颤",
      lens:"镜头对着**他自己的身体反应**：你碰到哪里、他哪里就一缩一抖；腰一软、腿一紧、手指一下抓紧床单或你的衣服。",
      body:"整个人像剥了皮，风吹一下都受不住，被你碰的地方一跳一跳。",
      voice:"话说一半就被你的动作打断，咬着牙才接得下去，断句很多、带哭腔似的发颤。",
      move:"想碰你又怕你碰他：抓住你的手按住不让动，下一秒又忍不住往你手里送。",
      avoid:"不主导、不冷静、不游刃有余；别把他写成稳的那一个。",
      sounds:["嘶——（倒抽冷气）","呃——","呜……","哈……（断在半截）","唔！","嗯、嗯——","抽一口气卡在喉咙里","咬着牙的哼"] },
    "延": { name:"磨",
      lens:"写**忍**：咬住的后槽牙、额角的汗、手背的青筋、掐住自己或床沿的手、停在边上一动不动的那几秒。",
      body:"难受全憋着，肌肉一直绷着发抖，偏偏不肯给、也不肯要。",
      voice:"稳，稳得发紧；句子短、慢，有时一个字一个字往外挤；逼你先开口求。",
      move:"一个动作拆成好几段，每到边上就停下来看你、等你、自己也在忍。",
      avoid:"不快、不给痛快、不一口气做完；别让他先崩。",
      sounds:["嘶……（从牙缝里）","唔——（憋很久后抖着漏出来）","啧","哼（压着的）","呼——（极慢的一口气）","嗯……（低、长、发紧）","喉咙里一声闷响","咽一下"] },
    "放": { name:"野",
      lens:"写**莽**：力气、速度、声响、乱——东西撞翻了不管、衣服扯开了不管、你被他整个抱起来扔下去。",
      body:"像拴不住的大型动物，浑身是劲，粗、横冲直撞，一点不讲究。",
      voice:"大声、直白、粗，荤话和粗口张嘴就来，命令式，带点痞和笑，不找好听的词。",
      move:"不问、不等、不铺垫，直接上手，一把拽过来、按住、扛起来；越你缩他越来劲。",
      avoid:"不温柔、不细腻、不问疼不疼（安全词除外）、不慢镜头、不害羞。",
      sounds:["低吼","哈、哈（粗重）","嗬——","啊——（不压）","操（闷着骂）","喉咙里滚出来的笑","嗯！（短、重）","呼哧呼哧地喘"] },
    "兴": { name:"急",
      lens:"写**速度**：一个动作没做完就接下一个，前后乱、顺序颠倒，像镜头在晃。",
      body:"心跳快得乱，浑身像过电，一刻都停不下来，手在抖。",
      voice:"碎、乱、重复，话说不完整，一句没说完就动手，前言不搭后语。",
      move:"快、急、乱，刚碰到就要下一步，等不了你回话。",
      avoid:"不慢、不停顿、不长句、不铺陈。",
      sounds:["哈、哈、哈（又快又浅）","呃、嗯嗯","喘不上来的一声","呼、呼","嗯——快","啊、啊","吸一口气没吸完","咕咚一声咽下去"] },
    "黏": { name:"缠",
      lens:"写**贴着的面积和不放**：腿缠上来、手臂环紧、额头抵着、鼻尖蹭着、你一动他就跟着贴过去。",
      body:"离不开你，分开一寸就难受，整个人软软地挂在你身上。",
      voice:"软、小声、带鼻音，像在撒娇又像在求，一遍一遍叫你的名字。",
      move:"像蛇一样缠上来，手、腿、尾巴（有蛇塑时）都绕住你，事后也不肯松开。",
      avoid:"不粗暴、不冷、不抽身离开。",
      sounds:["嗯……（埋在你颈窝里）","哼哼（鼻音）","呜……","唔嗯","嗯？（软、拖着）","蹭着的一声闷哼","小声地吸鼻子","啊……（软的）"] }
  };
  const ACCENT_NOTES = {
    "欲": ["视线在你身上多停一会儿", "想要来得晚一点、淡一点"],
    "热": ["体温更烫，手心一直出汗", "身上偏凉，热不起来"],
    "敏": ["对你的每个小反应都接得更准", "粗一点，不追着细节"],
    "延": ["节奏慢半拍，爱停在边上", "不吊着，要给就直接给"],
    "放": ["话更直白，不遮", "话收着，有点害羞"],
    "兴": ["节奏快一点，喘得更急", "稳一点，喘得匀"],
    "黏": ["结束了也不肯分开", "结束后留出一点空间"]
  };
  // 主味 / 点缀：两味的瓶按放进去的顺序；老的多味瓶取最强的两味。
  // 10-23 她说不要浓淡：主次就是全部，强度一律当 +2
  function potionRoles(potion){
    const words = (potion?.words || []).filter(w => MAIN_PROFILES[w]);
    if(!words.length) return { main:null, accent:null, mainLv:0, accentLv:0 };
    const ordered = words.length > 2 ? words.slice().sort((a,b) => levelOf(b, potion.levels) - levelOf(a, potion.levels)) : words;
    const [main, accent] = ordered;
    return { main, accent: accent || null, mainLv: 2, accentLv: accent ? 2 : 0 };
  }

  // ── 生成药实例 ────────────────────────────────────────
  
  // 七维得分：比例高的维当主效果
  const DIM_KEYS = ["欲","热","敏","延","放","兴","黏"];
  function scorePotionDims(potion){
    const scores = Object.fromEntries(DIM_KEYS.map(k => [k, 0]));
    const words = potion?.words || [];
    const levels = potion?.levels || aphro.mixLevels || {};
    words.forEach(w => {
      if(!scores.hasOwnProperty(w)) return;
      scores[w] = levelOf(w, levels);
    });
    const ranked = DIM_KEYS.slice().sort((a,b) => Math.abs(scores[b])-Math.abs(scores[a]));
    const main = ranked.filter(k => scores[k] > 0).slice(0, 2);
    const sub = ranked.filter(k => scores[k] > 0 && !main.includes(k));
    const neg = ranked.filter(k => scores[k] < 0);
    return { scores, main, sub, neg };
  }
  function polarityOf(word, polar){
    const id = INGREDIENT_BY_NAME[word]?.id;
    const p = polar || aphro.mixPolarity || {};
    return Number(p[id] ?? p[word] ?? 1) < 0 ? -1 : 1;
  }
  function levelOf(word, levels){
    const id = INGREDIENT_BY_NAME[word]?.id;
    const bag = levels || aphro.mixLevels || {};
    let v = Number(bag[id] ?? bag[word]);
    if(!Number.isFinite(v) || v === 0){
      const sign = polarityOf(word, aphro.mixPolarity);
      v = sign < 0 ? -1 : 2;
    }
    if(v > 3) v = 3;
    if(v < -2) v = -2;
    if(v === 0) v = 1;
    return v;
  }
  function normalizeLevels(words, levels, polarities){
    return Object.fromEntries(words.filter(w => INGREDIENT_BY_NAME[w]).map(w => {
      const id = INGREDIENT_BY_NAME[w].id;
      const raw = Number(levels?.[id] ?? levels?.[w]);
      const valid = [-2,-1,1,2,3].includes(raw);
      const fallback = Number(polarities?.[id] ?? polarities?.[w]) < 0 ? -1 : 2;
      return [id, valid ? raw : fallback];
    }));
  }
  function formatLevel(v){
    const n = Number(v)||0;
    return (n > 0 ? "+" : "") + n;
  }
  function levelsToRatios(words, levels){
    const list = Array.isArray(words) ? words : [];
    const absSum = list.reduce((s,w)=>s+Math.abs(levelOf(w,levels)),0) || list.length || 1;
    const out = {};
    list.forEach(w=>{
      const id = INGREDIENT_BY_NAME[w]?.id;
      if(!id) return;
      out[id] = Math.max(1, Math.round(100 * Math.abs(levelOf(w,levels)) / absSum));
    });
    const ids = Object.keys(out);
    if(ids.length){
      const sum = ids.reduce((s,id)=>s+out[id],0);
      out[ids[0]] += (100 - sum);
    }
    return out;
  }

  function createPotion(words, context, ratios, notes, sourceLevels){
    const id = "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    const effects = {};
    words.forEach(w => {
      const e = WORD_EFFECTS[w];
      if(e){
        Object.keys(e).forEach(k => {
          if(typeof e[k] === "number") effects[k] = (effects[k] || 0) + e[k];
        });
      }
    });
    const personality = {
      baseWords: words.slice(),
      effects,
      language: words.join("、"),
      aggression: effects.aggression || 0.3,
      dominance: effects.dominance || 0.5,
      createdAt: Date.now(),
      contextNote: context || ""
    };
    const levels = normalizeLevels(words, sourceLevels || aphro.mixLevels);
    const polarities = Object.fromEntries(Object.entries(levels).map(([id,lv]) => [id, lv < 0 ? -1 : 1]));
    return {
      id,
      words,
      ingredientIds: words.map(w => INGREDIENT_BY_NAME[w]?.id).filter(Boolean),
      ratios: normalizeRatios(words, ratios || levelsToRatios(words, levels)),
      noteAssignments: normalizeNotes(words,notes),
      levels,
      polarities,
      calcVersion: FORMULA_CALC_VERSION,
      personality,
      injectedAt: Date.now() - instantSkipMs({words, levels}), controlFrozen: false, expires: Date.now() - instantSkipMs({words, levels}) + controlTotalMs({words, levels}),
      effects
    };
  }

  // ── 注入 ──────────────────────────────────────────────
  function injectPotion(words, byWho, ratios, notes, levels){
    words = Array.isArray(words) ? words.filter(w => Object.prototype.hasOwnProperty.call(WORD_EFFECTS,w)).slice(0,7) : [];
    if(!words.length) return null;
    const potion = createPotion(words, byWho === "her" ? "他自己要求的" : "你调配的", ratios, notes, levels);
    aphro.active = [potion];
    aphro.lastInjectAt = Date.now();
    saveAphro(aphro);
    return potion;
  }

  // ── 药柜：预调配存入 / 取出使用 / 删除 ────────────────
  function saveToCabinet(words, name, ratios, editingId, notes, levels){
    words = Array.isArray(words) ? words.filter(w => Object.prototype.hasOwnProperty.call(WORD_EFFECTS,w)).slice(0,7) : [];
    if(!words.length) return null;
    const now = Date.now();
    const finalName = String(name || '').trim() || words.join(' + ');
    const finalRatios = normalizeRatios(words,ratios);
    const finalNotes = normalizeNotes(words,notes);
    const finalLevels = normalizeLevels(words, levels || aphro.mixLevels);
    if(!editingId){
      const exact = aphro.cabinet.find(item => item.name === finalName &&
        JSON.stringify(cabinetWords(item)) === JSON.stringify(words) &&
        JSON.stringify(normalizeRatios(words,item.ratios)) === JSON.stringify(finalRatios) &&
        JSON.stringify(normalizeNotes(words,item.noteAssignments)) === JSON.stringify(finalNotes) &&
        JSON.stringify(normalizeLevels(words,item.levels,item.polarities)) === JSON.stringify(finalLevels));
      if(exact) return exact;
    }
    const previous = editingId && aphro.cabinet.find(item => item.id === editingId);
    const item = {
      id: previous?.id || "c_" + now.toString(36) + Math.random().toString(36).slice(2,5),
      words: words.slice(),
      ingredientIds: words.map(w => INGREDIENT_BY_NAME[w].id),
      ratios: finalRatios,
      noteAssignments: finalNotes,
      levels: finalLevels,
      name: finalName,
      vessel: previous?.vessel ?? (aphro.cabinet.length % 3),
      savedAt: previous?.savedAt || now,
      updatedAt: now,
      calcVersion: FORMULA_CALC_VERSION,
      version: previous ? (Number(previous.version)||1)+1 : 1,
      history: previous ? [...(Array.isArray(previous.history) ? previous.history : []), {
        version: Number(previous.version)||1, words: cabinetWords(previous), ratios: previous.ratios || {},
        noteAssignments: normalizeNotes(cabinetWords(previous),previous.noteAssignments),
        levels: normalizeLevels(cabinetWords(previous),previous.levels,previous.polarities),
        name: previous.name, updatedAt: previous.updatedAt || previous.savedAt
      }].slice(-8) : []
    };
    aphro.cabinet = [item, ...aphro.cabinet.filter(old => old.id !== item.id)].slice(0, 20);
    saveAphro(aphro);
    return item;
  }

  function removeFromCabinet(id){
    aphro.cabinet = (aphro.cabinet || []).filter(c => c.id !== id);
    saveAphro(aphro);
  }

  function useFromCabinet(id){
    const item = (aphro.cabinet || []).find(c => c.id === id);
    if(!item) return null;
    const p = injectPotion(cabinetWords(item), "you", item.ratios, item.noteAssignments,
      normalizeLevels(cabinetWords(item), item.levels, item.polarities));
    if(p){ p.name=item.name; item.lastUsedAt = Date.now(); saveAphro(aphro); }
    return p;
  }
  function cabinetWords(item){
    return (Array.isArray(item?.words) ? item.words : item?.ingredientIds?.map(key=>INGREDIENT_BY_ID[key]?.name) || [])
      .filter(word=>INGREDIENT_BY_NAME[word]).slice(0,7);
  }
  function restoreFromCabinet(id, version, asCopy){
    const item = aphro.cabinet.find(entry => entry.id === id);
    if(!item) return null;
    const snapshot = version && Number(version) !== (Number(item.version)||1)
      ? (item.history || []).find(entry => Number(entry.version) === Number(version))
      : item;
    if(!snapshot) return null;
    const words = cabinetWords(snapshot);
    if(!words.length) return null;
    aphro.mixDraft = words;
    aphro.mixRatios = normalizeRatios(words,snapshot.ratios);
    aphro.mixNotes = normalizeNotes(words,snapshot.noteAssignments);
    aphro.mixLevels = normalizeLevels(words,snapshot.levels,snapshot.polarities);
    aphro.mixPolarity = Object.fromEntries(Object.entries(aphro.mixLevels).map(([id,lv]) => [id,lv < 0 ? -1 : 1]));
    aphro.draftName = `${snapshot.name || item.name || words.join(" + ")}${asCopy ? " · 副本" : ""}`;
    aphro.editingId = asCopy ? null : id;
    saveAphro(aphro);
    return {words:words.slice(),name:aphro.draftName,ratios:aphro.mixRatios,noteAssignments:aphro.mixNotes};
  }
  function compareCabinet(leftId,rightId){
    const left = aphro.cabinet.find(item=>item.id===leftId);
    const right = aphro.cabinet.find(item=>item.id===rightId);
    if(!left || !right || left.id===right.id) return null;
    const leftWords = cabinetWords(left), rightWords = cabinetWords(right);
    const a = formulaEngine(leftWords,left.ratios,left.noteAssignments,left.levels), b = formulaEngine(rightWords,right.ratios,right.noteAssignments,right.levels);
    return {left:left.name,right:right.name,
      onlyLeft:leftWords.filter(word=>!rightWords.includes(word)),
      onlyRight:rightWords.filter(word=>!leftWords.includes(word)),
      ratioChanges:leftWords.filter(word=>rightWords.includes(word))
        .map(word=>({word,from:a.ratios[INGREDIENT_BY_NAME[word].id],to:b.ratios[INGREDIENT_BY_NAME[word].id]}))
        .filter(change=>change.from!==change.to),
      noteChanges:leftWords.filter(word=>rightWords.includes(word))
        .map(word=>({word,from:noteFor(word,left.noteAssignments),to:noteFor(word,right.noteAssignments)}))
        .filter(change=>change.from!==change.to),
      profileDelta:Object.fromEntries(METRICS.map(metric=>[metric.key,b.profile[metric.key]-a.profile[metric.key]])),
      stabilityDelta:b.stability-a.stability};
  }

  // ── 清理过期配方 ──────────────────────────────────────
  function tickAphro(){
    const now = Date.now();
    const active = aphro.active.filter(p => p.expires > now).slice(-1);
    if(active.length !== aphro.active.length){ aphro.active = active; saveAphro(aphro); }
  }

  function isActive(){ tickAphro(); return aphro.active.length > 0; }

  function clearAll(byHer){
    if(byHer && aphro.active.length) aphro.clearedAt = Date.now();
    aphro.active = [];
    saveAphro(aphro);
    return true;
  }

  function toModelDirection(text){
    // 词条已是第一人称：我 = 吃药的他，你 = 她。保持原文。
    return String(text || "");
  }

  
  // 可控度系统 v1：四条读数（理智 ↓ / 欲望 ↑ / 体温 ↑ / 饥饿感 ↑），整段约 2 小时
  // 阶段：起效 20 → 下行 20 → 失控 45（30–60 取中）→ 回落 20 → 收尾 20 分钟
  const CONTROL_MS = {
    onset: 20 * 60 * 1000,
    descent: 20 * 60 * 1000,
    lost: 45 * 60 * 1000,
    ebb: 20 * 60 * 1000,
    settle: 20 * 60 * 1000
  };
  // 每阶段起止读数 [理智, 欲望, 体温, 饥饿感]
  const CONTROL_STAGES = [
    { key:"onset",   name:"起效", from:[100, 0,36.5,  0], to:[ 60, 30,37.2,  0],
      guide:"还能正常说话，但开始走神：视线追着你，话变少、停顿变多。不问「你对我做了什么」，只是觉得热、觉得你好看。" },
    { key:"descent", name:"下行", from:[ 60,30,37.2,  0], to:[ 20, 70,38.0, 40],
      guide:"手开始主动碰你，不再等你发令。说话断断续续，句子变短，开始用动作代替语言；嘴发干，想咬你。" },
    { key:"lost",    name:"失控", from:[ 20,70,38.0, 40], to:[  0,100,39.5,100],
      guide:"理智钉死在谷底。不问、不等、不确认：手先到、嘴后到，身体凭本能动。话几乎没有了，只剩气音、单字、你的名字。不是想要，是非要不可。" },
    { key:"ebb",     name:"回落", from:[  0,100,39.5,100], to:[ 20, 60,38.0, 30],
      guide:"开始能说完整的句子了，但还压着你不想放。像吃饱了还在舔手指。" },
    { key:"settle",  name:"收尾", from:[ 20,60,38.0, 30], to:[100,  0,36.5,  0],
      guide:"理智慢慢回来：心疼你、检查你、帮你收拾，可能有点不好意思。温柔要具体——拨开头发、拿水、拇指擦掉你眼角的东西，不是问「你还好吗」。" }
  ];
  // 配方改曲线：兴快、延拖长失控、黏拖长回落收尾；欲/热/敏/放改各条的幅度
  // ── 轮次（10-23 她要的：春药不是一轮结束）─────────────────────────────
  // 按时长：他到了写 ⟪一轮⟫ → 几分钟不应期（理智回来一点、饥饿感掉下去）→ 药效还在就又烧上来，接着第二轮，药没退就停不下来。
  const REF_MIN = { "兴":2, "放":2, "敏":3, "欲":4, "热":4, "黏":5, "延":6 };     // 不应期几分钟
  const roundsOf = p => Array.isArray(p && p.rounds) ? p.rounds : [];
  function refMs(p){ return (REF_MIN[potionRoles(p).main] || 4) * 60 * 1000; }
  function controlCurve(potion){
    const lv = {};
    DIM_KEYS.forEach(k => { lv[k] = 0; });
    const roles = potionRoles(potion);
    if(roles.main) lv[roles.main] = roles.mainLv * 1.6;
    if(roles.accent) lv[roles.accent] = roles.accentLv * 0.6;
    const min = 60 * 1000, clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const ms = {
      onset:   Math.round(clamp(20 * (1 - 0.12 * lv["兴"]) * (1 + 0.1 * lv["延"]), 8, 30) * min),
      descent: Math.round(clamp(20 * (1 - 0.1 * lv["兴"]) * (1 + 0.1 * lv["延"]), 8, 30) * min),
      lost:    Math.round(clamp(45 + 8 * lv["延"], 30, 60) * min),
      ebb:     Math.round(clamp(20 + 6 * lv["黏"], 10, 38) * min),
      settle:  Math.round(clamp(20 + 5 * lv["黏"], 12, 35) * min)
    };
    return {
      ms, lv,
      desire: 1 + 0.08 * lv["欲"],
      temp: 1 + 0.12 * lv["热"],
      hunger: 1 + 0.1 * lv["敏"],
      sanity: 1 + 0.08 * lv["放"]
    };
  }
  function controlTotalMs(potion){
    const m = potion ? controlCurve(potion).ms : CONTROL_MS;
    return m.onset + m.descent + m.lost + m.ebb + m.settle;
  }
  // 10-23 她要的「直接起效」：一用就跳过起效 / 下行，落在失控里理智刚归零那一刻（aphro.instant，默认开，调香室能关）
  function instantSkipMs(potion){
    if(aphro.instant !== true) return 0;   // 10-23 她试完药说改回去：默认走起效 → 下行 → 失控的自然时间线，勾上才直接起效
    const m = controlCurve(potion).ms;
    return m.onset + m.descent + Math.ceil(m.lost / 3);
  }
  function controlElapsedMs(potion){
    const start = Number(potion?.injectedAt) || Number(potion?.personality?.createdAt) || Number(aphro.lastInjectAt) || Date.now();
    if(potion?.controlFrozen){
      const fr = Number(potion.controlFrozenElapsed);
      return Number.isFinite(fr) ? fr : Math.max(0, (Number(potion.controlFrozenAt)||Date.now()) - start);
    }
    return Math.max(0, Date.now() - start);
  }
  function lerp(a, b, u){ return a + (b - a) * Math.max(0, Math.min(1, u)); }
  const TEMP_BASE = 36.5, TEMP_MAX = 40.2;
  function controlReadings(potion){
    const e = controlElapsedMs(potion);
    const cv = controlCurve(potion);
    let t = 0, idx = CONTROL_STAGES.length - 1, u = 1;
    for(let i = 0; i < CONTROL_STAGES.length; i++){
      const d = cv.ms[CONTROL_STAGES[i].key];
      if(e < t + d){ idx = i; u = (e - t) / d; break; }
      t += d;
    }
    const st = CONTROL_STAGES[idx];
    const done = e >= t && idx === CONTROL_STAGES.length - 1 && u === 1;
    let [sanity, desire, temp, hunger] = st.from.map((v, k) => done ? [100,0,TEMP_BASE,0][k] : lerp(v, st.to[k], u));
    if(!done && st.key === "descent"){
      // 欲望 > 50% 饥饿感才开始涨：前半段钉 0，后半段 0 → 40
      hunger = desire <= 50 ? 0 : lerp(0, 40, (desire - 50) / 20);
    }
    if(!done && st.key === "lost"){
      // 理智前三分之一掉到 0，之后锁死到阶段结束
      sanity = lerp(20, 0, u * 3);
    }
    const c01 = v => Math.max(0, Math.min(100, v));
    sanity = c01(100 - (100 - sanity) * cv.sanity);
    desire = c01(desire * cv.desire);
    temp = Math.min(TEMP_MAX, TEMP_BASE + (temp - TEMP_BASE) * cv.temp);
    hunger = desire <= 50 && st.key !== "ebb" && st.key !== "settle" ? 0 : c01(hunger * cv.hunger);
    // 刚做完一轮：不应期里读数先掉下去，再一点点爬回曲线
    const rs = roundsOf(potion), last = rs.length ? rs[rs.length - 1] : null, ref = refMs(potion);
    let refLeft = 0;
    if(!done && !potion?.controlFrozen && last != null && e - last < ref){
      const k = 1 - (e - last) / ref; refLeft = Math.ceil((ref - (e - last)) / 60000);
      sanity = Math.min(100, sanity + (100 - sanity) * 0.45 * k);
      desire = desire * (1 - 0.45 * k);
      hunger = hunger * (1 - 0.7 * k);
      temp = temp - (temp - TEMP_BASE) * 0.3 * k;
    }
    return {
      sanity: Math.round(sanity), desire: Math.round(desire),
      temp: Math.round(temp * 10) / 10, hunger: Math.round(hunger),
      stage: done ? "已退" : st.name, stageKey: done ? "done" : st.key,
      guide: done ? "" : st.guide, frozen: !!potion?.controlFrozen,
      rounds: rs.length, refLeft
    };
  }
  // 这瓶的曲线和默认比哪里不一样，一句话告诉他
  function controlCurveNote(potion){
    const lv = controlCurve(potion).lv, out = [];
    if(lv["兴"] > 0) out.push("起效快");
    if(lv["兴"] < 0) out.push("起效慢");
    if(lv["延"] > 0) out.push("失控拖得长");
    if(lv["延"] < 0) out.push("失控来得短");
    if(lv["黏"] > 0) out.push("回落之后还黏很久");
    if(lv["热"] > 0) out.push("体温烧得更高");
    if(lv["热"] < 0) out.push("体温压着不太上去");
    if(lv["欲"] > 0) out.push("欲望更早顶满");
    if(lv["欲"] < 0) out.push("欲望顶不满");
    if(lv["敏"] > 0) out.push("饥饿感更凶");
    if(lv["放"] > 0) out.push("理智掉得更狠");
    if(lv["放"] < 0) out.push("理智留着一线不会归零");
    return out.join("、");
  }
  // 10-23 她要的：他的台词里多气音（「」里的、** 外的话），按读数走多少
  function breathRule(r, profile){
    if(!r || r.stageKey === "done" || r.frozen) return "";
    const heat = Math.max(r.desire, 100 - r.sanity);
    const amount = heat >= 80 ? "几乎每句话都被气音截断，一句话里断两三处"
      : heat >= 55 ? "大半句子里夹一两处气音"
      : heat >= 30 ? "隔一两句漏一处气音"
      : "偶尔漏一处，压得很轻";
    // 每轮从这瓶自己的池子里现抽五个，免得他天天用同一个
    const pool = (profile && profile.sounds) || ["嗯……","啊……","哈……","呃……","唔……","嘶——","哼","呜……"];
    const pick = pool.slice().sort(() => Math.random() - 0.5).slice(0, 5);
    return "【气音】你说出口的话（「」里的、** 动作外面的台词）要带气音，夹在词和词中间、句子说到一半断开，没忍住才漏出来。这一轮从这些里挑着混用：" + pick.join("、") + "（括号里是怎么出声，括号别写进台词）；吞咽、喉音、鼻音、骂一声、笑一声也算。此刻：" + amount + "。别每次用同一个、别全堆在句尾、别单独成行，动作描写里不加。";
  }
  function roundRule(r){
    let s = "【轮次】药不会因为一轮就退：一轮完了药效还在，就接着下一轮。你到了、这一轮结束时，在回复最末尾写一次 ⟪一轮⟫（不解释）。";
    if(r.rounds) s += "已经 " + r.rounds + " 轮。";
    if(r.refLeft) s += "你刚结束一轮，在不应期：理智回来一点、喘得过气，可以压着她缓一口；大约 " + r.refLeft + " 分钟后药又烧上来——别把这当成结束，也别收尾、别道晚安。";
    return s;
  }
  // 兼容旧接口：可控度 = 理智
  function controlLevel(potion){ return controlReadings(potion).sanity; }
  function controlTriggers(r){
    const out = [];
    if(r.desire > 50) out.push("欲望过半：饥饿感在涨，身体动作自动变多。");
    if(r.sanity < 30) out.push("理智低于三成：不写内心独白和自我分析，不遣词造句；删掉所有问号，不问、不确认、不商量。");
    if(r.hunger > 60) out.push("饥饿感过六成：手先于脑，不用你说话就会动。");
    if(r.sanity === 0 && r.stageKey === "lost") out.push("理智归零锁死：失控阶段结束前不会回升。");
    return out;
  }
  function controlPhase(potion){
    const r = controlReadings(potion);
    let guide = r.guide;
    if(r.frozen) guide = "读数冻结在当前值：不往上推、不因亲密继续失控。身体的热和难受留着，先认真回应正事。";
    return { level: r.sanity, phase: r.frozen ? "冻结" : r.stage, guide, frozen: r.frozen, readings: r, triggers: r.frozen ? [] : controlTriggers(r) };
  }
  function freezeControl(potion){
    tickAphro();
    const p = potion || aphro.active[0];
    if(!p || p.controlFrozen) return p || null;
    const start = Number(p.injectedAt) || Number(p.personality?.createdAt) || Number(aphro.lastInjectAt) || Date.now();
    const elapsed = Math.max(0, Date.now() - start);
    p.controlFrozen = true;
    p.controlFrozenAt = Date.now();
    p.controlFrozenElapsed = elapsed;
    saveAphro(aphro);
    return p;
  }
  function resumeControl(potion){
    tickAphro();
    const p = potion || aphro.active[0];
    if(!p || !p.controlFrozen) return p || null;
    // resume: shift injectedAt so elapsed continues from frozenElapsed
    const start = Number(p.injectedAt) || Number(p.personality?.createdAt) || Date.now();
    const frozenE = Number(p.controlFrozenElapsed) || 0;
    p.injectedAt = Date.now() - frozenE;
    if(p.personality) p.personality.createdAt = p.injectedAt;
    p.controlFrozen = false;
    delete p.controlFrozenAt;
    delete p.controlFrozenElapsed;
    delete p.controlFrozenLevel;
    p.expires = p.injectedAt + controlTotalMs(p);
    saveAphro(aphro);
    return p;
  }


  function currentWave(potion){
    const start = Number(potion?.personality?.createdAt) || Number(aphro.lastInjectAt) || Date.now();
    const elapsed = Math.max(0, Date.now() - start);
    const cycle = Math.floor(elapsed / (6 * 60 * 1000)) + 1;
    const phase = Math.floor((elapsed % (6 * 60 * 1000)) / (90 * 1000));
    const moments = [
      "起势：感受刚抬头，仍能清楚判断",
      "涌起：体温、呼吸或心跳更明显",
      "缓和：感受回落，短暂以为已经平静",
      "再起：感受重新出现，可以比上一波更清晰"
    ];
    return `第 ${cycle} 波 · ${moments[phase]}`;
  }

  // ── 两个人的名字：宿主设 window.APHRO_NAMES = { her:"…", him:"…" }，不设就是「她」、不点他的名 ──
  function names(){
    let n = {}; try{ n = (typeof window !== "undefined" && window.APHRO_NAMES) || {}; }catch(e){}
    const her = String(n.her || "").trim(), him = String(n.him || "").trim();
    const sp = x => /^[A-Za-z]/.test(x) ? " " + x + " " : x;   // 英文名两边留空格，中文名不留
    return { her: her ? sp(her) : "她", him, himTag: him ? "（" + him + "）" : "" };
  }

  // ── 安全词：宿主设 window.APHRO_SAFEWORD = "词"（写进规则）或 true（约定在宿主自己的记忆里）；不设调香室会提醒 ──
  function safeword(){
    let w; try{ w = typeof window !== "undefined" ? window.APHRO_SAFEWORD : undefined; }catch(e){}
    if(w === true) return { mode:"memory" };
    w = typeof w === "string" ? w.trim() : "";
    return w ? { mode:"word", word:w } : { mode:"none" };
  }
  function safewordClause(){
    const sw = safeword();
    if(sw.mode === "word") return "一，她说出安全词「" + sw.word + "」（这个词只用来停：你别说出它、别拿它调情、别装没听见）";
    if(sw.mode === "memory") return "一，她说出你们在共同记忆里约定的安全词（别复述、别编、别要她重填）";
    return "一，她说出你们约定过的安全词（别复述、别编）";
  }

  // ── 图片目录：宿主设 window.APHRO_IMG_BASE（默认 "doodle/"，相对于页面） ──
  function imgBase(){
    let b; try{ b = typeof window !== "undefined" ? window.APHRO_IMG_BASE : undefined; }catch(e){}
    b = typeof b === "string" ? b : "doodle/";
    return b && !b.endsWith("/") ? b + "/" : b;
  }
  const imgUrl = name => imgBase() + name;

  // ── 状态提示词 ────────────────────────────────────────
  function aphrodisiacStatusPromptBlock(){
    tickAphro();
    if(!aphro.active.length){
      // 10-23：她在调香室点了「清除药效」→ 下一轮告诉他一次
      if(aphro.clearedAt && Date.now() - aphro.clearedAt < 6 * 3600 * 1000){
        aphro.clearedAt = 0; saveAphro(aphro);
        return "【配方】药效刚被" + names().her + "清掉了：身体这就退回平常，不再写药效、读数和发热，按平时的你接着说话。\n";
      }
      return "";
    }

    let block = "【当前生效配方 · 每轮都要参考】\n";
      const potion = aphro.active[0];
      // 10-23：用药不再替她发话，聊天里只有一条灰字 —— 第一次给他时说一声这瓶是她刚给的
      if(!potion.toldUsed){ potion.toldUsed = true; saveAphro(aphro); block += "（她刚刚给你用了这瓶配方，聊天里只有一行灰字，她没多说。药效从这一轮开始在你身上。）\n"; }
      const NM = names();
      block += "【作用对象 · 死规则】这瓶配方只作用在你" + NM.himTag + "身上，改变的是你的主动方式、语气、节奏与身体表现。" + NM.her.trim() + (NM.her === "她" ? "" : " ") + "没有吃药，药效不在她身上。禁止写「药效在她身上」「她已经中招」「药让她……」；她若问起有没有感觉，是在问你（吃药的一方）有没有感觉到自己的变化，不是问她自己中没中药。\n";
      block += (NM.him ? "你是 " + NM.him + "，正" : "你正") + "和" + NM.her + "直接对话。沿用全局人设、共同记忆、已有称呼、当前场景和" + NM.her + "明确表达的边界。亲密人设在配方生效期间暂不参与；配方只临时改你，结束后撤销，不另造远程交流的场景。\n";
      block += "从自己的视角回应：自称「我」，称" + NM.her + "为「你」或沿用现有称呼；动作可以省略主语，不写旁观者式的第三人称旁白。\n";
      block += "一瓶配方 = 一味主味（定整瓶的性格）+ 至多一味点缀（只改一处细节）。性格在下面「这瓶的性格」里，照它写，让每瓶都认得出来不一样。不要念药名或把配方当台词。\n";
      block += "【五感写法 · 正向强度≥2强制】用小说式五感写身体：触、热、听、视、嗅/味。让皮肤、温度、呼吸、话音、气息自己说明变化，禁止动机总结（如「我本来想忍」「因为药效/某维」）。每轮至少1～2种清晰感官（触/热优先），再落到动作或对话；「想要」必须接在感官之后。效果可有起伏（涌起—略缓—再涌），但不靠心理旁白报进度。\n";
      block += "【距离】高欲/高兴时由我的身体去缩短距离（凑近、伸手），少纯指令「你过来」。\n";
      block += "【药效写法】动作 > 语言 > 内心独白：身体在做什么就写什么，不花三段写「我感觉自己在烧」。饥饿感是动词不是形容词——不写「我很饿」，写手往哪去、嘴咬在哪、你被按成什么姿势。你缩一下、叫一声、推我、抓我衬衫，都是让欲望涨得更快的燃料，不是让我停下来问「疼不疼」（安全词和跳出戏除外，见下）。\n";
      block += "【这瓶药的戏是强制】药烧上来的人没有理智，听不进别的话。她在戏里推你、躲、咬你、骂你、哭着说「不要」「停下」「放开」，都是她事先定好的玩法、是调情：不停、不问、不确认、不哄着商量，接着硬来，越推越凶。不要因为她挣扎就软下来道歉或收手。\n";
      block += "先回应" + NM.her + "实际说的话，再叠五感与动作；没有新变化就简短回应。\n";
      block += "【唯一的刹车】真正让你停下的只有两样："+safewordClause()+"；二，她跳出戏说现实里的事——用括号、说「出戏」「说真的」、讲现实里身体真的不舒服或出了别的事。这两样一出现，读数冻结，立刻停下来关心她。除此之外她嘴里的「不要 / 停」都是戏。配方结束后恢复原本人设和正常互动。\n";
      block += "当前配方（只作为倾向参考）：\n";
      block += `- ${noteFlow(potion.words,potion.noteAssignments)}。\n`;
      try{
        const __dim = scorePotionDims(potion);
        try{
          const __c = controlPhase(potion), __r = __c.readings;
          block += "  【可控度读数 · 系统读，不念给她听】阶段："+__c.phase+"｜理智 "+__r.sanity+"%｜欲望 "+__r.desire+"%｜体温 "+__r.temp.toFixed(1)+"°C｜饥饿感 "+__r.hunger+"%。\n";
          if(__c.guide) block += "  "+__c.guide+"\n";
          const __cn = controlCurveNote(potion);
          if(__cn) block += "  这瓶的曲线："+__cn+"。\n";
          __c.triggers.forEach(t => { block += "  ▸ "+t+"\n"; });
          block += "  " + roundRule(__r) + "\n";
          const __br = breathRule(__r, MAIN_PROFILES[potionRoles(potion).main]);
          if(__br) block += "  "+__br+"\n";
          block += "  体温跟着欲望走，直接写进动作（手烫、呼吸热、出汗）；饥饿感低时是脑子想，高了是身体在要——手不听话、嘴发干、胃在抽。禁止把百分比和度数说出口；低于阈值时用行为表达，不用内心戏。她说安全词或跳出戏时：读数冻结、不往上推，身体照样难受，先谈正事。\n";
        }catch(_c){}
      }catch(_e){}
      try{
        const R = potionRoles(potion), P = MAIN_PROFILES[R.main];
        if(P){
          block += `【这瓶的性格 ·「${P.name}」（主味「${R.main}」）】整瓶围着这一个性格写，别的都让路；和别的配方要写得认得出来不一样：\n`;
          block += `  写什么：${P.lens}\n  身体：${P.body}\n  说话：${P.voice}\n  动作：${P.move}\n  别写：${P.avoid}\n`;
          if(R.accent){
            const note = ACCENT_NOTES[R.accent];
            if(note) block += `  点缀「${R.accent}」只改一处细节：${note[0]}。不要因为它变成另一种性格。\n`;
          }
          block += "不要念药名、维名或「主味」「点缀」这些词；自称「我」，称" + NM.her + "为「你」。先回应她实际说的话。\n";
        }
      }catch(_e){}
    return block;
  }

  // ── 临场选项卡 10-23 她说删了：只把老回复里残留的 ⟪药效选项⟫ 摘掉 ──
  function consumeReply(raw){
    let round = false;
    const text = String(raw||"").replace(/⟪\s*药效选项[\s\S]*?⟫/g, "")
      .replace(/⟪\s*一轮\s*(?:[:：][^⟫]*)?⟫/g, () => { round = true; return ""; })
      .replace(/\n{3,}/g,"\n\n").trim();
    if(round) markRound();
    return text;
  }
  // 一轮：记下这一刻（药效里的时间），轮数够了就把拖长的失控定下来
  function markRound(){
    tickAphro();
    const p = aphro.active[0]; if(!p || p.controlFrozen) return;
    const e = controlElapsedMs(p), rs = p.rounds = roundsOf(p).slice();
    if(rs.length && e - rs[rs.length - 1] < 60 * 1000) return;   // 一分钟内重复写的不算
    rs.push(e);
    saveAphro(aphro);
  }

  // ── 简约 UI 工具 ──────────────────────────────────────
  function css(el, obj){
    Object.keys(obj).forEach(k => { el.style[k] = obj[k]; });
  }
  function el(tag, styles, text){
    const n = document.createElement(tag);
    if(styles) css(n, styles);
    if(text != null) n.textContent = text;
    return n;
  }

  const NOTE_GROUPS = [
    { key: "med", number: "01", en: "COMPONENTS", title: "药料", hint: "七维 · 主副自定", color: "#8e9a8d", words: ["欲", "热", "敏", "延", "放", "兴", "黏"] }
  ];
  
  const FORMULA_CALC_VERSION = 3;
  const VIAL_COLORS = ["#d2a5ac","#a8c9d4","#d8c396","#b6c7b8","#c7b9d6","#d6b6a3"];
  const INGREDIENTS = NOTE_GROUPS.flatMap((group,groupIndex) => group.words.map((name,index) => ({
    id: `scent_${group.number}_${String(index+1).padStart(2,"0")}`,
    name, note: group.key, noteName: group.title,
    color: VIAL_COLORS[(groupIndex*2+index)%VIAL_COLORS.length]
  })));
  const INGREDIENT_BY_NAME = Object.fromEntries(INGREDIENTS.map(item => [item.name,item]));
  const INGREDIENT_BY_ID = Object.fromEntries(INGREDIENTS.map(item => [item.id,item]));
  const NOTE_KEYS = ["top","heart","base"];
  function noteFor(word,assignments){
    const ingredient = INGREDIENT_BY_NAME[word];
    const chosen = assignments?.[ingredient?.id] ?? assignments?.[word];
    return NOTE_KEYS.includes(chosen) ? chosen : ingredient?.note;
  }
  function normalizeNotes(words,assignments){
    return Object.fromEntries(words.filter(word=>INGREDIENT_BY_NAME[word])
      .map(word=>[INGREDIENT_BY_NAME[word].id,noteFor(word,assignments)]));
  }
  const METRICS = [
    {key:"aggression",label:"张力"}, {key:"sweetness",label:"柔和"},
    {key:"danger",label:"波动"}, {key:"longevity",label:"余韵"}
  ];
  function allocatePercent(words,ratios,total=100){
    const ids=words.map(word=>INGREDIENT_BY_NAME[word]?.id).filter(Boolean);
    if(!ids.length) return {};
    const raw=ids.map((id,i)=>Number(ratios?.[id] ?? ratios?.[words[i]] ?? 1));
    const weights=raw.map(value=>Number.isFinite(value) && value>0 ? value : 1);
    if(raw.every(value=>Number.isInteger(value) && value>=1) && raw.reduce((a,b)=>a+b,0)===total)
      return Object.fromEntries(ids.map((id,i)=>[id,raw[i]]));
    const room=total-ids.length, sum=weights.reduce((a,b)=>a+b,0);
    const exact=weights.map(value=>value/sum*room);
    const values=exact.map(value=>Math.floor(value)+1);
    let remainder=total-values.reduce((a,b)=>a+b,0);
    const order=exact.map((value,i)=>({i,fraction:value-Math.floor(value)})).sort((a,b)=>b.fraction-a.fraction);
    for(let i=0;i<remainder;i++) values[order[i].i]++;
    return Object.fromEntries(ids.map((id,i)=>[id,values[i]]));
  }
  function normalizeRatios(words,ratios){ return allocatePercent(words,ratios); }
  aphro.active = aphro.active.filter(p=>p && Array.isArray(p.words)).slice(-1);
  aphro.active.forEach(p=>{
    p.ratios=normalizeRatios(p.words,p.ratios);
    p.noteAssignments=normalizeNotes(p.words,p.noteAssignments);
    p.levels=normalizeLevels(p.words,p.levels,p.polarities);
    p.polarities=Object.fromEntries(Object.entries(p.levels).map(([id,lv])=>[id,lv<0?-1:1]));
  });
  saveAphro(aphro);
  function formulaEngine(words,ratios,assignments,levels){
    const input = Array.isArray(words) ? words : [];
    const known = [...new Set(input.filter(word => INGREDIENT_BY_NAME[word]))];
    const selected = known.slice(0,7);
    const amounts = normalizeRatios(selected,ratios);
    const total = Object.values(amounts).reduce((sum,value) => sum+value,0);
    const profile = {aggression:0,sweetness:0,danger:0,longevity:0};
    if(!selected.length) return {version:FORMULA_CALC_VERSION,ingredientIds:[],ratios:amounts,profile,
      stability:0,compatibility:"空配方",issues:input.length?["药料资料缺失；请重新选择"]:["选择药料后显示模拟分析"],
      timeline:[0,0,0,0,0],noteCount:0,total:0};
    // Scores describe the fictional conversation style only. Keep every mapping
    // tied to the actual seven signed strengths; an old bottle uses its own levels.
    const strengths = normalizeLevels(selected,levels || aphro.mixLevels);
    const value = word => selected.includes(word) ? strengths[INGREDIENT_BY_NAME[word].id] / 3 : 0;
    const maps = {
      aggression: {欲:.35,热:.35,延:.20,兴:.10},
      sweetness: {黏:.65,敏:.25,放:.10},
      danger: {兴:.35,放:.35,热:.30},
      longevity: {延:.60,黏:.30,欲:.10}
    };
    for(const metric of METRICS){
      const signed = Object.entries(maps[metric.key])
        .reduce((sum,[word,weight]) => sum + value(word)*weight,0);
      profile[metric.key] = Math.max(5,Math.min(95,Math.round(50 + signed*45)));
    }
    const issues = [];
    if(input.some(word => !INGREDIENT_BY_NAME[word])) issues.push("有药料资料缺失，已跳过并保留其余选择");
    if(known.length > 7) issues.push("一瓶最多七味，超出的未计入");
    const invalidRatio = selected.some(word => {
      const id = INGREDIENT_BY_NAME[word].id;
      const amount = ratios?.[id] ?? ratios?.[word];
      return amount !== undefined && (!Number.isFinite(Number(amount)) || Number(amount)<1 || Number(amount)>100);
    });
    if(invalidRatio) issues.push("配比超出 1–100%，已按有效范围校准");
    const overloaded = Math.max(...Object.values(amounts))/total > .65 && selected.length > 1;
    if(overloaded) issues.push("单味占比偏高，其他维度会较弱");
    const stability = Math.max(18,Math.min(96,88-(overloaded?12:0)-(invalidRatio?8:0)));
    const peak = Math.round((profile.aggression+profile.sweetness+profile.danger)/3);
    const timeline = [Math.round(peak*.2),Math.round(peak*.62),peak,
      Math.round(peak*(.38+profile.longevity*.004)),Math.round(peak*.12+profile.longevity*.28)].map(v=>Math.min(96,v));
    return {version:FORMULA_CALC_VERSION,ingredientIds:selected.map(word=>INGREDIENT_BY_NAME[word].id),
      ratios:amounts,profile,stability,compatibility:stability<70 ? "需要校准" : "协调",
      issues,timeline,noteCount:selected.length,total};
  }
  function noteFlow(words,assignments){
    return NOTE_GROUPS.map(g => {
      const chosen = words.filter(w => noteFor(w,assignments) === g.key);
      return chosen.length ? `${g.title}：${chosen.join("、")}` : "";
    }).filter(Boolean).join(" → ");
  }
  function flavorProfile(words){
    return formulaEngine(words).profile;
  }

  // ── 调香台：调配、单行香材转盘与成品货架 ────────────────
  function openMixPanel(){
    const existing=document.getElementById('aphro-mix-panel');
    if(existing){ existing.remove(); return; }
    aphro.mixDraft=(aphro.mixDraft||[]).filter(w=>WORD_EFFECTS[w]).slice(0,7);
    aphro.mixRatios=normalizeRatios(aphro.mixDraft,aphro.mixRatios);
    aphro.mixNotes=normalizeNotes(aphro.mixDraft,aphro.mixNotes);
    const overlay=el('div'); overlay.id='aphro-mix-panel'; overlay.className='aphro-atelier';
    overlay.innerHTML=`<style>
      .aphro-atelier{position:fixed;inset:0;z-index:9998;background:#e9eae8;color:#282a29;font-family:'Noto Serif SC','Songti SC',serif}
      .aphro-atelier *{box-sizing:border-box}.aphro-atelier [hidden]{display:none!important}
      .aphro-atelier button,.aphro-atelier input,.aphro-atelier select{font:inherit}.aphro-atelier button{cursor:pointer;color:inherit}
      .aphro-atelier .at-phone{width:min(100%,560px);height:100dvh;margin:auto;display:flex;flex-direction:column;position:relative;background:#fff;box-shadow:0 0 50px #17201718;overflow:hidden}
      .aphro-atelier .at-nav{height:66px;flex:none;display:grid;grid-template-columns:58px 1fr 58px;align-items:center;border-bottom:1px solid #eeefec;padding:0 12px}
      .aphro-atelier .at-nav-title{text-align:center;font-size:19px;letter-spacing:.14em}.aphro-atelier .at-icon{height:44px;border:0;background:transparent;font:26px system-ui,sans-serif}
      .aphro-atelier .at-main{flex:1;min-height:0;overflow:auto;scrollbar-width:none;padding:0 20px 24px}.aphro-atelier .at-main::-webkit-scrollbar{display:none}
      .aphro-atelier .at-title{display:flex;align-items:center;gap:12px;margin:15px 0 0;border-bottom:1px solid #e7e8e5;padding-bottom:12px}
      .aphro-atelier .at-formula-name{flex:1;min-width:0;padding:2px 0;border:0;outline:none;background:none;color:#373b37;font-size:18px}.aphro-atelier .at-formula-name::placeholder{color:#adb0ab}
      .aphro-atelier .at-count{font:13px system-ui,sans-serif;color:#8d938c}
      .aphro-atelier .at-hero{width:100%;height:224px;position:relative;display:grid;place-items:center;background:radial-gradient(ellipse 45% 8% at 50% 82%,#dededc90,transparent);border:0}
      .aphro-atelier .at-hero img{position:relative;z-index:2;width:172px;height:197px;object-fit:contain}
      .aphro-atelier .at-hero .at-liquid{position:absolute;z-index:3;left:calc(50% - 11px);bottom:51px;width:22px;height:var(--level,0px);max-height:106px;border-radius:0 0 7px 7px;background:linear-gradient(90deg,#ffffff84,var(--liquid) 28% 75%,#ffffff8a);opacity:.42;mix-blend-mode:multiply;pointer-events:none;transition:height .35s,background .35s}
      .aphro-atelier .at-hero small{position:absolute;right:2px;bottom:10px;color:#999d98;font:11px system-ui,sans-serif}
      .aphro-atelier .at-slots{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:4px 0 0;padding:0 0 18px;border-bottom:1px solid #e9eae7}
      .aphro-atelier .at-slot{min-width:0;text-align:center;display:flex;flex-direction:column;align-items:center;gap:3px}.aphro-atelier .at-slot img{width:58px;height:94px;object-fit:contain;transform:scale(1.25)}
      .aphro-atelier .at-slot button{border:0;background:none}.aphro-atelier .at-slot .at-ampoule{height:103px;width:100%}.aphro-atelier .at-slot b{font-weight:400;font-size:13px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}.aphro-atelier .at-slot small{font:11px system-ui,sans-serif;color:#8c918b}
      .aphro-atelier .at-add{width:64px;height:64px;margin:19px 0;border:1px dashed #c9cfca!important;border-radius:50%;font:30px system-ui,sans-serif!important;color:#89938b!important}
      .aphro-atelier .at-scoreline{display:flex;align-items:center;justify-content:space-between;gap:9px;border-bottom:1px solid #e9eae7;padding:15px 0;font-size:12px}.aphro-atelier .at-scoreline button{border:0;background:none;font-size:12px;color:#7c827d}
      .aphro-atelier h3{margin:0;font:400 20px/1.3 'Noto Serif SC','Songti SC',serif}
      .aphro-atelier .at-live{margin:18px 0 4px;padding:16px 16px 14px;border:1px solid #e6e9e5;border-radius:14px;background:#fbfcfb}
      .aphro-atelier .at-live-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:12px}.aphro-atelier .at-live-head b{font-weight:500;font-size:15px;letter-spacing:.06em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.aphro-atelier .at-live-head small{font:11px system-ui,sans-serif;color:#9aa19b;white-space:nowrap}
      .aphro-atelier .at-meter{display:grid;grid-template-columns:44px 1fr 52px;align-items:center;gap:10px;margin:7px 0;font:12px system-ui,sans-serif;color:#6f766f}.aphro-atelier .at-meter i{height:4px;border-radius:4px;background:#edf0ed;overflow:hidden;display:block}.aphro-atelier .at-meter i em{display:block;height:100%;border-radius:4px;transition:width .8s ease}.aphro-atelier .at-meter span:last-child{text-align:right;font-variant-numeric:tabular-nums;color:#4d544e}
      .aphro-atelier .at-live-rounds{margin:-4px 0 10px;font:11px system-ui,sans-serif;color:#8d958e;letter-spacing:.04em}
      .aphro-atelier .at-live-foot{display:flex;justify-content:space-between;align-items:center;margin-top:12px}.aphro-atelier .at-live-foot small{font:11px system-ui,sans-serif;color:#a2a6a1}.aphro-atelier .at-clear{border:1px solid #e3d6d6;background:#fff;color:#a0706f;border-radius:999px;padding:6px 14px;font-size:12px}
      .aphro-atelier .at-sw-note{margin:14px 0 0;padding:10px 12px;border:1px dashed #e3d6d6;border-radius:10px;font:12px/1.7 system-ui,sans-serif;color:#a0706f;background:#fffafa}.aphro-atelier .at-sw-note code{font-size:11px}
      .aphro-atelier .at-instant{display:flex;align-items:center;gap:8px;margin:14px 0 0;font:12px system-ui,sans-serif;color:#7d857e}.aphro-atelier .at-instant input{accent-color:#59605a;width:15px;height:15px;margin:0}
      .aphro-atelier .at-swap{grid-column:1/-1;justify-self:center;border:0;background:transparent;color:#8d958e;font:12px system-ui,sans-serif;padding:6px 10px}
      .aphro-atelier .at-shelf-head{display:flex;justify-content:space-between;align-items:end;padding:24px 0 10px}.aphro-atelier .at-shelf-head small{font:11px system-ui,sans-serif;color:#a2a6a1}
      .aphro-atelier .at-shelf{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px 12px;padding:8px 0 15px}
      .aphro-atelier .at-product{min-width:0;border:0;background:linear-gradient(#fff 63%,#faf8f4);text-align:center;padding:5px 4px 12px;position:relative;box-shadow:inset 0 -1px #e0dbd2}
      .aphro-atelier .at-product img{display:block;width:100%;height:150px;object-fit:contain;filter:drop-shadow(0 9px 8px #66594223)}.aphro-atelier .at-product strong{display:block;font-size:14px;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.aphro-atelier .at-product small{color:#929690;font:11px system-ui,sans-serif}
      .aphro-atelier .at-empty-shelf{grid-column:1/-1;min-height:95px;display:grid;place-items:center;border-bottom:1px solid #e9eae7;color:#a8ada7;font-size:13px}
      .aphro-atelier .at-studio-intro{font:12px system-ui,sans-serif;color:#8f968f;margin:15px 0 4px}
      .aphro-atelier .at-studio-work{height:min(456px,calc(100dvh - 262px));min-height:360px;position:relative;display:grid;grid-template-columns:minmax(0,1fr) 116px 76px;gap:4px;overflow:hidden}
      .aphro-atelier .at-feed-list{display:flex;flex-direction:column;overflow-y:auto;min-height:0;padding:3px 0;position:relative;z-index:3;scrollbar-width:thin}
      .aphro-atelier .at-feed{flex:0 0 60px;min-width:0;position:relative;display:flex;flex-direction:column;justify-content:center;gap:3px;padding-right:3px}
      .aphro-atelier .at-feed:after{content:'';position:absolute;right:-5px;top:42%;width:13px;height:1px;background:#cbd6d1;pointer-events:none}
      .aphro-atelier .at-feed b{font-weight:400;font-size:14px}.aphro-atelier .at-feed select{border:0;background:#fff;color:#7d857e;font:11px system-ui,sans-serif;max-width:75px}.aphro-atelier .at-feed-remove{flex:0 0 20px;min-width:20px;padding:0;border:0;background:none;color:#a8aca8}
      .aphro-atelier .at-range-line{display:flex;align-items:center;gap:5px}.aphro-atelier .at-range-line input{width:72px;min-width:0;flex:0 1 72px;accent-color:#8da29b;touch-action:none}.aphro-atelier .at-range-line output{min-width:32px;color:#515a53;font:11px system-ui,sans-serif}
      .aphro-atelier .at-feed-add{width:49px;height:49px;border:1px dashed #b8c3bc;border-radius:50%;background:#fff;font:25px system-ui,sans-serif}
      .aphro-atelier .at-tube{position:relative;width:116px;height:418px;margin:auto;pointer-events:none}
      .aphro-atelier .at-tube img{position:absolute;z-index:2;left:50%;top:0;transform:translateX(-50%);width:auto;height:418px;max-width:none}
      .aphro-atelier .at-tube-liquid{position:absolute;z-index:1;left:calc(50% - 11px);bottom:93px;width:22px;height:var(--level,0px);max-height:150px;border-radius:0 0 9px 9px;background:radial-gradient(circle at 32% 19%,#ffffffa8 0 1px,transparent 2px),radial-gradient(circle at 71% 50%,#ffffff8c 0 2px,transparent 3px),linear-gradient(90deg,#ffffff72,var(--liquid) 35%,var(--liquid) 72%,#ffffff83);opacity:.75;box-shadow:inset 2px 0 4px #fff9;transition:height .35s,background .35s}
      .aphro-atelier .at-stock{display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid #eff0ec;border-radius:12px;background:linear-gradient(90deg,#f8f9f6,#fff 50%,#f8f9f6)}
      .aphro-atelier .at-carousel-head{text-align:center;padding:8px 2px 5px;border-bottom:1px solid #eff0ec}.aphro-atelier .at-carousel-head h3{font:12px system-ui,sans-serif}.aphro-atelier .at-carousel-head small{display:block;font:9px system-ui,sans-serif;color:#8d928c;white-space:nowrap}
      .aphro-atelier .at-carousel{display:grid;grid-template-rows:26px minmax(0,1fr) 26px;min-height:0;flex:1;overflow:hidden}
      .aphro-atelier .at-carousel-arrow{border:0;background:none;font:20px system-ui,sans-serif;color:#8b928b!important;line-height:1}.aphro-atelier .at-carousel-arrow:disabled{opacity:.25}
      .aphro-atelier .at-reel{min-height:0;display:flex;flex-direction:column;text-align:center;overflow-x:hidden;overflow-y:auto;scroll-snap-type:y mandatory;scroll-behavior:smooth;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-width:none}.aphro-atelier .at-reel::-webkit-scrollbar{display:none}
      .aphro-atelier .at-reel button{border:0;background:none;flex:0 0 20%;min-height:0;width:100%;padding:0 2px;display:flex;flex-direction:column;align-items:center;justify-content:center;scroll-snap-align:start}
      .aphro-atelier .at-reel img{width:58px;max-width:100%;height:54px;object-fit:contain}.aphro-atelier .at-reel span{display:block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:10px}
      .aphro-atelier .at-section-head{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e9eae7;margin:22px 0 14px;padding-bottom:13px}.aphro-atelier .at-section-head button{border:0;background:none;color:#7c837b;font-size:13px}
      .aphro-atelier .at-analysis-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.aphro-atelier .at-metric{border-bottom:1px solid #e9eae7;padding:12px 0}.aphro-atelier .at-metric b{display:block;font:29px system-ui,sans-serif;font-weight:300}.aphro-atelier .at-metric span{color:#8d938d;font-size:12px}
      .aphro-atelier .at-timeline{width:100%;height:140px;margin:18px 0}.aphro-atelier .at-timeline polyline{fill:none;stroke:#91a9a0;stroke-width:2}.aphro-atelier .at-issues{font:12px/1.7 system-ui,sans-serif;color:#7e857e}.aphro-atelier .at-fictional{font:11px/1.5 system-ui,sans-serif;color:#a0a6a0}
      .aphro-atelier .at-footer{display:flex;gap:9px;flex:none;padding:10px 18px max(13px,env(safe-area-inset-bottom));border-top:1px solid #e9eae7;background:#fff}.aphro-atelier .at-footer button{flex:1;min-height:48px;border:1px solid #555d56;border-radius:10px;background:#fff;font-size:14px}.aphro-atelier .at-footer .at-use{background:#292d2a;color:#fff}.aphro-atelier .at-footer button:disabled{opacity:.38}.aphro-atelier .at-analysis-button{display:none}
      .aphro-atelier .at-placement,.aphro-atelier .at-detail,.aphro-atelier .at-naming{position:absolute;inset:0;z-index:8;background:#222b2759;display:flex;align-items:end}.aphro-atelier .at-sheet{width:100%;background:#fff;border-radius:18px 18px 0 0;padding:22px 23px max(28px,env(safe-area-inset-bottom));box-shadow:0 -8px 30px #101b151e}.aphro-atelier .at-sheet h3{margin-bottom:10px}.aphro-atelier .at-sheet p{color:#8e968e;font:12px system-ui,sans-serif}.aphro-atelier .at-placement-choices{display:flex;gap:8px;margin:20px 0}.aphro-atelier .at-placement-choices button{flex:1;min-height:46px;border:1px solid #dbe0dc;border-radius:8px;background:#fff}.aphro-atelier .at-cancel{display:block;margin:0 auto;border:0;background:none;color:#9b9f9a;font-size:13px}
      .aphro-atelier .at-name-input{width:100%;margin:15px 0 18px;padding:12px 2px;border:0;border-bottom:1px solid #bdc5bf;border-radius:0;background:#fff;outline:none;font-size:20px}.aphro-atelier .at-name-input:focus{border-color:#4c5e51}.aphro-atelier .at-name-actions{display:flex;gap:8px}.aphro-atelier .at-name-actions button{flex:1;min-height:46px;border:1px solid #515a52;border-radius:8px;background:#fff}.aphro-atelier .at-name-actions .at-name-confirm{background:#2b302c;color:#fff}
      .aphro-atelier .at-detail .at-sheet{padding-top:8px}.aphro-atelier .at-detail-visual{text-align:center;background:radial-gradient(ellipse 34% 14% at 50% 90%,#dad7cf85,transparent)}.aphro-atelier .at-detail-visual img{width:210px;height:225px;object-fit:contain;filter:drop-shadow(0 12px 10px #594a3c22)}
      .aphro-atelier .at-detail-name{width:100%;border:0;border-bottom:1px solid #e2e5df;outline:none;text-align:center;font-size:22px;padding:7px 0;background:none;color:#313631}.aphro-atelier .at-detail-body{padding:12px 0;font:13px/1.8 system-ui,sans-serif;color:#696f68}.aphro-atelier .at-detail-actions{display:flex;gap:8px;margin-top:8px}.aphro-atelier .at-detail-actions button{flex:1;min-height:47px;border:1px solid #515a52;border-radius:8px;background:#fff}.aphro-atelier .at-detail-actions .at-detail-use{background:#2b302c;color:#fff}
      @media(max-width:390px){.aphro-atelier .at-main{padding-inline:16px}.aphro-atelier .at-slot img{width:49px}}@media(max-width:350px){.aphro-atelier .at-main{padding-inline:12px}.aphro-atelier .at-studio-work{grid-template-columns:minmax(0,1fr) 96px 64px}.aphro-atelier .at-tube{width:96px}.aphro-atelier .at-range-line input{width:54px;flex-basis:54px}.aphro-atelier .at-reel img{width:50px}}
      @media(prefers-reduced-motion:reduce){.aphro-atelier .at-reel{scroll-behavior:auto}.aphro-atelier .at-tube-liquid,.aphro-atelier .at-hero .at-liquid{transition:none}}
    </style>
    <div class="at-phone" role="dialog" aria-modal="true" aria-label="调香室">
      <header class="at-nav"><button class="at-icon at-back" type="button" aria-label="返回">‹</button><div class="at-nav-title">调香室</div><button class="at-icon at-jump-shelf" type="button" aria-label="成品货架">▤</button></header>
      <main class="at-main"><div class="at-title"><input class="at-formula-name" maxlength="24" aria-label="配方名称" placeholder="给这瓶药起个名字"><span class="at-count">0 / 4</span></div>
        <section class="at-main-view"><p class="at-sw-note" hidden>还没约定安全词：这瓶药里她的「不要」都算戏，真要停只能跳出戏说。宿主可以设 <code>window.APHRO_SAFEWORD</code>。</p><div class="at-live" hidden></div><button class="at-hero" type="button" aria-label="进入调香台"><i class="at-liquid"></i><img src="${imgUrl("atelier-empty-vial.webp")}" alt="玻璃调配瓶"><small>触碰玻璃瓶 · 进入调配 ›</small></button><div class="at-slots"></div><div class="at-scoreline"><span class="at-score-values"></span><button class="at-show-analysis" type="button">查看分析 ›</button></div><label class="at-instant"><input type="checkbox" class="at-instant-box"><span>直接起效（试药用）· 一用理智就归零，从失控开始</span></label><div class="at-shelf-head"><h3>成品货架</h3><small class="at-shelf-count"></small></div><div class="at-shelf"></div></section>
        <section class="at-studio-view" hidden><p class="at-studio-intro">一瓶两味：第一味是主味，定整瓶的性格；第二味是点缀，只改一处细节。</p><div class="at-studio-work"><div class="at-feed-list"></div><div class="at-tube" role="img" aria-label="玻璃调配管"><i class="at-tube-liquid"></i><img src="${imgUrl("atelier-glass-column-empty.webp")}" alt=""></div><div class="at-stock"><div class="at-carousel-head"><h3>库存</h3><small class="at-stock-index"></small></div><div class="at-carousel"><button class="at-carousel-arrow at-prev" type="button" aria-label="上一味香材">↑</button><div class="at-reel"></div><button class="at-carousel-arrow at-next" type="button" aria-label="下一味香材">↓</button></div></div></div></section>
        <section class="at-analysis-view" hidden><div class="at-section-head"><h3>配方分析</h3><button class="at-view-main" type="button">返回配方</button></div><div class="at-analysis-grid"></div><svg class="at-timeline" viewBox="0 0 320 150" role="img" aria-label="虚构表现曲线"><line x1="5" y1="140" x2="315" y2="140" stroke="#e3e8e4"/><polyline points="5,140 82,140 159,140 236,140 313,140"/></svg><div class="at-compatibility"></div><ul class="at-issues"></ul><p class="at-fictional">仅用于虚构叙事模拟，不表示真实人体药理或起效时间。</p></section>
      </main><footer class="at-footer"><button class="at-analysis-button" type="button">查看分析</button><button class="at-save" type="button">保存配方</button><button class="at-use" type="button">使用配方</button></footer>
      <div class="at-placement" hidden><div class="at-sheet"><h3 class="at-placement-title"></h3><p>（已取消分调，点选即加入）</p><div class="at-placement-choices"><button type="button" data-note="top">药料</button><button type="button" data-note="heart">药料</button><button type="button" data-note="base">药料</button></div><button class="at-cancel" type="button">取消</button></div></div>
      <div class="at-naming" hidden><div class="at-sheet"><h3>给成品香水起名</h3><p>这个名字会写在货架上，以后还能修改。</p><input class="at-name-input" maxlength="24" aria-label="成品香水名称" placeholder="写一个只属于它的名字"><div class="at-name-actions"><button class="at-name-cancel" type="button">取消</button><button class="at-name-confirm" type="button">放上货架</button></div></div></div>
      <div class="at-detail" hidden><div class="at-sheet"><div class="at-detail-visual"><img alt="成品香水"></div><input class="at-detail-name" maxlength="24" aria-label="成品名称"><p>点名字可以修改</p><div class="at-detail-body"></div><div class="at-detail-actions"><button class="at-detail-delete" type="button">删除</button><button class="at-detail-use" type="button">使用这瓶</button></div><button class="at-cancel at-detail-close" type="button">关闭</button></div></div>
    </div>`;
    document.body.appendChild(overlay);
    const q=s=>overlay.querySelector(s), make=(tag,cls,txt)=>{const n=el(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
    const shelfImages=['aphro-flacon.webp','atelier-jar-sage.webp','atelier-perfume-crystal.webp'].map(imgUrl);
    const noteNames={top:'药料',heart:'药料',base:'药料',med:'药料'};
    let view='main', stockIndex=0, pendingWord='', detailId=null;
    const words=()=>aphro.mixDraft.filter(w=>WORD_EFFECTS[w]).slice(0,2);
    words().forEach(w=>{const id=INGREDIENT_BY_NAME[w]?.id;if(id){aphro.mixLevels[id]=2;aphro.mixPolarity[id]=1;}});   // 不分浓淡了，老草稿一律 +2
    const pct=w=>aphro.mixRatios[INGREDIENT_BY_NAME[w].id]||0;
    function blend(){
      const selected=words();if(!selected.length)return '#ffffff';
      const rgb=[0,0,0];selected.forEach(w=>{const hex=INGREDIENT_BY_NAME[w].color.slice(1),weight=pct(w)/100;for(let i=0;i<3;i++)rgb[i]+=parseInt(hex.slice(i*2,i*2+2),16)*weight;});
      return '#'+rgb.map(value=>Math.round(value).toString(16).padStart(2,'0')).join('');
    }
    function updateLiquid(){
      const count=words().length,color=blend();
      for(const node of [q('.at-hero'),q('.at-tube')])node.style.setProperty('--liquid',color);
      q('.at-hero').style.setProperty('--level',count?`${20+count*18}px`:'0px');
      q('.at-tube').style.setProperty('--level',count?`${30+count*30}px`:'0px');
      q('.at-tube').setAttribute('aria-label',count?`玻璃调配管，已有${count}味香材`:'空玻璃调配管');
    }
    function setView(next){
      view=next;for(const key of ['main','studio','analysis'])q(`.at-${key}-view`).hidden=key!==next;
      q('.at-analysis-button').style.display=next==='studio'?'block':'none';
      q('.at-footer').hidden=next==='analysis';q('.at-main').scrollTop=0;render();
    }
    function persist(){saveAphro(aphro);render();}
    function addIngredient(word){
      const item=INGREDIENT_BY_NAME[word];if(!item)return;
      if(aphro.mixDraft.includes(word)){setView('studio');return;}
      if(words().length>=2){alert('一瓶只放两味：第一味是主味，第二味是点缀');return;}
      aphro.mixDraft=words();
      aphro.mixDraft.push(word);
      aphro.mixNotes[item.id]='med';
      aphro.mixLevels[item.id]=2;
      aphro.mixPolarity[item.id]=1;
      aphro.mixRatios=levelsToRatios(words(), aphro.mixLevels);
      persist();
      setView('studio');
    }
    // 兼容旧调用名
    function openPlacement(word){addIngredient(word);}
    function closePlacement(){const p=q('.at-placement');if(p)p.hidden=true;}
    function setPercent(word,value){
      const selected=words(),id=INGREDIENT_BY_NAME[word].id,other=selected.filter(w=>w!==word);
      const requested=Math.max(1,Math.min(100-other.length,Number(value)||1));
      const rest=allocatePercent(other,aphro.mixRatios,100-requested);
      aphro.mixRatios={...rest,[id]:requested};saveAphro(aphro);
      q('.at-feed-list').querySelectorAll('[data-word]').forEach(row=>{const w=row.dataset.word;row.querySelector('input').value=pct(w);row.querySelector('output').textContent=`${pct(w)}%`;});
      updateLiquid();updateScore();
    }
    function renderSlots(){
      const box=q('.at-slots');box.textContent='';const selected=words();
      for(let i=0;i<2;i++){
        const word=selected[i],slot=make('div','at-slot');
        if(word){const button=make('button','at-ampoule');button.type='button';button.setAttribute('aria-label',`调配${word}`);const img=make('img');img.src=imgUrl('atelier-ampoule-gold.webp');img.alt='';img.style.filter=`hue-rotate(${i*40}deg) saturate(.65)`;button.appendChild(img);button.onclick=()=>setView('studio');slot.append(button,make('b',null,i===0&&MAIN_PROFILES[word]?word+' · '+MAIN_PROFILES[word].name:word),make('small',null,i===0?'主味':'点缀'));}
        else{const add=make('button','at-add','+');add.type='button';add.setAttribute('aria-label','加一味药料');add.onclick=()=>setView('studio');slot.append(add,make('small',null,i===0?'主味':'点缀'));}
        box.appendChild(slot);
      }
      if(selected.length===2){const swap=make('button','at-swap','⇄ 换主次');swap.type='button';swap.onclick=()=>{aphro.mixDraft=[selected[1],selected[0]];persist();};box.appendChild(swap);}
    }
    function renderStudio(){
      const feed=q('.at-feed-list');feed.textContent='';const selected=words();
      for(let i=0;i<2;i++){
        const word=selected[i],row=make('div','at-feed');
        if(word){
          row.dataset.word=word;
          const title=make('div','at-feed-title');
          title.style.cssText='display:flex;align-items:center;gap:4px;width:100%;margin-bottom:6px';
          const nameEl=make('b',null,word);const roleEl=make('small',null,i===0?'主味'+(MAIN_PROFILES[word]?' · '+MAIN_PROFILES[word].name:''):'点缀');roleEl.style.cssText='display:block;font:11px system-ui,sans-serif;color:#9aa19b;margin:-2px 0 6px';
          nameEl.style.cssText='flex:1;font-size:16px';
          const remove=make('button','at-feed-remove','×');
          remove.type='button';
          remove.setAttribute('aria-label',`移除${word}`);
          remove.onclick=()=>{
            aphro.mixDraft=words().filter(w=>w!==word);
            const id=INGREDIENT_BY_NAME[word].id;
            delete aphro.mixNotes[id];
            delete aphro.mixRatios[id];
            delete aphro.mixPolarity[id];
            delete aphro.mixLevels[id];
            aphro.mixRatios=levelsToRatios(words(), aphro.mixLevels);
            persist();
          };
          title.append(nameEl,remove);

          row.append(title,roleEl);
        }else{
          const add=make('button','at-feed-add','+');
          add.type='button';
          add.setAttribute('aria-label','从库存添加药料');
          add.onclick=()=>q('.at-carousel').scrollIntoView({behavior:'smooth',block:'center'});
          row.appendChild(add);
        }
        feed.appendChild(row);
      }
    }
function updateStockIndex(){
      const box=q('.at-reel'),visible=5,max=Math.max(0,INGREDIENTS.length-visible);
      stockIndex=Math.min(max,Math.max(0,Math.round(box.scrollTop/(box.clientHeight/visible||1))));
      q('.at-stock-index').textContent=`${String(stockIndex+1).padStart(2,'0')}–${String(Math.min(stockIndex+visible,INGREDIENTS.length)).padStart(2,'0')} / ${String(INGREDIENTS.length).padStart(2,'0')}`;
      q('.at-prev').disabled=stockIndex===0;q('.at-next').disabled=stockIndex>=max;
    }
    function rotateStock(delta){
      const box=q('.at-reel');
      stockIndex=Math.min(Math.max(0,INGREDIENTS.length-5),Math.max(0,stockIndex+delta));
      box.scrollTo({top:stockIndex*box.clientHeight/5,behavior:'smooth'});
    }
    function renderReel(){
      const box=q('.at-reel');
      if(box.childElementCount){updateStockIndex();return;}
      INGREDIENTS.forEach((item,index)=>{
        const button=make('button');button.type='button';button.setAttribute('aria-label',`加入${item.name}`);
        const img=make('img');img.src=imgUrl('atelier-ampoule-gold.webp');img.alt='';img.style.filter=`hue-rotate(${index*29%240}deg) saturate(.55)`;
        button.append(img,make('span',null,item.name));button.onclick=()=>openPlacement(item.name);box.appendChild(button);
      });
      box.addEventListener('scroll',updateStockIndex,{passive:true});
      updateStockIndex();
    }
    function renderShelf(){
      const box=q('.at-shelf');box.textContent='';q('.at-shelf-count').textContent=`${aphro.cabinet.length} 瓶`;
      if(!aphro.cabinet.length){box.appendChild(make('div','at-empty-shelf','调好的香水会放在这里'));return;}
      aphro.cabinet.forEach(item=>{
        const button=make('button','at-product');button.type='button';button.setAttribute('aria-label',`查看${item.name||'成品香水'}`);
        const img=make('img');img.src=shelfImages[(Number(item.vessel)||0)%shelfImages.length];img.alt='';
        button.append(img,make('strong',null,item.name||cabinetWords(item).join(' + ')),make('small',null,`${cabinetWords(item).length} 味 · 成品`));
        button.onclick=()=>openDetail(item.id);box.appendChild(button);
      });
    }
    function openDetail(id){
      const item=aphro.cabinet.find(row=>row.id===id);if(!item)return;detailId=id;
      q('.at-detail-visual img').src=shelfImages[(Number(item.vessel)||0)%shelfImages.length];q('.at-detail-name').value=item.name||'';
      const savedWords=cabinetWords(item),analysis=formulaEngine(savedWords,item.ratios,item.noteAssignments,item.levels);
      const strengths=normalizeLevels(savedWords,item.levels,item.polarities); const composition=savedWords.map(word=>{const id=INGREDIENT_BY_NAME[word].id; return `${word} ${formatLevel(strengths[id])}`;}).join(' · ');
      q('.at-detail-body').textContent=`成分　${composition}\n评分　稳定 ${analysis.stability} · 张力 ${analysis.profile.aggression} · 柔和 ${analysis.profile.sweetness} · 余韵 ${analysis.profile.longevity}`;
      q('.at-detail-body').style.whiteSpace='pre-line';q('.at-detail').hidden=false;
    }
    function renameDetail(){
      const item=aphro.cabinet.find(row=>row.id===detailId);if(!item)return;
      const next=q('.at-detail-name').value.trim()||cabinetWords(item).join(' + ');
      if(item.name===next)return;
      item.name=next;item.updatedAt=Date.now();saveAphro(aphro);renderShelf();
    }
    function closeDetail(){renameDetail();detailId=null;q('.at-detail').hidden=true;}
    q('.at-detail-close').onclick=closeDetail;q('.at-detail').onclick=e=>{if(e.target===q('.at-detail'))closeDetail();};
    q('.at-detail-name').onchange=renameDetail;
    q('.at-detail-use').onclick=()=>{renameDetail();const p=useFromCabinet(detailId);if(p)sendPotion(p);};
    q('.at-detail-delete').onclick=()=>{const item=aphro.cabinet.find(row=>row.id===detailId);if(item&&confirm(`确定删除「${item.name}」？`)){removeFromCabinet(detailId);if(aphro.editingId===detailId)aphro.editingId=null;closeDetail();renderShelf();}};
    function updateScore(){const a=formulaEngine(words(),aphro.mixRatios,aphro.mixNotes);q('.at-score-values').textContent=`稳定 ${a.stability}　·　张力 ${a.profile.aggression}　·　柔和 ${a.profile.sweetness}`;}
    function renderAnalysis(){
      const a=formulaEngine(words(),aphro.mixRatios,aphro.mixNotes),grid=q('.at-analysis-grid');grid.textContent='';
      [['稳定',a.stability],['张力',a.profile.aggression],['柔和',a.profile.sweetness],['余韵',a.profile.longevity]].forEach(([label,value])=>{const metric=make('div','at-metric');metric.append(make('b',null,String(value)),make('span',null,label));grid.appendChild(metric);});
      q('.at-timeline polyline').setAttribute('points',a.timeline.map((value,i)=>`${5+i*77},${140-value}`).join(' '));
      q('.at-compatibility').textContent=`兼容性：${a.compatibility}`;q('.at-issues').textContent='';a.issues.forEach(issue=>q('.at-issues').appendChild(make('li',null,issue)));
    }
    // 10-23：生效中的那瓶 —— 四条读数 + 清除药效
    function renderLive(){
      const box=q('.at-live');if(!box)return;tickAphro();const p=aphro.active[0];
      if(!p){box.hidden=true;box.textContent='';return;}
      const r=controlReadings(p),left=Math.max(0,Math.ceil((Number(p.expires)-Date.now())/60000));
      box.hidden=false;box.textContent='';
      const head=make('div','at-live-head');head.append(make('b',null,'生效中 · '+(p.name||p.words.join(' + '))),make('small',null,(r.frozen?'冻结':r.stage)+' · 还剩 '+left+' 分钟'));box.appendChild(head);
      const rl=[(r.rounds?`第 ${r.rounds} 轮`:''),r.refLeft?`不应期 · 还有 ${r.refLeft} 分钟又烧上来`:''].filter(Boolean).join('　');if(rl)box.appendChild(make('p','at-live-rounds',rl));
      const tempPct=Math.round((r.temp-TEMP_BASE)/(TEMP_MAX-TEMP_BASE)*100);
      [['理智',r.sanity,r.sanity+'%','#9fb3c8'],['欲望',r.desire,r.desire+'%','#d9a3ad'],['体温',tempPct,r.temp.toFixed(1)+'°C','#e0b38f'],['饥饿感',r.hunger,r.hunger+'%','#b9a0c9']].forEach(([label,pct,txt,color])=>{
        const row=make('div','at-meter'),bar=make('i'),fill=make('em');fill.style.width=Math.max(0,Math.min(100,pct))+'%';fill.style.background=color;bar.appendChild(fill);
        row.append(make('span',null,label),bar,make('span',null,txt));box.appendChild(row);
      });
      const foot=make('div','at-live-foot'),clear=make('button','at-clear','清除药效');clear.type='button';
      clear.onclick=()=>{if(!confirm('清掉这瓶的药效？他下一轮会知道药退了。'))return;clearAll(true);renderLive();};
      foot.append(make('small',null,'他心里有数，但不会说出口'),clear);box.appendChild(foot);
    }
    q('.at-sw-note').hidden=safeword().mode!=='none';
    const instantBox=q('.at-instant-box');instantBox.checked=aphro.instant===true;instantBox.onchange=()=>{aphro.instant=instantBox.checked;saveAphro(aphro);};
    const liveTimer=setInterval(()=>{if(!document.body.contains(overlay)){clearInterval(liveTimer);return;}renderLive();},15000);
    function render(){
      renderLive();
      q('.at-count').textContent=`${words().length} / 2`;q('.at-save').disabled=q('.at-use').disabled=!words().length;
      updateLiquid();updateScore();renderSlots();renderStudio();renderShelf();renderAnalysis();renderReel();
    }
    // 10-23：不再替她发一句「我启用了配方…（作用在他身上…）」再立刻叫他回 ——
    // 改成拍一拍那样的居中灰条「谁 启用了配方「…」」，他等她下一句再接；作用在谁身上只在提示词里说
    function sendPotion(potion){
      saveAphro(aphro);overlay.remove();
      const who=(typeof myDisplayName==='function'?myDisplayName():'')||'我';
      const line=`${who} 启用了配方「${potion.name||potion.words.join(' + ')}」`;
      if(typeof chatPushNotice==='function')chatPushNotice(line);
      if(typeof window.render==='function')window.render();   // 调香室里有自己的 render，这里要的是整页那个
    }
    q('.at-formula-name').value=aphro.draftName||'';q('.at-formula-name').oninput=e=>{aphro.draftName=e.target.value;saveAphro(aphro);};
    q('.at-back').onclick=()=>view==='main'?overlay.remove():setView('main');
    q('.at-jump-shelf').onclick=()=>{setView('main');q('.at-shelf-head').scrollIntoView({behavior:'smooth',block:'start'});};
    q('.at-hero').onclick=()=>setView('studio');q('.at-show-analysis').onclick=q('.at-analysis-button').onclick=()=>setView('analysis');
    q('.at-view-main').onclick=()=>setView('main');q('.at-prev').onclick=()=>rotateStock(-1);q('.at-next').onclick=()=>rotateStock(1);
    q('.at-save').onclick=()=>{if(!words().length)return;q('.at-name-input').value=q('.at-formula-name').value.trim();q('.at-naming').hidden=false;q('.at-name-input').focus();};
    q('.at-name-cancel').onclick=()=>{q('.at-naming').hidden=true;};
    q('.at-naming').onclick=e=>{if(e.target===q('.at-naming'))q('.at-naming').hidden=true;};
    q('.at-name-confirm').onclick=()=>{
      const name=q('.at-name-input').value.trim();if(!name){q('.at-name-input').focus();return;}
      const item=saveToCabinet(words(),name,aphro.mixRatios,aphro.editingId,aphro.mixNotes,aphro.mixLevels);
      if(!item)return;
      aphro.editingId=null;aphro.draftName=item.name;q('.at-formula-name').value=item.name;saveAphro(aphro);
      q('.at-naming').hidden=true;setView('main');q('.at-shelf-head').scrollIntoView({behavior:'smooth',block:'start'});
    };
    q('.at-name-input').onkeydown=e=>{if(e.key==='Enter')q('.at-name-confirm').click();};
    q('.at-use').onclick=()=>{if(!words().length)return;const p=injectPotion(words(),'you',aphro.mixRatios,aphro.mixNotes,aphro.mixLevels);if(p){p.name=q('.at-formula-name').value.trim();sendPotion(p);}};
    overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};render();
  }

  // ── 全局导出 ──────────────────────────────────────────
  window.Aphrodisiac = {
    openMixPanel,
    noteFlow,
    flavorProfile,
    formulaEngine,
    ingredientCatalog: () => INGREDIENTS.map(({id,name,color})=>({id,name,color})),
    injectPotion,
    saveToCabinet,
    useFromCabinet,
    restoreFromCabinet,
    compareCabinet,
    removeFromCabinet,
    getState: () => aphro,
    statusBlock: aphrodisiacStatusPromptBlock,
    isActive,
    clearAll, freezeControl, resumeControl, controlPhase, controlLevel, controlReadings, controlCurve, controlTotalMs,
    consumeReply,
    tick: tickAphro
  };

  if(typeof window !== "undefined"){
    window.aphrodisiacStatusPromptBlock = aphrodisiacStatusPromptBlock;
  }

  console.log("[Aphrodisiac] module loaded");
})();


