const { 
  fetchTripByIdFromCloud,
  updateTrip, 
  deleteTrip, 
  addMemberToTrip,
  syncTripExpensesToPersonalBills,
  getPendingPersonalSyncInfo,
  getTripStatus,
  getTripSettlementInfo,
  finishTrip,
  reopenTrip,
  calculateAASettlement,
  toggleSettledTransfer,
  settleAllTransfers,
  resetAllTransfers,
  generateInviteCode
} = require('../../utils/tripData.js');

Page({
  data: {
    tripId: '',
    trip: null,
    currentTab: 'checklist', // 'checklist' | 'aa' | 'decision'
    tripStatus: 'ongoing', // 'ongoing' | 'finished'
    settlementInfo: { isAllSettled: true, pendingCount: 0, pendingAmount: '0.00' },
    
    // 清单数据
    checklistProgress: { total: 0, checked: 0, percent: 0 },
    categories: ['全部', '证件文件', '衣物穿搭', '洗漱药品', '数码配件', '出行必带', '营地装备', '餐饮炊事', '其他'],
    selectedCategoryFilter: '全部',
    filteredChecklist: [],
    showAddChecklistModal: false,
    newChecklistTitle: '',
    newChecklistCategory: '出行必带',
    newChecklistAssignee: '所有人',

    // 动态添加成员与修改成员弹窗
    showAddMemberModal: false,
    newMemberInputName: '',
    showEditMemberModal: false,
    editingMemberIndex: -1,
    editingMemberOldName: '',
    editingMemberNewName: '',
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
    const tripId = (options && (options.tripId || options.id)) || '';
    const initialData = { tripId };
    if (options && options.tab) {
      initialData.currentTab = options.tab;
    }
    if (options && options.decisionId) {
      initialData.targetDecisionId = options.decisionId;
    }
    if (tripId) {
      this.setData(initialData, () => {
        this.loadTripData();
      });
    }
  },

  onShow() {
    this.loadTripData();
  },

  // 微信转发分享卡片（支持普通小队邀请与特定决策主题快速投票分享）
  onShareAppMessage(res) {
    const trip = this.data.trip || {};
    // 如果是从决策转盘的“分享邀请投票”按钮发起的
    if (res && res.from === 'button' && res.target && res.target.dataset && res.target.dataset.type === 'decision') {
      const decision = trip.decisions && trip.decisions[this.data.activeDecisionIndex];
      const decisionTitle = decision ? decision.title : '多人决策';
      return {
        title: `【小队投票】${decisionTitle}，快来投上你的一票！`,
        path: `/pages/index/index?joinCode=${trip.code || ''}&action=quickVote&tab=decision&decisionId=${decision ? decision.id : ''}&tripId=${trip.id}`
      };
    }
    return {
      title: `邀请你加入【${trip.title || '旅行小队'}】，口令：${trip.code || ''}`,
      path: `/pages/index/index?joinCode=${trip.code || ''}&tripId=${trip.id || ''}`
    };
  },

  // 加载活动全部数据（直接直查 Supabase 云端数据库，保证与数据库完全对齐）
  async loadTripData() {
    const tripId = this.data.tripId;
    if (!tripId) return;

    if (!this.data.trip) {
      wx.showLoading({ title: '加载小队中...' });
    }

    try {
      const cloudTrip = await fetchTripByIdFromCloud(tripId);
      if (!this.data.trip) wx.hideLoading();
      if (cloudTrip) {
        this.renderTripData(cloudTrip);
      } else {
        wx.showToast({ title: '未找到该小队信息', icon: 'none' });
      }
    } catch (e) {
      if (!this.data.trip) wx.hideLoading();
      wx.showToast({ title: '加载小队失败', icon: 'none' });
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

    // 3. 计算行程生命周期状态与平账信息
    const tripStatus = getTripStatus(trip);
    const settlementInfo = getTripSettlementInfo(trip);

    // 4. 筛选当前清单
    const cat = this.data.selectedCategoryFilter;
    const filtered = (cat === '全部') 
      ? checklist 
      : checklist.filter(item => item.category === cat);

    // 5. 定位目标决策（如果是通过特定投票卡片进入）
    let activeDecisionIndex = this.data.activeDecisionIndex || 0;
    if (this.data.targetDecisionId && Array.isArray(trip.decisions)) {
      const idx = trip.decisions.findIndex(d => d && d.id === this.data.targetDecisionId);
      if (idx !== -1) {
        activeDecisionIndex = idx;
      }
    }

    this.setData({
      trip,
      tripStatus,
      settlementInfo,
      checklistProgress: { total, checked, percent },
      filteredChecklist: filtered,
      settlement,
      isCreator,
      myMemberName,
      activeDecisionIndex
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
  async toggleChecklistItem(e) {
    const id = e.currentTarget.dataset.id;
    const trip = { ...this.data.trip };
    const list = trip.checklist || [];

    const target = list.find(item => item.id === id);
    if (target) {
      target.checked = !target.checked;
      this.renderTripData(trip);
      await updateTrip(trip);
    }
  },

  // 删除清单项
  deleteChecklistItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定要移除此项清单吗？',
      confirmColor: '#EF4444',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在删除...' });
          const trip = { ...this.data.trip };
          trip.checklist = (trip.checklist || []).filter(item => item.id !== id);
          await updateTrip(trip);
          await this.loadTripData();
          wx.hideLoading();
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
  async confirmAddChecklistItem() {
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

    wx.showLoading({ title: '正在添加...' });
    await updateTrip(trip);
    this.closeAddChecklist();
    await this.loadTripData();
    wx.hideLoading();
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
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在删除...' });
          const trip = { ...this.data.trip };
          trip.expenses = (trip.expenses || []).filter(item => item.id !== id);
          await updateTrip(trip);
          await this.loadTripData();
          wx.hideLoading();
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

  // 投票（支持按队员记名、单选切换与撤销）
  async castVote(e) {
    const optionId = e.currentTarget.dataset.optid;
    const { trip, activeDecisionIndex, myMemberName } = this.data;
    if (!trip || !trip.decisions || !trip.decisions[activeDecisionIndex]) return;

    const currentDecision = trip.decisions[activeDecisionIndex];
    currentDecision.voters = currentDecision.voters || {};
    const voterKey = myMemberName || '我';

    const previousVoteOptId = currentDecision.voters[voterKey];
    if (previousVoteOptId === optionId) {
      // 再次点击已投选项，撤销投票
      delete currentDecision.voters[voterKey];
      const opt = currentDecision.options.find(o => o.id === optionId);
      if (opt && opt.votes > 0) opt.votes--;
      wx.showToast({ title: '已撤销投票', icon: 'none' });
    } else {
      // 如果之前投过其他选项，先从旧选项扣减票数
      if (previousVoteOptId) {
        const prevOpt = currentDecision.options.find(o => o.id === previousVoteOptId);
        if (prevOpt && prevOpt.votes > 0) prevOpt.votes--;
      }
      // 投给新选项
      currentDecision.voters[voterKey] = optionId;
      const targetOpt = currentDecision.options.find(o => o.id === optionId);
      if (targetOpt) {
        targetOpt.votes = (targetOpt.votes || 0) + 1;
      }
      wx.showToast({ title: '投票成功', icon: 'success' });
    }

    await updateTrip(trip);
    this.setData({ trip });
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

  async confirmAddDecision() {
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

    wx.showLoading({ title: '正在发起...' });
    await updateTrip(trip);
    this.closeAddDecision();
    this.setData({
      trip,
      activeDecisionIndex: trip.decisions.length - 1
    });
    wx.hideLoading();
    wx.showToast({ title: '决策发起成功', icon: 'success' });
  },

  // 删除决策主题
  deleteDecision(e) {
    const idx = e.currentTarget.dataset.index;
    wx.showModal({
      title: '删除决策',
      content: '确定要删除该决策主题吗？',
      confirmColor: '#EF4444',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在删除...' });
          const trip = { ...this.data.trip };
          trip.decisions.splice(idx, 1);
          await updateTrip(trip);
          this.setData({
            trip,
            activeDecisionIndex: Math.max(0, trip.decisions.length - 1)
          });
          wx.hideLoading();
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
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在解散...' });
          await deleteTrip(this.data.tripId);
          wx.hideLoading();
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
  async confirmAddMember() {
    const name = (this.data.newMemberInputName || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入队员姓名', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '正在添加队员...' });
    const res = await addMemberToTrip(this.data.tripId, name);
    wx.hideLoading();
    if (res.success) {
      wx.showToast({ title: `成功添加队员 ${name}`, icon: 'success' });
      this.setData({ showAddMemberModal: false });
      await this.loadTripData();
    } else {
      wx.showToast({ title: res.msg || '添加失败', icon: 'none' });
    }
  },

  // 打开修改成员名称弹窗
  openEditMemberNameModal(e) {
    const { name, index } = e.currentTarget.dataset;
    this.setData({
      showEditMemberModal: true,
      editingMemberIndex: Number(index),
      editingMemberOldName: name,
      editingMemberNewName: name
    });
  },

  // 关闭修改成员名称弹窗
  closeEditMemberModal() {
    this.setData({
      showEditMemberModal: false,
      editingMemberIndex: -1,
      editingMemberOldName: '',
      editingMemberNewName: ''
    });
  },

  onEditingMemberInput(e) {
    this.setData({ editingMemberNewName: e.detail.value || '' });
  },

  // 确认修改成员名称（全量级联更新成员列表、待办指派、AA消费记账及个人角色）
  async confirmEditMemberName() {
    const oldName = this.data.editingMemberOldName;
    let newName = (this.data.editingMemberNewName || '').trim();
    const idx = this.data.editingMemberIndex;
    const trip = this.data.trip;

    if (!trip || idx < 0) return;

    if (!newName) {
      if (idx === 0) {
        newName = '队长';
      } else {
        wx.showToast({ title: '成员姓名不能为空', icon: 'none' });
        return;
      }
    }

    if (newName === oldName) {
      this.closeEditMemberModal();
      return;
    }

    // 查重：除自身外的其他成员不能同名
    const otherMembers = (trip.members || []).filter((m, i) => i !== idx);
    if (otherMembers.includes(newName)) {
      wx.showToast({ title: '小队中已有同名成员', icon: 'none' });
      return;
    }

    // 1. 更新成员列表
    trip.members[idx] = newName;

    // 2. 级联更新待办清单指派人
    if (Array.isArray(trip.checklist)) {
      trip.checklist.forEach(item => {
        if (item.assignee === oldName) {
          item.assignee = newName;
        }
      });
    }

    // 3. 级联更新 AA 消费付款人及平摊参与人
    if (Array.isArray(trip.expenses)) {
      trip.expenses.forEach(exp => {
        if (exp.payer === oldName) {
          exp.payer = newName;
        }
        if (Array.isArray(exp.participants)) {
          exp.participants = exp.participants.map(p => p === oldName ? newName : p);
        }
      });
    }

    // 4. 级联更新转账结清记录
    if (Array.isArray(trip.settledTransfers)) {
      trip.settledTransfers.forEach(s => {
        if (s.from === oldName) s.from = newName;
        if (s.to === oldName) s.to = newName;
        if (s.settledBy === oldName) s.settledBy = newName;
      });
    }

    // 5. 如果修改的是当前设备本人的名称，同步更新本地身份角色缓存
    if (this.data.myMemberName === oldName) {
      this.setData({ myMemberName: newName });
      try {
        const myTripRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
        if (myTripRoles[trip.id]) {
          myTripRoles[trip.id].name = newName;
          wx.setStorageSync('MY_TRIP_ROLES', myTripRoles);
        }
      } catch (e) {}
    }

    // 6. 保存同步云端
    wx.showLoading({ title: '正在更新名称...' });
    await updateTrip(trip);
    wx.hideLoading();

    this.closeEditMemberModal();
    this.renderTripData(trip);
    wx.showToast({ title: '名称已更新', icon: 'success' });
  },

  // 切换单个转账方案的结清/未结状态（权限控制：仅队长或收款人可标记）
  async toggleSettleTransfer(e) {
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

    wx.showLoading({ title: '正在更新...' });
    const res = await toggleSettledTransfer(this.data.tripId, planId, this.data.myMemberName);
    wx.hideLoading();
    if (res.success) {
      wx.showToast({
        title: res.isSettled ? '已标记结清' : '已撤销结清',
        icon: 'success'
      });
      await this.loadTripData();
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
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在全员结清...' });
          await settleAllTransfers(this.data.tripId, plans, this.data.myMemberName);
          wx.hideLoading();
          wx.showToast({ title: '已全部标记结清', icon: 'success' });
          await this.loadTripData();

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
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在重置...' });
          await resetAllTransfers(this.data.tripId);
          wx.hideLoading();
          wx.showToast({ title: '已重置结清状态', icon: 'none' });
          await this.loadTripData();
        }
      }
    });
  },

  // 同步当前小队花销至个人账本 (wxapp 表)，支持二次确认
  async handleSyncToPersonalBills() {
    const trip = this.data.trip;
    if (!trip) return;

    // 预先计算待同步项目与个人平摊金额
    const syncInfo = getPendingPersonalSyncInfo(trip, this.data.myMemberName);
    if (syncInfo.count === 0) {
      wx.showModal({
        title: '暂无待同步记录',
        content: '属于您的花销记录已全部同步至个人账本，无需重复同步。',
        showCancel: false,
        confirmText: '我知道了',
        confirmColor: '#10B981'
      });
      return;
    }

    wx.showModal({
      title: '同步至个人账单',
      content: `即将同步【${trip.title}】中与您相关的 ${syncInfo.count} 笔消费（按您实际平摊金额，共计 ¥${syncInfo.totalAmount}）至您的个人记账本。\n\n确认同步记账吗？`,
      confirmText: '确认同步',
      confirmColor: '#10B981',
      cancelText: '取消',
      success: async (mRes) => {
        if (mRes.confirm) {
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
        }
      }
    });
  },

  // 结束行程（仅队长可操作，带智能未平账警示）
  handleFinishTrip() {
    if (!this.data.isCreator) {
      wx.showToast({ title: '仅队长可结束行程', icon: 'none' });
      return;
    }

    const info = getTripSettlementInfo(this.data.trip);
    if (!info.isAllSettled) {
      wx.showModal({
        title: '尚有未结清转账',
        content: `当前小队尚有 ${info.pendingCount} 笔转账待结清（待结金额 ¥${info.pendingAmount}）。\n\n结束行程后仍可在“历史行程”中查账结清。确定现在结束行程吗？`,
        confirmText: '仍要结束',
        confirmColor: '#EF4444',
        cancelText: '去结清',
        success: (res) => {
          if (res.confirm) {
            this.executeFinishTrip();
          } else {
            this.setData({ currentTab: 'expense' });
          }
        }
      });
    } else {
      wx.showModal({
        title: '结束行程确认',
        content: '所有账单已全部平账结清 🎉\n确定结束行程并归档到历史行程吗？',
        confirmText: '结束行程',
        confirmColor: '#10B981',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.executeFinishTrip();
          }
        }
      });
    }
  },

  // 执行结束行程写入
  async executeFinishTrip() {
    wx.showLoading({ title: '正在结束行程...' });
    const res = await finishTrip(this.data.tripId);
    wx.hideLoading();
    if (res.success) {
      wx.showToast({ title: '行程已结束并归档', icon: 'success' });
      await this.loadTripData();
    } else {
      wx.showToast({ title: res.msg || '操作失败', icon: 'none' });
    }
  },

  // 重新开启已结束的行程（仅队长可操作）
  handleReopenTrip() {
    if (!this.data.isCreator) {
      wx.showToast({ title: '仅队长可重新开启行程', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '重新开启行程',
      content: '确定重新开启此行程吗？开启后该行程将恢复到进行中小队列表中。',
      confirmText: '重新开启',
      confirmColor: '#10B981',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在重新开启...' });
          const res = await reopenTrip(this.data.tripId);
          wx.hideLoading();
          if (res.success) {
            wx.showToast({ title: '行程已重新开启', icon: 'success' });
            await this.loadTripData();
          } else {
            wx.showToast({ title: res.msg || '操作失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 执行退出逻辑
  async doLeaveTrip() {
    const { leaveTrip } = require('../../utils/tripData.js');
    wx.showLoading({ title: '正在退出小队...' });
    await leaveTrip(this.data.tripId, this.data.myMemberName);
    wx.hideLoading();
    wx.showToast({ title: '已退出小队', icon: 'success' });
    setTimeout(() => {
      wx.navigateBack({ delta: 1 });
    }, 600);
  }
});

