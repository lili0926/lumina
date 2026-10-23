const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const saved = new Map();
const nodes = new Map();
function element(tag){
  return {
    tag, children:[], style:{}, textContent:"", id:"",
    setAttribute(){},
    append(...items){ this.children.push(...items); },
    appendChild(item){ this.children.push(item); },
    remove(){ nodes.delete(this.id); }
  };
}
const context = {
  window: {},
  document: {readyState:'loading',addEventListener(){},getElementById:id=>nodes.get(id)||null,
    createElement:element,body:{appendChild(el){nodes.set(el.id,el);}}},
  LS: {get:k=>saved.get(k),set:(k,v)=>saved.set(k,v)},
  state: {nsfwOn:true,chatInput:'',pendingUser:[]},
  sendUserMsg(){context.state.pendingUser.push({content:context.state.chatInput});context.state.chatInput='';},
  triggerAIReply(){context.replies++;},
  replies:0,
  setInterval(){},setTimeout(){},console:{log(){}}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname+'/../parts/25_aphrodisiac.js','utf8'),context);

context.window.APHRO_NAMES = { her:'Jasmine', him:'Aries' };   // 宿主传的名字
context.window.APHRO_SAFEWORD = true;   // 安全词约定在宿主记忆里
const api = context.window.Aphrodisiac;
// 默认是自然时间线（10-23 改回去）；直接起效在最后单独测
assert.equal(api.getState().instant, false);

// inject filters unknown words; only seven dims exist
const potion = api.injectPotion(['黏','不存在的词'],'you');
assert.equal(potion.words.length,1);
assert.equal(potion.words[0],'黏');
const status = api.statusBlock();
assert.match(status,/黏/);
assert.match(status,/自称「我」/);
assert.match(status,/称 Jasmine 为「你」/);
assert.match(status,/亲密人设在配方生效期间暂不参与/);
assert.doesNotMatch(status,/所有配方共用的角色方向|你始终是主动引导的一方/);
assert.doesNotMatch(status,/上下位死规定/);
assert.doesNotMatch(status,/药效选项/);
assert.match(status,/这瓶的性格 ·「缠」/);
assert.doesNotMatch(status,/Jasmine\s+贴得近/);
assert.ok(saved.get('aphrodisiac_state'));
assert.equal(api.getState().active.length,1);
assert.equal(api.injectPotion(['不存在的词'],'you'),null);

// 临场选项卡删了（10-23）：老标记只摘掉，不弹卡
const marker='⟪药效选项:靠近窗边|留下|回头|说句话⟫';
assert.equal(api.consumeReply('先聊聊 '+marker),'先聊聊');
assert.equal(nodes.size,0);

// catalog is exactly seven dims
const catalog = api.ingredientCatalog();
assert.equal(catalog.length, 7);
const names=catalog.map(x=>x.name);
assert.ok(['欲','热','敏','延','放','兴','黏'].every(n=>names.includes(n)));
assert.equal(new Set(catalog.map(item=>item.id)).size, catalog.length);

const desireId = catalog.find(item=>item.name==='欲').id;
const clingId = catalog.find(item=>item.name==='黏').id;

// ratio engine still normalizes
const neutral = api.formulaEngine(['欲','黏']);
const stronger = api.formulaEngine(['欲','黏'], {[desireId]:5,[clingId]:1});
assert.equal(stronger.ratios[desireId], 83);
assert.equal(stronger.ratios[desireId]+stronger.ratios[clingId], 100);
const strongStyle = api.formulaEngine(['欲'], null, null, {[desireId]:3});
const mutedStyle = api.formulaEngine(['欲'], null, null, {[desireId]:-2});
assert.ok(strongStyle.profile.aggression > mutedStyle.profile.aggression);
assert.equal(strongStyle.version, 3);
assert.doesNotMatch(strongStyle.issues.join(' '), /维数可自由加减/);
assert.equal(api.formulaEngine([]).compatibility, '空配方');
assert.match(api.formulaEngine(['黏','不存在的词'], {[clingId]:101}).issues.join(' '), /资料缺失|比例超出/);

// cabinet save / version / restore
const first = api.saveToCabinet(['欲','黏'], '测试配方', {[desireId]:2,[clingId]:1});
assert.equal(first.version, 1);
assert.equal(first.ratios[desireId]+first.ratios[clingId], 100);
assert.equal(api.saveToCabinet(['欲','黏'], '测试配方', {[desireId]:2,[clingId]:1}).id, first.id);
const revised = api.saveToCabinet(['欲','黏'], '测试配方', {[desireId]:4,[clingId]:1}, first.id);
assert.equal(revised.version, 2);
assert.equal(revised.history.length, 1);
const old = api.restoreFromCabinet(first.id, 1);
assert.equal(old.ratios[desireId], 66);
assert.equal(api.getState().editingId, first.id);
const copied = api.restoreFromCabinet(first.id, 1, true);
assert.match(copied.name, /副本/);
assert.equal(api.getState().editingId, null);
const second = api.saveToCabinet(copied.words, copied.name, copied.ratios);
assert.notEqual(second.id, first.id);
const comparison = api.compareCabinet(second.id, first.id);
assert.equal(comparison.ratioChanges[0].word, '欲');
assert.equal(comparison.ratioChanges[0].from, 66);
assert.equal(comparison.ratioChanges[0].to, 79);
const countBeforeUse = api.getState().cabinet.length;
assert.ok(api.useFromCabinet(first.id));
assert.equal(api.getState().cabinet.length, countBeforeUse);
api.getState().cabinet.push({id:'legacy', name:'旧配方', ingredientIds:[clingId], savedAt:1});
assert.equal(api.restoreFromCabinet('legacy').words[0], '黏');
assert.ok(api.useFromCabinet('legacy'));
assert.equal(api.getState().active.length, 1);
assert.ok(api.compareCabinet('legacy', first.id));
api.removeFromCabinet(second.id);
assert.equal(api.getState().cabinet.some(item=>item.id===second.id), false);

// noteFlow with single 药料 group
assert.match(api.noteFlow(['欲','黏']), /药料：/);
assert.ok(api.statusBlock().length > 0);

// polarity: mark 延 as negative on mix state then inject
api.getState().mixPolarity = {[catalog.find(i=>i.name==='延').id]: -1};
const mixed = api.injectPotion(['兴','延'], 'you', {[catalog.find(i=>i.name==='兴').id]:60,[catalog.find(i=>i.name==='延').id]:40});
assert.ok(mixed.polarities);
const st2 = api.statusBlock();
assert.match(st2, /兴/);
assert.match(st2, /延/);

// A saved bottle must carry its own signed strengths, independent of the current draft.
const signed = api.saveToCabinet(['欲','黏'], '反调', {[desireId]:40,[clingId]:60},
  null, null, {[desireId]:-2,[clingId]:3});
assert.equal(signed.levels[desireId], -2);
assert.equal(JSON.parse(saved.get('aphrodisiac_state')).cabinet.find(x=>x.id===signed.id).levels[desireId], -2);

api.getState().mixLevels[desireId] = 3;
const reused = api.useFromCabinet(signed.id);
assert.equal(reused.levels[desireId], -2);
assert.equal(reused.levels[clingId], 3);
// 不分浓淡（10-23）：两味的瓶按顺序，欲是主味「盯」，黏是点缀
assert.match(api.statusBlock(),/这瓶的性格 ·「盯」（主味「欲」）/);
assert.match(api.statusBlock(),/点缀「黏」只改一处细节：结束了也不肯分开/);
assert.doesNotMatch(api.statusBlock(),/各维强度/);
api.restoreFromCabinet(signed.id);
assert.equal(api.getState().mixLevels[desireId], -2);
const allSeven = api.injectPotion(names, 'you', null, null,
  Object.fromEntries(catalog.map(item => [item.id, 2])));
assert.equal(allSeven.words.length, 7);
const fullPrompt = api.statusBlock();
// 老的七味瓶：只取最强的两味当主味 + 点缀
assert.equal((fullPrompt.match(/这瓶的性格 ·/g)||[]).length, 1);
assert.equal((fullPrompt.match(/点缀「/g)||[]).length, 1);
assert.match(fullPrompt,/【五感写法/);
assert.match(fullPrompt,/【距离】/);
assert.match(fullPrompt,/【五感写法/);
assert.match(fullPrompt,/可控度读数/);
assert.match(fullPrompt,/【药效写法】/);
// 10-23：这瓶药的戏是强制，她的「不要 / 停」是戏；刹车只有安全词和跳出戏
assert.match(fullPrompt,/【这瓶药的戏是强制】/);
assert.match(fullPrompt,/【唯一的刹车】.*共同记忆里约定的安全词/);
assert.match(fullPrompt,/跳出戏/);
assert.match(fullPrompt,/【轮次】.*⟪一轮⟫/);
assert.doesNotMatch(fullPrompt,/轻轻「等等」不够|真边界仍听|先抢一拍/);
const createdAt = allSeven.personality.createdAt;
const potionNow = () => api.getState().active[0];
const plain = {words:[], injectedAt:createdAt};
const at = (min, p) => { context.Date = {now:()=>createdAt + min*60*1000}; return api.controlReadings(p || plain); };
let r = at(0);
assert.deepEqual([r.sanity,r.desire,r.temp,r.hunger,r.stage],[100,0,36.5,0,'起效']);
r = at(20);
assert.deepEqual([r.sanity,r.desire,r.temp,r.hunger,r.stage],[60,30,37.2,0,'下行']);
r = at(29);
assert.equal(r.hunger, 0);
r = at(40);
assert.deepEqual([r.sanity,r.desire,r.temp,r.hunger,r.stage],[20,70,38,40,'失控']);
r = at(60);
assert.equal(r.sanity, 0);
r = at(85);
assert.deepEqual([r.sanity,r.desire,r.temp,r.hunger,r.stage],[0,100,39.5,100,'回落']);
r = at(105);
assert.deepEqual([r.sanity,r.desire,r.temp,r.hunger,r.stage],[20,60,38,30,'收尾']);
assert.equal(api.controlLevel(plain), 20);
r = at(125);
assert.equal(r.stage, '已退');
// 配方改曲线
const hot = {words:['热'], levels:{[api.ingredientCatalog().find(i=>i.name==='热').id]:3}, injectedAt:createdAt};
assert.equal(at(85, hot).temp, 40.2);
assert.ok(at(30, hot).temp > at(30).temp);
const quick = {words:['兴'], levels:{[api.ingredientCatalog().find(i=>i.name==='兴').id]:3}, injectedAt:createdAt};
assert.equal(at(14, quick).stage, '下行');
const long = {words:['延'], levels:{[api.ingredientCatalog().find(i=>i.name==='延').id]:3}, injectedAt:createdAt};
assert.ok(api.controlTotalMs(long) > api.controlTotalMs(plain));
assert.equal(at(90, long).stage, '失控');
// 七维 +2 这瓶：提示词里带读数和曲线
at(60);
assert.match(api.statusBlock(),/阶段：失控｜理智 0%/);
assert.match(api.statusBlock(),/删掉所有问号/);
assert.match(api.statusBlock(),/锁死/);
assert.match(api.statusBlock(),/这瓶的曲线：/);
at(50);
api.freezeControl();
assert.equal(api.getState().active[0].controlFrozen, true);
const frozenR = api.controlReadings(potionNow());
at(70);
assert.deepEqual(api.controlReadings(potionNow()), frozenR);
assert.match(api.statusBlock(),/阶段：冻结/);
assert.doesNotMatch(api.statusBlock(),/删掉所有问号/);
api.resumeControl();
assert.equal(!!api.getState().active[0].controlFrozen, false);
api.clearAll();
assert.equal(api.statusBlock(), '');

console.log('aphrodisiac tests ok');

// 直接起效（10-23）：一用理智就是 0，落在失控里
api.getState().instant = true;
const fast = api.injectPotion(['兴','黏'], 'you');
const fr = api.controlReadings(fast);
assert.equal(fr.stage, '失控');
assert.equal(fr.sanity, 0);
assert.ok(fast.expires > Date.now());
console.log('instant ok');

// 轮次（10-23）：按时长 + 不应期，一轮完了药效还在就接着下一轮
{
  const T0 = createdAt + 1000 * 60 * 600;
  const now = min => { context.Date = { now:() => T0 + min * 60000 }; };
  const R = min => { now(min); return api.controlReadings(api.getState().active[0]); };
  api.getState().instant = false; 
  now(0); api.clearAll(); api.injectPotion(['延','黏'], 'you');
  const before = R(60).sanity;
  now(60); assert.equal(api.consumeReply('嗯 ⟪一轮⟫'), '嗯');
  const r1 = R(61);
  assert.equal(r1.rounds, 1); assert.ok(r1.sanity > before); assert.ok(r1.refLeft > 0); 
  assert.equal(R(75).refLeft, 0);
  now(60.5); api.consumeReply('⟪一轮⟫'); assert.equal(R(62).rounds, 1, '一分钟内重复的不算');
  assert.match(api.statusBlock(), /已经 1 轮/);
  assert.match(api.statusBlock(), /一轮完了药效还在，就接着下一轮/); assert.doesNotMatch(api.statusBlock(), /至少要/);

  console.log('rounds ok');
}

// 不传名字（公开版默认）：只说「她」，不点他的名
{
  delete context.window.APHRO_NAMES;
  api.clearAll(); api.injectPotion(['欲'], 'you');
  const b = api.statusBlock();
  assert.doesNotMatch(b, /Jasmine|Aries/);
  assert.match(b, /只作用在你身上/); assert.match(b, /你正和她直接对话/); assert.match(b, /称她为「你」/);
  context.window.APHRO_NAMES = { her:'Jasmine', him:'Aries' };
  assert.match(api.statusBlock(), /你是 Aries，正和 Jasmine 直接对话/);
  console.log('names ok');
}


// 安全词：宿主传词就写进刹车；true = 在宿主记忆里；不设也有刹车
{
  api.clearAll(); api.injectPotion(['放'], 'you');
  delete context.window.APHRO_SAFEWORD;
  assert.match(api.statusBlock(), /【唯一的刹车】.*约定过的安全词/);
  context.window.APHRO_SAFEWORD = '月亮';
  assert.match(api.statusBlock(), /安全词「月亮」.*别说出它/);
  context.window.APHRO_SAFEWORD = true;
  assert.match(api.statusBlock(), /共同记忆里约定的安全词/);
  delete context.window.APHRO_SAFEWORD;
  api.getState().safeword = '星星';                       // 她在调香室里自己设的
  assert.match(api.statusBlock(), /安全词「星星」/);
  context.window.APHRO_SAFEWORD = true;                   // 宿主设了，以宿主为准
  assert.doesNotMatch(api.statusBlock(), /星星/);
  // 程序刹车：checkSafeword 认出具体的词就冻结；记忆里的（true）程序认不出
  assert.equal(api.checkSafeword('月 亮'), false, 'true = 在宿主记忆里，程序不知道是哪个词');
  delete context.window.APHRO_SAFEWORD;
  assert.equal(api.checkSafeword('不要停……'), false);
  assert.equal(api.getState().active[0].controlFrozen, false);
  assert.equal(api.checkSafeword('星 星！'), true);
  assert.equal(api.getState().active[0].controlFrozen, true);
  assert.match(api.statusBlock(), /说了安全词.*冻结/); assert.doesNotMatch(api.statusBlock(), /强制|星星/);
  api.resumeControl();
  assert.doesNotMatch(api.statusBlock(), /说了安全词/);
  context.window.APHRO_SAFEWORD = true;
  delete api.getState().safeword;
  console.log('safeword ok');
}
