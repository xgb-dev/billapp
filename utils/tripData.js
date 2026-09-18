// utils/tripData.js - 旅行小队工作台数据管理与结算算法

const STORAGE_KEY = 'TRIP_ACTIVITIES_V1';

// 预置常用旅行清单模板
const CHECKLIST_TEMPLATES = {
  general: {
    name: '国内出行通用必备',
    items: [
      { id: 't1', category: '证件文件', title: '身份证 / 护照', checked: false, assignee: '所有人' },
      { id: 't2', category: '证件文件', title: '优惠证件 (学生证/军官证)', checked: false, assignee: '自备' },
      { id: 't3', category: '衣物穿搭', title: '换洗衣物 3-4 套', checked: false, assignee: '自备' },
      { id: 't4', category: '衣物穿搭', title: '舒适运动鞋 / 拖鞋', checked: false, assignee: '自备' },
      { id: 't5', category: '衣物穿搭', title: '遮阳帽 / 墨镜', checked: false, assignee: '自备' },
      { id: 't6', category: '洗漱药品', title: '洗发水 / 沐浴露小样', checked: false, assignee: '自备' },
      { id: 't7', category: '洗漱药品', title: '防晒霜 / 护肤品', checked: false, assignee: '自备' },
      { id: 't8', category: '洗漱药品', title: '急救小药箱 (创口贴/感冒胃药)', checked: false, assignee: '领队' },
      { id: 't9', category: '数码配件', title: '手机充电器 / 快充线', checked: false, assignee: '自备' },
      { id: 't10', category: '数码配件', title: '大容量充电宝 (20000mAh)', checked: false, assignee: '自备' },
      { id: 't11', category: '出行必带', title: '折叠晴雨伞', checked: false, assignee: '自备' },
      { id: 't12', category: '出行必带', title: '纸巾 / 湿厕纸 / 消毒湿巾', checked: false, assignee: '公用' }
    ]
  },
  camping: {
    name: '户外露营装备清单',
    items: [
      { id: 'c1', category: '营地装备', title: '双人/多人帐篷 + 防潮垫', checked: false, assignee: '公用' },
      { id: 'c2', category: '营地装备', title: '折叠桌椅套组', checked: false, assignee: '公用' },
      { id: 'c3', category: '营地装备', title: '天幕 / 遮阳伞', checked: false, assignee: '公用' },
      { id: 'c4', category: '餐饮炊事', title: '卡式炉 + 气罐', checked: false, assignee: '公用' },
      { id: 'c5', category: '餐饮炊事', title: '户外锅具套组 / 餐具水杯', checked: false, assignee: '公用' },
      { id: 'c6', category: '餐饮炊事', title: '保温箱 / 冰袋 / 烧烤食材', checked: false, assignee: '领队' },
      { id: 'c7', category: '安全防护', title: '驱蚊液 / 防蚊香丸', checked: false, assignee: '公用' },
      { id: 'c8', category: '安全防护', title: '营地氛围灯 / 强光手电', checked: false, assignee: '公用' },
      { id: 'c9', category: '个人用品', title: '保暖外套 / 睡袋', checked: false, assignee: '自备' }
    ]
  }
};

// 预设默认决策模板（供选择困难症快速发起）
const DEFAULT_DECISIONS = [
  {
    id: 'd1',
    title: '今晚吃什么？',
    type: 'vote', // vote 或 wheel
    options: [
      { id: 'o1', text: '当地特色美食', votes: 1 },
      { id: 'o2', text: '地道火锅/烤肉', votes: 2 },
      { id: 'o3', text: '轻食/简餐小吃', votes: 0 }
    ],
    voters: { '我': 'o2' }
  }
];

let supabase = null;
try {
  supabase = require('./supabase.js');
} catch (e) {
  console.warn('Supabase module not loaded', e);
}

// 生成 6 位大写字母与数字口令（剔除易混淆字符 0, O, 1, I）
function generateInviteCode() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 格式映射
function mapRowToTrip(row) {
  return {
    id: row.id,
    code: row.code || '',
    title: row.title || '旅行小队',
    destination: row.destination || '',
    startDate: row.start_date || row.startDate || '',
    endDate: row.end_date || row.endDate || '',
    members: Array.isArray(row.members) ? row.members : (typeof row.members === 'string' ? JSON.parse(row.members) : ['我']),
    checklist: Array.isArray(row.checklist) ? row.checklist : (typeof row.checklist === 'string' ? JSON.parse(row.checklist) : []),
    expenses: Array.isArray(row.expenses) ? row.expenses : (typeof row.expenses === 'string' ? JSON.parse(row.expenses) : []),
    decisions: Array.isArray(row.decisions) ? row.decisions : (typeof row.decisions === 'string' ? JSON.parse(row.decisions) : []),
    createdAt: row.created_at || row.createdAt || new Date().toISOString()
  };
}

function mapTripToRow(trip) {
  return {
    id: trip.id,
    code: trip.code || '',
    title: trip.title,
    destination: trip.destination,
    start_date: trip.startDate,
    end_date: trip.endDate,
    members: trip.members,
    checklist: trip.checklist,
    expenses: trip.expenses,
    decisions: trip.decisions
  };
}

// 获取所有旅行活动（本地缓存）
function getTrips() {
  const trips = wx.getStorageSync(STORAGE_KEY) || [];
  return trips;
}

// 保存所有活动列表至本地
function saveTrips(trips) {
  wx.setStorageSync(STORAGE_KEY, trips);
}

// 从 Supabase 云端拉取同步最新行程列表
async function syncTripsFromCloud() {
  if (!supabase) return getTrips();
  try {
    const res = await supabase.query('trips', {
      select: '*',
      order: 'created_at',
      desc: true,
      from: 0,
      to: 50
    });
    if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
      const cloudTrips = res.data.map(mapRowToTrip);
      saveTrips(cloudTrips);
      return cloudTrips;
    }
  } catch (err) {
    console.warn('Sync trips from cloud warning:', err);
  }
  return getTrips();
}

// 获取单个活动详情
function getTripById(id) {
  const trips = getTrips();
  return trips.find(t => t.id === id) || null;
}

// 创建新旅行活动（同时写本地和云端）
function createTrip(tripData) {
  const trips = getTrips();
  const newTrip = {
    id: 'trip_' + Date.now(),
    code: tripData.code || generateInviteCode(),
    title: tripData.title || '新旅行小队',
    destination: tripData.destination || '目的地待定',
    startDate: tripData.startDate || '',
    endDate: tripData.endDate || '',
    members: tripData.members && tripData.members.length ? tripData.members : ['我'],
    checklist: tripData.template && CHECKLIST_TEMPLATES[tripData.template] 
      ? JSON.parse(JSON.stringify(CHECKLIST_TEMPLATES[tripData.template].items))
      : JSON.parse(JSON.stringify(CHECKLIST_TEMPLATES.general.items)),
    expenses: [],
    decisions: JSON.parse(JSON.stringify(DEFAULT_DECISIONS)),
    createdAt: new Date().toISOString()
  };
  trips.unshift(newTrip);
  saveTrips(trips);

  // 记录本人为队长创建者
  try {
    const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
    myTripRoles[newTrip.id] = { role: 'creator', name: '我' };
    wx.setStorageSync('MY_TRIP_ROLES', myTripRoles);
  } catch (e) {}

  // 异步上传至 Supabase
  if (supabase) {
    supabase.insert('trips', mapTripToRow(newTrip)).catch(err => {
      console.warn('Supabase insert trips error:', err);
    });
  }

  return newTrip;
}

// 更新活动（同时更新本地和云端）
function updateTrip(updatedTrip) {
  let trips = getTrips();
  trips = trips.map(t => t.id === updatedTrip.id ? updatedTrip : t);
  saveTrips(trips);

  // 异步更新至 Supabase
  if (supabase) {
    supabase.update('trips', mapTripToRow(updatedTrip), [
      { column: 'id', operator: 'eq', value: updatedTrip.id }
    ]).catch(err => {
      console.warn('Supabase update trips error:', err);
    });
  }
}

// 删除活动（同时更新本地和云端）
function deleteTrip(id) {
  let trips = getTrips();
  trips = trips.filter(t => t.id !== id);
  saveTrips(trips);

  // 异步删除云端
  if (supabase && typeof supabase.delete === 'function') {
    supabase.delete('trips', [
      { column: 'id', operator: 'eq', value: id }
    ]).catch(err => {
      console.warn('Supabase delete trip error:', err);
    });
  }
}

// 通过 6 位固定口令码加入旅行小队
async function joinTripByCode(code, memberName) {
  const cleanCode = (code || '').trim().toUpperCase();
  const name = (memberName || '').trim() || '新队友';
  if (!cleanCode) {
    return { success: false, msg: '请输入 6 位小队口令' };
  }

  let targetTrip = null;

  // 1. 优先查云端 Supabase 获取实时小队信息
  if (supabase) {
    try {
      const res = await supabase.query('trips', {
        select: '*',
        filters: [{ column: 'code', operator: 'eq', value: cleanCode }]
      });
      if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
        targetTrip = mapRowToTrip(res.data[0]);
      }
    } catch (e) {
      console.warn('Query trip by code error:', e);
    }
  }

  // 2. 本地备用检索
  if (!targetTrip) {
    const localTrips = getTrips();
    targetTrip = localTrips.find(t => (t.code || '').toUpperCase() === cleanCode);
  }

  if (!targetTrip) {
    return { success: false, msg: '未查找到该口令对应的小队，请核对后重试' };
  }

  // 3. 追加队员名字
  targetTrip.members = targetTrip.members || ['我'];
  if (!targetTrip.members.includes(name)) {
    targetTrip.members.push(name);
  }

  // 4. 保存到本地并同步至云端
  let trips = getTrips();
  const existingIdx = trips.findIndex(t => t.id === targetTrip.id);
  if (existingIdx !== -1) {
    trips[existingIdx] = targetTrip;
  } else {
    trips.unshift(targetTrip);
  }
  saveTrips(trips);

  // 记录该队员角色身份
  try {
    const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
    if (!myTripRoles[targetTrip.id]) {
      myTripRoles[targetTrip.id] = { role: 'member', name };
      wx.setStorageSync('MY_TRIP_ROLES', myTripRoles);
    }
  } catch (e) {}

  // 云端同步更新队员名单
  if (supabase) {
    supabase.update('trips', mapTripToRow(targetTrip), [
      { column: 'id', operator: 'eq', value: targetTrip.id }
    ]).catch(err => {
      console.warn('Supabase join trip update error:', err);
    });
  }

  return { success: true, trip: targetTrip };
}

// 队员主动退出小队
function leaveTrip(tripId, memberName) {
  let trips = getTrips();
  const trip = trips.find(t => t.id === tripId);
  if (trip && memberName) {
    trip.members = (trip.members || []).filter(m => m !== memberName);
    updateTrip(trip);
  }
  // 从本地删除该行程卡片
  trips = trips.filter(t => t.id !== tripId);
  saveTrips(trips);
}

/**
 * AA 清算核心算法：最小转账路径匹配
 * @param {Array} members 成员数组，如 ['我', '小明', '小红']
 * @param {Array} expenses 支出列表，每项形如 { id, title, amount: 300, payer: '我', participants: ['我', '小明', '小红'] }
 */
function calculateAASettlement(members, expenses) {
  const memberList = members || ['我'];
  let totalExpense = 0;

  // 1. 初始化每人的支付与应付净额 (balance: 正数表示他人欠自己，负数表示自己欠他人)
  const paidMap = {};
  const owedMap = {};
  const balanceMap = {};

  memberList.forEach(m => {
    paidMap[m] = 0;
    owedMap[m] = 0;
    balanceMap[m] = 0;
  });

  // 2. 遍历所有消费项目
  (expenses || []).forEach(item => {
    const amt = parseFloat(item.amount) || 0;
    totalExpense += amt;

    // 付款人累加
    if (paidMap[item.payer] !== undefined) {
      paidMap[item.payer] += amt;
    } else {
      paidMap[item.payer] = amt;
      balanceMap[item.payer] = 0;
    }

    // 参与分摊人平摊
    const parts = item.participants && item.participants.length ? item.participants : memberList;
    const splitAmt = amt / parts.length;
    parts.forEach(p => {
      if (owedMap[p] !== undefined) {
        owedMap[p] += splitAmt;
      } else {
        owedMap[p] = splitAmt;
        balanceMap[p] = 0;
      }
    });
  });

  // 3. 计算每人净额 balance = paid - owed
  Object.keys(paidMap).forEach(m => {
    const paid = paidMap[m] || 0;
    const owed = owedMap[m] || 0;
    balanceMap[m] = Math.round((paid - owed) * 100) / 100;
  });

  // 4. 最小转账路径算法（贪心算法：债权人从多到少，债务人从小到大）
  const creditors = []; // 应收钱的人 (balance > 0.01)
  const debtors = [];   // 应还钱的人 (balance < -0.01)

  Object.keys(balanceMap).forEach(m => {
    const bal = balanceMap[m];
    if (bal > 0.01) {
      creditors.push({ name: m, amount: bal });
    } else if (bal < -0.01) {
      debtors.push({ name: m, amount: Math.abs(bal) });
    }
  });

  // 排序
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transferPlans = [];
  let cIdx = 0;
  let dIdx = 0;

  while (cIdx < creditors.length && dIdx < debtors.length) {
    const cred = creditors[cIdx];
    const debt = debtors[dIdx];
    const transferAmt = Math.min(cred.amount, debt.amount);

    if (transferAmt > 0.01) {
      transferPlans.push({
        from: debt.name,
        to: cred.name,
        amount: transferAmt.toFixed(2)
      });
    }

    cred.amount -= transferAmt;
    debt.amount -= transferAmt;

    if (cred.amount <= 0.01) cIdx++;
    if (debt.amount <= 0.01) dIdx++;
  }

  // 5. 格式化成员统计看板
  const memberSummaries = memberList.map(name => {
    const paid = paidMap[name] || 0;
    const owed = owedMap[name] || 0;
    const bal = balanceMap[name] || 0;
    return {
      name,
      paid: paid.toFixed(2),
      owed: owed.toFixed(2),
      balance: bal.toFixed(2),
      isCreditor: bal > 0.01,
      isDebtor: bal < -0.01
    };
  });

  // 6. 生成微信群对账文案
  let groupSummaryText = `📢【旅行小队 AA 结算单】\n`
    + `-------------------------\n`
    + `💰 活动总支出：¥${totalExpense.toFixed(2)}\n`
    + `👥 参与成员：${memberList.join('、')}\n`
    + `-------------------------\n`
    + `📝 极简转账方案：\n`;

  if (transferPlans.length === 0) {
    groupSummaryText += `✅ 大家都已结清，无需转账！\n`;
  } else {
    transferPlans.forEach((plan, idx) => {
      groupSummaryText += `${idx + 1}. ${plan.from} 👉 转给 ${plan.to}：¥${plan.amount}\n`;
    });
  }
  groupSummaryText += `-------------------------\n💡 请各成员核对并及时结算完成~`;

  return {
    totalExpense: totalExpense.toFixed(2),
    memberSummaries,
    transferPlans,
    groupSummaryText
  };
}

module.exports = {
  CHECKLIST_TEMPLATES,
  DEFAULT_DECISIONS,
  getTrips,
  saveTrips,
  getTripById,
  createTrip,
  updateTrip,
  deleteTrip,
  calculateAASettlement,
  syncTripsFromCloud,
  generateInviteCode,
  joinTripByCode,
  leaveTrip
};

