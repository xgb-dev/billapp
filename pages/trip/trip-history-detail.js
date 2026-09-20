const app = getApp();
const { 
  fetchTripByIdFromCloud, 
  calculateAASettlement, 
  getTripSettlementInfo, 
  getTripStatus,
  syncTripExpensesToPersonalBills,
  getPendingPersonalSyncInfo,
  reopenTrip,
  deleteTrip
} = require('../../utils/tripData.js');

Page({
  data: {
    tripId: '',
    loading: true,
    trip: null,
    tripStatus: 'finished',
    isCreator: false,
    myMemberName: '队长',
    viewingMemberName: '队长',
    members: [],

    // 队员个人总结
    personalSummary: {
      name: '',
      isMe: true,
      paid: '0.00',
      owed: '0.00',
      balance: '0.00',
      balanceNum: 0,
      balanceType: 'even', // 'receive' | 'pay' | 'even'
      balanceText: '账目已完美平账',
      isSettledUp: true,
      pendingDebt: '0.00',
      pendingCredit: '0.00',
      paidExpenses: [],
      participatedExpenses: [],
      relatedTransfers: []
    },

    // 个人记账同步状态
    syncInfo: {
      pendingCount: 0,
      pendingAmount: '0.00',
      isSyncedAll: true
    },
    isSyncing: false,

    // 团队统计
    teamStats: {
      totalExpense: '0.00',
      perPerson: '0.00',
      expenseCount: 0,
      daysCount: 1,
      checklistDone: 0,
      checklistTotal: 0,
      checklistPercent: 0
    },

    // 消费分类分布
    categoryStats: [],

    // 团队结算方案与文案
    transferPlans: [],
    isAllSettled: true,
    groupSummaryText: '',

    // 只读清单
    readOnlyChecklist: [],
    checklistFinishedCount: 0
  },

  onLoad(options) {
    const tripId = (options && (options.tripId || options.id)) || '';
    if (!tripId) {
      wx.showToast({ title: '未指定行程ID', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1000);
      return;
    }
    this.setData({ tripId }, () => {
      this.loadTripData();
    });
  },

  onShow() {
    if (this.data.tripId && !this.data.loading) {
      this.loadTripData(true);
    }
  },

  onPullDownRefresh() {
    this.loadTripData(true).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 加载行程数据与分析计算
  async loadTripData(isSilent = false) {
    const tripId = this.data.tripId;
    if (!isSilent) this.setData({ loading: true });

    try {
      const trip = await fetchTripByIdFromCloud(tripId);
      if (!trip) {
        wx.showToast({ title: '未找到该行程', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      // 识别我的身份
      const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
      const myRoleInfo = myTripRoles[tripId];
      let myMemberName = '队长';
      let isCreator = false;

      // 获取当前用户 openid
      let myOpenid = '';
      try {
        if (app && app.ensureOpenid) {
          myOpenid = await app.ensureOpenid();
        }
      } catch (e) {}

      if (trip._openid && myOpenid && trip._openid === myOpenid) {
        isCreator = true;
      } else if (myRoleInfo && myRoleInfo.role === 'creator') {
        isCreator = true;
      }

      if (myRoleInfo && myRoleInfo.name) {
        myMemberName = myRoleInfo.name;
      } else if (isCreator) {
        myMemberName = (trip.members && trip.members[0]) || '队长';
      } else {
        myMemberName = (trip.members && trip.members[0]) || '我';
      }

      const members = Array.isArray(trip.members) && trip.members.length > 0 ? trip.members : ['队长'];
      const viewingMemberName = this.data.viewingMemberName || myMemberName;

      // 1. 全局 AA 结算计算
      const settlement = calculateAASettlement(members, trip.expenses || [], trip.settledTransfers || []);
      const settlementInfo = getTripSettlementInfo(trip);
      const tripStatus = getTripStatus(trip);

      // 2. 团队总体指标
      const totalExpenseNum = parseFloat(settlement.totalExpense) || 0;
      const memberCount = Math.max(members.length, 1);
      const perPerson = (totalExpenseNum / memberCount).toFixed(2);

      let daysCount = 1;
      if (trip.startDate && trip.endDate) {
        const start = new Date(trip.startDate.replace(/-/g, '/'));
        const end = new Date(trip.endDate.replace(/-/g, '/'));
        const diffTime = Math.abs(end - start);
        daysCount = Math.max(Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1, 1);
      }

      const checklist = Array.isArray(trip.checklist) ? trip.checklist : [];
      const checklistTotal = checklist.length;
      const checklistDone = checklist.filter(i => i && i.checked).length;
      const checklistPercent = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 100;

      const teamStats = {
        totalExpense: totalExpenseNum.toFixed(2),
        perPerson,
        expenseCount: (trip.expenses || []).length,
        daysCount,
        checklistDone,
        checklistTotal,
        checklistPercent
      };

      // 3. 消费分类统计
      const categoryStats = this.computeCategoryStats(trip.expenses || [], totalExpenseNum);

      // 4. 计算个人总结报告
      const personalSummary = this.computePersonalSummary(viewingMemberName, myMemberName, trip, settlement);

      // 5. 查询个人同步到个人记账的状态
      const syncCheck = getPendingPersonalSyncInfo(trip, myMemberName);
      const syncInfo = {
        pendingCount: syncCheck.count || 0,
        pendingAmount: syncCheck.totalAmount || '0.00',
        isSyncedAll: (syncCheck.count === 0)
      };

      this.setData({
        loading: false,
        trip,
        tripStatus,
        isCreator,
        myMemberName,
        viewingMemberName,
        members,
        settlement,
        settlementInfo,
        teamStats,
        categoryStats,
        personalSummary,
        syncInfo,
        transferPlans: settlement.transferPlans || [],
        isAllSettled: settlement.isAllSettled,
        groupSummaryText: settlement.groupSummaryText || '',
        readOnlyChecklist: checklist,
        checklistFinishedCount: checklistDone
      });
    } catch (err) {
      console.error('加载历史行程详情失败:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
    }
  },

  // 计算消费分类占比
  computeCategoryStats(expenses, totalAmount) {
    if (!Array.isArray(expenses) || expenses.length === 0 || totalAmount <= 0) {
      return [];
    }
    const catMap = {};
    expenses.forEach(exp => {
      const cat = exp.category || '其他';
      const amt = parseFloat(exp.amount) || 0;
      if (!catMap[cat]) {
        catMap[cat] = { category: cat, total: 0, count: 0 };
      }
      catMap[cat].total += amt;
      catMap[cat].count += 1;
    });

    const categoryIcons = {
      '餐饮': '🍲', '用餐': '🍲', '美食': '🍲', '外卖': '🥡', '早餐': '🥟', '午餐': '🍱', '晚餐': '🥘',
      '交通': '🚗', '打车': '🚕', '机票': '✈️', '火车': '🚄', '租车': '🚙', '加油': '⛽', '停车费': '🅿️',
      '住宿': '🏨', '酒店': '🏨', '民宿': '🏡',
      '门票': '🎟️', '景点': '🏞️', '娱乐': '🎡', '玩乐': '🎢',
      '购物': '🛍️', '特产': '🎁', '零食': '🍿', '超市': '🛒', '饮品': '🧋', '酒水': '🍻',
      '其他': '📦'
    };

    const result = Object.keys(catMap).map(cat => {
      const item = catMap[cat];
      const percent = Math.round((item.total / totalAmount) * 100);
      return {
        category: cat,
        icon: categoryIcons[cat] || '💳',
        total: item.total.toFixed(2),
        count: item.count,
        percent
      };
    });

    result.sort((a, b) => parseFloat(b.total) - parseFloat(a.total));
    return result;
  },

  // 计算指定队员的个人专属总结
  computePersonalSummary(targetName, myName, trip, settlement) {
    const expenses = trip.expenses || [];
    const memberSummary = (settlement.memberSummaries || []).find(m => (m.rawName === targetName || m.name === targetName)) || {
      paid: '0.00',
      owed: '0.00',
      balance: '0.00',
      pendingDebt: '0.00',
      pendingCredit: '0.00',
      isSettledUp: true
    };

    const paidNum = parseFloat(memberSummary.paid) || 0;
    const owedNum = parseFloat(memberSummary.owed) || 0;
    const balNum = parseFloat(memberSummary.balance) || 0;

    let balanceType = 'even';
    let balanceText = '账目已完美平账';
    if (balNum > 0.01) {
      balanceType = 'receive';
      balanceText = `垫付较多，应收回 ¥${balNum.toFixed(2)}`;
    } else if (balNum < -0.01) {
      balanceType = 'pay';
      balanceText = `消费较多，需支付 ¥${Math.abs(balNum).toFixed(2)}`;
    }

    // 1. 我垫付的账单
    const paidExpenses = [];
    // 2. 我参与分摊的账单
    const participatedExpenses = [];

    expenses.forEach(exp => {
      const parts = (exp.participants && exp.participants.length > 0) ? exp.participants : (trip.members || []);
      const amt = parseFloat(exp.amount) || 0;
      const count = Math.max(parts.length, 1);
      const splitAmt = (amt / count).toFixed(2);

      if (exp.payer === targetName) {
        paidExpenses.push({
          ...exp,
          formattedAmount: amt.toFixed(2),
          splitCount: count,
          myShare: splitAmt
        });
      }

      if (parts.includes(targetName)) {
        participatedExpenses.push({
          ...exp,
          formattedAmount: amt.toFixed(2),
          payerName: exp.payer || '队友',
          isPayer: (exp.payer === targetName),
          splitCount: count,
          mySplitAmount: splitAmt
        });
      }
    });

    // 3. 涉及该成员的清算转账
    const relatedTransfers = (settlement.transferPlans || []).filter(plan => {
      return (plan.rawFrom === targetName || plan.rawTo === targetName || plan.from === targetName || plan.to === targetName);
    }).map(plan => {
      const isPayer = (plan.rawFrom === targetName || plan.from === targetName);
      return {
        ...plan,
        isPayer,
        roleText: isPayer ? '需转给' : '应收取',
        counterpart: isPayer ? plan.to : plan.from
      };
    });

    return {
      name: targetName,
      isMe: (targetName === myName),
      paid: paidNum.toFixed(2),
      owed: owedNum.toFixed(2),
      balance: Math.abs(balNum).toFixed(2),
      balanceNum: balNum,
      balanceType,
      balanceText,
      isSettledUp: memberSummary.isSettledUp,
      pendingDebt: memberSummary.pendingDebt,
      pendingCredit: memberSummary.pendingCredit,
      paidExpenses,
      participatedExpenses,
      relatedTransfers
    };
  },

  // 切换查看的队员视角
  switchViewingMember(e) {
    const name = e.currentTarget.dataset.name;
    if (!name || name === this.data.viewingMemberName) return;

    const personalSummary = this.computePersonalSummary(name, this.data.myMemberName, this.data.trip, this.data.settlement);
    this.setData({
      viewingMemberName: name,
      personalSummary
    });
  },

  // 一键将属于我的旅行支出同步到个人记账流水
  async handleSyncToPersonal() {
    if (this.data.isSyncing) return;
    const { trip, myMemberName } = this.data;
    if (!trip) return;

    this.setData({ isSyncing: true });
    wx.showLoading({ title: '正在同步记账...' });

    try {
      const res = await syncTripExpensesToPersonalBills(trip, myMemberName);
      wx.hideLoading();
      this.setData({ isSyncing: false });

      if (res.success) {
        wx.showToast({
          title: res.count > 0 ? `已成功同步 ${res.count} 笔支出到个人流水` : '账单已全部同步过',
          icon: 'success',
          duration: 2000
        });

        // 重新更新同步状态
        const syncCheck = getPendingPersonalSyncInfo(trip, myMemberName);
        this.setData({
          syncInfo: {
            pendingCount: syncCheck.count || 0,
            pendingAmount: syncCheck.totalAmount || '0.00',
            isSyncedAll: (syncCheck.count === 0)
          }
        });
      } else {
        wx.showToast({ title: res.msg || '同步失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      this.setData({ isSyncing: false });
      wx.showToast({ title: '网络异常，同步失败', icon: 'none' });
    }
  },

  // 复制微信群对账文案
  copyGroupSummary() {
    const text = this.data.groupSummaryText;
    if (!text) {
      wx.showToast({ title: '暂无对账明细', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '对账单已复制', icon: 'success' });
      }
    });
  },

  // 队长重新开启行程（恢复到进行中工作台）
  handleReopenTrip() {
    if (!this.data.isCreator) {
      wx.showToast({ title: '仅队长可重新开启行程', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '重新开启行程',
      content: '确定要重新开启此行程吗？开启后将恢复为进行中状态，并返回小队编辑工作台。',
      confirmText: '重新开启',
      confirmColor: '#10B981',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在重新开启...' });
          const updateRes = await reopenTrip(this.data.tripId);
          wx.hideLoading();
          if (updateRes.success) {
            wx.showToast({ title: '已重新开启', icon: 'success' });
            setTimeout(() => {
              wx.redirectTo({
                url: `/pages/trip/trip-detail?tripId=${this.data.tripId}`
              });
            }, 600);
          } else {
            wx.showToast({ title: updateRes.msg || '开启失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 队长解散/删除行程
  handleDeleteTrip() {
    if (!this.data.isCreator) {
      wx.showToast({ title: '仅队长可删除行程', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '删除行程确认',
      content: `确定要彻底删除历史行程“${this.data.trip.title || '此行程'}”吗？删除后不可恢复。`,
      confirmText: '确认删除',
      confirmColor: '#EF4444',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在删除...' });
          const delRes = await deleteTrip(this.data.tripId);
          wx.hideLoading();
          if (delRes.success) {
            wx.showToast({ title: '行程已删除', icon: 'success' });
            setTimeout(() => {
              const pages = getCurrentPages();
              if (pages.length > 1) {
                wx.navigateBack({ delta: 1 });
              } else {
                wx.reLaunch({ url: '/pages/index/index' });
              }
            }, 600);
          } else {
            wx.showToast({ title: delRes.msg || '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 分享行程与账单总结
  onShareAppMessage() {
    const trip = this.data.trip || {};
    const viewingName = this.data.viewingMemberName;
    const summary = this.data.personalSummary;
    return {
      title: `【${trip.title || '旅行小队'}】${viewingName}的旅行账单回顾：共消费¥${summary.owed}`,
      path: `/pages/trip/trip-history-detail?tripId=${this.data.tripId}`
    };
  }
});
