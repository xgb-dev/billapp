const { 
  getTripById, 
  fetchTripByIdFromCloud,
  updateTrip, 
  deleteTrip, 
  addMemberToTrip,
  syncTripExpensesToPersonalBills,
  calculateAASettlement,
  toggleSettledTransfer,
  settleAllTransfers,
  resetAllTransfers
} = require('../../utils/tripData.js');

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

    // 动态添加成员弹窗
    showAddMemberModal: false,
    newMemberInputName: '',
    isSyncingBills: false,

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
    myMemberName: '队长'
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

  // 加载活动全部数据与计算衍生状态（支持云端拉取，避免口令进入时详情为空）
  async loadTripData() {
    const tripId = this.data.tripId;
    if (!tripId) return;

    // 1. 先尝试从本地读取秒开
    let trip = getTripById(tripId);
    if (trip) {
      this.renderTripData(trip);
    } else {
      wx.showLoading({ title: '加载小队中...' });
    }

    // 2. 无论本地是否存在，都请求云端拉取最新数据（确保口令跳转或他人记账时实时更新）
    try {
      const cloudTrip = await fetchTripByIdFromCloud(tripId);
      if (!trip) wx.hideLoading();
      if (cloudTrip) {
        this.renderTripData(cloudTrip);
      } else if (!trip) {
        wx.showToast({ title: '未找到该小队信息', icon: 'none' });
      }
    } catch (e) {
      if (!trip) {
        wx.hideLoading();
        wx.showToast({ title: '加载小队失败', icon: 'none' });
      }
    }
  },

  renderTripData(trip) {
    const tripId = this.data.tripId;
    if (!trip) return;

    // 确保口令存在
    if (!trip.code) {
      const { generateInviteCode } = require('../../utils/tripData.js');
      trip.code = generateInviteCode();
      updateTrip(trip);
    }

    // 识别身份
    const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
    const myRoleInfo = myTripRoles[tripId];
    const isCreator = myRoleInfo ? (myRoleInfo.role === 'creator') : true;
    const myMemberName = myRoleInfo ? myRoleInfo.name : ((trip.members && trip.members[0]) || '队长');

    // 1. 计算清单进度
    const checklist = trip.checklist || [];
    const total = checklist.length;
    const checked = checklist.filter(item => item.checked).length;
    const percent = total > 0 ? Math.round((checked / total) * 100) : 0;

    // 2. 计算 AA 结算结果（含已结清转账状态）
    const settlement = calculateAASettlement(trip.members, trip.expenses, trip.settledTransfers || []);

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

  // 复制 6 位专属小队口令（仅复制纯6位代码，配合首页输入与自动解析）
  copyInviteCode() {
    const code = this.data.trip ? this.data.trip.code : '';
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({ title: '口令已复制', icon: 'success' });
      }
    });
  },


  // 队员主动退出小队（含费用未结清安全校验）
  handleLeaveTrip() {
    const trip = this.data.trip;
    const title = trip ? trip.title : '该行程';
    const myName = this.data.myMemberName;
    const settlement = this.data.settlement || {};
    const memberSummaries = settlement.memberSummaries || [];
    
    // 查找本人在结算单中的结余数据（balance = paid - owed）
    const mySummary = memberSummaries.find(m => m.name === myName || m.rawName === myName);
    const pendingDebt = mySummary ? parseFloat(mySummary.pendingDebt || 0) : 0;
    const pendingCredit = mySummary ? parseFloat(mySummary.pendingCredit || 0) : 0;

    // 校验 1：本人有未结清的待付金额（防逃单）
    if (pendingDebt > 0.01) {
      const debtAmt = pendingDebt.toFixed(2);
      wx.showModal({
        title: '暂无法退出小队',
        content: `您在小队中仍有待分摊费用 ¥${debtAmt} 尚未结清。\n请向对应垫付队友转账后点击“标记已结”，即可完成平账并退出。`,
        confirmText: '我知道了',
        confirmColor: '#10B981',
        showCancel: false
      });
      return;
    }

    // 校验 2：本人曾垫付过消费但尚未完全收回
    if (pendingCredit > 0.01) {
      const creditAmt = pendingCredit.toFixed(2);
      wx.showModal({
        title: '待收款提醒',
        content: `您曾垫付过消费，目前仍有待收费用 ¥${creditAmt} 尚未收齐。\n如果此时退出小队，后续将无法在小队工作台核对账单。确定仍要退出吗？`,
        confirmText: '仍要退出',
        confirmColor: '#EF4444',
        cancelText: '暂不退出',
        success: (res) => {
          if (res.confirm) {
            this.doLeaveTrip();
          }
        }
      });
      return;
    }

    // 校验 3：参与过历史消费但已全部结清平账
    const hasHistoryExpenses = (trip.expenses || []).some(
      e => e.payer === myName || (e.participants && e.participants.includes(myName))
    );

    if (hasHistoryExpenses) {
      wx.showModal({
        title: '退出小队确认',
        content: `您在“${title}”中的账目已全部结清平账。\n退出后，历史账单仍会保留过往消费记录，新发起的费用将不再由您分摊。确认退出吗？`,
        confirmText: '确认退出',
        confirmColor: '#EF4444',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.doLeaveTrip();
          }
        }
      });
      return;
    }

    // 校验 4：未参与过任何费用，零账务干净退出
    wx.showModal({
      title: '退出小队',
      content: `确定要退出“${title}”小队吗？`,
      confirmText: '确认退出',
      confirmColor: '#EF4444',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.doLeaveTrip();
        }
      }
    });
  },

  // 打开添加成员弹窗
  openAddMemberModal() {
    this.setData({
      showAddMemberModal: true,
      newMemberInputName: ''
    });
  },

  // 关闭添加成员弹窗
  closeAddMemberModal() {
    this.setData({ showAddMemberModal: false });
  },

  onNewMemberInput(e) {
    this.setData({ newMemberInputName: e.detail.value || '' });
  },

  // 确认添加成员
  confirmAddMember() {
    const name = (this.data.newMemberInputName || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入队员姓名', icon: 'none' });
      return;
    }
    const res = addMemberToTrip(this.data.tripId, name);
    if (res.success) {
      wx.showToast({ title: `成功添加队员 ${name}`, icon: 'success' });
      this.setData({ showAddMemberModal: false });
      this.loadTripData();
    } else {
      wx.showToast({ title: res.msg || '添加失败', icon: 'none' });
    }
  },

  // 切换单个转账方案的结清/未结状态（权限控制：仅队长或收款人可标记）
  toggleSettleTransfer(e) {
    const planId = e.currentTarget.dataset.planid;
    if (!planId) return;

    const plans = (this.data.settlement && this.data.settlement.transferPlans) || [];
    const plan = plans.find(p => p.id === planId);
    if (!plan) return;

    // 权限校验：仅队长或实际收款人可操作结清
    const isReceiver = (plan.rawTo === this.data.myMemberName) || (plan.to === this.data.myMemberName);
    if (!this.data.isCreator && !isReceiver) {
      wx.showModal({
        title: '仅队长或收款人可操作',
        content: `该笔转账是由“${plan.from}”付给“${plan.to}”。\n为确保账务真实，仅小队队长或收款人 [${plan.to}] 可确认并标记结清。`,
        showCancel: false,
        confirmText: '我知道了',
        confirmColor: '#10B981'
      });
      return;
    }

    const res = toggleSettledTransfer(this.data.tripId, planId, this.data.myMemberName);
    if (res.success) {
      wx.showToast({
        title: res.isSettled ? '已标记结清' : '已撤销结清',
        icon: 'success'
      });
      this.loadTripData();
    }
  },

  // 一键全部标记结清（仅队长可操作）
  handleSettleAllTransfers() {
    if (!this.data.isCreator) {
      wx.showToast({ title: '仅队长可执行一键全结', icon: 'none' });
      return;
    }

    const plans = this.data.settlement ? this.data.settlement.transferPlans : [];
    if (!plans || plans.length === 0) return;

    wx.showModal({
      title: '一键结清确认',
      content: '确定将当前所有转账方案全部标记为已结清吗？',
      confirmText: '全部结清',
      confirmColor: '#10B981',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          settleAllTransfers(this.data.tripId, plans, this.data.myMemberName);
          wx.showToast({ title: '已全部标记结清', icon: 'success' });
          this.loadTripData();

          // 提示是否将花销同步到个人记账本
          setTimeout(() => {
            wx.showModal({
              title: '账单已平账结清 🎉',
              content: '是否现在将本行程中属于您的花销记录同步到个人记账本中？',
              confirmText: '立即同步',
              confirmColor: '#10B981',
              cancelText: '暂不同步',
              success: (syncRes) => {
                if (syncRes.confirm) {
                  this.handleSyncToPersonalBills();
                }
              }
            });
          }, 800);
        }
      }
    });
  },

  // 重置全部结清状态（仅队长可操作）
  handleResetAllTransfers() {
    if (!this.data.isCreator) {
      wx.showToast({ title: '仅队长可重置结清状态', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '重置结清状态',
      content: '确定要将所有转账重新恢复为待结转账吗？',
      confirmText: '确认重置',
      confirmColor: '#EF4444',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          resetAllTransfers(this.data.tripId);
          wx.showToast({ title: '已重置结清状态', icon: 'none' });
          this.loadTripData();
        }
      }
    });
  },

  // 同步当前小队花销至个人账本 (wxapp 表)
  async handleSyncToPersonalBills() {
    const trip = this.data.trip;
    if (!trip) return;

    wx.showLoading({ title: '正在同步到个人账本...', mask: true });
    this.setData({ isSyncingBills: true });
    const res = await syncTripExpensesToPersonalBills(trip, this.data.myMemberName);
    wx.hideLoading();
    this.setData({ isSyncingBills: false });

    if (res.success) {
      wx.showModal({
        title: '个人账单同步完成',
        content: res.msg,
        showCancel: false,
        confirmText: '太棒了',
        confirmColor: '#10B981'
      });
    } else {
      wx.showToast({ title: res.msg || '同步失败', icon: 'none' });
    }
  },

  // 执行退出逻辑
  doLeaveTrip() {
    const { leaveTrip } = require('../../utils/tripData.js');
    leaveTrip(this.data.tripId, this.data.myMemberName);
    wx.showToast({ title: '已退出小队', icon: 'success' });
    setTimeout(() => {
      wx.navigateBack({ delta: 1 });
    }, 800);
  }
});

