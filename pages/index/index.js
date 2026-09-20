const app = getApp();
const supabase = require('../../utils/supabase.js');
const { 
  fetchUserTripsFromCloud,
  syncTripsFromCloud, 
  deleteTrip, 
  joinTripByCode, 
  queryTripByCode, 
  claimTripMember, 
  fetchTripByIdFromCloud,
  getTripStatus,
  getTripSettlementInfo,
  updateTrip
} = require('../../utils/tripData.js');
const {income, expense, functional} = app.globalData.iconCategories;
Page({
  data: {
    totalBalance: '0.00',
    monthIncome: '0.00',
    monthExpense: '0.00',
    recentBills: [],
    loading: false,
    isHideAmount: false,
    monthlyBudget: 0,
    hasBudget: false,
    budgetRemaining: '0.00',
    budgetPercent: 0,
    budgetStatus: 'normal',
    trips: [],
    ongoingTrips: [],
    historyTrips: [],
    tripListTab: 'ongoing', // 'ongoing' | 'history'
    showQuickDecisionModal: false,
    quickDecisionTrip: null,
    quickDecision: null,
    quickDecisionMyVote: '',
    quickDecisionMyName: '',
    showJoinModal: false,
    joinInputCode: '',
    joinMemberName: '',
    queriedTrip: null,
    selectedMemberName: '',
    isNewMember: false,
    isQueryingCode: false
  },

  onLoad(options) {
    const isHideAmount = wx.getStorageSync('isHideAmount') || false;
    const monthlyBudget = parseFloat(wx.getStorageSync('monthlyBudget')) || 0;
    this.setData({
      isHideAmount,
      monthlyBudget,
      hasBudget: monthlyBudget > 0
    });

    // 如果通过分享卡片或链接进入，带入口令并智能判断进入或认领
    if (options && options.joinCode) {
      const joinCode = (options.joinCode || '').toUpperCase().trim();
      this._lastHandledJoinCode = joinCode;
      this.handleInviteCodeEntry(joinCode, options);
    }

    wx.showLoading({
      title: '加载中',
    });
    this.loadWithOpenid();
  },
  onShow() {
    // 加载旅行小队活动数据
    this.loadTrips();

    // 检查微信后台唤醒时携带的邀请口令
    try {
      const enterOptions = (wx.getEnterOptionsSync && wx.getEnterOptionsSync()) || {};
      if (enterOptions.query && enterOptions.query.joinCode) {
        const joinCode = (enterOptions.query.joinCode || '').toUpperCase().trim();
        if (joinCode && this._lastHandledJoinCode !== joinCode) {
          this._lastHandledJoinCode = joinCode;
          this.handleInviteCodeEntry(joinCode, enterOptions.query);
        }
      }
    } catch (e) {}

    // 每次显示页面更新预算缓存设置
    const monthlyBudget = parseFloat(wx.getStorageSync('monthlyBudget')) || 0;
    if (monthlyBudget !== this.data.monthlyBudget) {
      this.setData({
        monthlyBudget,
        hasBudget: monthlyBudget > 0
      });
      if (this.data.monthExpenseNum !== undefined) {
        this.calculateBudget(this.data.monthExpenseNum);
      }
    }
  },
  onShareAppMessage(res) {
    if (res && res.from === 'button' && res.target && res.target.dataset && res.target.dataset.code) {
      const { code, title } = res.target.dataset;
      return {
        title: `邀请你加入【${title || '旅行小队'}】，口令：${code}`,
        path: `/pages/index/index?joinCode=${code}`
      };
    }
    return {
      title: '极简记账与旅行小队',
      path: '/pages/index/index',
    };
  },
// 等待 openid 就绪
async loadWithOpenid() {
  try {
    // 等待 openid 就绪
    const openid = await app.ensureOpenid();
    
    this.setData({ 
      userOpenid: openid,
      loading: false
    }, () => {
      // 加载账本数据
      this.loadAccountData();
      // 带着 openid 从云端精准恢复属于自己的小队（换机/删小程序自动找回）
      this.loadTrips(openid);
    });
  } catch (error) {
    wx.showToast({
      title: '登录失败，请重试',
      icon: 'none'
    });
    this.setData({ loading: false });
  }
},
  // 首页刷新：同时刷新个人账本数据与旅行小队行程列表
  async refreshPage() {
    if (!this.data.userOpenid) {
      this.loadWithOpenid();
      return;
    }
    this.setData({ loading: true });
    try {
      await Promise.allSettled([
        this.loadAccountData(),
        this.loadTrips(this.data.userOpenid)
      ]);
    } catch (e) {
      console.error(e);
    } finally {
      this.setData({ loading: false });
    }
  },

  // 下拉刷新事件
  async onPullDownRefresh() {
    await this.refreshPage();
    wx.stopPullDownRefresh();
  },

  // 从 Supabase 加载账本数据（适配实际表结构）
  async loadAccountData() {
    if (!this.data.userOpenid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }
    wx.hideLoading();
    wx.showLoading({
      title: '加载中',
    })
    this.setData({ loading: true });

    try {
      // 获取当前年月
      const now = new Date();
      const currentYear = now.getFullYear().toString();
      const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
      const currentMonthStr = `${currentYear}-${currentMonth}`;
      
      // 获取当前用户的所有账单
      const {data: allBills, statusCode, errMsg} = await supabase.query('wxapp', {
        select: '*',
        filters: [
          { column: '_openid', operator: 'eq', value: this.data.userOpenid },
          { column: 'trash', operator: 'eq', value: 0 }, 
        ],
        order: 'date', // 按日期排序
        desc: true
      });
      if (statusCode != 200) throw errMsg;

      // 过滤本月账单并计算统计
      const monthBills = allBills.filter(bill => {
        // 兼容不同的日期格式
        return bill.date && bill.date.startsWith(currentMonthStr);
      });

      // 计算本月收入和支出
      let monthIncome = 0;
      let monthExpense = 0;

      monthBills.forEach(bill => {
        // 使用 amount 或 hisprice 字段作为金额（根据实际存储位置）
        const amount = parseFloat(bill.amount || bill.hisprice || '0') || 0;
        
        // 根据 type 字段判断收支类型
        if (bill.type === 'in' || bill.type === 'income' || bill.type === '收入') {
          monthIncome += amount;
        } else {
          monthExpense += amount;
        }
      });

      // 计算余额
      const totalBalance = monthIncome - monthExpense;
      
      // 处理最近账单数据（取前5条）
      const recentBills = (allBills || []).slice(0, 5).map(bill => {

        let billItem = {
          id: bill.id, // 使用实际的 ID 字段
          type: bill.type || 'expense',
          category: bill.text || '其他', // 使用 text 作为分类
          categoryIcon: bill.icon, // 使用 icon 字段
          amount: (parseFloat(bill.amount || bill.hisprice || '0') || 0).toFixed(2),
          note: bill.remarks || bill.text || '', // 使用 remarks 作为备注
          date: bill.date || '',
          paytype: bill.paytype || '', // 支付方式
          payment: bill.payment || '' // 支付账户
        }
        const incomeIcon = income.filter(i => i.icon == bill.icon);
        const expenseIcon = expense.filter(i => i.icon == bill.icon);
        if(incomeIcon.length <= 0 && expenseIcon <= 0) {
          billItem.categoryIcon = 'qita-60';
        }
        return billItem;
      });

      // 保存当前开销数值并计算预算
      this.setData({
        totalBalance: totalBalance.toFixed(2),
        monthIncome: monthIncome.toFixed(2),
        monthExpense: monthExpense.toFixed(2),
        monthExpenseNum: monthExpense,
        recentBills: recentBills,
        loading: false
      }, () => {
        this.calculateBudget(monthExpense);
      });
      
      wx.hideLoading();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: '加载数据失败',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },

  // 计算预算进度
  calculateBudget(expenseAmount) {
    const budget = this.data.monthlyBudget;
    if (budget <= 0) {
      this.setData({
        hasBudget: false,
        budgetRemaining: '0.00',
        budgetPercent: 0,
        budgetStatus: 'normal'
      });
      return;
    }

    const remaining = budget - expenseAmount;
    const percent = Math.min(Math.round((expenseAmount / budget) * 100), 100);
    let status = 'normal';
    if (expenseAmount > budget) {
      status = 'danger'; // 超支
    } else if (percent >= 80) {
      status = 'warning'; // 预警
    }

    this.setData({
      hasBudget: true,
      budgetRemaining: Math.abs(remaining).toFixed(2),
      isOverBudget: remaining < 0,
      budgetPercent: percent,
      budgetStatus: status
    });
  },

  // 切换金额隐藏与展示（小眼睛）
  toggleHideAmount() {
    const isHideAmount = !this.data.isHideAmount;
    this.setData({
      isHideAmount
    });
    wx.setStorageSync('isHideAmount', isHideAmount);
  },

  // 弹出设置/修改本月预算
  setBudget() {
    wx.showModal({
      title: '设置本月预算',
      editable: true,
      placeholderText: '请输入每月预算金额（元）',
      content: this.data.monthlyBudget > 0 ? String(this.data.monthlyBudget) : '',
      success: (res) => {
        if (res.confirm) {
          const val = parseFloat(res.content ? res.content.trim() : '0') || 0;
          if (val < 0) {
            wx.showToast({ title: '预算不能为负数', icon: 'none' });
            return;
          }
          wx.setStorageSync('monthlyBudget', val);
          this.setData({
            monthlyBudget: val,
            hasBudget: val > 0
          }, () => {
            this.calculateBudget(this.data.monthExpenseNum || parseFloat(this.data.monthExpense) || 0);
          });
          wx.showToast({
            title: val > 0 ? '预算设置成功' : '已清除预算',
            icon: 'success'
          });
        }
      }
    });
  },


  // 跳转到记收入页面
  goToIncome() {
    wx.navigateTo({
      url: '/pages/record/record?type=income'
    });
  },

  // 跳转到记支出页面
  goToExpense() {
    wx.navigateTo({
      url: '/pages/record/record?type=expense'
    });
  },

  // 跳转到账单列表页面
  goToBillList() {
    wx.navigateTo({
      url: '/pages/list/list'
    });
  },

  // 跳转到统计分析页面
  goToChart() {
    wx.navigateTo({
      url: '/pages/chart/chart'
    });
  },

  // 查看账单详情
  viewBillDetail(e) {
    const billId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${billId}`
    });
  },

  // 整理行程数据：状态计算、平账检查、进行中与历史行程拆分
  processAndSetTrips(tripsList, leftTripIds = []) {
    const validTrips = (tripsList || []).filter(t => t && Number(t.trash || 0) !== 1 && !leftTripIds.includes(t.id));
    
    // 给每个 trip 补充状态与平账信息
    const enrichedTrips = validTrips.map(trip => {
      const status = getTripStatus(trip);
      const settlementInfo = getTripSettlementInfo(trip);
      return {
        ...trip,
        computedStatus: status, // 'ongoing' | 'finished'
        settlementInfo: settlementInfo
      };
    });

    const ongoingTrips = enrichedTrips.filter(t => t.computedStatus === 'ongoing');
    const historyTrips = enrichedTrips.filter(t => t.computedStatus === 'finished');

    this.setData({
      trips: enrichedTrips,
      ongoingTrips,
      historyTrips
    });
  },

  // 加载旅行活动（直接直读 Supabase 云端数据库，实时与数据库完全对齐）
  async loadTrips(userOpenid) {
    const oid = userOpenid || this.data.userOpenid || '';
    const leftTripIds = wx.getStorageSync('MY_LEFT_TRIP_IDS') || [];

    try {
      const cloudTrips = await fetchUserTripsFromCloud(oid);
      this.processAndSetTrips(cloudTrips, leftTripIds);
    } catch (e) {
      console.warn('Sync trips from cloud error:', e);
    }
  },

  // 切换进行中 / 历史行程 Tab
  switchTripListTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab) {
      this.setData({ tripListTab: tab });
    }
  },

  // 呼出首页快速决策弹窗
  openQuickDecisionModalFromTrip(trip, targetDecisionId, myMemberName) {
    if (!trip || !Array.isArray(trip.decisions) || trip.decisions.length === 0) return;

    // 确定当前用户的身份名称
    let myName = myMemberName;
    if (!myName) {
      const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
      myName = myTripRoles[trip.id] ? myTripRoles[trip.id].name : ((trip.members && trip.members[0]) || '队长');
    }

    // 寻找目标决策（如有指定 decisionId 则匹配，否则默认首个投票决策）
    let decision = null;
    if (targetDecisionId) {
      decision = trip.decisions.find(d => d && d.id === targetDecisionId);
    }
    if (!decision) {
      decision = trip.decisions.find(d => d && d.type === 'vote') || trip.decisions[0];
    }
    if (!decision) return;

    decision.voters = decision.voters || {};
    const myVote = decision.voters[myName] || '';

    this.setData({
      showQuickDecisionModal: true,
      quickDecisionTrip: trip,
      quickDecision: JSON.parse(JSON.stringify(decision)),
      quickDecisionMyVote: myVote,
      quickDecisionMyName: myName
    });
  },

  // 关闭首页快速决策弹窗
  closeQuickDecisionModal() {
    this.setData({
      showQuickDecisionModal: false,
      quickDecisionTrip: null,
      quickDecision: null,
      quickDecisionMyVote: '',
      quickDecisionMyName: ''
    });
  },

  // 首页快速决策：直接点选投票（单选、切换与撤销）
  async castQuickVote(e) {
    const optionId = e.currentTarget.dataset.optid;
    const { quickDecisionTrip, quickDecision, quickDecisionMyName, quickDecisionMyVote } = this.data;
    if (!quickDecisionTrip || !quickDecision || !optionId) return;

    const voterKey = quickDecisionMyName || '我';
    quickDecision.voters = quickDecision.voters || {};

    let newMyVote = '';
    if (quickDecisionMyVote === optionId) {
      // 撤销投票
      delete quickDecision.voters[voterKey];
      const opt = quickDecision.options.find(o => o.id === optionId);
      if (opt && opt.votes > 0) opt.votes--;
      newMyVote = '';
      wx.showToast({ title: '已撤销投票', icon: 'none' });
    } else {
      // 扣减旧选项票数
      if (quickDecisionMyVote) {
        const prevOpt = quickDecision.options.find(o => o.id === quickDecisionMyVote);
        if (prevOpt && prevOpt.votes > 0) prevOpt.votes--;
      }
      // 投给新选项
      quickDecision.voters[voterKey] = optionId;
      const targetOpt = quickDecision.options.find(o => o.id === optionId);
      if (targetOpt) {
        targetOpt.votes = (targetOpt.votes || 0) + 1;
      }
      newMyVote = optionId;
      wx.showToast({ title: '投票成功！', icon: 'success' });
    }

    // 更新到小队数据中并保存至云端数据库
    const dIdx = quickDecisionTrip.decisions.findIndex(d => d.id === quickDecision.id);
    if (dIdx !== -1) {
      quickDecisionTrip.decisions[dIdx] = JSON.parse(JSON.stringify(quickDecision));
      await updateTrip(quickDecisionTrip);
    }

    this.setData({
      quickDecision,
      quickDecisionMyVote: newMyVote,
      quickDecisionTrip
    });
  },

  // 从首页快速决策弹窗进入小队详情完整页
  goToQuickDecisionDetail() {
    const { quickDecisionTrip, quickDecision } = this.data;
    if (!quickDecisionTrip) return;
    const tripId = quickDecisionTrip.id;
    const decisionId = quickDecision ? quickDecision.id : '';
    this.closeQuickDecisionModal();
    wx.navigateTo({
      url: `/pages/trip/trip-detail?tripId=${tripId}&tab=decision&decisionId=${decisionId}`
    });
  },

  // 首页卡片上的快捷决策入口点击
  openTripQuickDecision(e) {
    const tripId = e.currentTarget.dataset.id;
    const trip = (this.data.trips || []).find(t => t.id === tripId);
    if (trip) {
      this.openQuickDecisionModalFromTrip(trip);
    }
  },

  // 跳转旅行小队详情（根据状态智能分流：进行中进工作台，已结束进专属历史回顾页）
  goToTripDetail(e) {
    const tripId = e.currentTarget.dataset.id;
    if (!tripId) return;
    const trip = (this.data.trips || []).find(t => t.id === tripId);
    const status = trip ? (trip.computedStatus || getTripStatus(trip)) : 'ongoing';

    if (status === 'finished') {
      wx.navigateTo({
        url: `/pages/trip/trip-history-detail?tripId=${tripId}`
      });
    } else {
      wx.navigateTo({
        url: `/pages/trip/trip-detail?tripId=${tripId}`
      });
    }
  },

  // 新建旅行活动
  goToTripCreate() {
    wx.navigateTo({
      url: '/pages/trip/trip-create'
    });
  },

  // 跳转行程列表（历史归档页）
  goToTripList() {
    wx.navigateTo({
      url: '/pages/trip/trip-list?tab=history'
    });
  },

  // 首页卡片直接删除/解散行程
  deleteTripFromHome(e) {
    const { id, title } = e.currentTarget.dataset;
    wx.showModal({
      title: '解散旅行小队',
      content: `确定要删除行程“${title || '该行程'}”吗？\n删除后该行程的所有数据将无法恢复。`,
      confirmText: '确认删除',
      confirmColor: '#EF4444',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在删除...' });
          await deleteTrip(id);
          await this.loadTrips();
          wx.hideLoading();
          wx.showToast({ title: '行程已删除', icon: 'none' });
        }
      }
    });
  },

  // 打开口令加入小队弹窗
  openJoinModal() {
    this.setData({
      showJoinModal: true,
      joinInputCode: '',
      joinMemberName: '',
      queriedTrip: null,
      selectedMemberName: '',
      isNewMember: false,
      isQueryingCode: false
    });

    // 智能解析剪贴板：如果剪贴板中有 6 位口令，自动提取填入并查询
    wx.getClipboardData({
      success: (res) => {
        const raw = (res.data || '').trim().toUpperCase();
        const match = raw.match(/[A-Z0-9]{6}/);
        if (match) {
          this.setData({
            joinInputCode: match[0]
          });
          this.queryTripByInputCode(match[0]);
        }
      },
      fail: () => {}
    });
  },

  // 关闭口令加入弹窗
  closeJoinModal() {
    this.setData({
      showJoinModal: false,
      queriedTrip: null,
      selectedMemberName: '',
      isNewMember: false,
      joinMemberName: '',
      isQueryingCode: false
    });
  },

  onJoinCodeInput(e) {
    let val = (e.detail.value || '').toUpperCase().trim();
    // 兼容粘贴整段带其他字符的内容，自动提取6位有效口令
    if (val.length > 6) {
      const match = val.match(/[A-Z0-9]{6}/);
      if (match) {
        val = match[0];
      }
    }
    this.setData({
      joinInputCode: val,
      queriedTrip: null,
      selectedMemberName: '',
      isNewMember: false
    });
  },

  onJoinNameInput(e) {
    this.setData({
      joinMemberName: e.detail.value || ''
    });
  },

  // 核心：处理通过微信邀请卡片/外链打开小程序时带入的口令
  async handleInviteCodeEntry(specifiedCode, query) {
    this._pendingInviteQuery = query || {};
    let code = (specifiedCode || '').trim().toUpperCase();
    const match = code.match(/[A-Z0-9]{6}/);
    if (match) {
      code = match[0];
    }
    if (!code || code.length < 6) return;

    wx.showLoading({ title: '正在识别小队...' });

    // 确保 openid 就绪
    let openid = this.data.userOpenid || wx.getStorageSync('openid');
    if (!openid && app && app.ensureOpenid) {
      try {
        openid = await app.ensureOpenid();
        if (openid) {
          this.setData({ userOpenid: openid });
        }
      } catch (e) {}
    }
    if (!openid) {
      try {
        openid = wx.getStorageSync('userInfo')?.openid || '';
      } catch (e) {}
    }

    const res = await queryTripByCode(code);
    wx.hideLoading();

    if (!res.success || !res.trip) {
      wx.showToast({ title: res.msg || '未查到对应小队', icon: 'none' });
      return;
    }

    const trip = res.trip;
    const currentOid = openid || this.data.userOpenid || wx.getStorageSync('openid');
    const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};

    // 关键比较：openid 匹配（创建者或已在成员 openid 列表中）或本地已有角色
    const isCreator = Boolean(currentOid && trip._openid && trip._openid === currentOid);
    const isJoinedMember = Boolean(currentOid && Array.isArray(trip.memberOpenids) && trip.memberOpenids.includes(currentOid));
    const hasLocalRole = Boolean(myTripRoles[trip.id]);

    if (isCreator || isJoinedMember || hasLocalRole) {
      // 已经加入了，直接补齐本地映射并进入详情
      if (!myTripRoles[trip.id]) {
        myTripRoles[trip.id] = {
          role: isCreator ? 'creator' : 'member',
          name: isCreator ? ((trip.members && trip.members[0]) || '队长') : ((trip.members && trip.members[1]) || '队员')
        };
        try { wx.setStorageSync('MY_TRIP_ROLES', myTripRoles); } catch (e) {}
      }

      // 同步最新行程到本地缓存
      await fetchTripByIdFromCloud(trip.id);
      this.loadTrips(currentOid);

      const q = this._pendingInviteQuery || {};
      if (q.action === 'quickVote' || q.tab === 'decision' || q.decisionId) {
        wx.showToast({ title: '欢迎归队！', icon: 'success' });
        const memberName = myTripRoles[trip.id]?.name || (isCreator ? '队长' : '队员');
        this.openQuickDecisionModalFromTrip(trip, q.decisionId, memberName);
        return;
      }

      let detailUrl = `/pages/trip/trip-detail?tripId=${trip.id}`;
      if (q.tab) detailUrl += `&tab=${q.tab}`;
      if (q.decisionId) detailUrl += `&decisionId=${q.decisionId}`;

      wx.showToast({ title: '欢迎归队！', icon: 'success' });
      setTimeout(() => {
        wx.navigateTo({
          url: detailUrl
        });
      }, 400);
      return;
    }

    // 未加入：打开弹窗展示小队信息，供直接勾选对应名称加入或新加入
    const members = trip.members || [];
    this.setData({
      showJoinModal: true,
      joinInputCode: code,
      queriedTrip: trip,
      selectedMemberName: '',
      isNewMember: members.length === 0,
      joinMemberName: ''
    });
  },

  // 查询口令对应的小队信息及成员
  async queryTripByInputCode(specifiedCode) {
    let code = typeof specifiedCode === 'string' ? specifiedCode : this.data.joinInputCode;
    code = (code || '').trim().toUpperCase();
    const match = code.match(/[A-Z0-9]{6}/);
    if (match) {
      code = match[0];
    }

    if (!code || code.length < 6) {
      wx.showToast({ title: '请输入6位有效口令', icon: 'none' });
      return;
    }

    this.setData({ isQueryingCode: true });
    wx.showLoading({ title: '正在查询小队...' });

    // 确保 openid 就绪
    let openid = this.data.userOpenid || wx.getStorageSync('openid');
    if (!openid && app && app.ensureOpenid) {
      try {
        openid = await app.ensureOpenid();
        if (openid) {
          this.setData({ userOpenid: openid });
        }
      } catch (e) {}
    }

    const res = await queryTripByCode(code);
    wx.hideLoading();
    this.setData({ isQueryingCode: false });

    if (res.success && res.trip) {
      const trip = res.trip;
      const currentOid = openid || this.data.userOpenid || wx.getStorageSync('openid');
      const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};

      // openid 比对判断是否已经加入
      const isCreator = Boolean(currentOid && trip._openid && trip._openid === currentOid);
      const isJoinedMember = Boolean(currentOid && Array.isArray(trip.memberOpenids) && trip.memberOpenids.includes(currentOid));
      const hasLocalRole = Boolean(myTripRoles[trip.id]);

      if (isCreator || isJoinedMember || hasLocalRole) {
        this.closeJoinModal();
        if (!myTripRoles[trip.id]) {
          myTripRoles[trip.id] = {
            role: isCreator ? 'creator' : 'member',
            name: isCreator ? ((trip.members && trip.members[0]) || '队长') : ((trip.members && trip.members[1]) || '队员')
          };
          try { wx.setStorageSync('MY_TRIP_ROLES', myTripRoles); } catch (e) {}
        }
        await fetchTripByIdFromCloud(trip.id);
        this.loadTrips(currentOid);

        wx.showToast({ title: '已在小队中，直接进入', icon: 'success' });
        setTimeout(() => {
          wx.navigateTo({
            url: `/pages/trip/trip-detail?tripId=${trip.id}`
          });
        }, 400);
        return;
      }

      const members = trip.members || [];
      this.setData({
        queriedTrip: trip,
        selectedMemberName: '',
        isNewMember: members.length === 0,
        joinMemberName: ''
      });
    } else {
      wx.showToast({ title: res.msg || '未查到对应小队', icon: 'none' });
    }
  },

  // 选择已有成员认领身份
  selectExistingMember(e) {
    const name = e.currentTarget.dataset.name;
    this.setData({
      selectedMemberName: name,
      isNewMember: false
    });
  },

  // 选择作为新成员加入
  selectNewMemberOption() {
    this.setData({
      selectedMemberName: '',
      isNewMember: true
    });
  },

  // 重置回到口令输入步骤
  resetQueriedTrip() {
    this.setData({
      queriedTrip: null,
      selectedMemberName: '',
      isNewMember: false,
      joinMemberName: ''
    });
  },

  // 确认进入 / 加入小队
  async confirmJoinTrip() {
    const { queriedTrip, isNewMember, selectedMemberName, joinMemberName, joinInputCode } = this.data;

    // 如果还没有查询小队，先触发查询
    if (!queriedTrip) {
      this.queryTripByInputCode();
      return;
    }

    if (!isNewMember && !selectedMemberName) {
      wx.showToast({ title: '请勾选你在小队中的名字', icon: 'none' });
      return;
    }

    if (isNewMember) {
      const name = (joinMemberName || '').trim();
      if (!name) {
        wx.showToast({ title: '请输入你的名字/昵称', icon: 'none' });
        return;
      }
      wx.showLoading({ title: '正在加入小队...' });
      const res = await joinTripByCode(queriedTrip.code || joinInputCode, name);
      wx.hideLoading();

      if (res.success) {
        wx.showToast({ title: '成功加入小队！', icon: 'success' });
        this.closeJoinModal();
        this.loadTrips();
        const q = this._pendingInviteQuery || {};
        if (q.action === 'quickVote' || q.tab === 'decision' || q.decisionId) {
          this.openQuickDecisionModalFromTrip(res.trip, q.decisionId, name);
        } else {
          let detailUrl = `/pages/trip/trip-detail?tripId=${res.trip.id}`;
          if (q.tab) detailUrl += `&tab=${q.tab}`;
          if (q.decisionId) detailUrl += `&decisionId=${q.decisionId}`;
          setTimeout(() => {
            wx.navigateTo({
              url: detailUrl
            });
          }, 500);
        }
      } else {
        wx.showToast({ title: res.msg || '加入失败', icon: 'none' });
      }
    } else {
      // 认领已有成员身份进入
      wx.showLoading({ title: '正在进入小队...' });
      const res = await claimTripMember(queriedTrip.id, selectedMemberName);
      wx.hideLoading();

      if (res.success) {
        wx.showToast({ title: `欢迎，${selectedMemberName}！`, icon: 'success' });
        this.closeJoinModal();
        this.loadTrips();
        const q = this._pendingInviteQuery || {};
        if (q.action === 'quickVote' || q.tab === 'decision' || q.decisionId) {
          this.openQuickDecisionModalFromTrip(res.trip, q.decisionId, selectedMemberName);
        } else {
          let detailUrl = `/pages/trip/trip-detail?tripId=${res.trip.id}`;
          if (q.tab) detailUrl += `&tab=${q.tab}`;
          if (q.decisionId) detailUrl += `&decisionId=${q.decisionId}`;
          setTimeout(() => {
            wx.navigateTo({
              url: detailUrl
            });
          }, 500);
        }
      } else {
        wx.showToast({ title: res.msg || '进入失败', icon: 'none' });
      }
    }
  }
})