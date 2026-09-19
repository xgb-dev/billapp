// 获取当前微信用户的 openid 辅助函数
function getUserOpenid(fallbackOid) {
  if (fallbackOid && typeof fallbackOid === 'string' && fallbackOid.trim()) {
    return fallbackOid.trim();
  }
  try {
    const app = getApp();
    if (app && app.globalData) {
      if (app.globalData.openid) return app.globalData.openid;
      if (app.globalData.userInfo && app.globalData.userInfo.openid) return app.globalData.userInfo.openid;
    }
    const cached = wx.getStorageSync('userInfo');
    if (cached && cached.openid) return cached.openid;
  } catch (e) {}
  return '';
}

// utils/tripData.js - 旅行小队工作台数据管理与结算算法

// 彻底废弃本地行程持久化缓存，直接以 Supabase 云端数据库为单一可信源
try {
  wx.removeStorageSync('TRIP_ACTIVITIES_V1');
} catch (e) {}


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

// 预设通用决策模板（供选择困难症快速发起，通用不删除）
const DEFAULT_DECISIONS = [
  {
    id: 'd_eat',
    title: '今晚吃什么？',
    type: 'vote',
    isPreset: true,
    options: [
      { id: 'o_eat_1', text: '当地特色地道菜', votes: 0 },
      { id: 'o_eat_2', text: '热气腾腾火锅/烤肉', votes: 0 },
      { id: 'o_eat_3', text: '夜市小吃街/大排档', votes: 0 },
      { id: 'o_eat_4', text: '轻松简餐/披萨汉堡', votes: 0 }
    ],
    voters: {}
  },
  {
    id: 'd_traffic',
    title: '出行交通怎么选？',
    type: 'vote',
    isPreset: true,
    options: [
      { id: 'o_tr_1', text: '网约车/打车同行', votes: 0 },
      { id: 'o_tr_2', text: '地铁/公交低碳游', votes: 0 },
      { id: 'o_tr_3', text: '租车自驾兜风', votes: 0 },
      { id: 'o_tr_4', text: '骑行/Citywalk漫步', votes: 0 }
    ],
    voters: {}
  },
  {
    id: 'd_play',
    title: '下午去哪儿玩？',
    type: 'vote',
    isPreset: true,
    options: [
      { id: 'o_pl_1', text: '核心必去景区打卡', votes: 0 },
      { id: 'o_pl_2', text: '博物馆/艺术展览', votes: 0 },
      { id: 'o_pl_3', text: '咖啡厅/茶室惬意闲聊', votes: 0 },
      { id: 'o_pl_4', text: '城市公园/自然景区放空', votes: 0 }
    ],
    voters: {}
  },
  {
    id: 'd_tea',
    title: '今天谁请喝奶茶？',
    type: 'wheel',
    isPreset: true,
    options: [
      { id: 'o_tea_1', text: '剪刀石头布输家', votes: 0 },
      { id: 'o_tea_2', text: '今天最晚起床的人', votes: 0 },
      { id: 'o_tea_3', text: '队长霸气买单', votes: 0 },
      { id: 'o_tea_4', text: '摇骰子点数最小者', votes: 0 }
    ],
    voters: {}
  },
  {
    id: 'd_fun',
    title: '晚上聚会玩什么？',
    type: 'vote',
    isPreset: true,
    options: [
      { id: 'o_fun_1', text: '剧本杀 / 狼人杀', votes: 0 },
      { id: 'o_fun_2', text: '桌游纸牌 / 掼蛋', votes: 0 },
      { id: 'o_fun_3', text: 'KTV / 音乐清吧', votes: 0 },
      { id: 'o_fun_4', text: '夜景观光 / 散步吹风', votes: 0 }
    ],
    voters: {}
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
  let decisions = Array.isArray(row.decisions) ? row.decisions : (typeof row.decisions === 'string' ? JSON.parse(row.decisions) : []);
  let settledTransfers = [];
  const sysSettlement = decisions.find(d => d && d.id === '__sys_settlements__');
  if (sysSettlement && Array.isArray(sysSettlement.settledTransfers)) {
    settledTransfers = sysSettlement.settledTransfers;
  }
  decisions = decisions.filter(d => d && d.id !== '__sys_settlements__');

  // 解析已退出成员记录
  let leftMembers = [];
  const sysLeft = decisions.find(d => d && d.id === '__sys_left_members__');
  if (sysLeft && Array.isArray(sysLeft.leftMembers)) {
    leftMembers = sysLeft.leftMembers;
  }
  decisions = decisions.filter(d => d && d.id !== '__sys_left_members__');

  // 解析行程状态元数据
  let tripStatus = 'ongoing';
  let finishedAt = '';
  const sysMeta = decisions.find(d => d && d.id === '__sys_trip_meta__');
  if (sysMeta) {
    if (sysMeta.status) tripStatus = sysMeta.status;
    if (sysMeta.finishedAt) finishedAt = sysMeta.finishedAt;
  }
  decisions = decisions.filter(d => d && d.id !== '__sys_trip_meta__');

  // 确保通用预设决策存在且不丢失
  if (!Array.isArray(decisions) || decisions.length === 0) {
    decisions = JSON.parse(JSON.stringify(DEFAULT_DECISIONS));
  } else {
    DEFAULT_DECISIONS.forEach(preset => {
      if (!decisions.some(d => d.id === preset.id || d.title === preset.title)) {
        decisions.push(JSON.parse(JSON.stringify(preset)));
      }
    });
  }

  let memberOpenids = [];
  if (Array.isArray(row.member_openids)) {
    memberOpenids = row.member_openids;
  } else if (typeof row.member_openids === 'string') {
    try {
      memberOpenids = JSON.parse(row.member_openids);
    } catch (e) {}
  }

  return {
    id: row.id,
    trash: (row.trash !== undefined && row.trash !== null) ? Number(row.trash) : 0,
    _openid: row._openid || '',
    memberOpenids: memberOpenids,
    code: row.code || '',
    title: row.title || '旅行小队',
    destination: row.destination || '',
    startDate: row.start_date || row.startDate || '',
    endDate: row.end_date || row.endDate || '',
    members: Array.isArray(row.members) && row.members.length ? row.members : (typeof row.members === 'string' ? JSON.parse(row.members) : ['队长']),
    leftMembers: leftMembers,
    checklist: Array.isArray(row.checklist) ? row.checklist : (typeof row.checklist === 'string' ? JSON.parse(row.checklist) : []),
    expenses: Array.isArray(row.expenses) ? row.expenses : (typeof row.expenses === 'string' ? JSON.parse(row.expenses) : []),
    decisions: decisions,
    settledTransfers: settledTransfers,
    status: tripStatus,
    finishedAt: finishedAt,
    createdAt: row.created_at || row.createdAt || new Date().toISOString()
  };
}

function mapTripToRow(trip, isExiting = false) {
  const decisions = Array.isArray(trip.decisions) ? [...trip.decisions] : [];
  
  // 结清记录节点
  const sysIdx = decisions.findIndex(d => d && d.id === '__sys_settlements__');
  const settlementItem = {
    id: '__sys_settlements__',
    type: 'system',
    settledTransfers: trip.settledTransfers || []
  };
  if (sysIdx !== -1) {
    decisions[sysIdx] = settlementItem;
  } else {
    decisions.push(settlementItem);
  }

  // 已退出成员记录节点
  const leftIdx = decisions.findIndex(d => d && d.id === '__sys_left_members__');
  const leftItem = {
    id: '__sys_left_members__',
    type: 'system',
    leftMembers: trip.leftMembers || []
  };
  if (leftIdx !== -1) {
    decisions[leftIdx] = leftItem;
  } else {
    decisions.push(leftItem);
  }

  // 行程元数据节点（持久化行程生命周期状态与结束时间）
  const metaIdx = decisions.findIndex(d => d && d.id === '__sys_trip_meta__');
  const metaItem = {
    id: '__sys_trip_meta__',
    type: 'system',
    status: trip.status || 'ongoing',
    finishedAt: trip.finishedAt || ''
  };
  if (metaIdx !== -1) {
    decisions[metaIdx] = metaItem;
  } else {
    decisions.push(metaItem);
  }

  const myOid = getUserOpenid();
  let memberOpenids = Array.isArray(trip.memberOpenids) ? [...trip.memberOpenids] : [];

  if (isExiting && myOid) {
    // 退出小队：明确从云端 member_openids 剔除当前用户的 openid
    memberOpenids = memberOpenids.filter(oid => oid !== myOid);
  } else if (myOid && !memberOpenids.includes(myOid)) {
    // 只有在未退出的情况下才将自己的 openid 加入
    const isExited = Array.isArray(trip.leftMembers) && trip.leftMembers.some(m => m && m.openid === myOid);
    if (!isExited) {
      memberOpenids.push(myOid);
    }
  }

  return {
    id: trip.id,
    trash: Number(trip.trash || 0),
    _openid: trip._openid || myOid || null,
    member_openids: memberOpenids,
    code: trip.code || '',
    title: trip.title,
    destination: trip.destination,
    start_date: trip.startDate,
    end_date: trip.endDate,
    members: trip.members,
    checklist: trip.checklist,
    expenses: trip.expenses,
    decisions: decisions
  };
}

// 本地缓存已彻底废弃，返回空列表以兼容残留调用
function getTrips() {
  return [];
}

// 本地存储已废弃，直接与 Supabase 云端为单一事实源
function saveTrips() {}

// 从 Supabase 云端获取属于当前用户的行程列表（实时直读数据库，无本地缓存偏离）
async function fetchUserTripsFromCloud(userOpenid) {
  const currentOid = getUserOpenid(userOpenid);
  const leftTripIds = wx.getStorageSync('MY_LEFT_TRIP_IDS') || [];
  let myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};

  if (!supabase) return [];

  const tripMap = new Map();

  try {
    // 1. 如果有当前用户的 openid，直接从云端查询属于该用户的所有行程（创建者 + 参与者，排除软删除）
    if (currentOid) {
      // (1) 查询我创建的小队
      const resCreated = await supabase.query('trips', {
        select: '*',
        to: 1000,
        filters: [
          { column: '_openid', operator: 'eq', value: currentOid }
        ]
      });
      if (resCreated && resCreated.data && Array.isArray(resCreated.data)) {
        resCreated.data.forEach(row => {
          if (Number(row.trash || 0) !== 1 && !leftTripIds.includes(row.id)) {
            const trip = mapRowToTrip(row);
            tripMap.set(trip.id, trip);
            if (!myTripRoles[trip.id]) {
              myTripRoles[trip.id] = { role: 'creator', name: (trip.members && trip.members[0]) || '队长' };
            }
          }
        });
      }

      // (2) 查询我以成员身份加入过的小队 (PostgREST cs 包含操作符)
      const resJoined = await supabase.query('trips', {
        select: '*',
        to: 1000,
        filters: [
          { column: 'member_openids', operator: 'cs', value: JSON.stringify([currentOid]) }
        ]
      });
      if (resJoined && resJoined.data && Array.isArray(resJoined.data)) {
        resJoined.data.forEach(row => {
          if (Number(row.trash || 0) !== 1 && !leftTripIds.includes(row.id)) {
            const trip = mapRowToTrip(row);
            const isExited = Array.isArray(trip.leftMembers) && trip.leftMembers.some(m => m && m.openid === currentOid);
            if (!isExited) {
              tripMap.set(trip.id, trip);
              if (!myTripRoles[trip.id]) {
                myTripRoles[trip.id] = { role: 'member', name: (trip.members && trip.members[1]) || '队员' };
              }
            }
          }
        });
      }

      try {
        wx.setStorageSync('MY_TRIP_ROLES', myTripRoles);
      } catch (e) {}
    }

    // 2. 对通过口令加入但尚未绑定 openid 的小队进行补全查询
    const roleTripIds = Object.keys(myTripRoles);
    for (const id of roleTripIds) {
      if (tripMap.has(id) || leftTripIds.includes(id)) continue;
      try {
        const res = await supabase.query('trips', {
          select: '*',
          filters: [
            { column: 'id', operator: 'eq', value: id }
          ]
        });
        if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
          const row = res.data[0];
          if (Number(row.trash || 0) !== 1) {
            const cloudTrip = mapRowToTrip(row);
            const isExited = Array.isArray(cloudTrip.leftMembers) && cloudTrip.leftMembers.some(m => m && (m.openid === currentOid || m.name === myTripRoles[id]?.name));
            if (!isExited) {
              tripMap.set(id, cloudTrip);
              if (currentOid && !cloudTrip.memberOpenids.includes(currentOid)) {
                cloudTrip.memberOpenids.push(currentOid);
                supabase.update('trips', mapTripToRow(cloudTrip), [
                  { column: 'id', operator: 'eq', value: id }
                ]).catch(() => {});
              }
            }
          }
        }
      } catch (e) {}
    }

    const mergedTrips = Array.from(tripMap.values()).filter(t => t && Number(t.trash || 0) !== 1 && !leftTripIds.includes(t.id));
    // 按创建时间倒序排
    mergedTrips.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return mergedTrips;
  } catch (err) {
    console.warn('Fetch user trips from cloud error:', err);
    return [];
  }
}

// 兼容别名：直接拉取云端数据
async function syncTripsFromCloud(userOpenid) {
  return await fetchUserTripsFromCloud(userOpenid);
}

// 获取单个活动详情（异步直查 Supabase 云端）
async function getTripById(id) {
  return await fetchTripByIdFromCloud(id);
}

// 创建新旅行活动（直接写入 Supabase 云端数据库）
async function createTrip(tripData) {
  const myOid = getUserOpenid();
  const creatorName = (tripData.members && tripData.members[0] && tripData.members[0].trim()) ? tripData.members[0].trim() : (tripData.creatorName || '队长');
  const memberList = Array.isArray(tripData.members) && tripData.members.length > 0 ? [...tripData.members] : ['队长'];
  memberList[0] = creatorName;

  const newTrip = {
    id: 'trip_' + Date.now(),
    trash: 0,
    _openid: myOid || '',
    memberOpenids: myOid ? [myOid] : [],
    code: tripData.code || generateInviteCode(),
    title: tripData.title || '新旅行小队',
    destination: tripData.destination || '目的地待定',
    startDate: tripData.startDate || '',
    endDate: tripData.endDate || '',
    members: memberList,
    checklist: tripData.template && CHECKLIST_TEMPLATES[tripData.template] 
      ? JSON.parse(JSON.stringify(CHECKLIST_TEMPLATES[tripData.template].items))
      : JSON.parse(JSON.stringify(CHECKLIST_TEMPLATES.general.items)),
    expenses: [],
    decisions: JSON.parse(JSON.stringify(DEFAULT_DECISIONS)),
    status: 'ongoing',
    finishedAt: '',
    createdAt: new Date().toISOString()
  };

  // 记录本人为队长创建者
  try {
    const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
    myTripRoles[newTrip.id] = { role: 'creator', name: creatorName };
    wx.setStorageSync('MY_TRIP_ROLES', myTripRoles);
  } catch (e) {}

  // 直接写入 Supabase 云端
  if (supabase) {
    try {
      await supabase.insert('trips', mapTripToRow(newTrip));
    } catch (err) {
      console.warn('Supabase insert trips error:', err);
    }
  }

  return newTrip;
}

// 更新活动（直接 await 更新至 Supabase 云端数据库）
async function updateTrip(updatedTrip) {
  if (!updatedTrip || !updatedTrip.id) return false;

  if (supabase) {
    try {
      await supabase.update('trips', mapTripToRow(updatedTrip), [
        { column: 'id', operator: 'eq', value: updatedTrip.id }
      ]);
      return true;
    } catch (err) {
      console.warn('Supabase update trips error:', err);
      return false;
    }
  }
  return false;
}

// 删除活动（逻辑软删除 trash = 1，直接更新云端数据库）
async function deleteTrip(id) {
  try {
    const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
    delete myTripRoles[id];
    wx.setStorageSync('MY_TRIP_ROLES', myTripRoles);
  } catch (e) {}

  if (supabase) {
    try {
      await supabase.update('trips', { trash: 1 }, [
        { column: 'id', operator: 'eq', value: id }
      ]);
      return true;
    } catch (err) {
      console.warn('Supabase deleteTrip error:', err);
      return false;
    }
  }
  return false;
}

// 仅通过 6 位口令查询小队信息（进入前预览小队与已有成员）
async function queryTripByCode(code) {
  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode) {
    return { success: false, msg: '请输入 6 位小队口令' };
  }

  let targetTrip = null;

  // 1. 优先查云端 Supabase 获取实时小队信息（过滤已删除 trash=1）
  if (supabase) {
    try {
      const res = await supabase.query('trips', {
        select: '*',
        filters: [
          { column: 'code', operator: 'eq', value: cleanCode },
          { column: 'trash', operator: 'neq', value: 1 }
        ]
      });
      if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
        if (Number(res.data[0].trash || 0) !== 1) {
          targetTrip = mapRowToTrip(res.data[0]);
        }
      }
    } catch (e) {
      console.warn('Query trip by code error:', e);
    }
  }

  if (!targetTrip) {
    return { success: false, msg: '未查找到该口令对应的小队，请核对后重试' };
  }

  return {
    success: true,
    trip: {
      id: targetTrip.id,
      title: targetTrip.title,
      destination: targetTrip.destination,
      startDate: targetTrip.startDate,
      endDate: targetTrip.endDate,
      members: (targetTrip.members && targetTrip.members.length ? targetTrip.members : ['队长']).map(m => m === '我' ? '队长' : m),
      code: targetTrip.code,
      _openid: targetTrip._openid || '',
      memberOpenids: targetTrip.memberOpenids || []
    }
  };
}

// 认领已有成员身份进入小队（直接更新 Supabase 云端数据库）
async function claimTripMember(tripId, memberName) {
  const targetTrip = await fetchTripByIdFromCloud(tripId);
  if (!targetTrip) {
    return { success: false, msg: '未查找到该小队信息' };
  }

  // 1. 将当前设备角色身份写入 MY_TRIP_ROLES
  const isLeader = (targetTrip.members[0] === memberName);
  try {
    const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
    myTripRoles[targetTrip.id] = {
      role: isLeader ? 'creator' : 'member',
      name: memberName
    };
    wx.setStorageSync('MY_TRIP_ROLES', myTripRoles);
  } catch (e) {}

  // 2. 解除本地退出标记与云端 leftMembers
  try {
    let leftTripIds = wx.getStorageSync('MY_LEFT_TRIP_IDS') || [];
    if (leftTripIds.includes(targetTrip.id)) {
      leftTripIds = leftTripIds.filter(id => id !== targetTrip.id);
      wx.setStorageSync('MY_LEFT_TRIP_IDS', leftTripIds);
    }
  } catch (e) {}

  const myOid = getUserOpenid();
  if (Array.isArray(targetTrip.leftMembers)) {
    targetTrip.leftMembers = targetTrip.leftMembers.filter(m => m.name !== memberName && m.openid !== myOid);
  }

  // 3. 绑定当前用户的 openid 到云端 member_openids
  if (myOid) {
    targetTrip.memberOpenids = targetTrip.memberOpenids || [];
    if (!targetTrip.memberOpenids.includes(myOid)) {
      targetTrip.memberOpenids.push(myOid);
    }
  }

  if (supabase) {
    try {
      await supabase.update('trips', mapTripToRow(targetTrip), [
        { column: 'id', operator: 'eq', value: targetTrip.id }
      ]);
    } catch (e) {
      console.warn('Sync member_openids error:', e);
    }
  }

  return { success: true, trip: targetTrip };
}

// 通过 6 位固定口令码加入旅行小队（新成员，直接更新 Supabase 云端数据库）
async function joinTripByCode(code, memberName) {
  const cleanCode = (code || '').trim().toUpperCase();
  const name = (memberName || '').trim() || '新队友';
  if (!cleanCode) {
    return { success: false, msg: '请输入 6 位小队口令' };
  }

  let targetTrip = null;

  if (supabase) {
    try {
      const res = await supabase.query('trips', {
        select: '*',
        filters: [
          { column: 'code', operator: 'eq', value: cleanCode }
        ]
      });
      if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
        if (Number(res.data[0].trash || 0) !== 1) {
          targetTrip = mapRowToTrip(res.data[0]);
        }
      }
    } catch (e) {
      console.warn('Query trip by code error:', e);
    }
  }

  if (!targetTrip) {
    return { success: false, msg: '未查找到该口令对应的小队，请核对后重试' };
  }

  // 追加队员名字
  targetTrip.members = targetTrip.members || ['队长'];
  if (!targetTrip.members.includes(name)) {
    targetTrip.members.push(name);
  }

  // 记录该队员在当前设备的角色身份
  try {
    const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
    myTripRoles[targetTrip.id] = { role: 'member', name };
    wx.setStorageSync('MY_TRIP_ROLES', myTripRoles);
  } catch (e) {}

  // 解除退出标记
  try {
    let leftTripIds = wx.getStorageSync('MY_LEFT_TRIP_IDS') || [];
    if (leftTripIds.includes(targetTrip.id)) {
      leftTripIds = leftTripIds.filter(id => id !== targetTrip.id);
      wx.setStorageSync('MY_LEFT_TRIP_IDS', leftTripIds);
    }
  } catch (e) {}

  const myOid = getUserOpenid();
  if (Array.isArray(targetTrip.leftMembers)) {
    targetTrip.leftMembers = targetTrip.leftMembers.filter(m => m.name !== name && m.openid !== myOid);
  }

  if (myOid) {
    targetTrip.memberOpenids = targetTrip.memberOpenids || [];
    if (!targetTrip.memberOpenids.includes(myOid)) {
      targetTrip.memberOpenids.push(myOid);
    }
  }

  // 云端同步更新队员名单
  if (supabase) {
    try {
      await supabase.update('trips', mapTripToRow(targetTrip), [
        { column: 'id', operator: 'eq', value: targetTrip.id }
      ]);
    } catch (err) {
      console.warn('Supabase join trip update error:', err);
    }
  }

  return { success: true, trip: targetTrip };
}

// 队员主动退出小队（直接更新 Supabase 云端数据库）
async function leaveTrip(tripId, memberName) {
  const myOid = getUserOpenid();
  const trip = await fetchTripByIdFromCloud(tripId);

  // 1. 记录本地“已退队黑名单”
  try {
    const leftTripIds = wx.getStorageSync('MY_LEFT_TRIP_IDS') || [];
    if (!leftTripIds.includes(tripId)) {
      leftTripIds.push(tripId);
      wx.setStorageSync('MY_LEFT_TRIP_IDS', leftTripIds);
    }
  } catch (e) {}

  // 2. 清除该行程对应的本地角色映射
  try {
    const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
    delete myTripRoles[tripId];
    wx.setStorageSync('MY_TRIP_ROLES', myTripRoles);
  } catch (e) {}

  // 3. 数据层修改：剔除在队成员、增加已退队标志记录 leftMembers、从云端 member_openids 剔除 openid
  if (trip && memberName) {
    trip.members = (trip.members || []).filter(m => m !== memberName);
    trip.leftMembers = trip.leftMembers || [];
    const now = new Date();
    const timeStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    if (!trip.leftMembers.some(m => m.name === memberName)) {
      trip.leftMembers.push({
        name: memberName,
        openid: myOid || '',
        leftAt: timeStr
      });
    }

    if (Array.isArray(trip.checklist)) {
      trip.checklist.forEach(item => {
        if (item.assignee === memberName) {
          item.assignee = '所有人';
        }
      });
    }

    if (myOid) {
      trip.memberOpenids = (trip.memberOpenids || []).filter(oid => oid !== myOid);
    }

    if (supabase) {
      try {
        await supabase.update('trips', mapTripToRow(trip, true), [
          { column: 'id', operator: 'eq', value: trip.id }
        ]);
      } catch (err) {
        console.warn('Supabase leaveTrip update error:', err);
      }
    }
  }
}


/**
 * AA 清算核心算法：最小转账路径匹配（全面兼容离队成员与转账结清状态）
 * @param {Array} members 成员数组，如 ['我', '小明', '小红']
 * @param {Array} expenses 支出列表，每项形如 { id, title, amount: 300, payer: '我', participants: ['我', '小明', '小红'] }
 * @param {Array} settledTransfers 已结清的转账记录列表
 */
function calculateAASettlement(members, expenses, settledTransfers = []) {
  const memberList = (members && members.length) ? members : ['我'];
  let totalExpense = 0;

  // 1. 收集所有相关人员（当前在队成员 + 历史账单付款人 + 历史账单参与人）
  const allInvolved = [...new Set([
    ...memberList,
    ...(expenses || []).map(e => e.payer).filter(Boolean),
    ...(expenses || []).flatMap(e => e.participants || []).filter(Boolean)
  ])];

  // 2. 初始化每人的支付与应付净额 (balance: 正数表示他人欠自己，负数表示自己欠他人)
  const paidMap = {};
  const owedMap = {};
  const balanceMap = {};

  allInvolved.forEach(m => {
    paidMap[m] = 0;
    owedMap[m] = 0;
    balanceMap[m] = 0;
  });

  // 3. 遍历所有消费项目
  (expenses || []).forEach(item => {
    const amt = parseFloat(item.amount) || 0;
    totalExpense += amt;

    // 付款人累加
    const payer = item.payer || '我';
    if (paidMap[payer] !== undefined) {
      paidMap[payer] += amt;
    } else {
      paidMap[payer] = amt;
      owedMap[payer] = 0;
      balanceMap[payer] = 0;
    }

    // 参与分摊人平摊
    const parts = (item.participants && item.participants.length) ? item.participants : memberList;
    const splitAmt = amt / parts.length;
    parts.forEach(p => {
      if (owedMap[p] !== undefined) {
        owedMap[p] += splitAmt;
      } else {
        owedMap[p] = splitAmt;
        paidMap[p] = paidMap[p] || 0;
        balanceMap[p] = 0;
      }
    });
  });

  // 4. 计算每人净额 balance = paid - owed
  Object.keys(paidMap).forEach(m => {
    const paid = paidMap[m] || 0;
    const owed = owedMap[m] || 0;
    balanceMap[m] = Math.round((paid - owed) * 100) / 100;
  });

  // 5. 最小转账路径算法（贪心算法：债权人从多到少，债务人从小到大）
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
      const fromName = memberList.includes(debt.name) ? debt.name : `${debt.name}(已离队)`;
      const toName = memberList.includes(cred.name) ? cred.name : `${cred.name}(已离队)`;
      const amtStr = transferAmt.toFixed(2);
      const planId = `${debt.name}->${cred.name}:${amtStr}`;

      const settledRecord = (settledTransfers || []).find(
        s => s.id === planId || (s.from === debt.name && s.to === cred.name && s.amount === amtStr)
      );
      const isSettled = !!settledRecord;

      transferPlans.push({
        id: planId,
        from: fromName,
        rawFrom: debt.name,
        to: toName,
        rawTo: cred.name,
        amount: amtStr,
        isSettled,
        settledAt: settledRecord ? settledRecord.settledAt : '',
        settledBy: settledRecord ? settledRecord.settledBy : ''
      });
    }

    cred.amount -= transferAmt;
    debt.amount -= transferAmt;

    if (cred.amount <= 0.01) cIdx++;
    if (debt.amount <= 0.01) dIdx++;
  }

  // 统计结清与待结情况
  let totalSettledAmount = 0;
  let totalPendingAmount = 0;
  let settledCount = 0;
  let pendingCount = 0;

  transferPlans.forEach(p => {
    const val = parseFloat(p.amount) || 0;
    if (p.isSettled) {
      totalSettledAmount += val;
      settledCount++;
    } else {
      totalPendingAmount += val;
      pendingCount++;
    }
  });

  const isAllSettled = transferPlans.length > 0 && pendingCount === 0;

  // 6. 格式化成员统计看板：包含未结转账净额计算
  const memberSummaries = allInvolved.map(name => {
    const paid = paidMap[name] || 0;
    const owed = owedMap[name] || 0;
    const bal = balanceMap[name] || 0;
    const isLeft = !memberList.includes(name);

    // 计算当前成员仍未结清的待付与待收
    const pendingDebt = transferPlans
      .filter(p => p.rawFrom === name && !p.isSettled)
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const pendingCredit = transferPlans
      .filter(p => p.rawTo === name && !p.isSettled)
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);

    const isSettledUp = (pendingDebt <= 0.01 && pendingCredit <= 0.01);

    return {
      name: isLeft ? `${name} (已离队)` : name,
      rawName: name,
      isLeft,
      paid: paid.toFixed(2),
      owed: owed.toFixed(2),
      balance: bal.toFixed(2),
      pendingDebt: pendingDebt.toFixed(2),
      pendingCredit: pendingCredit.toFixed(2),
      isSettledUp,
      isCreditor: bal > 0.01,
      isDebtor: bal < -0.01
    };
  }).filter(item => !item.isLeft || Math.abs(parseFloat(item.balance)) > 0.01 || parseFloat(item.paid) > 0);

  // 7. 生成微信群对账文案
  let groupSummaryText = `📢【旅行小队 AA 结算单】\n`
    + `-------------------------\n`
    + `💰 活动总支出：¥${totalExpense.toFixed(2)}\n`
    + `👥 现役小队成员：${memberList.join('、')}\n`
    + `-------------------------\n`
    + `📝 清算转账方案与结清状态：\n`;

  if (transferPlans.length === 0) {
    groupSummaryText += `✅ 大家都已结清，无需额外转账！\n`;
  } else {
    transferPlans.forEach((plan, idx) => {
      const tag = plan.isSettled ? `[已结清 ✓]` : `[待转账 ⏳]`;
      groupSummaryText += `${idx + 1}. ${tag} ${plan.from} 👉 转给 ${plan.to}：¥${plan.amount}\n`;
    });
    if (isAllSettled) {
      groupSummaryText += `-------------------------\n🎉 本期小队所有账目均已平账结清！\n`;
    } else {
      groupSummaryText += `-------------------------\n💡 待转金额合计：¥${totalPendingAmount.toFixed(2)}，请各成员及时转账并确认~`;
    }
  }

  return {
    totalExpense: totalExpense.toFixed(2),
    totalSettledAmount: totalSettledAmount.toFixed(2),
    totalPendingAmount: totalPendingAmount.toFixed(2),
    settledCount,
    pendingCount,
    isAllSettled,
    memberSummaries,
    transferPlans,
    groupSummaryText
  };
}

// 切换单个转账方案的结清/未结状态（直接更新 Supabase 云端数据库）
async function toggleSettledTransfer(tripId, planId, operatorName) {
  const trip = await fetchTripByIdFromCloud(tripId);
  if (!trip) return { success: false, msg: '未找到该行程' };

  trip.settledTransfers = trip.settledTransfers || [];
  const existingIdx = trip.settledTransfers.findIndex(s => s.id === planId);

  let isSettled = false;
  if (existingIdx !== -1) {
    // 撤销结清
    trip.settledTransfers.splice(existingIdx, 1);
    isSettled = false;
  } else {
    // 标记已结
    const now = new Date();
    const timeStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    trip.settledTransfers.push({
      id: planId,
      settledAt: timeStr,
      settledBy: operatorName || '我'
    });
    isSettled = true;
  }

  await updateTrip(trip);
  return { success: true, isSettled, trip };
}

// 一键全部标记结清（直接更新 Supabase 云端数据库）
async function settleAllTransfers(tripId, plans, operatorName) {
  const trip = await fetchTripByIdFromCloud(tripId);
  if (!trip) return { success: false, msg: '未找到该行程' };

  trip.settledTransfers = trip.settledTransfers || [];
  const now = new Date();
  const timeStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  (plans || []).forEach(p => {
    if (!trip.settledTransfers.some(s => s.id === p.id)) {
      trip.settledTransfers.push({
        id: p.id,
        from: p.rawFrom || p.from,
        to: p.rawTo || p.to,
        amount: p.amount,
        settledAt: timeStr,
        settledBy: operatorName || '我'
      });
    }
  });

  await updateTrip(trip);
  return { success: true, trip };
}

// 重置全部结清状态（直接更新 Supabase 云端数据库）
async function resetAllTransfers(tripId) {
  const trip = await fetchTripByIdFromCloud(tripId);
  if (!trip) return { success: false, msg: '未找到该行程' };

  trip.settledTransfers = [];
  await updateTrip(trip);
  return { success: true, trip };
}


// 详情页动态添加小队新成员（直接更新 Supabase 云端数据库）
async function addMemberToTrip(tripId, memberName) {
  const name = (memberName || '').trim();
  if (!name) return { success: false, msg: '请输入成员姓名' };
  const trip = await fetchTripByIdFromCloud(tripId);
  if (!trip) return { success: false, msg: '未找到该行程' };

  trip.members = trip.members || ['队长'];
  if (trip.members.includes(name)) {
    return { success: false, msg: '该成员已在小队中' };
  }

  trip.members.push(name);
  await updateTrip(trip);
  return { success: true, trip };
}


/**
 * 将行程中当前成员的花销记录批量同步到个人记账流水 (wxapp 表)
 * @param {Object} trip 行程对象
 * @param {String} myMemberName 当前成员名字
 */
async function syncTripExpensesToPersonalBills(trip, myMemberName) {
  if (!trip || !Array.isArray(trip.expenses) || trip.expenses.length === 0) {
    return { success: false, msg: '当前行程暂无消费支出记录' };
  }
  if (!supabase) {
    return { success: false, msg: '云端数据库未连接' };
  }

  const userOpenid = getUserOpenid();
  if (!userOpenid) {
    return { success: false, msg: '未获取到微信登录信息，请重试' };
  }

  // 获取该行程已同步过的消费 ID 列表，防止重复写入
  const syncedKey = `SYNCED_EXPENSES_${trip.id}`;
  const syncedIds = wx.getStorageSync(syncedKey) || [];

  // 筛选出当前用户参与且尚未同步的花销项目
  const myExpenses = trip.expenses.filter(item => {
    if (syncedIds.includes(item.id)) return false;
    const parts = item.participants && item.participants.length > 0 ? item.participants : (trip.members || []);
    return parts.includes(myMemberName) || item.payer === myMemberName;
  });

  if (myExpenses.length === 0) {
    return { success: true, count: 0, msg: '属于您的花销记录已全部同步过，无需重复同步' };
  }

  let successCount = 0;
  for (const exp of myExpenses) {
    const parts = exp.participants && exp.participants.length > 0 ? exp.participants : (trip.members || []);
    const totalAmt = parseFloat(exp.amount) || 0;
    // 个人实际应分摊金额
    const personalAmt = parts.includes(myMemberName) ? (totalAmt / parts.length).toFixed(2) : totalAmt.toFixed(2);
    
    // 图标和分类智能映射
    let act = '旅游';
    let icon = 'lvyou';
    const titleLower = (exp.title || '').toLowerCase();
    if (/餐|饭|吃|火锅|肉|酒|夜宵|菜/.test(titleLower)) {
      act = '用餐';
      icon = 'yongcan';
    } else if (/车|油|路|打车|飞机|机票|火车|地铁/.test(titleLower)) {
      act = '交通';
      icon = 'chuzuche';
    } else if (/宿|酒店|房|客栈|民宿/.test(titleLower)) {
      act = '旅游';
      icon = 'lvyou';
    }

    const expDate = exp.date || new Date().toISOString().slice(0, 10);
    const dateParts = expDate.split('-');
    const y = dateParts[0] || '';
    const m = dateParts[1] || '';
    const d = dateParts[2] || '';
    const m_w = `${m}-${Number(d)}`;

    const record = {
      _id: 'trip_' + exp.id + '_' + Date.now().toString().slice(-4),
      openid: userOpenid,
      _openid: userOpenid,
      type: '支出',
      amount: personalAmt,
      hisprice: personalAmt,
      act,
      text: act,
      remarks: `【小队·${trip.title}】${exp.title} (AA分摊 ¥${personalAmt})`,
      date: expDate,
      y,
      m,
      d,
      m_w,
      icon,
      paytype: '微信支付',
      payment: '微信支付',
      payall: '0',
      w: new Date(expDate).getDay().toString(),
      gender: '未知',
      nickname: '微信用户',
      trash: 0
    };

    try {
      await supabase.insert('wxapp', record);
      syncedIds.push(exp.id);
      successCount++;
    } catch (e) {
      console.warn('Sync expense to wxapp error:', e);
    }
  }

  // 保存已同步标记
  wx.setStorageSync(syncedKey, syncedIds);

  return {
    success: true,
    count: successCount,
    msg: `成功将 ${successCount} 笔行程账单同步到个人记账！`
  };
}


// 从云端实时获取单个行程最新完整数据（直接从 Supabase 云端数据库查询）
async function fetchTripByIdFromCloud(tripId) {
  if (!tripId || !supabase) return null;
  try {
    const res = await supabase.query('trips', {
      select: '*',
      filters: [
        { column: 'id', operator: 'eq', value: tripId }
      ]
    });
    if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
      const trip = mapRowToTrip(res.data[0]);
      if (trip && Number(trip.trash || 0) !== 1) {
        return trip;
      }
    }
  } catch (e) {
    console.warn('Fetch trip by id from cloud error:', e);
  }
  return null;
}

// 获取本地当前日期字符串 YYYY-MM-DD
function getLocalDateStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 计算行程当前有效状态：'ongoing'（进行中）或 'finished'（已结束）
function getTripStatus(trip) {
  if (!trip) return 'ongoing';
  if (trip.status === 'finished') return 'finished';
  if (trip.status === 'reopened') return 'ongoing';
  if (trip.endDate && trip.endDate < getLocalDateStr()) {
    return 'finished';
  }
  return 'ongoing';
}

// 计算行程结清与平账状态信息
function getTripSettlementInfo(trip) {
  if (!trip) {
    return { isAllSettled: true, pendingCount: 0, pendingAmount: '0.00', totalExpense: '0.00', transferPlans: [] };
  }
  const settlement = calculateAASettlement(trip.members || [], trip.expenses || [], trip.settledTransfers || []);
  const plans = settlement.transferPlans || [];
  const pendingPlans = plans.filter(p => !p.isSettled);
  const pendingCount = pendingPlans.length;
  const pendingAmount = pendingPlans.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0).toFixed(2);
  const isAllSettled = (plans.length === 0) || (pendingCount === 0);
  return {
    isAllSettled,
    pendingCount,
    pendingAmount,
    totalExpense: settlement.totalExpense || '0.00',
    transferPlans: plans
  };
}

// 获取待同步至个人账单的花销统计信息
function getPendingPersonalSyncInfo(trip, myMemberName) {
  if (!trip || !Array.isArray(trip.expenses) || trip.expenses.length === 0) {
    return { count: 0, totalAmount: '0.00', items: [] };
  }
  const syncedKey = `SYNCED_EXPENSES_${trip.id}`;
  const syncedIds = wx.getStorageSync(syncedKey) || [];
  
  const myExpenses = trip.expenses.filter(item => {
    if (syncedIds.includes(item.id)) return false;
    const parts = item.participants && item.participants.length > 0 ? item.participants : (trip.members || []);
    return parts.includes(myMemberName) || item.payer === myMemberName;
  });

  let totalAmt = 0;
  myExpenses.forEach(exp => {
    const parts = exp.participants && exp.participants.length > 0 ? exp.participants : (trip.members || []);
    const amt = parseFloat(exp.amount) || 0;
    const personalAmt = parts.includes(myMemberName) ? (amt / (parts.length || 1)) : amt;
    totalAmt += personalAmt;
  });

  return {
    count: myExpenses.length,
    totalAmount: totalAmt.toFixed(2),
    items: myExpenses
  };
}

// 手动结束行程并归档（直接更新 Supabase 云端数据库）
async function finishTrip(tripId) {
  const trip = await fetchTripByIdFromCloud(tripId);
  if (!trip) return { success: false, msg: '未找到该小队' };
  trip.status = 'finished';
  trip.finishedAt = new Date().toISOString();
  await updateTrip(trip);
  return { success: true, trip };
}

// 重新开启已结束的行程（直接更新 Supabase 云端数据库）
async function reopenTrip(tripId) {
  const trip = await fetchTripByIdFromCloud(tripId);
  if (!trip) return { success: false, msg: '未找到该小队' };
  trip.status = 'reopened';
  delete trip.finishedAt;
  await updateTrip(trip);
  return { success: true, trip };
}

module.exports = {
  fetchTripByIdFromCloud,
  fetchUserTripsFromCloud,
  addMemberToTrip,
  syncTripExpensesToPersonalBills,
  getPendingPersonalSyncInfo,
  getTripStatus,
  getTripSettlementInfo,
  finishTrip,
  reopenTrip,
  getLocalDateStr,
  CHECKLIST_TEMPLATES,
  DEFAULT_DECISIONS,
  getTrips,
  saveTrips,
  getTripById,
  createTrip,
  updateTrip,
  deleteTrip,
  generateInviteCode,
  joinTripByCode,
  queryTripByCode,
  claimTripMember,
  leaveTrip,
  calculateAASettlement,
  toggleSettledTransfer,
  settleAllTransfers,
  resetAllTransfers,
  syncTripsFromCloud
};

