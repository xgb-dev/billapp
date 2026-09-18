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
    voters: { '队长': 'o2' }
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
    checklist: Array.isArray(row.checklist) ? row.checklist : (typeof row.checklist === 'string' ? JSON.parse(row.checklist) : []),
    expenses: Array.isArray(row.expenses) ? row.expenses : (typeof row.expenses === 'string' ? JSON.parse(row.expenses) : []),
    decisions: decisions,
    settledTransfers: settledTransfers,
    createdAt: row.created_at || row.createdAt || new Date().toISOString()
  };
}

function mapTripToRow(trip) {
  const decisions = Array.isArray(trip.decisions) ? [...trip.decisions] : [];
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

  const myOid = getUserOpenid();
  let memberOpenids = Array.isArray(trip.memberOpenids) ? [...trip.memberOpenids] : [];
  if (myOid && !memberOpenids.includes(myOid)) {
    memberOpenids.push(myOid);
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

// 获取所有属于当前用户创建或口令加入的旅行活动（本地缓存 + 权限隔离）
function getTrips() {
  const allCached = wx.getStorageSync(STORAGE_KEY) || [];
  let myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
  let rolesUpdated = false;

  // 兼容老数据：若老版本在本机创建的行程（members 包含 '我' 且本地有），补全身份
  allCached.forEach(t => {
    if (t && t.id && !myTripRoles[t.id]) {
      if (Array.isArray(t.members) && t.members.length > 0 && t.members[0] === '我') {
        myTripRoles[t.id] = { role: 'creator', name: '我' };
        rolesUpdated = true;
      }
    }
  });
  if (rolesUpdated) {
    try {
      wx.setStorageSync('MY_TRIP_ROLES', myTripRoles);
    } catch (e) {}
  }

  // 核心隐私隔离：只返回当前用户创建或口令加入过的小队
  const userTrips = allCached.filter(t => t && t.id && myTripRoles[t.id] && Number(t.trash || 0) !== 1);
  return userTrips;
}

// // 保存所有活动列表至本地
function saveTrips(trips) {
  const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
  const validTrips = (trips || []).filter(t => t && t.id && myTripRoles[t.id] && Number(t.trash || 0) !== 1);
  wx.setStorageSync(STORAGE_KEY, validTrips);
}

// 从 Supabase 云端同步仅属于当前用户的行程列表（绑定微信 OpenID，换手机/删程序自动云端找回）
async function syncTripsFromCloud(userOpenid) {
  const currentOid = getUserOpenid(userOpenid);
  let localTrips = getTrips();
  let myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};

  if (!supabase) return localTrips;

  const tripMap = new Map();
  localTrips.forEach(t => {
    if (t && t.id && Number(t.trash || 0) !== 1) tripMap.set(t.id, t);
  });

  try {
    // 1. 如果有当前用户的 openid，直接从云端找回该用户的所有行程（创建者 + 参与者，排除已删除 trash=1）
    if (currentOid) {
      // (1) 查询我创建的小队
      const resCreated = await supabase.query('trips', {
        select: '*',
        filters: [
          { column: '_openid', operator: 'eq', value: currentOid },
          { column: 'trash', operator: 'neq', value: 1 }
        ]
      });
      if (resCreated && resCreated.data && Array.isArray(resCreated.data)) {
        resCreated.data.forEach(row => {
          if (Number(row.trash || 0) !== 1) {
            const trip = mapRowToTrip(row);
            tripMap.set(trip.id, trip);
            if (!myTripRoles[trip.id]) {
              myTripRoles[trip.id] = { role: 'creator', name: (trip.members && trip.members[0]) || '队长' };
            }
          }
        });
      }

      // (2) 查询我以成员身份加入过的小队
      const resJoined = await supabase.query('trips', {
        select: '*',
        filters: [
          { column: 'member_openids', operator: 'cs', value: JSON.stringify([currentOid]) },
          { column: 'trash', operator: 'neq', value: 1 }
        ]
      });
      if (resJoined && resJoined.data && Array.isArray(resJoined.data)) {
        resJoined.data.forEach(row => {
          if (Number(row.trash || 0) !== 1) {
            const trip = mapRowToTrip(row);
            tripMap.set(trip.id, trip);
            if (!myTripRoles[trip.id]) {
              myTripRoles[trip.id] = { role: 'member', name: (trip.members && trip.members[1]) || '队长' };
            }
          }
        });
      }

      try {
        wx.setStorageSync('MY_TRIP_ROLES', myTripRoles);
      } catch (e) {}
    }

    // 2. 对本地已加入但尚未关联 openid 的旧小队做定向刷新
    for (const [id, localTrip] of tripMap.entries()) {
      try {
        const res = await supabase.query('trips', {
          select: '*',
          filters: [
            { column: 'id', operator: 'eq', value: id },
            { column: 'trash', operator: 'neq', value: 1 }
          ]
        });
        if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
          const row = res.data[0];
          if (Number(row.trash || 0) === 1) {
            tripMap.delete(id);
          } else {
            const cloudTrip = mapRowToTrip(row);
            tripMap.set(id, cloudTrip);

            // 顺便把自己的 openid 补记到该小队的云端 member_openids 中
            if (currentOid && !cloudTrip.memberOpenids.includes(currentOid)) {
              cloudTrip.memberOpenids.push(currentOid);
              supabase.update('trips', mapTripToRow(cloudTrip), [
                { column: 'id', operator: 'eq', value: id }
              ]).catch(() => {});
            }
          }
        }
      } catch (e) {}
    }

    const mergedTrips = Array.from(tripMap.values()).filter(t => t && Number(t.trash || 0) !== 1);
    saveTrips(mergedTrips);
    return mergedTrips;
  } catch (err) {
    console.warn('Sync trips from cloud warning:', err);
  }
  return localTrips;
}

// 获取单个活动详情
function getTripById(id) {
  const trips = getTrips();
  return trips.find(t => t.id === id) || null;
}

// 创建新旅行活动（同时写本地和云端）
function createTrip(tripData) {
  const trips = getTrips();
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
    createdAt: new Date().toISOString()
  };
  trips.unshift(newTrip);
  saveTrips(trips);

  // 记录本人为队长创建者
  try {
    const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
    myTripRoles[newTrip.id] = { role: 'creator', name: creatorName };
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

// 删除活动（逻辑软删除 trash = 1，保留底账）
function deleteTrip(id) {
  let trips = getTrips();
  const targetTrip = trips.find(t => t.id === id);
  trips = trips.filter(t => t.id !== id);
  saveTrips(trips);

  try {
    const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
    delete myTripRoles[id];
    wx.setStorageSync('MY_TRIP_ROLES', myTripRoles);
  } catch (e) {}

  // 异步软删除云端数据
  if (supabase) {
    if (targetTrip) {
      targetTrip.trash = 1;
      const rowData = mapTripToRow(targetTrip);
      rowData.trash = 1;
      supabase.update('trips', rowData, [
        { column: 'id', operator: 'eq', value: id }
      ]).catch(err => {
        console.warn('Supabase soft delete update warning:', err);
      });
    } else {
      supabase.update('trips', { trash: 1 }, [
        { column: 'id', operator: 'eq', value: id }
      ]).catch(err => {
        console.warn('Supabase soft delete trip error:', err);
      });
    }
  }
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

  // 2. 本地备用检索
  if (!targetTrip) {
    const localTrips = getTrips();
    targetTrip = localTrips.find(t => (t.code || '').toUpperCase() === cleanCode && Number(t.trash || 0) !== 1);
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

// 认领已有成员身份进入小队
async function claimTripMember(tripId, memberName) {
  let trips = getTrips();
  let targetTrip = trips.find(t => t.id === tripId && Number(t.trash || 0) !== 1);

  // 如果本地没有，从云端实时拉取
  if (!targetTrip && supabase) {
    try {
      const res = await supabase.query('trips', {
        select: '*',
        filters: [
          { column: 'id', operator: 'eq', value: tripId },
          { column: 'trash', operator: 'neq', value: 1 }
        ]
      });
      if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
        if (Number(res.data[0].trash || 0) !== 1) {
          targetTrip = mapRowToTrip(res.data[0]);
        }
      }
    } catch (e) {
      console.warn('Query trip by id error:', e);
    }
  }

  if (!targetTrip) {
    return { success: false, msg: '未查找到该小队信息' };
  }

  // 1. 关键：必须先将当前设备角色身份写入 MY_TRIP_ROLES 缓存！
  const isLeader = (targetTrip.members[0] === memberName);
  try {
    const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
    myTripRoles[targetTrip.id] = {
      role: isLeader ? 'creator' : 'member',
      name: memberName
    };
    wx.setStorageSync('MY_TRIP_ROLES', myTripRoles);
  } catch (e) {}

  // 2. 然后保存到本地行程列表（此时 saveTrips 内部过滤能识别该行程角色，绝不会被误丢弃）
  const existingIdx = trips.findIndex(t => t.id === targetTrip.id);
  if (existingIdx !== -1) {
    trips[existingIdx] = targetTrip;
  } else {
    trips.unshift(targetTrip);
  }
  saveTrips(trips);

  // 3. 绑定当前用户的 openid 到云端 member_openids，保证删小程序后依然自动找回
  const myOid = getUserOpenid();
  if (myOid) {
    targetTrip.memberOpenids = targetTrip.memberOpenids || [];
    if (!targetTrip.memberOpenids.includes(myOid)) {
      targetTrip.memberOpenids.push(myOid);
    }
    if (supabase) {
      supabase.update('trips', mapTripToRow(targetTrip), [
        { column: 'id', operator: 'eq', value: targetTrip.id }
      ]).catch(e => console.warn('Sync member_openids error:', e));
    }
  }

  return { success: true, trip: targetTrip };
}

// 通过 6 位固定口令码加入旅行小队（新成员）
async function joinTripByCode(code, memberName) {
  const cleanCode = (code || '').trim().toUpperCase();
  const name = (memberName || '').trim() || '新队友';
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

  // 2. 本地备用检索
  if (!targetTrip) {
    const localTrips = getTrips();
    targetTrip = localTrips.find(t => (t.code || '').toUpperCase() === cleanCode && Number(t.trash || 0) !== 1);
  }

  if (!targetTrip) {
    return { success: false, msg: '未查找到该口令对应的小队，请核对后重试' };
  }

  // 3. 追加队员名字
  targetTrip.members = targetTrip.members || ['队长'];
  if (!targetTrip.members.includes(name)) {
    targetTrip.members.push(name);
  }

  // 4. 关键：先记录该队员在当前设备的角色身份
  try {
    const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
    myTripRoles[targetTrip.id] = { role: 'member', name };
    wx.setStorageSync('MY_TRIP_ROLES', myTripRoles);
  } catch (e) {}

  // 5. 保存到本地行程列表
  let trips = getTrips();
  const existingIdx = trips.findIndex(t => t.id === targetTrip.id);
  if (existingIdx !== -1) {
    trips[existingIdx] = targetTrip;
  } else {
    trips.unshift(targetTrip);
  }
  saveTrips(trips);

  // 6. 绑定当前用户的 openid 到云端 member_openids
  const myOid = getUserOpenid();
  if (myOid) {
    targetTrip.memberOpenids = targetTrip.memberOpenids || [];
    if (!targetTrip.memberOpenids.includes(myOid)) {
      targetTrip.memberOpenids.push(myOid);
    }
  }

  // 7. 云端同步更新队员名单
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
    // 1. 从小队在队成员中移除
    trip.members = (trip.members || []).filter(m => m !== memberName);
    
    // 2. 将清单中分配给该成员的物品重置为 '所有人'，防止任务被遗忘
    if (Array.isArray(trip.checklist)) {
      trip.checklist.forEach(item => {
        if (item.assignee === memberName) {
          item.assignee = '所有人';
        }
      });
    }

    updateTrip(trip);
  }

  // 3. 从本地缓存中删除该行程卡片
  trips = trips.filter(t => t.id !== tripId);
  saveTrips(trips);

  // 4. 清除该行程对应的个人角色缓存
  try {
    const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
    delete myTripRoles[tripId];
    wx.setStorageSync('MY_TRIP_ROLES', myTripRoles);
  } catch (e) {}
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

// 切换单个转账方案的结清/未结状态
function toggleSettledTransfer(tripId, planId, operatorName) {
  let trips = getTrips();
  const trip = trips.find(t => t.id === tripId);
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

  updateTrip(trip);
  return { success: true, isSettled };
}

// 一键全部标记结清
function settleAllTransfers(tripId, plans, operatorName) {
  let trips = getTrips();
  const trip = trips.find(t => t.id === tripId);
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

  updateTrip(trip);
  return { success: true };
}

// 重置全部结清状态
function resetAllTransfers(tripId) {
  let trips = getTrips();
  const trip = trips.find(t => t.id === tripId);
  if (!trip) return { success: false, msg: '未找到该行程' };

  trip.settledTransfers = [];
  updateTrip(trip);
  return { success: true };
}


// 详情页动态添加小队新成员
function addMemberToTrip(tripId, memberName) {
  const name = (memberName || '').trim();
  if (!name) return { success: false, msg: '请输入成员姓名' };
  let trips = getTrips();
  const trip = trips.find(t => t.id === tripId);
  if (!trip) return { success: false, msg: '未找到该行程' };

  trip.members = trip.members || ['我'];
  if (trip.members.includes(name)) {
    return { success: false, msg: '该成员已在小队中' };
  }

  trip.members.push(name);
  updateTrip(trip);
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


// 从云端实时获取单个行程最新完整数据（进入详情页时云端即时同步拉取）
async function fetchTripByIdFromCloud(tripId) {
  if (!tripId || !supabase) return null;
  try {
    const res = await supabase.query('trips', {
      select: '*',
      filters: [
        { column: 'id', operator: 'eq', value: tripId },
        { column: 'trash', operator: 'neq', value: 1 }
      ]
    });
    if (res && res.data && Array.isArray(res.data)) {
      if (res.data.length > 0) {
        const trip = mapRowToTrip(res.data[0]);
        if (trip && Number(trip.trash || 0) !== 1) {
          let trips = getTrips();
          const idx = trips.findIndex(t => t.id === trip.id);
          if (idx !== -1) {
            trips[idx] = trip;
          } else {
            trips.unshift(trip);
          }
          saveTrips(trips);
          return trip;
        }
      } else {
        // 云端没有该行程或已被删除，从本地缓存剔除
        let trips = getTrips();
        const existingIdx = trips.findIndex(t => t.id === tripId);
        if (existingIdx !== -1) {
          trips.splice(existingIdx, 1);
          saveTrips(trips);
        }
      }
    }
  } catch (e) {
    console.warn('Fetch trip by id from cloud error:', e);
  }
  return null;
}

module.exports = {
  fetchTripByIdFromCloud,
  addMemberToTrip,
  syncTripExpensesToPersonalBills,
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
