const { fetchTripByIdFromCloud, updateTrip } = require('../../utils/tripData.js');
const { iconCategories } = require('../../utils/iconData.js');

Page({
  data: {
    tripId: '',
    trip: null,
    title: '',
    amount: '',
    amountExpr: '',
    evalPreview: '',
    isOperating: false,
    showKeypad: true, // 默认进入页面呼起自定义数字键盘
    payer: '我',
    participants: [],
    dateOnly: '',
    timeOnly: '',
    date: '',
    remarks: '',
    perPersonAmount: '0.00',

    // 常用高频快捷消费分类
    popularCategories: [
      { id: 'yongcan', name: '用餐', icon: 'yongcan' },
      { id: 'yinpin', name: '饮品', icon: 'yinpin' },
      { id: 'chuzuche', name: '出租车', icon: 'chuzuche' },
      { id: 'jiayou', name: '加油', icon: 'jiayou' },
      { id: 'lvyou', name: '旅游', icon: 'lvyou' },
      { id: 'lingshi', name: '零食', icon: 'lingshi' },
      { id: 'xiaoye', name: '宵夜', icon: 'xiaoye' },
      { id: 'gouwu', name: '购物', icon: 'gouwu' },
      { id: 'jiu', name: '酒水', icon: 'jiu' },
      { id: 'shuiguo', name: '水果', icon: 'shuiguo' },
      { id: 'tingchefei', name: '停车费', icon: 'tingchefei' },
      { id: 'chalv', name: '车马费', icon: 'chalv' },
    ],
    // 全量个人支出分类
    allCategories: (iconCategories && iconCategories.expense) ? iconCategories.expense : [],
    selectedCategoryId: '',
    selectedCategoryIcon: '',
    showCategoryModal: false
  },

  async onLoad(options) {
    const tripId = options.tripId || options.id;
    if (!tripId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1000);
      return;
    }

    wx.showLoading({ title: '加载中...' });
    const trip = await fetchTripByIdFromCloud(tripId);
    wx.hideLoading();
    if (!trip) {
      wx.showToast({ title: '活动不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1000);
      return;
    }

    const today = new Date();
    const y = today.getFullYear();
    const m = (today.getMonth() + 1).toString().padStart(2, '0');
    const d = today.getDate().toString().padStart(2, '0');
    const hh = today.getHours().toString().padStart(2, '0');
    const mm = today.getMinutes().toString().padStart(2, '0');

    const dateOnly = `${y}-${m}-${d}`;
    const timeOnly = `${hh}:${mm}`;
    const date = `${dateOnly} ${timeOnly}`;

    // 默认全员参与平摊
    const defaultParticipants = [...trip.members];

    // 检查本地是否有身份缓存
    let defaultPayer = trip.members[0] || '我';
    try {
      const myRoles = wx.getStorageSync('MY_TRIP_ROLES') || {};
      if (myRoles[tripId] && myRoles[tripId].name && trip.members.includes(myRoles[tripId].name)) {
        defaultPayer = myRoles[tripId].name;
      }
    } catch (e) {
      console.error(e);
    }

    this.setData({
      tripId,
      trip,
      dateOnly,
      timeOnly,
      date,
      payer: defaultPayer,
      participants: defaultParticipants,
      showKeypad: true
    });
  },

  // 展开自定义键盘
  openKeypad() {
    this.setData({ showKeypad: true });
  },

  // 收起自定义键盘
  closeKeypad() {
    // 如果处于计算中，先结算结果
    if (this.data.isOperating) {
      const res = this.evaluateExpr(this.data.amountExpr);
      this.setData({
        amountExpr: res,
        amount: res,
        evalPreview: '',
        isOperating: false,
        showKeypad: false
      }, () => {
        this.recalcPerPerson();
      });
      return;
    }
    this.setData({ showKeypad: false });
  },

  // 获取表达式中的最后一个数字段
  getLastSegment(expr) {
    const parts = expr.split(/[+\-]/);
    return parts[parts.length - 1] || '';
  },

  // 判断是否已包含运算符
  hasOperator(expr) {
    return expr.includes('+') || (expr.includes('-') && expr.indexOf('-') > 0);
  },

  // 计算表达式求值
  evaluateExpr(expr) {
    if (!expr) return '0';
    let cleanExpr = expr.trim();
    if (cleanExpr.endsWith('+') || cleanExpr.endsWith('-')) {
      cleanExpr = cleanExpr.slice(0, -1);
    }
    const match = cleanExpr.match(/^(\d+(?:\.\d+)?)\s*([+\-])\s*(\d+(?:\.\d+)?)$/);
    if (match) {
      const num1 = parseFloat(match[1]) || 0;
      const op = match[2];
      const num2 = parseFloat(match[3]) || 0;
      let res = op === '+' ? num1 + num2 : num1 - num2;
      if (res < 0) res = 0;
      return String(Math.round(res * 100) / 100);
    }
    return cleanExpr;
  },

  // 自定义数字与计算键盘按键处理
  handleKeypad(e) {
    const key = e.currentTarget.dataset.key;
    let expr = this.data.amountExpr;

    if (key >= '0' && key <= '9') {
      const lastSegment = this.getLastSegment(expr);
      if (lastSegment === '0' && key === '0') {
        return;
      }
      if (lastSegment === '0') {
        expr = expr.slice(0, -1) + key;
      } else {
        if (lastSegment.includes('.')) {
          const decimals = lastSegment.split('.')[1];
          if (decimals && decimals.length >= 2) {
            return;
          }
        }
        if (expr.length < 15) {
          expr += key;
        }
      }
    } else if (key === '.') {
      const lastSegment = this.getLastSegment(expr);
      if (lastSegment.includes('.')) {
        return;
      }
      if (lastSegment === '' || lastSegment === '+' || lastSegment === '-') {
        expr += '0.';
      } else {
        expr += '.';
      }
    } else if (key === '+' || key === '-') {
      if (!expr) return;
      const lastChar = expr.slice(-1);
      if (lastChar === '+' || lastChar === '-') {
        expr = expr.slice(0, -1) + key;
      } else {
        if (this.hasOperator(expr)) {
          const evaluated = this.evaluateExpr(expr);
          expr = evaluated + key;
        } else {
          expr += key;
        }
      }
    } else if (key === 'del') {
      expr = expr.slice(0, -1);
    } else if (key === 'clear') {
      expr = '';
    }

    this.updateExpressionState(expr);
  },

  // 刷新计算式状态与预览
  updateExpressionState(expr) {
    const isOperating = this.hasOperator(expr);
    let evalPreview = '';
    let finalAmount = expr;

    if (isOperating) {
      const evalRes = this.evaluateExpr(expr);
      evalPreview = `= ¥${evalRes}`;
      finalAmount = evalRes;
    }

    this.setData({
      amountExpr: expr,
      amount: finalAmount,
      evalPreview,
      isOperating
    }, () => {
      this.recalcPerPerson();
    });
  },

  // 键盘主动作键（= 或 确定）
  handleKeypadAction() {
    if (this.data.isOperating) {
      const res = this.evaluateExpr(this.data.amountExpr);
      this.setData({
        amountExpr: res,
        amount: res,
        evalPreview: '',
        isOperating: false
      }, () => {
        this.recalcPerPerson();
      });
    } else {
      // 确认金额，收起键盘
      this.closeKeypad();
    }
  },

  // 计算每人平摊金额
  recalcPerPerson() {
    const amt = parseFloat(this.data.amount) || 0;
    const count = this.data.participants.length || 1;
    this.setData({
      perPersonAmount: (amt / count).toFixed(2)
    });
  },

  // 消费项目手写输入聚焦：收起数字键盘，让位给系统输入法
  onTitleFocus() {
    this.setData({ showKeypad: false });
  },

  // 备注输入聚焦：收起数字键盘
  onRemarksFocus() {
    this.setData({ showKeypad: false });
  },

  // 手写修改消费项目
  onTitleInput(e) {
    const val = e.detail.value;
    let selectedCategoryId = this.data.selectedCategoryId;
    let selectedCategoryIcon = this.data.selectedCategoryIcon;
    // 如果手写内容与选中的分类不同，清除特定选中高亮
    const matchedCat = this.data.allCategories.find(c => c.name === val.trim());
    if (matchedCat) {
      selectedCategoryId = matchedCat.id;
      selectedCategoryIcon = matchedCat.icon;
    } else {
      selectedCategoryId = '';
    }
    this.setData({
      title: val,
      selectedCategoryId,
      selectedCategoryIcon
    });
  },

  // 清空消费项目
  clearTitle() {
    this.setData({
      title: '',
      selectedCategoryId: '',
      selectedCategoryIcon: ''
    });
  },

  // 选择常用快捷分类
  selectQuickCategory(e) {
    const { id, name, icon } = e.currentTarget.dataset;
    this.setData({
      title: name,
      selectedCategoryId: id,
      selectedCategoryIcon: icon
    });
  },

  // 打开全部分类抽屉
  openCategoryModal() {
    this.setData({
      showCategoryModal: true,
      showKeypad: false
    });
  },

  // 关闭全部分类抽屉
  closeCategoryModal() {
    this.setData({ showCategoryModal: false });
  },

  // 在抽屉中选择分类
  selectDrawerCategory(e) {
    const { id, name, icon } = e.currentTarget.dataset;
    this.setData({
      title: name,
      selectedCategoryId: id,
      selectedCategoryIcon: icon,
      showCategoryModal: false
    });
  },

  onDateChange(e) {
    const dateOnly = e.detail.value;
    this.setData({
      dateOnly,
      date: `${dateOnly} ${this.data.timeOnly || '00:00'}`
    });
  },

  onTimeChange(e) {
    const timeOnly = e.detail.value;
    this.setData({
      timeOnly,
      date: `${this.data.dateOnly} ${timeOnly}`
    });
  },

  onRemarksInput(e) {
    this.setData({ remarks: e.detail.value });
  },

  // 选择付款人
  selectPayer(e) {
    this.setData({ payer: e.currentTarget.dataset.name });
  },

  // 切换分摊人勾选状态
  toggleParticipant(e) {
    const name = e.currentTarget.dataset.name;
    let parts = [...this.data.participants];
    if (parts.includes(name)) {
      if (parts.length <= 1) {
        wx.showToast({ title: '至少需要一人分摊', icon: 'none' });
        return;
      }
      parts = parts.filter(n => n !== name);
    } else {
      parts.push(name);
    }
    this.setData({ participants: parts }, () => {
      this.recalcPerPerson();
    });
  },

  // 全选分摊人
  selectAllParticipants() {
    this.setData({
      participants: [...this.data.trip.members]
    }, () => {
      this.recalcPerPerson();
    });
  },

  // 提交保存这笔集体 AA（直接 await 写入 Supabase 云端数据库）
  async submitExpense() {
    let { title, amount, amountExpr, isOperating, payer, participants, date, remarks, trip, selectedCategoryId, selectedCategoryIcon } = this.data;

    if (!title.trim()) {
      wx.showToast({ title: '请填写消费项目', icon: 'none' });
      return;
    }

    // 若当前仍有算式未计算完毕，自动求值
    if (isOperating || this.hasOperator(amountExpr)) {
      amount = this.evaluateExpr(amountExpr);
    }

    const amtNum = parseFloat(amount);
    if (!amtNum || amtNum <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      this.setData({ showKeypad: true });
      return;
    }

    if (!participants || participants.length === 0) {
      wx.showToast({ title: '请选择分摊人员', icon: 'none' });
      return;
    }

    const newExpense = {
      id: 'exp_' + Date.now(),
      title: title.trim(),
      amount: amtNum.toFixed(2),
      payer,
      participants,
      date,
      remarks: (remarks || '').trim(),
      category: selectedCategoryId || '',
      icon: selectedCategoryIcon || ''
    };

    const updatedTrip = { ...trip };
    updatedTrip.expenses = updatedTrip.expenses || [];
    updatedTrip.expenses.unshift(newExpense);

    wx.showLoading({ title: '正在保存账单...', mask: true });
    try {
      await updateTrip(updatedTrip);
      wx.hideLoading();
      wx.showToast({ title: '记录成功', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack();
      }, 600);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  }
});
