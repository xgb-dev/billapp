const { getTripById, updateTrip, deleteTrip, calculateAASettlement } = require('../../utils/tripData.js');

Page({
  data: {
    tripId: '',
    trip: null,
    currentTab: 'checklist', // 'checklist' | 'aa' | 'decision'
    
    // 清单数据
    checklistProgress: { total: 0, checked: 0, percent: 0 },
    categories: ['全部', '证件文件', '衣物穿搭', '洗漱药品', '数码配件', '出行必带', '营地装备', '餐饮炊事', '其他'],
    selectedCategoryFilter: '全部',
    filteredChecklist: [],
    showAddChecklistModal: false,
    newChecklistTitle: '',
    newChecklistCategory: '出行必带',
    newChecklistAssignee: '所有人',

    // AA 结算数据
    settlement: {
      totalExpense: '0.00',
      memberSummaries: [],
      transferPlans: [],
      groupSummaryText: ''
    },

    // 决策与转盘数据
    activeDecisionIndex: 0,
    showAddDecisionModal: false,
    newDecisionTitle: '',
    newDecisionOptions: ['', ''],
    isSpinning: false,
    wheelWinner: '',
    showWinnerModal: false,

    // 用户身份角色
    isCreator: true,
    myMemberName: '我'
  },

  onLoad(options) {
    if (options.tripId) {
      this.setData({ tripId: options.tripId });
    }
  },

  onShow() {
    this.loadTripData();
  },

  // 微信转发分享卡片
  onShareAppMessage() {
    const trip = this.data.trip || {};
    return {
      title: `邀请你加入【${trip.title || '旅行小队'}】，口令：${trip.code || ''}`,
      path: `/pages/index/index?joinCode=${trip.code || ''}`
    };
  },

  // 加载活动全部数据与计算衍生状态
  loadTripData() {
    const tripId = this.data.tripId;
    if (!tripId) return;

    const trip = getTripById(tripId);
    if (!trip) {
      wx.showToast({ title: '未找到该活动', icon: 'none' });
      return;
    }

    // 确保口令存在
    if (!trip.code) {
      const { generateInviteCode } = require('../../utils/tripData.js');
      trip.code = generateInviteCode();
      updateTrip(trip);
    }

    // 识别身份
    const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
    const myRoleInfo = myTripRoles[tripId];
    const isCreator = !myRoleInfo || myRoleInfo.role === 'creator';
    const myMemberName = myRoleInfo ? myRoleInfo.name : '我';

    // 1. 计算清单进度
    const checklist = trip.checklist || [];
    const total = checklist.length;
    const checked = checklist.filter(item => item.checked).length;
    const percent = total > 0 ? Math.round((checked / total) * 100) : 0;

    // 2. 计算 AA 结算结果
    const settlement = calculateAASettlement(trip.members, trip.expenses);

    // 3. 筛选当前清单
    const cat = this.data.selectedCategoryFilter;
    const filtered = (cat === '全部') 
      ? checklist 
      : checklist.filter(item => item.category === cat);

    this.setData({
      trip,
      checklistProgress: { total, checked, percent },
      filteredChecklist: filtered,
      settlement,
      isCreator,
      myMemberName
    });
  },

  // 切换 Tab
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
  },

  /* ==================== 1. 旅行清单模块 ==================== */
  // 筛选分类
  selectCategoryFilter(e) {
    const cat = e.currentTarget.dataset.cat;
    const checklist = this.data.trip.checklist || [];
    const filtered = (cat === '全部') 
      ? checklist 
      : checklist.filter(item => item.category === cat);

    this.setData({
      selectedCategoryFilter: cat,
      filteredChecklist: filtered
    });
  },

  // 勾选/反选清单项
  toggleChecklistItem(e) {
    const id = e.currentTarget.dataset.id;
    const trip = { ...this.data.trip };
    const list = trip.checklist || [];

    const target = list.find(item => item.id === id);
    if (target) {
      target.checked = !target.checked;
      updateTrip(trip);
      this.loadTripData();
    }
  },

  // 删除清单项
  deleteChecklistItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定要移除此项清单吗？',
      confirmColor: '#EF4444',
      success: (res) => {
        if (res.confirm) {
          const trip = { ...this.data.trip };
          trip.checklist = (trip.checklist || []).filter(item => item.id !== id);
          updateTrip(trip);
          this.loadTripData();
          wx.showToast({ title: '已删除', icon: 'none' });
        }
      }
    });
  },

  // 打开添加清单弹窗
  openAddChecklist() {
    this.setData({
      showAddChecklistModal: true,
      newChecklistTitle: '',
      newChecklistCategory: '出行必带',
      newChecklistAssignee: '所有人'
    });
  },

  closeAddChecklist() {
    this.setData({ showAddChecklistModal: false });
  },

  onNewChecklistTitleInput(e) {
    this.setData({ newChecklistTitle: e.detail.value });
  },

  onNewChecklistCatSelect(e) {
    this.setData({ newChecklistCategory: e.currentTarget.dataset.cat });
  },

  onNewChecklistAssigneeSelect(e) {
    this.setData({ newChecklistAssignee: e.currentTarget.dataset.member });
  },

  // 确认添加清单项
  confirmAddChecklistItem() {
    const title = this.data.newChecklistTitle.trim();
    if (!title) {
      wx.showToast({ title: '请输入物品名称', icon: 'none' });
      return;
    }

    const trip = { ...this.data.trip };
    trip.checklist = trip.checklist || [];
    trip.checklist.push({
      id: 'item_' + Date.now(),
      title,
      category: this.data.newChecklistCategory,
      assignee: this.data.newChecklistAssignee,
      checked: false
    });

    updateTrip(trip);
    this.closeAddChecklist();
    this.loadTripData();
    wx.showToast({ title: '添加成功', icon: 'success' });
  },

  /* ==================== 2. AA 结算模块 ==================== */
  // 跳转到记一笔 AA 页面
  goToAddAA() {
    wx.navigateTo({
      url: `/pages/trip/aa-add?tripId=${this.data.tripId}`
    });
  },

  // 复制微信群对账单
  copySettlementText() {
    const text = this.data.settlement.groupSummaryText;
    if (!text) return;

    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '对账单已复制', icon: 'success' });
      }
    });
  },

  // 删除某笔 AA 消费
  deleteExpense(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除消费记录',
      content: '确定要删除该笔 AA 消费吗？清算方案将重新核算。',
      confirmColor: '#EF4444',
      success: (res) => {
        if (res.confirm) {
          const trip = { ...this.data.trip };
          trip.expenses = (trip.expenses || []).filter(item => item.id !== id);
          updateTrip(trip);
          this.loadTripData();
          wx.showToast({ title: '已移除记录', icon: 'none' });
        }
      }
    });
  },

  /* ==================== 3. 多人决策 & 随机转盘模块 ==================== */
  // 切换当前决策主题
  selectDecisionTab(e) {
    const idx = e.currentTarget.dataset.index;
    this.setData({ activeDecisionIndex: idx });
  },

  // 投票
  castVote(e) {
    const optionId = e.currentTarget.dataset.optid;
    const { trip, activeDecisionIndex } = this.data;
    if (!trip || !trip.decisions || !trip.decisions[activeDecisionIndex]) return;

    const currentDecision = trip.decisions[activeDecisionIndex];
    const targetOpt = currentDecision.options.find(o => o.id === optionId);
    if (targetOpt) {
      targetOpt.votes = (targetOpt.votes || 0) + 1;
      updateTrip(trip);
      this.setData({ trip });
      wx.showToast({ title: '投票成功 +1', icon: 'none' });
    }
  },

  // 命运随机转盘抽签
  spinWheel() {
    const { trip, activeDecisionIndex, isSpinning } = this.data;
    if (isSpinning) return;

    const currentDecision = trip.decisions && trip.decisions[activeDecisionIndex];
    if (!currentDecision || !currentDecision.options || currentDecision.options.length === 0) {
      wx.showToast({ title: '没有可选候选项', icon: 'none' });
      return;
    }

    const opts = currentDecision.options;
    this.setData({ isSpinning: true });

    // 动画模拟：每隔 100ms 变换一次，持续 1.5 秒
    let count = 0;
    const timer = setInterval(() => {
      const tempIdx = Math.floor(Math.random() * opts.length);
      this.setData({ wheelWinner: opts[tempIdx].text });
      count++;
      if (count >= 15) {
        clearInterval(timer);
        const finalWinner = opts[Math.floor(Math.random() * opts.length)].text;
        this.setData({
          isSpinning: false,
          wheelWinner: finalWinner,
          showWinnerModal: true
        });
      }
    }, 100);
  },

  closeWinnerModal() {
    this.setData({ showWinnerModal: false });
  },

  // 打开新建决策弹窗
  openAddDecision() {
    this.setData({
      showAddDecisionModal: true,
      newDecisionTitle: '',
      newDecisionOptions: ['', '']
    });
  },

  closeAddDecision() {
    this.setData({ showAddDecisionModal: false });
  },

  onDecisionTitleInput(e) {
    this.setData({ newDecisionTitle: e.detail.value });
  },

  onDecisionOptionInput(e) {
    const idx = e.currentTarget.dataset.index;
    const opts = [...this.data.newDecisionOptions];
    opts[idx] = e.detail.value;
    this.setData({ newDecisionOptions: opts });
  },

  addMoreOption() {
    if (this.data.newDecisionOptions.length >= 8) {
      wx.showToast({ title: '最多支持 8 个选项', icon: 'none' });
      return;
    }
    const opts = [...this.data.newDecisionOptions, ''];
    this.setData({ newDecisionOptions: opts });
  },

  confirmAddDecision() {
    const title = this.data.newDecisionTitle.trim();
    if (!title) {
      wx.showToast({ title: '请输入决策主题', icon: 'none' });
      return;
    }

    const validOpts = this.data.newDecisionOptions
      .map(o => o.trim())
      .filter(o => o.length > 0);

    if (validOpts.length < 2) {
      wx.showToast({ title: '至少需要 2 个选项', icon: 'none' });
      return;
    }

    const newDecision = {
      id: 'd_' + Date.now(),
      title,
      type: 'vote',
      options: validOpts.map((text, idx) => ({
        id: 'opt_' + idx + '_' + Date.now(),
        text,
        votes: 0
      }))
    };

    const trip = { ...this.data.trip };
    trip.decisions = trip.decisions || [];
    trip.decisions.push(newDecision);

    updateTrip(trip);
    this.closeAddDecision();
    this.setData({
      trip,
      activeDecisionIndex: trip.decisions.length - 1
    });
    wx.showToast({ title: '决策发起成功', icon: 'success' });
  },

  // 删除决策主题
  deleteDecision(e) {
    const idx = e.currentTarget.dataset.index;
    wx.showModal({
      title: '删除决策',
      content: '确定要删除该决策主题吗？',
      confirmColor: '#EF4444',
      success: (res) => {
        if (res.confirm) {
          const trip = { ...this.data.trip };
          trip.decisions.splice(idx, 1);
          updateTrip(trip);
          this.setData({
            trip,
            activeDecisionIndex: Math.max(0, trip.decisions.length - 1)
          });
          wx.showToast({ title: '已删除', icon: 'none' });
        }
      }
    });
  },

  // 解散/删除当前旅行小队
  handleDeleteTrip() {
    const tripTitle = this.data.trip ? this.data.trip.title : '当前行程';
    wx.showModal({
      title: '解散旅行小队',
      content: `确定要解散并删除行程“${tripTitle}”吗？\n删除后清单、AA消费流水及决策记录将无法恢复。`,
      confirmText: '确认解散',
      confirmColor: '#EF4444',
      cancelText: '再想想',
      success: (res) => {
        if (res.confirm) {
          deleteTrip(this.data.tripId);
          wx.showToast({ title: '行程已解散删除', icon: 'success' });
          setTimeout(() => {
            wx.navigateBack({ delta: 1 });
          }, 800);
        }
      }
    });
  },

  // 复制 6 位专属小队口令文案
  copyInviteCode() {
    const code = this.data.trip ? this.data.trip.code : '';
    const title = this.data.trip ? this.data.trip.title : '旅行小分队';
    const text = `【${title}】邀请你加入小队！\n🔑 6位加入口令：${code}\n打开小程序输入口令，即可一起打包装备清单、AA实时平账与命运抽签决策！`;
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '邀请口令已复制', icon: 'success' });
      }
    });
  },

  // 队员主动退出小队
  handleLeaveTrip() {
    const title = this.data.trip ? this.data.trip.title : '该行程';
    wx.showModal({
      title: '退出小队',
      content: `确定要退出“${title}”吗？`,
      confirmText: '确认退出',
      confirmColor: '#EF4444',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          const { leaveTrip } = require('../../utils/tripData.js');
          leaveTrip(this.data.tripId, this.data.myMemberName);
          wx.showToast({ title: '已退出小队', icon: 'none' });
          setTimeout(() => {
            wx.navigateBack({ delta: 1 });
          }, 800);
        }
      }
    });
  }
});

